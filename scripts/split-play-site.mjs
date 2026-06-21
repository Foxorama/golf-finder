// Split a multi-course OSM golf site (e.g. 2x18 sharing refs 1..18) into per-course
// OSM-geom files, ready for build-play-course.mjs. Routing-aware: assigns the K holes
// that share each ref to K courses by DP minimising consecutive green->tee gaps.
// Usage: node split-play-site.mjs <osm-geom.json> <outPrefix>   (writes <outPrefix>_A.json, _B.json)
import fs from 'fs';
const [,, osmPath, outPrefix] = process.argv;
const r = JSON.parse(fs.readFileSync(osmPath,'utf8').replace(/^﻿/,''));
const els = r.elements;
const R=6371000, rad=Math.PI/180;
const hav=(a,b,c,d)=>{const dla=(c-a)*rad,dlo=(d-b)*rad;const h=Math.sin(dla/2)**2+Math.cos(a*rad)*Math.cos(c*rad)*Math.sin(dlo/2)**2;return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));};
const perp=(p,a,b)=>{const lat0=a[0]*rad,kx=111320*Math.cos(lat0),ky=110540;const px=(p[1]-a[1])*kx,py=(p[0]-a[0])*ky,bx=(b[1]-a[1])*kx,by=(b[0]-a[0])*ky;const L=bx*bx+by*by;if(L===0)return Math.hypot(px,py);const t=Math.max(0,Math.min(1,(px*bx+py*by)/L));return Math.hypot(px-t*bx,py-t*by);};
const ptsOf=e=>(e.geometry||[]).filter(x=>x).map(x=>[+x.lat,+x.lon]);
const cenOf=pts=>{let la=0,lo=0;for(const p of pts){la+=p[0];lo+=p[1];}return [la/pts.length,lo/pts.length];};

const holes = els.filter(e=>e.type==='way'&&e.tags&&e.tags.golf==='hole'&&e.geometry&&+e.tags.ref>=1)
  .map(e=>({el:e, ref:+e.tags.ref, pts:ptsOf(e)}));
const greenCens = els.filter(e=>e.type==='way'&&e.tags&&e.tags.golf==='green'&&e.geometry).map(e=>cenOf(ptsOf(e)));
// orient each hole tee->green
for(const h of holes){
  const a=h.pts[0], b=h.pts[h.pts.length-1];
  let bA=1e9,bB=1e9;
  for(const g of greenCens){ const da=hav(a[0],a[1],g[0],g[1]); if(da<bA)bA=da; const db=hav(b[0],b[1],g[0],g[1]); if(db<bB)bB=db; }
  if(bB<=bA){ h.tee=a; h.green=b; } else { h.tee=b; h.green=a; }
}
const byRef={}; for(const h of holes){ (byRef[h.ref]=byRef[h.ref]||[]).push(h); }
const refs=Object.keys(byRef).map(Number).sort((a,b)=>a-b);
const K=Math.max(...refs.map(rf=>byRef[rf].length));
console.log('refs',refs.join(','),'K=',K);
for(const rf of refs) if(byRef[rf].length!==2){ console.log('  ref',rf,'has',byRef[rf].length,'holes (expected 2)'); }
if(K!==2){ console.error('This splitter handles K=2 only; K='+K); process.exit(1); }

const gap=(hg,ht)=>hav(hg.green[0],hg.green[1],ht.tee[0],ht.tee[1]);
const n=refs.length;
const dp=Array.from({length:n},()=>[Infinity,Infinity]);
const bk=Array.from({length:n},()=>[-1,-1]);
dp[0][0]=0; dp[0][1]=0;
for(let i=1;i<n;i++){
  const prev=byRef[refs[i-1]], cur=byRef[refs[i]];
  for(let s=0;s<2;s++) for(let p=0;p<2;p++){
    const c=dp[i-1][p]+gap(prev[p],cur[s])+gap(prev[1-p],cur[1-s]);
    if(c<dp[i][s]){ dp[i][s]=c; bk[i][s]=p; }
  }
}
let s=dp[n-1][0]<=dp[n-1][1]?0:1;
const stateAt=Array(n);
for(let i=n-1;i>=0;i--){ stateAt[i]=s; if(i>0)s=bk[i][s]; }
const A=[],B=[];
for(let i=0;i<n;i++){ const grp=byRef[refs[i]], st=stateAt[i]; A.push(grp[st]); B.push(grp[1-st]); }
const totGap=arr=>{ let t=0; for(let i=1;i<arr.length;i++) t+=gap(arr[i-1],arr[i]); return Math.round(t); };
console.log('courseA total green->tee gap:',totGap(A),'m   courseB:',totGap(B),'m');
// baseline if mixed (keep grp[0] for A always): show contrast
const A0=refs.map(rf=>byRef[rf][0]); console.log('(naive ref[0] split gap:',totGap(A0),'m)');

// assign non-hole features to nearest course by perp-distance to nearest hole centreline
const otherEls = els.filter(e=>e.type==='way'&&e.tags&&e.tags.golf&&e.tags.golf!=='hole'&&e.geometry);
function nearestCourse(pts){
  const c=cenOf(pts);
  let dA=1e9,dB=1e9;
  for(const h of A) for(let i=0;i<h.pts.length-1;i++){ const d=perp(c,h.pts[i],h.pts[i+1]); if(d<dA)dA=d; }
  for(const h of B) for(let i=0;i<h.pts.length-1;i++){ const d=perp(c,h.pts[i],h.pts[i+1]); if(d<dB)dB=d; }
  return dA<=dB?'A':'B';
}
const featA=[],featB=[];
for(const e of otherEls){ (nearestCourse(ptsOf(e))==='A'?featA:featB).push(e); }
function write(name,holesArr,featArr){
  const elements=holesArr.map(h=>h.el).concat(featArr);
  const p=outPrefix+'_'+name+'.json';
  fs.writeFileSync(p,JSON.stringify({elements}));
  const greens=featArr.filter(e=>e.tags.golf==='green').length;
  const fair=featArr.filter(e=>e.tags.golf==='fairway').length;
  console.log(name,'->',p,' holes='+holesArr.length,'greens='+greens,'fairways='+fair,'feats='+featArr.length);
  // print refs with tee/green coords for inspection
  for(const h of holesArr.sort((a,b)=>a.ref-b.ref)){
    const len=Math.round(hav(h.tee[0],h.tee[1],h.green[0],h.green[1]));
    console.log('   ref',String(h.ref).padStart(2),'len~'+len+'m','tee',h.tee.map(x=>x.toFixed(5)).join(','));
  }
}
write('A',A,featA);
write('B',B,featB);
