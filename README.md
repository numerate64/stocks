# Numerate Markets

A browser-first personal watchlist with a transparent, trend-only research signal.

## Watchlists and privacy

Symbols are stored in `localStorage` in each visitor's browser (`numerate64-stocks-watchlist-v1`). One person's changes are not visible to other visitors and are not written to this repository. A browser/device change starts a separate list. This is the right default for a personal, static Pages site; a shared list would need an authenticated backend and clear user/account boundaries.

The bundled AAPL starter quote is refreshed from Public's authenticated market-history API. The Public API secret stays on the Gateway host and is never included in the site or repository. Only market-price history is published; Public account, cash, and holdings information are not.

Added symbols are fetched from Twelve Data in the visitor's browser. Add a personal API key under **Data Source** to quote those symbols. It is saved only in that browser's local storage, not sent to this site or the GitHub repository; quote requests go directly to Twelve Data. Provider limits, key access, delayed quotes, and availability apply. A static Pages site cannot securely use the Gateway's Public credentials to fetch arbitrary per-visitor symbols.

## Refresh schedule

An owner-managed host cron runs every 20 minutes, fetches AAPL daily history from Public, and writes `market-data.json` to the repository only when market values change. In an open browser, quotes for added symbols refresh every 20 minutes; a closed browser cannot refresh private local data. The page reads the scheduled AAPL snapshot when opened and shows its source update time. The scheduled shared snapshot is AAPL only because each visitor's personal ticker list remains private in their browser.

## Research signal

The signal is a simple price-trend screen: **Buy candidate** means the latest close is above the 20- and 50-session averages and 20-session momentum is positive; **Avoid for now** means all three point down; other combinations are **Wait / review**. At least 50 daily observations are needed. It does not evaluate company quality, valuation, risk tolerance, taxes, or a person's situation and is not investment advice.

Quotes are daily bars (may be delayed), not guaranteed real-time prices. Verify a quote and do independent research before acting.

## Publish

GitHub Pages is deployed by `.github/workflows/pages.yml` from the `main` branch. No build step is required.
