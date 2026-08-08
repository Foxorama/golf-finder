// Sync guard for the test/demo hub (test.html).
//
// The hub never duplicates app logic — it drives the REAL app purely through its public
// test hooks: URL params (?time/?wx/?loader/?loaderhold/?ldhole/?yorb/?playshead/?playstail/?wind/?aim),
// live console helpers (setTime/setWx/setWind/setAim/toggleCompass) and the loader power-up form classes.
// That keeps the hub thin, but it can silently rot: if index.html renames or drops a hook, the
// hub's button just does nothing — no error, no test failure, until someone notices in person.
//
// This suite is the contract. It fails loudly the moment the app and the hub drift, naming
// exactly what to update. When you add a NEW app test hook (a ?param, a setX() helper, a new
// ?wx condition, a loader variant…), wire a hub control for it AND extend the relevant list
// below. See the `keep-test-hub-in-sync` skill and the CLAUDE.md "test.html" bullet.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readIndex } from './core.mjs';
import { ok, deepEq } from './assert.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const readHub = () => readFileSync(join(ROOT, 'test.html'), 'utf8');

// keys of the weather map inside `window.setWx=(v)=>{const m={clear:'Clear',…}}`
function appWxKeys(html){
  const m = html.match(/window\.setWx=\([^)]*\)=>\{const m=\{([^}]*)\}/);
  ok(m, 'could not find the setWx weather map in index.html (did setWx change shape?)');
  return [...m[1].matchAll(/([a-z]+):'/g)].map(x => x[1]).sort();
}
// keys (2nd tuple element) of the hub's `const WX=[['Live',null],['Clear','clear'],…]`
function hubWxKeys(html){
  const m = html.match(/const WX=\[([\s\S]*?)\];/);
  ok(m, 'could not find the WX array in test.html');
  return [...m[1].matchAll(/'([a-z]+)'\s*\]/g)].map(x => x[1]).sort();
}

export const tests = {
  // Strongest invariant: the hub's weather buttons === the app's conditions, both ways.
  // Add a condition to setWx and this fails until you add the matching hub button (and vice-versa).
  'hub weather buttons match the app weather conditions exactly'(){
    deepEq(hubWxKeys(readHub()), appWxKeys(readIndex()),
      'test.html WX keys vs index.html setWx keys — add the new/removed condition on the other side');
  },

  // Every URL hook the hub composes into a launch must still be parsed by the app.
  'app still honours every URL hook the hub sends'(){
    const i = readIndex();
    for(const tok of ["get('time')", "get('wx')", 'loader=(day|night)', 'loaderhold=1',
                      'ldhole=(hole|miss)', 'yorb=(ufo|normal)', 'playshead', 'playstail', '_ldForceHole',
                      "get('wind')", "get('aim')"])
      ok(i.includes(tok), `index.html no longer reads "${tok}" — the hub control that sends it is now dead; update both`);
  },

  // The hub also drives the app LIVE (same-origin) via these globals.
  'app still exposes the live console helpers the hub drives'(){
    const i = readIndex();
    for(const tok of ['function setTime', 'window.setWx=', 'toggleCompass', 'window.setWind=', 'window.setAim ='])
      ok(i.includes(tok), `index.html no longer defines "${tok}" — the hub's live driving breaks`);
  },

  // The Force-hole-in-one control advertises this exact ladder; keep the classes in step.
  'loader power-up forms the hub advertises still exist'(){
    const i = readIndex();
    for(const cls of ['ssj2', 'ssjb', 'ssjui', 'ssjl'])
      ok(i.includes(cls), `loader form class "${cls}" missing from index.html — the hub note lists it`);
  },

  // Guard the hub side too: it must still actually emit the hooks it documents.
  'hub still sends the loader/plays hooks it documents'(){
    const h = readHub();
    for(const tok of ['loader=', 'loaderhold=1', 'ldhole=hole', 'yorb=', 'playshead', 'playstail',
                      "'wind='", 'setWind', "'aim='", 'setAim'])
      ok(h.includes(tok), `test.html no longer sends "${tok}"`);
  },
};
