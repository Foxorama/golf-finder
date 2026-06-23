// Minimal zero-dependency test runner. Discovers every *.test.mjs in this folder, runs the
// functions exported on its `tests` object, and reports. Exit code 1 on any failure (so CI
// fails the PR). Run with the portable Node:
//   "%LOCALAPPDATA%\gf-node\node-v24.17.0-win-x64\node.exe" tests/run.mjs
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(dir).filter(f => f.endsWith('.test.mjs')).sort();

let pass = 0, fail = 0; const failures = [];
for(const f of files){
  let mod;
  try{ mod = await import(pathToFileURL(join(dir,f)).href); }
  catch(e){ fail++; failures.push(`${f} (load)\n    ${e.stack||e.message}`); process.stdout.write('E'); continue; }
  for(const [name,fn] of Object.entries(mod.tests||{})){
    try{ await fn(); pass++; process.stdout.write('.'); }
    catch(e){ fail++; failures.push(`${f} › ${name}\n    ${e.message}`); process.stdout.write('x'); }
  }
}
console.log(`\n\n${pass} passed, ${fail} failed across ${files.length} file(s)`);
if(failures.length){ console.log('\nFailures:\n\n' + failures.join('\n\n')); process.exit(1); }
