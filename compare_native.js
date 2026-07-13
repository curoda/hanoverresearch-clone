// compare_native.js — authoritative offset-tolerant comparison. Stitches the origin segments
// (captures/<slug>) and clone segments (clone_shots/<slug>) into full-page images IN MEMORY at
// native resolution, then for each horizontal band of the origin finds the best-matching vertical
// offset in the clone within a search window and reports the MIN diff %. This removes the
// accumulated-vertical-offset artifact that inflates naive fixed-position segment diffs on tall
// pages (see cloner-playbook). Operates on already-saved PNGs; does not recapture.
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch');

function stitch(dir, tag) {
  if (!fs.existsSync(dir)) return null;
  const segs = fs.readdirSync(dir).filter(f => new RegExp(`screenshot-${tag}-\\d+\\.png`).test(f)).sort();
  if (!segs.length) return null;
  const imgs = segs.map(s => PNG.sync.read(fs.readFileSync(path.join(dir, s))));
  const width = imgs[0].width;
  const height = imgs.reduce((a, i) => a + i.height, 0);
  const out = new PNG({ width, height });
  let y = 0;
  for (const im of imgs) { PNG.bitblt(im, out, 0, 0, im.width, im.height, 0, y); y += im.height; }
  return out;
}
// diff two equal-size row bands (RGBA buffers)
function bandDiff(aData, bData, width, bandH) {
  const diff = Buffer.alloc(width * bandH * 4);
  const n = pixelmatch(aData, bData, diff, width, bandH, { threshold: 0.12 });
  return 100 * n / (width * bandH);
}
function compareImgs(O, C) {
  const width = Math.min(O.width, C.width);
  const bandH = 300, step = 300, search = 120;
  const diffs = [];
  for (let y = 0; y + bandH <= O.height; y += step) {
    // origin band buffer
    const oBand = Buffer.alloc(width * bandH * 4);
    for (let r = 0; r < bandH; r++) O.data.copy(oBand, r * width * 4, (y + r) * O.width * 4, (y + r) * O.width * 4 + width * 4);
    // search best offset in clone
    let best = 100;
    for (let off = -search; off <= search; off += 6) {
      const cy = y + off;
      if (cy < 0 || cy + bandH > C.height) continue;
      const cBand = Buffer.alloc(width * bandH * 4);
      for (let r = 0; r < bandH; r++) C.data.copy(cBand, r * width * 4, (cy + r) * C.width * 4, (cy + r) * C.width * 4 + width * 4);
      const d = bandDiff(oBand, cBand, width, bandH);
      if (d < best) best = d;
      if (best < 0.05) break;
    }
    diffs.push(best);
  }
  return diffs;
}

(async () => {
  const slugs = process.argv.slice(2);
  const list = slugs.length ? slugs : fs.readdirSync('captures').filter(d => fs.existsSync(path.join('captures', d, 'screenshot-desktop.png')));
  const results = [];
  for (const slug of list) {
    const row = { slug };
    for (const tag of ['desktop', 'mobile']) {
      const O = stitch(path.join('captures', slug), tag);
      const C = stitch(path.join('clone_shots', slug), tag);
      if (!O || !C) { row[tag] = null; continue; }
      const diffs = compareImgs(O, C);
      const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      row[tag] = { mean: +mean.toFixed(3), max: +Math.max(...diffs).toFixed(3), bands: diffs.length, oH: O.height, cH: C.height };
    }
    results.push(row);
    const fmt = t => row[t] ? `${t}:${row[t].mean}%(max${row[t].max})` : `${t}:n/a`;
    console.log(slug.padEnd(52), fmt('desktop'), ' ', fmt('mobile'));
  }
  fs.writeFileSync('compare_native_results.json', JSON.stringify(results, null, 1));
  const bad = results.filter(r => (r.desktop && r.desktop.mean > 3) || (r.mobile && r.mobile.mean > 3));
  console.log('\n=== pages with offset-tolerant mean diff > 3% ===');
  bad.forEach(r => console.log(' ', r.slug, 'd:', r.desktop && r.desktop.mean, 'm:', r.mobile && r.mobile.mean));
  if (!bad.length) console.log('  none');
})();
