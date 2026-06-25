// ─────────────────────────────────────────────────────────────────────────────
// TEST-HUB SYNC GUARD — portable template (invariant #3 of TEST-HUB-STANDARD.md)
// ─────────────────────────────────────────────────────────────────────────────
//
// Copy this into a new project's test folder, rename to `test-hub.test.mjs` (or your
// harness's convention), and fill in the THREE project-specific blocks marked `FILL:`.
// It is written in golf-finder's zero-dependency, TEXT-MATCH style — it parses the app
// file and the hub file as strings, because a single-file no-build app can't be imported.
//
//   • If your project HAS a build/module system, replace the text matchers with an import
//     of your app's hook registry and assert the hub against that object instead. The
//     assertions — parity in BOTH directions — stay identical; only the source-of-truth
//     extraction changes. That is strictly more robust; prefer it when available.
//
// What it proves (and why it's the S+/A divider): the hub never re-implements app logic,
// it only POKES the app through public hooks. That keeps the hub thin but lets it rot
// silently — rename a hook in the app and the hub button just does nothing, no error. This
// guard fails loudly the moment the two drift, naming exactly what to update, so the rot
// can't reach a live demo. See standards/TEST-HUB-STANDARD.md and the keep-*-in-sync skill.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// ── tiny inline assert (drop if your harness already exports ok/deepEq) ──────────────
const ok      = (c, m) => { if (!c) throw new Error(m || 'expected truthy'); };
const deepEq  = (a, b, m) => { const A = JSON.stringify(a), B = JSON.stringify(b);
                               if (A !== B) throw new Error(`${m ? m + ': ' : ''}expected ${B}, got ${A}`); };

// ── FILL #1: where your two files live ───────────────────────────────────────────────
const ROOT     = join(dirname(fileURLToPath(import.meta.url)), '..');
const readApp  = () => readFileSync(join(ROOT, 'index.html'), 'utf8');   // FILL: the shipped app
const readHub  = () => readFileSync(join(ROOT, 'test.html'),  'utf8');   // FILL: the test/demo hub

// ── FILL #2: the hook contract — what the hub sends and the app must still honour ─────
// Each entry: a label, the token the APP must contain (its parser/definition), and the
// token the HUB must contain (where it emits/drives that hook). Both sides are guarded, so
// neither file can drop a hook without the other noticing.
const HOOKS = [
  // label                 appToken (parsed/defined in app)   hubToken (emitted/driven by hub)
  { label: 'scene time',  app: "get('time')",                hub: "time=" },
  { label: 'live setTime', app: 'function setTime',           hub: 'setTime(' },
  // FILL: one row per URL param, one per live console helper, one per feature flag the hub drives.
  // e.g. { label:'theme', app:"get('theme')", hub:'theme=' },
];

// ── FILL #3 (optional): an enumerated set that must match EXACTLY both ways ───────────
// Use this when the app defines a closed list (weather conditions, themes, locales) and the
// hub must surface every one — and no extras. Extract each side's keys with a regex tuned to
// your code, then deepEq them. Delete this block if your project has no such enumerated set.
function appEnumKeys(html) {
  // FILL: regex over the app's source-of-truth literal, e.g. the `setWx` map.
  const m = html.match(/SET_ENUM=\{([^}]*)\}/);
  ok(m, 'could not find the enumerated set in the app (did its shape change?)');
  return [...m[1].matchAll(/([a-z]+):/g)].map(x => x[1]).sort();
}
function hubEnumKeys(html) {
  // FILL: regex over the hub's button/option list for the same set.
  const m = html.match(/const ENUM=\[([\s\S]*?)\];/);
  ok(m, 'could not find the enumerated set in the hub');
  return [...m[1].matchAll(/'([a-z]+)'\s*\]/g)].map(x => x[1]).sort();
}

// ── the assertions (these stay the same across projects) ─────────────────────────────
export const tests = {
  // Direction A: the app still honours every hook the hub sends.
  'app still honours every hook the hub sends'() {
    const a = readApp();
    for (const h of HOOKS)
      ok(a.includes(h.app),
        `app no longer contains "${h.app}" (${h.label}) — the hub control that drives it is now dead; update both`);
  },

  // Direction B: the hub still actually emits/drives every hook it documents.
  'hub still sends every hook it documents'() {
    const h = readHub();
    for (const hook of HOOKS)
      ok(h.includes(hook.hub),
        `hub no longer sends "${hook.hub}" (${hook.label}) — it claims to support this hook but doesn't`);
  },

  // Strongest invariant (if you kept FILL #3): the enumerated set matches EXACTLY, both ways.
  // Add a value to the app and this fails until the hub has it — and vice-versa.
  'hub enumerated controls match the app set exactly'() {
    deepEq(hubEnumKeys(readHub()), appEnumKeys(readApp()),
      'hub option keys vs app set keys — add the new/removed value on the other side');
  },
};
