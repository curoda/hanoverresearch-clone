// download_list.js — download an explicit list of root-relative same-domain asset paths from the
// origin (warmed sgcaptcha context, >=1s spacing) into site/<path>. Used to fetch Elementor's
// dynamically-import()-ed JS module bundles (not present in HTML, so the HTML scanner missed them).
// Usage: node download_list.js <paths.txt> <failures_out.txt>
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const HOME = 'https://www.hanoverresearch.com/';
const ORIGIN = 'https://www.hanoverresearch.com';
const MIN_GAP_MS = 1000;
let lastReq = 0;
async function rateGate(){ const now=Date.now(); const w=MIN_GAP_MS-(now-lastReq); if(w>0) await new Promise(r=>setTimeout(r,w)); lastReq=Date.now(); }
async function safeContent(p){ for(let i=0;i<6;i++){ try{ return await p.content(); }catch(e){ await p.waitForTimeout(500);} } return ''; }
function isChallenge(h){ return !h||h.includes('sgchallenge')||h.includes('Robot Challenge')||h.includes('sgcaptcha'); }
async function solve(p){ for(let i=0;i<45;i++){ await p.waitForTimeout(1000); const c=await safeContent(p); if(!isChallenge(c)) return true; } return false; }
(async () => {
  const listFile = process.argv[2]; const failOut = process.argv[3]||'download_list_failures.txt';
  const paths = fs.readFileSync(listFile,'utf8').split('\n').map(s=>s.trim()).filter(Boolean);
  const browser = await chromium.launch({headless:true});
  const context = await browser.newContext({ignoreHTTPSErrors:true,userAgent:UA});
  const page = await context.newPage();
  await rateGate(); await page.goto(HOME,{waitUntil:'domcontentloaded',timeout:90000}); await solve(page);
  await rateGate(); await page.goto('https://www.hanoverresearch.com/about-us/',{waitUntil:'domcontentloaded',timeout:90000}); await solve(page);
  await page.waitForTimeout(500);
  const failed=[]; let ok=0, skipped=0;
  for(const rel of paths){
    const dp = path.join('site', decodeURIComponent(rel.replace(/^\//,'')));
    if(fs.existsSync(dp) && fs.statSync(dp).size>0){ skipped++; continue; }
    const href = ORIGIN + rel;
    let buf=null;
    for(let attempt=0; attempt<4; attempt++){
      try{
        await rateGate();
        const r = await context.request.get(href,{timeout:60000, maxRedirects:0});
        if(r.status()===200){ buf=await r.body(); break; }
        if(r.status()===202){ await rateGate(); await page.goto(HOME,{waitUntil:'domcontentloaded',timeout:60000}).catch(()=>{}); await solve(page); continue; }
        failed.push(r.status()+' '+href); break;
      }catch(e){ await page.waitForTimeout(400); }
    }
    if(!buf){ if(!failed.some(x=>x.includes(href))) failed.push('ERR '+href); continue; }
    fs.mkdirSync(path.dirname(dp),{recursive:true});
    fs.writeFileSync(dp, buf); ok++;
    if(ok%10===0) console.log('  downloaded', ok, '...');
  }
  fs.writeFileSync(failOut, failed.join('\n'));
  console.log(`DONE list: downloaded=${ok} skipped=${skipped} failed=${failed.length}`);
  await browser.close();
})();
