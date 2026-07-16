// batch_fetch.js — fetch RAW server HTML for a batch of URLs via a warmed Playwright
// context (passes SiteGround sgcaptcha), with a HARD >=1s spacing between every request
// to the origin so the automated volume looks human and does not trip the rate limiter.
//
// Usage: node batch_fetch.js <batchfile.txt> <batch_manifest_out.json>
//
// Writes raw/<slug>.html for every URL that returns real 200 HTML (never a challenge page),
// and a per-batch manifest JSON [{url,slug,sitepath,status,ok,len,note}].
// ABORTS with exit code 3 (prints "BLOCKED") if the origin persistently challenges us, so a
// block costs one batch, not the whole job, and no captcha page is ever cloned as content.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const HOME = 'https://www.hanoverresearch.com/';
const MIN_GAP_MS = 1000; // >=1s between origin requests

let lastReq = 0;
async function rateGate() {
  const now = Date.now();
  const wait = MIN_GAP_MS - (now - lastReq);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastReq = Date.now();
}

async function safeContent(page) { for (let i = 0; i < 6; i++) { try { return await page.content(); } catch (e) { await page.waitForTimeout(500); } } return ''; }
function isChallenge(h) { return !h || h.includes('sgchallenge') || h.includes('Robot Challenge') || h.includes('sgcaptcha'); }
// A genuine Hanover WordPress page always carries the site GTM id + wp-content/Elementor markers.
// Some /news/ items are external-publisher REDIRECTS (e.g. globenewswire.com); context.request.get
// silently follows the redirect and returns the third-party page. Detect & refuse to save those
// (same-domain-only rule): treat as an external redirect, not clonable content.
function isHanover(h) { return h.includes('GTM-5BPF5XC') || h.includes('/wp-content/plugins/elementor') || h.includes('/wp-content/themes/') || h.includes('hanoverresearch.com/wp-content'); }
async function solve(page) { for (let i = 0; i < 45; i++) { await page.waitForTimeout(1000); const c = await safeContent(page); if (!isChallenge(c)) return true; } return false; }

function urlToSlug(u) { const p = new URL(u).pathname.replace(/\/+$/, ''); if (p === '') return 'home'; return p.replace(/^\//, '').replace(/\//g, '__'); }
function urlToSitePath(u) { const p = new URL(u).pathname.replace(/\/+$/, ''); if (p === '') return 'index.html'; return p.replace(/^\//, '') + '/index.html'; }

(async () => {
  const batchFile = process.argv[2];
  const manifestOut = process.argv[3] || 'batch_manifest.json';
  if (!batchFile) { console.error('usage: node batch_fetch.js <batchfile> <manifest_out>'); process.exit(1); }
  const urls = fs.readFileSync(batchFile, 'utf8').split('\n').map(s => s.trim()).filter(Boolean);
  fs.mkdirSync('raw', { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA });
  const page = await context.newPage();

  // warmup: 2 navigations so the _I_ cookie is active for context.request
  await rateGate(); await page.goto(HOME, { waitUntil: 'domcontentloaded', timeout: 90000 }); await solve(page);
  await rateGate(); await page.goto('https://www.hanoverresearch.com/about-us/', { waitUntil: 'domcontentloaded', timeout: 90000 }); await solve(page);
  await page.waitForTimeout(500);

  const manifest = [];
  let ok = 0, fail = 0, consecBlock = 0;
  for (let i = 0; i < urls.length; i++) {
    const u = urls[i];
    const slug = urlToSlug(u);
    // skip if already fetched in a prior run
    const rawPath = path.join('raw', slug + '.html');
    if (fs.existsSync(rawPath) && fs.statSync(rawPath).size > 2000) {
      const len = fs.statSync(rawPath).size;
      manifest.push({ url: u, slug, sitepath: urlToSitePath(u), status: 200, ok: true, len, note: 'cached' });
      ok++; continue;
    }
    let raw = '', status = 0, got = false, challenged = false, external = false;
    for (let attempt = 0; attempt < 4 && !got; attempt++) {
      try {
        await rateGate();
        const r = await context.request.get(u, { timeout: 45000, headers: { 'Accept': 'text/html,application/xhtml+xml' } });
        status = r.status(); raw = await r.text();
        if (status === 200 && !isChallenge(raw)) {
          if (!isHanover(raw)) { external = true; break; } // followed an external redirect — refuse
          got = true; break;
        }
        if (isChallenge(raw)) { challenged = true; }
        else { break; } // real non-200 (403 external redirect / 404) — not a challenge, stop retrying
      } catch (e) { raw = 'ERR ' + e.message; }
      // re-warm via a real navigation if challenged
      await rateGate();
      await page.goto(HOME, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {}); await solve(page);
    }
    if (got) {
      fs.writeFileSync(rawPath, raw); ok++; consecBlock = 0;
      manifest.push({ url: u, slug, sitepath: urlToSitePath(u), status, ok: true, len: raw.length, note: '' });
    } else {
      fail++;
      const note = external ? 'EXTERNAL' : (challenged && isChallenge(raw) ? 'CHALLENGE' : ('http' + status));
      manifest.push({ url: u, slug, sitepath: urlToSitePath(u), status, ok: false, len: raw.length, note });
      if (note === 'CHALLENGE') { consecBlock++; console.log(`BLOCK? ${u} (consec=${consecBlock})`); }
      else { consecBlock = 0; console.log(`SKIP ${u} status=${status} note=${note}`); }
      if (consecBlock >= 3) {
        fs.writeFileSync(manifestOut, JSON.stringify(manifest, null, 1));
        console.log(`BLOCKED: origin returned a challenge on ${consecBlock} consecutive requests. Aborting batch to avoid cloning a captcha page.`);
        await browser.close();
        process.exit(3);
      }
    }
    if (i % 25 === 0) console.log(`[${i}/${urls.length}] ok=${ok} fail=${fail} last=${slug}`);
  }
  fs.writeFileSync(manifestOut, JSON.stringify(manifest, null, 1));
  console.log(`DONE batch fetch: ok=${ok} fail=${fail} total=${urls.length} -> ${manifestOut}`);
  await browser.close();
})();
