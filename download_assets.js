// download_assets.js — collect every same-domain (www.hanoverresearch.com) asset URL
// from the raw HTML, download via the warmed browser context (passes sgcaptcha),
// save under site/<original-path>, then recurse into downloaded CSS url() refs.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const HOME = 'https://www.hanoverresearch.com/';
const ORIGIN = 'https://www.hanoverresearch.com';
const SITE = 'site';

async function safeContent(page){ for(let i=0;i<6;i++){ try { return await page.content(); } catch(e){ await page.waitForTimeout(500);} } return ''; }
function isChallenge(h){ return !h || h.includes('sgchallenge') || h.includes('Robot Challenge'); }
async function solve(page){ for(let i=0;i<45;i++){ await page.waitForTimeout(1000); const c=await safeContent(page); if(!isChallenge(c)) return true; } return false; }

function collapseSlashes(p){ return p.replace(/([^:])\/{2,}/g,'$1/'); }
const ASSET_EXT=/\.(css|js|mjs|png|jpe?g|gif|svg|webp|avif|ico|cur|woff2?|ttf|otf|eot|mp4|webm|ogg|mp3|wav|pdf|json|xml|map|txt|zip|docx?|xlsx?|pptx?)(\?|$)/i;
function isAssetPath(pathname){
  const p=pathname.split('?')[0];
  if(ASSET_EXT.test(p)) return true;
  if(/^\/wp-(content|includes)\//.test(p)) return true;
  return false;
}
// normalize a candidate ref to an absolute same-domain URL, or null if off-domain/data
function toAbs(ref){
  if(!ref) return null;
  ref = ref.trim().replace(/&amp;/g,'&');
  if(ref.startsWith('data:')||ref.startsWith('#')||ref.startsWith('mailto:')||ref.startsWith('tel:')||ref.startsWith('javascript:')) return null;
  let abs;
  try{
    if(ref.startsWith('//')) abs = 'https:'+ref;
    else if(ref.startsWith('http')) abs = ref;
    else if(ref.startsWith('/')) abs = ORIGIN+ref;
    else return null; // skip relative (handled per-css)
    const u = new URL(abs);
    if(!/(^|\.)hanoverresearch\.com$/.test(u.hostname)) return null;
    if(u.hostname!=='www.hanoverresearch.com' && u.hostname!=='hanoverresearch.com') return null; // only main domain
    if(!isAssetPath(u.pathname)) return null; // skip page/link URLs
    return u;
  }catch(e){ return null; }
}
// site disk path for a same-domain URL (strip query, collapse slashes)
function diskPath(u){
  let p = collapseSlashes(u.pathname);
  if(p.endsWith('/')) p += 'index.html';
  return path.join(SITE, decodeURIComponent(p));
}

function extractFromHtml(html){
  const out = new Set();
  const push = r => { const u=toAbs(r); if(u) out.add(u.href); };
  let m;
  const attrRe = /(?:src|href|data-src|data-lazy-src|data-large_image|poster|content|data-bg|data-background)\s*=\s*["']([^"']+)["']/gi;
  while((m=attrRe.exec(html))) push(m[1]);
  const srcsetRe = /(?:srcset|data-srcset|imagesrcset)\s*=\s*["']([^"']+)["']/gi;
  while((m=srcsetRe.exec(html))) m[1].split(',').forEach(s=>push(s.trim().split(/\s+/)[0]));
  const urlRe = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
  while((m=urlRe.exec(html))) push(m[1]);
  return out;
}
function extractFromCss(css, baseUrl){
  const out = new Set();
  let m; const urlRe=/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
  while((m=urlRe.exec(css))){
    let ref=m[1].trim(); if(!ref||ref.startsWith('data:')||ref.startsWith('#')) continue;
    let abs;
    try{ abs = new URL(ref, baseUrl); }catch(e){ continue; }
    if(abs.hostname==='www.hanoverresearch.com') out.add(abs.href);
  }
  const impRe=/@import\s+(?:url\()?\s*['"]([^'"]+)['"]/gi;
  while((m=impRe.exec(css))){ try{ const a=new URL(m[1],baseUrl); if(a.hostname==='www.hanoverresearch.com') out.add(a.href);}catch(e){} }
  return out;
}

(async () => {
  // gather candidate URLs from all raw html
  const rawDir='raw';
  const files=fs.readdirSync(rawDir).filter(f=>f.endsWith('.html'));
  let candidates=new Set();
  for(const f of files){ const html=fs.readFileSync(path.join(rawDir,f),'utf8'); for(const u of extractFromHtml(html)) candidates.add(u); }
  console.log('HTML candidate assets:', candidates.size);

  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext({ignoreHTTPSErrors:true,userAgent:UA});
  const page=await context.newPage();
  await page.goto(HOME,{waitUntil:'domcontentloaded',timeout:90000}); await solve(page);
  await page.goto('https://www.hanoverresearch.com/about-us/',{waitUntil:'domcontentloaded',timeout:90000}); await solve(page);
  await page.waitForTimeout(800);

  const done=new Set(); const failed=[]; let ok=0;
  async function download(href){
    if(done.has(href)) return null;
    done.add(href);
    const u=new URL(href);
    const dp=diskPath(u);
    let buf=null;
    for(let attempt=0; attempt<4; attempt++){
      try{
        const r=await context.request.get(href,{timeout:60000});
        if(r.status()===200){ buf=await r.body(); break; }
        if(r.status()===202){ await page.goto(HOME,{waitUntil:'domcontentloaded',timeout:60000}).catch(()=>{}); await solve(page); continue; }
        // other status: record and stop
        failed.push(r.status()+' '+href); return null;
      }catch(e){ await page.waitForTimeout(600); }
    }
    if(!buf){ failed.push('ERR '+href); return null; }
    try{
      if(fs.existsSync(dp) && fs.statSync(dp).isDirectory()){ failed.push('ISDIR '+href); return null; }
      fs.mkdirSync(path.dirname(dp),{recursive:true});
      fs.writeFileSync(dp, buf);
    }catch(e){ failed.push('WRITEERR '+href+' '+e.code); return null; }
    ok++;
    if(ok%100===0) console.log('  downloaded', ok, '...');
    return {dp, buf};
  }

  // download all html-derived assets, and queue CSS for recursion
  const cssQueue=[];
  const arr=[...candidates];
  // limited concurrency
  const CONC=6;
  let idx=0;
  async function worker(){
    while(idx<arr.length){
      const href=arr[idx++];
      const res=await download(href);
      if(res && /\.css(\?|$)/i.test(href)) cssQueue.push({href, css: res.buf.toString('utf8')});
    }
  }
  await Promise.all(Array.from({length:CONC},()=>worker()));
  console.log('First pass done. ok=',ok,'cssQueue=',cssQueue.length);

  // recurse CSS url() (may nest one more level)
  let round=0;
  let pending=cssQueue.slice();
  while(pending.length && round<4){
    round++;
    const next=[];
    const refs=new Set();
    for(const {href,css} of pending) for(const r of extractFromCss(css,href)) refs.add(r);
    const list=[...refs].filter(r=>!done.has(r));
    console.log('CSS round',round,'new refs',list.length);
    let j=0;
    async function w2(){ while(j<list.length){ const href=list[j++]; const res=await download(href); if(res && /\.css(\?|$)/i.test(href)) next.push({href,css:res.buf.toString('utf8')}); } }
    await Promise.all(Array.from({length:CONC},()=>w2()));
    pending=next;
  }
  fs.writeFileSync('asset_failures.txt', failed.join('\n'));
  console.log('DONE assets. downloaded=',ok,'failed=',failed.length);
  await browser.close();
})();
