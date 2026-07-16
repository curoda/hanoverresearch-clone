# hanoverresearch.com — static mirror clone

Static, deployable mirror of https://www.hanoverresearch.com/ (WordPress + Elementor + JetMenu).
Live: https://hanoverresearch-clone.vercel.app

## Pipeline
- `capture.js`   — canonical capture engine (screenshots bounded/downscaled ≤1500px, deviceScaleFactor 1,
  page.html, styles.json, assets.txt, fonts.txt, embeds.txt, meta.txt, links.txt). Every screenshot is
  produced by this script. Supports `--live`/`--nowarm` for clone recapture.
- `fetch_raw.js` / `batch_fetch.js` — fetch RAW server HTML via a warmed Playwright context (passes
  SiteGround sgcaptcha). `batch_fetch.js` runs one ~230-URL batch with a **hard ≥1s gap between every
  origin request**, does NOT follow off-domain redirects (inspects `Location`), refuses non-Hanover
  bodies (keyed on the site GTM id), and aborts a batch on a persistent challenge (block guard).
- `download_assets.js` / `batch_assets.js` — download every same-domain asset (CSS/JS/img/font/pdf)
  into `site/<original-path>`, recursing into CSS `url()`, skipping files already on disk, ≥1s spacing.
- `download_list.js` — fetch an explicit URL list (used for Elementor's runtime-`import()`-ed JS module
  bundles that never appear in the HTML).
- `mirror.py` / `build_batch.py` — rewrite asset+internal-link URLs to root-relative (incl. escaped-slash
  Elementor JS base), keep canonical/OG/JSON-LD absolute, force `abst-show-page`, inject clone-fixes.js.
  `build_batch.py` builds only a batch's new pages (never clobbers existing edits) and merges pages.json.
- `run_batch.sh` — orchestrates one batch: fetch → assets → build → commit → push; stops on a block.
- `asset_integrity.py` — static check that every same-domain asset referenced by every built page exists
  on disk (cross-referenced against known source-side 404s). 0 clone defects.
- `compare.js` / `compare_native.js` — pixel comparison origin vs clone.
- `audit.js`     — load a spread sample of live-clone pages, log ≥400/requestfailed, classify clone vs
  third-party by host, report Vercel-checkpoint hits separately. Env: AUDIT_BASE / AUDIT_DELAY_MS / AUDIT_SAMPLE.

## Scope
Full mirror: **1,444 genuine Hanover pages** — the entire marketing/service/taxonomy site plus every
individual templated post (testimonials, insights-blog, reports-and-briefs, webinars, case-studies,
podcasts, press-releases, and Hanover-authored news). The 415 URLs not mirrored are external
press-coverage (redirects/proxied third-party articles) or source-side 404/403 — see DISCREPANCIES.md.
`urls_all.txt` = full 1,859-URL sitemap; `urls.txt` = the 1,444 mirrored; `pages.json` = per-URL status.

## Deploy
`site/` is the static deploy root (Vercel; project Root Directory = `site`). `site/vercel.json`:
cleanUrls + trailingSlash. `.vercelignore` keeps raw/, node_modules/, batches/ out of the upload.
