// Unit tests for WIND-CORE — the pure maths behind the full-screen wind compass
// (🧭 header button → openWindCompass). The panel itself is DOM/canvas, but everything a
// player actually reads off it — the 25 m / 50 m rungs, "is it swirling?", the head/cross
// split against your aim line — is decided here, so it's all checkable from Node.
import { loadWindCore } from './core.mjs';
import { ok, eq, close } from './assert.mjs';

const W = loadWindCore();

export const tests = {
  'angles wrap and diff the short way'(){
    eq(W.wcAng(-10), 350);
    eq(W.wcAng(370), 10);
    eq(W.wcAngDiff(10, 350), 20, 'across north');
    eq(W.wcAngDiff(350, 10), -20, 'across north, other way');
    eq(W.wcAngDiff(90, 90), 0);
  },

  'circular mean survives the north wrap that a plain average breaks on'(){
    // 350° and 10° average to 0°, not to 180° — this is the whole point of a vector mean
    close(W.wcCircMean([350, 10]), 0, 0.001, 'mean across north');
    close(W.wcCircMean([80, 100]), 90, 0.001);
    eq(W.wcCircMean([]), null, 'no data → null, never a fake bearing');
  },

  'circular spread separates a locked-in wind from a wandering one'(){
    close(W.wcCircSpread([200, 200, 200, 200]), 0, 0.001, 'identical readings = zero spread');
    const tight = W.wcCircSpread([198, 200, 202, 199]);
    const loose = W.wcCircSpread([160, 200, 240, 190]);
    ok(tight < 3, `tight set should read steady, got ${tight}`);
    ok(loose > 20, `wandering set should read unsettled, got ${loose}`);
    ok(loose < 82, 'spread is capped at the uniform-random limit');
    eq(W.wcCircSpread([200]), 0, 'a single reading has no spread');
  },

  'shear exponent is fitted from the two modelled levels and clamped'(){
    // v80 = v10·8^0.14 is the classic open-country profile
    close(W.wcShear(10, 10 * Math.pow(8, 0.14)), 0.14, 0.001);
    eq(W.wcShear(0.2, 30), 0.14, 'near-calm surface would explode the ratio → safe default');
    eq(W.wcShear(20, 10), 0, 'wind weaker aloft clamps at zero, never negative');
    ok(W.wcShear(1, 60) <= 0.6, 'extreme ratios clamp at 0.6');
  },

  'the 10/25/50 ladder climbs and interpolates direction between the model levels'(){
    const p = W.wcProfile(20, 180, 34, 200);
    eq(p.length, 3);
    eq(p[0].z, 10); eq(p[1].z, 25); eq(p[2].z, 50);
    close(p[0].spd, 20, 0.001, '10 m is the model value, untouched');
    ok(p[1].spd > p[0].spd && p[2].spd > p[1].spd, 'speed increases with height');
    ok(p[2].spd < 34, 'never overshoots the 80 m anchor');
    close(p[0].dir, 180, 0.001);
    ok(p[1].dir > 180 && p[1].dir < p[2].dir && p[2].dir < 200, 'direction veers monotonically toward the 80 m value');
    eq(p[0].model, true, '10 m is flagged as modelled…');
    eq(p[1].model, false, '…and the interpolated rungs are not (the UI marks them "est")');
  },

  'a missing 80 m level degrades to a constant-direction profile, not a crash'(){
    const p = W.wcProfile(15, 90, null, null);
    close(p[2].dir, 90, 0.001, 'no upper level → no invented veer');
    ok(p[2].spd > p[0].spd, 'still climbs on the default open-country exponent');
    const none = W.wcProfile(null, null, null, null);
    eq(none[0].spd, null); eq(none[0].dir, null);
  },

  'beaufort and the 16-point rose name things correctly'(){
    eq(W.wcBeaufort(0).name, 'Calm');
    eq(W.wcBeaufort(15).n, 3);
    eq(W.wcBeaufort(200).name, 'Hurricane');
    eq(W.wcBeaufort(null).name, '–');
    eq(W.wcPoint16(0), 'N'); eq(W.wcPoint16(359), 'N');
    eq(W.wcPoint16(90), 'E'); eq(W.wcPoint16(292.5), 'WNW');
  },

  'swirl: no data never fabricates a verdict'(){
    // An offline fetch must not read as "STEADY — trust the number": that's the one wrong
    // answer a player would actually act on.
    eq(W.wcSwirl({ spd: null, timeSpread: 0, twist: 0, gustFactor: 1 }).tag, 'NO READING');
    eq(W.wcSwirl({}).tag, 'NO READING');
  },

  'swirl: calm short-circuits, steady stays steady, chaos reads swirling'(){
    eq(W.wcSwirl({ spd: 2, timeSpread: 60, twist: 40, gustFactor: 3 }).tag, 'CALM',
       'under ~4 km/h nothing else means anything');
    eq(W.wcSwirl({ spd: 18, timeSpread: 4, twist: 5, gustFactor: 1.15 }).tag, 'STEADY');
    eq(W.wcSwirl({ spd: 18, timeSpread: 55, twist: 35, gustFactor: 2.1 }).tag, 'SWIRLING');
    const mid = W.wcSwirl({ spd: 18, timeSpread: 26, twist: 14, gustFactor: 1.5 });
    eq(mid.tag, 'SHIFTY');
    ok(mid.score > 0 && mid.score < 1, 'score stays normalised');
    // the copy must name the loudest signal, so the player knows what to distrust
    ok(W.wcSwirl({ spd: 18, timeSpread: 60, twist: 2, gustFactor: 1 }).why.includes('shift'));
    ok(W.wcSwirl({ spd: 18, timeSpread: 5, twist: 2, gustFactor: 2.4 }).why.includes('gust'));
    ok(W.wcSwirl({ spd: 18, timeSpread: 5, twist: 40, gustFactor: 1 }).why.includes('twist'));
  },

  'aim class is the whole compass\'s colour, and it splits where the hole map splits'(){
    // Directions are where the wind comes FROM, so aiming INTO the source is the headwind.
    eq(W.wcAimCls(0, 0), 'hurt', 'wind out of the north, played north, is in your face');
    eq(W.wcAimCls(180, 0), 'help', 'wind out of the south, played north, is at your back');
    eq(W.wcAimCls(90, 0), 'cross', 'wind out of the east, played north, is across');
    eq(W.wcAimCls(270, 0), 'cross', 'and so is the other way across');
    // The boundary is windVsHole's ±0.34 cosine, i.e. ~70.1deg off the line. Either side of it.
    const edge = Math.acos(0.34) * 180 / Math.PI;
    eq(W.wcAimCls(180 - (edge - 1), 0), 'help', 'just inside the downwind cone still helps');
    eq(W.wcAimCls(180 - (edge + 1), 0), 'cross', 'just outside it is a crosswind');
    eq(W.wcAimCls(edge - 1, 0), 'hurt', 'just inside the into-wind cone hurts');
    eq(W.wcAimCls(edge + 1, 0), 'cross', 'just outside it is a crosswind');
    // Rotating the aim rotates the verdict — the point of colouring by aim at all. One wind,
    // opposite lines, opposite colours: the case a speed-only dial painted identically.
    eq(W.wcAimCls(180, 0), 'help', 'played north, this wind helps');
    eq(W.wcAimCls(180, 180), 'hurt', 'turn around and the same wind is in your face');
    // No line to judge against must never invent one; the UI falls back to strength bands.
    eq(W.wcAimCls(180, null), null, 'no aim → no verdict');
    eq(W.wcAimCls(null, 0), null, 'no wind direction → no verdict');
  },

  'wcComponents agrees with wcAimCls, so the tag and the colour cannot diverge'(){
    for(const from of [0, 37, 90, 143, 180, 226, 271, 318]) for(const aim of [0, 55, 180, 300]){
      eq(W.wcComponents(from, aim, 15).cls, W.wcAimCls(from, aim),
         'components/class disagree at from=' + from + ' aim=' + aim);
    }
  },

  'wind vs aim matches the hole-map convention exactly'(){
    // Wind FROM the north while you aim south → it blows at your back: downwind.
    const dw = W.wcComponents(0, 180, 20);
    eq(dw.tag, 'DOWNWIND'); close(dw.help, 20, 0.001); close(dw.cross, 0, 0.001);
    // Wind FROM the south while you aim south → straight into it.
    const iw = W.wcComponents(180, 180, 20);
    eq(iw.tag, 'INTO WIND'); close(iw.help, -20, 0.001);
    // Wind FROM the east, aiming north → blows toward the west, i.e. right → left.
    const cw = W.wcComponents(90, 0, 20);
    eq(cw.tag, 'CROSSWIND'); close(cw.help, 0, 0.001); close(cw.cross, -20, 0.001);
    eq(cw.crossTxt, 'right → left');
    eq(W.wcComponents(null, 0, 20), null, 'no direction → no reading, never a guess');
  },

  'plays-like percentage: headwind longer, tailwind shorter, capped'(){
    ok(W.wcPlaysPct(-30) > 0, 'a 30 km/h headwind plays longer');
    ok(W.wcPlaysPct(30) < 0, 'a 30 km/h tailwind plays shorter');
    close(W.wcPlaysPct(0), 0, 0.001);
    // headwind coefficient is the heavier one, same asymmetry as the Play rangefinder
    ok(Math.abs(W.wcPlaysPct(-20)) > Math.abs(W.wcPlaysPct(20)));
    ok(W.wcPlaysPct(-500) <= 40, 'capped at ±40%');
    eq(W.wcPlaysPct(null), null);
  },

  'air density nudges carry the right way'(){
    close(W.wcAirCarryPct(15, 1013.25, 0), 0, 0.15, 'ISA standard air is the zero point');
    ok(W.wcAirCarryPct(35, 1013.25, 50) > 0, 'hot thin air flies further');
    ok(W.wcAirCarryPct(2, 1030, 50) < 0, 'cold dense air flies shorter');
    ok(Math.abs(W.wcAirCarryPct(35, 1013.25, 50)) < 5, 'stays a nudge, not a fantasy');
    eq(W.wcAirCarryPct(null, 1013, 50), null);
  },
};
