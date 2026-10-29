// ClipHistory presentation: flat 2D motion slides in black and lime, timed to the narration. voice.json (written by
// narrate.py) gives the start of every spoken line, so every visual beat is pinned to the words that describe it.
const W = 1920, H = 1080, TAU = Math.PI * 2;
const out = document.getElementById('out'), ctx = out.getContext('2d');
const COL = { bg: '#0B0B0C', lime: '#C6FF3D', white: '#F5F5F7', grey: '#8A8A8F', dim: '#5A5A60', card: '#161618', stroke: '#2A2A2E', red: '#FF4D4D', orange: '#FF9F0A' };
const FONT = 'Inter', MONO = '"JetBrains Mono"';

const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const inv = (a, b, x) => clamp((x - a) / (b - a));
const io = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const out3 = (t) => 1 - Math.pow(1 - t, 3);
const spring = (t, f = 1.4, z = 0.55) => (t <= 0 ? 0 : 1 - Math.exp(-z * 10 * t) * Math.cos(f * TAU * t * Math.sqrt(1 - z * z)));

let V = null;
const L = (s, i) => V.sections[s].lines[i].t;

// ---------- drawing helpers ----------
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function text(s, x, y, size, o = {}) {
  ctx.font = `${o.weight || 600} ${size}px ${o.font || FONT}`;
  ctx.letterSpacing = `${(o.track ?? -0.02) * size}px`;
  ctx.textAlign = o.align || 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = o.color || COL.white;
  ctx.fillText(s, x, y);
}
// fades and de-blurs in from t0, out at t1
function reveal(t, t0, t1, fn, rise = 22) {
  if (t < t0 || t > t1 + 0.5) return;
  const a = out3(clamp((t - t0) / 0.6)) * (1 - io(clamp((t - t1) / 0.45)));
  const blur = (1 - out3(clamp((t - t0) / 0.55))) * 12;
  ctx.save(); ctx.globalAlpha *= a; if (blur > 0.3) ctx.filter = `blur(${blur.toFixed(1)}px)`;
  ctx.translate(0, (1 - out3(clamp((t - t0) / 0.7))) * rise);
  fn(); ctx.restore();
}
function headline(t, items, x = 140, y = 250, size = 84) {
  for (const [t0, t1, line1, line2] of items)
    reveal(t, t0, t1, () => {
      text(line1, x, y, size, { weight: 700, track: -0.03 });
      if (line2) text(line2, x, y + size * 1.12, size, { weight: 700, track: -0.03, color: COL.lime });
    });
}
function chip(s, x, y, o = {}) {
  const size = o.size || 26;
  ctx.font = `600 ${size}px ${FONT}`; ctx.letterSpacing = '0px';
  const w = ctx.measureText(s).width + 56, h = size * 2.1, x0 = x - (o.center ? w / 2 : 0);
  rr(x0, y - h / 2, w, h, h / 2);
  ctx.fillStyle = COL.card; ctx.fill(); ctx.strokeStyle = o.stroke || COL.stroke; ctx.lineWidth = 2; ctx.stroke();
  text(s, x0 + 28, y + 1, size, { color: o.color || COL.white, track: 0 });
}
function icon(x, y, s, a = 1) {
  if (s <= 0) return;
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(x, y);
  rr(-s / 2, -s / 2, s, s, s * 0.23); ctx.fillStyle = COL.lime; ctx.fill();
  rr(-s * 0.23, -s * 0.24, s * 0.46, s * 0.56, s * 0.07); ctx.fillStyle = COL.bg; ctx.fill();
  rr(-s * 0.1, -s * 0.31, s * 0.2, s * 0.12, s * 0.04); ctx.fillStyle = COL.bg; ctx.fill(); ctx.strokeStyle = COL.lime; ctx.lineWidth = s * 0.025; ctx.stroke();
  ctx.fillStyle = COL.lime;
  [0.26, 0.2, 0.23].forEach((w, i) => { rr(-s * 0.13, -s * 0.07 + i * s * 0.11, s * w, s * 0.045, s * 0.02); ctx.fill(); });
  ctx.restore();
}
function keycap(x, y, label, down, size = 130) {
  const d = down * 8, on = down > 0.5;
  rr(x - size / 2, y - size / 2 + 10, size, size, 24); ctx.fillStyle = '#050506'; ctx.fill();
  rr(x - size / 2, y - size / 2 + d, size, size, 24);
  ctx.fillStyle = on ? COL.lime : '#1C1C1F'; ctx.fill(); ctx.strokeStyle = on ? COL.lime : '#34343A'; ctx.lineWidth = 2; ctx.stroke();
  text(label, x, y + d + 4, size * 0.42, { align: 'center', color: on ? COL.bg : COL.white, font: 'system-ui', track: 0 });
}

// a flat history card
const CW = 340, CHH = 200;
const CARDS = {
  link: { kind: 'LINK', text: 'figma.com/launch-plan', time: 'now' },
  code: { kind: 'CODE', text: 'git push origin main', time: '5m', mono: true },
  npm: { kind: 'CODE', text: 'npm run build', time: '3h', mono: true },
  github: { kind: 'LINK', text: 'github.com', time: '31m' },
  meet: { kind: 'LINK', text: 'meet.google.com', time: '4h' },
  dinner: { kind: 'TEXT', text: 'Dinner at 7pm', time: '5h' },
  red: { kind: 'COLOR', text: '#FF4566', time: '1h', color: '#FF4566' },
  cyan: { kind: 'COLOR', text: '#33D9E6', time: '6h', color: '#33D9E6' },
  launch: { kind: 'TEXT', text: 'Launch on Friday', time: '9m' },
  notes: { kind: 'TEXT', text: 'Ship the release notes', time: '2h' },
  hex: { kind: 'COLOR', text: '#C6FF3D', time: '1m', color: '#C6FF3D' },
  image: { kind: 'IMAGE', text: 'Screenshot', time: '14m', image: true },
  password: { kind: 'TEXT', text: '••••••••••••', time: 'now' },
  token: { kind: 'CODE', text: 'sk-ant-api03-9fQ2…', time: 'now', mono: true },
  card: { kind: 'TEXT', text: '4242 4242 4242 4242', time: 'now', mono: true },
};
function card(c, x, y, s = 1, o = {}) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(o.rot || 0); ctx.scale(s, s); ctx.globalAlpha *= o.alpha ?? 1;
  const w = CW, h = CHH;
  if (o.shadow !== false) { ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 16; }
  rr(-w / 2, -h / 2, w, h, 26);
  if (c.color) ctx.fillStyle = c.color;
  else if (c.image) { const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2); g.addColorStop(0, '#2B2440'); g.addColorStop(1, '#C6FF3D'); ctx.fillStyle = g; }
  else ctx.fillStyle = COL.card;
  ctx.fill(); ctx.shadowColor = 'transparent';
  ctx.strokeStyle = o.stroke || COL.stroke; ctx.lineWidth = o.stroke ? 4 : 2; ctx.stroke();
  const ink = c.color ? COL.bg : COL.white, sub = c.color ? 'rgba(11,11,12,0.6)' : COL.grey;
  if (c.image) {
    ctx.save(); rr(-w / 2, -h / 2, w, h, 26); ctx.clip();
    ctx.fillStyle = 'rgba(11,11,12,0.55)'; ctx.beginPath(); ctx.moveTo(-w / 2, h / 2 - 40); ctx.lineTo(-60, -10); ctx.lineTo(10, 40); ctx.lineTo(80, -30); ctx.lineTo(w / 2, h / 2 - 50); ctx.lineTo(w / 2, h / 2); ctx.lineTo(-w / 2, h / 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = COL.white; ctx.beginPath(); ctx.arc(90, -45, 18, 0, TAU); ctx.fill();
  }
  text(c.kind, -w / 2 + 26, -h / 2 + 34, 18, { font: MONO, color: c.color ? sub : COL.lime, track: 0.08 });
  if (!c.image) {
    const size = c.mono ? 26 : 30;
    ctx.font = `600 ${size}px ${c.mono ? MONO : FONT}`;
    let s = c.text;
    while (ctx.measureText(s).width > w - 52) s = s.slice(0, -2) + '…';
    text(s, -w / 2 + 26, 4, size, { font: c.mono ? MONO : FONT, color: ink, track: c.mono ? 0 : -0.01 });
  }
  text(c.time, w / 2 - 24, h / 2 - 30, 20, { align: 'right', color: c.image ? COL.bg : sub, weight: 500, track: 0 });
  if (o.pin) { ctx.fillStyle = COL.orange; ctx.beginPath(); ctx.arc(w / 2 - 34, -h / 2 + 34, 12, 0, TAU); ctx.fill(); }
  if (o.mark) o.mark();
  ctx.restore();
}
// the app popup, redrawn flat in the film's palette: header, search, category chips, a row of history cards
const HIST = ['link', 'hex', 'code', 'launch', 'image', 'github', 'red', 'notes', 'npm', 'meet', 'dinner', 'cyan'].map((n) => CARDS[n]);
const CHIPS = [['All'], ['Links', 'LINK'], ['Colors', 'COLOR'], ['Images', 'IMAGE'], ['Code', 'CODE'], ['Text', 'TEXT']];
const STATES = {
  base: {}, sel0: { sel: 0 }, sel1: { sel: 1 }, sel2: { sel: 2 }, sel3: { sel: 3 },
  fig: { query: 'fig' }, figpin: { query: 'fig', pin: true },
  links: { filter: 'Links' }, colors: { filter: 'Colors' }, code: { filter: 'Code' }, text: { filter: 'Text' },
};
function popup(name, x, y, w, a = 1) {
  const st = STATES[name], k = w / 1500, h = 400 * k, x0 = x - w / 2, y0 = y - h / 2;
  const kind = st.filter && CHIPS.find((c) => c[0] === st.filter)[1];
  const items = HIST.filter((c) => (!kind || c.kind === kind) && (!st.query || c.text.includes(st.query)));
  const slot = (i) => ({ x: x0 + (40 + i * 232.8 + 105.4) * k, y: y0 + 284 * k });
  ctx.save(); ctx.globalAlpha *= a;
  ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 70; ctx.shadowOffsetY = 26;
  rr(x0, y0, w, h, 36 * k); ctx.fillStyle = '#121214'; ctx.fill(); ctx.shadowColor = 'transparent';
  ctx.strokeStyle = COL.stroke; ctx.lineWidth = 2; ctx.stroke();
  icon(x0 + 58 * k, y0 + 63 * k, 36 * k);
  text('Clipboard', x0 + 92 * k, y0 + 63 * k, 32 * k, { weight: 700 });
  ctx.font = `700 ${32 * k}px ${FONT}`;
  text(String(items.length), x0 + 92 * k + ctx.measureText('Clipboard').width + 16 * k, y0 + 64 * k, 24 * k, { color: COL.grey, track: 0 });
  // search field
  const sx = x0 + 1010 * k, sy = y0 + 38 * k;
  rr(sx, sy, 370 * k, 52 * k, 26 * k); ctx.fillStyle = '#1C1C1F'; ctx.fill(); ctx.strokeStyle = st.query ? COL.lime : '#34343A'; ctx.stroke();
  ctx.strokeStyle = COL.grey; ctx.lineWidth = 3 * k; ctx.beginPath(); ctx.arc(sx + 30 * k, sy + 24 * k, 9 * k, 0, TAU); ctx.moveTo(sx + 37 * k, sy + 31 * k); ctx.lineTo(sx + 44 * k, sy + 38 * k); ctx.stroke();
  text(st.query || 'Search', sx + 58 * k, sy + 27 * k, 24 * k, { color: st.query ? COL.white : COL.grey, weight: 500, track: 0 });
  if (st.query) { ctx.font = `500 ${24 * k}px ${FONT}`; ctx.fillStyle = COL.lime; ctx.fillRect(sx + 60 * k + ctx.measureText(st.query).width, sy + 13 * k, 2.5 * k, 27 * k); }
  ctx.strokeStyle = COL.grey; ctx.lineWidth = 2 * k; ctx.beginPath(); ctx.arc(x0 + 1428 * k, y0 + 64 * k, 20 * k, 0, TAU); ctx.stroke();
  ctx.fillStyle = COL.grey; [-8, 0, 8].forEach((d) => { ctx.beginPath(); ctx.arc(x0 + (1428 + d) * k, y0 + 64 * k, 2.5 * k, 0, TAU); ctx.fill(); });
  // category chips
  let cx = x0 + 40 * k;
  for (const [label] of CHIPS) {
    const on = label === (st.filter || 'All');
    ctx.font = `600 ${22 * k}px ${FONT}`; ctx.letterSpacing = '0px';
    const cw = ctx.measureText(label).width + 44 * k;
    rr(cx, y0 + 112 * k, cw, 44 * k, 22 * k); ctx.fillStyle = on ? COL.lime : '#1C1C1F'; ctx.fill();
    text(label, cx + 22 * k, y0 + 135 * k, 22 * k, { color: on ? COL.bg : COL.white, track: 0 });
    cx += cw + 12 * k;
  }
  // history cards
  ctx.save(); rr(x0 + 20 * k, y0 + 180 * k, w - 40 * k, 210 * k, 20 * k); ctx.clip();
  items.slice(0, 6).forEach((c, i) => {
    const p = slot(i), on = st.sel === i;
    card(c, p.x, p.y, 0.62 * k * (on ? 1.04 : 1), { shadow: false, stroke: on ? COL.lime : null, pin: st.pin && i === 0 });
  });
  ctx.restore();
  ctx.restore();
  return { slot, k };
}

// ---------- sections ----------
const SEC = [];

// 0 opening: the icon, then the name
SEC[0] = (t) => {
  const a = spring(t - 0.7, 1.1, 0.55), slide = io(inv(L(0, 1), L(0, 1) + 0.9, t));
  icon(lerp(W / 2, 640, slide), 520, 260 * a, clamp(a * 2));
  reveal(t, L(0, 1) + 0.3, 999, () => {
    text('ClipHistory', 820, 490, 120, { weight: 800, track: -0.035 });
    text('Clipboard history for Mac', 826, 585, 40, { weight: 500, color: COL.grey, track: 0 });
  });
};

// 1 the problem: one clipboard slot, each new copy pushes the last one out
SEC[1] = (t) => {
  headline(t, [
    [L(1, 0), L(1, 4) - 0.3, 'You copy', 'all day.'],
    [L(1, 4), L(1, 7) - 0.3, 'The clipboard holds', 'one thing.'],
    [L(1, 7), 999, 'Lost time.', 'Lost focus.'],
  ]);
  const SX = 1300, SY = 560;
  const slotA = clamp((t - L(1, 0)) / 0.5) * (1 - clamp((t - L(1, 7) + 0.3) / 0.4));
  if (slotA > 0) {
    ctx.save(); ctx.globalAlpha = slotA;
    ctx.setLineDash([14, 12]); rr(SX - 210, SY - 135, 420, 270, 36); ctx.strokeStyle = COL.dim; ctx.lineWidth = 3; ctx.stroke(); ctx.setLineDash([]);
    text('CLIPBOARD', SX, SY - 175, 22, { font: MONO, color: COL.grey, align: 'center', track: 0.12 });
    const seq = [[L(1, 1), CARDS.link], [L(1, 2), CARDS.code], [L(1, 3), CARDS.hex], [L(1, 3) + 0.75, CARDS.image], [L(1, 5) + 0.5, CARDS.launch]];
    seq.forEach(([t0, c], i) => {
      const next = seq[i + 1] ? seq[i + 1][0] : 999, a = t - t0;
      if (a < 0 || t - next > 0.9) return;
      // the replaced card drops away; the one lost on "the last thing is gone" flashes red first
      const inP = spring(a, 1.3, 0.6), g = t > next ? out3(clamp((t - next) / 0.9)) : 0;
      const lost = i === seq.length - 2 && t > next - 0.05 && t < next + 0.35;
      card(c, lerp(SX + 600, SX, inP) - g * 120, SY + g * 260, 1 - g * 0.2, { rot: g * -0.25, alpha: 1 - g, stroke: lost ? COL.red : null });
    });
    ctx.restore();
  }
  // searching through tabs and chats again
  reveal(t, L(1, 7) + 0.3, 999, () => {
    ['Slack', 'Mail', 'Docs', 'Figma', 'Notes', 'Chrome'].forEach((s, i) => chip(s, 1020 + (i % 3) * 230, 470 + Math.floor(i / 3) * 110, { color: COL.grey }));
    const u = (t - L(1, 7)) * 0.7, mx = 1220 + Math.sin(u * 2.3) * 260, my = 525 + Math.sin(u * 3.1) * 70;
    ctx.strokeStyle = COL.lime; ctx.lineWidth = 8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(mx, my, 34, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.moveTo(mx + 24, my + 24); ctx.lineTo(mx + 56, my + 56); ctx.stroke();
  });
};

// 2 the solution: the cards stay, newest first; fifty kept; a pinned card moves to the top
SEC[2] = (t) => {
  headline(t, [[L(2, 0), 999, 'Everything you copy,', 'remembered.']]);
  const list = [CARDS.launch, CARDS.hex, CARDS.notes, CARDS.code, CARDS.link];
  const pinT = L(2, 3) + 0.4, pinned = io(clamp((t - pinT) / 0.8));
  list.forEach((c, i) => {
    const a = spring(t - L(2, 1) - i * 0.12, 1.2, 0.6);
    if (a <= 0) return;
    const slot = i === 2 ? lerp(2, 0, pinned) : i < 2 ? i + pinned : i;
    card(c, 1380 + (1 - a) * 400, 300 + slot * 140, 0.62, { alpha: clamp(a * 1.5) * (i > 3 ? 0.55 : 1), pin: i === 2 && t > pinT + 0.3, stroke: i === 2 && t > pinT ? COL.orange : null, shadow: false });
  });
  reveal(t, L(2, 2), 999, () => {
    text('50', 140, 610, 200, { weight: 800, color: COL.lime, track: -0.04 });
    text('items kept, newest first', 150, 730, 36, { weight: 500, color: COL.grey, track: 0 });
  });
  reveal(t, pinT + 0.3, 999, () => chip('Pinned items stay', 150, 840, { size: 28, color: COL.orange, stroke: COL.orange }));
};

// 3 how it works: ⇧⌘V, the real popup drops, arrows, Return
SEC[3] = (t) => {
  const press = L(3, 1) + 0.35, keysOut = io(inv(L(3, 2) + 0.2, L(3, 2) + 0.8, t));
  if (keysOut < 1) {
    ctx.save(); ctx.globalAlpha *= (1 - keysOut) * clamp((t - L(3, 0)) / 0.5);
    ['⇧', '⌘', 'V'].forEach((k, i) => keycap(W / 2 + (i - 1) * 170, 560 + keysOut * 80, k, clamp((t - press - i * 0.32) / 0.08) * (1 - clamp((t - L(3, 2)) / 0.1))));
    ctx.restore();
  }
  reveal(t, L(3, 0), L(3, 2) - 0.1, () => text('Press ⇧⌘V', W / 2, 330, 64, { align: 'center', weight: 700, font: `${FONT}, system-ui` }));
  if (t > L(3, 2)) {
    const drop = spring(t - L(3, 2) - 0.1, 0.9, 0.6), up = io(inv(L(3, 4), L(3, 4) + 0.7, t));
    const steps = [0.25, 0.6, 0.95, 1.3].map((d) => L(3, 3) + d), sel = steps.reduce((s, c, i) => (t >= c ? i + 1 : s), 0);
    const r = popup(['base', 'sel0', 'sel1', 'sel2', 'sel3'][sel], W / 2, lerp(-260, 400, drop) - up * 200, 1400, 1 - up);
    const retT = L(3, 3) + 1.9;
    if (t > steps[0] - 0.2 && t < L(3, 4)) {
      const lab = t >= retT ? '↩' : '→', last = t >= retT ? retT : steps[Math.max(0, sel - 1)];
      keycap(W / 2, 830, lab, t - last < 0.12 ? 1 : 0, 110);
    }
    // the picked item lands on the clipboard
    if (t > retT) {
      const u = io(clamp((t - retT) / 0.9)), { x: sx, y: sy } = r.slot(3);
      card(CARDS.launch, lerp(sx, W / 2, u), lerp(sy, 760, u), lerp(0.62 * r.k, 0.9, u), { stroke: COL.lime });
      reveal(t, retT + 0.8, 999, () => chip('✓  On your clipboard', W / 2, 910, { center: true, color: COL.lime, stroke: COL.lime }));
    }
  }
  reveal(t, L(3, 4) + 0.2, 999, () => text('You never leave your app.', W / 2, 180, 64, { align: 'center', weight: 700 }));
};

// 4 features: search, categories, pins, then the widget and Services menu
SEC[4] = (t) => {
  reveal(t, L(4, 0), L(4, 1) - 0.3, () => {
    text('Built for speed,', W / 2, 470, 96, { align: 'center', weight: 700, track: -0.03 });
    text('day to day.', W / 2, 580, 96, { align: 'center', weight: 700, track: -0.03, color: COL.lime });
  });
  const parts = [
    [L(4, 1), L(4, 3), '01', 'Search', 'Type to filter instantly.'],
    [L(4, 3), L(4, 5), '02', 'Categories', 'Links, colors, images, code, text.'],
    [L(4, 5), L(4, 7), '03', 'Pins', 'Keep what you reuse at the top.'],
    [L(4, 7), 999, '04', 'Built into macOS', 'Desktop widget and Services menu.'],
  ];
  for (const [t0, t1, n, h, sub] of parts) reveal(t, t0, t1 - 0.3, () => {
    text(n, 140, 170, 26, { font: MONO, color: COL.lime, track: 0.1 });
    text(h, 140, 240, 76, { weight: 700, track: -0.03 });
    text(sub, 142, 315, 34, { weight: 500, color: COL.grey, track: 0 });
  });
  if (t >= L(4, 1) && t < L(4, 7) + 0.4) {
    let name;
    if (t < L(4, 3)) name = t > L(4, 2) + 1.0 ? 'fig' : 'base';
    else if (t < L(4, 5)) {
      const cats = ['links', 'colors', 'code', 'text'], span = L(4, 5) - L(4, 4) - 0.6;
      name = t < L(4, 4) ? 'base' : cats[Math.min(3, Math.floor(((t - L(4, 4)) / span) * 4))];
    } else name = t > L(4, 6) + 0.8 ? 'figpin' : 'fig';
    const a = clamp((t - L(4, 1)) / 0.5) * (1 - clamp((t - L(4, 7) - 0.1) / 0.3));
    const r = popup(name, W / 2, 660, 1500, a);
    const pa = t - (L(4, 6) + 0.8);
    if (name === 'figpin' && pa < 0.8) {
      ctx.strokeStyle = `rgba(255,159,10,${1 - pa / 0.8})`; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(r.slot(0).x + 136 * 0.62 * r.k, r.slot(0).y - 66 * 0.62 * r.k, 14 + 80 * out3(pa / 0.8), 0, TAU); ctx.stroke();
    }
  }
  reveal(t, L(4, 7) + 0.3, 999, () => {
    const wx = 560, wy = 660;
    rr(wx - 260, wy - 230, 520, 460, 48); ctx.fillStyle = '#141416'; ctx.fill(); ctx.strokeStyle = COL.stroke; ctx.lineWidth = 2; ctx.stroke();
    icon(wx - 200, wy - 172, 52);
    text('ClipHistory', wx - 160, wy - 172, 28, { weight: 700 });
    [['TEXT', 'Launch on Friday'], ['COLOR', '#C6FF3D'], ['LINK', 'github.com'], ['CODE', 'npm run build']].forEach(([k, s], i) => {
      const y = wy - 90 + i * 82;
      rr(wx - 220, y - 32, 440, 64, 18); ctx.fillStyle = COL.card; ctx.fill();
      text(k, wx - 196, y, 16, { font: MONO, color: COL.lime, track: 0.08 });
      text(s, wx - 100, y, 24, { font: k === 'CODE' ? MONO : FONT, track: 0 });
    });
    text('Desktop widget', wx, wy + 280, 26, { align: 'center', color: COL.grey, weight: 500, track: 0 });
  });
  reveal(t, L(4, 8) + 1.6, 999, () => {
    const mx = 1060, my = 470;
    rr(mx, my, 340, 300, 20); ctx.fillStyle = '#1C1C1F'; ctx.fill(); ctx.strokeStyle = '#34343A'; ctx.lineWidth = 2; ctx.stroke();
    ['Cut', 'Copy', 'Paste', null, 'Services'].forEach((s, i) => {
      const y = my + 38 + i * 56;
      if (!s) { ctx.fillStyle = '#34343A'; ctx.fillRect(mx + 20, y - 4, 300, 2); return; }
      if (s === 'Services') { rr(mx + 10, y - 24, 320, 48, 10); ctx.fillStyle = '#2C2C31'; ctx.fill(); text('›', mx + 300, y, 28, { color: COL.grey }); }
      text(s, mx + 30, y, 26, { weight: 500, track: 0 });
    });
    const sx = mx + 330, sy = my + 38 + 4 * 56 - 32;
    rr(sx, sy, 400, 64, 16); ctx.fillStyle = COL.lime; ctx.fill();
    text('Paste from ClipHistory', sx + 26, sy + 32, 26, { color: COL.bg, track: 0 });
    text('Right-click › Services', mx + 170, my + 380, 26, { align: 'center', color: COL.grey, weight: 500, track: 0 });
  });
};

// 5 privacy: a lime lock; encrypted, secrets refused, retention, no network
function lock(x, y, s, shut) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  const lift = (1 - shut) * 60;
  ctx.strokeStyle = COL.lime; ctx.lineWidth = 26; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-80, -40 - lift); ctx.lineTo(-80, -70 - lift); ctx.arc(0, -70 - lift, 80, Math.PI, 0); ctx.lineTo(80, -40 - lift * 0.3 - (1 - shut) * 30); ctx.stroke();
  rr(-150, -60, 300, 240, 40); ctx.fillStyle = COL.lime; ctx.fill();
  ctx.fillStyle = COL.bg; ctx.beginPath(); ctx.arc(0, 40, 30, 0, TAU); ctx.fill(); rr(-12, 50, 24, 70, 10); ctx.fill();
  ctx.restore();
}
const cross = () => { ctx.strokeStyle = COL.red; ctx.lineWidth = 12; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-36, -36); ctx.lineTo(36, 36); ctx.moveTo(36, -36); ctx.lineTo(-36, 36); ctx.stroke(); };
SEC[5] = (t) => {
  headline(t, [[L(5, 0), 999, 'Private', 'by design.']], 140, 250, 96);
  const LX = 1380, LY = 560, shutT = L(5, 1) + 1.6;
  [CARDS.launch, CARDS.link, CARDS.hex].forEach((c, i) => {
    const t0 = L(5, 1) + 0.2 + i * 0.25, u = io(clamp((t - t0) / 1.0));
    if (t < t0 || u >= 1) return;
    card(c, lerp(LX - 420 + i * 420, LX, u), lerp(250, LY + 40, u), lerp(0.55, 0.1, u), { alpha: 1 - u * 0.6, shadow: false });
  });
  const lockA = clamp((t - L(5, 0) - 0.8) / 0.5);
  if (lockA > 0) { ctx.save(); ctx.globalAlpha *= lockA; lock(LX, LY, 1, io(inv(shutT, shutT + 0.3, t))); ctx.restore(); }
  const rp = (t - shutT - 0.3) / 0.8;
  if (rp > 0 && rp < 1) { ctx.strokeStyle = `rgba(198,255,61,${1 - rp})`; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(LX, LY + 40, 180 + rp * 200, 0, TAU); ctx.stroke(); }
  // a password, a token and a card number bounce off with a red cross
  [[L(5, 2) + 0.2, CARDS.password], [L(5, 3) + 0.3, CARDS.token], [L(5, 3) + 1.5, CARDS.card]].forEach(([t0, c]) => {
    const a = t - t0, hit = 0.55;
    if (a < 0 || a > 1.6) return;
    const x = a < hit ? lerp(LX + 640, LX + 230, out3(a / hit)) : LX + 230 + (a - hit) * 520, y = LY - 40 + (a > hit ? (a - hit) ** 2 * 900 : 0);
    const refused = a > hit - 0.05;
    card(c, x, y, 0.62, { rot: a > hit ? (a - hit) * 1.4 : 0, alpha: 1 - clamp((a - 1.1) / 0.5), stroke: refused ? COL.red : null, mark: refused ? cross : null });
  });
  const facts = [
    [L(5, 1), L(5, 2), 'Encrypted on disk', 'AES-256, key in your Keychain'],
    [L(5, 2), L(5, 3), 'Password managers skipped', 'Concealed copies are never saved'],
    [L(5, 3), L(5, 4), 'Secrets never saved', 'API keys, tokens, card numbers'],
    [L(5, 5), 999, 'Stays on your Mac', 'No network code at all'],
  ];
  for (const [t0, t1, a, b] of facts) reveal(t, t0 + 0.2, t1 - 0.3, () => {
    text(a, 140, 560, 48, { weight: 700, color: COL.lime, track: -0.02 });
    text(b, 142, 625, 32, { weight: 500, color: COL.grey, track: 0 });
  });
  reveal(t, L(5, 4), L(5, 5) - 0.3, () => {
    text('You choose how long', 140, 560, 48, { weight: 700, color: COL.lime, track: -0.02 });
    const times = [0, 2.3, 2.8, 3.5].map((d) => L(5, 4) + d), k = times.reduce((s, c, i) => (t >= c ? i : s), 0), x0 = 142, ww = 170;
    rr(x0, 610, ww * 4 + 12, 76, 38); ctx.fillStyle = COL.card; ctx.fill();
    rr(x0 + 6 + k * ww, 616, ww, 64, 32); ctx.fillStyle = COL.lime; ctx.fill();
    ['1 day', '7 days', '30 days', 'Forever'].forEach((s, i) => text(s, x0 + 6 + i * ww + ww / 2, 649, 26, { align: 'center', color: i === k ? COL.bg : COL.white, track: 0 }));
  });
};

// 6 who it's for: three columns
SEC[6] = (t) => {
  reveal(t, L(6, 0), L(6, 2) - 0.3, () => {
    text('Who is it for?', W / 2, 460, 96, { align: 'center', weight: 700, track: -0.03 });
    if (t > L(6, 1)) text('Anyone who copies and pastes all day.', W / 2, 580, 44, { align: 'center', weight: 500, color: COL.lime, track: -0.01 });
  });
  [[L(6, 2), 'Writers & marketers', [CARDS.link, CARDS.notes]], [L(6, 3), 'Designers', [CARDS.hex, CARDS.image]], [L(6, 4), 'Developers', [CARDS.code, CARDS.npm]]]
    .forEach(([t0, h, cs], i) => reveal(t, t0, 999, () => {
      const x = 380 + i * 580;
      text(h, x, 240, 44, { align: 'center', weight: 700, track: -0.02 });
      ctx.fillStyle = COL.lime; ctx.fillRect(x - 40, 290, 80, 6);
      cs.forEach((c, j) => card(c, x, 460 + j * 240, 0.95, { shadow: false }));
    }, 40));
};

// 7 value
SEC[7] = (t) => {
  reveal(t, L(7, 0), 999, () => text('THE VALUE', W / 2, 300, 26, { align: 'center', font: MONO, color: COL.grey, track: 0.14 }));
  [['Less searching.', COL.white, 0], ['Fewer interruptions.', COL.white, 0.9], ['Nothing lost.', COL.lime, 2.0]].forEach(([s, c, d], i) =>
    reveal(t, L(7, 1) + d, 999, () => text(s, W / 2, 440 + i * 130, 96, { align: 'center', weight: 700, color: c, track: -0.03 })));
};

// 8 availability and close
SEC[8] = (t) => {
  const a = spring(t - L(8, 0) + 0.2, 1.1, 0.55);
  icon(W / 2, 250, 180 * a, clamp(a * 2));
  reveal(t, L(8, 0) + 0.2, 999, () => text('ClipHistory', W / 2, 420, 110, { align: 'center', weight: 800, track: -0.035 }));
  [[L(8, 0) + 1.0, 'Free & open source · MIT'], [L(8, 1) + 0.6, 'macOS 14+ · Apple silicon & Intel'], [L(8, 2) + 0.6, 'Notarized by Apple · Liquid Glass on macOS 26']]
    .forEach(([t0, s], i) => reveal(t, t0, 999, () => chip(s, W / 2, 540 + i * 76, { center: true, color: i === 0 ? COL.lime : COL.white, stroke: i === 0 ? COL.lime : null })));
  reveal(t, L(8, 3) + 0.4, 999, () => {
    rr(W / 2 - 230, 770, 460, 90, 45); ctx.fillStyle = COL.lime; ctx.fill();
    text('Download for Mac', W / 2, 816, 34, { align: 'center', weight: 700, color: COL.bg, track: -0.01 });
    text('github.com/Bgo6d-ba/ClipHistory', W / 2, 905, 28, { align: 'center', font: MONO, color: COL.grey, track: 0.02 });
  });
};

// ---------- frame ----------
function background(t) {
  ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#18181B';
  const off = (t * 6) % 44;
  for (let y = -44 + off; y < H; y += 44) for (let x = 22; x < W; x += 44) ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
  const g = ctx.createRadialGradient(W * 0.7, H * 0.45, 0, W * 0.7, H * 0.45, 900);
  g.addColorStop(0, 'rgba(198,255,61,0.06)'); g.addColorStop(1, 'rgba(198,255,61,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
function hud(si) {
  if (si === 0 || si === 8) return;
  icon(70, 62, 34); text('ClipHistory', 100, 62, 24, { weight: 700 });
  text(`${String(si).padStart(2, '0')} — ${V.sections[si].title.toUpperCase()}`, W - 70, 62, 20, { align: 'right', font: MONO, color: COL.grey, track: 0.1 });
}
function subtitles(t) {
  for (const s of V.sections) for (const l of s.lines) {
    const end = l.t + l.d + 0.25;
    if (t < l.t || t > end) continue;
    ctx.save(); ctx.globalAlpha = clamp((t - l.t) / 0.15) * clamp((end - t) / 0.15) * 0.92;
    ctx.font = `500 30px ${FONT}`; ctx.letterSpacing = '0px';
    const w = Math.min(ctx.measureText(l.text).width, 1500) + 48;
    rr(W / 2 - w / 2, 974, w, 52, 14); ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fill();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = COL.white; ctx.fillText(l.text, W / 2, 1001, 1500);
    ctx.restore();
  }
}
function renderFrame(t) {
  background(t);
  const S = V.sections, si = Math.max(0, S.findLastIndex((s) => t >= s.t - 0.25));
  const next = S[si + 1] ? S[si + 1].t - 0.25 : V.duration + 1;
  ctx.save();
  ctx.globalAlpha = si === 0 ? clamp((next - t) / 0.4) : clamp((t - (S[si].t - 0.25)) / 0.45) * clamp((next - t) / 0.4);
  SEC[si](t);
  ctx.restore();
  ctx.globalAlpha = 1; ctx.filter = 'none';
  hud(si);
  subtitles(t);
  ctx.fillStyle = '#1E1E22'; ctx.fillRect(0, H - 6, W, 6); ctx.fillStyle = COL.lime; ctx.fillRect(0, H - 6, (W * t) / V.duration, 6);
  const k = Math.max(1 - clamp(t / 0.8), clamp((t - (V.duration - 1.6)) / 1.4));
  if (k > 0) { ctx.globalAlpha = k; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
}

window.ready = (async () => {
  V = await (await fetch('voice.json')).json();
  await document.fonts.load('800 80px Inter'); await document.fonts.load('500 30px Inter'); await document.fonts.load('600 30px "JetBrains Mono"');
  await document.fonts.ready;
})();
window.renderFrame = renderFrame;
window.snap = () => out.toDataURL('image/png');

if (location.search.includes('play')) {
  window.ready.then(() => {
    const audio = new Audio('film.wav');
    let t0 = null;
    document.body.onclick = () => { audio.play(); t0 = performance.now(); };
    const tick = () => { renderFrame(t0 === null ? 0 : ((performance.now() - t0) / 1000) % V.duration); requestAnimationFrame(tick); };
    tick();
  });
}
