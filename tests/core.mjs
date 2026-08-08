// Loads the pure PLAY-STATS-CORE region out of index.html and evals it in an isolated
// Node vm context, returning the exported functions. This is how the test harness checks
// the stats engine without a browser: the core references no DOM / localStorage / app
// globals, so it runs standalone (see the markers + contract in index.html).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export function readIndex(){ return readFileSync(join(ROOT,'index.html'),'utf8'); }

const EXPORTS = ['psGirFromScore','psFirFromLie','psClassifyMiss','psBallsLostFromPens',
                 'psMean','psStdev','psTrimmedMean','psPct','psAggregate'];

export function loadStatsCore(){
  const html = readIndex();
  const s = html.indexOf('PLAY-STATS-CORE-START');
  const e = html.indexOf('PLAY-STATS-CORE-END');
  if(s<0||e<0) throw new Error('PLAY-STATS-CORE markers not found in index.html');
  const code = html.slice(html.indexOf('\n',s)+1, html.lastIndexOf('\n',e));
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(code + `\nthis.__exports={${EXPORTS.join(',')}};`, sandbox, {filename:'play-stats-core'});
  return sandbox.__exports;
}

// Loads the pure AURORA-CORE region (centred-dipole visibility geometry) and evals it in
// a Node vm, shimming the two things it needs from the app: the RAD/DEG constants and a
// bare `window` object for the _dipF memo cache.
const AURORA_EXPORTS = ['GEOMAG_POLE','geomagLat','auroraMagLats','auroraReaches',
                        'auroraContour','auroraLimitLat','auroraNeedKp'];
export function loadAuroraCore(){
  const html = readIndex();
  const s = html.indexOf('AURORA-CORE-START');
  const e = html.indexOf('AURORA-CORE-END');
  if(s<0||e<0) throw new Error('AURORA-CORE markers not found in index.html');
  const code = html.slice(html.indexOf('\n',s)+1, html.lastIndexOf('\n',e));
  const preamble = 'const RAD=Math.PI/180, DEG=180/Math.PI; var window={};\n';
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(preamble + code + `\nthis.__exports={${AURORA_EXPORTS.join(',')}};`, sandbox, {filename:'aurora-core'});
  return sandbox.__exports;
}

// Loads the pure ORRERY-CORE region (heliocentric Kepler propagation for the solar-system
// tracker) and evals it in a Node vm, shimming RAD/DEG like the aurora core.
const ORRERY_EXPORTS = ['ORR_K','orrAnom','orbPosAt','orbPathGeo','probePosAt'];
export function loadOrreryCore(){
  const html = readIndex();
  const s = html.indexOf('ORRERY-CORE-START');
  const e = html.indexOf('ORRERY-CORE-END');
  if(s<0||e<0) throw new Error('ORRERY-CORE markers not found in index.html');
  const code = html.slice(html.indexOf('\n',s)+1, html.lastIndexOf('\n',e));
  const preamble = 'const RAD=Math.PI/180, DEG=180/Math.PI;\n';
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(preamble + code + `\nthis.__exports={${ORRERY_EXPORTS.join(',')}};`, sandbox, {filename:'orrery-core'});
  return sandbox.__exports;
}

// Loads the pure WIND-CORE region (shear profile, circular stats, swirl classification and
// the wind-vs-aim maths behind the full-screen compass). Fully self-contained — no shims.
const WIND_EXPORTS = ['WC_RUNGS','wcAng','wcAngDiff','wcCircMean','wcCircSpread','wcShear','wcSpeedAt',
                      'wcDirAt','wcProfile','wcBeaufort','wcPoint16','wcSwirl','wcAimCls','wcComponents',
                      'wcPlaysPct','wcAirCarryPct'];
// Loads the resume-round slug resolution + draft scan. Not pure — it reads COURSE_PLAY and
// localStorage — so both are injected as stubs, which is the point: the logic worth guarding is
// what it does with awkward DATA (layout slugs, empty drafts, a course that has been removed).
export function loadResumeCore(coursePlay, store){
  const html = readIndex();
  const s = html.indexOf('RESUME-CORE-START');
  const e = html.indexOf('RESUME-CORE-END');
  if(s<0||e<0) throw new Error('RESUME-CORE markers not found in index.html');
  const code = html.slice(html.indexOf('\n', s) + 1, html.lastIndexOf('\n', e));
  const localStorage = {
    get length(){ return Object.keys(store).length; },
    key(i){ return Object.keys(store)[i]; },
    getItem(k){ return k in store ? store[k] : null; },
    setItem(k, v){ store[k] = String(v); },
    removeItem(k){ delete store[k]; },
  };
  const sandbox = { COURSE_PLAY: coursePlay, localStorage, Date, Object, JSON };
  vm.createContext(sandbox);
  vm.runInContext(code + '\nthis.__exports={_playCourseForSlug,_activeRoundDraft};', sandbox, {filename:'resume-core'});
  return sandbox.__exports;
}

export function loadWindCore(){
  const html = readIndex();
  const s = html.indexOf('WIND-CORE-START');
  const e = html.indexOf('WIND-CORE-END');
  if(s<0||e<0) throw new Error('WIND-CORE markers not found in index.html');
  const code = html.slice(html.indexOf('\n',s)+1, html.lastIndexOf('\n',e));
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(code + `\nthis.__exports={${WIND_EXPORTS.join(',')}};`, sandbox, {filename:'wind-core'});
  return sandbox.__exports;
}

// Extract every inline (non-src) <script> body from index.html — used by the syntax test.
export function inlineScripts(){
  const html = readIndex();
  const out = []; const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi; let m;
  while((m = re.exec(html))){ if(/\bsrc\s*=/.test(m[1])) continue; out.push(m[2]); }
  return out;
}
