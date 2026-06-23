// Guard rail: every inline <script> in index.html must parse. Catches the stray brace /
// bad template literal / TDZ-shaped edits that otherwise only show up as a stuck loader.
import vm from 'node:vm';
import { inlineScripts } from './core.mjs';

export const tests = {
  'every inline <script> parses'(){
    const scripts = inlineScripts();
    if(!scripts.length) throw new Error('no inline scripts found — extraction broke');
    scripts.forEach((code,i)=>{
      try{ new vm.Script(code, {filename:`inline-script-${i}`}); }
      catch(e){ throw new Error(`inline script #${i} failed to parse: ${e.message}`); }
    });
  },
};
