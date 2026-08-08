// The "currently playing" bar's brain: find the round you're in the middle of, and work out
// which course it belongs to.
//
// Worth guarding because both halves fail quietly rather than loudly. A slug that doesn't resolve
// just means no bar — you'd never know the way back into your round had gone — and a draft that
// counts as "in progress" when it isn't pins a banner to the top of the app that won't go away.
import { loadResumeCore } from './core.mjs';
import { ok, eq } from './assert.mjs';

// A course whose slug contains hyphens, a scorecard-only one, and a multi-layout site — the three
// shapes COURSE_PLAY actually holds.
const COURSES = {
  'st-lucia-golf-links': { name: 'St Lucia Golf Links', holes: [] },
  'brisbane-river-golf-club': { name: 'Brisbane River Golf Club', noGps: true, holes: [] },
  'nudgee-golf-club': { name: 'Nudgee Golf Club', layouts: [{ key: 'kurrai', name: 'Kurrai' }, { key: 'bulka', name: 'Bulka' }] },
};
const H = h => Date.now() - h * 3600000;
const withDrafts = drafts => {
  const store = {};
  for(const [slug, d] of Object.entries(drafts)) store['gf_round_draft_' + slug] = JSON.stringify(d);
  return { core: loadResumeCore(COURSES, store), store };
};

export const tests = {
  'a layout slug resolves to its course AND its layout key, not just the base course'(){
    const { core } = withDrafts({});
    eq(core._playCourseForSlug('nudgee-golf-club-kurrai').layoutKey, 'kurrai', 'layout key lost');
    eq(core._playCourseForSlug('nudgee-golf-club-kurrai').name, 'Nudgee Golf Club', 'course name wrong');
    eq(core._playCourseForSlug('nudgee-golf-club-kurrai').label, 'Nudgee Golf Club — Kurrai', 'label should name the layout');
    // A course slug has hyphens of its own, so this must never be a split-on-last-hyphen.
    eq(core._playCourseForSlug('st-lucia-golf-links').layoutKey, null, 'a plain course has no layout');
    eq(core._playCourseForSlug('st-lucia-golf-links').label, 'St Lucia Golf Links');
    // The base slug of a multi-layout site is never a playable round on its own.
    eq(core._playCourseForSlug('nudgee-golf-club'), null, 'base slug of a layouts course is not a round');
    eq(core._playCourseForSlug('a-course-since-removed'), null, 'unknown slug resolves to nothing');
    eq(core._playCourseForSlug(''), null);
    eq(core._playCourseForSlug(null), null);
  },

  'an opened-but-never-played draft must not nag'(){
    // openPlay writes a draft the moment you open a course. That is not a round in progress, and
    // if it counted, the bar would appear after merely looking at a scorecard and never leave.
    const { core } = withDrafts({ 'st-lucia-golf-links': { scores: {}, putts: {}, shots: {}, startedAt: H(1) } });
    eq(core._activeRoundDraft(), null, 'empty draft counted as a round');
  },

  'any real progress counts — a score, a putt, or just a tracked shot'(){
    eq(withDrafts({ 'st-lucia-golf-links': { scores: { 1: 4 }, startedAt: H(2) } }).core._activeRoundDraft().holes, 1);
    eq(withDrafts({ 'st-lucia-golf-links': { putts: { 1: 2 }, startedAt: H(2) } }).core._activeRoundDraft().holes, 0, 'putts alone still resume');
    const marks = withDrafts({ 'brisbane-river-golf-club': { shots: { 1: [[1, 2], [3, 4]] }, startedAt: H(3) } }).core._activeRoundDraft();
    eq(marks.marks, 2, 'marked shots alone should resume the round');
    eq(marks.label, 'Brisbane River Golf Club');
    // a null score is not a score
    eq(withDrafts({ 'st-lucia-golf-links': { scores: { 1: null, 2: null }, startedAt: H(2) } }).core._activeRoundDraft(), null);
  },

  'with several unfinished rounds, the most recently started one wins'(){
    const { core } = withDrafts({
      'st-lucia-golf-links': { scores: { 1: 4 }, startedAt: H(30) },
      'nudgee-golf-club-kurrai': { scores: { 1: 5 }, startedAt: H(1) },
    });
    eq(core._activeRoundDraft().label, 'Nudgee Golf Club — Kurrai');
  },

  'bad data degrades to no bar rather than a crash'(){
    // A course dropped from COURSE_PLAY between releases, and a draft that failed to serialise.
    eq(withDrafts({ 'a-course-since-removed': { scores: { 1: 4 }, startedAt: H(1) } }).core._activeRoundDraft(), null,
       'a draft for a course the app no longer has must be ignored');
    const { core, store } = withDrafts({});
    store['gf_round_draft_st-lucia-golf-links'] = '{not json';
    eq(core._activeRoundDraft(), null, 'corrupt draft JSON should be skipped');
  },

  'other gf_* keys are not mistaken for round drafts'(){
    const { core, store } = withDrafts({});
    Object.assign(store, { gf_bag: '{"Dr":230}', gf_rounds: '[]', gf_hcp_index: '12.4', gf_club_stats: '{}' });
    eq(core._activeRoundDraft(), null, 'only gf_round_draft_* is a round');
  },

  'startedAt survives so the bar can tell "playing now" from "unfinished"'(){
    // The bar calls it live under 14 h. The cutoff itself is a UI decision; what this guards is
    // that startedAt is carried through at all, without which every round reads as ancient.
    const { core } = withDrafts({ 'st-lucia-golf-links': { scores: { 1: 4 }, startedAt: H(3) } });
    const r = core._activeRoundDraft();
    const ageH = (Date.now() - r.startedAt) / 3600000;
    ok(ageH > 2.9 && ageH < 3.1, 'startedAt did not round-trip (got ' + ageH.toFixed(2) + ' h)');
    // A draft written before startedAt existed must still resume, just not claim to be live.
    const legacy = withDrafts({ 'st-lucia-golf-links': { scores: { 1: 4 } } }).core._activeRoundDraft();
    ok(legacy, 'a draft with no startedAt should still be resumable');
    eq(legacy.startedAt, 0, 'and should read as old rather than as now');
  },
};
