const {PNG}=require('pngjs'); const fs=require('fs'); const pm=require('pixelmatch');
function d(a,b){ let A=PNG.sync.read(fs.readFileSync(a)), B=PNG.sync.read(fs.readFileSync(b));
  const {width,height}=A; const o=new PNG({width,height}); const n=pm(A.data,B.data,o.data,width,height,{threshold:0.1});
  fs.writeFileSync('/tmp/segdiff_out.png', PNG.sync.write(o)); return (100*n/(width*height)).toFixed(2); }
console.log('about-us desktop seg1 diff:', d('captures/about-us/screenshot-desktop-01.png','clone_shots/about-us/screenshot-desktop-01.png')+'%');
