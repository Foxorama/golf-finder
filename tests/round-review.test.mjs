// Unit tests for the pure ROUND-REVIEW-CORE block — turning a SAVED round back into the
// hole-by-hole record the review screen draws, and merging two devices' backups. These guard
// the two things that silently destroy data if they go wrong: a round replayed from the wrong
// tee, and an import that throws away rounds it should have kept.
import { ok, eq, close, deepEq } from './assert.mjs';
import { loadReviewCore } from './core.mjs';

const R = loadReviewCore();

// A tiny 3-hole course + one round tracked on it. Coordinates are ~Brisbane, spaced so the
// leg distances are checkable by hand.
const HOLES = [
  { n:1, par:4, si:5, tee:[-27.5000,153.0000], cen:[-27.5000,153.0030], tees:{ white:[-27.5000,153.0000], red:[-27.5000,153.0010] } },
  { n:2, par:3, si:17, tee:[-27.5010,153.0000], cen:[-27.5010,153.0015] },
  { n:3, par:5, si:1,  tee:[-27.5020,153.0000], cen:[-27.5020,153.0045] },
];
function round(){
  return { v:3, id:11, slug:'demo', course:'Demo GC', par:12, date:'2026-06-01T04:00:00.000Z',
    scores:[4,4,6], gross:14, vsPar:2, putts:5, holesPlayed:3, courseHcp:10, net:12, stableford:8,
    holeStats:[
      { n:1,par:4,score:4,putts:2,fir:true, gir:true, miss:null,bunkers:0,penalties:0,ballsLost:0,driveM:200 },
      { n:2,par:3,score:4,putts:2,fir:null,gir:false,miss:'short',bunkers:1,penalties:0,ballsLost:0,driveM:null },
      { n:3,par:5,score:6,putts:1,fir:false,gir:false,miss:null,bunkers:0,penalties:1,ballsLost:1,driveM:210 },
    ],
    track:{
      shots:{ 1:[[-27.5000,153.0020],[-27.5000,153.0029]], 2:[[-27.5010,153.0014]] },
      clubs:{ 1:['Dr','9i'], 2:['8i'] },
      lies:{ 1:['fairway','green'], 2:['bunker'] },
      man:{ 1:[false,false] },
      pens:{ 3:['water'] },
      tee:{ 2:[-27.5010,153.0001] },
      teeSel:{ 1:'red' },
      putts:{ 1:2, 2:2, 3:1 },
      picked:{ 3:1 },
    } };
}

export const tests = {
  'rvDist is metres'(){
    close(R.rvDist([-27.5,153.0],[-27.5,153.0010]), 98.6, 1);   // 0.001° lng at -27.5°
    eq(R.rvDist(null,[0,0]), 0);
  },
  'rvTee prefers the saved GPS tee, then the played tee set, then the course tee'(){
    const t=round().track;
    deepEq(R.rvTee(HOLES[1],t), [-27.5010,153.0001], 'GPS/manual tee wins');
    deepEq(R.rvTee(HOLES[0],t), [-27.5000,153.0010], 'the red tee it was played off');
    deepEq(R.rvTee(HOLES[2],t), [-27.5020,153.0000], 'falls back to the course tee');
  },
  'rvLegs chains tee -> mark -> mark and carries each leg\'s club + lie'(){
    const t=round().track, legs=R.rvLegs(t.shots[1],HOLES[0].tee,t.clubs[1],t.lies[1],t.man[1]);
    eq(legs.length,2);
    eq(legs[0].tee,true); eq(legs[1].tee,false);
    eq(legs[0].club,'Dr'); eq(legs[0].lie,'fairway');
    eq(legs[1].club,'9i'); eq(legs[1].lie,'green');
    close(legs[0].d, 197.2, 1); close(legs[1].d, 88.7, 1);
    eq(R.rvLegs([[1,2]],null,null,null,null).length, 0, 'no tee ⇒ no invented distances');
    eq(R.rvLegs([],HOLES[0].tee).length, 0);
  },
  'rvHoleRows merges scores, holeStats and track into one row per hole'(){
    const rows=R.rvHoleRows(round(),HOLES);
    eq(rows.length,3);
    eq(rows[0].score,4); eq(rows[0].putts,2); eq(rows[0].vsPar,0); eq(rows[0].par,4); eq(rows[0].si,5);
    eq(rows[0].legs.length,2); eq(rows[0].teeKey,'red'); eq(rows[0].fir,true); eq(rows[0].gir,true);
    eq(rows[1].legs.length,1); eq(rows[1].legs[0].lie,'bunker');
    deepEq(rows[2].pens,['water']); eq(rows[2].penalties,1); eq(rows[2].picked,true);
    eq(rows[2].marks.length,0,'an untracked hole still gets its row');
  },
  'a legacy round with no track still resolves every hole'(){
    const r=round(); delete r.track; r.v=2;
    const rows=R.rvHoleRows(r,HOLES);
    eq(rows.length,3);
    eq(rows[0].score,4); eq(rows[0].putts,2,'putts fall back to holeStats');
    eq(rows[0].marks.length,0); eq(rows[0].legs.length,0);
    eq(R.rvHasShots(r), false);
    eq(R.rvHasShots(round()), true);
  },
  'rvSummary rolls the rows up'(){
    const s=R.rvSummary(R.rvHoleRows(round(),HOLES));
    eq(s.holes,3); eq(s.gross,14); eq(s.par,12); eq(s.vsPar,2);
    eq(s.putts,5); eq(s.puttHoles,3); eq(s.penalties,1);
    eq(s.marks,3); eq(s.tracked,2);
    eq(s.fir.of,2); eq(s.fir.hit,1);
    eq(s.gir.of,3); eq(s.gir.hit,1);
    const empty=R.rvSummary([]); eq(empty.holes,0); eq(empty.vsPar,0);
  },
  'rvMergeRounds unions two devices and never duplicates a round'(){
    const a=round(), b=Object.assign({},round(),{id:12,date:'2026-06-08T04:00:00.000Z'});
    const merged=R.rvMergeRounds([a],[a,b]);
    eq(merged.length,2,'the shared round is not duplicated');
    eq(merged[0].id,12,'newest first');
  },
  'merging keeps the RICHER copy of the same round'(){
    const rich=round(), poor=Object.assign({},round(),{v:2}); delete poor.track;
    eq(R.rvMergeRounds([rich],[poor])[0].v, 3, 'an old backup cannot downgrade a replayable round');
    eq(R.rvMergeRounds([poor],[rich])[0].v, 3);
  },
  'rounds with no id fall back to course+date+gross'(){
    const a=round(); delete a.id;
    const b=round(); delete b.id;
    eq(R.rvMergeRounds([a],[b]).length,1);
  },
  'rvMergeClubStats concatenates — the two devices hit different shots'(){
    const m=R.rvMergeClubStats({Dr:[200,210]},{Dr:[220],'7i':[140]});
    deepEq(m.Dr,[200,210,220]); deepEq(m['7i'],[140]);
    eq(R.rvMergeClubStats({Dr:new Array(30).fill(200)},{Dr:new Array(30).fill(210)}).Dr.length, 40, 'capped');
  },
  'rvMergeHios dedupes the same ace typed into two devices'(){
    const a={id:1,course:'Demo GC',date:'1 Jun 2026',hole:7};
    const b={id:2,course:'Demo GC',date:'1 Jun 2026',hole:7};
    eq(R.rvMergeHios([a],[b]).length,1);
    eq(R.rvMergeHios([a],[{id:3,course:'Demo GC',date:'2 Jun 2026',hole:7}]).length,2);
    eq(R.rvMergeHios([{src:'round:1#7'}],[{src:'round:1#7'}]).length,1);
  },
  'rvMergeBackup is additive for facts and leaves this device\'s settings alone'(){
    const mine={ gf_rounds:JSON.stringify([round()]), gf_bag:'{"Dr":230}', gf_hcp_index:'18.4',
                 gf_club_stats:'{"Dr":[230]}', gf_hios:'[]' };
    const file={ gf_rounds:JSON.stringify([Object.assign({},round(),{id:99,date:'2026-07-01T00:00:00Z'})]),
                 gf_bag:'{"Dr":200}', gf_hcp_index:'26.0', gf_club_stats:'{"Dr":[200],"PW":[100]}',
                 gf_hios:JSON.stringify([{id:5,course:'Demo GC',date:'1 Jul 2026',hole:3}]) };
    const res=R.rvMergeBackup(mine,file);
    eq(JSON.parse(res.out.gf_rounds).length,2);
    eq(res.added.rounds,1); eq(res.added.aces,1);
    eq(res.out.gf_bag,'{"Dr":230}','my bag stays mine');
    eq(res.out.gf_hcp_index,'18.4');
    deepEq(JSON.parse(res.out.gf_club_stats).Dr,[230,200]);
    deepEq(JSON.parse(res.out.gf_club_stats).PW,[100]);
  },
  'rvMergeBackup takes a setting from the file only when this device has none'(){
    const res=R.rvMergeBackup({}, {gf_bag:'{"Dr":200}', gf_units:'yd'});
    eq(res.out.gf_bag,'{"Dr":200}'); eq(res.out.gf_units,'yd');
    eq(res.added.rounds,0);
  },
  'a corrupt or empty payload cannot throw'(){
    eq(R.rvJson('not json',[]).length,0);
    eq(R.rvJson(null,{}) && typeof R.rvJson(null,{}), 'object');
    const res=R.rvMergeBackup({gf_rounds:'{{{'},{gf_rounds:'[]'});
    eq(JSON.parse(res.out.gf_rounds).length,0);
    eq(R.rvHoleRows(null,null).length,0);
    eq(R.rvSummary(null).holes,0);
  },
};
