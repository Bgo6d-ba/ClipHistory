const fs = require('fs');
const path = require('path');
const TL = require('./timeline.js');
const { BEAT, BAR, S16, S32, bar, at, CUES } = TL;
const SR = 48000, DUR = TL.DURATION, N = SR * DUR, TAU = Math.PI * 2;

let seed = 20261029;
const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const noise = () => rand() * 2 - 1;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const inv = (a, b, x) => clamp((x - a) / (b - a));
const bus = () => ({ L: new Float32Array(N), R: new Float32Array(N) });
const B = { drums: bus(), bass: bus(), music: bus(), fx: bus(), rev: bus(), dly: bus() };
function put(b, t0, sig, gain = 1, pan = 0, rev = 0, dly = 0) {
  const i0 = Math.round(t0 * SR);
  const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4) * Math.SQRT2, gr = gain * Math.sin(((pan + 1) * Math.PI) / 4) * Math.SQRT2;
  const st = sig.L !== undefined, len = st ? sig.L.length : sig.length;
  for (let i = 0; i < len; i++) {
    const j = i0 + i;
    if (j < 0 || j >= N) continue;
    const l = (st ? sig.L[i] : sig[i]) * gl, r = (st ? sig.R[i] : sig[i]) * gr;
    b.L[j] += l; b.R[j] += r;
    if (rev) { B.rev.L[j] += l * rev; B.rev.R[j] += r * rev; }
    if (dly) { B.dly.L[j] += l * dly; B.dly.R[j] += r * dly; }
  }
}
class SVF {
  constructor() { this.a = 0; this.b = 0; this.lp = 0; this.bp = 0; this.hp = 0; }
  run(x, fc, q) {
    const g = Math.tan((Math.PI * Math.min(Math.max(fc, 20), SR * 0.45)) / SR), k = 1 / q;
    const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
    const v3 = x - this.b, v1 = a1 * this.a + a2 * v3, v2 = this.b + a2 * this.a + a3 * v3;
    this.a = 2 * v1 - this.a; this.b = 2 * v2 - this.b;
    this.lp = v2; this.bp = v1; this.hp = x - k * v1 - v2;
    return v2;
  }
}
function blep(t, dt) { if (t < dt) { t /= dt; return t + t - t * t - 1; } if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; } return 0; }
class Saw { constructor(ph = 0) { this.ph = ph; } next(f) { const dt = f / SR; this.ph += dt; if (this.ph >= 1) this.ph -= 1; return 2 * this.ph - 1 - blep(this.ph, dt); } }
const buf = (sec) => new Float32Array(Math.floor(sec * SR));

// ---------------------------------------------------------------- instruments
function kick(vel = 1, tone = 1, len = 0.5) {
  const o = buf(len); let ph = 0;
  for (let i = 0; i < o.length; i++) {
    const t = i / SR, f = 42 + 150 * Math.exp(-t * 30) * tone + 25 * Math.exp(-t * 7);
    ph += f / SR;
    const env = Math.min(1, t / 0.0015) * Math.exp(-t * 5.2);
    o[i] = Math.tanh((Math.sin(TAU * ph) * env + noise() * Math.exp(-t * 400) * 0.25 * tone) * 1.8) * vel * 0.9;
  }
  return o;
}
function clap(vel = 1) {
  const o = buf(0.4), f = new SVF();
  for (let i = 0; i < o.length; i++) {
    const t = i / SR; let e = 0;
    for (const s of [0, 0.011, 0.023]) if (t >= s) e = Math.max(e, Math.exp(-(t - s) * 280));
    if (t > 0.03) e = Math.max(e, 0.75 * Math.exp(-(t - 0.03) * 15));
    f.run(noise(), 1350, 1.4); o[i] = f.bp * e * vel * 2.4;
  }
  return o;
}
const HATF = [205.3, 304.4, 369.6, 522.7, 540, 800].map((x) => x * 1.55);
function hat(open = false, vel = 1) {
  const o = buf(open ? 0.35 : 0.07), f = new SVF(), f2 = new SVF(), ph = HATF.map(() => rand());
  for (let i = 0; i < o.length; i++) {
    const t = i / SR; let s = 0;
    for (let k = 0; k < 6; k++) { ph[k] += HATF[k] / SR; s += ph[k] % 1 < 0.5 ? 1 : -1; }
    f.run((s / 6) * 0.6 + noise() * 0.4, 7500, 0.9); f2.run(f.hp, 12500, 0.7);
    o[i] = f2.lp * Math.exp(-t * (open ? 9 : 60)) * vel * 1.3;
  }
  return o;
}
function snare(vel = 1) {
  const o = buf(0.25), f = new SVF(); let ph = 0;
  for (let i = 0; i < o.length; i++) {
    const t = i / SR; ph += (185 + 60 * Math.exp(-t * 40)) / SR; f.run(noise(), 4200, 0.8);
    o[i] = (Math.sin(TAU * ph) * Math.exp(-t * 30) * 0.6 + f.bp * Math.exp(-t * 20) * 1.5) * vel;
  }
  return o;
}
function bassPluck(midi, dur, vel = 1, bright = 1) {
  const o = buf(dur + 0.06), f = mtof(midi), s1 = new Saw(), s2 = new Saw(0.3), fl = new SVF(); let sp = 0;
  for (let i = 0; i < o.length; i++) {
    const t = i / SR, x = s1.next(f) * 0.6 + s2.next(f * 1.006) * 0.4;
    sp += f / 2 / SR;
    fl.run(x, 260 + 2600 * bright * Math.exp(-t * 16), 1.3);
    const env = Math.min(1, t / 0.003) * (t < dur ? Math.exp(-t * 3) : Math.exp(-dur * 3) * Math.exp(-(t - dur) * 70));
    o[i] = (Math.tanh(fl.lp * 1.6) * 0.7 + Math.sin(TAU * sp) * 0.4) * env * vel;
  }
  return o;
}
function pluck(midi, vel = 1, len = 0.26, bright = 1) {
  const o = buf(len), f = mtof(midi), s = new Saw(rand()), fl = new SVF(); let sq = rand();
  for (let i = 0; i < o.length; i++) {
    const t = i / SR; sq = (sq + (f * 2.001) / SR) % 1;
    fl.run(s.next(f) * 0.7 + (sq < 0.5 ? 0.3 : -0.3), 600 + 5200 * bright * Math.exp(-t * 22), 1.1);
    o[i] = fl.lp * Math.min(1, t / 0.002) * Math.exp(-t * 11) * vel;
  }
  return o;
}
function mallet(midi, vel = 1) {
  const o = buf(0.9), f = mtof(midi);
  for (let i = 0; i < o.length; i++) {
    const t = i / SR;
    o[i] = (Math.sin(TAU * f * t) * Math.exp(-t * 6) + Math.sin(TAU * f * 4.01 * t) * Math.exp(-t * 28) * 0.35 + Math.sin(TAU * f * 2 * t) * Math.exp(-t * 12) * 0.2) * Math.min(1, t / 0.001) * vel;
  }
  return o;
}
function stab(notes, vel = 1, len = 0.45) {
  const o = { L: buf(len), R: buf(len) };
  notes.forEach((m, k) => {
    const f = mtof(m), sa = new Saw(rand()), sb = new Saw(rand()), fl = new SVF(), fr = new SVF(), pan = (k / Math.max(1, notes.length - 1)) * 1.2 - 0.6;
    for (let i = 0; i < o.L.length; i++) {
      const t = i / SR, fc = 700 + 6500 * Math.exp(-t * 14), env = Math.min(1, t / 0.002) * Math.exp(-t * 7);
      const a = fl.run(sa.next(f * 0.997), fc, 0.9) * env, b = fr.run(sb.next(f * 1.003), fc, 0.9) * env;
      o.L[i] += (a * (1 - pan * 0.5)) * vel * 0.3; o.R[i] += (b * (1 + pan * 0.5)) * vel * 0.3;
    }
  });
  return o;
}
function riser(dur, gain = 1) {
  const o = buf(dur), f = new SVF(); let ph = 0;
  for (let i = 0; i < o.length; i++) {
    const t = i / SR, u = t / dur; f.run(noise(), 300 * Math.pow(40, u), 3);
    ph += (150 + 1300 * u * u) / SR;
    o[i] = (f.bp * 1.3 + Math.sin(TAU * ph) * 0.2 * u) * u * u * gain;
  }
  return o;
}
function impact(gain = 1, len = 3) {
  const o = { L: buf(len), R: buf(len) }, fl = new SVF(), fr = new SVF(); let ph = 0;
  for (let i = 0; i < o.L.length; i++) {
    const t = i / SR; ph += (30 + 70 * Math.exp(-t * 6)) / SR;
    const boom = Math.sin(TAU * ph) * Math.exp(-t * 1.6) * Math.min(1, t / 0.002);
    fl.run(noise(), 3000, 0.7); fr.run(noise(), 3000, 0.7);
    const cr = Math.exp(-t * 2.6) * 0.32;
    o.L[i] = (Math.tanh(boom * 1.5) + fl.hp * cr) * gain; o.R[i] = (Math.tanh(boom * 1.5) + fr.hp * cr) * gain;
  }
  return o;
}
function whoosh(dur, up = true, gain = 1, panFrom = 0, panTo = 0) {
  const o = { L: buf(dur), R: buf(dur) }, f = new SVF();
  for (let i = 0; i < o.L.length; i++) {
    const t = i / SR, u = t / dur, fc = up ? 350 * Math.pow(25, u) : 9000 * Math.pow(1 / 25, u);
    f.run(noise(), fc, 1.8);
    const v = f.bp * Math.sin(Math.PI * u) ** 2 * gain, p = lerp(panFrom, panTo, u);
    o.L[i] = v * Math.cos(((p + 1) * Math.PI) / 4) * Math.SQRT2; o.R[i] = v * Math.sin(((p + 1) * Math.PI) / 4) * Math.SQRT2;
  }
  return o;
}
function swell(dur, gain = 1) {
  const o = buf(dur), f = new SVF();
  for (let i = 0; i < o.length; i++) { const u = i / SR / dur; f.run(noise(), 800 + 7000 * u * u, 1.2); o[i] = f.bp * Math.pow(u, 3) * gain; }
  return o;
}
function click(vel = 1) {
  const o = buf(0.04), f = new SVF(), fc = 2500 + rand() * 2500, tone = 1500 + rand() * 900;
  for (let i = 0; i < o.length; i++) { const t = i / SR; f.run(noise(), fc, 2.2); o[i] = (f.bp * Math.exp(-t * 420) * 1.6 + Math.sin(TAU * tone * t) * Math.exp(-t * 320) * 0.3) * vel; }
  return o;
}
function tick(vel = 1, hi = 1) {
  const o = buf(0.05);
  for (let i = 0; i < o.length; i++) { const t = i / SR; o[i] = (Math.sin(TAU * 2100 * hi * t) * Math.exp(-t * 110) + Math.sin(TAU * 4300 * hi * t) * Math.exp(-t * 160) * 0.3) * vel; }
  return o;
}
function pop(f0 = 700, vel = 1, len = 0.14) {
  const o = buf(len); let ph = 0;
  for (let i = 0; i < o.length; i++) { const t = i / SR; ph += (f0 * (0.55 + 0.9 * (1 - Math.exp(-t * 60)))) / SR; o[i] = Math.sin(TAU * ph) * Math.exp(-t * 26) * Math.min(1, t / 0.0015) * vel; }
  return o;
}
function glide(f0, f1, dur, vel = 1) {
  const o = buf(dur); let ph = 0;
  for (let i = 0; i < o.length; i++) {
    const t = i / SR, u = t / dur, f = f0 * Math.pow(f1 / f0, u * u * (3 - 2 * u));
    ph += (f * (1 + 0.004 * Math.sin(TAU * 5.5 * t))) / SR;
    o[i] = (Math.sin(TAU * ph) + 0.25 * Math.sin(TAU * ph * 2)) * Math.sin(Math.PI * u) * vel;
  }
  return o;
}
function buzz(vel = 1) {
  const o = buf(0.3);
  for (let i = 0; i < o.length; i++) { const t = i / SR, on = (t < 0.1 || (t > 0.14 && t < 0.24)) ? 1 : 0; o[i] = ((110 * t) % 1 < 0.5 ? 1 : -1) * 0.35 * on * vel; }
  const f = new SVF(); for (let i = 0; i < o.length; i++) o[i] = f.run(o[i], 1400, 0.8);
  return o;
}
function sparkle(base = 84, vel = 1) {
  const o = buf(0.9), notes = [0, 2, 4, 7, 9, 12].map((x) => mtof(base + x));
  notes.forEach((f, k) => { const s0 = Math.floor(k * 0.035 * SR); for (let i = s0; i < o.length; i++) { const t = (i - s0) / SR; o[i] += Math.sin(TAU * f * t) * Math.exp(-t * 7) * 0.22 * vel; } });
  return o;
}
function glitch(dur, vel = 1) {
  const o = buf(dur); let f = 200, ph = 0;
  for (let i = 0; i < o.length; i++) {
    if (i % Math.floor(SR * 0.012) === 0) f = 80 + rand() * 1800;
    ph += f / SR;
    const v = (ph % 1 < 0.5 ? 1 : -1) * 0.5 + noise() * 0.5;
    o[i] = Math.round(v * 6) / 6 * vel * (1 - i / o.length);
  }
  return o;
}
function breath(dur, gain = 1) {
  const o = buf(dur), f = new SVF();
  for (let i = 0; i < o.length; i++) { const u = i / SR / dur; f.run(noise(), 900 + 1400 * Math.sin(Math.PI * u), 0.9); o[i] = f.bp * Math.sin(Math.PI * u) ** 2 * gain; }
  return o;
}

function clack(vel = 1, tone = 1) {
  const o = buf(0.09), f = new SVF();
  for (let i = 0; i < o.length; i++) { const t = i / SR; f.run(noise(), 1900 * tone, 3); o[i] = (f.bp * Math.exp(-t * 110) * 1.8 + Math.sin(TAU * 430 * tone * t) * Math.exp(-t * 85) * 0.5) * vel; }
  return o;
}
function ching(vel = 1, base = 2093) {
  const o = buf(1.3), parts = [[1, 1, 4], [2.76, 0.5, 7], [5.4, 0.3, 11], [8.93, 0.2, 16]];
  for (let i = 0; i < o.length; i++) { const t = i / SR; let v = 0; for (const [m, a, d] of parts) v += Math.sin(TAU * base * m * t) * a * Math.exp(-t * d); o[i] = v * 0.22 * vel * Math.min(1, t / 0.001); }
  return o;
}
function alarm(vel = 1) {
  const o = buf(0.36);
  for (let i = 0; i < o.length; i++) { const t = i / SR, f = t < 0.15 ? 1760 : 1320, on = t < 0.13 || (t > 0.17 && t < 0.33) ? 1 : 0; o[i] = ((f * t) % 1 < 0.5 ? 0.3 : -0.3) * on * vel; }
  const fl = new SVF(); for (let i = 0; i < o.length; i++) o[i] = fl.run(o[i], 3500, 0.7);
  return o;
}
function shutter(vel = 1) {
  const o = buf(0.2), a = clack(1, 1.4), b = clack(0.7, 1.1), k = kick(0.5, 0.3, 0.15);
  for (let i = 0; i < a.length; i++) o[i] += a[i] * vel;
  const d = Math.floor(0.028 * SR); for (let i = 0; i < b.length && i + d < o.length; i++) o[i + d] += b[i] * vel;
  for (let i = 0; i < Math.min(k.length, o.length); i++) o[i] += k[i] * 0.6 * vel;
  return o;
}
function crackle(dur, vel = 1) {
  const o = buf(dur);
  for (let n = 0; n < 90; n++) { const s = Math.floor(rand() * rand() * o.length), c = click(0.3 + rand() * 0.5); for (let i = 0; i < c.length && s + i < o.length; i++) o[s + i] += c[i] * vel * (1 - s / o.length); }
  return o;
}
function shatter(vel = 1) {
  const o = buf(1.2), f = new SVF();
  for (let i = 0; i < o.length; i++) { const t = i / SR; f.run(noise(), 5000, 0.7); o[i] = f.hp * Math.exp(-t * 7) * 0.8 * vel; }
  for (let n = 0; n < 16; n++) { const s = Math.floor(rand() * 0.5 * SR), fr = 3000 + rand() * 5000; for (let i = 0; i < 0.25 * SR && s + i < o.length; i++) { const t = i / SR; o[s + i] += Math.sin(TAU * fr * t) * Math.exp(-t * 25) * 0.12 * vel; } }
  return o;
}
function typing(t0, t1, vel = 0.5, pan = 0.2) {
  let t = t0;
  while (t < t1) { put(B.fx, t, click(vel * (0.6 + rand() * 0.4)), 0.8, pan + (rand() - 0.5) * 0.3, 0.05); t += 0.05 + rand() * 0.045; }
}

// ---------------------------------------------------------------- harmony: A-minor tension for the problem, lifting into C major
const CH = {
  Am: [57, 60, 64, 69], F: [53, 57, 60, 65], Dm: [50, 53, 57, 62], E: [52, 56, 59, 64], C: [48, 55, 60, 64], G: [55, 59, 62, 67],
  Cmaj9: [48, 55, 59, 62, 64, 67, 71],
};
const ROOT = { Am: 45, F: 41, Dm: 38, E: 40, C: 36, G: 43, Cmaj9: 36 };
const PROG = ['Am', 'F', 'Dm', 'E', 'C', 'G', 'F', 'C', 'G', 'Am', 'F', 'G', 'Am', 'E', 'F', 'Cmaj9'];
const chordName = (b) => PROG[Math.max(0, Math.min(15, b))];
const groove = (b) => b >= 4 && b <= 14 && b !== 12 && b !== 13;
const halfTime = (b) => b === 12 || b === 13;
const kicks = [];
const Q = CUES;

// ---------------------------------------------------------------- drums
for (let b = 0; b < 15; b++) {
  for (let q = 0; q < 4; q++) {
    const t = bar(b) + q * BEAT;
    if (b === 14 && q === 3) continue;
    if (groove(b)) {
      put(B.drums, t, kick(1), 1); kicks.push(t);
      if (q % 2 === 1) put(B.drums, t, clap(0.8), 1, 0, 0.18);
      put(B.drums, t + BEAT / 2, hat(b >= 10 && q % 2 === 1, 0.42), 1, 0.25);
      if (b >= 6) for (const s of [1, 3]) put(B.drums, t + s * S16, hat(false, 0.15 + 0.08 * rand()), 1, -0.3);
    } else if (halfTime(b)) {
      if (q === 0 || (q === 2 && b === 13)) { put(B.drums, t, kick(0.95, 0.8), 1); kicks.push(t); }
      if (q === 2) put(B.drums, t, clap(0.7), 1, 0, 0.35);
      put(B.drums, t + BEAT / 2, hat(false, 0.25), 1, 0.3);
    } else if (b === 1) {
      put(B.drums, t + BEAT / 2, hat(false, 0.3), 1, 0.25);
    }
  }
}
// copy presses: a kick under every ⌘C
for (const t of Q.copy.presses) { put(B.drums, t, kick(0.85, 0.9), 1); kicks.push(t); }
// snare roll into the bar-4 drop and into the bar-10 sort
for (let s = 0; s < 16; s++) put(B.drums, bar(3) + BEAT * 2 + s * S32, snare(0.12 + s * 0.04), 1, 0, 0.2);
for (let s = 0; s < 8; s++) put(B.drums, bar(9) + BEAT * 3 + s * S32, snare(0.2 + s * 0.06), 1, 0, 0.2);

// ---------------------------------------------------------------- bass
for (let b = 4; b < 15; b++) {
  if (!groove(b)) continue;
  const root = ROOT[chordName(b)];
  for (let q = 0; q < 4; q++) {
    const t = bar(b) + q * BEAT + BEAT / 2;
    put(B.bass, t, bassPluck(root + (q === 3 ? 12 : 0), 0.19, 0.8, 1), 1);
    if (b >= 6 && q % 2 === 1) put(B.bass, t + S16, bassPluck(root + 7, 0.09, 0.45), 1);
  }
}
(function reese() {
  const t0 = bar(12), t1 = bar(14), s = [new Saw(0), new Saw(0.37), new Saw(0.71)], fl = new SVF();
  let lph = 0;
  for (let j = Math.round(t0 * SR); j < Math.round(t1 * SR); j++) {
    const t = j / SR, b = Math.floor(t / BAR + 1e-9), f = mtof(ROOT[chordName(b)] - 12);
    const x = s[0].next(f * 0.994) + s[1].next(f * 1.007) + s[2].next(f * 2.003) * 0.4;
    lph += 1 / ((BEAT / 2) * SR);
    const lfo = 0.5 - 0.5 * Math.cos(TAU * lph);
    fl.run(x, 170 + 1600 * lfo * lfo, 2.4);
    const env = Math.min(1, (t - t0) / 0.02) * Math.min(1, (t1 - t) / 0.08);
    const v = Math.tanh(fl.lp * 1.3) * 0.5 * env;
    B.bass.L[j] += v; B.bass.R[j] += v;
  }
})();
(function sub() {
  let ph = 0;
  for (let j = 0; j < N; j++) {
    const t = j / SR, b = Math.floor(t / BAR + 1e-9);
    let g = b <= 3 ? 0.1 + 0.06 * b : groove(b) ? 0.3 : halfTime(b) ? 0.18 : 0.3 * Math.exp(-(t - at(15, 2)) * 0.8);
    if (b === 15 && t < at(15, 2)) g = 0;
    ph += mtof(ROOT[chordName(Math.min(b, 15))] - 12) / SR;
    const v = Math.sin(TAU * ph) * g;
    B.bass.L[j] += v; B.bass.R[j] += v;
  }
})();

// ---------------------------------------------------------------- pad
(function pad() {
  const PL = new Float32Array(N), PR = new Float32Array(N);
  for (let b = 0; b < 16; b++) {
    const notes = CH[chordName(b)], t0 = b === 15 ? at(15, 2) : bar(b), len = b === 15 ? DUR - t0 : BAR + 0.6;
    notes.forEach((m) => {
      [-9, 0, 9].forEach((cents, v) => {
        const f = mtof(m) * Math.pow(2, cents / 1200), s = new Saw(rand()), pan = v - 1;
        const gl = Math.cos(((pan * 0.7 + 1) * Math.PI) / 4), gr = Math.sin(((pan * 0.7 + 1) * Math.PI) / 4);
        const i0 = Math.round(t0 * SR), n = Math.round(len * SR);
        for (let i = 0; i < n && i0 + i < N; i++) {
          const t = i / SR, att = b === 0 ? 1.2 : 0.18;
          const env = Math.min(1, t / att) * (t > len - 0.6 ? Math.max(0, (len - t) / 0.6) : 1);
          const x = s.next(f) * env * 0.09;
          PL[i0 + i] += x * gl; PR[i0 + i] += x * gr;
        }
      });
    });
  }
  const cut = (t) => { const b = t / BAR; return b < 4 ? lerp(350, 1400, b / 4) : b < 12 ? 2000 : b < 14 ? 900 : 3200; };
  const gain = (t) => { const b = t / BAR; return b < 4 ? 0.85 : b < 12 ? 0.45 : b < 14 ? 0.7 : 0.9; };
  const fl = new SVF(), fr = new SVF();
  for (let j = 0; j < N; j++) {
    const t = j / SR, c = cut(t), g = gain(t);
    const l = fl.run(PL[j], c, 0.8) * g, r = fr.run(PR[j], c, 0.8) * g;
    B.music.L[j] += l; B.music.R[j] += r; B.rev.L[j] += l * 0.35; B.rev.R[j] += r * 0.35;
  }
})();

// ---------------------------------------------------------------- arp
(function arp() {
  const A = bus(), pat = [0, 2, 1, 3, 2, 4, 3, 5, 4, 6, 5, 7, 6, 4, 3, 1];
  for (let b = 4; b < 15; b++) {
    if (halfTime(b)) continue;
    const ch = CH[chordName(b)], notes = [...ch, ...ch.map((m) => m + 12)];
    for (let s = 0; s < 16; s++) {
      if (b === 14 && s >= 12) continue;
      const t = bar(b) + s * S16, vel = (s % 4 === 0 ? 0.5 : 0.32) * (b >= 6 && b <= 9 ? 0.7 : 1);
      put(A, t, pluck(notes[pat[s]] + 12, vel, 0.24, b >= 10 ? 1.2 : 1), 1, s % 2 ? 0.35 : -0.35);
    }
  }
  const fl = new SVF(), fr = new SVF();
  for (let j = 0; j < N; j++) {
    const b = j / SR / BAR, c = b < 6 ? lerp(1200, 3600, (b - 4) / 2) : 4600;
    const l = fl.run(A.L[j], c, 1.2) * 0.5, r = fr.run(A.R[j], c, 1.2) * 0.5;
    B.music.L[j] += l; B.music.R[j] += r; B.dly.L[j] += l * 0.4; B.dly.R[j] += r * 0.4; B.rev.L[j] += l * 0.15; B.rev.R[j] += r * 0.15;
  }
})();

// ---------------------------------------------------------------- one sound per visual cue
const up = (notes, o = 12) => notes.map((m) => m + o);
const stabAt = (t, chord, o = 12, vel = 0.7) => put(B.fx, t, stab(up(CH[chord], o), vel, 0.4), 1, 0, 0.3);
// copy: key clacks, slams, glitches and shatters, the implode glide, riser into the drop
for (const t of Q.copy.presses) { put(B.fx, t, clack(0.9, 1.1), 1, 0.3, 0.05); put(B.fx, t + 0.12, pop(780 + 60 * rand(), 0.25), 1, 0.4, 0.15); }
Q.copy.slams.forEach((s, i) => stabAt(s.t, chordName(Math.floor(s.t / BAR)), i ? 12 : 0, 0.55));
Q.copy.slams2.forEach((s, i) => stabAt(s.t, 'Dm', i ? 12 : 0, 0.6));
Q.copy.overwrite.forEach((t, i) => put(B.fx, t, glitch(0.22, 0.35), 1, (i - 1) * 0.4, 0.1));
put(B.fx, Q.copy.overwrite[1], shatter(0.6), 1, 0.3, 0.25); put(B.fx, Q.copy.overwrite[2], clack(1, 1), 1, 0.3); put(B.fx, Q.copy.overwrite[2] + 0.02, shatter(0.35), 1, 0.3, 0.2);
typing(Q.copy.eyebrow, Q.copy.eyebrow + 0.35, 0.3, 0);
put(B.fx, Q.copy.implode[0], glide(900, 140, Q.copy.implode[1] - Q.copy.implode[0] + 0.1, 0.14), 1, 0, 0.4);
put(B.fx, bar(3), riser(BAR - S16, 0.55), 1, 0, 0.3);
for (const im of TL.IMPACTS) put(B.fx, im.t, impact(im.a * 0.8, 3), 1, 0, 0.22);
// reveal: chord on the drop, sparkle as the icon forms, chime on the glass icon, word slam, HUD boot ticks
stabAt(bar(4), 'C', 0, 1); put(B.fx, bar(4), whoosh(0.6, false, 0.45), 1, 0, 0.2);
put(B.fx, Q.reveal.settle - 0.3, sparkle(84, 0.5), 1, 0, 0.45, 0.3); put(B.fx, Q.reveal.crisp[0], ching(0.6, 2093), 1, 0, 0.35);
put(B.fx, Q.reveal.word - 0.3, whoosh(0.3, true, 0.35), 1, -0.3); stabAt(Q.reveal.word, 'G', 12, 0.8);
typing(Q.reveal.eyebrow, Q.reveal.eyebrow + 0.5, 0.3, 0);
for (let k = 0; k < 4; k++) put(B.fx, Q.reveal.hudBoot[0] + k * S16 * 1.5, tick(0.25, 1 + k * 0.1), 1, k % 2 ? 0.6 : -0.6);
// demo: ⇧⌘V, popup whoosh, arrow ticks, return, the paste
put(B.fx, Q.demo.keys, clack(1, 1.1), 1, -0.2); put(B.fx, Q.demo.keys + 0.03, clack(0.8, 0.95), 1, 0); put(B.fx, Q.demo.keys + 0.06, clack(0.9, 1.25), 1, 0.2);
put(B.fx, Q.demo.drop - 0.05, whoosh(0.3, false, 0.45), 1, 0, 0.2); put(B.fx, Q.demo.drop, pop(900, 0.3), 1, 0, 0.2);
Q.demo.moves.forEach((t, i) => { put(B.fx, t, tick(0.4, 1 + i * 0.06), 1, (i - 1.5) * 0.3); put(B.fx, t, clack(0.35, 1.3), 1); });
put(B.fx, Q.demo.back, clack(0.9, 0.9), 1); put(B.fx, Q.demo.paste, whoosh(Q.demo.land - Q.demo.paste, true, 0.5, -0.5, 0.4), 1, 0, 0.2);
put(B.fx, Q.demo.land, pop(1100, 0.4), 1, 0.3, 0.2); put(B.fx, Q.demo.land, ching(0.55, 2637), 1, 0.3, 0.3);
Q.demo.slams.forEach((s, i) => stabAt(s.t, chordName(Math.floor(s.t / BAR)), i ? 12 : 0, 0.75));
put(B.fx, Q.demo.out, whoosh(0.35, false, 0.35), 1, 0, 0.2);
// sort: a rising mallet per category, word slams, typing for the search, the pin
Q.sort.columns.slice(0, 4).forEach((t, i) => { put(B.fx, t, mallet([72, 76, 79, 84][i], 0.5), 1, (i - 1.5) * 0.35, 0.3, 0.25); put(B.fx, t, whoosh(0.25, true, 0.25), 1, (i - 1.5) * 0.5); });
Q.sort.words.forEach((w, i) => stabAt(w.t, chordName(11), i === 2 ? 24 : 12, 0.6));
typing(Q.sort.search[0], Q.sort.search[0] + 0.25, 0.4, 0.2);
put(B.fx, Q.sort.pin, ching(0.7, 3136), 1, 0.4, 0.35);
// secure: the token's approach, the buzz and shatter, cipher crackle, the lock
put(B.fx, Q.secure.token, whoosh(Q.secure.reject - Q.secure.token, true, 0.45, -0.9, 0), 1, 0, 0.15);
put(B.fx, Q.secure.reject, buzz(0.6), 1, 0, 0.2); put(B.fx, Q.secure.reject, shatter(0.6), 1, -0.3, 0.25);
stabAt(Q.secure.slam1.t, 'Am', 0, 0.7);
put(B.fx, Q.secure.cipher[0], crackle(Q.secure.cipher[1] - Q.secure.cipher[0], 0.5), 1, 0, 0.2); put(B.fx, Q.secure.cipher[0], glitch(0.3, 0.25), 1);
put(B.fx, Q.secure.lock - 0.25, whoosh(0.28, false, 0.4), 1); put(B.drums, Q.secure.lock, kick(0.9, 0.6), 1); kicks.push(Q.secure.lock);
put(B.fx, Q.secure.lock, clack(1.3, 0.7), 1, 0, 0.35); put(B.fx, Q.secure.lock + 0.08, ching(0.5, 1568), 1, 0, 0.4);
stabAt(Q.secure.slam2.t, 'E', 12, 0.8);
// finale: two slams, clear, the icon landing, the final chord on the hit
stabAt(Q.finale.free, 'F', 12, 1); stabAt(Q.finale.open, 'G', 12, 0.9);
put(B.fx, Q.finale.clear, whoosh(0.4, false, 0.4), 1, 0, 0.3);
put(B.fx, Q.finale.lockup, glide(500, 1250, 0.45, 0.12), 1, -0.3, 0.4); put(B.fx, Q.finale.lockup + 0.35, sparkle(88, 0.45), 1, -0.3, 0.5, 0.3);
put(B.fx, Q.finale.hit, stab(up(CH.Cmaj9, 12), 1.3, 0.9), 1, 0, 0.6); put(B.fx, Q.finale.hit, mallet(84, 0.5), 1, 0, 0.6, 0.3);

// ---------------------------------------------------------------- effects returns
// ---------------------------------------------------------------- effects returns
function freeverb(inL, inR, room = 0.86, damp = 0.32) {
  const sc = SR / 44100, comb = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], ap = [556, 441, 341, 225], out = bus();
  [[out.L, 0], [out.R, Math.round(23 * sc)]].forEach(([o, sp]) => {
    const cs = comb.map((l) => ({ b: new Float32Array(Math.round(l * sc) + sp), i: 0, st: 0 })), as = ap.map((l) => ({ b: new Float32Array(Math.round(l * sc) + sp), i: 0 }));
    for (let n = 0; n < N; n++) {
      const x = (inL[n] + inR[n]) * 0.015; let y = 0;
      for (const c of cs) { const v = c.b[c.i]; c.st = v * (1 - damp) + c.st * damp; c.b[c.i] = x + c.st * room; if (++c.i >= c.b.length) c.i = 0; y += v; }
      for (const a of as) { const v = a.b[a.i]; const z = -y + v; a.b[a.i] = y + v * 0.5; if (++a.i >= a.b.length) a.i = 0; y = z; }
      o[n] = y * 3;
    }
  });
  return out;
}
function pingpong(inL, inR, fb = 0.42) {
  const D = Math.round(BEAT * 0.75 * SR), dl = new Float32Array(D), dr = new Float32Array(D), out = bus(), fL = new SVF(), fR = new SVF();
  let i = 0;
  for (let n = 0; n < N; n++) {
    const yl = dl[i], yr = dr[i];
    dl[i] = (inL[n] + inR[n]) * 0.5 + fR.run(yr, 3500, 0.7) * fb;
    dr[i] = fL.run(yl, 3500, 0.7) * fb;
    out.L[n] = yl; out.R[n] = yr;
    if (++i >= D) i = 0;
  }
  return out;
}
const rev = freeverb(B.rev.L, B.rev.R), dly = pingpong(B.dly.L, B.dly.R);

// ---------------------------------------------------------------- master
kicks.sort((a, b) => a - b);
const L = new Float32Array(N), Rr = new Float32Array(N);
let ki = 0;
for (let n = 0; n < N; n++) {
  const t = n / SR;
  while (ki < kicks.length - 1 && kicks[ki + 1] <= t) ki++;
  const dt = kicks.length && t >= kicks[ki] ? t - kicks[ki] : 9;
  const duck = 1 - 0.65 * Math.exp(-dt * 9) * Math.min(1, dt / 0.004 + 0.6);
  // a sixteenth of silence just before the bar-4 drop makes it land harder
  const gap = t >= bar(4) - S16 && t < bar(4) ? 0 : 1;
  let l = (B.drums.L[n] * 0.38 + (B.bass.L[n] * 0.42 + B.music.L[n] * 1.1) * duck + B.fx.L[n] * 0.5 + rev.L[n] * 0.45 + dly.L[n] * 1.5 * duck) * gap;
  let r = (B.drums.R[n] * 0.38 + (B.bass.R[n] * 0.42 + B.music.R[n] * 1.1) * duck + B.fx.R[n] * 0.5 + rev.R[n] * 0.45 + dly.R[n] * 1.5 * duck) * gap;
  const fadeIn = Math.min(1, t / 0.02), fadeOut = t > DUR - 0.8 ? Math.max(0, (DUR - t) / 0.8) ** 1.2 : 1;
  L[n] = l * fadeIn * fadeOut; Rr[n] = r * fadeIn * fadeOut;
}
let peak = 0;
for (let n = 0; n < N; n++) peak = Math.max(peak, Math.abs(L[n]), Math.abs(Rr[n]));
const pre = 1.15 / peak;
peak = 0;
for (let n = 0; n < N; n++) { L[n] = Math.tanh(L[n] * pre); Rr[n] = Math.tanh(Rr[n] * pre); peak = Math.max(peak, Math.abs(L[n]), Math.abs(Rr[n])); }
const norm = 0.89 / peak;
if (process.env.DUMP) {
  const wav = (name, l, r, g) => { const o = Buffer.alloc(44 + N * 4); o.write('RIFF', 0); o.writeUInt32LE(36 + N * 4, 4); o.write('WAVE', 8); o.write('fmt ', 12); o.writeUInt32LE(16, 16); o.writeUInt16LE(1, 20); o.writeUInt16LE(2, 22); o.writeUInt32LE(SR, 24); o.writeUInt32LE(SR * 4, 28); o.writeUInt16LE(4, 32); o.writeUInt16LE(16, 34); o.write('data', 36); o.writeUInt32LE(N * 4, 40); for (let n = 0; n < N; n++) { o.writeInt16LE(Math.round(clamp(l[n] * g, -1, 1) * 32767), 44 + n * 4); o.writeInt16LE(Math.round(clamp(r[n] * g, -1, 1) * 32767), 46 + n * 4); } fs.writeFileSync(path.join(__dirname, 'dump_' + name + '.wav'), o); };
  const g = pre * norm;
  wav('drums', B.drums.L, B.drums.R, 0.38 * g); wav('bass', B.bass.L, B.bass.R, 0.42 * g); wav('music', B.music.L, B.music.R, 1.1 * g); wav('fx', B.fx.L, B.fx.R, 0.5 * g); wav('rev', rev.L, rev.R, 0.45 * g); wav('dly', dly.L, dly.R, 0.7 * g);
}
const out = Buffer.alloc(44 + N * 4);
out.write('RIFF', 0); out.writeUInt32LE(36 + N * 4, 4); out.write('WAVE', 8); out.write('fmt ', 12);
out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22); out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 4, 28); out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34);
out.write('data', 36); out.writeUInt32LE(N * 4, 40);
for (let n = 0; n < N; n++) { out.writeInt16LE(Math.round(clamp(L[n] * norm, -1, 1) * 32767), 44 + n * 4); out.writeInt16LE(Math.round(clamp(Rr[n] * norm, -1, 1) * 32767), 46 + n * 4); }
fs.writeFileSync(path.join(__dirname, 'reel.wav'), out);
console.log('wrote reel.wav, peak before norm', peak.toFixed(3));
if (process.env.STATS) {
  const db = (x) => (20 * Math.log10(x + 1e-9)).toFixed(1).padStart(6);
  const rms = (a, t0, t1) => { let s = 0; const i0 = Math.round(t0 * SR), i1 = Math.round(t1 * SR); for (let i = i0; i < i1; i++) s += a[i] * a[i]; return Math.sqrt(s / (i1 - i0)); };
  const secs = [[0, 4], [4, 6], [6, 10], [10, 12], [12, 14], [14, 16]];
  console.log('bars   ' + ['drums', 'bass', 'music', 'fx', 'rev', 'dly', 'MASTER'].map((s) => s.padStart(7)).join(''));
  for (const [a, b] of secs) console.log(`${String(a).padStart(2)}-${String(b).padStart(2)}  ` + [B.drums.L, B.bass.L, B.music.L, B.fx.L, rev.L, dly.L, L].map((x) => db(rms(x, bar(a), Math.min(DUR, bar(b)))).padStart(7)).join(''));
}
