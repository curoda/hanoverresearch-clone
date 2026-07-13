// fetch_raw.js — fetch RAW server HTML for every scope URL via the warmed browser
// context (context.request passes the sgcaptcha challenge; returns un-rendered server
// HTML so Elementor widgets are NOT pre-initialized -> no double-init on the clone).
// Writes raw/<sanitized>.html and pages.json manifest.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const HOME = 'https://www.hanoverresearch.com/';

async function safeContent(page){ for(let i=0;i<6;i++){ try { return await page.content(); } catch(e){ await page.waitForTimeout(500);} } return ''; }
function isChallenge(h){ return !h || h.includes('sgchallenge') || h.includes('Robot Challenge'); }
async function solve(page){ for(let i=0;i<45;i++){ await page.waitForTimeout(1000); const c=await safeContent(page); if(!isChallenge(c)) return true; } return false; }

function urlToSlug(u){
  const p = new URL(u).pathname.replace(/\/+$/,'');
  if(p==='' ) return 'home';
  return p.replace(/^\//,'').replace(/\//g,'__');
}
function urlToSitePath(u){
  const p = new URL(u).pathname.replace(/\/+$/,'');
  if(p==='') return 'index.html';
  return p.replace(/^\//,'') + '/index.html';
}

(async () => {
  const urls = fs.readFileSync(process.argv[2]||'urls.txt','utf8').split('\n').map(s=>s.trim()).filter(Boolean);
  const outdir = process.argv[3]||'raw';
  fs.mkdirSync(outdir,{recursive:true});
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA });
  const page = await context.newPage();
  // 2-nav warmup so _I_ cookie is active for context.request
  await page.goto(HOME,{waitUntil:'domcontentloaded',timeout:90000}); await solve(page);
  await page.goto('https://www.hanoverresearch.com/about-us/',{waitUntil:'domcontentloaded',timeout:90000}); await solve(page);
  await page.waitForTimeout(800);

  const manifest = [];
  let ok=0, fail=0;
  for(let i=0;i<urls.length;i++){
    const u = urls[i];
    const slug = urlToSlug(u);
    let raw='', status=0, got=false;
    for(let attempt=0; attempt<4 && !got; attempt++){
      try{
        const r = await context.request.get(u,{timeout:45000, headers:{'Accept':'text/html,application/xhtml+xml'}});
        status = r.status(); raw = await r.text();
        if(status===200 && !isChallenge(raw)){ got=true; break; }
      }catch(e){ raw='ERR '+e.message; }
      // re-warm via a real navigation if challenged
      await page.goto(HOME,{waitUntil:'domcontentloaded',timeout:60000}).catch(()=>{}); await solve(page);
      await page.waitForTimeout(500);
    }
    if(got){ fs.writeFileSync(path.join(outdir, slug+'.html'), raw); ok++; }
    else { fail++; console.log(`FAIL ${u} status=${status} len=${raw.length}`); }
    manifest.push({url:u, slug, sitepath:urlToSitePath(u), status, ok:got, len:raw.length});
    if(i%25===0) console.log(`[${i}/${urls.length}] ok=${ok} fail=${fail} last=${slug}`);
  }
  fs.writeFileSync('pages.json', JSON.stringify(manifest,null,1));
  console.log(`DONE raw fetch: ok=${ok} fail=${fail} total=${urls.length}`);
  await browser.close();
})();
