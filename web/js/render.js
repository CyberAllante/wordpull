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

export function drawBackground(ctx, W, H, t) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0f1b3d');
  g.addColorStop(1, '#070b1c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // soft drifting blobs
  ctx.save();
  ctx.globalAlpha = 0.18;
  for (let i = 0; i < 3; i++) {
    const x = W * (0.2 + 0.3 * i) + Math.sin(t / 4000 + i) * 40;
    const y = H * (0.25 + 0.25 * i) + Math.cos(t / 5000 + i * 2) * 50;
    const rg = ctx.createRadialGradient(x, y, 0, x, y, W * 0.45);
    rg.addColorStop(0, ['#4c6fff', '#38d9a9', '#da77f2'][i]);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

export function drawPool(ctx, rect, t) {
  const { x, y, w, h } = rect;
  const r = Math.min(28, w * 0.08);
  ctx.save();
  // rim shadow
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 14;
  roundRect(ctx, x - 10, y - 10, w + 20, h + 20, r + 8);
  ctx.fillStyle = '#1b2a5a';
  ctx.fill();
  ctx.restore();
  // rim
  ctx.save();
  roundRect(ctx, x - 10, y - 10, w + 20, h + 20, r + 8);
  const rim = ctx.createLinearGradient(x, y - 10, x, y + h + 10);
  rim.addColorStop(0, '#2b3f85');
  rim.addColorStop(1, '#13204a');
  ctx.fillStyle = rim;
  ctx.fill();
  // water
  roundRect(ctx, x, y, w, h, r);
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, '#0d6fa8');
  g.addColorStop(0.5, '#0a4f8a');
  g.addColorStop(1, '#083a6b');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.clip();
  // caustic ripples
  ctx.globalAlpha = 0.09;
  ctx.strokeStyle = '#bff3ff';
  ctx.lineWidth = 2;
  for (let i = 0; i < 7; i++) {
    ctx.beginPath();
    for (let px = 0; px <= w; px += 8) {
      const py = (h / 7) * i + h / 14 + Math.sin(px / 38 + t / 900 + i * 1.7) * 6 + Math.cos(px / 71 - t / 1300) * 4;
      if (px === 0) ctx.moveTo(x + px, y + py); else ctx.lineTo(x + px, y + py);
    }
    ctx.stroke();
  }
  // inner shadow at the top edge
  ctx.globalAlpha = 1;
  const inner = ctx.createLinearGradient(x, y, x, y + 40);
  inner.addColorStop(0, 'rgba(0,0,0,0.35)');
  inner.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = inner;
  ctx.fillRect(x, y, w, 40);
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

/**
 * Draw a letter piece.
 * opts: { off:{x,y} (pool units), lift (0..1), alpha, scaleMul, flash (0..1 white), tint }
 */
export function drawPiece(ctx, piece, rect, opts = {}) {
  const { scale } = rect;
  const off = opts.off || { x: 0, y: 0 };
  const lift = opts.lift || 0;
  const alpha = opts.alpha ?? 1;
  const mul = opts.scaleMul ?? 1;
  const g = piece.g;
  const cx = rect.x + (piece.pos.x + off.x + g.center.x) * scale;
  const cy = rect.y + (piece.pos.y + off.y + g.center.y) * scale;
  const s = scale * mul;
  const ox = cx - g.center.x * s, oy = cy - g.center.y * s - lift * 10;
  const lw = STROKE_R * 2 * s;
  const depth = Math.max(3, lw * 0.28) + lift * 6;
  const color = opts.tint || piece.color;

  ctx.save();
  ctx.globalAlpha = alpha;
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
  // flash overlay (bump / locked feedback)
  if (opts.flash) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = opts.flashColor || `rgba(255,255,255,${opts.flash})`;
    ctx.globalAlpha = alpha * opts.flash;
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
