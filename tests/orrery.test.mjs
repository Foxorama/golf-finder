// Unit tests for the pure ORRERY-CORE Kepler propagation (solar-system tracker), run
// against the live code sliced out of index.html. Regression guard for the maths behind
// the comet/asteroid paths, best-viewing segments and probe positions the tracker draws.
import { ok, eq, close } from './assert.mjs';
import { loadOrreryCore } from './core.mjs';

const O = loadOrreryCore();

// Real tracked objects (same elements as index.html): 10P/Tempel 2 + Apophis.
// tpd = days since J2000 of perihelion (10P: 2026-08-02 ≈ 9710; Apophis: 2025-02-13 ≈ 9175).
const TEMPEL2={q:1.421,e:0.5363,i:12.03,om:117.8,w:195.55,tpd:9710};
const APOPHIS={q:0.7461,e:0.1911,i:3.341,om:203.9,w:126.7,tpd:9175.3};
const mag=p=>Math.hypot(p.x,p.y,p.z);

export const tests = {
  'elliptic: r = q at perihelion, r = Q at aphelion'(){
    const a=TEMPEL2.q/(1-TEMPEL2.e), P=2*Math.PI/(O.ORR_K/Math.pow(a,1.5)); // period, days
    close(mag(O.orbPosAt(TEMPEL2,TEMPEL2.tpd)), TEMPEL2.q, 1e-6, 'perihelion distance');
    close(mag(O.orbPosAt(TEMPEL2,TEMPEL2.tpd+P/2)), a*(1+TEMPEL2.e), 1e-4, 'aphelion distance');
    close(P/365.25, 5.37, 0.05, '10P period ~5.37 years');
  },
  'elliptic: one full period returns to the same point'(){
    const a=TEMPEL2.q/(1-TEMPEL2.e), P=2*Math.PI/(O.ORR_K/Math.pow(a,1.5));
    const p0=O.orbPosAt(TEMPEL2,TEMPEL2.tpd+123), p1=O.orbPosAt(TEMPEL2,TEMPEL2.tpd+123+P);
    close(p0.x,p1.x,1e-6); close(p0.y,p1.y,1e-6); close(p0.z,p1.z,1e-6);
  },
  'a zero-inclination orbit stays in the ecliptic plane'(){
    const flat={q:1,e:0.3,i:0,om:40,w:70,tpd:0};
    for(const dt of [-300,0,55,200]) close(O.orbPosAt(flat,dt).z, 0, 1e-12, 'z stays 0');
  },
  'hyperbolic (interstellar-style): r = q at perihelion, grows on both branches'(){
    const isv={q:0.8,e:2.4,i:44,om:10,w:250,tpd:0};
    close(mag(O.orbPosAt(isv,0)), isv.q, 1e-6, 'hyperbolic perihelion');
    let prev=isv.q;
    for(const dt of [60,180,420,900]){
      const r=mag(O.orbPosAt(isv,dt));
      ok(r>prev, `outbound r grows (dt=${dt})`); prev=r;
      close(mag(O.orbPosAt(isv,-dt)), r, 1e-6, 'branches are symmetric in r');
    }
  },
  'near-parabolic (Barker): r = q at perihelion and recedes smoothly'(){
    const par={q:1.2,e:1.0,i:5,om:0,w:0,tpd:0};
    close(mag(O.orbPosAt(par,0)), par.q, 1e-6, 'parabolic perihelion');
    ok(mag(O.orbPosAt(par,400))>mag(O.orbPosAt(par,100)), 'receding after perihelion');
  },
  'orbPathGeo: closed ellipse for a bound orbit, clamped open curve past rmax'(){
    const path=O.orbPathGeo(TEMPEL2,120);
    eq(path.length,121);
    close(path[0].x,path[120].x,1e-9,'ellipse closes');   // full −π..π loop
    const far={q:1,e:3,i:0,om:0,w:0,tpd:0};
    for(const p of O.orbPathGeo(far,120,50)) ok(Math.hypot(p.x,p.y,p.z)<=50.5,'hyperbola clamped to rmax');
  },
  'Apophis is near 1 au from the Sun at the 2029 flyby date'(){
    // 2029-04-13 ≈ day 10695 since J2000. Earth is at ~1.003 au that week — the
    // pre-encounter elements must put Apophis at a Sun distance compatible with a
    // 32,000 km Earth pass (i.e. ~1 au, NOT out at aphelion or in at perihelion).
    close(mag(O.orbPosAt(APOPHIS,10695)), 1.0, 0.06, 'flyby heliocentric distance ~1 au');
  },
  'probePosAt: distance grows at v along the fixed direction'(){
    const v1={lon:256,lat:35,d0:172.6,t0d:9556,v:3.57/365.25};
    close(O.probePosAt(v1,9556).r, 172.6, 1e-9, 'reference distance at reference epoch');
    close(O.probePosAt(v1,9556+365.25).r, 172.6+3.57, 1e-9, 'one year on = +v·yr');
    const p=O.probePosAt(v1,9556), u=[p.x/p.r,p.y/p.r,p.z/p.r];
    close(u[2], Math.sin(35*Math.PI/180), 1e-9, 'direction holds the ecliptic latitude');
    const p2=O.probePosAt(v1,9556+900);
    close(p2.x/p2.r,u[0],1e-9,'direction is fixed as it recedes');
  },
};
