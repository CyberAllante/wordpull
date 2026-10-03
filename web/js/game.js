// Word Pool game controller: screens, input, animation and persistence.
import { dot, norm, len, sub, pointSegDist, clamp } from './geom.js';
import { STROKE_R } from './glyphs.js';
import { Piece, Board } from './engine.js';
import { getLevel, loadShippedLevels } from './levels.js';
import { PALETTE } from './generator.js';
import { layoutPool, drawScene, drawRipples, drawPiece, drawGhostPath, Particles, clearSpriteCache } from './render.js';
import { sfx, haptic, settings } from './audio.js';

const SAVE_KEY = 'wordpool.v1';
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

export class Game {
  constructor(root) {
    this.root = root;
    this.canvas = root.querySelector('#game');
    this.ctx = this.canvas.getContext('2d');
    this.$ = (sel) => root.querySelector(sel);
    this.particles = new Particles();
    this.anims = [];
    this.flashes = new Map(); // piece -> {until, color}
    this.screen = 'home';
    this.progress = this.load();
    settings.sound = this.progress.sound;
    settings.haptics = this.progress.haptics;
    this.bindUI();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
    this.showScreen('home');
    loadShippedLevels().then(() => this.updateHome());
    this.buildTitle();
  }

  // ---------- persistence ----------
  load() {
    const def = { unlocked: 1, stars: {}, sound: true, haptics: true };
    try { return { ...def, ...JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') }; } catch { return def; }
  }
  save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.progress)); } catch { /* ignore */ } }

  // ---------- UI ----------
  bindUI() {
    this.$('#btn-play').addEventListener('click', () => { sfx.tap(); this.startLevel(this.progress.unlocked); });
    this.$('#btn-levels').addEventListener('click', () => { sfx.tap(); this.showLevels(); });
    this.$('#btn-levels-back').addEventListener('click', () => { sfx.back(); this.showScreen('home'); });
    this.$('#btn-home').addEventListener('click', () => { sfx.back(); this.showScreen('home'); this.updateHome(); });
    this.$('#btn-restart').addEventListener('click', () => { sfx.tap(); this.startLevel(this.level); });
    this.$('#btn-hint').addEventListener('click', () => this.hint());
    this.$('#btn-next').addEventListener('click', () => { sfx.tap(); this.startLevel(this.level + 1); });
    this.$('#btn-win-home').addEventListener('click', () => { sfx.back(); this.showScreen('home'); this.updateHome(); });
    this.$('#btn-win-replay').addEventListener('click', () => { sfx.tap(); this.startLevel(this.level); });
    this.$('#tgl-sound').addEventListener('click', () => this.toggle('sound'));
    this.$('#tgl-haptics').addEventListener('click', () => this.toggle('haptics'));
    const reset = this.$('#btn-reset');
    reset.addEventListener('click', () => {
      // two-tap confirmation (dialogs are not available everywhere the game runs)
      if (reset.dataset.armed) {
        this.progress = { unlocked: 1, stars: {}, sound: settings.sound, haptics: settings.haptics };
        this.save(); this.updateHome();
        delete reset.dataset.armed; reset.textContent = 'Progress reset';
        setTimeout(() => { reset.textContent = 'Reset progress'; }, 1500);
      } else {
        reset.dataset.armed = '1'; reset.textContent = 'Tap again to confirm';
        setTimeout(() => { delete reset.dataset.armed; reset.textContent = 'Reset progress'; }, 2500);
      }
    });
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    c.addEventListener('pointermove', (e) => this.onMove(e));
    c.addEventListener('pointerup', (e) => this.onUp(e));
    c.addEventListener('pointercancel', (e) => this.onUp(e));
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    this.updateHome();
  }
  toggle(key) {
    this.progress[key] = !this.progress[key];
    settings[key] = this.progress[key];
    this.save(); this.updateHome(); sfx.tap();
  }
  updateHome() {
    this.$('#btn-play').textContent = this.progress.unlocked === 1 ? 'Play' : `Continue · Level ${this.progress.unlocked}`;
    this.$('#tgl-sound').textContent = `Sound: ${this.progress.sound ? 'On' : 'Off'}`;
    this.$('#tgl-haptics').textContent = `Haptics: ${this.progress.haptics ? 'On' : 'Off'}`;
    const total = Object.values(this.progress.stars).reduce((a, b) => a + b, 0);
    this.$('#home-stats').textContent = total ? `★ ${total}  ·  ${Object.keys(this.progress.stars).length} words cleared` : 'Pull every letter out of the pool.';
  }
  showScreen(name) {
    this.screen = name;
    for (const el of this.root.querySelectorAll('.screen')) el.classList.toggle('active', el.dataset.screen === name);
    this.$('#hud').classList.toggle('hidden', name !== 'play');
  }
  showLevels() {
    const grid = this.$('#level-grid');
    grid.innerHTML = '';
    const max = Math.max(60, this.progress.unlocked + 10);
    for (let i = 1; i <= max; i++) {
      const b = document.createElement('button');
      b.className = 'lvl' + (i > this.progress.unlocked ? ' locked' : '') + (i === this.progress.unlocked ? ' current' : '');
      const stars = this.progress.stars[i] || 0;
      b.innerHTML = `<span class="n">${i}</span><span class="s">${stars ? '★'.repeat(stars) : (i > this.progress.unlocked ? '🔒' : '')}</span>`;
      b.disabled = i > this.progress.unlocked;
      b.addEventListener('click', () => { sfx.tap(); this.startLevel(i); });
      grid.appendChild(b);
    }
    this.showScreen('levels');
  }
  buildTitle() {
    // Animated title made of real game pieces.
    const c = this.$('#title-canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = 320, H = 110;
    c.width = W * dpr; c.height = H * dpr; c.style.width = W + 'px'; c.style.height = H + 'px';
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    const word = 'WordPool';
    const board = new Board(10, 3);
    let x = 0.15;
    board.pieces = word.split('').map((ch, i) => { const p = new Piece(ch, { x, y: 0 }, PALETTE[i * 2 % PALETTE.length]); p.pos.y = 1.5 - p.g.baseline; x += p.g.w + 0.14; return p; });
    board.w = x + 0.1;
    this.titleBoard = board;
    this.titleCtx = ctx;
    this.titleRect = layoutPool(board, { x: 0, y: 0, w: W, h: H }, 6);
  }

  // ---------- level lifecycle ----------
  startLevel(n) {
    this.level = n;
    const { word, board } = getLevel(n);
    this.word = word;
    this.board = board;
    this.drag = null;
    this.anims = [];
    this.flashes.clear();
    this.bumps = 0; this.hintsUsed = 0; this.startTime = performance.now();
    this.ghost = null;
    this.finished = false;
    this.$('#hud-level').textContent = `Level ${n}`;
    this.renderWordChips();
    this.showScreen('play');
    this.resize();
    this.$('#tutorial').textContent = n === 1 ? 'Drag a letter along its own shape to pull it out of the pool.' : n === 2 ? 'Blocked? Another letter is in the way. Find one that can escape first.' : n === 3 ? 'A letter that floats free (touching nothing) can be popped with a tap.' : '';
  }
  renderWordChips() {
    const row = this.$('#word-row');
    row.innerHTML = '';
    this.board.pieces.forEach((p, i) => {
      const s = document.createElement('span');
      s.className = 'chip' + (p.removed ? ' done' : '');
      s.textContent = p.ch;
      s.style.setProperty('--c', p.color);
      s.dataset.i = i;
      row.appendChild(s);
    });
  }
  hint() {
    if (!this.board || this.finished) return;
    sfx.tap();
    this.hintsUsed++;
    for (const p of this.board.active) {
      if (this.anims.some((a) => a.piece === p)) continue;
      const r = this.board.removable(p);
      if (!r) continue;
      this.ghost = { piece: p, until: performance.now() + 2500, dirs: r.pull ? r.pull.map((d) => ({ dir: d.dir, sEnd: d.sExit, ok: true })) : [], pop: !!r.pop };
      this.flash(p, 900, 'rgba(255,255,255,0.7)');
      return;
    }
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
    const hud = this.$('#hud');
    const top = hud.offsetHeight + 8;
    const bottom = 24 + (parseFloat(getComputedStyle(this.root).getPropertyValue('--safe-bottom')) || 0);
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
      // fallback: inside the letter's box (e.g. the bowl of a P or the middle of an O)
      const b = p.bboxAt(null);
      if (u.x >= b.minX && u.x <= b.maxX && u.y >= b.minY && u.y <= b.maxY && dMin < inBoxD) { inBoxD = dMin; inBox = p; }
    }
    const slack = STROKE_R + 14 / this.rect.scale;
    if (bestD <= slack) return best;
    return inBox;
  }

  // ---------- input ----------
  onDown(e) {
    if (this.screen !== 'play' || this.finished || this.drag) return;
    const u = this.toUnits(e);
    const p = this.pieceAt(u);
    if (!p) return;
    this.canvas.setPointerCapture?.(e.pointerId);
    this.drag = { piece: p, id: e.pointerId, start: u, last: u, acc: { x: 0, y: 0 }, dir: null, s: 0, t0: performance.now(), moved: false, lastBump: 0, grab: sub(u, p.pos) };
    this.ghost = null;
    sfx.grab(); haptic('light');
  }
  chooseDir(d) {
    const { piece, grab } = this.drag;
    const nd = norm(d);
    let best = null, bestScore = -Infinity;
    for (const dir of piece.dirs) {
      const prox = 1 - clamp(len(sub(grab, dir.startPt)) / (2 * piece.g.radius), 0, 1);
      const score = dot(nd, dir.startTan) + 0.25 * prox;
      if (score > bestScore) { bestScore = score; best = dir; }
    }
    if (!best || bestScore < 0.15) return false;
    const sw = this.board.sweep(piece, best);
    this.drag.dir = best;
    this.drag.sweep = sw;
    this.drag.s = 0;
    return true;
  }
  onMove(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    const u = this.toUnits(e);
    const delta = sub(u, d.last);
    d.last = u;
    const T = sub(u, d.start); // where the finger wants the letter to be, relative to the grab
    if (len(T) > 0.05) d.moved = true;
    if (!d.dir) {
      if (len(T) < 0.09) return;
      if (!this.chooseDir(T)) { d.start = u; return; }
    }
    const dir = d.dir, sw = d.sweep;
    const limit = sw.sBlock < Infinity ? sw.sBlock : sw.sExit;
    // Scrub along the path: find the point of the pull path closest to the finger, searching a
    // window around the current progress so the letter follows the finger through corners.
    const lo = Math.max(0, d.s - 0.4), hi = Math.min(limit, d.s + Math.max(0.6, len(delta) * 2.5));
    let best = d.s, bestD = Infinity;
    const consider = (s) => {
      const o = dir.disp(s);
      const dd = (o.x - T.x) ** 2 + (o.y - T.y) ** 2;
      if (dd < bestD - 1e-12) { bestD = dd; best = s; }
    };
    for (let s = lo; s < hi; s += 0.01) consider(s);
    consider(hi);
    if (best <= 1e-6) {
      // back at the start: allow picking a different direction
      if (dot(T, dir.startTan) < -0.03 && len(T) > 0.09) { d.dir = null; d.s = 0; if (!this.chooseDir(T)) d.start = u; return; }
    }
    if (best >= limit - 1e-6 && sw.sBlock < Infinity) {
      const over = dot(sub(T, dir.disp(limit)), dir.tan(limit));
      if (over > 0.03) { if (!d.pushing) this.bump(d, sw.blocker); d.pushing = true; }
      else d.pushing = false;
    } else d.pushing = false;
    d.s = best;
    if (sw.sBlock === Infinity && best >= sw.sExit - 1e-6) this.completeExit(d.piece, dir, best);
  }
  bump(d, blocker) {
    const now = performance.now();
    if (now - d.lastBump < 150) return;
    d.lastBump = now;
    d.shake = now;
    this.bumps++;
    const b = this.board.pieces[blocker];
    if (b) this.flash(b, 450, 'rgba(255,80,80,0.85)');
    sfx.bump(); haptic('error');
  }
  onUp(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.drag = null;
    const p = d.piece;
    const held = performance.now() - d.t0;
    if (!d.dir) {
      // tap: pop if free, otherwise show what is holding it
      if (!d.moved && held < 450) {
        if (this.board.isFree(p)) { this.popPiece(p); return; }
        sfx.locked(); haptic('medium');
        this.flash(p, 350, 'rgba(255,255,255,0.5)');
        for (const q of this.board.active) {
          if (q !== p && this.board.collider(p, null, 0.22) >= 0) {
            // flash each touching neighbour
            const tmp = new Board(1, 1); tmp.pieces = [q];
            if (tmp.collider(p, null, 0.22) >= 0) this.flash(q, 500, 'rgba(255,120,120,0.75)');
          }
        }
      } else if (!d.moved && held >= 450) {
        this.showGhostFor(p);
      }
      return;
    }
    const sw = d.sweep;
    const clear = sw.sBlock === Infinity;
    if (clear && d.s >= sw.sExit * 0.3) {
      this.anims.push({ type: 'slide', piece: p, dir: d.dir, from: d.s, to: sw.sExit, t0: performance.now(), dur: 180 + (sw.sExit - d.s) * 120, onDone: () => this.completeExit(p, d.dir, sw.sExit) });
    } else {
      this.anims.push({ type: 'slide', piece: p, dir: d.dir, from: d.s, to: 0, t0: performance.now(), dur: 260, ease: easeOutBack });
    }
  }
  showGhostFor(p) {
    const dirs = p.dirs.map((dir) => {
      const sw = this.board.sweep(p, dir);
      return sw.sBlock === Infinity ? { dir, sEnd: sw.sExit, ok: true } : { dir, sEnd: sw.sBlock, ok: false };
    });
    this.ghost = { piece: p, dirs, until: performance.now() + 2200, pop: this.board.isFree(p) };
  }

  // ---------- removal ----------
  completeExit(p, dir, s) {
    if (p.removed) return;
    p.removed = true;
    this.anims = this.anims.filter((a) => a.piece !== p);
    if (this.drag && this.drag.piece === p) this.drag = null;
    const off = dir.disp(s);
    const c = p.center;
    this.anims.push({ type: 'pop', piece: p, off, t0: performance.now(), dur: 320 });
    this.particles.burst(this.rect.x + (c.x + off.x) * this.rect.scale, this.rect.y + (c.y + off.y) * this.rect.scale, p.color, 16);
    sfx.pop(); haptic('medium');
    this.afterRemoval();
  }
  popPiece(p) {
    if (p.removed) return;
    p.removed = true;
    const c = p.center;
    this.anims.push({ type: 'pop', piece: p, off: { x: 0, y: 0 }, t0: performance.now(), dur: 360, lift: true });
    this.particles.burst(this.rect.x + c.x * this.rect.scale, this.rect.y + c.y * this.rect.scale, p.color, 22);
    sfx.pop(); haptic('medium');
    this.afterRemoval();
  }
  afterRemoval() {
    this.renderWordChips();
    this.ghost = null;
    if (this.board.remaining === 0) {
      this.finished = true;
      setTimeout(() => this.win(), 420);
    }
  }
  win() {
    const stars = this.bumps <= 1 && this.hintsUsed === 0 ? 3 : this.bumps <= 4 ? 2 : 1;
    const prev = this.progress.stars[this.level] || 0;
    this.progress.stars[this.level] = Math.max(prev, stars);
    this.progress.unlocked = Math.max(this.progress.unlocked, this.level + 1);
    this.save();
    this.$('#win-word').textContent = this.word;
    this.$('#win-stars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    const secs = Math.round((performance.now() - this.startTime) / 1000);
    this.$('#win-meta').textContent = `${secs}s · ${this.bumps} bump${this.bumps === 1 ? '' : 's'}${this.hintsUsed ? ` · ${this.hintsUsed} hint${this.hintsUsed === 1 ? '' : 's'}` : ''}`;
    sfx.win(); haptic('success');
    for (let i = 0; i < 4; i++) this.particles.burst(this.W * (0.2 + 0.2 * i), this.H * 0.35, PALETTE[(i * 3) % PALETTE.length], 24);
    this.showScreen('win');
  }

  // ---------- frame loop ----------
  frame(t) {
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    const ctx = this.ctx;
    try {
      const inPool = this.board && (this.screen === 'play' || this.screen === 'win');
      drawScene(ctx, this.W, this.H, inPool ? this.rect : null, this.dpr);
      if (this.screen === 'home' || this.screen === 'levels') this.drawTitle(t);
      if (this.board && (this.screen === 'play' || this.screen === 'win')) this.drawPlay(ctx, t);
      this.particles.step(dt);
      this.particles.draw(ctx);
    } catch (err) {
      console.error(err);
    }
    requestAnimationFrame((tt) => this.frame(tt));
  }
  drawTitle(t) {
    const ctx = this.titleCtx, rect = this.titleRect;
    ctx.clearRect(0, 0, 400, 200);
    this.titleBoard.pieces.forEach((p, i) => {
      const off = { x: 0, y: Math.sin(t / 600 + i * 0.8) * 0.06 };
      drawPiece(ctx, p, rect, { off, lift: 0.2 + Math.sin(t / 600 + i * 0.8) * 0.2, dpr: Math.min(2, window.devicePixelRatio || 1) });
    });
  }
  drawPlay(ctx, t) {
    const rect = this.rect;
    drawRipples(ctx, rect, t);
    const now = performance.now();
    // advance animations
    const done = this.anims.filter((a) => now - a.t0 >= a.dur);
    for (const a of done) {
      const i = this.anims.indexOf(a);
      if (i >= 0) this.anims.splice(i, 1);
      if (a.onDone) a.onDone();
    }
    const progress = (a) => clamp((now - a.t0) / a.dur, 0, 1);
    const dragging = this.drag && this.drag.dir ? this.drag.piece : null;
    const drawOne = (p) => {
      let off = { x: 0, y: 0 }, lift = 0, alpha = 1, scaleMul = 1;
      const anim = this.anims.find((a) => a.piece === p);
      if (anim && anim.type === 'slide') {
        const e = (anim.ease || easeOut)(progress(anim));
        const s = anim.from + (anim.to - anim.from) * e;
        off = anim.dir.disp(Math.max(0, s));
        lift = 0.6;
      } else if (anim && anim.type === 'pop') {
        off = anim.off;
        const k = progress(anim);
        scaleMul = 1 + k * 0.5;
        alpha = 1 - k;
        lift = 1 + k * 1.5;
      } else if (this.drag && this.drag.piece === p) {
        lift = 1;
        if (this.drag.dir) off = this.drag.dir.disp(this.drag.s);
        if (this.drag.shake && now - this.drag.shake < 180) {
          const sh = Math.sin((now - this.drag.shake) / 14) * 0.02 * (1 - (now - this.drag.shake) / 180);
          off = { x: off.x + sh, y: off.y };
        }
      }
      const f = this.flashes.get(p);
      let flash = 0, flashColor;
      if (f) {
        if (now > f.until) this.flashes.delete(p);
        else { flash = 1 - (now - f.start) / (f.until - f.start); flashColor = f.color.replace(/[\d.]+\)$/, (m) => (parseFloat(m) * flash).toFixed(3) + ')'); }
      }
      drawPiece(ctx, p, rect, { off, lift, alpha, scaleMul, flash: flash ? 1 : 0, flashColor });
    };
    // ghost path first (under letters)
    if (this.ghost) {
      if (now > this.ghost.until || this.ghost.piece.removed) this.ghost = null;
      else {
        for (const g of this.ghost.dirs) drawGhostPath(ctx, this.ghost.piece, rect, g.dir, g.sEnd, g.ok, t);
        if (this.ghost.pop) {
          const c = this.ghost.piece.center;
          ctx.save(); ctx.font = '600 14px system-ui'; ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.textAlign = 'center';
          ctx.fillText('tap to pop', rect.x + c.x * rect.scale, rect.y + (c.y - this.ghost.piece.g.h / 2) * rect.scale - 10);
          ctx.restore();
        }
      }
    }
    for (const p of this.board.pieces) {
      if (p === dragging) continue;
      if (p.removed && !this.anims.some((a) => a.piece === p)) continue;
      drawOne(p);
    }
    if (dragging) drawOne(dragging);
    // long-press ghost preview while holding still
    if (this.drag && !this.drag.dir && !this.drag.moved && now - this.drag.t0 > 420 && !this.ghost) this.showGhostFor(this.drag.piece);
  }
}
