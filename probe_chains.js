const { chromium } = require('playwright');
const fs = require('fs');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const HOME = 'https://www.hanoverresearch.com/';
const ORIGIN = 'https://www.hanoverresearch.com';
async function safeContent(page){ for(let i=0;i<6;i++){ try { return await page.content(); } catch(e){ await page.waitForTimeout(400);} } return ''; }
function isChallenge(h){ return !h || h.includes('sgchallenge') || h.includes('Robot Challenge'); }
async function solve(page){ for(let i=0;i<45;i++){ await page.waitForTimeout(1000); const c=await safeContent(page); if(!isChallenge(c)) return true; } return false; }
(async () => {
  const cat = JSON.parse(fs.readFileSync('link_categories.json','utf8'));
  const paths = Object.keys(cat.REDIR_UNMIRRORED);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA });
  const page = await context.newPage();
  await page.goto(HOME,{waitUntil:'domcontentloaded',timeout:90000}); await solve(page);
  await page.goto('https://www.hanoverresearch.com/about-us/',{waitUntil:'domcontentloaded',timeout:90000}); await solve(page);
  await page.waitForTimeout(600);
  const out={};
  for(const p of paths){
    // manual hop-following to capture full chain
    let cur = ORIGIN + p; let chain=[]; let finalStatus=null; let hops=0;
    while(hops<8){
      hops++;
      let r=null;
      for(let a=0;a<3;a++){
        try{ r = await context.request.get(cur,{timeout:40000,maxRedirects:0}); }catch(e){ r=null; }
        if(!r){ await page.goto(HOME,{waitUntil:'domcontentloaded'}).catch(()=>{}); await solve(page); continue; }
        const st=r.status();
        if(st===202){ await page.goto(HOME,{waitUntil:'domcontentloaded'}).catch(()=>{}); await solve(page); await page.waitForTimeout(400); continue; }
        break;
      }
      if(!r){ finalStatus='ERR'; break; }
      const st=r.status();
      if(st>=300 && st<400){
        let loc=r.headers()['location'];
        chain.push(st+' '+loc);
        if(!loc){ finalStatus=st; break; }
        cur = loc.startsWith('http')? loc : ORIGIN + (loc.startsWith('/')?loc:'/'+loc);
        await page.waitForTimeout(1100);
        continue;
      } else { finalStatus=st; break; }
    }
    out[p] = { finalUrl: cur, finalStatus, chain };
    console.log(p, '=>', finalStatus, cur.replace(ORIGIN,''));
    await page.waitForTimeout(900);
  }
  fs.writeFileSync('redir_chains.json', JSON.stringify(out,null,1));
  console.log('DONE');
  await browser.close();
})();
