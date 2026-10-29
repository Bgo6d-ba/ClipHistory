'use strict';
// sort — bars 10–11 (18.75–22.50 s). The real popup flips through its real category filters on each beat of bar 10
// (Colors, Code, Links, Text) and that category's real cards burst out above it as glass slabs. Bar 11: "SORTED." on
// the full history, "SEARCHABLE." as the real search for "fig" narrows it to one card, "PINNED." as the pin turns orange.
(() => {
  const S0 = bar(10), Q = CUES.sort, loc = (t) => t - S0;
  const COLS = Q.columns.map(loc), WORDS = Q.words.map((w) => ({ t: loc(w.t), text: w.text })), PIN = loc(Q.pin);
  const SC = 1920 / 3024, OFFY = 0;
  const POP = { x: 212 * SC, y: 582 * SC - OFFY, w: 2600 * SC, h: 800 * SC };
  const GROUPS = [
    { state: 'colors', cards: ['color-indigo', 'color-red', 'color-cyan'] },
    { state: 'code', cards: ['code-git', 'code-npm'] },
    { state: 'links', cards: ['link-figma', 'link-github', 'link-meet'] },
    { state: 'text', cards: ['text-launch', 'text-release', 'text-dinner'] },
  ];

  function stateAt(lt) {
    if (lt >= WORDS[2].t) return 'figpin';
    if (lt >= WORDS[1].t + 0.12) return 'fig';
    if (lt >= WORDS[0].t) return 'base';
    let s = 'base';
    GROUPS.forEach((g, i) => { if (lt >= COLS[i]) s = g.state; });
    return s;
  }

  function burst(lt) {
    GROUPS.forEach((g, gi) => {
      // the last group clears before "SORTED." lands
      const t0 = COLS[gi], t1 = gi < 3 ? COLS[gi + 1] : WORDS[0].t - 0.22, age = lt - t0;
      if (age < 0 || lt > t1 + 0.2) return;
      const leave = E.inC(clamp((lt - t1) / 0.2));
      g.cards.forEach((name, i) => {
        const n = g.cards.length, a = age - i * 0.04, p = spring(a, 2.8, 0.55);
        if (a < 0) return;
        const tx = CX + (i - (n - 1) / 2) * 420, ty = 205;
        const x = lerp(POP.x + POP.w / 2, tx, p) + leave * (i - (n - 1) / 2) * 300, y = lerp(POP.y + 420 * SC, ty, p) - leave * 220;
        glassCard(name, x, y, 4.1, { yaw: (i - (n - 1) / 2) * -0.28 + (1 - p) * 0.8, pitch: 0.18 + (1 - p) * 0.5, roll: (i - (n - 1) / 2) * 0.05, alpha: clamp(a / 0.08) * (1 - leave), z: (1 - p) * 400 });
      });
    });
  }

  SCENES.sort = {
    draw(lt) {
      bg(COL.night);
      FX.hud.dark = true; FX.bloom = 0.2; FX.vig = 0.26;
      ctx.drawImage(IMG.wall, 0, -OFFY, 3024 * SC, 1964 * SC);
      ctx.fillStyle = rgba(COL.night, 0.25); ctx.fillRect(0, 0, W, H);
      // cards are drawn first so they rise out from behind the popup instead of across it
      burst(lt);

      // the popup, punching in slightly on every filter change
      let kick = 0;
      for (const t of [...COLS, WORDS[1].t + 0.12, WORDS[2].t]) if (lt >= t) kick = Math.exp(-(lt - t) * 10);
      const s = 1 + 0.012 * kick, cx = POP.x + POP.w / 2, cy = POP.y + POP.h / 2;
      ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy);
      ctx.shadowColor = 'rgba(10,8,40,0.45)'; ctx.shadowBlur = 80; ctx.shadowOffsetY = 30;
      rrect(POP.x + 4, POP.y + 4, POP.w - 8, POP.h - 8, 92); ctx.fillStyle = 'rgba(0,0,0,0.01)'; ctx.fill(); ctx.shadowColor = 'transparent';
      rrect(POP.x, POP.y, POP.w, POP.h, 95); ctx.clip();
      ctx.drawImage(IMG.ui[stateAt(lt)], POP.x, POP.y, POP.w, POP.h);
      ctx.restore();

      // the pin turning orange gets a ring
      const pa = lt - PIN;
      if (pa > 0 && pa < 0.6) {
        const px = POP.x + (95 + 330) * SC, py = POP.y + (470 + 205) * SC, q = E.outC(pa / 0.6);
        ctx.strokeStyle = rgba(COL.pin, 0.9 * (1 - q)); ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(px, py, 14 + 90 * q, 0, TAU); ctx.stroke();
      }

      WORDS.forEach((w, i) => {
        if (lt < w.t) return;
        const x = CX + (i - 1) * 560;
        slamLine(w.text, x, 205, lt - w.t, { size: 128, color: i === 2 ? COL.pin : i === 1 ? COL.text : '#FFFFFF' });
      });
    },
  };
})();
