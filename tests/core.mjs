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

// Extract every inline (non-src) <script> body from index.html — used by the syntax test.
export function inlineScripts(){
  const html = readIndex();
  const out = []; const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi; let m;
  while((m = re.exec(html))){ if(/\bsrc\s*=/.test(m[1])) continue; out.push(m[2]); }
  return out;
}
