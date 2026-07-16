// Probe every distinct broken internal path against the ORIGIN.
// Classify: 200 (real unmirrored page), 3xx (redirect -> capture Location), 404/403/410, other.
const { chromium } = require('playwright');
const fs = require('fs');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const HOME = 'https://www.hanoverresearch.com/';
const ORIGIN = 'https://www.hanoverresearch.com';
async function safeContent(page){ for(let i=0;i<6;i++){ try { return await page.content(); } catch(e){ await page.waitForTimeout(400);} } return ''; }
function isChallenge(h){ return !h || h.includes('sgchallenge') || h.includes('Robot Challenge'); }
async function solve(page){ for(let i=0;i<45;i++){ await page.waitForTimeout(1000); const c=await safeContent(page); if(!isChallenge(c)) return true; } return false; }

(async () => {
  const paths = Object.keys(JSON.parse(fs.readFileSync('broken_links.json','utf8')));
  const outFile = 'origin_probe.json';
  let results = {};
  if(fs.existsSync(outFile)){ try{ results = JSON.parse(fs.readFileSync(outFile,'utf8')); }catch(e){} }
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA });
  const page = await context.newPage();
  await page.goto(HOME,{waitUntil:'domcontentloaded',timeout:90000}); await solve(page);
  await page.goto('https://www.hanoverresearch.com/about-us/',{waitUntil:'domcontentloaded',timeout:90000}); await solve(page);
  await page.waitForTimeout(600);

  let done = 0;
  for(const p of paths){
    if(results[p] && results[p].status && results[p].status!=='ERR'){ done++; continue; }
    const url = ORIGIN + p;
    let rec = {status:'ERR', location:null};
    for(let attempt=0; attempt<3; attempt++){
      try{
        const r = await context.request.get(url,{timeout:40000, maxRedirects:0, headers:{'Accept':'text/html,application/xhtml+xml'}});
        const st = r.status();
        const body = (st>=200 && st<300) ? await r.text() : '';
        if(st===202 || (st>=200 && st<300 && isChallenge(body))){
          // sgcaptcha challenge (202 or challenge body): re-warm and retry
          await page.goto(HOME,{waitUntil:'domcontentloaded',timeout:60000}).catch(()=>{}); await solve(page);
          await page.waitForTimeout(500);
          continue;
        }
        rec = { status: st, location: (st>=300&&st<400) ? (r.headers()['location']||null) : null };
        break;
      }catch(e){ rec = {status:'ERR', location:null, err:String(e).slice(0,80)};
        await page.goto(HOME,{waitUntil:'domcontentloaded',timeout:60000}).catch(()=>{}); await solve(page);
      }
    }
    results[p] = rec;
    done++;
    if(done % 25 === 0){ fs.writeFileSync(outFile, JSON.stringify(results,null,1)); console.log(`[${done}/${paths.length}] last=${p} -> ${rec.status} ${rec.location||''}`); }
    await page.waitForTimeout(1100); // >=1s spacing
  }
  fs.writeFileSync(outFile, JSON.stringify(results,null,1));
  console.log('DONE', Object.keys(results).length);
  await browser.close();
})();
