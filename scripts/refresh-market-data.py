#!/usr/bin/env python3
"""Update the AAPL snapshot from Public market history; optionally publish it."""
import argparse, base64, json, os, subprocess, sys, urllib.request
from datetime import datetime, timezone
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'market-data.json'
REPO = 'numerate64/stocks'
PUBLIC_API = 'https://api.public.com'
PUBLIC_ENV = Path('/home/ansible/.openclaw/workspace/public-api/.env')

def read_env():
    values = dict(os.environ)
    if PUBLIC_ENV.exists():
        for line in PUBLIC_ENV.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line: continue
            key, value = line.split('=', 1)
            values.setdefault(key.strip(), value.strip().strip("\"'"))
    return values

def public_request(path, token=None, payload=None):
    body = json.dumps(payload).encode() if payload is not None else None
    headers = {'User-Agent':'NumerateStocks/1.0', 'Content-Type':'application/json'}
    if token: headers['Authorization'] = f'Bearer {token}'
    request = urllib.request.Request(PUBLIC_API + path, data=body, headers=headers)
    with urllib.request.urlopen(request, timeout=30) as response: return json.load(response)

def create_token():
    env = read_env()
    direct = env.get('PUBLIC_COM_ACCESS_TOKEN', '').strip()
    if direct: return direct
    secret = env.get('PUBLIC_COM_SECRET', '').strip()
    if not secret: raise RuntimeError('Missing Public API credentials in public-api/.env')
    validity = int(env.get('PUBLIC_COM_TOKEN_VALIDITY_MINUTES', '15'))
    return public_request('/userapiauthservice/personal/access-tokens', payload={'secret':secret, 'validityInMinutes':validity})['accessToken']

def gh_api(args):
    result=subprocess.run(['gh','api',*args],text=True,capture_output=True)
    if result.returncode: raise RuntimeError(result.stderr.strip() or 'GitHub API request failed')
    return json.loads(result.stdout)
def main(publish):
    payload=public_request('/userapigateway/historicdata/EQUITY/AAPL/YEAR', create_token())
    bars=payload.get('regularMarket',{}).get('bars') or payload.get('regularSessionClosingData',{}).get('bars') or payload.get('bars') or []
    bars=sorted((item for item in bars if item.get('close') is not None), key=lambda item:str(item.get('timestamp',item.get('date',''))), reverse=True)
    if not bars: raise RuntimeError('Public returned no AAPL price history')
    closes=[float(item['close']) for item in bars]
    if len(closes)<2: raise RuntimeError('Not enough observations to calculate a daily move')
    price,previous=closes[0],closes[1]
    mean=lambda points: sum(points)/len(points) if points else None
    ma20=mean(closes[:20]); ma50=mean(closes[:50]) if len(closes)>=50 else None
    momentum=price/closes[min(20,len(closes)-1)]-1 if len(closes)>20 else None
    enough=ma20 is not None and ma50 is not None and momentum is not None
    signal='buy' if enough and price>ma20 and price>ma50 and momentum>0 else 'avoid' if enough and price<ma20 and price<ma50 and momentum<0 else 'review'
    remote_meta=None
    if publish:
        remote_meta=gh_api([f'repos/{REPO}/contents/market-data.json'])
        existing=json.loads(base64.b64decode(remote_meta['content']).decode())
    else:
        existing=json.loads(DEST.read_text()) if DEST.exists() else {}
    if existing.get('source')=='Public.com market data' and existing.get('quotes',{}).get('AAPL',{}).get('price')==price:
        print('Market value unchanged; no repository update needed.'); return
    now=datetime.now(timezone.utc)
    quote={'symbol':'AAPL','name':'Apple Inc.','price':price,'change':(price-previous)/previous,'ma20':ma20,'ma50':ma50,'momentum':momentum,'signal':signal,'bars':list(reversed(closes[:14])),'updatedAt':int(now.timestamp()*1000)}
    encoded=json.dumps({'source':'Public.com market data','fetchedAt':now.isoformat(),'quotes':{'AAPL':quote}},indent=2)+'\n'
    if publish:
        gh_api([f'repos/{REPO}/contents/market-data.json','--method','PUT','-f','message=Refresh scheduled AAPL market snapshot','-f','branch=main','-f',f'sha={remote_meta["sha"]}','-f',f'content={base64.b64encode(encoded.encode()).decode()}'])
        print('Market value changed; committed the updated AAPL snapshot.')
    else: print('Market value changed; updated the local AAPL snapshot from Public.')
    DEST.write_text(encoded)
if __name__=='__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--publish',action='store_true',help='Commit changed snapshot using gh auth')
    try: main(parser.parse_args().publish)
    except Exception as exc: print(f'Market snapshot refresh failed: {exc}',file=sys.stderr); raise
