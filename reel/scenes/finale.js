'use strict';
// finale — bars 14–15 (26.25–30.00 s). Paper. "FREE. / OPEN SOURCE." slam and clear; the glass icon spins down into the
// lockup and settles flat as "ClipHistory" rises; tagline, the "Download for Mac" pill (shine on the final hit) and the
// GitHub URL; then it holds dead still.
(() => {
  const S0 = bar(14), F = CUES.finale, loc = (t) => t - S0;
  const FREE = loc(F.free), OPEN = loc(F.open), CLEAR = loc(F.clear), LOCKUP = loc(F.lockup), CTA = loc(F.cta), HIT = loc(F.hit);
  const SIZE = 132, LY = 400;
  let L = null;
  const build = () => { const WL = wordmarkLayout(SIZE); L = { WL, x0: CX - WL.width / 2 }; };

  SCENES.finale = {
    init: build,
    draw(lt) {
      if (!L) build();
      bg(COL.paper2);
      FX.hud.dark = false; FX.bloom = 0; FX.vig = 0.08;
      FX.hud.alpha = 1 - E.ioC(inv(LOCKUP, LOCKUP + 0.4, lt));
      blueprint('rgba(14,16,32,0.05)', 40, 1 - E.outC(inv(LOCKUP, LOCKUP + 0.5, lt)));

      // FREE. / OPEN SOURCE.
      if (lt < CLEAR + 0.4) {
        slamLine('FREE.', CX, CY - 110, lt - FREE, { size: 230, color: COL.ink, out: lt - CLEAR });
        if (lt >= OPEN) slamLine('OPEN SOURCE.', CX, CY + 120, lt - OPEN, { size: 150, color: COL.indigo, out: lt - CLEAR });
      }
      if (lt < LOCKUP - 0.05) return;

      // lockup: glass icon spins in and lands flat, wordmark rises beside it
      const WL = L.WL, ix = L.x0 + WL.ic / 2, a = lt - LOCKUP;
      const land = spring(a, 1.9, 0.6), flat = E.ioC(inv(0.42, 0.62, a));
      if (flat < 1) {
        GLASS({ x: ix, y: LY - (1 - land) * 260, w: WL.ic, h: WL.ic, d: WL.ic * 0.18, r: WL.ic * 0.225,
          yaw: (1 - land) * 4.2, pitch: (1 - land) * -0.5, roll: 0, tex: TEXS.icon, tint: COL.indigo, alpha: clamp(a / 0.08) * (1 - flat), gloss: 1.1 });
      }
      if (flat > 0) drawIcon(ix, LY, WL.ic, flat);
      slamLine('ClipHistory', L.x0 + WL.ic + WL.gap, LY, a - 0.12, { size: SIZE, weight: 800, family: FONT.ui, track: -0.035 * SIZE, align: 'left', color: COL.ink, stagger: 0.022 });

      const ca = lt - CTA;
      if (ca < 0) return;
      const tp = E.outExpo(clamp(ca / 0.42));
      ctx.save(); ctx.beginPath(); ctx.rect(0, 535, W, 60); ctx.clip();
      ctx.font = fnt(500, 34, FONT.ui); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = COL.muted2;
      ctx.fillText('Your clipboard, remembered.', CX, 565 + (1 - tp) * 50); ctx.restore();

      const pa = ca - 0.06;
      if (pa > 0) {
        const sc = pa > 0.6 ? 1 : spring(pa, 3, 0.5) * 0.3 + 0.7;
        ctx.save(); ctx.font = fnt(700, 32, FONT.ui);
        const label = 'Download for Mac', tw = ctx.measureText(label).width, pw = tw + 140, ph = 88;
        ctx.translate(CX, 685); ctx.scale(sc, sc); ctx.globalAlpha = clamp(pa / 0.08);
        ctx.shadowColor = 'rgba(46,37,168,0.35)'; ctx.shadowBlur = 34; ctx.shadowOffsetY = 12;
        rrect(-pw / 2, -ph / 2, pw, ph, ph / 2);
        const g = ctx.createLinearGradient(0, -ph / 2, 0, ph / 2); g.addColorStop(0, '#6B5CFF'); g.addColorStop(1, '#3E33C8');
        ctx.fillStyle = g; ctx.fill(); ctx.shadowColor = 'transparent';
        const sw = lt - HIT - 0.1;
        if (sw > 0 && sw < 0.35) {
          ctx.save(); rrect(-pw / 2, -ph / 2, pw, ph, ph / 2); ctx.clip();
          const x = lerp(-pw / 2 - 80, pw / 2 + 80, E.ioC(sw / 0.35)), gl = ctx.createLinearGradient(x - 70, 0, x + 70, 0);
          gl.addColorStop(0, 'rgba(255,255,255,0)'); gl.addColorStop(0.5, 'rgba(255,255,255,0.5)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = gl; ctx.fillRect(-pw / 2, -ph / 2, pw, ph); ctx.restore();
        }
        drawIconMini(-tw / 2 - 30, 0);
        ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, 22, 2);
        ctx.restore();
      }
      const ua = ca - 0.14;
      if (ua > 0) {
        ctx.save(); ctx.globalAlpha = E.outC(clamp(ua / 0.2));
        ctx.font = fnt(600, 22, FONT.mono); ctx.letterSpacing = '6px'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = COL.muted;
        ctx.fillText(scramble('GITHUB.COM/BGO6D-BA/CLIPHISTORY', ua, 0.35, 61), CX + 3, 805);
        ctx.restore();
      }
    },
  };

  // the Apple-style download arrow inside the pill
  function drawIconMini(x, y) {
    ctx.save(); ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 3.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.lineTo(x, y + 8); ctx.moveTo(x - 9, y); ctx.lineTo(x, y + 9); ctx.lineTo(x + 9, y);
    ctx.moveTo(x - 13, y + 16); ctx.lineTo(x + 13, y + 16); ctx.stroke(); ctx.restore();
  }
})();
