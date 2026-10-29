'use strict';
// reveal — bars 4–5 (7.50–11.25 s). Downbeat impact: white flash, the night gives way to a paper blueprint, and the dot
// left by bar 3 bursts into ~4,000 particles sampled from the real app icon's pixels. They swirl out and home in onto a
// 3D glass icon that turns to face the camera; it settles flat into the real icon, slides left into the lockup, and
// "ClipHistory" rises beside it on 5.1. The HUD boots over 5.2–5.4.
(() => {
  const S0 = bar(4), R = CUES.reveal, loc = (t) => t - S0;
  const SETTLE = loc(R.settle), CRISP = R.crisp.map(loc), SHIFT = R.shift.map(loc), WORD = loc(R.word), EYE = loc(R.eyebrow);
  const ICON = 380, IC = [CX, CY - 40], DOT = [CX, CY - 30];
  let P = null, LOCK = null;

  function init() {
    const c = mkCanvas(W, H), x = c.getContext('2d'), s = ICON / 0.8;
    x.drawImage(IMG.icon, IC[0] - s / 2, IC[1] - s / 2, s, s);
    P = sampleCanvas(c, 6, 60).map(([tx, ty, r, g, b], i) => {
      const a = hash(i, 1) * TAU, rad = 260 + hash(i, 2) * 620;
      return { tx, ty, col: `rgb(${r},${g},${b})`, ox: Math.cos(a) * rad, oy: Math.sin(a) * rad * 0.7, d: hash(i, 3) * 0.12, sz: 4 + hash(i, 4) * 3 };
    });
    const WL = wordmarkLayout(150);
    LOCK = { WL, x0: CX - WL.width / 2, cy: CY - 20 };
  }

  function particles(lt, fade) {
    if (fade <= 0) return;
    ctx.save(); ctx.globalAlpha = fade;
    for (let i = 0; i < P.length; i++) {
      const p = P[i], a = lt - p.d;
      if (a < 0) continue;
      const out = E.outExpo(clamp(a / 0.34)), home = E.ioC(inv(0.2, SETTLE - 0.05, a));
      const sw = noise3(p.tx * 0.004, p.ty * 0.004, a * 1.4) * 180 * (1 - home);
      const x = lerp(DOT[0] + p.ox * out + sw, p.tx, home), y = lerp(DOT[1] + p.oy * out + sw * 0.6, p.ty, home);
      const s = p.sz * (1 + (1 - home) * 0.6);
      ctx.fillStyle = p.col; ctx.fillRect(x - s / 2, y - s / 2, s, s);
    }
    ctx.restore();
  }

  SCENES.reveal = {
    init,
    draw(lt) {
      if (!P) init();
      bg(COL.paper2);
      FX.hud.dark = false; FX.bloom = 0; FX.vig = 0.1;
      FX.flash = Math.max(0, 1 - lt / 0.28) ** 1.6;
      blueprint('rgba(14,16,32,0.055)', 40, E.outC(clamp(lt / 0.6)));
      glow(IC[0], IC[1], 560, COL.indigo, 0.17 * E.outC(clamp(lt / 0.5)));

      // particles hand over to the 3D glass icon, which turns to face the camera and then hands over to the flat icon
      const glassIn = E.outC(inv(SETTLE - 0.35, SETTLE, lt)), flat = E.ioC(inv(CRISP[0] + 0.1, CRISP[1] + 0.15, lt));
      particles(lt, 1 - glassIn);
      const L = LOCK, WL = L.WL, sh = E.ioQuart(inv(SHIFT[0], SHIFT[1], lt));
      const ix = lerp(IC[0], L.x0 + WL.ic / 2, sh), iy = lerp(IC[1], L.cy, sh), isz = lerp(ICON, WL.ic, sh);
      if (glassIn > 0 && flat < 1) {
        const turn = 1 - spring(lt - (SETTLE - 0.35), 1.6, 0.55);
        GLASS({ x: IC[0], y: IC[1], w: ICON, h: ICON, d: 70, r: ICON * 0.225, yaw: turn * 0.9, pitch: -turn * 0.35 + 0.05 * (1 - flat), roll: turn * 0.12,
          tex: TEXS.icon, tint: COL.indigo, alpha: glassIn * (1 - flat), gloss: 1.1 });
      }
      if (flat > 0) {
        ctx.save(); ctx.shadowColor = 'rgba(46,37,168,0.3)'; ctx.shadowBlur = 60 * (1 - sh * 0.5); ctx.shadowOffsetY = 24;
        drawIcon(ix, iy, isz, flat); ctx.restore();
      }
      if (lt >= WORD) slamLine('ClipHistory', L.x0 + WL.ic + WL.gap, L.cy, lt - WORD, { size: 150, weight: 800, family: FONT.ui, track: -0.035 * 150, align: 'left', color: COL.ink, stagger: 0.025 });
      if (lt >= EYE) eyebrow(scramble('Clipboard history for Mac', lt - EYE, 0.45, 3), CX, L.cy + 150, COL.muted2, { size: 22, track: 7 });
    },
  };
})();
