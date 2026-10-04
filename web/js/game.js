// Word Pool game controller: screens, input, boosters, economy, animation and persistence.
import { dot, len, sub, pointSegDist, clamp } from './geom.js';
import { STROKE_R } from './glyphs.js';
import { Piece, Board } from './engine.js';
import { getLevel, loadShippedLevels } from './levels.js';
import { PALETTE, generateLevel, dailyWord } from './generator.js';
import { layoutPool, drawScene, drawRipples, drawPiece, drawGhostPath, Particles, clearSpriteCache, roundRect } from './render.js';
import { sfx, haptic, settings } from './audio.js';
import * as E from './economy.js';
import { THEMES, themeById } from './themes.js';

const SAVE_KEY = 'wordpool.v1';
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

export class Game {
  constructor(root) {
    this.root = root;
    this.canvas = root.querySelector('#game');
    this.ctx = this.canvas.getContext('2d');
    this.$ = (sel) => root.querySelector(sel);
    this.$$ = (sel) => [...root.querySelectorAll(sel)];
    this.particles = new Particles();
    this.anims = [];
    this.flashes = new Map();
    this.screen = 'home';
    this.save = this.load();
    settings.sound = this.save.sound;
    settings.haptics = this.save.haptics;
    this.theme = themeById(this.save.theme);
    this.bindUI();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
    this.buildTitle();
    this.showScreen('home');
    loadShippedLevels().then(() => { this.renderHome(); this.maybeOfferDaily(); });
  }

  // ---------- persistence ----------
  load() {
    try { return E.migrate(JSON.parse(localStorage.getItem(SAVE_KEY) || 'null')); } catch { return E.defaultSave(); }
  }
  persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch { /* ignore */ } }

  // ---------- UI wiring ----------
  bindUI() {
    const on = (sel, fn) => this.$(sel).addEventListener('click', fn);
    on('#btn-play', () => { sfx.tap(); this.startLevel(this.save.unlocked); });
    on('#btn-chapters', () => { sfx.tap(); this.showChapters(); });
    on('#btn-chapters-back', () => { sfx.back(); this.goHome(); });
    on('#btn-shop', () => { sfx.tap(); this.showShop(); });
    on('#btn-shop-back', () => { sfx.back(); this.goHome(); });
    on('#btn-settings', () => { sfx.tap(); this.showSettings(); });
    on('#btn-daily-gift', () => { sfx.tap(); this.showDailyModal(); });
    on('#btn-challenge', () => { sfx.tap(); this.startDaily(); });
    on('#btn-home', () => { sfx.back(); this.goHome(); });
    on('#btn-restart', () => { sfx.tap(); this.restart(); });
    on('#btn-next', () => { sfx.tap(); this.daily ? this.goHome() : this.startLevel(this.level + 1); });
    on('#btn-win-home', () => { sfx.back(); this.goHome(); });
    on('#btn-win-replay', () => { sfx.tap(); this.restart(); });
    on('#btn-cancel-target', () => { sfx.back(); this.setTargeting(null); });
    for (const b of this.$$('.booster[data-booster]')) b.addEventListener('click', () => this.boosterTapped(b.dataset.booster));
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    c.addEventListener('pointermove', (e) => this.onMove(e));
    c.addEventListener('pointerup', (e) => this.onUp(e));
    c.addEventListener('pointercancel', (e) => this.onUp(e));
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    this.renderHome();
  }
  showScreen(name) {
    this.screen = name;
    for (const el of this.$$('.screen')) el.classList.toggle('active', el.dataset.screen === name);
    const playing = name === 'play';
    this.$('#hud').classList.toggle('hidden', !playing);
    this.$('#boosters').classList.toggle('hidden', !playing);
    if (!playing) this.setTargeting(null);
  }
  goHome() { this.closeModal(); this.showScreen('home'); this.renderHome(); }
  toast(msg, ms = 1800) {
    const t = this.$('#toast');
    t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => t.classList.add('hidden'), ms);
  }
  updateCurrency(bump = false) {
    for (const el of this.$$('.pill.coins .val')) el.textContent = this.save.coins;
    for (const el of this.$$('.pill.crowns .val')) el.textContent = E.crownCount(this.save);
    if (bump) for (const el of this.$$('.pill.coins')) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    this.persist();
  }

  // ---------- modal ----------
  showModal({ title, body, actions = [], dismiss = true }) {
    const m = this.$('#modal');
    this.$('#modal-title').textContent = title;
    const b = this.$('#modal-body');
    b.innerHTML = '';
    if (typeof body === 'string') b.innerHTML = body; else if (body) b.appendChild(body);
    const a = this.$('#modal-actions');
    a.innerHTML = '';
    for (const act of actions) {
      const btn = document.createElement('button');
      btn.className = act.cls || 'secondary';
      btn.innerHTML = act.label;
      if (act.id) btn.id = act.id;
      btn.addEventListener('click', () => { if (act.keep !== true) this.closeModal(); act.onClick?.(); });
      a.appendChild(btn);
    }
    m.classList.remove('hidden');
    m.onclick = dismiss ? (e) => { if (e.target === m) this.closeModal(); } : null;
    this.modalOpen = true;
  }
  closeModal() { this.$('#modal').classList.add('hidden'); this.modalOpen = false; }

  // ---------- home ----------
  renderHome() {
    const s = this.save;
    this.updateCurrency();
    const next = s.unlocked;
    this.$('#btn-play').textContent = next === 1 ? 'Play' : `Continue · Level ${next}`;
    const ch = E.chapterOf(next);
    this.setChapterLine(this.$('#home-chapter'), ch);
    const d = E.dailyStatus(s);
    this.$('#btn-daily-gift').classList.toggle('hidden', !d.claimable);
    const c = E.challengeStatus(s);
    this.$('#challenge-state').textContent = c.done ? 'Done ✓' : 'Play';
    this.$('#btn-challenge').classList.toggle('done', c.done);
    this.$('#challenge-sub').textContent = c.done ? `Cleared today. New word tomorrow.` : 'A long word, mixed case. +100 🪙 and a crown.';
    const st = s.stats;
    this.$('#home-stats').textContent = st.cleared ? `${st.cleared} words cleared · ${st.perfect} perfect · best streak ${st.bestStreak}` : 'Pull every letter out of the pool.';
    this.persist();
  }
  setChapterLine(el, ch) {
    const n = E.chapterCleared(this.save, ch);
    el.querySelector('.name').textContent = `Ch. ${ch + 1} · ${E.chapterName(ch)}`;
    el.querySelector('.bar i').style.width = `${(n / E.CHAPTER_SIZE) * 100}%`;
    el.querySelector('.count').textContent = `${n}/${E.CHAPTER_SIZE}`;
  }
  maybeOfferDaily() {
    if (E.dailyStatus(this.save).claimable && !this.modalOpen) this.showDailyModal();
  }
  showDailyModal() {
    const st = E.dailyStatus(this.save);
    const body = document.createElement('div');
    body.className = 'modal-body';
    const days = document.createElement('div'); days.className = 'days';
    E.DAILY_REWARDS.forEach((r, i) => {
      const d = document.createElement('div');
      d.className = 'day' + (i < st.day ? ' got' : i === st.day && st.claimable ? ' now' : '');
      d.innerHTML = `<span>Day ${i + 1}</span><b>${r.booster ? E.BOOSTERS[r.booster].icon : '🪙'}</b><span>${r.coins}</span>`;
      days.appendChild(d);
    });
    body.appendChild(days);
    const p = document.createElement('div');
    p.innerHTML = st.claimable
      ? `Come back every day to keep the streak going. Today: <span class="reward">🪙 ${st.reward.coins}${st.reward.booster ? ` + ${E.BOOSTERS[st.reward.booster].icon} ${E.BOOSTERS[st.reward.booster].name}` : ''}</span>`
      : `You've claimed today's gift. Day ${(this.save.daily.streak % 7) + 1} is waiting tomorrow.`;
    body.appendChild(p);
    this.showModal({
      title: st.claimable ? '🎁 Daily gift' : '🎁 Daily gifts',
      body,
      actions: st.claimable
        ? [{ label: 'Claim', cls: 'gold', id: 'btn-claim-daily', onClick: () => { const r = E.claimDaily(this.save); sfx.chest(); haptic('success'); this.flyCoins(this.W / 2, this.H / 2, 8); this.toast(`+${r.coins} 🪙${r.booster ? ` and a ${E.BOOSTERS[r.booster].name}` : ''}`); this.renderHome(); } }]
        : [{ label: 'OK', cls: 'primary' }],
    });
  }
  showSettings() {
    const s = this.save;
    const body = document.createElement('div'); body.className = 'settings-list';
    const mk = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.addEventListener('click', fn); body.appendChild(b); return b; };
    const snd = mk(`Sound: ${s.sound ? 'On' : 'Off'}`, () => { s.sound = !s.sound; settings.sound = s.sound; snd.textContent = `Sound: ${s.sound ? 'On' : 'Off'}`; sfx.tap(); this.persist(); });
    const hap = mk(`Haptics: ${s.haptics ? 'On' : 'Off'}`, () => { s.haptics = !s.haptics; settings.haptics = s.haptics; hap.textContent = `Haptics: ${s.haptics ? 'On' : 'Off'}`; haptic('medium'); this.persist(); });
    mk('Themes', () => { this.closeModal(); this.showShop(); });
    const stats = document.createElement('div'); stats.className = 'stat-grid';
    stats.innerHTML = `<div><b>${s.stats.cleared}</b>words cleared</div><div><b>${E.crownCount(s)}</b>crowns</div><div><b>${s.stats.coinsEarned}</b>coins earned</div><div><b>${s.stats.bestStreak}</b>best perfect streak</div>`;
    body.appendChild(stats);
    const reset = mk('Reset progress', () => {
      if (reset.dataset.armed) { this.save = E.defaultSave(); this.save.sound = settings.sound; this.save.haptics = settings.haptics; this.persist(); this.theme = themeById('lagoon'); clearSpriteCache(); this.closeModal(); this.renderHome(); this.toast('Progress reset'); }
      else { reset.dataset.armed = '1'; reset.textContent = 'Tap again to confirm'; reset.style.color = 'var(--danger)'; setTimeout(() => { delete reset.dataset.armed; reset.textContent = 'Reset progress'; reset.style.color = ''; }, 2500); }
    });
    this.showModal({ title: 'Settings', body, actions: [{ label: 'Done', cls: 'primary' }] });
  }

  // ---------- chapters ----------
  showChapters() {
    const list = this.$('#chapter-list');
    list.innerHTML = '';
    this.$('#chapters-crowns').textContent = E.crownCount(this.save);
    const maxCh = E.chapterOf(this.save.unlocked) + 2;
    for (let ch = 0; ch < maxCh; ch++) {
      const card = document.createElement('div');
      const unlockedCh = E.chapterLevels(ch)[0] <= this.save.unlocked;
      card.className = 'chapter' + (unlockedCh ? '' : ' locked');
      const cleared = E.chapterCleared(this.save, ch);
      card.innerHTML = `<div class="chapter-head"><b>Ch. ${ch + 1} · ${E.chapterName(ch)}</b><span class="count">${cleared}/${E.CHAPTER_SIZE}</span></div>`;
      const grid = document.createElement('div'); grid.className = 'level-grid';
      for (const l of E.chapterLevels(ch)) {
        const b = document.createElement('button');
        const locked = l > this.save.unlocked;
        b.className = 'lvl' + (locked ? ' locked' : '') + (l === this.save.unlocked ? ' current' : '');
        const stars = this.save.stars[l] || 0;
        b.innerHTML = `<span class="n">${l}</span><span class="s">${stars ? '★'.repeat(stars) : locked ? '🔒' : ''}</span>${this.save.crowns[l] ? '<span class="crown">👑</span>' : ''}`;
        b.disabled = locked;
        b.addEventListener('click', () => { sfx.tap(); this.startLevel(l); });
        grid.appendChild(b);
      }
      card.appendChild(grid);
      const chest = document.createElement('button');
      const r = E.chapterChestReward(ch);
      const claimed = !!this.save.chests[ch], ready = E.canClaimChest(this.save, ch);
      chest.className = 'chest' + (ready ? ' ready' : '');
      chest.disabled = !ready;
      chest.innerHTML = `<span class="big">${claimed ? '📭' : '🎁'}</span><span>${claimed ? 'Chest opened' : ready ? 'Chapter chest ready!' : 'Chapter chest'}<br><span class="sub">🪙 ${r.coins} + ${E.BOOSTERS[r.booster].icon} ${E.BOOSTERS[r.booster].name}${claimed || ready ? '' : ` · clear all ${E.CHAPTER_SIZE} levels`}</span></span>`;
      chest.addEventListener('click', () => {
        const got = E.claimChest(this.save, ch);
        if (!got) return;
        sfx.chest(); haptic('success');
        this.flyCoins(this.W / 2, this.H / 2, 12);
        this.showModal({ title: '🎁 Chest opened!', body: `<div class="big">🪙</div><div class="reward">+${got.coins} coins</div><div>and a ${E.BOOSTERS[got.booster].icon} ${E.BOOSTERS[got.booster].name} booster</div>`, actions: [{ label: 'Nice', cls: 'gold', onClick: () => this.showChapters() }] });
        this.updateCurrency(true);
      });
      card.appendChild(chest);
      list.appendChild(card);
    }
    this.showScreen('chapters');
  }

  // ---------- shop ----------
  showShop() {
    this.updateCurrency();
    const bl = this.$('#shop-boosters'); bl.innerHTML = '';
    for (const b of Object.values(E.BOOSTERS)) {
      const row = document.createElement('div'); row.className = 'shop-item';
      row.innerHTML = `<span class="ico">${b.icon}</span><span class="info"><b>${b.name}</b><small>${b.desc}</small><span class="own">You have ${this.save.boosters[b.id] || 0}</span></span>`;
      const buy = document.createElement('button'); buy.className = 'buy'; buy.textContent = `🪙 ${b.price}`;
      buy.disabled = !E.canAfford(this.save, b.price);
      buy.addEventListener('click', () => { if (E.buyBooster(this.save, b.id)) { sfx.coin(); haptic('light'); this.updateCurrency(true); this.showShop(); } });
      row.appendChild(buy); bl.appendChild(row);
    }
    const tl = this.$('#shop-themes'); tl.innerHTML = '';
    const crowns = E.crownCount(this.save);
    for (const t of THEMES) {
      const row = document.createElement('div'); row.className = 'shop-item';
      const sw = t.palette.slice(0, 6).map((c) => `<i style="background:${c}"></i>`).join('');
      row.innerHTML = `<span class="ico" style="font-size:18px"><span class="swatches">${sw}</span></span><span class="info"><b>${t.name}</b><small>${t.crowns ? `Needs ${t.crowns} 👑` : 'Default'}</small></span>`;
      const btn = document.createElement('button');
      const unlocked = crowns >= t.crowns, active = this.theme.id === t.id;
      btn.className = 'buy ' + (active ? 'active' : unlocked ? 'ghost' : 'ghost');
      btn.textContent = active ? 'In use' : unlocked ? 'Use' : `🔒 ${t.crowns} 👑`;
      btn.disabled = active || !unlocked;
      btn.addEventListener('click', () => { this.setTheme(t.id); sfx.booster(); this.showShop(); });
      row.appendChild(btn); tl.appendChild(row);
    }
    this.showScreen('shop');
  }
  setTheme(id) {
    this.theme = themeById(id);
    this.save.theme = id; this.persist();
    clearSpriteCache();
    if (this.board) for (const p of this.board.pieces) p.color = this.themeColor(p.baseColor);
    if (this.titleBoard) this.titleBoard.pieces.forEach((p, i) => { p.color = this.theme.palette[(i * 2) % this.theme.palette.length]; });
  }
  themeColor(hex) { const i = PALETTE.indexOf(hex); return i >= 0 ? this.theme.palette[i % this.theme.palette.length] : hex; }

  buildTitle() {
    const c = this.$('#title-canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = 320, H = 110;
    c.width = W * dpr; c.height = H * dpr; c.style.width = W + 'px'; c.style.height = H + 'px';
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    const board = new Board(10, 3);
    let x = 0.15;
    board.pieces = 'WordPool'.split('').map((ch, i) => { const p = new Piece(ch, { x, y: 0 }, this.theme.palette[(i * 2) % this.theme.palette.length]); p.pos.y = 1.5 - p.g.baseline; x += p.g.w + 0.14; return p; });
    board.w = x + 0.1;
    this.titleBoard = board; this.titleCtx = ctx;
    this.titleRect = layoutPool(board, { x: 0, y: 0, w: W, h: H }, 6);
  }

  // ---------- level lifecycle ----------
  startLevel(n) {
    const { word, board } = getLevel(n);
    this.beginBoard({ level: n, word, board, daily: false });
  }
  startDaily() {
    const c = E.challengeStatus(this.save);
    const seed = E.dateSeed(c.date);
    const word = dailyWord(seed);
    this.showModal({ title: 'Daily Challenge', body: `<div class="spinner"></div><div>Building today's puzzle…</div>`, actions: [], dismiss: false });
    setTimeout(() => {
      let gen;
      try { gen = generateLevel(70, { seed, word, attempts: 4 }); }
      catch { this.closeModal(); this.toast('Could not build today\'s puzzle'); return; }
      this.closeModal();
      this.beginBoard({ level: 70, word, board: gen.board, daily: true });
    }, 60);
  }
  beginBoard({ level, word, board, daily }) {
    this.level = level; this.word = word; this.board = board; this.daily = daily;
    for (const p of board.pieces) { p.baseColor = p.color; p.color = this.themeColor(p.color); }
    this.drag = null; this.anims = []; this.flashes.clear(); this.ghost = null; this.reveal = null;
    this.bumps = 0; this.hintsUsed = 0; this.boostersUsed = 0;
    this.bumpBudget = E.bumpBudget(word.length); this.bumpsLeft = this.bumpBudget;
    this.startTime = performance.now();
    this.finished = false; this.paused = false;
    this.setTargeting(null);
    this.$('#hud-level').textContent = daily ? 'Daily Challenge' : `Level ${level}`;
    this.renderWordChips(); this.renderHearts(); this.renderBoosterBar(); this.updateCurrency();
    this.showScreen('play');
    this.resize();
    const tips = { 1: 'Drag a letter along its own shape to pull it out of the pool.', 2: 'Blocked? Another letter is in the way. Find one that can escape first.', 3: 'A letter that floats free (touching nothing) can be popped with a tap.', 4: 'Hearts are bumps. Run out and the round ends, so hold a letter to preview its path.', 5: 'Boosters: 💡 shows a move, 🫧 pops any letter, 🔍 reveals every exit.' };
    this.$('#tutorial').textContent = (!daily && tips[level]) || '';
  }
  restart() { this.closeModal(); if (this.daily) this.startDaily(); else this.startLevel(this.level); }
  renderWordChips() {
    const row = this.$('#word-row');
    row.innerHTML = '';
    this.board.pieces.forEach((p) => {
      const s = document.createElement('span');
      s.className = 'chip' + (p.removed ? ' done' : '');
      s.textContent = p.ch; s.style.setProperty('--c', p.color);
      row.appendChild(s);
    });
  }
  renderHearts() {
    const el = this.$('#hud-hearts');
    el.innerHTML = Array.from({ length: this.bumpBudget }, (_, i) => `<span class="${i < this.bumpsLeft ? '' : 'off'}">♥</span>`).join('');
  }
  renderBoosterBar() {
    for (const b of this.$$('.booster[data-booster]')) {
      const n = this.save.boosters[b.dataset.booster] || 0;
      const c = b.querySelector('.b-count');
      c.textContent = n ? n : '+'; c.classList.toggle('zero', !n);
      b.classList.toggle('armed', this.targeting === b.dataset.booster);
    }
  }
  setTargeting(mode) {
    this.targeting = mode;
    this.$('#targeting').classList.toggle('hidden', !mode);
    this.renderBoosterBar();
  }

  // ---------- boosters ----------
  boosterTapped(id) {
    if (this.finished || this.paused) return;
    if (this.targeting === id) { this.setTargeting(null); sfx.back(); return; }
    const b = E.BOOSTERS[id];
    if (!this.save.boosters[id]) {
      const can = E.canAfford(this.save, b.price);
      this.showModal({
        title: `${b.icon} ${b.name}`,
        body: `<div>${b.desc}</div><div class="reward">🪙 ${b.price}</div>${can ? '' : `<div>You have 🪙 ${this.save.coins}. Clear words, open chests and claim daily gifts to earn more.</div>`}`,
        actions: can ? [{ label: `Buy & use for 🪙 ${b.price}`, cls: 'gold', id: 'btn-buy-use', onClick: () => { if (E.buyBooster(this.save, id)) { sfx.coin(); this.updateCurrency(true); this.renderBoosterBar(); this.activateBooster(id); } } }, { label: 'Not now', cls: 'secondary' }]
          : [{ label: 'OK', cls: 'primary' }],
      });
      return;
    }
    this.activateBooster(id);
  }
  activateBooster(id) {
    if (id === 'pop') { this.setTargeting('pop'); sfx.tap(); return; }
    if (!E.useBooster(this.save, id)) return;
    this.boostersUsed++; this.persist(); this.renderBoosterBar();
    sfx.booster(); haptic('medium');
    if (id === 'hint') this.hint();
    if (id === 'reveal') this.revealAll();
  }
  hint() {
    for (const p of this.board.active) {
      if (this.anims.some((a) => a.piece === p)) continue;
      const r = this.board.removable(p);
      if (!r) continue;
      this.hintsUsed++;
      this.ghost = { piece: p, until: performance.now() + 3000, dirs: r.pull ? r.pull.map((d) => ({ dir: d.dir, sEnd: this.board.headExitS(p, d.dir), ok: true })) : [], pop: !!r.pop };
      this.flash(p, 1000, 'rgba(255,255,255,0.7)');
      return;
    }
  }
  revealAll() {
    const items = [];
    for (const p of this.board.active) {
      const r = this.board.removable(p);
      if (!r) continue;
      items.push({ piece: p, dirs: r.pull ? r.pull.map((d) => ({ dir: d.dir, sEnd: this.board.headExitS(p, d.dir), ok: true })) : [], pop: !!r.pop });
      this.flash(p, 1200, 'rgba(255,255,255,0.6)');
    }
    this.reveal = { items, until: performance.now() + 6000 };
    this.toast(`${items.length} letter${items.length === 1 ? '' : 's'} can escape right now`, 2200);
  }
  flash(piece, ms, color) { this.flashes.set(piece, { until: performance.now() + ms, start: performance.now(), color }); }

  // ---------- geometry helpers ----------
  resize() {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    this.dpr = dpr;
    clearSpriteCache();
    const W = this.root.clientWidth, H = this.root.clientHeight;
    this.canvas.width = Math.round(W * dpr); this.canvas.height = Math.round(H * dpr);
    this.canvas.style.width = W + 'px'; this.canvas.style.height = H + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.W = W; this.H = H;
    const top = this.$('#hud').offsetHeight + 6;
    const bottom = this.$('#boosters').offsetHeight + 8;
    this.area = { x: 0, y: top, w: W, h: H - top - bottom };
    if (this.board) this.rect = layoutPool(this.board, this.area);
  }
  toUnits(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left - this.rect.x) / this.rect.scale, y: (e.clientY - r.top - this.rect.y) / this.rect.scale };
  }
  pieceAt(u) {
    let best = null, bestD = Infinity, inBox = null, inBoxD = Infinity;
    for (const p of this.board.active) {
      if (this.anims.some((a) => a.piece === p)) continue;
      const off = { x: p.pos.x, y: p.pos.y };
      let dMin = Infinity;
      for (const [a, b] of p.g.segs) {
        const d = pointSegDist(u, { x: a.x + off.x, y: a.y + off.y }, { x: b.x + off.x, y: b.y + off.y });
        if (d < dMin) dMin = d;
      }
      if (dMin < bestD) { bestD = dMin; best = p; }
      const b = p.bboxAt(null);
      if (u.x >= b.minX && u.x <= b.maxX && u.y >= b.minY && u.y <= b.maxY && dMin < inBoxD) { inBoxD = dMin; inBox = p; }
    }
    const slack = STROKE_R + 14 / this.rect.scale;
    return bestD <= slack ? best : inBox;
  }

  // ---------- input ----------
  onDown(e) {
    if (this.screen !== 'play' || this.finished || this.paused || this.modalOpen || this.drag) return;
    const u = this.toUnits(e);
    const p = this.pieceAt(u);
    if (!p) return;
    if (this.targeting === 'pop') {
      if (E.useBooster(this.save, 'pop')) { this.boostersUsed++; this.persist(); this.setTargeting(null); sfx.booster(); haptic('heavy'); this.popPiece(p, true); }
      return;
    }
    this.canvas.setPointerCapture?.(e.pointerId);
    const local = sub(u, p.pos);
    this.drag = { piece: p, id: e.pointerId, start: u, last: u, dir: null, s: 0, t0: performance.now(), moved: false, lastBump: 0, grab: local, p0: this.arcPosOn(p, local) };
    this.ghost = null;
    sfx.grab(); haptic('light');
  }
  /** Arc position along the glyph's rest path nearest to a glyph-local point. */
  arcPosOn(piece, q) {
    const path = piece.g.path;
    let best = 0, bestD = Infinity, acc = 0;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      const abx = b.x - a.x, aby = b.y - a.y, l2 = abx * abx + aby * aby;
      const t = l2 > 1e-12 ? clamp(((q.x - a.x) * abx + (q.y - a.y) * aby) / l2, 0, 1) : 0;
      const d = Math.hypot(q.x - (a.x + abx * t), q.y - (a.y + aby * t));
      const segLen = Math.sqrt(l2);
      if (d < bestD) { bestD = d; best = acc + segLen * t; }
      acc += segLen;
    }
    return best;
  }
  /** Material position of the grab point on a direction's rail. */
  u0For(dir) { return dir.end === 'end' ? this.drag.p0 : dir.L - this.drag.p0; }
  chooseDir(T) {
    const { piece } = this.drag;
    if (!piece.dirs.length) return false;
    const nd = { x: T.x / (len(T) || 1), y: T.y / (len(T) || 1) };
    let best = null, bestScore = -Infinity;
    for (const dir of piece.dirs) {
      const u0 = this.u0For(dir);
      // which way does the finger move along the rope? positive = toward this open end
      const score = dot(nd, dir.tanAt(Math.min(u0 + 0.05, dir.railL)));
      if (score > bestScore) { bestScore = score; best = dir; }
    }
    if (!best || bestScore < 0.1) return false;
    this.drag.dir = best;
    this.drag.u0 = this.u0For(best);
    this.drag.sweep = this.board.sweep(piece, best);
    this.drag.s = 0;
    return true;
  }
  onMove(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    const u = this.toUnits(e);
    const delta = sub(u, d.last);
    d.last = u;
    const T = sub(u, d.start);
    if (len(T) > 0.05) d.moved = true;
    if (!d.dir) {
      if (len(T) < 0.09) return;
      if (!this.chooseDir(T)) { d.start = u; return; }
    }
    const dir = d.dir, sw = d.sweep;
    const limit = sw.sBlock < Infinity ? sw.sBlock : sw.sExit;
    // The grabbed point of the rope sits at rail position u0 + s. Find the progress whose grabbed
    // point is closest to the finger, searching a window around the current progress so the rope
    // follows the finger through corners and retraces.
    const F = sub(u, d.piece.pos);
    const lo = Math.max(0, d.s - 0.4), hi = Math.min(limit, d.s + Math.max(0.6, len(delta) * 2.5));
    let best = d.s, bestD = Infinity;
    const consider = (s) => { const q = dir.railAt(d.u0 + s); const dd = (q.x - F.x) ** 2 + (q.y - F.y) ** 2; if (dd < bestD - 1e-12) { bestD = dd; best = s; } };
    for (let s = lo; s < hi; s += 0.01) consider(s);
    consider(hi);
    if (best <= 1e-6 && dot(T, dir.tanAt(d.u0 + 0.05)) < -0.03 && len(T) > 0.09) { d.dir = null; d.s = 0; if (!this.chooseDir(T)) d.start = u; return; }
    if (best >= limit - 1e-6 && sw.sBlock < Infinity) {
      const over = dot(sub(F, dir.railAt(d.u0 + limit)), dir.tanAt(d.u0 + limit));
      if (over > 0.03) { if (!d.pushing) this.bump(d, sw.blocker); d.pushing = true; } else d.pushing = false;
    } else d.pushing = false;
    d.s = best;
    if (sw.sBlock === Infinity && best >= sw.sExit - 1e-6) this.completeExit(d.piece, dir, best);
  }
  bump(d, blocker) {
    const now = performance.now();
    if (now - d.lastBump < 150) return;
    d.lastBump = now; d.shake = now;
    this.bumps++; this.bumpsLeft--;
    const b = this.board.pieces[blocker];
    if (b) this.flash(b, 450, 'rgba(255,80,80,0.85)');
    sfx.bump(); haptic('error');
    this.renderHearts();
    if (this.bumpsLeft <= 0) this.outOfMoves();
  }
  outOfMoves() {
    this.paused = true;
    if (this.drag) { const d = this.drag; this.drag = null; if (d.dir) this.anims.push({ type: 'slide', piece: d.piece, dir: d.dir, from: d.s, to: 0, t0: performance.now(), dur: 260, ease: easeOutBack }); }
    sfx.fail(); haptic('heavy');
    const can = E.canAfford(this.save, E.CONTINUE_PRICE);
    const remaining = this.board.remaining;
    const actions = [
      { label: `Continue · +${E.CONTINUE_BUMPS} ♥ for 🪙 ${E.CONTINUE_PRICE}`, cls: 'gold', id: 'btn-continue', onClick: () => { if (!E.buyContinue(this.save)) return; sfx.coin(); this.updateCurrency(true); this.bumpBudget += E.CONTINUE_BUMPS; this.bumpsLeft += E.CONTINUE_BUMPS; this.renderHearts(); this.paused = false; } },
      { label: 'Retry', cls: 'secondary', onClick: () => this.restart() },
      { label: 'Home', cls: 'secondary', onClick: () => this.goHome() },
    ];
    if (!can) actions[0] = { label: `Need 🪙 ${E.CONTINUE_PRICE} to continue (you have ${this.save.coins})`, cls: 'secondary', onClick: () => this.outOfMoves() };
    if (!this.daily && E.canAfford(this.save, E.SKIP_PRICE)) actions.splice(1, 0, { label: `Skip level for 🪙 ${E.SKIP_PRICE}`, cls: 'secondary', onClick: () => { if (E.buySkip(this.save, this.level)) { this.updateCurrency(true); this.startLevel(this.level + 1); } } });
    this.showModal({ title: '💔 Out of moves', body: `<div>${remaining} letter${remaining === 1 ? '' : 's'} left. Every bump costs a heart, so hold a letter to preview its path before pulling.</div>`, actions, dismiss: false });
  }
  onUp(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.drag = null;
    const p = d.piece;
    const held = performance.now() - d.t0;
    if (!d.dir) {
      if (!d.moved && held < 450) {
        if (this.board.isFree(p)) { this.popPiece(p); return; }
        sfx.locked(); haptic('medium');
        this.flash(p, 350, 'rgba(255,255,255,0.5)');
        for (const q of this.board.active) {
          if (q === p) continue;
          const tmp = new Board(1, 1); tmp.pieces = [q];
          if (tmp.collider(p, 0.22) >= 0) this.flash(q, 500, 'rgba(255,120,120,0.75)');
        }
      } else if (!d.moved) this.showGhostFor(p);
      return;
    }
    const sw = d.sweep, clear = sw.sBlock === Infinity;
    if (clear && d.s >= sw.sExit * 0.3) {
      this.anims.push({ type: 'slide', piece: p, dir: d.dir, from: d.s, to: sw.sExit, t0: performance.now(), dur: 180 + (sw.sExit - d.s) * 120, onDone: () => this.completeExit(p, d.dir, sw.sExit) });
    } else {
      this.anims.push({ type: 'slide', piece: p, dir: d.dir, from: d.s, to: 0, t0: performance.now(), dur: 260, ease: easeOutBack });
    }
  }
  showGhostFor(p) {
    const dirs = p.dirs.map((dir) => { const sw = this.board.sweep(p, dir); return sw.sBlock === Infinity ? { dir, sEnd: this.board.headExitS(p, dir), ok: true } : { dir, sEnd: sw.sBlock, ok: false }; });
    this.ghost = { piece: p, dirs, until: performance.now() + 2200, pop: this.board.isFree(p) };
  }

  // ---------- removal ----------
  completeExit(p, dir, s) {
    if (p.removed) return;
    p.removed = true;
    this.anims = this.anims.filter((a) => a.piece !== p);
    if (this.drag && this.drag.piece === p) this.drag = null;
    const head = dir.headAt(s);
    this.anims.push({ type: 'pop', piece: p, dir, s, t0: performance.now(), dur: 320 });
    this.particles.burst(this.rect.x + (p.pos.x + head.x) * this.rect.scale, this.rect.y + (p.pos.y + head.y) * this.rect.scale, p.color, 16);
    sfx.pop(); haptic('medium');
    this.afterRemoval();
  }
  popPiece(p, forced = false) {
    if (p.removed) return;
    p.removed = true;
    const c = p.center;
    this.anims.push({ type: 'pop', piece: p, t0: performance.now(), dur: 360 });
    this.particles.burst(this.rect.x + c.x * this.rect.scale, this.rect.y + c.y * this.rect.scale, p.color, forced ? 34 : 22);
    sfx.pop(); haptic('medium');
    this.afterRemoval();
  }
  afterRemoval() {
    this.renderWordChips();
    this.ghost = null;
    if (this.reveal) this.reveal.items = this.reveal.items.filter((i) => !i.piece.removed);
    if (this.board.remaining === 0) { this.finished = true; setTimeout(() => this.win(), 420); }
  }
  win() {
    const res = E.recordClear(this.save, { level: this.level, wordLength: this.word.length, bumps: this.bumps, hints: this.hintsUsed, boosters: this.boostersUsed, daily: this.daily });
    this.persist();
    this.$('#win-eyebrow').textContent = this.daily ? 'Daily challenge cleared' : res.firstClear ? 'Word cleared' : 'Cleared again';
    this.$('#win-word').textContent = this.word;
    this.$('#win-stars').textContent = '★'.repeat(res.stars) + '☆'.repeat(3 - res.stars);
    this.$('#win-crown').classList.toggle('hidden', !res.crown);
    this.$('#win-fire').classList.toggle('hidden', !res.onFire);
    const secs = Math.round((performance.now() - this.startTime) / 1000);
    const parts = [`${secs}s`, `${this.bumps} bump${this.bumps === 1 ? '' : 's'}`];
    if (this.hintsUsed || this.boostersUsed) parts.push(`${this.hintsUsed + this.boostersUsed} booster${this.hintsUsed + this.boostersUsed === 1 ? '' : 's'}`);
    if (res.stars < 3) parts.push(res.stars === 2 ? 'no bumps or boosters for 3★' : 'fewer bumps for more stars');
    this.$('#win-meta').textContent = parts.join(' · ');
    const chLine = this.$('#win-chapter');
    chLine.classList.toggle('hidden', this.daily);
    if (!this.daily) this.setChapterLine(chLine, E.chapterOf(this.level));
    this.$('#btn-next').textContent = this.daily ? 'Done' : 'Next level';
    sfx.win(); haptic('success');
    if (res.crown) setTimeout(() => sfx.crown(), 400);
    for (let i = 0; i < 4; i++) this.particles.burst(this.W * (0.2 + 0.2 * i), this.H * 0.35, this.theme.palette[(i * 3) % this.theme.palette.length], 24);
    this.showScreen('win');
    // coin count-up + fly
    const el = this.$('#win-coins .val');
    el.textContent = '+0';
    const total = res.coins, t0 = performance.now();
    const tick = () => { const k = Math.min(1, (performance.now() - t0) / 900); el.textContent = '+' + Math.round(total * easeOut(k)); if (k < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    this.flyCoins(this.W / 2, this.H * 0.45, Math.min(12, 4 + Math.floor(total / 10)));
    if (!this.daily && E.canClaimChest(this.save, E.chapterOf(this.level))) this.toast('🎁 Chapter chest ready in Chapters!', 3000);
  }
  flyCoins(x, y, n) {
    const layer = this.$('#fly-layer');
    const target = this.$$('.pill.coins').find((p) => p.offsetParent !== null) || this.$('#home-coins');
    const tr = target.getBoundingClientRect();
    for (let i = 0; i < n; i++) {
      const c = document.createElement('span');
      c.className = 'fly'; c.textContent = '🪙';
      const sx = x + (Math.random() - 0.5) * 80, sy = y + (Math.random() - 0.5) * 60;
      c.style.transform = `translate(${sx}px, ${sy}px)`;
      layer.appendChild(c);
      setTimeout(() => { c.style.transform = `translate(${tr.left + tr.width / 2 - 11}px, ${tr.top + tr.height / 2 - 11}px) scale(0.6)`; c.style.opacity = '0.2'; sfx.coin(i); }, 60 + i * 55);
      setTimeout(() => { c.remove(); if (i === n - 1) this.updateCurrency(true); }, 900 + i * 55);
    }
  }

  // ---------- frame loop ----------
  frame(t) {
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    const ctx = this.ctx;
    try {
      const inPool = this.board && (this.screen === 'play' || this.screen === 'win');
      drawScene(ctx, this.W, this.H, inPool ? this.rect : null, this.dpr, this.theme);
      if (this.screen !== 'play' && this.screen !== 'win') this.drawTitle(t);
      if (inPool) this.drawPlay(ctx, t);
      this.particles.step(dt);
      this.particles.draw(ctx);
    } catch (err) { console.error(err); }
    requestAnimationFrame((tt) => this.frame(tt));
  }
  drawTitle(t) {
    if (this.screen !== 'home') return;
    const ctx = this.titleCtx, rect = this.titleRect;
    ctx.clearRect(0, 0, 400, 200);
    this.titleBoard.pieces.forEach((p, i) => {
      const off = { x: 0, y: Math.sin(t / 600 + i * 0.8) * 0.06 };
      drawPiece(ctx, p, rect, { off, lift: 0.2 + Math.sin(t / 600 + i * 0.8) * 0.2, dpr: Math.min(2, window.devicePixelRatio || 1) });
    });
  }
  drawPlay(ctx, t) {
    const rect = this.rect;
    drawRipples(ctx, rect, t, this.theme);
    const now = performance.now();
    const done = this.anims.filter((a) => now - a.t0 >= a.dur);
    for (const a of done) { const i = this.anims.indexOf(a); if (i >= 0) this.anims.splice(i, 1); a.onDone?.(); }
    const progress = (a) => clamp((now - a.t0) / a.dur, 0, 1);
    const dragging = this.drag && this.drag.dir ? this.drag.piece : null;
    const drawOne = (p) => {
      let off = { x: 0, y: 0 }, lift = 0, alpha = 1, scaleMul = 1, body = null;
      const anim = this.anims.find((a) => a.piece === p);
      if (anim && anim.type === 'slide') {
        const e = (anim.ease || easeOut)(progress(anim));
        body = anim.dir.bodyAt(Math.max(0, anim.from + (anim.to - anim.from) * e)); lift = 0.6;
      } else if (anim && anim.type === 'pop') {
        const k = progress(anim);
        alpha = 1 - k; lift = 1 + k * 1.5;
        if (anim.dir) body = anim.dir.bodyAt(anim.s + k * 0.6); else scaleMul = 1 + k * 0.5;
      } else if (this.drag && this.drag.piece === p) {
        lift = 1;
        if (this.drag.dir) body = this.drag.dir.bodyAt(this.drag.s);
        if (this.drag.shake && now - this.drag.shake < 180) off = { x: Math.sin((now - this.drag.shake) / 14) * 0.02 * (1 - (now - this.drag.shake) / 180), y: 0 };
      }
      const f = this.flashes.get(p);
      let flash = 0, flashColor;
      if (f) {
        if (now > f.until) this.flashes.delete(p);
        else { flash = 1 - (now - f.start) / (f.until - f.start); flashColor = f.color.replace(/[\d.]+\)$/, (m) => (parseFloat(m) * flash).toFixed(3) + ')'); }
      }
      if (body) {
        // a moving rope slips under the pool rim as it leaves
        ctx.save();
        roundRect(ctx, rect.x - 12, rect.y - 12, rect.w + 24, rect.h + 24, Math.min(28, rect.w * 0.08) + 10);
        ctx.clip();
        drawPiece(ctx, p, rect, { body, off, lift, alpha, scaleMul, flash: flash ? 1 : 0, flashColor, dpr: this.dpr });
        ctx.restore();
      } else {
        drawPiece(ctx, p, rect, { body, off, lift, alpha, scaleMul, flash: flash ? 1 : 0, flashColor, dpr: this.dpr });
      }
    };
    const drawGhostSet = (g) => {
      for (const d of g.dirs) drawGhostPath(ctx, g.piece, rect, d.dir, d.sEnd, d.ok, t);
      if (g.pop) {
        const c = g.piece.center;
        ctx.save(); ctx.font = '700 13px system-ui'; ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.textAlign = 'center';
        ctx.fillText('tap to pop', rect.x + c.x * rect.scale, rect.y + (c.y - g.piece.g.h / 2) * rect.scale - 10);
        ctx.restore();
      }
    };
    if (this.reveal) { if (now > this.reveal.until) this.reveal = null; else for (const g of this.reveal.items) if (!g.piece.removed) drawGhostSet(g); }
    if (this.ghost) { if (now > this.ghost.until || this.ghost.piece.removed) this.ghost = null; else drawGhostSet(this.ghost); }
    for (const p of this.board.pieces) {
      if (p === dragging) continue;
      if (p.removed && !this.anims.some((a) => a.piece === p)) continue;
      drawOne(p);
    }
    if (dragging) drawOne(dragging);
    if (this.drag && !this.drag.dir && !this.drag.moved && now - this.drag.t0 > 420 && !this.ghost) this.showGhostFor(this.drag.piece);
  }
}
