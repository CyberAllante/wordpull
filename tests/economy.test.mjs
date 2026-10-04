import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../web/js/economy.js';

test('v1 saves migrate with catch-up coins', () => {
  const s = E.migrate({ unlocked: 4, stars: { 1: 3, 2: 2, 3: 3 }, sound: false });
  assert.equal(s.v, 2);
  assert.equal(s.unlocked, 4);
  assert.equal(s.coins, 160);
  assert.equal(s.sound, false);
  assert.deepEqual(s.boosters, E.START_BOOSTERS);
  assert.equal(E.migrate(null).coins, 100);
});

test('stars and rewards', () => {
  assert.equal(E.starsFor({ bumps: 0, hints: 0, boosters: 0 }), 3);
  assert.equal(E.starsFor({ bumps: 1, hints: 1, boosters: 0 }), 2);
  assert.equal(E.starsFor({ bumps: 3, hints: 0, boosters: 0 }), 2);
  assert.equal(E.starsFor({ bumps: 4, hints: 0, boosters: 0 }), 1);
  const a = E.levelReward({ level: 1, wordLength: 3, stars: 3, firstClear: true, streak: 1 });
  const b = E.levelReward({ level: 1, wordLength: 3, stars: 3, firstClear: false, streak: 1 });
  assert.ok(a.coins > b.coins && b.coins >= 3);
  const fire = E.levelReward({ level: 1, wordLength: 3, stars: 3, firstClear: true, streak: 3 });
  assert.equal(fire.coins, a.coins * 2);
  assert.ok(fire.onFire);
});

test('recordClear awards crown once, unlocks next level, tracks streak', () => {
  const s = E.defaultSave();
  const r1 = E.recordClear(s, { level: 1, wordLength: 3, bumps: 0, hints: 0, boosters: 0 });
  assert.equal(r1.stars, 3); assert.ok(r1.crown); assert.equal(s.unlocked, 2); assert.equal(E.crownCount(s), 1);
  const r2 = E.recordClear(s, { level: 1, wordLength: 3, bumps: 0, hints: 0, boosters: 0 });
  assert.ok(!r2.crown && !r2.firstClear); assert.equal(s.stats.streak, 2);
  const r3 = E.recordClear(s, { level: 2, wordLength: 3, bumps: 5, hints: 0, boosters: 0 });
  assert.equal(r3.stars, 1); assert.equal(s.stats.streak, 0); assert.equal(s.stars[2], 1);
});

test('boosters, continue and skip spend coins', () => {
  const s = E.defaultSave();
  s.coins = 100;
  assert.ok(E.buyBooster(s, 'pop')); assert.equal(s.coins, 20); assert.equal(s.boosters.pop, 2);
  assert.ok(!E.buyBooster(s, 'pop'));
  assert.ok(E.useBooster(s, 'pop')); assert.ok(E.useBooster(s, 'pop')); assert.ok(!E.useBooster(s, 'pop'));
  assert.ok(!E.buyContinue(s)); s.coins = 60; assert.ok(E.buyContinue(s)); assert.equal(s.coins, 10);
  s.coins = 200; assert.ok(E.buySkip(s, 7)); assert.equal(s.unlocked, 8); assert.equal(s.stars[7], 1);
});

test('daily login streak', () => {
  const s = E.defaultSave();
  let st = E.dailyStatus(s, '2026-10-03');
  assert.ok(st.claimable); assert.equal(st.day, 0);
  assert.deepEqual(E.claimDaily(s, '2026-10-03'), { coins: 25, day: 0 });
  assert.ok(!E.dailyStatus(s, '2026-10-03').claimable);
  assert.equal(E.claimDaily(s, '2026-10-03'), null);
  E.claimDaily(s, '2026-10-04'); E.claimDaily(s, '2026-10-05');
  const r = E.claimDaily(s, '2026-10-06');
  assert.equal(r.booster, 'hint'); assert.equal(s.daily.streak, 4);
  // miss a day -> streak restarts at day 1
  st = E.dailyStatus(s, '2026-10-08');
  assert.ok(st.claimable); assert.equal(st.day, 0);
  E.claimDaily(s, '2026-10-08'); assert.equal(s.daily.streak, 1);
});

test('chapters and chests', () => {
  const s = E.defaultSave();
  assert.equal(E.chapterOf(1), 0); assert.equal(E.chapterOf(10), 0); assert.equal(E.chapterOf(11), 1);
  assert.equal(E.chapterName(0), 'Shallows');
  for (let l = 1; l <= 9; l++) s.stars[l] = 2;
  assert.ok(!E.canClaimChest(s, 0));
  s.stars[10] = 1;
  assert.ok(E.canClaimChest(s, 0));
  const before = s.coins;
  const r = E.claimChest(s, 0);
  assert.equal(s.coins, before + r.coins); assert.ok(s.chests[0]); assert.equal(E.claimChest(s, 0), null);
});

test('daily challenge and themes', () => {
  const s = E.defaultSave();
  assert.deepEqual(E.challengeStatus(s, '2026-10-03'), { date: '2026-10-03', done: false });
  assert.equal(E.dateSeed('2026-10-03'), E.dateSeed('2026-10-03'));
  assert.notEqual(E.dateSeed('2026-10-03'), E.dateSeed('2026-10-04'));
  assert.equal(E.unlockedThemes(s).length, 1);
  assert.equal(E.nextThemeUnlock(s).crowns, 5);
  assert.equal(E.bumpBudget(3), 4); assert.equal(E.bumpBudget(9), 7);
});
