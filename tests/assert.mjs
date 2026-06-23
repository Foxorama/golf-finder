// Tiny dependency-free assertion helpers for the Play test harness.
export function ok(c,m){ if(!c) throw new Error(m||'expected truthy'); }
export function eq(a,b,m){ if(a!==b) throw new Error(`${m?m+': ':''}expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
export function close(a,b,tol=0.01,m){ if(a==null||Math.abs(a-b)>tol) throw new Error(`${m?m+': ':''}expected ~${b}, got ${a}`); }
export function deepEq(a,b,m){ const A=JSON.stringify(a),B=JSON.stringify(b); if(A!==B) throw new Error(`${m?m+': ':''}expected ${B}, got ${A}`); }
