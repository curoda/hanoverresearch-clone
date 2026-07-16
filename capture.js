// capture.js — canonical capture engine for hanoverresearch.com clone.
// The ONLY producer of screenshots in this project. Every screenshot (Phase 2/3/4
// and the Phase-6 clone recapture) is created by this script.
//
// Guarantees the image-size cap at the moment of capture:
//   * deviceScaleFactor: 1  -> saved pixels == CSS viewport (no silent 2x).
//   * ignoreHTTPSErrors: true -> tolerate the Anthropic egress TLS-inspection CA.
//   * Fixed viewport (1440x900 desktop, 390x844 mobile); NEVER a single tall shot.
//   * Segmented scroll capture, stepping by viewport HEIGHT; each saved segment is
//     one viewport (<=900px tall) i.e. <=1500px.
//   * After saving, downscale longest side to <=1500px (mogrify -resize 1500x1500>).
//   * Prints final pixel dimensions of every saved file.
//
// SiteGround sgcaptcha handling: the FIRST navigation in a context solves a PoW
// challenge and sets an httpOnly _I_ cookie; from the 2nd navigation on, sub-resources
// load 200. We warm up once on '/', then capture every page (re-solving if challenged).
//
// Usage:
//   node capture.js --jobs jobs.json --outbase captures [--spec]
//     jobs.json = [{"url":"https://...","slug":"home"}, ...]
//     --spec  also writes page.html, styles.json, assets.txt, fonts.txt, embeds.txt,
//             meta.txt, links.txt (full Phase-2 spec). Without it, screenshots + page.html only.
//   node capture.js --url <URL> --slug <SLUG> --outbase captures [--spec]
//   node capture.js --live <URL> --slug <SLUG> --outbase clone_shots   (clone recapture: screenshots only)

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const HOME = 'https://www.hanoverresearch.com/';
const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };
const MAXPX = 1500;

function args() {
  const a = process.argv.slice(2); const o = { outbase: 'captures', spec: false };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--jobs') o.jobs = a[++i];
    else if (a[i] === '--url') o.url = a[++i];
    else if (a[i] === '--slug') o.slug = a[++i];
    else if (a[i] === '--live') o.live = a[++i];
    else if (a[i] === '--outbase') o.outbase = a[++i];
    else if (a[i] === '--spec') o.spec = true;
    else if (a[i] === '--nowarm') o.nowarm = true;
  }
  return o;
}
async function safeContent(page) { for (let i = 0; i < 6; i++) { try { return await page.content(); } catch (e) { await page.waitForTimeout(500); } } return ''; }
function isChallenge(html) { return !html || html.includes('sgchallenge') || html.includes('Robot Challenge'); }
async function solveChallenge(page, maxSec = 45) {
  for (let i = 0; i < maxSec; i++) { await page.waitForTimeout(1000); const c = await safeContent(page); if (!isChallenge(c)) return true; }
  return false;
}
async function pageStyled(page) {
  try {
    return await page.evaluate(() => {
      if (!document.body) return false;
      const cs = getComputedStyle(document.body);
      const styled = document.styleSheets.length > 40 && /lato/i.test(cs.fontFamily);
      const h = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
      return styled && h > 800 && !!document.querySelector('footer, [data-elementor-type], .elementor');
    });
  } catch (e) { return false; }
}
async function gotoSolved(page, url) {
  const clone = !/hanoverresearch\.com/.test(url);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    } catch (e) { await page.waitForTimeout(1500); continue; }
    const c = await safeContent(page);
    if (isChallenge(c)) await solveChallenge(page);
    // wait for the real page body + FULLY STYLED content (before CSS applies, JetMenu renders as a
    // tall unstyled list in Times New Roman; styled -> many stylesheets + Lato body font).
    try {
      await page.waitForFunction(() => {
        if (!document.body) return false;
        const cs = getComputedStyle(document.body);
        const styled = document.styleSheets.length > 40 && /lato/i.test(cs.fontFamily);
        const h = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
        return styled && h > 800 && !!document.querySelector('footer, [data-elementor-type], .elementor, main, #content');
      }, { timeout: clone ? 20000 : 25000 });
    } catch (e) { }
    if (await pageStyled(page)) return true;
    await page.waitForTimeout(1500); // rate-limit backoff before retry
  }
  return await pageStyled(page);
}
async function autoScroll(page) {
  await page.evaluate(async () => {
    if (!document.body) return;
    await new Promise(res => { let y = 0; const t = setInterval(() => { const h = document.body ? document.body.scrollHeight : 0; window.scrollBy(0, 700); y += 700; if (y > h + 1500) { clearInterval(t); res(); } }, 90); });
  }).catch(() => {});
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  // ensure webfonts are fully loaded before any screenshot (avoids fallback-weight flashes)
  try { await page.evaluate(() => document.fonts && document.fonts.ready); } catch (e) {}
  // let Elementor swiper loop-carousels finish initialising (they lay out 1-up until init,
  // which otherwise inflates page height and misaligns segments)
  try {
    await page.waitForFunction(() => {
      const s = [...document.querySelectorAll('.elementor-loop-container.swiper, .elementor-main-swiper.swiper')];
      return s.length === 0 || s.filter(x => x.querySelectorAll('.swiper-slide').length > 0).every(x => x.classList.contains('swiper-initialized'));
    }, { timeout: 6000 });
  } catch (e) {}
  await page.waitForTimeout(2000);
}
async function dismissBanners(page) {
  // Remove the Termly cookie-consent banner AND any Elementor Pro popup (a scroll-triggered promo
  // "Turn Cost Data Into Action" loaded via AJAX on the origin — it is NOT in the static clone's HTML,
  // so removing it from origin captures keeps the comparison apples-to-apples). Applied to both sides.
  try {
    await page.evaluate(() => {
      document.querySelectorAll('[class*="termly-styles-"]').forEach(el => {
        let n = el; for (let i = 0; i < 6 && n.parentElement; i++) { if (getComputedStyle(n).position === 'fixed') break; n = n.parentElement; }
        (n || el).remove();
      });
      document.querySelectorAll('#termly-code-snippet-support, [id^="termly"]').forEach(e => e.remove());
      document.querySelectorAll('.elementor-popup-modal, [id^="elementor-popup-modal"], .dialog-widget.elementor-popup-modal, [class*="elementor-location-popup"]').forEach(e => e.remove());
      // Settle Elementor entrance animations: widgets start at opacity:0 with class
      // `elementor-invisible` and fade/slide in on scroll-into-view. In a headless capture the
      // IntersectionObserver may not have fired yet, leaving above-the-fold content blank. Force the
      // final (visible) state that a human sees. Applied to BOTH origin and clone -> symmetric/faithful.
      document.querySelectorAll('.elementor-invisible').forEach(e => { e.classList.remove('elementor-invisible'); e.style.opacity = '1'; e.style.transform = 'none'; });
    });
  } catch (e) {}
  await page.waitForTimeout(300);
}
function downscaleAndReport(file) {
  try { execSync(`mogrify -resize ${MAXPX}x${MAXPX}\\> ${JSON.stringify(file)}`); } catch (e) {}
  try { const dim = execSync(`identify -format "%wx%h" ${JSON.stringify(file)}`).toString().trim(); console.log(`    saved ${path.basename(file)} ${dim}`); return dim; }
  catch (e) { return '?'; }
}
// Segmented scroll capture: step by viewport HEIGHT, one viewport per segment.
async function settleAnimations(page) {
  // Persistent override so Elementor entrance animations (opacity:0 until scroll-into-view) don't
  // leave a headless segment blank. Kills animation/transition timing and forces the final visible
  // state a human sees. Symmetric across origin & clone. Idempotent id so it isn't duplicated.
  try {
    await page.evaluate(() => {
      if (!document.getElementById('__cap_settle')) {
        const s = document.createElement('style');
        s.id = '__cap_settle';
        s.textContent = '.elementor-invisible{opacity:1!important;visibility:visible!important}*{animation-duration:0.001s!important;animation-delay:0s!important;transition:none!important}';
        (document.head || document.documentElement).appendChild(s);
      }
      document.querySelectorAll('.elementor-invisible').forEach(e => { e.classList.remove('elementor-invisible'); e.style.opacity = '1'; e.style.transform = 'none'; });
    });
  } catch (e) {}
}
async function segmentCapture(page, vp, outdir, tag) {
  await page.setViewportSize(vp);
  await page.waitForTimeout(500);
  await settleAnimations(page);
  let total = 900;
  try { total = await page.evaluate(() => { const de = document.documentElement; const b = document.body; return Math.max(b ? b.scrollHeight : 0, de ? de.scrollHeight : 0) || 900; }); } catch (e) { total = 900; }
  const step = vp.height; // step by HEIGHT (never width)
  let n = 0; const files = [];
  for (let y = 0; y < total; y += step) {
    await page.evaluate(sy => window.scrollTo(0, sy), y);
    await page.waitForTimeout(350);
    await settleAnimations(page);
    n++;
    const f = path.join(outdir, `screenshot-${tag}-${String(n).padStart(2, '0')}.png`);
    await page.screenshot({ path: f }); // viewport shot, no clip -> exactly vp px
    downscaleAndReport(f);
    files.push(f);
    if (n >= 40) break; // safety
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  // primary above-the-fold copy
  if (files.length) { const main = path.join(outdir, `screenshot-${tag}.png`); fs.copyFileSync(files[0], main); downscaleAndReport(main); }
  return files.length;
}

async function collectSpec(page, url, outdir, loadedAssets) {
  // page.html (rendered)
  const html = await safeContent(page);
  fs.writeFileSync(path.join(outdir, 'page.html'), html);

  // computed styles for visible elements (bounded to 5000 elems)
  const styles = await page.evaluate(() => {
    const props = ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'color', 'background-color', 'background-image', 'text-align', 'margin', 'padding', 'display', 'flex-direction', 'justify-content', 'align-items', 'grid-template-columns', 'max-width', 'border-radius', 'box-shadow'];
    const out = []; let count = 0;
    const els = document.querySelectorAll('body *');
    for (const el of els) {
      if (count >= 5000) break;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width === 0 && r.height === 0) continue;
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const o = { tag: el.tagName.toLowerCase(), cls: (el.className && el.className.toString ? el.className.toString().slice(0, 120) : '') };
      for (const p of props) o[p] = cs.getPropertyValue(p);
      out.push(o); count++;
    }
    return { count, truncated: els.length > 5000, styles: out };
  });
  fs.writeFileSync(path.join(outdir, 'styles.json'), JSON.stringify(styles, null, 1));

  // assets: img src/srcset, picture/source, video/audio, css background-image, favicons
  const domAssets = await page.evaluate(() => {
    const urls = new Set();
    const abs = u => { try { return new URL(u, location.href).href; } catch (e) { return null; } };
    document.querySelectorAll('img[src]').forEach(i => { const u = abs(i.getAttribute('src')); if (u) urls.add(u); });
    document.querySelectorAll('img[srcset],source[srcset]').forEach(i => (i.getAttribute('srcset') || '').split(',').forEach(s => { const u = abs(s.trim().split(/\s+/)[0]); if (u) urls.add(u); }));
    document.querySelectorAll('source[src],video[src],audio[src],video source,track').forEach(i => { const u = abs(i.getAttribute('src')); if (u) urls.add(u); });
    document.querySelectorAll('video[poster]').forEach(i => { const u = abs(i.getAttribute('poster')); if (u) urls.add(u); });
    document.querySelectorAll('link[rel*="icon"],link[rel="apple-touch-icon"],link[rel="mask-icon"]').forEach(i => { const u = abs(i.getAttribute('href')); if (u) urls.add(u); });
    // background images from computed styles for every element
    document.querySelectorAll('*').forEach(el => {
      const bg = getComputedStyle(el).backgroundImage;
      if (bg && bg !== 'none') { const m = bg.match(/url\((['"]?)(.*?)\1\)/g) || []; m.forEach(x => { const uu = x.replace(/url\((['"]?)(.*?)\1\)/, '$2'); const a = abs(uu); if (a) urls.add(a); }); }
    });
    return [...urls];
  });
  const allAssets = new Set([...domAssets, ...(loadedAssets || [])]);
  fs.writeFileSync(path.join(outdir, 'assets.txt'), [...allAssets].sort().join('\n'));

  // fonts
  const fonts = await page.evaluate(() => {
    const fams = new Set(); document.querySelectorAll('body *').forEach(el => { const f = getComputedStyle(el).fontFamily; if (f) fams.add(f); });
    const faces = []; for (const ss of document.styleSheets) { try { for (const r of ss.cssRules) { if (r.constructor.name === 'CSSFontFaceRule' || r.type === 5) faces.push(r.cssText.slice(0, 300)); } } catch (e) { } }
    return { families: [...fams], fontFaceRules: faces };
  });
  fs.writeFileSync(path.join(outdir, 'fonts.txt'), 'FAMILIES:\n' + fonts.families.join('\n') + '\n\n@FONT-FACE:\n' + fonts.fontFaceRules.join('\n'));

  // embeds
  const embeds = await page.evaluate(() => [...document.querySelectorAll('iframe,embed,object')].map(e => (e.tagName.toLowerCase() + ' ' + (e.getAttribute('src') || e.getAttribute('data') || ''))));
  fs.writeFileSync(path.join(outdir, 'embeds.txt'), embeds.join('\n'));

  // meta
  const meta = await page.evaluate(() => {
    const g = s => { const e = document.querySelector(s); return e ? (e.getAttribute('content') || e.getAttribute('href') || '') : ''; };
    const lines = [];
    lines.push('title: ' + document.title);
    lines.push('description: ' + g('meta[name="description"]'));
    lines.push('canonical: ' + g('link[rel="canonical"]'));
    lines.push('robots: ' + g('meta[name="robots"]'));
    ['og:title', 'og:description', 'og:image', 'og:url', 'og:type', 'og:site_name'].forEach(p => lines.push(p + ': ' + g(`meta[property="${p}"]`)));
    ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image', 'twitter:site'].forEach(p => lines.push(p + ': ' + g(`meta[name="${p}"]`)));
    // analytics/tag ids
    const html = document.documentElement ? document.documentElement.innerHTML : '';
    const ids = new Set();
    (html.match(/G-[A-Z0-9]{6,}/g) || []).forEach(x => ids.add(x));
    (html.match(/GTM-[A-Z0-9]{4,}/g) || []).forEach(x => ids.add(x));
    (html.match(/UA-\d{4,}-\d+/g) || []).forEach(x => ids.add(x));
    (html.match(/AW-\d{6,}/g) || []).forEach(x => ids.add(x));
    lines.push('analytics_ids: ' + [...ids].join(', '));
    return lines.join('\n');
  });
  fs.writeFileSync(path.join(outdir, 'meta.txt'), meta);

  // links (INTERNAL/EXTERNAL)
  const links = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href'); if (!href) return;
      let abs; try { abs = new URL(href, location.href).href; } catch (e) { abs = href; }
      const internal = /^https?:\/\/(www\.)?hanoverresearch\.com/i.test(abs);
      const isSpecial = /^(mailto:|tel:|sms:|javascript:|#)/i.test(href);
      out.push((isSpecial ? 'SPECIAL' : (internal ? 'INTERNAL' : 'EXTERNAL')) + '\t' + href + '\t' + abs);
    });
    return [...new Set(out)];
  });
  fs.writeFileSync(path.join(outdir, 'links.txt'), links.join('\n'));
}

async function captureOne(context, job, outbase, spec, screenshotsOnly) {
  const outdir = path.join(outbase, job.slug);
  fs.mkdirSync(outdir, { recursive: true });
  const page = await context.newPage();
  const loaded = new Set();
  page.on('response', r => { const u = r.url(); if (/\.(css|js|png|jpe?g|svg|webp|gif|woff2?|ttf|otf|mp4|webm|ico)(\?|$)/i.test(u) && u.includes('hanoverresearch.com') && r.status() < 400) loaded.add(u.split('#')[0]); });
  console.log(`  [${job.slug}] ${job.url}`);
  const ready = await gotoSolved(page, job.url);
  if (!ready) { console.log(`    WARN [${job.slug}] not fully styled after retries`); }
  await page.waitForLoadState('networkidle', { timeout: 45000 }).catch(() => { });
  await autoScroll(page);
  await dismissBanners(page);
  // desktop then mobile
  await segmentCapture(page, VIEWPORTS.desktop, outdir, 'desktop');
  await autoScroll(page);
  await dismissBanners(page);
  await segmentCapture(page, VIEWPORTS.mobile, outdir, 'mobile');
  await page.setViewportSize(VIEWPORTS.desktop);
  if (!screenshotsOnly) {
    if (spec) await collectSpec(page, job.url, outdir, [...loaded]);
    else { const html = await safeContent(page); fs.writeFileSync(path.join(outdir, 'page.html'), html); fs.writeFileSync(path.join(outdir, 'assets.txt'), [...loaded].sort().join('\n')); }
  }
  await page.close();
  return outdir;
}

(async () => {
  const o = args();
  let jobs = [];
  if (o.jobs) jobs = JSON.parse(fs.readFileSync(o.jobs, 'utf8'));
  else if (o.url) jobs = [{ url: o.url, slug: o.slug }];
  else if (o.live) jobs = [{ url: o.live, slug: o.slug }];
  const screenshotsOnly = !!o.live;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, viewport: VIEWPORTS.desktop, deviceScaleFactor: 1 });
  // warm up the challenge once (skip for clone/live captures that aren't behind sgcaptcha)
  if (!o.nowarm) {
    const warm = await context.newPage();
    console.log('Warming up challenge...');
    await gotoSolved(warm, HOME);
    await warm.close();
  }

  let ok = 0, fail = 0;
  for (const job of jobs) {
    try { await captureOne(context, job, o.outbase, o.spec, screenshotsOnly); ok++; }
    catch (e) { console.log(`  FAIL [${job.slug}]: ${e.message}`); fail++; }
    if (!o.nowarm) await new Promise(r => setTimeout(r, 6000)); // inter-page backoff (origin rate-limit)
  }
  console.log(`DONE. ok=${ok} fail=${fail}`);
  await browser.close();
})();
