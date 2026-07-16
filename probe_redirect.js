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
  const r = await context.request.get('https://www.hanoverresearch.com/about-us/client-testimonials/',{timeout:45000, maxRedirects:0}).catch(e=>null);
  console.log('status', r.status());
  console.log('location', r.headers()['location']);
  // Also follow fully to final destination
  const r2 = await context.request.get('https://www.hanoverresearch.com/about-us/client-testimonials/',{timeout:45000}).catch(e=>null);
  console.log('final url', r2 ? r2.url() : 'ERR', 'status', r2 ? r2.status() : '');
  const body = r2 ? await r2.text() : '';
  console.log('final title', (body.match(/<title>([^<]*)<\/title>/)||[])[1] || '');
  await browser.close();
})();
