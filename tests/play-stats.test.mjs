// Unit tests for the pure PLAY-STATS-CORE engine (helpers + aggregation), run against the
// live code sliced out of index.html. These are the regression guard for the stats math.
import { ok, eq, close } from './assert.mjs';
import { loadStatsCore } from './core.mjs';

const S = loadStatsCore();

// Two deterministic synthetic rounds exercising every counter.
function fixtures(){
  const r1 = { id:1, slug:'demo', date:'2026-06-01', holeStats:[
    { n:1,par:4,score:4,putts:2,fir:true, gir:true, miss:null,   bunkers:0,penalties:0,ballsLost:0,driveM:230,scrambleTry:false,scrambleWin:null, sandTry:false,sandWin:null },
    { n:2,par:3,score:4,putts:2,fir:null, gir:false,miss:'short',bunkers:1,penalties:0,ballsLost:0,driveM:null,scrambleTry:true, scrambleWin:false,sandTry:true, sandWin:false },
    { n:3,par:5,score:6,putts:2,fir:false,gir:false,miss:'right',bunkers:0,penalties:1,ballsLost:1,driveM:240,scrambleTry:true, scrambleWin:false,sandTry:false,sandWin:null },
  ], legs:{ '1':[{d:230,club:'Dr',lie:'fairway'},{d:150,club:'7i',lie:'green'}], '3':[{d:240,club:'Dr',lie:'rough'}] } };
  const r2 = { id:2, slug:'demo', date:'2026-06-08', holeStats:[
    { n:1,par:4,score:3,putts:1,fir:true, gir:true, miss:null,   bunkers:0,penalties:0,ballsLost:0,driveM:250,scrambleTry:false,scrambleWin:null, sandTry:false,sandWin:null },
  ], legs:{} };
  return [r1,r2];
}

export const tests = {
  'psGirFromScore'(){
    eq(S.psGirFromScore(4,2,4), true);   // 2 strokes to green on a par 4 = GIR
    eq(S.psGirFromScore(5,2,4), false);  // 3 to green = missed
    eq(S.psGirFromScore(3,2,3), true);   // par 3: 1 to green
    eq(S.psGirFromScore(2,null,4), null);
  },
  'psFirFromLie'(){
    eq(S.psFirFromLie(4,'fairway'), true);
    eq(S.psFirFromLie(5,'rough'), false);
    eq(S.psFirFromLie(3,'fairway'), null);   // par 3 has no fairway-in-regulation
    eq(S.psFirFromLie(4,null), null);
  },
  'psClassifyMiss'(){
    eq(S.psClassifyMiss(8,2), 'long');
    eq(S.psClassifyMiss(-8,2), 'short');
    eq(S.psClassifyMiss(2,8), 'right');
    eq(S.psClassifyMiss(2,-8), 'left');
    eq(S.psClassifyMiss(null,1), null);
  },
  'psBallsLostFromPens'(){
    eq(S.psBallsLostFromPens(['water','drop','ob','lost']), 3);  // drop keeps the ball
    eq(S.psBallsLostFromPens([]), 0);
    eq(S.psBallsLostFromPens(null), 0);
  },
  'psTrimmedMean'(){
    eq(S.psTrimmedMean([230,240]), 235);
    eq(S.psTrimmedMean([]), null);
  },
  'aggregate: FIR / GIR'(){
    const a = S.psAggregate(fixtures());
    eq(a.fir.hit,2); eq(a.fir.of,3); eq(a.fir.pct,67);
    eq(a.gir.hit,2); eq(a.gir.of,4); eq(a.gir.pct,50);
  },
  'aggregate: scoring by par'(){
    const a = S.psAggregate(fixtures());
    close(a.scoring.par3.avg,4); close(a.scoring.par3.avgVsPar,1); eq(a.scoring.par3.n,1);
    close(a.scoring.par4.avg,3.5); close(a.scoring.par4.avgVsPar,-0.5); eq(a.scoring.par4.n,2);
    close(a.scoring.par5.avg,6); eq(a.scoring.par5.n,1);
    eq(a.scoring.dist.birdie,1); eq(a.scoring.dist.par,1); eq(a.scoring.dist.bogey,2);
  },
  'aggregate: putts'(){
    const a = S.psAggregate(fixtures());
    eq(a.putts.total,7); close(a.putts.perRound,3.5); close(a.putts.perHole,1.75);
    close(a.putts.perGir,1.5); eq(a.putts.onePuttPct,25); eq(a.putts.threePuttPct,0);
  },
  'aggregate: miss / bunkers / penalties / balls lost'(){
    const a = S.psAggregate(fixtures());
    eq(a.miss.short,1); eq(a.miss.right,1); eq(a.miss.of,2);
    eq(a.bunkers.total,1); close(a.bunkers.perRound,0.5);
    eq(a.penalties.total,1); close(a.penalties.perRound,0.5);
    eq(a.ballsLost.total,1); close(a.ballsLost.perRound,0.5);
  },
  'aggregate: scrambling / sand / driving'(){
    const a = S.psAggregate(fixtures());
    eq(a.scrambling.of,2); eq(a.scrambling.win,0); eq(a.scrambling.pct,0);
    eq(a.sand.of,1); eq(a.sand.win,0); eq(a.sand.pct,0);
    eq(a.driving.avgM,240); eq(a.driving.longestM,250); eq(a.driving.n,3);
  },
  'aggregate: per-club'(){
    const a = S.psAggregate(fixtures());
    const dr = a.byClub.Dr, i7 = a.byClub['7i'];
    eq(dr.n,2); eq(dr.avgM,235); eq(dr.accuracyPct,50); eq(dr.rounds,1); close(dr.perRound,1);
    eq(i7.n,1); eq(i7.avgM,150); eq(i7.accuracyPct,100); close(i7.perRound,0.5);
  },
  'aggregate: empty input is safe'(){
    const a = S.psAggregate([]);
    eq(a.rounds,0); eq(a.fir.pct,null); eq(a.scoring.avg,null); eq(a.driving.avgM,null);
  },
};
