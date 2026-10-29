'use strict';
// demo — bars 6–9 (11.25–18.75 s). The real app over the wallpaper it was captured on. ⇧⌘V, the real Liquid Glass popup
// drops in, → steps the selection through the real captured states, Return lifts the selected card out as a glass slab
// that flies into a Notes window and pastes. Then "ONE SHORTCUT. / EVERYTHING YOU COPIED." over a dark scrim.
// Captures were taken at screen px (212, 582) on a 3024×1964 display showing assets/wallpaper.png full screen, so drawing
// the wallpaper at the same scale and the capture at the mapped spot lines the glass up with what is behind it.
(() => {
  const S0 = bar(6), D = CUES.demo, loc = (t) => t - S0;
  const KEYS = loc(D.keys), DROP = loc(D.drop), MOVES = D.moves.map(loc), RET = loc(D.back), PASTE = loc(D.paste), LAND = loc(D.land);
  const SL = D.slams.map((s) => ({ t: loc(s.t), text: s.text })), OUT = loc(D.out);
  const SC = 1920 / 3024, OFFY = 90;
  const POP = { x: 212 * SC, y: 582 * SC - OFFY, w: 2600 * SC, h: 800 * SC };
  const cardRect = (i) => ({ x: POP.x + (95 + i * 430) * SC, y: POP.y + 470 * SC, w: 390 * SC, h: 235 * SC });
  const PICK = 3, PICK_NAME = 'text-launch', PASTED = 'Launch on Friday 🚀';
  const NOTE = { x: 510, y: 330, w: 900, h: 470 };

  function wallpaper(alpha = 1) { ctx.save(); ctx.globalAlpha = alpha; ctx.drawImage(IMG.wall, 0, -OFFY, 3024 * SC, 1964 * SC); ctx.restore(); }

  function popup(lt) {
    const show = E.outC(clamp((lt - DROP) / 0.22)), hide = E.inC(clamp((lt - PASTE) / 0.2));
    const a = show * (1 - hide);
    if (a <= 0) return;
    const state = lt >= MOVES[3] ? 'sel3' : lt >= MOVES[2] ? 'sel2' : lt >= MOVES[1] ? 'sel1' : lt >= MOVES[0] ? 'sel0' : 'base';
    const dy = (1 - show) * -40 + hide * -30;
    ctx.save(); ctx.globalAlpha = a;
    ctx.shadowColor = 'rgba(10,8,40,0.45)'; ctx.shadowBlur = 80; ctx.shadowOffsetY = 30;
    rrect(POP.x + 4, POP.y + dy + 4, POP.w - 8, POP.h - 8, 92); ctx.fillStyle = 'rgba(0,0,0,0.01)'; ctx.fill();
    ctx.shadowColor = 'transparent';
    rrect(POP.x, POP.y + dy, POP.w, POP.h, 95); ctx.clip();
    ctx.drawImage(IMG.ui[state], POP.x, POP.y + dy, POP.w, POP.h);
    // while the picked card flies, its slot is empty
    if (lt >= PASTE) { const r = cardRect(PICK); rrect(r.x, r.y + dy, r.w, r.h, 30); ctx.fillStyle = 'rgba(30,28,70,0.55)'; ctx.fill(); }
    ctx.restore();
  }

  function keys(lt) {
    const a = E.outC(clamp((lt + 0.05) / 0.15)) * (1 - E.inC(clamp((lt - DROP) / 0.2)));
    if (a > 0) {
      const p = Math.exp(-Math.max(0, lt - KEYS) * 10);
      ctx.save(); ctx.globalAlpha = a;
      [['⇧', -170], ['⌘', 0], ['V', 170]].forEach(([k, dx]) => keycap(CX + dx, CY, 150, k, p));
      ctx.restore();
    }
    // → on every step, ↩ to paste
    const step = [...MOVES.map((t) => [t, '→']), [RET, '↩']];
    const shown = lt >= MOVES[0] - 0.15 && lt < PASTE + 0.25;
    if (!shown) return;
    const fade = E.outC(clamp((lt - (MOVES[0] - 0.15)) / 0.15)) * (1 - E.inC(clamp((lt - PASTE) / 0.25)));
    let label = '→', press = 0;
    for (const [t, k] of step) if (lt >= t) { label = k; press = Math.exp(-(lt - t) * 12); }
    ctx.save(); ctx.globalAlpha = fade; keycap(CX, 935, 110, label, press); ctx.restore();
  }

  function note(lt) {
    const inP = spring(lt - (PASTE - 0.1), 2.4, 0.62), out = E.inC(clamp((lt - SL[0].t + 0.1) / 0.3));
    if (inP <= 0.001) return null;
    const y = NOTE.y + (1 - inP) * 380 + out * 40, a = clamp(inP * 1.4) * (1 - out * 0.85);
    ctx.save(); ctx.globalAlpha = a;
    ctx.shadowColor = 'rgba(10,8,40,0.45)'; ctx.shadowBlur = 70; ctx.shadowOffsetY = 26;
    rrect(NOTE.x, y, NOTE.w, NOTE.h, 26); ctx.fillStyle = '#FBFBFD'; ctx.fill(); ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 1.5; ctx.stroke();
    ['#FF5F57', '#FEBC2E', '#28C840'].forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(NOTE.x + 34 + i * 26, y + 32, 8, 0, TAU); ctx.fill(); });
    ctx.font = fnt(600, 20, FONT.ui); ctx.fillStyle = COL.muted2; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Launch plan', NOTE.x + NOTE.w / 2, y + 32);
    ctx.textAlign = 'left'; ctx.fillStyle = COL.ink; ctx.font = fnt(800, 40, FONT.ui); ctx.fillText('Team update', NOTE.x + 60, y + 118);
    ctx.font = fnt(500, 26, FONT.ui); ctx.fillStyle = COL.muted2;
    ctx.fillText('Design review done. Copy is final.', NOTE.x + 60, y + 182);
    ctx.fillText('Next:', NOTE.x + 60, y + 236);
    const px = NOTE.x + 60 + ctx.measureText('Next: ').width, py = y + 236;
    if (lt >= LAND) {
      const hl = Math.exp(-(lt - LAND) * 3);
      ctx.font = fnt(700, 26, FONT.ui); const tw = ctx.measureText(PASTED).width;
      rrect(px - 8, py - 22, tw + 16, 44, 8); ctx.fillStyle = rgba(COL.indigo, 0.12 + 0.25 * hl); ctx.fill();
      ctx.fillStyle = COL.ink; ctx.fillText(PASTED, px, py + 1);
    } else if (Math.floor(lt * 2.4) % 2 === 0) { ctx.fillStyle = COL.indigo; ctx.fillRect(px, py - 18, 3, 36); }
    ctx.restore();
    return { px: px + 140, py };
  }

  SCENES.demo = {
    draw(lt) {
      bg(COL.night);
      FX.hud.dark = true; FX.bloom = 0.15; FX.vig = 0.22;
      FX.flash = Math.max(0, 1 - lt / 0.12) * 0.5;
      wallpaper();
      keys(lt);
      popup(lt);
      const target = note(lt);
      // the picked card flies from its slot into the note, as a glass slab that spins once and shrinks into the caret
      const fa = lt - PASTE;
      if (fa >= 0 && lt < LAND + 0.05 && target) {
        const r = cardRect(PICK), u = E.ioC(clamp(fa / (LAND - PASTE)));
        const x = lerp(r.x + r.w / 2, target.px, u), y = lerp(r.y + r.h / 2, target.py, u) - Math.sin(Math.PI * u) * 160;
        glassCard(PICK_NAME, x, y, (r.w / 78) * lerp(1.15, 0.45, u), { yaw: Math.sin(Math.PI * u) * 0.9, pitch: 0.25 * Math.sin(Math.PI * u), roll: -0.15 * u, alpha: 1 - E.inQ(inv(0.75, 1, u)) });
      }
      // dark scrim + the two lines
      const sa = lt - SL[0].t;
      if (sa > -0.1) {
        const scrim = E.outC(clamp((sa + 0.1) / 0.3)) * (1 - E.inC(clamp((lt - OUT) / 0.25)));
        ctx.fillStyle = rgba(COL.night, 0.72 * scrim); ctx.fillRect(0, 0, W, H);
        slamLine(SL[0].text, CX, CY - 85, sa, { size: 176, color: '#FFFFFF', out: lt - OUT });
        slamLine(SL[1].text, CX, CY + 105, lt - SL[1].t, { size: 128, color: COL.indigoHi, out: lt - OUT });
      }
    },
  };
})();
