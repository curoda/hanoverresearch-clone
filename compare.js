// compare.js — Phase-6 objective comparison. For each captured origin slug, recapture
// the LIVE clone with capture.js (--live --nowarm, screenshots only), then pixel-diff each
// native-resolution segment (origin captures/<slug> vs clone clone_shots/<slug>) with
// pixelmatch. Reports per-page, per-viewport mean/max % diff. All screenshots are produced
// by capture.js (this script only diffs already-saved PNGs).
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch');

const CLONE = 'https://hanoverresearch-clone.vercel.app';
const ORIGIN = 'https://www.hanoverresearch.com';

function slugToPath(slug){ return slug === 'home' ? '/' : '/' + slug.replace(/__/g, '/') + '/'; }

function diffPng(a, b){
  try{
    let A = PNG.sync.read(fs.readFileSync(a));
    let B = PNG.sync.read(fs.readFileSync(b));
    if(A.width !== B.width || A.height !== B.height){
      // resize B to A via imagemagick into temp
      const tmp = b + '.rz.png';
      execSync(`convert ${JSON.stringify(b)} -resize ${A.width}x${A.height}! ${JSON.stringify(tmp)}`);
      B = PNG.sync.read(fs.readFileSync(tmp));
      fs.unlinkSync(tmp);
    }
    const {width, height} = A;
    const diff = new PNG({width, height});
    const n = pixelmatch(A.data, B.data, diff.data, width, height, {threshold:0.12});
    return 100 * n / (width*height);
  }catch(e){ return -1; }
}

(async () => {
  const slugs = process.argv.slice(2);
  const list = slugs.length ? slugs : fs.readdirSync('captures').filter(d=>fs.existsSync(path.join('captures',d,'screenshot-desktop.png')));
  const results = [];
  for(const slug of list){
    const url = CLONE + slugToPath(slug);
    // recapture clone via capture.js
    try{ execSync(`node capture.js --live ${JSON.stringify(url)} --slug ${JSON.stringify(slug)} --outbase clone_shots --nowarm`, {stdio:'ignore', env:{...process.env, PLAYWRIGHT_BROWSERS_PATH:'/opt/pw-browsers'}}); }
    catch(e){ console.log('clone capture failed', slug, e.message); }
    for(const tag of ['desktop','mobile']){
      const oDir = path.join('captures', slug), cDir = path.join('clone_shots', slug);
      const segs = fs.existsSync(oDir) ? fs.readdirSync(oDir).filter(f=>new RegExp(`screenshot-${tag}-\\d+\\.png`).test(f)).sort() : [];
      const diffs = [];
      for(const s of segs){
        const a = path.join(oDir, s), b = path.join(cDir, s);
        if(fs.existsSync(b)){ const d = diffPng(a,b); if(d>=0) diffs.push(d); }
      }
      if(diffs.length){
        const mean = diffs.reduce((x,y)=>x+y,0)/diffs.length, max = Math.max(...diffs);
        results.push({slug, tag, segs:diffs.length, mean:+mean.toFixed(3), max:+max.toFixed(3)});
      } else {
        results.push({slug, tag, segs:0, mean:-1, max:-1});
      }
    }
    const d = results.filter(r=>r.slug===slug);
    console.log(slug.padEnd(52), d.map(r=>`${r.tag}:${r.mean}%(max${r.max},n${r.segs})`).join('  '));
  }
  fs.writeFileSync('compare_results.json', JSON.stringify(results,null,1));
  const hi = results.filter(r=>r.mean>2);
  console.log('\n=== pages with mean diff > 2% ===');
  hi.forEach(r=>console.log(' ', r.slug, r.tag, r.mean+'%'));
  console.log(hi.length? '' : ' none');
})();
