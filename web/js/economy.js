// Economy & meta progression: coins, crowns, boosters, bump budget, daily rewards, chapters.
// Pure functions over a plain save object so everything here is unit-testable.
import { THEMES } from './themes.js';

export const SAVE_VERSION = 2;
export const CHAPTER_SIZE = 10;

export const BOOSTERS = {
  hint:   { id: 'hint',   name: 'Hint',   icon: '💡', price: 30, desc: 'Shows a letter that can escape and its path.' },
  pop:    { id: 'pop',    name: 'Pop',    icon: '🫧', price: 80, desc: 'Pops any letter straight out, blockers or not.' },
  reveal: { id: 'reveal', name: 'Reveal', icon: '🔍', price: 50, desc: 'Shows every clear exit on the board for 6 seconds.' },
};
export const START_BOOSTERS = { hint: 3, pop: 1, reveal: 1 };
export const CONTINUE_PRICE = 50;   // coins to buy 3 more bumps after running out
export const CONTINUE_BUMPS = 3;
export const SKIP_PRICE = 120;      // coins to skip a level

// 7-day login streak rewards
export const DAILY_REWARDS = [
  { coins: 25 }, { coins: 35 }, { coins: 50 }, { coins: 20, booster: 'hint' },
  { coins: 75 }, { coins: 30, booster: 'pop' }, { coins: 150, booster: 'reveal' },
];

export const CHAPTER_NAMES = ['Shallows', 'Tide Pool', 'Reef', 'Lagoon', 'Harbor', 'Kelp Forest', 'Open Sea', 'Coral Garden', 'Shipwreck', 'Trench', 'Abyss', 'Ice Shelf', 'Volcanic Vent', 'Sunken City', 'Mariana'];

export function defaultSave() {
  return {
    v: SAVE_VERSION,
    unlocked: 1,
    stars: {},            // level -> best stars
    crowns: {},           // level -> 1 when cleared perfectly; 'd:YYYY-MM-DD' for daily challenges
    coins: 100,
    boosters: { ...START_BOOSTERS },
    daily: { lastClaim: null, streak: 0 },
    challenge: { date: null, done: false },
    chests: {},           // chapter index -> true when claimed
    theme: 'lagoon',
    sound: true, haptics: true,
    stats: { cleared: 0, perfect: 0, streak: 0, bestStreak: 0, coinsEarned: 0, bumps: 0, boostersUsed: 0 },
  };
}

/** Upgrade any older/partial save to the current schema. */
export function migrate(raw) {
  const d = defaultSave();
  if (!raw || typeof raw !== 'object') return d;
  const s = { ...d, ...raw };
  s.stars = { ...(raw.stars || {}) };
  s.crowns = { ...(raw.crowns || {}) };
  s.boosters = { ...d.boosters, ...(raw.boosters || {}) };
  s.daily = { ...d.daily, ...(raw.daily || {}) };
  s.challenge = { ...d.challenge, ...(raw.challenge || {}) };
  s.chests = { ...(raw.chests || {}) };
  s.stats = { ...d.stats, ...(raw.stats || {}) };
  if (!raw.v) {
    // v1 saves had no coins: grant a catch-up amount for levels already cleared
    s.coins = 100 + Object.keys(s.stars).length * 20;
  }
  s.v = SAVE_VERSION;
  return s;
}

export const crownCount = (save) => Object.keys(save.crowns).length;
export const chapterOf = (level) => Math.floor((level - 1) / CHAPTER_SIZE);
export const chapterName = (idx) => CHAPTER_NAMES[idx % CHAPTER_NAMES.length] + (idx >= CHAPTER_NAMES.length ? ` ${Math.floor(idx / CHAPTER_NAMES.length) + 1}` : '');
export const chapterLevels = (idx) => Array.from({ length: CHAPTER_SIZE }, (_, i) => idx * CHAPTER_SIZE + i + 1);
export const chapterCleared = (save, idx) => chapterLevels(idx).filter((l) => save.stars[l]).length;
export const chapterChestReward = (idx) => ({ coins: 100 + idx * 25, booster: ['hint', 'reveal', 'pop'][idx % 3] });
export function canClaimChest(save, idx) { return !save.chests[idx] && chapterCleared(save, idx) === CHAPTER_SIZE; }
export function claimChest(save, idx) {
  if (!canClaimChest(save, idx)) return null;
  const r = chapterChestReward(idx);
  save.chests[idx] = true;
  save.coins += r.coins;
  save.boosters[r.booster] = (save.boosters[r.booster] || 0) + 1;
  return r;
}

/** How many bumps a level allows before you are "out of moves". */
export function bumpBudget(wordLength) { return 3 + Math.floor(wordLength / 2); }

/** Stars for a clear. Boosters (pop/reveal) and hints cap you at 2 stars. */
export function starsFor({ bumps, hints, boosters }) {
  if (bumps <= 1 && !hints && !boosters) return 3;
  if (bumps <= 3) return 2;
  return 1;
}

/**
 * Coins for clearing a level. First clears pay in full, replays pay 25%.
 * A streak of perfect clears (3+) doubles the payout.
 */
export function levelReward({ level, wordLength, stars, firstClear, streak }) {
  let coins = 10 + wordLength * 2 + Math.floor(level / 5) * 2;
  coins += stars === 3 ? 20 : stars === 2 ? 8 : 0;
  if (!firstClear) coins = Math.max(3, Math.round(coins * 0.25));
  const onFire = stars === 3 && streak >= 3;
  if (onFire) coins *= 2;
  return { coins, onFire };
}

/** Apply a level result to the save. Returns a summary used by the win screen. */
export function recordClear(save, { level, wordLength, bumps, hints, boosters, daily }) {
  const stars = starsFor({ bumps, hints, boosters });
  const firstClear = daily ? !save.challenge.done : !save.stars[level];
  const prevStreak = save.stats.streak;
  const streak = stars === 3 ? prevStreak + 1 : 0;
  const { coins, onFire } = levelReward({ level: daily ? 60 : level, wordLength, stars, firstClear, streak });
  let crown = false;
  if (daily) {
    if (!save.challenge.done) { save.challenge.done = true; crown = true; save.crowns['d:' + save.challenge.date] = 1; }
  } else {
    save.stars[level] = Math.max(save.stars[level] || 0, stars);
    save.unlocked = Math.max(save.unlocked, level + 1);
    if (stars === 3 && !save.crowns[level]) { save.crowns[level] = 1; crown = true; }
  }
  const bonus = daily && firstClear ? 100 : 0;
  save.coins += coins + bonus;
  save.stats.cleared += firstClear ? 1 : 0;
  save.stats.perfect += stars === 3 ? 1 : 0;
  save.stats.streak = streak;
  save.stats.bestStreak = Math.max(save.stats.bestStreak, streak);
  save.stats.coinsEarned += coins + bonus;
  save.stats.bumps += bumps;
  return { stars, coins: coins + bonus, onFire, crown, firstClear, streak };
}

export function canAfford(save, price) { return save.coins >= price; }
export function buyBooster(save, id) {
  const b = BOOSTERS[id];
  if (!b || save.coins < b.price) return false;
  save.coins -= b.price;
  save.boosters[id] = (save.boosters[id] || 0) + 1;
  return true;
}
/** Consume one booster. Returns false if none left. */
export function useBooster(save, id) {
  if (!save.boosters[id]) return false;
  save.boosters[id]--;
  save.stats.boostersUsed++;
  return true;
}
export function buyContinue(save) {
  if (save.coins < CONTINUE_PRICE) return false;
  save.coins -= CONTINUE_PRICE;
  return true;
}
export function buySkip(save, level) {
  if (save.coins < SKIP_PRICE) return false;
  save.coins -= SKIP_PRICE;
  save.stars[level] = Math.max(save.stars[level] || 0, 1);
  save.unlocked = Math.max(save.unlocked, level + 1);
  save.stats.streak = 0;
  return true;
}

// ---------- daily login ----------
export const todayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function dayDiff(a, b) {
  if (!a) return Infinity;
  const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}
/** { claimable, day (0-6), reward, streak } for today. */
export function dailyStatus(save, today = todayKey()) {
  const diff = dayDiff(save.daily.lastClaim, today);
  const claimable = diff >= 1;
  const streak = diff === 1 ? save.daily.streak : diff === 0 ? save.daily.streak : 0; // missed a day -> restart
  const day = claimable ? streak % 7 : (save.daily.streak - 1 + 7) % 7;
  return { claimable, day, reward: DAILY_REWARDS[day], streak };
}
export function claimDaily(save, today = todayKey()) {
  const st = dailyStatus(save, today);
  if (!st.claimable) return null;
  save.daily.streak = st.streak + 1;
  save.daily.lastClaim = today;
  save.coins += st.reward.coins;
  if (st.reward.booster) save.boosters[st.reward.booster] = (save.boosters[st.reward.booster] || 0) + 1;
  save.stats.coinsEarned += st.reward.coins;
  return { ...st.reward, day: st.day };
}

// ---------- daily challenge ----------
export function challengeStatus(save, today = todayKey()) {
  if (save.challenge.date !== today) { save.challenge = { date: today, done: false }; }
  return { date: today, done: save.challenge.done };
}
/** Deterministic seed for a date, used by the generator. */
export function dateSeed(today = todayKey()) {
  let h = 2166136261;
  for (const c of today) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// ---------- themes ----------
export const unlockedThemes = (save) => THEMES.filter((t) => crownCount(save) >= t.crowns);
export function nextThemeUnlock(save) { return THEMES.find((t) => crownCount(save) < t.crowns) || null; }
