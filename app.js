const WATCH_KEY = 'numerate64-stocks-watchlist-v1';
const API_KEY = 'numerate64-stocks-api-key-v1';
const DATA_URL = './market-data.json?v=2';
const REFRESH_MS = 20 * 60 * 1000;
const WATCH_LIMIT = 20;
let snapshot = null;
let busy = false;
const $ = id => document.getElementById(id);
const safeRead = (key, fallback) => { try { const value = JSON.parse(localStorage.getItem(key)); return value ?? fallback; } catch { return fallback; } };
const cleanTicker = value => value.trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, '').slice(0, 12);
const watchlist = () => safeRead(WATCH_KEY, ['AAPL']).filter(x => typeof x === 'string').map(cleanTicker).filter((x, i, a) => x && a.indexOf(x) === i).slice(0, WATCH_LIMIT);
const key = () => localStorage.getItem(API_KEY) || '';
const money = n => new Intl.NumberFormat('en-US', {style:'currency',currency:'USD',maximumFractionDigits:n < 10 ? 3 : 2}).format(n);
const number = n => new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(n);
function say(message, error = false) { $('notice').textContent = message; $('notice').classList.toggle('error', error); }
function localTime(value) { const date = new Date(value); return Number.isNaN(date.valueOf()) ? 'time unavailable' : date.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}); }
function quoteFromTwelve(data) {
  if (!Array.isArray(data.values) || data.values.length < 2) throw new Error(data.message || 'Not enough price history for a trend signal.');
  const bars = data.values.map(x => ({date:x.datetime, close:Number(x.close), volume:Number(x.volume)})).filter(x => Number.isFinite(x.close));
  if (bars.length < 2) throw new Error('No valid price history returned.');
  return makeQuote(data.meta?.symbol || bars[0].symbol, data.meta?.name || '', bars, Date.now());
}
function makeQuote(symbol, name, bars, updatedAt) {
  const closes = bars.map(b => Number(b.close)).filter(Number.isFinite);
  if (closes.length < 2) return {symbol,name,error:'History unavailable'};
  const price = closes[0], previous = closes[1];
  const avg = slice => slice.length ? slice.reduce((a,b)=>a+b,0)/slice.length : null;
  const ma20 = avg(closes.slice(0,20)), ma50 = closes.length >= 50 ? avg(closes.slice(0,50)) : null;
  const momentum = closes.length > 20 ? price / closes[Math.min(20,closes.length-1)] - 1 : null;
  const canEvaluate = ma20 !== null && ma50 !== null && momentum !== null;
  const signal = canEvaluate && price > ma20 && price > ma50 && momentum > 0 ? 'buy' : canEvaluate && price < ma20 && price < ma50 && momentum < 0 ? 'avoid' : 'review';
  return {symbol,name,price,change:(price-previous)/previous,ma20,ma50,momentum,signal,bars:closes.slice(0,14).reverse(),updatedAt};
}
function sparkline(values) {
  const min = Math.min(...values), max = Math.max(...values), span = max-min || 1;
  const pts = values.map((v,i)=>`${(i*72/Math.max(1,values.length-1)).toFixed(1)},${(21-(v-min)/span*17).toFixed(1)}`).join(' ');
  return `<svg class="spark${values.at(-1)<values[0]?' negative':''}" viewBox="0 0 72 24" aria-hidden="true"><polyline points="${pts}"/></svg>`;
}
function escapeHTML(text) { return String(text).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function row(quote) {
  const symbol = escapeHTML(quote.symbol);
  if (quote.error) return `<tr><td><div class="company"><span class="ticker-badge">${symbol.slice(0,3)}</span><span class="company-name"><strong>${symbol}</strong><span>QUOTE UNAVAILABLE</span></span></div></td><td colspan="4" class="negative-text">${escapeHTML(quote.error)}</td><td><button class="remove" data-remove="${symbol}" aria-label="Remove ${symbol}">×</button></td></tr>`;
  const change = quote.change || 0, changeClass = change >= 0 ? 'positive-text' : 'negative-text';
  const labels = {buy:['Buy candidate','positive'], review:['Wait / review','neutral'], avoid:['Avoid for now','negative']};
  const [signal, klass] = labels[quote.signal] || labels.review;
  const trend = quote.momentum === null ? 'Building history' : `${quote.momentum>=0?'+':''}${(quote.momentum*100).toFixed(1)}%`;
  return `<tr><td><div class="company"><span class="ticker-badge">${symbol.slice(0,3)}</span><span class="company-name"><strong>${escapeHTML(quote.name || quote.symbol)}</strong><span>${symbol}${quote.volume ? ` · VOL ${number(quote.volume)}` : ''}</span></span></div></td><td class="price">${money(quote.price)}</td><td class="change ${changeClass}">${change>=0?'+':''}${(change*100).toFixed(2)}%</td><td><div class="trend">${sparkline(quote.bars)}<span class="${changeClass}">${trend}</span></div></td><td><span class="signal-pill ${klass}">${signal}</span></td><td><button class="remove" data-remove="${symbol}" aria-label="Remove ${symbol}">×</button></td></tr>`;
}
function render(quotes) {
  $('watchlist').innerHTML = quotes.map(row).join('');
  const buys = quotes.filter(q=>q.signal==='buy').length;
  $('metric-count').textContent = quotes.length;
  $('metric-up').textContent = buys;
  $('metric-review').textContent = quotes.filter(q=>q.signal!=='buy').length;
  $('metric-fresh').textContent = quotes.some(q=>!q.error) ? localTime(Math.max(...quotes.filter(q=>!q.error).map(q=>q.updatedAt||0))) : 'Waiting';
  $('empty').hidden = quotes.length > 0;
  $('watchlist').querySelectorAll('[data-remove]').forEach(button=>button.addEventListener('click',()=>{
    const symbol = button.dataset.remove;
    localStorage.setItem(WATCH_KEY, JSON.stringify(watchlist().filter(x=>x!==symbol)));
    say(`${symbol} removed from this browser.`); update();
  }));
}
async function loadSnapshot() {
  try { const response = await fetch(DATA_URL,{cache:'no-store'}); if (!response.ok) throw new Error(''); snapshot = await response.json(); }
  catch { snapshot = null; }
}
async function fetchSymbol(symbol) {
  if (symbol === 'AAPL' && snapshot?.quotes?.AAPL) return snapshot.quotes.AAPL;
  const apiKey = key();
  if (!apiKey) return {symbol,error:'Add a Twelve Data key below for this symbol. Public snapshot covers AAPL.'};
  const params = new URLSearchParams({symbol,interval:'1day',outputsize:'60',apikey:apiKey});
  const response = await fetch(`https://api.twelvedata.com/time_series?${params}`);
  if (!response.ok) throw new Error(`Quote request failed (${response.status}).`);
  const data = await response.json();
  if (data.status === 'error' || data.code) throw new Error(data.message || 'Quote unavailable. Check the ticker and your provider limits.');
  return quoteFromTwelve(data);
}
async function update(silent = false) {
  if (busy) return;
  busy = true; $('refresh').disabled = true; $('refresh-copy').textContent='Checking prices…';
  await loadSnapshot();
  const list = watchlist();
  localStorage.setItem(WATCH_KEY, JSON.stringify(list));
  const quotes = await Promise.all(list.map(async symbol=>{
    try { return await fetchSymbol(symbol); } catch (e) { return {symbol,error:e.message || 'Quote request failed'}; }
  }));
  render(quotes);
  const snapUpdated = snapshot?.fetchedAt ? Date.parse(snapshot.fetchedAt) : 0;
  $('updated-at').textContent = snapUpdated ? `Updated ${localTime(snapUpdated)}` : 'Price source ready';
  $('market-state').textContent = snapshot?.source === 'Public.com market data' ? 'PUBLIC MARKET DATA' : 'MARKET DATA';
  $('refresh-copy').textContent = 'Refreshes every 20 minutes while this page is open';
  if (!silent && quotes.some(q=>q.error)) say('Some quotes need your API key or could not be loaded.', true);
  busy = false; $('refresh').disabled = false;
}
$('add-form').addEventListener('submit', async event=>{
  event.preventDefault(); const symbol = cleanTicker($('ticker').value);
  if (!symbol) return;
  const list = watchlist();
  if (list.includes(symbol)) { say(`${symbol} is already on your list.`); return; }
  if (list.length >= WATCH_LIMIT) { say(`This browser watchlist is limited to ${WATCH_LIMIT} symbols.`,true); return; }
  list.push(symbol); localStorage.setItem(WATCH_KEY,JSON.stringify(list)); $('ticker').value=''; say(`${symbol} added to this browser.`); await update(true);
});
$('refresh').addEventListener('click',()=>update(false));
$('save-key').addEventListener('click',async()=>{
  const value=$('api-key').value.trim();
  if(value) localStorage.setItem(API_KEY,value); else localStorage.removeItem(API_KEY);
  $('api-key').value=''; say(value?'Key saved in this browser.':'Saved key removed.'); await update(true);
});
$('api-key').value='';
update(true);
setInterval(()=>update(true),REFRESH_MS);
