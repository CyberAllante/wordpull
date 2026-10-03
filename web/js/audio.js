// Tiny synthesized sound effects + haptics (no asset files needed).
let ctx = null;
export const settings = { sound: true, haptics: true };

function ac() {
  if (!settings.sound) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch { return null; }
}

function tone({ type = 'sine', f0 = 440, f1 = f0, dur = 0.15, gain = 0.2, when = 0 }) {
  const a = ac(); if (!a) return;
  const t = a.currentTime + when;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

export const sfx = {
  grab() { tone({ f0: 320, f1: 420, dur: 0.06, gain: 0.05 }); },
  pop() { tone({ f0: 520, f1: 1240, dur: 0.16, gain: 0.18 }); tone({ type: 'triangle', f0: 900, f1: 1800, dur: 0.12, gain: 0.06, when: 0.03 }); },
  bump() { tone({ type: 'square', f0: 140, f1: 90, dur: 0.08, gain: 0.08 }); },
  locked() { tone({ type: 'triangle', f0: 220, f1: 200, dur: 0.1, gain: 0.06 }); },
  back() { tone({ f0: 400, f1: 260, dur: 0.1, gain: 0.05 }); },
  tap() { tone({ f0: 700, f1: 700, dur: 0.04, gain: 0.04 }); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'triangle', f0: f, f1: f, dur: 0.25, gain: 0.12, when: i * 0.09 })); },
};

export function haptic(kind = 'light') {
  if (!settings.haptics) return;
  try {
    const H = window.Capacitor?.Plugins?.Haptics;
    if (H) {
      if (kind === 'success') H.notification({ type: 'SUCCESS' });
      else if (kind === 'error') H.notification({ type: 'ERROR' });
      else H.impact({ style: kind === 'heavy' ? 'HEAVY' : kind === 'medium' ? 'MEDIUM' : 'LIGHT' });
      return;
    }
    if (navigator.vibrate) navigator.vibrate(kind === 'heavy' || kind === 'error' ? 30 : kind === 'success' ? [15, 40, 15] : 8);
  } catch { /* ignore */ }
}
