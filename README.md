# Numerate Markets

A browser-first personal watchlist with a transparent, trend-only research signal.

## Watchlists and privacy

Symbols are stored in `localStorage` in each visitor's browser (`numerate64-stocks-watchlist-v1`). One person's changes are not visible to other visitors and are not written to this repository. A browser/device change starts a separate list. This is the right default for a personal, static Pages site; a shared list would need an authenticated backend and clear user/account boundaries.

Added symbols are fetched from Twelve Data in the visitor's browser. Add a personal API key under **Data Source** for full ticker coverage. It is saved only in that browser's local storage, not sent to this site or the GitHub repository; quote requests go directly to Twelve Data. The bundled AAPL starter quote is refreshed by the scheduled workflow and works without a personal key. Provider limits, key access, delayed quotes, and availability apply.

## Refresh schedule

An owner-managed host cron runs every 20 minutes, fetches AAPL daily history from Twelve Data's demo endpoint, and writes `market-data.json` to the repository only when market values change. In an open browser, quotes for added symbols refresh every 20 minutes; a closed browser cannot refresh private local data. The page reads the scheduled AAPL snapshot when opened and shows its source update time. The scheduled shared snapshot is AAPL only because each visitor's personal ticker list remains private in their browser.

## Research signal

The signal is a simple price-trend screen: **Buy candidate** means the latest close is above the 20- and 50-session averages and 20-session momentum is positive; **Avoid for now** means all three point down; other combinations are **Wait / review**. At least 50 daily observations are needed. It does not evaluate company quality, valuation, risk tolerance, taxes, or a person's situation and is not investment advice.

Quotes are daily bars (may be delayed), not guaranteed real-time prices. Verify a quote and do independent research before acting.

## Publish

GitHub Pages is deployed by `.github/workflows/pages.yml` from the `main` branch. No build step is required.
