// Live broken-link verifier: fetch a diverse sample of clone pages, extract every genuine
// internal <a> href, dedupe, and GET each (following redirects) — report any ending in 404.
const BASE='https://hanoverresearch-clone.vercel.app';
const pages=[
 '/', '/about-us/', '/careers/', '/careers/sales-account-management/',
 '/testimonial/', '/testimonial/corporate/insightsoftware/',
 '/testimonial/higher-education/clayton-university-drives-innovation-with-strategic-funding-support/',
 '/testimonial/k-12-education/searcy-school-district/',
 '/industry/b2b-manufacturing/', '/reports-and-briefs/',
 '/reports-and-briefs/corporate/the-state-of-market-research/',
 '/case-studies/', '/insights-blog/', '/news/', '/expertise/',
 '/corporate/', '/higher-education/', '/k-12-education/',
 '/interactive-tools/corporate/research-revenue-calculator/',
];
const INTERNAL=/^https?:\/\/(www\.)?hanoverresearch-clone\.vercel\.app/i;
const hrefRe=/(?<![:\-\w])href\s*=\s*"([^"]*)"/gi;
const scriptRe=/<script\b[^>]*>[\s\S]*?<\/script>/gi;
function norm(h){
  h=h.split('#')[0];
  if(h.startsWith('/')&&!h.startsWith('//')) return h;
  if(/^https?:\/\//i.test(h)){ try{const u=new URL(h); if(/hanoverresearch-clone\.vercel\.app$/i.test(u.host)) return u.pathname+u.search; }catch(e){} return null; }
  return null;
}
async function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
(async()=>{
  const targets=new Set();
  const srcOf={};
  for(const p of pages){
    try{
      const r=await fetch(BASE+p,{redirect:'follow'});
      let html=await r.text();
      html=html.replace(scriptRe,'');
      let m;
      while((m=hrefRe.exec(html))){
        const raw=m[1].trim();
        if(!raw||/^(mailto:|tel:|sms:|javascript:|data:|#)/i.test(raw)) continue;
        const t=norm(raw);
        if(t){ if(!targets.has(t)) srcOf[t]=p; targets.add(t); }
      }
    }catch(e){ console.log('ERR loading',p,e.message); }
    await sleep(300);
  }
  console.log('Unique internal link targets to check:', targets.size);
  const list=[...targets];
  let ok=0, red=0, bad=[];
  for(let i=0;i<list.length;i++){
    const t=list[i];
    try{
      const r=await fetch(BASE+t,{redirect:'manual'});
      const st=r.status;
      if(st>=200&&st<300){ ok++; }
      else if(st>=300&&st<400){ red++; // follow one hop to ensure final is ok
        const loc=r.headers.get('location'); const r2=await fetch(loc.startsWith('http')?loc:BASE+loc,{redirect:'follow'});
        if(r2.status>=400){ bad.push([t,st+'->'+r2.status,srcOf[t]]); }
      }
      else { bad.push([t,st,srcOf[t]]); }
    }catch(e){ bad.push([t,'ERR '+e.message,srcOf[t]]); }
    if(i%50===0) await sleep(200);
  }
  console.log(`checked=${list.length} ok2xx=${ok} redirect=${red} broken=${bad.length}`);
  console.log('=== BROKEN (final status >=400) ===');
  for(const [t,st,src] of bad) console.log(`  ${st}  ${t}   (from ${src})`);
})();
