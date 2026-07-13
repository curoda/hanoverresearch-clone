const {PNG}=require('pngjs'); const fs=require('fs'); const pm=require('pixelmatch'); const path=require('path');
const slug=process.argv[2], tag=process.argv[3]||'desktop';
const oD=`captures/${slug}`, cD=`clone_shots/${slug}`;
const segs=fs.readdirSync(oD).filter(f=>new RegExp(`screenshot-${tag}-\\d+\\.png`).test(f)).sort();
for(const s of segs){
  const a=path.join(oD,s), b=path.join(cD,s);
  if(!fs.existsSync(b)){console.log(s,'no clone seg');continue;}
  let A=PNG.sync.read(fs.readFileSync(a)),B=PNG.sync.read(fs.readFileSync(b));
  if(A.width!==B.width||A.height!==B.height){console.log(s,'SIZE',A.width+'x'+A.height,'vs',B.width+'x'+B.height);continue;}
  const o=new PNG({width:A.width,height:A.height}); const n=pm(A.data,B.data,o.data,A.width,A.height,{threshold:0.12});
  console.log(s, (100*n/(A.width*A.height)).toFixed(1)+'%');
}
