// audit.js — load live clone pages in Playwright, log responses with status >= 400 and
// requestfailed events. Classifies each finding: CLONE (same-origin clone asset, a real defect)
// vs THIRD-PARTY (external analytics/social/forms, expected) so we only fix clone defects.
// Vercel's edge DDoS "Security Checkpoint" can intermittently 403 automated bursts; those are
// detected (checkpoint title/403 on the page doc) and reported separately, NOT as clone defects.
// Env: AUDIT_BASE (default live clone), AUDIT_DELAY_MS (per-page gap, default 1200 -> >=1s to Vercel).
const { chromium } = require('playwright');
const fs = require('fs');

const CLONE = process.env.AUDIT_BASE || 'https://hanoverresearch-clone.vercel.app';
const CLONE_HOST = new URL(CLONE).host;
const DELAY = parseInt(process.env.AUDIT_DELAY_MS || '1200');

function slugToPath(sp){ return '/' + sp.replace(/index\.html$/, ''); }

(async () => {
  const pages = JSON.parse(fs.readFileSync('pages.json','utf8')).filter(p=>p.ok);
  // AUDIT_SAMPLE=N -> evenly-spread N pages across the whole set (covers new templated posts too).
  // else argv limit -> first N. else all.
  let sample;
  const N = process.env.AUDIT_SAMPLE ? parseInt(process.env.AUDIT_SAMPLE) : 0;
  if (N > 0 && N < pages.length) {
    const step = pages.length / N; sample = [];
    for (let k = 0; k < N; k++) sample.push(pages[Math.floor(k * step)]);
  } else {
    const limit = process.argv[2] ? parseInt(process.argv[2]) : pages.length;
    sample = pages.slice(0, limit);
  }
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport:{width:1440,height:900}, deviceScaleFactor:1 });
  const findings = [];
  const checkpoints = [];
  const page = await context.newPage();
  page.on('response', r => { const s=r.status(); if(s>=400){ const u=r.url(); findings.push({page:page.url(), url:u, status:s, kind: u.includes(CLONE_HOST)?'CLONE':'THIRD-PARTY'}); } });
  page.on('requestfailed', r => { const u=r.url(); const err=(r.failure()&&r.failure().errorText)||''; if(/net::ERR_ABORTED/.test(err)) return; findings.push({page:page.url(), url:u, status:'FAILED:'+err, kind: u.includes(CLONE_HOST)?'CLONE':'THIRD-PARTY'}); });

  let i=0;
  for(const p of sample){
    i++;
    const url = CLONE + slugToPath(p.sitepath);
    try{
      const resp = await page.goto(url, {waitUntil:'domcontentloaded', timeout:45000});
      const title = await page.title().catch(()=>'');
      if((resp && resp.status()===403) || /Vercel Security Checkpoint/i.test(title)){
        checkpoints.push(url); // Vercel edge challenge, not a clone defect
      }
      await page.waitForTimeout(600);
      await page.evaluate(async()=>{ await new Promise(r=>{let y=0;const t=setInterval(()=>{window.scrollBy(0,1200);y+=1200;if(y>document.body.scrollHeight+1000){clearInterval(t);r();}},50);}); }).catch(()=>{});
      await page.waitForTimeout(400);
    }catch(e){ findings.push({page:url, url:url, status:'NAV_ERR:'+e.message.slice(0,60), kind:'CLONE'}); }
    if(i%25===0) console.log(`audited ${i}/${sample.length}`);
    await new Promise(r=>setTimeout(r, DELAY)); // >=1s spacing to Vercel
  }
  // drop findings that belong to a Vercel-checkpoint page load (checkpoint serves its own astro assets)
  const cpSet = new Set(checkpoints);
  const realFindings = findings.filter(f => !cpSet.has(f.page) && !/vercel-security|_vercel|Vercel Security/i.test(f.url));
  const clone = realFindings.filter(f=>f.kind==='CLONE');
  const third = realFindings.filter(f=>f.kind==='THIRD-PARTY');
  // dedupe clone findings by url+status
  const seen=new Set(); const cloneU=[];
  for(const f of clone){ const k=f.url+'|'+f.status; if(!seen.has(k)){ seen.add(k); cloneU.push(f); } }
  const seen2=new Set(); const thirdU=[];
  for(const f of third){ const k=f.url.split('?')[0]+'|'+f.status; if(!seen2.has(k)){ seen2.add(k); thirdU.push(f); } }
  fs.writeFileSync('audit_results.json', JSON.stringify({base:CLONE, pagesAudited:sample.length, vercelCheckpointPages:checkpoints.length, cloneDefects:cloneU, thirdParty:thirdU}, null, 1));
  console.log('\n=== AUDIT SUMMARY ===');
  console.log('base:', CLONE);
  console.log('pages audited:', sample.length);
  console.log('Vercel-checkpoint page loads (edge DDoS challenge, not a clone defect):', checkpoints.length);
  console.log('CLONE-side >=400 / failed (unique):', cloneU.length);
  cloneU.slice(0,60).forEach(f=>console.log('  ', f.status, f.url.replace(CLONE,'')));
  console.log('THIRD-PARTY >=400 / failed (unique):', thirdU.length);
  thirdU.slice(0,40).forEach(f=>console.log('  ', f.status, f.url.split('?')[0].slice(0,90)));
  await browser.close();
})();
