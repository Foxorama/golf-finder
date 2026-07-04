// Unit tests for the pure AURORA-CORE visibility geometry (centred-dipole model), run
// against the live code sliced out of index.html. Regression guard for the aurora globe's
// three visibility lines + hotspot gating — the physics behind what the map draws.
import { ok, eq, close } from './assert.mjs';
import { loadAuroraCore } from './core.mjs';

const A = loadAuroraCore();

// Well-known southern sites (geographic lat, lon).
const HOBART=[-42.88,147.33], BRISBANE=[-27.47,153.03], DUNEDIN=[-45.87,170.50];

export const tests = {
  'geomagLat is negative in the south and ranks sites correctly'(){
    const h=A.geomagLat(...HOBART), b=A.geomagLat(...BRISBANE);
    ok(h<0 && b<0, 'southern sites are magnetically southern');
    ok(Math.abs(h)>Math.abs(b), 'Hobart sits at higher magnetic latitude than Brisbane');
    close(h,-49.7,1.0,'Hobart geomag lat');
    close(b,-33.8,1.0,'Brisbane geomag lat');
  },
  'auroraMagLats: lines widen equatorward as Kp rises'(){
    const q=A.auroraMagLats(0), s=A.auroraMagLats(9);
    close(q.oval,66.5,0.01); close(q.eye,60.5,0.01); close(q.cam,56.5,0.01);
    close(s.oval,48.05,0.01); close(s.eye,42.05,0.01); close(s.cam,38.05,0.01);
    ok(q.oval>q.eye && q.eye>q.cam, 'overhead line is poleward of eye, eye poleward of camera');
    ok(s.cam<q.cam, 'camera line reaches further equatorward at higher Kp');
  },
  'auroraReaches: reachability is monotonic in Kp and ranks sites'(){
    eq(A.auroraReaches(...BRISBANE,3,'cam'), false, 'Brisbane not camera-visible at Kp3');
    eq(A.auroraReaches(...HOBART,6,'cam'),  true,  'Hobart camera-visible at Kp6');
    // once reachable, staying/raising Kp keeps it reachable
    let reached=false;
    for(let k=0;k<=9;k++){ const r=A.auroraReaches(...DUNEDIN,k,'cam'); if(reached) ok(r,'monotonic reach'); if(r) reached=true; }
    ok(reached,'Dunedin becomes reachable somewhere in 0..9');
  },
  'auroraContour is a true constant-geomag-latitude curve'(){
    for(const L of [45,55,66]){
      const pts=A.auroraContour(L,120);
      eq(pts.length,121,'closed loop has steps+1 points');
      close(pts[0][0],pts[pts.length-1][0],1e-6,'loop closes in lat');
      close(pts[0][1],pts[pts.length-1][1],1e-6,'loop closes in lon');
      let maxDev=0; for(const [la,lo] of pts) maxDev=Math.max(maxDev, Math.abs(A.geomagLat(la,lo)-(-L)));
      close(maxDev,0,0.01,`contour L=${L} holds constant geomag latitude`);
    }
  },
  'auroraLimitLat marches north with Kp and lands on the line'(){
    const l2=A.auroraLimitLat(2,147,'cam'), l8=A.auroraLimitLat(8,147,'cam');
    ok(l8>l2, 'higher Kp reaches a more northern (less negative) latitude');
    // the returned latitude sits on the camera line: geomagLat ≈ -cam
    const cam=A.auroraMagLats(6).cam;
    close(A.geomagLat(A.auroraLimitLat(6,147,'cam'),147), -cam, 0.05, 'limit lat lies on the camera contour');
  },
  'auroraNeedKp: ranks sites and clamps to 0..9'(){
    const nh=A.auroraNeedKp(...HOBART), nb=A.auroraNeedKp(...BRISBANE);
    ok(nh<=nb, 'Hobart needs no more Kp than Brisbane');
    ok(nh>=0 && nb<=9, 'clamped into range');
    close(nh,5,1,'Hobart naked-eye threshold ~Kp 5');
  },
};
