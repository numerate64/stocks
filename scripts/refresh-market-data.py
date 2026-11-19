#!/usr/bin/env python3
"""Update the AAPL snapshot; optionally commit changed values through GitHub Contents API."""
import argparse, base64, json, subprocess, sys, urllib.parse, urllib.request
from datetime import datetime, timezone
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'market-data.json'
REPO = 'numerate64/stocks'
URL = 'https://api.twelvedata.com/time_series?' + urllib.parse.urlencode({'symbol':'AAPL','interval':'1day','outputsize':'60','apikey':'demo'})
def gh_api(args):
    result=subprocess.run(['gh','api',*args],text=True,capture_output=True)
    if result.returncode: raise RuntimeError(result.stderr.strip() or 'GitHub API request failed')
    return json.loads(result.stdout)
def main(publish):
    request=urllib.request.Request(URL,headers={'User-Agent':'NumerateStocks/1.0'})
    with urllib.request.urlopen(request,timeout=30) as response: payload=json.load(response)
    if payload.get('status')=='error' or payload.get('code') or not payload.get('values'): raise RuntimeError(payload.get('message','No price history returned'))
    values=payload['values']; closes=[float(item['close']) for item in values if item.get('close')]
    if len(closes)<2: raise RuntimeError('Not enough observations to calculate a daily move')
    price,previous=closes[0],closes[1]
    mean=lambda points: sum(points)/len(points) if points else None
    ma20=mean(closes[:20]); ma50=mean(closes[:50]) if len(closes)>=50 else None
    momentum=price/closes[min(20,len(closes)-1)]-1 if len(closes)>20 else None
    enough=ma20 is not None and ma50 is not None and momentum is not None
    signal='buy' if enough and price>ma20 and price>ma50 and momentum>0 else 'avoid' if enough and price<ma20 and price<ma50 and momentum<0 else 'review'
    current=json.loads(DEST.read_text()) if DEST.exists() else {}
    if current.get('quotes',{}).get('AAPL',{}).get('price')==price:
        print('Market value unchanged; no repository update needed.'); return
    now=datetime.now(timezone.utc)
    quote={'symbol':'AAPL','name':'Apple Inc.','price':price,'change':(price-previous)/previous,'ma20':ma20,'ma50':ma50,'momentum':momentum,'signal':signal,'bars':list(reversed(closes[:14])),'updatedAt':int(now.timestamp()*1000)}
    encoded=json.dumps({'source':'Twelve Data','fetchedAt':now.isoformat(),'quotes':{'AAPL':quote}},indent=2)+'\n'
    DEST.write_text(encoded)
    if publish:
        meta=gh_api([f'repos/{REPO}/contents/market-data.json'])
        gh_api([f'repos/{REPO}/contents/market-data.json','--method','PUT','-f','message=Refresh scheduled AAPL market snapshot','-f','branch=main','-f',f'sha={meta["sha"]}','-f',f'content={base64.b64encode(encoded.encode()).decode()}'])
        print('Market value changed; committed the updated AAPL snapshot.')
    else: print('Market value changed; updated the local AAPL snapshot.')
if __name__=='__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--publish',action='store_true',help='Commit changed snapshot using gh auth')
    try: main(parser.parse_args().publish)
    except Exception as exc: print(f'Market snapshot refresh failed: {exc}',file=sys.stderr); raise
