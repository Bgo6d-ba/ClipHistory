'use strict';
// copy — bars 0–3 (0.00–7.50 s). ⌘C on every beat flings a real history card (3D glass slab) off the key onto a
// perspective stack while "YOU COPY / ALL DAY." rises on the left. Bar 2 the clipboard forgets: glitch, the stack
// shatters into fragments of its own pixels, the survivor is overwritten by one more copy ("YOUR MAC / KEEPS ONE.").
// Bar 3 the lone card drifts to centre and implodes into the dot that bursts into the app icon on bar 4.
(() => {
  const C = CUES.copy, PRESS = C.presses, OVER = C.overwrite;
  const KEY = [1440, 930], STACK = [1440, 610], K = 4.4, CW = 78 * K, CH = 47 * K;
  const CLIPS = ['link-figma', 'color-indigo', 'code-git', 'text-launch', 'image-sunset', 'link-github', 'color-red', 'text-release'];
  const LAST = 'text-dinner';
  const copied = (lt) => PRESS.filter((p) => lt >= p).length;

  // where card i sits at time lt: thrown from the key, spinning, then pushed back as newer cards land on top
  function pose(i, lt) {
    const age = lt - PRESS[i], n = copied(lt), depth = n - 1 - i;
    const fly = E.outQuart(clamp(age / 0.36)), land = spring(age - 0.2, 3, 0.55);
    const x = lerp(KEY[0], STACK[0] + (hash(i, 9) - 0.5) * 40 * Math.min(1, depth), fly);
    const y = lerp(KEY[1] - 40, STACK[1] - depth * 62, fly) - Math.sin(Math.PI * fly) * 190;
    const spin = (1 - fly) * (i % 2 ? 2.4 : -2.4);
    return {
      x, y, z: depth * 120 + (1 - fly) * -300,
      yaw: -0.32 + spin * 0.4 + (hash(i, 3) - 0.5) * 0.12, pitch: 0.42 + (1 - land) * 0.4, roll: (hash(i, 5) - 0.5) * 0.1 + spin * 0.15,
      alpha: clamp(age / 0.06) * (1 - depth * 0.05), depth,
    };
  }

  function slams(lt) {
    const L = 150, size = 196, out1 = lt - C.slams2[0].t + 0.12, out2 = lt - C.eyebrow;
    if (lt < C.slams2[0].t + 0.2) {
      slamLine(C.slams[0].text, L, CY - 95, lt - C.slams[0].t, { size, align: 'left', color: '#FFFFFF', out: out1 });
      slamLine(C.slams[1].text, L, CY + 115, lt - C.slams[1].t, { size, align: 'left', color: COL.indigoHi, out: out1 });
    }
    if (lt >= C.slams2[0].t) {
      slamLine(C.slams2[0].text, L, CY - 95, lt - C.slams2[0].t, { size, align: 'left', color: '#FFFFFF', out: out2 });
      slamLine(C.slams2[1].text, L, CY + 115, lt - C.slams2[1].t, { size, align: 'left', color: COL.color, out: out2 });
    }
  }

  SCENES.copy = {
    draw(lt) {
      bg(COL.night);
      FX.hud.show = false; FX.bloom = 0.5; FX.vig = 0.34;
      for (const t of OVER) if (lt >= t) FX.glitch = Math.max(FX.glitch, 0.55 * Math.exp(-(lt - t) * 9));
      blueprint('rgba(255,255,255,0.035)', 48, 1, 0, -lt * 12);
      glow(STACK[0], STACK[1] - 40, 680, COL.indigo, 0.24 + 0.1 * Math.exp(-((lt % BEAT) * 6)));

      slams(lt);

      // ⌘C: pressed on every copy, gone once the clipboard has forgotten
      const keyOut = E.inC(inv(C.eyebrow - 0.1, C.eyebrow + 0.25, lt));
      if (keyOut < 1) {
        let press = 0;
        for (const p of [...PRESS, OVER[2]]) if (lt >= p) press = Math.max(press, Math.exp(-(lt - p) * 14));
        ctx.save(); ctx.globalAlpha = 1 - keyOut; ctx.translate(0, keyOut * 60);
        keycap(KEY[0] - 85, KEY[1], 150, '⌘', press); keycap(KEY[0] + 85, KEY[1], 150, 'C', press);
        ctx.restore();
      }

      // the stack (oldest first so newer cards draw on top) until it shatters on 2.2; the newest is overwritten on 2.3
      const broke = OVER[1], over = OVER[2], n = copied(lt);
      for (let i = 0; i < n; i++) {
        const P = pose(i, Math.min(lt, broke)), top = i === PRESS.length - 1;
        // the shatter is drawn flat where the card stood, sized by its depth
        const s = 2400 / (2400 + P.z), fw = CW * s, fh = CH * s;
        if ((lt >= broke && !top) || (top && lt >= over)) {
          const age = top ? lt - over : lt - broke - P.depth * 0.015;
          shatterImg(IMG.cards[CLIPS[i]], P.x - fw / 2, P.y - fh / 2, fw, fh, age, i * 31 + 5);
          continue;
        }
        const jit = lt >= OVER[0] && lt < broke ? (hash(i, Math.floor(lt * 60)) - 0.5) * 26 : 0;
        glassCard(CLIPS[i], P.x + jit, P.y, K, { z: P.z, yaw: P.yaw, pitch: P.pitch, roll: P.roll, alpha: P.alpha });
      }

      // the survivor lands on 2.3, faces the camera, drifts to centre in bar 3 and implodes into a dot
      if (lt >= over) {
        const age = lt - over, land = spring(age, 2.6, 0.5);
        const toC = E.ioC(inv(C.eyebrow + 0.25, C.implode[0], lt)), imp = E.inExpo(inv(C.implode[0], C.implode[1], lt));
        const x = lerp(STACK[0], CX, toC), y = lerp(STACK[1], CY - 30, toC), k = K * lerp(0.4 + 0.6 * land, 1.2, toC) * (1 - imp);
        if (k > 0.05) glassCard(LAST, x, y, k, { yaw: lerp(-0.32, 0, toC) + (1 - land) * 1.5, pitch: lerp(0.42, 0.08, toC), roll: (1 - land) * 0.3 });
        const ea = lt - C.eyebrow;
        if (ea > 0 && imp < 0.5) {
          ctx.save(); ctx.globalAlpha = clamp(ea / 0.15) * (1 - imp * 2);
          eyebrow(scramble('Clipboard · 1 item', ea, 0.4, 7), x, y + (47 * k) / 2 + 66, 'rgba(255,255,255,0.8)', { size: 18 });
          ctx.restore();
        }
        if (imp > 0) {
          const r = 6 + 14 * imp + 4 * Math.sin((lt - C.implode[1]) * 30) * clamp((lt - C.implode[1]) * 4);
          glow(CX, CY - 30, 160 * imp, COL.indigoHi, 0.8 * imp);
          ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(CX, CY - 30, r, 0, TAU); ctx.fill();
          FX.bloom = 0.5 + imp * 0.6;
        }
      }
    },
  };
})();
