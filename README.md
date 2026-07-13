# hanoverresearch.com — static mirror clone

Static, deployable mirror of https://www.hanoverresearch.com/ (WordPress + Elementor + JetMenu).

## Pipeline
- `capture.js`   — canonical capture engine (screenshots bounded/downscaled, page.html, styles.json, assets.txt, fonts.txt, embeds.txt, meta.txt, links.txt). Every screenshot in the project is produced by this script.
- `fetch_raw.js` — fetch RAW server HTML for every scope URL via a warmed Playwright context (passes SiteGround sgcaptcha). Raw HTML avoids double-initialising Elementor widgets.
- `download_assets.js` — download every same-domain asset (CSS/JS/img/font) into `site/<original-path>`, recursing into CSS `url()`.
- `mirror.py`    — rewrite asset + internal-link URLs to root-relative, keep canonical/OG absolute, force `abst-show-page` (A/B-test hide fix), collapse `//`.
- `compare.js` / `compare_native.js` — Phase-6 pixel comparison origin vs clone.
- `audit.js`     — log >=400 responses and requestfailed on the live clone.

## Scope
See `urls.txt` (mirrored pages) and `urls_all.txt` (full 1858-URL sitemap inventory). Individual
templated posts beyond the captured samples are inventoried but not mirrored — see DISCREPANCIES.md.

## Deploy
`site/` is a static deploy (Vercel). `vercel.json`: cleanUrls + trailingSlash.
