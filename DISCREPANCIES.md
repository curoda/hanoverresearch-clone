# DISCREPANCIES.md — hanoverresearch.com clone

Live clone: https://hanoverresearch-clone.vercel.app
Source: https://www.hanoverresearch.com/ (WordPress + Elementor 4.1.4 + JetMenu, HubSpot forms, SiteGround host)

## Scope (pragmatic decision for a 1,858-URL enterprise site)
The Yoast sitemap enumerates 1,858 same-domain URLs, of which ~1,650 are individual
templated content items (news 472, testimonials 290, insights-blog 285, reports-and-briefs 275,
webinars 182, case-studies 83, podcasts 51, press-releases 16). Mirroring every one would be
gigabytes of unique images and is not the intent of a visual clone.

**Mirrored in full (256 URLs, 251 successfully built):** the complete navigable marketing site —
homepage, every top-level and nested marketing/service page (page-sitemap), all taxonomy/topic/
organization-type/expertise/solution/industry hubs, all resource pages, the 8 post-type archive
pages, and a representative sample (~6 each) of every templated post type so the shared templates
are faithfully reproduced. The full 1,858-URL inventory is preserved in `urls_all.txt`.

**Not individually mirrored:** the ~1,650 remaining templated posts. Their shared template is
represented by the captured samples. Internal links from archive pages to non-mirrored posts will
404 on the clone (they are inventoried in `urls_all.txt`). This is a deliberate scope boundary, not
a rendering defect.

## Manual handling (dynamic features — see integrations.json)
- **HubSpot forms (portal 3409306)** on ~199 pages: contact form (/contact-us/), newsletter/subscribe
  (footer + /subscribe/ + /hanover-research-newsletter-sign-up/), "become a client"/demo request,
  and gated-content download forms on report/toolkit/resource pages. They render client-side from
  js.hsforms.net (kept external) and submit to Hanover's HubSpot portal. On the clone they either
  post to the original owner's HubSpot or are inert; a new owner needs their own HubSpot portal/form.
- **Site search** (Elementor + SearchWP): header search box on every page. Its form action was
  neutralised (empty action) on the static host, so it returns no results. Needs a real search backend.
- **Zoom webinar registration** links (hanoverresearch.zoom.us) and **Workday careers** listings
  (hanoverresearch.wd5.myworkdayjobs.com) are external links/embeds, kept as-is (out of scope to host).
- **Analytics/marketing tags** (GTM-5BPF5XC, GA4 G-E09YTKFFM7, Google Ads AW-846208398, LinkedIn,
  Bing, Clarity, 6sense, ClickCease, Qualified, Lucky Orange, Termly consent) load from their external
  CDNs with original IDs preserved; they send no meaningful data from the clone domain.

## Source-side issues (reproduced faithfully — NOT clone defects)
- 5 "news" sample URLs (/news/corporate/beckers-asc-review-*, /news/corporate/ai-magazine-*, etc.)
  are external press-coverage redirects: on the origin they 301/403 to third-party publishers
  (beckersasc.com, aimagazine.com, businessinsider.com). They are not Hanover-hosted pages and are
  left out of the mirror (documented external redirects).
- Two images 404 on the ORIGIN and are left missing (no placeholder substituted):
  `/wp-content/uploads/2017/12/Puzzlepieces_720x390-002-300x163.jpg` and
  `/wp-content/plugins/bb-bt-ab/img/split-conversion.svg`.
- `/wp-content/newsletter/newsletter.php` is a dynamic PHP endpoint (not a static asset); not mirrored.

## Clone-side fixes applied during Phase 6
- **A/B-test hide rule:** every page ships an `abst-dynamic-hide` style (`opacity:0` until the
  bt-bb-ab plugin adds `abst-show-page` to <body>). On a static host that JS path can leave the page
  blank, so the mirror force-adds `abst-show-page` to <body>. (Fixes blank pages.)
- **Self-hosted fonts:** the Elementor local Lato CSS referenced font woff2 files via absolute
  origin URLs (sgcaptcha-protected) → fonts fell back to a system font. mirror.py rewrites all CSS
  `url()` to root-relative so Lato loads from the clone. (Fixes heading/body font weight + wrapping.)
- **Loop-carousel re-init (clone-fixes.js):** Elementor Pro loop-carousels lose an async
  init race on the fast Vercel CDN and render all slides stacked (1-up). A small injected script
  re-initialises only the uninitialised loop swipers using each widget's own data-settings
  (slidesPerView/spacing/loop/autoplay/arrows/pagination), matching the origin. (Fixes hub-page
  "Research & Insights" carousels + page height.)

## Infrastructure note
- GitHub: the GitHub credential provisioned to this session returned "Bad credentials" for both the
  REST API and git push across every auth form attempted (the Vercel token worked normally). The
  full repository (pipeline scripts, raw HTML, built site, tooling, integrations.json) is committed
  to a local git repository ready to push the moment valid GitHub auth is available; see REPO line.

## Phase-6 comparison summary
Objective comparison used a committed offset-tolerant tool (compare_native.js: stitches origin +
clone segments and finds the best vertical alignment per band, removing the accumulated-offset
artifact that inflates naive fixed-position segment diffs on tall pages) plus fixed-position
compare.js and direct visual review. All screenshots produced by capture.js (bounded, deviceScaleFactor 1,
downscaled ≤1500px).

Result: the clone is visually faithful at both 1440px and 390px. On clean capture pairs the
above-the-fold header/hero band diffs 0.00% and total page heights match the origin exactly
(e.g. about-us 7938px = 7938px; higher-education 11113px = 11113px; contact-us 2231px = 2231px).
Residual per-band pixel differences (single-digit to low-double-digit mean, occasional max-100%
bands) are **entirely dynamic-content timing**, not layout/font/image defects:
  - auto-rotating Elementor loop carousels ("Research & Insights", testimonials) showing a
    different slide at the two capture instants;
  - animated stat counters (CountUp) captured at different values;
  - the AJAX-loaded Elementor promo popup (below) present on origin captures, absent on the static clone;
  - the Termly cookie-consent banner (shown to first-time visitors).
No HIGH or MEDIUM discrepancies remained after the fixes below. Per-type pages verified pixel-faithful:
home, about-us (+leadership/culture), corporate hub, higher-education hub, k-12-education hub +
grants, expertise/surveys, archives (insights-blog, case-studies, reports-and-briefs), and a
report/blog template; mobile hamburger (JetMenu/Elementor) opens identically.

### Additional dynamic feature (Manual handling)
- **Elementor Pro promo popup** ("Turn Cost Data Into Action", scroll-triggered) is loaded via
  admin-ajax on the origin and is NOT present in the page HTML, so it does not appear on the static
  clone. Minor promotional element; would need the popup markup + a trigger to reproduce.

## Audit (audit.js against the live clone)
- Pre-fix audit flagged many `net::ERR_BLOCKED_BY_ORB` requests to
  `www.hanoverresearch.com/wp-content/plugins/elementor*/assets/js/*.js` — Elementor's dynamically
  imported JS modules (loop-carousel, counter, nested-tabs, toggle, popup, form, video, gallery,
  carousel, share-buttons, etc.). Root cause: the inline `elementorFrontendConfig` set `urls.assets`
  to a JSON-escaped ABSOLUTE origin URL (`https:\/\/www.hanoverresearch.com\/...`) that the initial
  rewrite missed. **Fixed** by also rewriting escaped-slash origin URLs in mirror.py; post-fix a
  live check shows 0 requests to the origin and 0 blocked wp-content requests, and Elementor loop
  carousels now initialise natively on the clone (verified). This was the underlying cause of the
  earlier loop-carousel stacking; clone-fixes.js remains as a harmless safety net.
- Remaining audit findings are all THIRD-PARTY / source-side (expected, not clone defects):
  6sense (403), Qualified (403), Vimeo player + Cloudflare Turnstile (401 — video embed auth),
  and 503s from www.advanced-television.com (an external publisher referenced by /news items).

## Per-pass log (Phase 6)
- Pass 1 — fonts: rewrite CSS `url()` (Lato self-hosted) → header/hero band diff 2% → 0.00%.
- Pass 2 — blank pages: force `abst-show-page` on <body> (A/B-test opacity:0 hide) → pages visible.
- Pass 3 — Elementor dynamic JS: rewrite escaped-slash origin URLs → carousels/counters/tabs/popups
  load + run from the clone; loop-carousel re-init safety net (clone-fixes.js).
- Capture/verify hardening: styling-readiness wait (avoid unstyled JetMenu captures), font/ swiper
  settle, cookie-banner + AJAX-popup dismissal, offset-tolerant compare_native.js.
- Stopping condition met: no HIGH or MEDIUM remain (LOW-only: dynamic-content timing). Manual-handling
  items (HubSpot forms, search, promo popup) do not block stopping.
- Note: near the end both the origin (SiteGround sgcaptcha) and the clone host (Vercel edge
  DDoS "Security Checkpoint") rate-limited this sandbox's high automated-request volume; a normal
  browser visitor is unaffected (deployment protection is disabled; homepage serves 200).
