# Broken internal-link sweep & fix

**Scope:** the reported "Back to All Testimonials" bug, plus a full site-wide sweep of every
internal `<a href>` in navigation and page content (1,444 mirrored HTML pages, 305,695 internal
links checked).

## Method
1. `linksweep.py` — parses every genuine `<a>` `href` (excludes Vue/JetMenu `:href` bindings and
   `<script>`/x-template blocks), resolves each internal path against the files on disk using the
   deploy's Vercel semantics (`cleanUrls` + `trailingSlash`), and lists every path that matches no
   real file.
2. `probe_all.js` / `probe_chains.js` — for every distinct unresolved path, probe the **origin**
   (`www.hanoverresearch.com`, through the SiteGround JS-challenge) to learn its true status
   (200 / 301→where / 404) and follow full redirect chains.
3. `classify.py` + `merge_plan.py` — split the findings into *wrong links* (fixable) vs *correct
   links to pages this mirror never cloned* vs *broken on the origin itself*.
4. `fix_links.py` — rewrite only the genuinely-wrong `href`s to their canonical in-clone target.
5. `gen_redirects.py` — additionally emit Vercel 301 rules matching the origin's own redirects, so
   old/external/bookmarked URLs still land correctly.

## Root cause of the reported bug
The individual-testimonial template links "Back to All Testimonials" to
`/about-us/client-testimonials/`. On the **origin** that path is not a real page — it **301-redirects
to `/testimonial/`** (title "Client Testimonials Archives"). The origin's redirect masks the bug for
live users; a static mirror has no such redirect, so the link 404s. The correct, canonical index is
`/testimonial/`, which is mirrored. The bad link is template-level and appeared on **all 289
individual testimonial pages**, plus 2 Careers pages ("Hear From Our Clients" button and a
"testimonials" text link) — **291 pages total**, now all pointing to `/testimonial/`.

## What was changed
**Rewrote 8,504 `href` occurrences across 1,430 HTML files**, covering **326 distinct wrong target
paths** — every internal link that pointed to a path the origin only serves via a 301 redirect to a
page that exists in this mirror. Each was repointed to that canonical target. No page content, text,
or images were altered; only `href` attribute values.

Highest-impact fixes (occurrences → new target):

| Wrong path | Canonical target | Occurrences |
|---|---|---|
| `/about-us/client-testimonials/` | `/testimonial/` | 291 (the reported bug) |
| `/b2b-manufacturing/` | `/industry/b2b-manufacturing/` | 1,423 |
| `/building-products/` | `/industry/building-products/` | 1,423 |
| `/cpg/` | `/industry/cpg/` | 1,424 |
| `/edtech/` | `/industry/edtech/` | 1,423 |
| `/software/` | `/industry/software/` | 1,423 |
| `/research-insights/reports-briefs/` | `/reports-and-briefs/` | 253 |
| `/about-us/news/` | `/news/` | 70 |
| `/research-insights/case-studies/` | `/case-studies/` | 24 |
| `/market-research-revenue-calculator/` | `/interactive-tools/corporate/research-revenue-calculator/` | 12 |

The remaining ~300 mappings are individual reports/briefs, case studies, insights-blog and webinar
posts whose links omitted the `/corporate/`, `/higher-education/` or `/k-12-education/` category
segment (e.g. `/reports-and-briefs/the-state-of-market-research/` →
`/reports-and-briefs/corporate/the-state-of-market-research/`). Full machine-readable map:
`fix_plan.json` → `fix`.

**Added 318 Vercel 301 redirect rules** (`site/vercel.json` → `redirects`) mirroring the origin's own
redirects for these same old paths, so any direct/bookmarked/external hit to an old URL still lands on
the right page (8 malformed source strings — stray `%20`/`)` in the source HTML — were fixed inline in
the HTML instead of as redirects).

After the fix, re-running `linksweep.py` reports **0 of the 326 fixed paths still broken** and **0 new
broken links introduced**.

## Deliberately NOT changed (with reasons)

These internal links also 404 on the static clone, but they are **not** the reported wrong-link
pattern, so their `href`s were left correct/unchanged:

### 1. Correct links to real pages this mirror never cloned — pre-existing coverage gap
218 distinct paths / 2,423 link instances. The `href` is the correct canonical URL (the origin
serves it **200**); the page simply isn't in this mirror. Rewriting would misrepresent the site.
Biggest ones:

- **`/privacy-policy/`** — footer legal link on **1,436 pages** (real 200 page, not mirrored).
- **`/tags/…`** — 911 link instances across 173 tag-taxonomy pages. `/tags/` is a *separate*
  taxonomy from the mirrored `/topic/` taxonomy (the origin serves both at 200; only 13 of 173 tag
  slugs even have a same-named `/topic/` page). It was never cloned.
- `/resources/…` (39), `/author/…` (22), `/terms-of-use/` (1), a few others.

**Recommendation (separate task):** to close this gap, mirror `/privacy-policy/`, `/terms-of-use/`,
and the `/tags/` taxonomy using the repo's existing `fetch_raw.js` → `download_assets.js` →
`mirror.py` pipeline. Not done here because it adds pages rather than fixing links, and was outside
the reported bug's scope.

### 2. Broken on the origin too (source-side) — reproduced faithfully
- **18 paths / 26 links** return **404 on the origin** (old `/insights/…`, `/webinar/…`,
  `/newsroom/…`, `/2013/…` posts, one `.pdf`). Left missing (no substitution).
- **7 paths / 8 links** the origin itself **redirects to its `/404/` page** (old covid-era
  webinar-recording URLs, `/category/blog/…`). Left as-is.
- 2 paths redirect to a page not in the mirror (`/college-plans-for-reopening/` → an origin typo
  target `/college-plans-for-reopenin/`; one `/resources/…` brief).

Full lists: `fix_plan.json` (`origin404`, `redir_to_404`, `redir_final_unmirrored`, `live200`).

### 3. `<link rel="next"/"prev">` pagination hints — not clickable navigation
40 archive/taxonomy index pages carry a `<head>` `<link rel="next" href="/…/page/2/">` SEO hint
pointing to archive page 2+, which this mirror never cloned (only page 1 of each archive was
mirrored — a pre-existing coverage decision). These are machine-readable pagination hints, not
user-facing `<a>` navigation, and are faithful to the origin's own markup, so they were left as-is.
There are **no clickable "Next page" `<a>` links** on these archives (the origin paginates via
AJAX/"load more"), so user navigation is not broken by this.

## Live verification (post-deploy)
- `/about-us/client-testimonials/` → **308 → `/testimonial/`** (origin used 301; Vercel emits 308 for
  `permanent:true`, equivalent for GET). Same for `/b2b-manufacturing/` → `/industry/b2b-manufacturing/`,
  `/research-insights/reports-briefs/` → `/reports-and-briefs/`, etc. All final targets return 200.
- The "Back to All Testimonials" link now serves `href="/testimonial/"` on live testimonial pages
  across all three categories (verified on the insightsoftware, Clayton State University, Searcy
  School District, and General Tools pages).
- Live crawl of a 19-page diverse sample (258 unique internal targets): every target resolves 2xx or
  redirects to a 2xx, except the documented pre-existing coverage gaps (`/privacy-policy/`,
  `/higher-education/hanover-digital/`, `<link rel=next>` `/…/page/2/`). Zero of the 326 fixed paths
  are broken; zero new breakage introduced.
