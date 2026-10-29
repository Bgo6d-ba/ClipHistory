'use strict';
// Engine: easing, springs, noise, kinetic type, ClipHistory brand drawing, HUD, shared WebGL, post pass, frame loop.
// Every scene registers SCENES.<id> = { init?(), draw(lt, t) } where lt = seconds since the scene started. draw() must be
// a pure function of time, so any frame can be rendered alone and four workers can split the reel.
const { BEAT, BAR, S16, S32, bar, at, CUES } = TL;
const W = 1920, H = 1080, CX = W / 2, CY = H / 2, TAU = Math.PI * 2;

const COL = {
  ink: '#0E1020', paper: '#FFFFFF', paper2: '#F5F5FA', night: '#06071A', deep: '#0B0D24',
  indigo: '#5B4BFF', indigoHi: '#8B80FF', indigoDeep: '#2E25A8', wash: '#ECEAFF',
  link: '#4099FF', color: '#FF4566', image: '#F24DD9', code: '#FF9E33', text: '#33D9E6',
  pin: '#FF9F0A', danger: '#FF3B4E', muted: '#6B7280', muted2: '#4B5563', ok: '#30D158',
};
const KIND = ['link', 'color', 'image', 'code', 'text'];
const KIND_TITLE = { link: 'LINKS', color: 'COLORS', image: 'IMAGES', code: 'CODE', text: 'TEXT' };
const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgba = (c, a = 1) => { if (typeof c === 'string') c = hex2rgb(c); return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; };
const FONT = { display: '"Oswald"', ui: '"Inter"', mono: '"JetBrains Mono"' };
const fnt = (w, px, fam = FONT.display, style = '') => `${style} ${w} ${px}px ${fam}`.trim();

const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const inv = (a, b, x) => clamp((x - a) / (b - a));
const E = {
  inQ: (t) => t * t, outQ: (t) => 1 - (1 - t) * (1 - t),
  inC: (t) => t * t * t, outC: (t) => 1 - (1 - t) ** 3, ioC: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outQuart: (t) => 1 - (1 - t) ** 4, ioQuart: (t) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2),
  outExpo: (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)), inExpo: (t) => (t <= 0 ? 0 : 2 ** (10 * t - 10)),
  ioExpo: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2),
  outBack: (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2,
  ioSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
};
function spring(t, f = 3, z = 0.4) {
  if (t <= 0) return 0;
  const w = TAU * f, wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t));
}
function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function hash(a, b = 0, c = 0) {
  let h = Math.imul((a | 0) + 0x9e37, 0x27d4eb2d) ^ Math.imul((b | 0) + 0x7f4a, 0x165667b1) ^ Math.imul((c | 0) + 0x3c6e, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const PERM = (() => { const r = mulberry(1337), p = [...Array(256).keys()]; for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } return Uint8Array.from([...p, ...p]); })();
const fadeC = (t) => t * t * t * (t * (t * 6 - 15) + 10);
function grad(h, x, y, z) { h &= 15; const u = h < 8 ? x : y, v = h < 4 ? y : h === 12 || h === 14 ? x : z; return ((h & 1) ? -u : u) + ((h & 2) ? -v : v); }
function noise3(x, y, z) {
  const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
  const X = fx & 255, Y = fy & 255, Z = fz & 255; x -= fx; y -= fy; z -= fz;
  const u = fadeC(x), v = fadeC(y), w = fadeC(z), P = PERM;
  const A = P[X] + Y, AA = P[A] + Z, AB = P[A + 1] + Z, B = P[X + 1] + Y, BA = P[B] + Z, BB = P[B + 1] + Z;
  return lerp(
    lerp(lerp(grad(P[AA], x, y, z), grad(P[BA], x - 1, y, z), u), lerp(grad(P[AB], x, y - 1, z), grad(P[BB], x - 1, y - 1, z), u), v),
    lerp(lerp(grad(P[AA + 1], x, y, z - 1), grad(P[BA + 1], x - 1, y, z - 1), u), lerp(grad(P[AB + 1], x, y - 1, z - 1), grad(P[BB + 1], x - 1, y - 1, z - 1), u), v), w);
}

function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
const cv = mkCanvas(W, H);
const ctx = cv.getContext('2d');

let FX;
function resetFX() { FX = { ca: 0.0012, glitch: 0, flash: 0, bloom: 0, vig: 0.18, hud: { show: true, dark: true, alpha: 1 } }; }

function bg(c) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none'; ctx.fillStyle = c; ctx.fillRect(0, 0, W, H); ctx.restore(); }
function glow(x, y, r, c, a) { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba(c, a)); g.addColorStop(1, rgba(c, 0)); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r); }
function rrect(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2))); }
function blueprint(color, cell = 40, alpha = 1, ox = 0, oy = 0) {
  ctx.save(); ctx.globalAlpha *= alpha; ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath();
  for (let x = ((ox % cell) + cell) % cell; x <= W; x += cell) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); }
  for (let y = ((oy % cell) + cell) % cell; y <= H; y += cell) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
  ctx.stroke(); ctx.restore();
}

// ---------------------------------------------------------------- type
const LAYC = new Map();
function lay(str, font, track = 0) {
  const key = str + '|' + font + '|' + track;
  let L = LAYC.get(key);
  if (L) return L;
  ctx.save(); ctx.font = font; ctx.letterSpacing = '0px';
  const chars = [...str], out = [];
  let pre = '';
  for (let i = 0; i < chars.length; i++) { out.push({ ch: chars[i], x: ctx.measureText(pre).width + track * i, w: ctx.measureText(chars[i]).width }); pre += chars[i]; }
  L = { chars: out, width: ctx.measureText(str).width + track * (chars.length - 1), cap: ctx.measureText('H').actualBoundingBoxAscent };
  ctx.restore(); LAYC.set(key, L);
  return L;
}
function word(str, font, cx, cy, track, fn, align = 'center') {
  const L = lay(str, font, track);
  ctx.font = font; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'; ctx.letterSpacing = '0px';
  const x0 = align === 'center' ? cx - L.width / 2 : align === 'right' ? cx - L.width : cx;
  L.chars.forEach((c, i) => {
    ctx.save(); ctx.translate(x0 + c.x + c.w / 2, cy);
    if (!fn || fn(i, c, L) !== false) ctx.fillText(c.ch, -c.w / 2, L.cap / 2);
    ctx.restore();
  });
  return L;
}
const GLYPHS = '!<>-_\\/[]{}=+*^?#01ABCDEFXZ%&@';
function scramble(str, age, dur = 0.45, seed = 0) {
  if (age >= dur) return str;
  const n = str.length, k = Math.floor(age * 40);
  let o = '';
  for (let i = 0; i < n; i++) {
    const done = age > (i / n) * dur * 0.8 + dur * 0.2;
    o += done || str[i] === ' ' ? str[i] : GLYPHS[Math.floor(hash(i, k, seed) * GLYPHS.length)];
  }
  return o;
}
// A line of display type animated from `age` (seconds since its cue). Styles: drop | rise | pop | fade.
// `out` (seconds since its exit cue) wipes it back down. Returns the layout.
function slamLine(str, cx, cy, age, o = {}) {
  const size = o.size || 150, weight = o.weight || 600, track = o.track ?? -size * 0.02;
  const font = fnt(weight, size, o.family || FONT.display);
  const style = o.style || 'rise', stag = o.stagger ?? 0.02, color = o.color || COL.ink, out = o.out ?? -1;
  if (age < 0) return lay(str, font, track);
  return word(str, font, cx, cy, track, (i, c, L) => {
    const a = age - i * stag;
    if (a < 0) return false;
    const q = out > 0 ? E.inC(clamp((out - i * 0.012) / 0.22)) : 0;
    if (q >= 1) return false;
    if (style === 'drop') { const p = spring(a, 3.6, 0.45); ctx.translate(0, (1 - p) * -size * 1.3); ctx.globalAlpha = clamp(a / 0.05); }
    else if (style === 'pop') { const p = spring(a, 3.4, 0.38); ctx.scale(p, p); }
    else if (style === 'fade') { const p = E.outC(clamp(a / 0.5)); ctx.globalAlpha = p; ctx.translate(0, (1 - p) * 24); }
    if (style === 'rise' || q > 0) { ctx.beginPath(); ctx.rect(-c.w, -L.cap / 2 - size * 0.2, c.w * 2, L.cap + size * 0.4); ctx.clip(); }
    if (style === 'rise') { const p = E.outExpo(clamp(a / 0.34)); ctx.translate(0, (1 - p) * L.cap * 1.35); }
    if (q > 0) ctx.translate(0, q * L.cap * 1.4);
    ctx.fillStyle = typeof color === 'function' ? color(i) : color;
  }, o.align || 'center');
}
function eyebrow(str, x, y, color, o = {}) {
  ctx.save(); ctx.font = fnt(o.weight || 600, o.size || 16, FONT.mono); ctx.letterSpacing = (o.track ?? 4) + 'px'; ctx.textBaseline = 'middle';
  const s = str.toUpperCase(), w = ctx.measureText(s).width;
  const x0 = o.align === 'left' ? x + (o.dots === false ? 0 : 16) : o.align === 'right' ? x - w - (o.dots === false ? 0 : 16) : x - w / 2;
  ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.fillText(s, x0, y);
  if (o.dots !== false) { ctx.fillStyle = o.dot || COL.indigo; for (const dx of [x0 - 15, x0 + w + 9]) { ctx.beginPath(); ctx.arc(dx, y, 3.2, 0, TAU); ctx.fill(); } }
  ctx.restore();
  return w;
}
function sampleCanvas(c, step, thresh = 128) {
  const x = c.getContext('2d', { willReadFrequently: true }), d = x.getImageData(0, 0, c.width, c.height).data, pts = [];
  for (let y = step / 2; y < c.height; y += step) for (let xx = step / 2; xx < c.width; xx += step) {
    const k = ((y | 0) * c.width + (xx | 0)) * 4;
    if (d[k + 3] > thresh) pts.push([xx, y, d[k], d[k + 1], d[k + 2]]);
  }
  return pts;
}

// ---------------------------------------------------------------- brand
const IMG = { ui: {}, cards: {} };
const TEXS = { cards: {} };
// Real captures of the app (ClipHistory --demo --demo-scale 2.5, see assets/README): popup states 2600×800 px and
// history cards 390×235 px, both at 5 px per point.
const UI_STATES = ['base', 'sel0', 'sel1', 'sel2', 'sel3', 'colors', 'code', 'links', 'text', 'fig', 'figpin'];
const CARDS = {
  'link-figma': 'link', 'color-indigo': 'color', 'code-git': 'code', 'text-launch': 'text', 'image-sunset': 'image',
  'link-github': 'link', 'color-red': 'color', 'text-release': 'text', 'code-npm': 'code', 'link-meet': 'link',
  'text-dinner': 'text', 'color-cyan': 'color',
};
// a real card drawn flat at scale k (1 = 78×47 pt), with the app's 10 pt corners
function cardImg(name, x, y, k, alpha = 1) {
  ctx.save(); ctx.globalAlpha *= alpha; rrect(x, y, 78 * k, 47 * k, 10 * k); ctx.clip();
  ctx.drawImage(IMG.cards[name], x, y, 78 * k, 47 * k); ctx.restore();
}
function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('img ' + src)); i.src = src; }); }
// The rendered app icon has transparent margins: the squircle spans 10%..90% of the image.
function drawIcon(cx, cy, size, alpha = 1) {
  const s = size / 0.8;
  ctx.save(); ctx.globalAlpha *= alpha; ctx.drawImage(IMG.icon, cx - s / 2, cy - s / 2, s, s); ctx.restore();
}
// Lockup: icon (1.15× cap) + "ClipHistory" in Inter 800, tracking −0.035em
function wordmarkLayout(size) {
  const font = fnt(800, size, FONT.ui), L = lay('ClipHistory', font, -0.035 * size), ic = size * 1.18, gap = size * 0.3;
  return { font, L, ic, gap, width: ic + gap + L.width };
}
function drawWordmark(x, cy, size, color = COL.ink, align = 'left', o = {}) {
  const WL = wordmarkLayout(size), x0 = align === 'center' ? x - WL.width / 2 : align === 'right' ? x - WL.width : x;
  if (o.icon !== false) drawIcon(x0 + WL.ic / 2, cy, WL.ic);
  ctx.save(); ctx.font = WL.font; ctx.letterSpacing = (-0.035 * size).toFixed(2) + 'px'; ctx.fillStyle = color; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  ctx.fillText('ClipHistory', x0 + WL.ic + WL.gap, cy + WL.L.cap / 2); ctx.restore();
  return WL;
}

// Category glyphs, drawn the way the app's SF Symbols read at this size
function kindIcon(kind, cx, cy, s, color, lw = 0.11) {
  ctx.save(); ctx.translate(cx - s / 2, cy - s / 2); ctx.scale(s / 24, s / 24);
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lw * 24; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (kind === 'text') { [[5, 18], [10, 14], [15, 18], [20, 11]].forEach(([y, w]) => { ctx.beginPath(); ctx.moveTo(3, y); ctx.lineTo(3 + w, y); ctx.stroke(); }); }
  else if (kind === 'link') {
    ctx.beginPath(); ctx.moveTo(10, 14); ctx.bezierCurveTo(11.8, 15.8, 14.6, 15.8, 16.4, 14); ctx.lineTo(19.6, 10.8); ctx.bezierCurveTo(21.4, 9, 21.4, 6.2, 19.6, 4.4); ctx.bezierCurveTo(17.8, 2.6, 15, 2.6, 13.2, 4.4); ctx.lineTo(11.6, 6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(14, 10); ctx.bezierCurveTo(12.2, 8.2, 9.4, 8.2, 7.6, 10); ctx.lineTo(4.4, 13.2); ctx.bezierCurveTo(2.6, 15, 2.6, 17.8, 4.4, 19.6); ctx.bezierCurveTo(6.2, 21.4, 9, 21.4, 10.8, 19.6); ctx.lineTo(12.4, 18); ctx.stroke();
  } else if (kind === 'code') { ctx.beginPath(); ctx.moveTo(8, 7); ctx.lineTo(3, 12); ctx.lineTo(8, 17); ctx.moveTo(16, 7); ctx.lineTo(21, 12); ctx.lineTo(16, 17); ctx.moveTo(13.5, 4.5); ctx.lineTo(10.5, 19.5); ctx.stroke(); }
  else if (kind === 'color') { ctx.beginPath(); ctx.arc(12, 12, 9, 0, TAU); ctx.stroke(); for (const [x, y] of [[8.5, 10], [13, 7.5], [16, 11.5]]) { ctx.beginPath(); ctx.arc(x, y, 1.8, 0, TAU); ctx.fill(); } }
  else if (kind === 'image') { rrectRaw(3, 4.5, 18, 15, 3); ctx.stroke(); ctx.beginPath(); ctx.moveTo(3.5, 17); ctx.lineTo(8.5, 12); ctx.lineTo(12.5, 16); ctx.lineTo(15.5, 13); ctx.lineTo(20.5, 18); ctx.stroke(); ctx.beginPath(); ctx.arc(16, 9, 1.6, 0, TAU); ctx.fill(); }
  ctx.restore();
}
function rrectRaw(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function hexColor(text) {
  const h = text.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const v = parseInt(h, 16), r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
  return { c: text, light: (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 };
}
// A history card exactly as the app draws it: 78×47 points scaled by k, 10 pt corners, glass tinted by kind,
// centred icon + text, age in the corner. o.sel draws the accent ring, o.pinned the orange pin.
function drawClip(x, y, k, clip, o = {}) {
  const w = 78 * k, h = 47 * k, r = 10 * k, tint = COL[clip.kind];
  ctx.save();
  if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
  if (o.shadow !== false) { ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 10 * k; ctx.shadowOffsetY = 3 * k; }
  rrect(x, y, w, h, r);
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, rgba(tint, o.dark === false ? 0.30 : 0.42)); g.addColorStop(1, rgba(tint, o.dark === false ? 0.16 : 0.22));
  ctx.fillStyle = o.dark === false ? '#FFFFFF' : '#1A1C33'; ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = g; ctx.fill();
  ctx.save(); rrect(x, y, w, h, r); ctx.clip();
  const fg = o.dark === false ? COL.ink : '#FFFFFF';
  if (clip.kind === 'image') {
    const sky = ctx.createLinearGradient(0, y, 0, y + h);
    sky.addColorStop(0, '#7FC8FF'); sky.addColorStop(0.55, '#BFE6FF'); sky.addColorStop(0.551, '#6CC36B'); sky.addColorStop(1, '#3E8E3F');
    ctx.fillStyle = sky; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#FFF4A8'; ctx.beginPath(); ctx.arc(x + w * 0.25, y + h * 0.3, h * 0.12, 0, TAU); ctx.fill();
    ctx.fillStyle = '#5C7FA8'; ctx.beginPath(); ctx.moveTo(x + w * 0.42, y + h * 0.58); ctx.lineTo(x + w * 0.62, y + h * 0.28); ctx.lineTo(x + w * 0.82, y + h * 0.58); ctx.fill();
  } else if (clip.kind === 'color') {
    const hc = hexColor(clip.text);
    ctx.fillStyle = hc ? hc.c : tint; ctx.fillRect(x, y, w, h);
    ctx.font = fnt(700, 8.5 * k, FONT.mono); ctx.fillStyle = hc && hc.light ? '#000' : '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(clip.text.toUpperCase(), x + w / 2, y + h / 2 - 1 * k);
  } else {
    // up to two centred lines, like the app's lineLimit(2); the kind icon sits before the first line
    const code = clip.kind === 'code';
    ctx.font = code ? fnt(500, 8 * k, FONT.mono) : fnt(650, 9.5 * k, FONT.ui);
    const iconW = code ? 0 : 10 * k, maxW = w - 12 * k, lines = [];
    let cur = '';
    for (const part of clip.text.split(' ')) {
      const next = cur ? cur + ' ' + part : part, lim = lines.length === 0 ? maxW - iconW : maxW;
      if (cur && ctx.measureText(next).width > lim) { lines.push(cur); cur = part; } else cur = next;
    }
    lines.push(cur);
    if (lines.length > 2) { lines.length = 2; lines[1] += '…'; }
    const lh = (code ? 9.5 : 11.5) * k, y0 = y + h / 2 - 2 * k - ((lines.length - 1) * lh) / 2;
    ctx.fillStyle = fg; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    lines.forEach((ln, i) => {
      const lw = ctx.measureText(ln).width + (i === 0 ? iconW : 0), lx = x + w / 2 - Math.min(lw, maxW) / 2;
      if (i === 0 && !code) kindIcon(clip.kind, lx + 3.5 * k, y0, 8 * k, tint, 0.13);
      ctx.fillText(ln, lx + (i === 0 ? iconW : 0), y0 + i * lh);
    });
  }
  ctx.restore();
  ctx.font = fnt(600, 7.5 * k, FONT.ui); ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
  if (o.pinned) drawPin(x + w - 9 * k, y + h - 6 * k, 7 * k, COL.pin);
  else if (clip.age) { ctx.fillStyle = clip.kind === 'image' || clip.kind === 'color' ? 'rgba(255,255,255,0.9)' : (o.dark === false ? 'rgba(14,16,32,0.55)' : 'rgba(255,255,255,0.6)'); ctx.fillText(clip.age, x + w - 6 * k, y + h - 4 * k); }
  if (o.sel) { rrect(x - 1, y - 1, w + 2, h + 2, r + 1); ctx.strokeStyle = COL.indigoHi; ctx.lineWidth = 1.6 * k; ctx.stroke(); }
  ctx.restore();
  return { w, h };
}
function drawPin(cx, cy, s, color) {
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.PI / 4); ctx.scale(s / 24, s / 24); ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 2.4; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(-3, -10); ctx.lineTo(3, -10); ctx.lineTo(2, -4); ctx.lineTo(6, 0); ctx.lineTo(-6, 0); ctx.lineTo(-2, -4); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 9); ctx.stroke(); ctx.restore();
}
function keycap(cx, cy, s, label, press = 0, dark = true) {
  ctx.save(); ctx.translate(cx, cy + press * s * 0.06);
  const r = s * 0.2, depth = s * 0.08 * (1 - press);
  rrect(-s / 2, -s / 2 + depth, s, s, r); ctx.fillStyle = dark ? '#000' : '#C9CCDA'; ctx.fill();
  rrect(-s / 2, -s / 2, s, s, r);
  const g = ctx.createLinearGradient(0, -s / 2, 0, s / 2);
  if (dark) { g.addColorStop(0, press > 0.5 ? '#3E36C9' : '#2A2D45'); g.addColorStop(1, press > 0.5 ? '#2E25A8' : '#1B1D33'); }
  else { g.addColorStop(0, '#FFFFFF'); g.addColorStop(1, '#ECEDF4'); }
  ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = dark ? 'rgba(255,255,255,0.14)' : 'rgba(14,16,32,0.12)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = dark ? '#FFFFFF' : COL.ink; ctx.font = fnt(500, s * 0.42, FONT.ui); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, 0, s * 0.02);
  ctx.restore();
}
function drawCursor(x, y, press = 0, scale = 1.3) {
  ctx.save(); ctx.translate(x, y); const s = scale * (1 - 0.15 * press); ctx.scale(s, s);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 25); ctx.lineTo(6, 19.5); ctx.lineTo(10.5, 29); ctx.lineTo(14.5, 27.2); ctx.lineTo(10.2, 18); ctx.lineTo(18, 18); ctx.closePath();
  ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
  ctx.fillStyle = '#111'; ctx.fill(); ctx.shadowColor = 'transparent'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.8; ctx.stroke();
  ctx.restore();
}

// a real card as a 3D glass slab at scale k (1 = 78×47 pt), centred on (x, y)
function glassCard(name, x, y, k, o = {}) {
  GLASS({ x, y, z: o.z || 0, w: 78 * k, h: 47 * k, d: 7 * k, r: 10 * k, yaw: o.yaw || 0, pitch: o.pitch || 0, roll: o.roll || 0,
    tex: TEXS.cards[name], tint: COL[CARDS[name]], alpha: o.alpha ?? 1, gloss: o.gloss ?? 0.9 });
}
// an image (card, icon, popup) breaking into a grid of its own pixels that fly, spin and fade — pure function of age
function shatterImg(img, x, y, w, h, age, seed, o = {}) {
  if (age < 0 || age > 1) return;
  const nx = o.nx || 14, ny = o.ny || 8, cw = w / nx, ch = h / ny, sw = img.width / nx, sh = img.height / ny, spread = o.spread || 1;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const h1 = hash(i, j, seed), h2 = hash(j, i, seed + 7), h3 = hash(i + j, seed, 3);
    const vx = ((i / nx - 0.5) * 900 + (h1 - 0.5) * 700) * spread, vy = ((j / ny - 0.5) * 500 - 500 * h2) * spread;
    const a = clamp(1 - age / (0.5 + h3 * 0.45));
    if (a <= 0) continue;
    ctx.save(); ctx.globalAlpha = a;
    ctx.translate(x + (i + 0.5) * cw + vx * age, y + (j + 0.5) * ch + vy * age + 1300 * age * age);
    ctx.rotate((h1 - 0.5) * 12 * age); const sc = 1 - age * 0.4; ctx.scale(sc, sc);
    ctx.drawImage(img, i * sw, j * sh, sw, sh, -cw / 2, -ch / 2, cw + 0.5, ch + 0.5);
    ctx.restore();
  }
}

// ---------------------------------------------------------------- HUD
function sceneOf(t) { for (const s of TL.SCENES) if (t < s.end) return s; return TL.SCENES[TL.SCENES.length - 1]; }
function hudPill(x, cy, text, dark, o = {}) {
  ctx.save(); ctx.font = fnt(700, 17, FONT.ui); ctx.letterSpacing = '0px'; ctx.textBaseline = 'middle';
  const tw = ctx.measureText(text).width, w = 18 + (o.icon ? 26 : 0) + tw + 18, x0 = x - w;
  rrect(x0, cy - 19, w, 38, 19); ctx.fillStyle = dark ? 'rgba(255,255,255,0.07)' : '#FFFFFF'; ctx.fill();
  ctx.strokeStyle = o.accent ? rgba(COL.indigo, 0.8) : dark ? 'rgba(255,255,255,0.16)' : '#E3E4EE'; ctx.lineWidth = 1.5; ctx.stroke();
  if (o.icon) o.icon(x0 + 18 + 10, cy);
  ctx.fillStyle = dark ? '#FFFFFF' : COL.ink; ctx.textAlign = 'left'; ctx.fillText(text, x0 + 18 + (o.icon ? 26 : 0), cy + 1);
  ctx.restore();
  return w;
}
function drawLock(cx, cy, s, color, lw = 2) {
  ctx.save(); ctx.translate(cx, cy); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round';
  rrect(-s * 0.42, -s * 0.05, s * 0.84, s * 0.6, s * 0.12); ctx.fill();
  ctx.beginPath(); ctx.arc(0, -s * 0.05, s * 0.27, Math.PI, 0); ctx.stroke(); ctx.restore();
}
function clipsCount(t) {
  // the HUD counter ticks up with every copy in the reel, then settles on 50
  const presses = CUES.copy.presses.filter((p) => t >= p).length;
  return t < bar(5) ? presses : 50;
}
function drawHUD(t) {
  const h = FX.hud;
  if (!h.show || h.alpha <= 0 || t < CUES.reveal.hudBoot[0]) return;
  const s = sceneOf(t), fg = h.dark ? '#FFFFFF' : COL.ink, m = 52;
  const [b0, b1] = CUES.reveal.hudBoot;
  const boot = (k) => E.outC(inv(b0 + k * (b1 - b0) / 4, b0 + (k + 1.4) * (b1 - b0) / 4, t));
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
  const a0 = boot(0);
  if (a0 > 0) { ctx.globalAlpha = h.alpha * a0; drawWordmark(m, m, 23, fg, 'left'); }
  const a1 = boot(1);
  if (a1 > 0) {
    ctx.globalAlpha = h.alpha * a1;
    let x = W - m;
    x -= hudPill(x, m, 'Encrypted', h.dark, { icon: (ix, iy) => drawLock(ix, iy, 16, COL.ok, 2) }) + 10;
    x -= hudPill(x, m, `${clipsCount(t)} clips`, h.dark, { icon: (ix, iy) => kindIcon('text', ix, iy, 17, COL.text, 0.13) }) + 10;
    hudPill(x, m, '⇧⌘V', h.dark, { accent: true });
  }
  const a2 = boot(2);
  if (a2 > 0) { ctx.globalAlpha = h.alpha * a2; eyebrow(scramble(s.tag, t - s.start, 0.4, s.start | 0), m, H - m, rgba(fg, 0.7), { align: 'left', size: 14, track: 4 }); }
  const a3 = boot(3);
  if (a3 > 0) { ctx.globalAlpha = h.alpha * a3; ctx.font = fnt(600, 14, FONT.mono); ctx.letterSpacing = '4px'; ctx.fillStyle = rgba(fg, 0.7); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText('FREE & OPEN SOURCE · MACOS', W - m, H - m); }
  ctx.restore();
}

// ---------------------------------------------------------------- shared GL for fullscreen shaders
const GL_VS = `#version 300 es
in vec2 p; out vec2 uv; void main(){ uv = p * .5 + .5; gl_Position = vec4(p, 0., 1.); }`;
function glCompile(g, vs, fs) {
  const mk = (type, src) => { const s = g.createShader(type); g.shaderSource(s, src); g.compileShader(s); if (!g.getShaderParameter(s, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(s)); return s; };
  const p = g.createProgram(); g.attachShader(p, mk(g.VERTEX_SHADER, vs)); g.attachShader(p, mk(g.FRAGMENT_SHADER, fs)); g.linkProgram(p);
  if (!g.getProgramParameter(p, g.LINK_STATUS)) throw new Error(g.getProgramInfoLog(p));
  const vao = g.createVertexArray(); g.bindVertexArray(vao);
  const b = g.createBuffer(); g.bindBuffer(g.ARRAY_BUFFER, b); g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), g.STATIC_DRAW);
  const loc = g.getAttribLocation(p, 'p'); g.enableVertexAttribArray(loc); g.vertexAttribPointer(loc, 2, g.FLOAT, false, 0, 0);
  const u = {}; const n = g.getProgramParameter(p, g.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = g.getActiveUniform(p, i); u[info.name] = { loc: g.getUniformLocation(p, info.name), type: info.type }; }
  return { p, u, vao };
}
const GLX = (() => {
  const canvas = mkCanvas(W, H);
  const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, premultipliedAlpha: true, alpha: true, antialias: false });
  function program(fs) {
    const P = glCompile(gl, GL_VS, fs);
    return function draw(uniforms = {}) {
      gl.viewport(0, 0, W, H); gl.useProgram(P.p); gl.bindVertexArray(P.vao);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      if (P.u.uRes) gl.uniform2f(P.u.uRes.loc, W, H);
      for (const k in uniforms) {
        const u = P.u[k]; if (!u) continue; const v = uniforms[k];
        if (typeof v === 'number') gl.uniform1f(u.loc, v); else if (v.length === 2) gl.uniform2fv(u.loc, v); else if (v.length === 3) gl.uniform3fv(u.loc, v); else gl.uniform4fv(u.loc, v);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return canvas;
    };
  }
  // texture(source): upload an image once (mipmapped, clamped). Row 0 of the image is uv.y = 0.
  function texture(source) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source); gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  return { canvas, gl, program, texture };
})();

// ---------------------------------------------------------------- 3D glass slabs (raymarched)
// A rounded glass slab whose front face shows a real screenshot (a history card or the app icon), lit by a procedural
// studio: warm key softbox, cool rim, overhead strip, fresnel clear coat and bright edges. World units are pixels; the
// camera sits D px in front of the screen plane, so z > 0 pushes an object away. Each slab only renders inside its
// projected bounding box (scissor), so a dozen of them per frame stay cheap.
const GLASS = (() => {
  const gl = GLX.gl, D = 2400;
  const P = glCompile(gl, GL_VS, `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform vec2 uRes; uniform vec3 uC, uB, uX, uY, uZ, uTint; uniform float uRad, uAlpha, uD, uGloss, uFace;
uniform sampler2D uTex;
float sdBox(vec3 p){ vec3 q = abs(p) - (uB - uRad); return length(max(q, 0.)) + min(max(q.x, max(q.y, q.z)), 0.) - uRad; }
vec3 toLocal(vec3 p){ vec3 d = p - uC; return vec3(dot(d, uX), dot(d, uY), dot(d, uZ)); }
float map(vec3 p){ return sdBox(toLocal(p)); }
vec3 env(vec3 d){
  vec3 c = mix(vec3(.015, .015, .05), vec3(.16, .15, .34), smoothstep(-.6, .9, d.y));
  c += vec3(1., .96, .9) * 3.2 * smoothstep(.9, .985, dot(d, normalize(vec3(-.55, .62, -.55))));
  c += vec3(.55, .6, 1.) * 2. * smoothstep(.93, .995, dot(d, normalize(vec3(.75, .15, -.62))));
  c += vec3(1.) * 1.2 * smoothstep(.02, .0, abs(d.y - .8)) * smoothstep(.6, .2, abs(d.x));
  return c;
}
void main(){
  vec3 ro = vec3(0., 0., -uD);
  vec3 rd = normalize(vec3(uv * uRes - uRes * .5, 0.) - ro);
  float rb = length(uB) * 1.02;
  vec3 oc = ro - uC; float b = dot(oc, rd), h = b * b - dot(oc, oc) + rb * rb;
  if (h < 0.) { o = vec4(0.); return; }
  float t = max(0., -b - sqrt(h)), tmax = -b + sqrt(h);
  bool hit = false;
  for (int i = 0; i < 90; i++) { float d = map(ro + rd * t); if (d < .25) { hit = true; break; } t += d; if (t > tmax) break; }
  if (!hit) { o = vec4(0.); return; }
  vec3 p = ro + rd * t;
  vec2 e = vec2(.6, 0.);
  vec3 n = normalize(vec3(map(p + e.xyy) - map(p - e.xyy), map(p + e.yxy) - map(p - e.yxy), map(p + e.yyx) - map(p - e.yyx)));
  vec3 lp = toLocal(p), ln = vec3(dot(n, uX), dot(n, uY), dot(n, uZ));
  float ndv = max(dot(-rd, n), 0.), fres = .04 + .96 * pow(1. - ndv, 5.);
  vec3 refl = env(reflect(rd, n));
  float face = smoothstep(.8, .96, -ln.z) * uFace;
  vec2 tuv = vec2(lp.x / (uB.x * 2.) + .5, .5 - lp.y / (uB.y * 2.));
  vec3 tex = texture(uTex, tuv).rgb;
  vec3 side = uTint * .55 + refl * .45;
  vec3 col = mix(side, tex, face);
  col += refl * fres * uGloss;
  col += vec3(.9, .92, 1.) * pow(1. - ndv, 7.) * .55;
  o = vec4(col * uAlpha, uAlpha);
}`);
  const rot = (yaw, pitch, roll) => {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
    // local axes in world space: R = Ry(yaw) · Rx(pitch) · Rz(roll)
    const X = [cy * cr + sy * sp * sr, cp * sr, -sy * cr + cy * sp * sr];
    const Y = [-cy * sr + sy * sp * cr, cp * cr, sy * sr + cy * sp * cr];
    const Z = [sy * cp, -sp, cy * cp];
    return { X, Y, Z };
  };
  // o: { x, y (screen px of the centre at z = 0), z, w, h, d, r, yaw, pitch, roll, tex, tint '#hex', alpha, gloss, face }
  return function drawGlass(o) {
    const z = o.z || 0, s = D / (D + z), cx = (o.x - CX), cy = (CY - o.y);
    const C = [cx / s, cy / s, z];
    const R = Math.hypot(o.w, o.h, o.d || 20) * 0.5 * s * 1.25;
    const sx = CX + cx, sy = CY - cy;
    const x0 = Math.max(0, Math.floor(sx - R)), y0 = Math.max(0, Math.floor(sy - R)), x1 = Math.min(W, Math.ceil(sx + R)), y1 = Math.min(H, Math.ceil(sy + R));
    if (x1 <= x0 || y1 <= y0 || (o.alpha ?? 1) <= 0) return;
    const A = rot(o.yaw || 0, o.pitch || 0, o.roll || 0), tint = hex2rgb(o.tint || '#5B4BFF').map((v) => v / 255);
    gl.viewport(0, 0, W, H); gl.useProgram(P.p); gl.bindVertexArray(P.vao);
    gl.enable(gl.SCISSOR_TEST); gl.scissor(x0, H - y1, x1 - x0, y1 - y0);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    const u = P.u;
    gl.uniform2f(u.uRes.loc, W, H); gl.uniform3fv(u.uC.loc, C); gl.uniform3fv(u.uB.loc, [o.w / 2, o.h / 2, (o.d || 20) / 2]);
    gl.uniform3fv(u.uX.loc, A.X); gl.uniform3fv(u.uY.loc, A.Y); gl.uniform3fv(u.uZ.loc, A.Z); gl.uniform3fv(u.uTint.loc, tint);
    gl.uniform1f(u.uRad.loc, o.r ?? 12); gl.uniform1f(u.uAlpha.loc, o.alpha ?? 1); gl.uniform1f(u.uD.loc, D);
    gl.uniform1f(u.uGloss.loc, o.gloss ?? 0.9); gl.uniform1f(u.uFace.loc, o.face ?? 1);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, o.tex); gl.uniform1i(u.uTex.loc, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.SCISSOR_TEST);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(GLX.canvas, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
    ctx.restore();
  };
})();

// ---------------------------------------------------------------- post: glitch slices, chromatic aberration, bloom, vignette, then flash
const out = document.getElementById('out');
const pgl = out.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, alpha: false });
const POST = glCompile(pgl, GL_VS, `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D tex; uniform float ca, glitch, flash, bloom, vig, seed;
float h1(float n){ return fract(sin(n * 127.1) * 43758.5453); }
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  vec2 u = uv;
  float g = glitch;
  if (g > 0.001) {
    float band = floor(u.y * mix(10., 46., h1(seed)));
    if (h2(vec2(band, seed)) < g * .7) u.x += (h2(vec2(band, seed + 7.)) - .5) * .22 * g;
  }
  vec2 d = u - .5;
  float r2 = dot(d, d);
  vec2 off = d * (ca + g * .02) * (.6 + r2 * 3.) + vec2(g * .012 * (h1(seed + 3.) - .5), 0.);
  vec3 c = vec3(texture(tex, u + off).r, texture(tex, u).g, texture(tex, u - off).b);
  vec3 b = textureLod(tex, u, 3.5).rgb * .35 + textureLod(tex, u, 5.).rgb * .4 + textureLod(tex, u, 6.5).rgb * .25;
  c += max(b - .4, 0.) * bloom;
  c *= 1. - vig * smoothstep(.05, .75, r2 * 2.2);
  c = mix(c, vec3(1.), clamp(flash, 0., 1.));
  o = vec4(c, 1.);
}`);
const TEX = pgl.createTexture();
pgl.bindTexture(pgl.TEXTURE_2D, TEX);
pgl.texParameteri(pgl.TEXTURE_2D, pgl.TEXTURE_MIN_FILTER, pgl.LINEAR_MIPMAP_LINEAR);
pgl.texParameteri(pgl.TEXTURE_2D, pgl.TEXTURE_MAG_FILTER, pgl.LINEAR);
pgl.texParameteri(pgl.TEXTURE_2D, pgl.TEXTURE_WRAP_S, pgl.CLAMP_TO_EDGE);
pgl.texParameteri(pgl.TEXTURE_2D, pgl.TEXTURE_WRAP_T, pgl.CLAMP_TO_EDGE);
function post(t) {
  pgl.viewport(0, 0, W, H); pgl.useProgram(POST.p); pgl.bindVertexArray(POST.vao);
  pgl.activeTexture(pgl.TEXTURE0); pgl.bindTexture(pgl.TEXTURE_2D, TEX);
  pgl.pixelStorei(pgl.UNPACK_FLIP_Y_WEBGL, true);
  pgl.texImage2D(pgl.TEXTURE_2D, 0, pgl.RGBA, pgl.RGBA, pgl.UNSIGNED_BYTE, cv);
  pgl.generateMipmap(pgl.TEXTURE_2D);
  const u = POST.u;
  pgl.uniform1i(u.tex.loc, 0);
  pgl.uniform1f(u.ca.loc, FX.ca); pgl.uniform1f(u.glitch.loc, FX.glitch); pgl.uniform1f(u.flash.loc, FX.flash); pgl.uniform1f(u.bloom.loc, FX.bloom);
  pgl.uniform1f(u.vig.loc, FX.vig); pgl.uniform1f(u.seed.loc, Math.floor(t * 30) % 97 + 1);
  pgl.drawArrays(pgl.TRIANGLES, 0, 3);
}

// ---------------------------------------------------------------- scenes + frame loop
const SCENES = {};
function shakeAt(t) { let s = 0; for (const im of TL.IMPACTS) if (t >= im.t) s += im.a * Math.exp(-(t - im.t) * 8); return s; }
function drawScene(id, lt, t) {
  const S = SCENES[id];
  if (!S) { bg('#222'); ctx.fillStyle = '#f55'; ctx.font = fnt(600, 60, FONT.mono); ctx.textAlign = 'center'; ctx.fillText(`scene "${id}" missing`, CX, CY); return; }
  try { S.draw(lt, t); }
  catch (e) {
    console.error(`scene ${id} @${t.toFixed(3)}: ${e.stack || e}`);
    bg('#300'); ctx.fillStyle = '#f88'; ctx.font = fnt(500, 28, FONT.mono); ctx.textAlign = 'left'; ctx.fillText(`${id}: ${e.message}`, 60, CY);
  }
}
function renderFrame(t) {
  resetFX();
  const s = sceneOf(t), sh = shakeAt(t);
  ctx.save();
  if (sh > 0.01) { ctx.translate(noise3(t * 25, 1.3, 0) * 22 * sh, noise3(t * 25, 7.7, 0) * 22 * sh); FX.ca += 0.005 * sh; }
  drawScene(s.id, t - s.start, t);
  ctx.restore();
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none'; ctx.letterSpacing = '0px'; ctx.shadowColor = 'transparent';
  drawHUD(t);
  post(t);
}

window.ready = (async () => {
  await document.fonts.ready;
  const faces = ['500 60px Oswald', '600 60px Oswald', '700 60px Oswald', '400 20px Inter', '500 20px Inter', '600 20px Inter', '700 20px Inter', '800 20px Inter', '500 20px "JetBrains Mono"', '600 20px "JetBrains Mono"', '700 20px "JetBrains Mono"'];
  await Promise.all(faces.map((f) => document.fonts.load(f, 'AZaz09⇧⌘#')));
  IMG.icon = await loadImg('assets/icon.png');
  IMG.wall = await loadImg('assets/wallpaper.png');
  for (const k of UI_STATES) IMG.ui[k] = await loadImg(`assets/ui/${k}.png`);
  for (const k of Object.keys(CARDS)) { IMG.cards[k] = await loadImg(`assets/cards/${k}.png`); TEXS.cards[k] = GLX.texture(IMG.cards[k]); }
  // the icon's squircle fills the middle 80% of the image; crop it so the glass slab's face maps onto the squircle only
  const ic = mkCanvas(820, 820); ic.getContext('2d').drawImage(IMG.icon, IMG.icon.width * 0.1, IMG.icon.height * 0.1, IMG.icon.width * 0.8, IMG.icon.height * 0.8, 0, 0, 820, 820);
  TEXS.icon = GLX.texture(ic);
  for (const k in SCENES) if (SCENES[k].init) await SCENES[k].init();
  return true;
})();
window.renderFrame = renderFrame;
window.snap = () => out.toDataURL('image/png');

if (/play/.test(location.search)) {
  window.ready.then(() => {
    const audio = new Audio('reel.wav');
    let t0 = null;
    document.body.addEventListener('click', () => { audio.currentTime = 0; audio.play(); t0 = performance.now(); });
    const loop = () => {
      const t = !audio.paused ? audio.currentTime : t0 ? ((performance.now() - t0) / 1000) % TL.DURATION : 0;
      renderFrame(Math.min(t, TL.DURATION - 0.01));
      requestAnimationFrame(loop);
    };
    loop();
  });
}
