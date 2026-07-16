const { chromium } = require('playwright');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const HOME = 'https://www.hanoverresearch.com/';
async function safeContent(page){ for(let i=0;i<6;i++){ try { return await page.content(); } catch(e){ await page.waitForTimeout(500);} } return ''; }
function isChallenge(h){ return !h || h.includes('sgchallenge') || h.includes('Robot Challenge'); }
async function solve(page){ for(let i=0;i<45;i++){ await page.waitForTimeout(1000); const c=await safeContent(page); if(!isChallenge(c)) return true; } return false; }

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA });
  const page = await context.newPage();
  await page.goto(HOME,{waitUntil:'domcontentloaded',timeout:90000}); await solve(page);
  await page.goto('https://www.hanoverresearch.com/about-us/',{waitUntil:'domcontentloaded',timeout:90000}); await solve(page);
  await page.waitForTimeout(800);

  const targets = [
    'https://www.hanoverresearch.com/testimonial/corporate/insightsoftware/',
    'https://www.hanoverresearch.com/about-us/client-testimonials/',
    'https://www.hanoverresearch.com/testimonial/',
  ];
  for(const u of targets){
    try{
      const r = await context.request.get(u,{timeout:45000, headers:{'Accept':'text/html,application/xhtml+xml'}, maxRedirects:0}).catch(e=>null);
      let status = r? r.status(): 'ERR';
      let body = r? await r.text(): '';
      let challenged = isChallenge(body);
      // extract "Back to All Testimonials" href
      let href = null;
      const idx = body.indexOf('Back to All Testimonials');
      if(idx>=0){ const start = body.lastIndexOf('<a', idx); const seg = body.slice(start, idx); const m = seg.match(/href="([^"]*)"/); href = m? m[1]: null; }
      const title = (body.match(/<title>([^<]*)<\/title>/)||[])[1] || '';
      console.log('URL:', u);
      console.log('  status:', status, 'challenged:', challenged, 'len:', body.length);
      console.log('  title:', title.slice(0,80));
      console.log('  BackToAllTestimonials href:', href);
    }catch(e){ console.log('URL:', u, 'EXCEPTION', e.message); }
  }
  await browser.close();
})();
