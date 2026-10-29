// The presentation soundtrack: the narration over a quiet bed of warm pads in D major and sparse bells, with soft UI
// sounds on a few visual beats. The bed ducks under the voice. Reads voice.wav + voice.json, writes film.wav (48 kHz stereo).
const fs = require('fs'), path = require('path');
const V = require('./voice.json'), DURATION = V.duration;
const SR = 48000, N = Math.ceil(SR * DURATION), TAU = Math.PI * 2, BAR = 2.5, BEAT = BAR / 4;
const L = (s, i) => V.sections[s].lines[i].t;

let seed = 7;
const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const bus = () => ({ L: new Float32Array(N), R: new Float32Array(N) });
const dry = bus(), rev = bus(), dly = bus();

// add a mono or stereo signal at t0
function put(t0, sig, gain = 1, pan = 0, r = 0.2, d = 0) {
  const i0 = Math.round(t0 * SR), gl = gain * Math.cos(((pan + 1) * Math.PI) / 4), gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = 0; i < sig.length; i++) {
    const j = i0 + i;
    if (j < 0 || j >= N) continue;
    const l = sig[i] * gl, rr = sig[i] * gr;
    dry.L[j] += l; dry.R[j] += rr;
    if (r) { rev.L[j] += l * r; rev.R[j] += rr * r; }
    if (d) { dly.L[j] += l * d; dly.R[j] += rr * d; }
  }
}
function lowpass(x, fc) { const a = 1 - Math.exp((-TAU * fc) / SR); let y = 0; for (let i = 0; i < x.length; i++) x[i] = y += a * (x[i] - y); return x; }
function highpass(x, fc) { const a = 1 - Math.exp((-TAU * fc) / SR); let y = 0; for (let i = 0; i < x.length; i++) { y += a * (x[i] - y); x[i] -= y; } return x; }

// ---------- instruments ----------
function pad(midi, dur) {
  const n = Math.round((dur + 2) * SR), x = new Float32Array(n), f = mtof(midi);
  for (const det of [-0.11, 0, 0.13]) {
    const ph = new Float64Array(7).map(() => (rand() + 1) * Math.PI);
    for (let h = 1; h <= 7; h++) {
      const w = (TAU * f * h * Math.pow(2, det / 12)) / SR, a = 1 / (h * h * 0.6 + 0.4);
      let p = ph[h - 1];
      for (let i = 0; i < n; i++) { x[i] += Math.sin(p) * a; p += w; }
    }
  }
  for (let i = 0; i < n; i++) {
    const t = i / SR, env = clamp(t / 1.4) * (t < dur ? 1 : Math.exp(-(t - dur) * 2.4));
    x[i] *= env * 0.05 * (1 + 0.15 * Math.sin(TAU * 0.2 * t + midi));
  }
  return lowpass(lowpass(x, 1500), 2400);
}
function bell(midi, dur = 2.2) {
  const n = Math.round(dur * SR), x = new Float32Array(n), f = mtof(midi);
  const parts = [[1, 1, 1.6], [2, 0.35, 3.5], [3, 0.12, 6], [4.2, 0.06, 9]];
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let s = 0;
    for (const [m, a, k] of parts) s += Math.sin(TAU * f * m * t) * a * Math.exp(-t * k);
    x[i] = s * Math.min(1, t / 0.004) * 0.12;
  }
  return x;
}
function sine(f0, f1, dur, k, amp) {
  const n = Math.round(dur * SR), x = new Float32Array(n);
  let p = 0;
  for (let i = 0; i < n; i++) { const t = i / SR; p += (TAU * (f1 + (f0 - f1) * Math.exp(-t * 18))) / SR; x[i] = Math.sin(p) * Math.exp(-t * k) * amp * Math.min(1, t / 0.003); }
  return x;
}
function noise(dur, k, amp) { const n = Math.round(dur * SR), x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = rand() * Math.exp((-i / SR) * k) * amp; return x; }
// a swell of filtered noise that peaks at its end
function whoosh(dur) {
  const n = Math.round(dur * SR), x = new Float32Array(n);
  let lp = 0, bp = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n, fc = 300 + 5000 * u * u, g = Math.tan((Math.PI * fc) / SR), k = 1.2;
    const hp = rand() - lp - k * bp; bp += g * hp; lp += g * bp;
    x[i] = bp * Math.pow(u, 2.2) * (1 - clamp((u - 0.94) / 0.06)) * 0.25;
  }
  return x;
}

// ---------- arrangement ----------
const CH = {
  G: [43, [55, 59, 62, 66]], D: [38, [50, 54, 57, 61]], Em: [40, [52, 55, 59, 62, 66]], G9: [43, [59, 62, 66, 69]],
  Bm: [35, [50, 54, 57, 61]], A6: [33, [52, 57, 61, 66]], D9: [38, [57, 61, 64, 66]],
};
const LOOP = ['G', 'D', 'Em', 'G9', 'Bm', 'G', 'D', 'A6'];
const lastChord = Math.floor((DURATION - 9) / (2 * BAR));
for (let k = 0; k * 2 * BAR < DURATION - 4; k++) {
  const name = k >= lastChord ? 'D9' : LOOP[k % LOOP.length], [root, notes] = CH[name], t0 = k * 2 * BAR;
  const dur = k >= lastChord ? DURATION - t0 - 2 : 2 * BAR;
  notes.forEach((m, i) => put(t0, pad(m, dur), 0.8, (i / (notes.length - 1)) * 1.2 - 0.6, 0.45));
  if (k >= 1) put(t0, sine(mtof(root), mtof(root), dur + 0.6, 0.35, 0.14), 1, 0, 0.05);
  if (k >= 1 && k < lastChord) [0, 2, 1, 3].forEach((p, s) => put(t0 + s * BAR / 2, bell(notes[p % notes.length] + 12), 0.4, s % 2 ? 0.45 : -0.45, 0.45, 0.25));
  if (k >= lastChord) notes.forEach((m, i) => put(t0 + i * 0.07, bell(m + 12, 4), 0.6, i % 2 ? 0.5 : -0.5, 0.6, 0.3));
}
// a soft whoosh into each section, UI sounds on the ⇧⌘V demo
V.sections.slice(1).forEach((s) => put(s.t - 1.2, whoosh(1.25), 0.5, 0, 0.35));
[0, 1, 2].forEach((i) => { const t = L(3, 1) + 0.35 + i * 0.32; put(t, highpass(noise(0.03, 160, 0.5), 2500), 0.8, (i - 1) * 0.4, 0.15); });
put(L(3, 2) + 0.1, sine(90, 40, 1.2, 3, 0.35), 1, 0, 0.2);
[0.3, 0.9, 1.5, 2.1, 2.9].forEach((d, i) => put(L(3, 3) + d, bell(86 + [0, 2, 4, 7, 12][i], 0.8), 0.45, 0.2, 0.3, 0.2));
put(L(5, 1) + 1.9, highpass(noise(0.05, 90, 0.4), 3500), 1, 0, 0.3);

// ---------- effects and master ----------
function reverb(b) {
  const combs = [1557, 1617, 1491, 1422, 1277, 1356, 1188, 1116].map((d) => d * 1.6 | 0), aps = [556, 441, 341, 225];
  const proc = (x, spread) => {
    const y = new Float32Array(N);
    for (const d0 of combs) {
      const d = d0 + spread, buf = new Float32Array(d);
      let idx = 0, lp = 0;
      for (let i = 0; i < N; i++) { const o = buf[idx]; lp = o * 0.7 + lp * 0.3; buf[idx] = x[i] + lp * 0.86; y[i] += o * 0.12; idx = (idx + 1) % d; }
    }
    for (const d0 of aps) {
      const d = d0 + spread, buf = new Float32Array(d);
      let idx = 0;
      for (let i = 0; i < N; i++) { const o = buf[idx], v = y[i] + o * 0.5; buf[idx] = v; y[i] = o - v * 0.5; idx = (idx + 1) % d; }
    }
    return y;
  };
  return { L: proc(lowpass(highpass(b.L.slice(), 180), 7000), 0), R: proc(lowpass(highpass(b.R.slice(), 180), 7000), 23) };
}
function delay(b) {
  const d = Math.round(BEAT * 0.75 * SR), L = new Float32Array(N), R = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const j = i - d;
    L[i] = b.L[i] + (j >= 0 ? R[j] * 0.42 : 0);
    R[i] = (j >= 0 ? L[j] * 0.42 : 0);
  }
  return { L: lowpass(L, 5000), R: lowpass(R, 5000) };
}
const RV = reverb(rev), DL = delay(dly);
const bed = [new Float32Array(N), new Float32Array(N)];
for (let i = 0; i < N; i++) {
  bed[0][i] = dry.L[i] + RV.L[i] * 0.9 + DL.L[i] * 0.5;
  bed[1][i] = dry.R[i] + RV.R[i] * 0.9 + DL.R[i] * 0.5;
}
// voice, and its smoothed level for ducking the bed
const wav = fs.readFileSync(path.join(__dirname, 'voice.wav')), voice = new Float32Array(N);
for (let i = 0; i < N && 44 + i * 2 < wav.length; i++) voice[i] = wav.readInt16LE(44 + i * 2) / 32768;
const duck = new Float32Array(N);
let env = 0;
for (let i = 0; i < N; i++) { const a = Math.abs(voice[i]); env = a > env ? env + (a - env) * 0.002 : env * 0.99996; duck[i] = env; }
const rms = (x) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);
const vGain = 0.15 / rms(voice), bGain = (0.15 / rms(bed[0])) * Math.pow(10, -17 / 20);
const mix = [new Float32Array(N), new Float32Array(N)];
for (let i = 0; i < N; i++) {
  const t = i / SR, d = 1 - 0.55 * clamp(duck[i] * 8), fade = 1 - clamp((t - (DURATION - 2.2)) / 2.2), fin = clamp(t / 0.8);
  for (let c = 0; c < 2; c++) mix[c][i] = (voice[i] * vGain + bed[c][i] * bGain * d * fade * fin);
}
let peak = 0;
for (const c of mix) for (const v of c) peak = Math.max(peak, Math.abs(v));
const gain = Math.min(1, 0.95 / peak);
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) for (let c = 0; c < 2; c++) buf.writeInt16LE(Math.round(Math.tanh(mix[c][i] * gain) * 32000), 44 + i * 4 + c * 2);
fs.writeFileSync(path.join(__dirname, 'film.wav'), buf);
console.log(`film.wav: ${DURATION}s, voice rms ${(20 * Math.log10(0.15 * gain)).toFixed(1)} dBFS, bed 17 dB under, gain ${gain.toFixed(2)}`);
