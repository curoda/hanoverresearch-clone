const { chromium } = require('playwright');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const HOME = 'https://www.hanoverresearch.com/';
const ORIGIN = 'https://www.hanoverresearch.com';
async function safeContent(page){ for(let i=0;i<6;i++){ try { return await page.content(); } catch(e){ await page.waitForTimeout(400);} } return ''; }
function isChallenge(h){ return !h || h.includes('sgchallenge') || h.includes('Robot Challenge'); }
async function solve(page){ for(let i=0;i<45;i++){ await page.waitForTimeout(1000); const c=await safeContent(page); if(!isChallenge(c)) return true; } return false; }
const paths = [
 '/privacy-policy/','/b2b-manufacturing/','/building-products/','/cpg/','/edtech/','/software/',
 '/research-insights/reports-briefs/','/tags/higher-education/','/about-us/news/','/tags/corporate/',
 '/tags/k-12-education/','/research-insights/case-studies/','/market-research-revenue-calculator/',
 '/hanover-digital/','/tags/grants/','/tags/market-analysis/'
];
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA });
  const page = await context.newPage();
  await page.goto(HOME,{waitUntil:'domcontentloaded',timeout:90000}); await solve(page);
  await page.goto('https://www.hanoverresearch.com/about-us/',{waitUntil:'domcontentloaded',timeout:90000}); await solve(page);
  await page.waitForTimeout(600);
  for(const p of paths){
    let out='';
    for(let a=0;a<3;a++){
      try{
        const r = await context.request.get(ORIGIN+p,{timeout:40000, maxRedirects:0});
        const st=r.status();
        if(st>=200&&st<300){ const b=await r.text(); if(isChallenge(b)){ await page.goto(HOME,{waitUntil:'domcontentloaded'}); await solve(page); continue; } }
        out = `${st}  ${p}  ${st>=300&&st<400? '-> '+(r.headers()['location']||''):''}`;
        break;
      }catch(e){ out='ERR '+p+' '+String(e).slice(0,60); }
    }
    console.log(out);
    await page.waitForTimeout(1100);
  }
  await browser.close();
})();
