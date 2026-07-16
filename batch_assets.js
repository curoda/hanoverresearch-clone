// batch_assets.js — download every NEW same-domain asset referenced by a batch's raw HTML,
// via the warmed browser context (passes sgcaptcha), with a HARD >=1s spacing between every
// origin request. Skips assets already present on disk (shared CSS/JS/fonts from earlier runs),
// so each batch only fetches the per-post images it introduces. Recurses into downloaded CSS url().
//
// Usage: node batch_assets.js <batch_manifest.json> <failures_out.txt>
// ABORTS (exit 3, prints "BLOCKED") on persistent challenge.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const HOME = 'https://www.hanoverresearch.com/';
const ORIGIN = 'https://www.hanoverresearch.com';
const SITE = 'site';
const MIN_GAP_MS = 1000;

let lastReq = 0;
async function rateGate() { const now = Date.now(); const wait = MIN_GAP_MS - (now - lastReq); if (wait > 0) await new Promise(r => setTimeout(r, wait)); lastReq = Date.now(); }

async function safeContent(page) { for (let i = 0; i < 6; i++) { try { return await page.content(); } catch (e) { await page.waitForTimeout(500); } } return ''; }
function isChallenge(h) { return !h || h.includes('sgchallenge') || h.includes('Robot Challenge') || h.includes('sgcaptcha'); }
async function solve(page) { for (let i = 0; i < 45; i++) { await page.waitForTimeout(1000); const c = await safeContent(page); if (!isChallenge(c)) return true; } return false; }

function collapseSlashes(p) { return p.replace(/([^:])\/{2,}/g, '$1/'); }
const ASSET_EXT = /\.(css|js|mjs|png|jpe?g|gif|svg|webp|avif|ico|cur|woff2?|ttf|otf|eot|mp4|webm|ogg|mp3|wav|pdf|json|xml|map|txt|zip|docx?|xlsx?|pptx?)(\?|$)/i;
function isAssetPath(pathname) { const p = pathname.split('?')[0]; if (ASSET_EXT.test(p)) return true; if (/^\/wp-(content|includes)\//.test(p)) return true; return false; }
function toAbs(ref) {
  if (!ref) return null;
  ref = ref.trim().replace(/&amp;/g, '&');
  if (ref.startsWith('data:') || ref.startsWith('#') || ref.startsWith('mailto:') || ref.startsWith('tel:') || ref.startsWith('javascript:')) return null;
  let abs;
  try {
    if (ref.startsWith('//')) abs = 'https:' + ref;
    else if (ref.startsWith('http')) abs = ref;
    else if (ref.startsWith('/')) abs = ORIGIN + ref;
    else return null;
    const u = new URL(abs);
    if (u.hostname !== 'www.hanoverresearch.com' && u.hostname !== 'hanoverresearch.com') return null;
    if (!isAssetPath(u.pathname)) return null;
    return u;
  } catch (e) { return null; }
}
function diskPath(u) { let p = collapseSlashes(u.pathname); if (p.endsWith('/')) p += 'index.html'; return path.join(SITE, decodeURIComponent(p)); }

function extractFromHtml(html) {
  const out = new Set();
  const push = r => { const u = toAbs(r); if (u) out.add(u.href); };
  let m;
  const attrRe = /(?:src|href|data-src|data-lazy-src|data-large_image|poster|content|data-bg|data-background)\s*=\s*["']([^"']+)["']/gi;
  while ((m = attrRe.exec(html))) push(m[1]);
  const srcsetRe = /(?:srcset|data-srcset|imagesrcset)\s*=\s*["']([^"']+)["']/gi;
  while ((m = srcsetRe.exec(html))) m[1].split(',').forEach(s => push(s.trim().split(/\s+/)[0]));
  const urlRe = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
  while ((m = urlRe.exec(html))) push(m[1]);
  return out;
}
function extractFromCss(css, baseUrl) {
  const out = new Set(); let m; const urlRe = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
  while ((m = urlRe.exec(css))) { let ref = m[1].trim(); if (!ref || ref.startsWith('data:') || ref.startsWith('#')) continue; try { const abs = new URL(ref, baseUrl); if (abs.hostname === 'www.hanoverresearch.com') out.add(abs.href); } catch (e) {} }
  const impRe = /@import\s+(?:url\()?\s*['"]([^'"]+)['"]/gi;
  while ((m = impRe.exec(css))) { try { const a = new URL(m[1], baseUrl); if (a.hostname === 'www.hanoverresearch.com') out.add(a.href); } catch (e) {} }
  return out;
}

(async () => {
  const manifestFile = process.argv[2];
  const failuresOut = process.argv[3] || 'batch_asset_failures.txt';
  if (!manifestFile) { console.error('usage: node batch_assets.js <manifest> <failures_out>'); process.exit(1); }
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const slugs = manifest.filter(p => p.ok).map(p => p.slug);

  // gather candidate asset URLs from this batch's raw html
  let candidates = new Set();
  for (const slug of slugs) {
    const f = path.join('raw', slug + '.html');
    if (!fs.existsSync(f)) continue;
    const html = fs.readFileSync(f, 'utf8');
    for (const u of extractFromHtml(html)) candidates.add(u);
  }
  console.log('batch HTML candidate assets:', candidates.size);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA });
  const page = await context.newPage();
  await rateGate(); await page.goto(HOME, { waitUntil: 'domcontentloaded', timeout: 90000 }); await solve(page);
  await rateGate(); await page.goto('https://www.hanoverresearch.com/about-us/', { waitUntil: 'domcontentloaded', timeout: 90000 }); await solve(page);
  await page.waitForTimeout(500);

  const done = new Set(); const failed = []; const newCss = []; let ok = 0, skipped = 0, consecBlock = 0, aborted = false;

  async function download(href) {
    if (done.has(href)) return null;
    done.add(href);
    const u = new URL(href);
    const dp = diskPath(u);
    // skip if already on disk (shared assets from earlier runs)
    if (fs.existsSync(dp) && fs.statSync(dp).isFile() && fs.statSync(dp).size > 0) { skipped++; return { dp, cached: true }; }
    let buf = null, challenged = false;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        await rateGate();
        const r = await context.request.get(href, { timeout: 60000 });
        if (r.status() === 200) { buf = await r.body(); break; }
        if (r.status() === 202) { challenged = true; await rateGate(); await page.goto(HOME, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {}); await solve(page); continue; }
        failed.push(r.status() + ' ' + href); return null;
      } catch (e) { await page.waitForTimeout(400); }
    }
    if (!buf) { failed.push('ERR ' + href); if (challenged) { consecBlock++; } return null; }
    // challenge body sometimes returns 200 with challenge HTML for .html-ish; guard css/js only
    consecBlock = 0;
    try {
      if (fs.existsSync(dp) && fs.statSync(dp).isDirectory()) { failed.push('ISDIR ' + href); return null; }
      fs.mkdirSync(path.dirname(dp), { recursive: true });
      fs.writeFileSync(dp, buf);
    } catch (e) { failed.push('WRITEERR ' + href + ' ' + e.code); return null; }
    ok++;
    if (ok % 50 === 0) console.log('  downloaded', ok, '(skipped', skipped + ') ...');
    return { dp, buf };
  }

  // first pass: download batch assets sequentially (1s spacing), queue CSS for recursion
  const cssQueue = [];
  const arr = [...candidates];
  for (const href of arr) {
    const res = await download(href);
    if (consecBlock >= 3) { aborted = true; break; }
    if (res && !res.cached && res.buf && /\.css(\?|$)/i.test(href)) { cssQueue.push({ href, css: res.buf.toString('utf8') }); newCss.push(res.dp); }
  }

  // recurse CSS url() (only new css) — up to 4 rounds
  let round = 0, pending = cssQueue.slice();
  while (!aborted && pending.length && round < 4) {
    round++;
    const next = [];
    const refs = new Set();
    for (const { href, css } of pending) for (const r of extractFromCss(css, href)) refs.add(r);
    const list = [...refs].filter(r => !done.has(r));
    console.log('CSS round', round, 'new refs', list.length);
    for (const href of list) {
      const res = await download(href);
      if (consecBlock >= 3) { aborted = true; break; }
      if (res && !res.cached && res.buf && /\.css(\?|$)/i.test(href)) { next.push({ href, css: res.buf.toString('utf8') }); newCss.push(res.dp); }
    }
    pending = next;
  }

  fs.writeFileSync(failuresOut, failed.join('\n'));
  fs.writeFileSync(failuresOut.replace(/\.txt$/, '') + '.newcss.txt', newCss.join('\n'));
  if (aborted) {
    console.log(`BLOCKED: origin challenged on ${consecBlock} consecutive asset requests. Aborting batch.`);
    await browser.close();
    process.exit(3);
  }
  console.log(`DONE batch assets. downloaded=${ok} skipped=${skipped} failed=${failed.length} newCss=${newCss.length}`);
  await browser.close();
})();
