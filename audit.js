// audit.js — load every live clone page in Playwright, log responses with status >= 400 and
// requestfailed events. Classifies each finding: CLONE (same-origin clone asset, a real defect)
// vs THIRD-PARTY (external analytics/social/forms, expected) so we only fix clone defects.
const { chromium } = require('playwright');
const fs = require('fs');

const CLONE = 'https://hanoverresearch-clone.vercel.app';
const CLONE_HOST = 'hanoverresearch-clone.vercel.app';

function slugToPath(sp){ return '/' + sp.replace(/index\.html$/, ''); }

(async () => {
  const pages = JSON.parse(fs.readFileSync('pages.json','utf8')).filter(p=>p.ok);
  // allow limiting via argv
  const limit = process.argv[2] ? parseInt(process.argv[2]) : pages.length;
  const sample = pages.slice(0, limit);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport:{width:1440,height:900}, deviceScaleFactor:1 });
  const findings = [];
  const page = await context.newPage();
  page.on('response', r => { const s=r.status(); if(s>=400){ const u=r.url(); findings.push({page:page.url(), url:u, status:s, kind: u.includes(CLONE_HOST)?'CLONE':'THIRD-PARTY'}); } });
  page.on('requestfailed', r => { const u=r.url(); const err=(r.failure()&&r.failure().errorText)||''; if(/net::ERR_ABORTED/.test(err)) return; findings.push({page:page.url(), url:u, status:'FAILED:'+err, kind: u.includes(CLONE_HOST)?'CLONE':'THIRD-PARTY'}); });

  let i=0;
  for(const p of sample){
    i++;
    const url = CLONE + slugToPath(p.sitepath);
    try{
      await page.goto(url, {waitUntil:'domcontentloaded', timeout:45000});
      await page.waitForTimeout(600);
      await page.evaluate(async()=>{ await new Promise(r=>{let y=0;const t=setInterval(()=>{window.scrollBy(0,1200);y+=1200;if(y>document.body.scrollHeight+1000){clearInterval(t);r();}},50);}); }).catch(()=>{});
      await page.waitForTimeout(400);
    }catch(e){ findings.push({page:url, url:url, status:'NAV_ERR:'+e.message.slice(0,60), kind:'CLONE'}); }
    if(i%25===0) console.log(`audited ${i}/${sample.length}`);
  }
  const clone = findings.filter(f=>f.kind==='CLONE');
  const third = findings.filter(f=>f.kind==='THIRD-PARTY');
  // dedupe clone findings by url+status
  const seen=new Set(); const cloneU=[];
  for(const f of clone){ const k=f.url+'|'+f.status; if(!seen.has(k)){ seen.add(k); cloneU.push(f); } }
  const seen2=new Set(); const thirdU=[];
  for(const f of third){ const k=f.url.split('?')[0]+'|'+f.status; if(!seen2.has(k)){ seen2.add(k); thirdU.push(f); } }
  fs.writeFileSync('audit_results.json', JSON.stringify({pagesAudited:sample.length, cloneDefects:cloneU, thirdParty:thirdU}, null, 1));
  console.log('\n=== AUDIT SUMMARY ===');
  console.log('pages audited:', sample.length);
  console.log('CLONE-side >=400 / failed (unique):', cloneU.length);
  cloneU.slice(0,60).forEach(f=>console.log('  ', f.status, f.url.replace(CLONE,'')));
  console.log('THIRD-PARTY >=400 / failed (unique):', thirdU.length);
  thirdU.slice(0,40).forEach(f=>console.log('  ', f.status, f.url.split('?')[0].slice(0,90)));
  await browser.close();
})();
