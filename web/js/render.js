// Canvas renderer: pseudo-3D tube letters in a glowing pool.
import { STROKE_R } from './glyphs.js';

export function shade(hex, amt) {
  // amt in [-1, 1]: negative darkens, positive lightens
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (c) => Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Compute the pool rectangle (CSS px) that fits a board into an area. */
export function layoutPool(board, area, pad = 18) {
  const scale = Math.min((area.w - pad * 2) / board.w, (area.h - pad * 2) / board.h);
  const w = board.w * scale, h = board.h * scale;
  return { x: area.x + (area.w - w) / 2, y: area.y + (area.h - h) / 2, w, h, scale };
}

function paintBackground(ctx, W, H) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0f1b3d');
  g.addColorStop(1, '#070b1c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.globalAlpha = 0.18;
  for (let i = 0; i < 3; i++) {
    const x = W * (0.2 + 0.3 * i), y = H * (0.25 + 0.25 * i);
    const rg = ctx.createRadialGradient(x, y, 0, x, y, W * 0.45);
    rg.addColorStop(0, ['#4c6fff', '#38d9a9', '#da77f2'][i]);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

function paintPool(ctx, rect) {
  const { x, y, w, h } = rect;
  const r = Math.min(28, w * 0.08);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 14;
  roundRect(ctx, x - 10, y - 10, w + 20, h + 20, r + 8);
  ctx.fillStyle = '#1b2a5a';
  ctx.fill();
  ctx.restore();
  ctx.save();
  roundRect(ctx, x - 10, y - 10, w + 20, h + 20, r + 8);
  const rim = ctx.createLinearGradient(x, y - 10, x, y + h + 10);
  rim.addColorStop(0, '#2b3f85');
  rim.addColorStop(1, '#13204a');
  ctx.fillStyle = rim;
  ctx.fill();
  roundRect(ctx, x, y, w, h, r);
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, '#0d6fa8');
  g.addColorStop(0.5, '#0a4f8a');
  g.addColorStop(1, '#083a6b');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.clip();
  const inner = ctx.createLinearGradient(x, y, x, y + 40);
  inner.addColorStop(0, 'rgba(0,0,0,0.35)');
  inner.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = inner;
  ctx.fillRect(x, y, w, 40);
  ctx.restore();
}

// The background and pool are static between resizes, so they are painted once into a layer.
let sceneLayer = null;
export function drawScene(ctx, W, H, rect, dpr) {
  const key = `${W}|${H}|${rect ? `${rect.x.toFixed(1)},${rect.y.toFixed(1)},${rect.w.toFixed(1)},${rect.h.toFixed(1)}` : '-'}|${dpr}`;
  if (!sceneLayer || sceneLayer.key !== key) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(W * dpr); c.height = Math.ceil(H * dpr);
    const cx = c.getContext('2d');
    cx.scale(dpr, dpr);
    paintBackground(cx, W, H);
    if (rect) paintPool(cx, rect);
    sceneLayer = { key, canvas: c };
  }
  ctx.drawImage(sceneLayer.canvas, 0, 0, W, H);
}

/** Animated caustic ripples on the water (cheap, drawn live). */
export function drawRipples(ctx, rect, t) {
  const { x, y, w, h } = rect;
  const r = Math.min(28, w * 0.08);
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.clip();
  ctx.globalAlpha = 0.09;
  ctx.strokeStyle = '#bff3ff';
  ctx.lineWidth = 2;
  for (let i = 0; i < 7; i++) {
    ctx.beginPath();
    for (let px = 0; px <= w; px += 10) {
      const py = (h / 7) * i + h / 14 + Math.sin(px / 38 + t / 900 + i * 1.7) * 6 + Math.cos(px / 71 - t / 1300) * 4;
      if (px === 0) ctx.moveTo(x + px, y + py); else ctx.lineTo(x + px, y + py);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function strokePath(ctx, pts, ox, oy, scale) {
  ctx.beginPath();
  if (pts.length === 1) {
    ctx.arc(ox + pts[0].x * scale, oy + pts[0].y * scale, 0.01, 0, Math.PI * 2);
    return;
  }
  ctx.moveTo(ox + pts[0].x * scale, oy + pts[0].y * scale);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(ox + pts[i].x * scale, oy + pts[i].y * scale);
}

/** Paint a glyph (shadow, extrusion, face, highlight) with its box origin at (ox, oy). */
function paintGlyph(ctx, g, color, ox, oy, s, lift) {
  const lw = STROKE_R * 2 * s;
  const depth = Math.max(3, lw * 0.28) + lift * 6;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = lw;
  // drop shadow
  ctx.save();
  ctx.translate(2 + lift * 6, depth + 6 + lift * 10);
  ctx.strokeStyle = `rgba(0,0,0,${0.32 + lift * 0.15})`;
  ctx.filter = `blur(${3 + lift * 4}px)`;
  for (const st of g.strokes) { strokePath(ctx, st.pts, ox, oy, s); ctx.stroke(); }
  ctx.filter = 'none';
  ctx.restore();
  // extruded side
  ctx.strokeStyle = shade(color, -0.45);
  for (let d = depth; d >= 1; d -= 1.5) {
    ctx.save();
    ctx.translate(0, d);
    for (const st of g.strokes) { strokePath(ctx, st.pts, ox, oy, s); ctx.stroke(); }
    ctx.restore();
  }
  // top face
  const grad = ctx.createLinearGradient(ox, oy, ox, oy + g.h * s);
  grad.addColorStop(0, shade(color, 0.18));
  grad.addColorStop(1, shade(color, -0.12));
  ctx.strokeStyle = grad;
  for (const st of g.strokes) { strokePath(ctx, st.pts, ox, oy, s); ctx.stroke(); }
  // highlight
  ctx.lineWidth = lw * 0.32;
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.save();
  ctx.translate(-lw * 0.14, -lw * 0.18);
  for (const st of g.strokes) { strokePath(ctx, st.pts, ox, oy, s); ctx.stroke(); }
  ctx.restore();
  ctx.restore();
}

// Pre-rendered letter sprites: blur filters are expensive, so each letter is painted once per
// (scale, lift level) into an offscreen canvas and blitted every frame.
const spriteCache = new Map();
export function clearSpriteCache() { spriteCache.clear(); }
function pieceSprite(piece, scale, lift, dpr) {
  const key = `${piece.ch}|${piece.color}|${Math.round(scale * 4)}|${lift}|${dpr}`;
  let sp = spriteCache.get(key);
  if (sp) return sp;
  const g = piece.g;
  const pad = 36 + lift * 18;
  const w = g.w * scale + pad * 2, h = g.h * scale + pad * 2;
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * dpr); c.height = Math.ceil(h * dpr);
  const cx = c.getContext('2d');
  cx.scale(dpr, dpr);
  paintGlyph(cx, g, piece.color, pad, pad, scale, lift);
  sp = { canvas: c, pad, w, h };
  if (spriteCache.size > 160) spriteCache.clear();
  spriteCache.set(key, sp);
  return sp;
}

/**
 * Draw a letter piece.
 * opts: { off:{x,y} (pool units), lift (0..1+), alpha, scaleMul, flash (0..1), flashColor, dpr }
 */
export function drawPiece(ctx, piece, rect, opts = {}) {
  const { scale } = rect;
  const off = opts.off || { x: 0, y: 0 };
  const lift = opts.lift || 0;
  const alpha = opts.alpha ?? 1;
  const mul = opts.scaleMul ?? 1;
  const dpr = opts.dpr || Math.min(3, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  const g = piece.g;
  const cx = rect.x + (piece.pos.x + off.x + g.center.x) * scale;
  const cy = rect.y + (piece.pos.y + off.y + g.center.y) * scale - lift * 10;
  // lift is bucketed so the cache stays small; the vertical offset above stays continuous
  const liftKey = Math.min(1.5, Math.round(lift * 4) / 4);
  const sp = pieceSprite(piece, scale, liftKey, dpr);
  const s = scale * mul;
  ctx.save();
  ctx.globalAlpha = alpha;
  // glyph box origin (CSS px) for the scaled sprite, keeping the glyph centre fixed
  const ox = cx - g.center.x * s, oy = cy - g.center.y * s;
  ctx.drawImage(sp.canvas, ox - sp.pad * mul, oy - sp.pad * mul, sp.w * mul, sp.h * mul);
  if (opts.flash) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = STROKE_R * 2 * s;
    ctx.strokeStyle = opts.flashColor || `rgba(255,255,255,${opts.flash})`;
    for (const st of g.strokes) { strokePath(ctx, st.pts, ox, oy, s); ctx.stroke(); }
  }
  ctx.restore();
}

/** Dotted ghost path showing where a letter can travel. */
export function drawGhostPath(ctx, piece, rect, dir, sEnd, ok, t) {
  const { scale } = rect;
  const c = piece.center;
  ctx.save();
  ctx.setLineDash([6, 8]);
  ctx.lineDashOffset = -(t / 40) % 14;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.strokeStyle = ok ? 'rgba(255,255,255,0.85)' : 'rgba(255,90,90,0.8)';
  ctx.beginPath();
  const n = Math.max(8, Math.ceil(sEnd / 0.05));
  let last = null;
  for (let i = 0; i <= n; i++) {
    const s = (sEnd * i) / n;
    const o = dir.disp(s);
    const px = rect.x + (c.x + o.x) * scale, py = rect.y + (c.y + o.y) * scale;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    last = { x: px, y: py, s };
  }
  ctx.stroke();
  ctx.setLineDash([]);
  if (last) {
    const tan = dir.tan(sEnd);
    ctx.translate(last.x, last.y);
    ctx.rotate(Math.atan2(tan.y, tan.x));
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    if (ok) { ctx.moveTo(10, 0); ctx.lineTo(-4, -7); ctx.lineTo(-4, 7); ctx.closePath(); ctx.fill(); }
    else { ctx.lineWidth = 3; ctx.moveTo(-6, -6); ctx.lineTo(6, 6); ctx.moveTo(6, -6); ctx.lineTo(-6, 6); ctx.stroke(); }
  }
  ctx.restore();
}

/** Simple particle burst. */
export class Particles {
  constructor() { this.list = []; }
  burst(x, y, color, n = 18) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 80 + Math.random() * 220;
      this.list.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: 0.6 + Math.random() * 0.5, age: 0, color, r: 3 + Math.random() * 4 });
    }
  }
  step(dt) {
    for (const p of this.list) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 500 * dt; }
    this.list = this.list.filter((p) => p.age < p.life);
  }
  draw(ctx) {
    for (const p of this.list) {
      ctx.globalAlpha = 1 - p.age / p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (1 - p.age / p.life * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
