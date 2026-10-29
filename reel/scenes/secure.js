'use strict';
// secure — bars 12–13 (22.50–26.25 s). A copied API token (a history card built on a real code card) flies at a glass
// vault, is refused with a red flash and shatters: "SECRETS SKIPPED." Then three real cards scramble into cipher text
// and are pulled into the vault as it locks: "ENCRYPTED ON YOUR MAC."
(() => {
  const S0 = bar(12), Q = CUES.secure, loc = (t) => t - S0;
  const TOKEN = loc(Q.token), REJECT = loc(Q.reject), SL1 = loc(Q.slam1.t), CIPHER = Q.cipher.map(loc), LOCK = loc(Q.lock), SL2 = loc(Q.slam2.t);
  const VAULT = [CX, 410], VS = 300;
  const ORBIT = [['text-launch', -500, 440], ['link-figma', 500, 440], ['image-sunset', 0, 140]];
  let tokenCanvas = null, tokenTex = null, vaultTex = null;

  function init() {
    // the token card: a real code card with its text replaced by a key
    const c = mkCanvas(390, 235), x = c.getContext('2d');
    x.drawImage(IMG.cards['code-npm'], 0, 0);
    const px = x.getImageData(40, 30, 1, 1).data;
    x.fillStyle = `rgb(${px[0]},${px[1]},${px[2]})`; x.fillRect(16, 26, 358, 150);
    x.fillStyle = '#FFFFFF'; x.font = fnt(500, 36, FONT.mono); x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('sk-ant-api03-', 195, 82); x.fillText('9fQ2••••x7Lm', 195, 128);
    tokenCanvas = c; tokenTex = GLX.texture(c);
    // the vault face: indigo glass with a lock
    const v = mkCanvas(800, 800), y = v.getContext('2d');
    const g = y.createLinearGradient(0, 0, 0, 800); g.addColorStop(0, '#6B5CFF'); g.addColorStop(1, '#2E25A8');
    y.fillStyle = g; y.fillRect(0, 0, 800, 800);
    y.strokeStyle = 'rgba(255,255,255,0.08)'; y.lineWidth = 2;
    for (let i = 40; i < 800; i += 40) { y.beginPath(); y.moveTo(i, 0); y.lineTo(i, 800); y.moveTo(0, i); y.lineTo(800, i); y.stroke(); }
    y.fillStyle = '#FFFFFF'; y.strokeStyle = '#FFFFFF'; y.lineWidth = 44; y.lineCap = 'round';
    y.beginPath(); y.arc(400, 360, 120, Math.PI, 0); y.stroke();
    y.beginPath(); y.roundRect(230, 350, 340, 270, 46); y.fill();
    y.fillStyle = '#3E33C8'; y.beginPath(); y.arc(400, 460, 34, 0, TAU); y.fill(); y.fillRect(388, 470, 24, 70);
    vaultTex = GLX.texture(v);
  }

  function cipher(name, x, y, k, p, seed, t) {
    const w = 78 * k, h = 47 * k;
    cardImg(name, x - w / 2, y - h / 2, k);
    if (p <= 0) return;
    ctx.save(); rrect(x - w / 2, y - h / 2, w, h, 10 * k); ctx.clip();
    ctx.fillStyle = rgba(COL.deep, 0.92 * p); ctx.fillRect(x - w / 2, y - h / 2, w * p, h);
    ctx.font = fnt(600, 7 * k, FONT.mono); ctx.fillStyle = rgba(COL.indigoHi, p); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const rows = 4, frame = Math.floor(t * 30);
    for (let r = 0; r < rows; r++) {
      let s = '';
      for (let i = 0; i < 14; i++) s += '0123456789abcdef'[Math.floor(hash(i, r + seed * 7, frame) * 16)];
      ctx.fillText(s, x - w / 2 + 6 * k, y - h / 2 + (9 + r * 9.5) * k);
    }
    ctx.restore();
  }

  SCENES.secure = {
    init,
    draw(lt) {
      if (!tokenTex) init();
      bg(COL.night);
      FX.hud.dark = true; FX.bloom = 0.55; FX.vig = 0.36;
      blueprint('rgba(255,255,255,0.03)', 48, 1, 0, lt * 10);
      const locked = E.outC(clamp((lt - LOCK) / 0.3));
      glow(VAULT[0], VAULT[1], 620, COL.indigo, 0.22 + 0.25 * locked * Math.exp(-(lt - LOCK) * 2));

      // red refusal
      const ra = lt - REJECT;
      if (ra > 0 && ra < 0.5) {
        FX.glitch = Math.max(FX.glitch, 0.5 * Math.exp(-ra * 8));
        glow(VAULT[0], VAULT[1], 500, COL.danger, 0.55 * (1 - ra / 0.5));
        ctx.strokeStyle = rgba(COL.danger, 1 - ra / 0.5); ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(VAULT[0], VAULT[1], VS * 0.75 + ra * 420, 0, TAU); ctx.stroke();
      }

      // three real cards in orbit, scrambling into cipher, then pulled into the vault
      if (lt >= SL1 + 0.2) {
        ORBIT.forEach(([name, dx, y], i) => {
          const a = lt - (SL1 + 0.2) - i * 0.06, p = spring(a, 2.6, 0.6);
          if (a < 0) return;
          const suck = E.inExpo(inv(LOCK - 0.25, LOCK + 0.05, lt));
          if (suck >= 1) return;
          const x = lerp(VAULT[0], VAULT[0] + dx, p * (1 - suck)), yy = lerp(VAULT[1], y, p * (1 - suck));
          const scr = E.ioC(inv(CIPHER[0] + i * 0.08, CIPHER[1], lt));
          ctx.save(); ctx.globalAlpha = clamp(a / 0.1);
          cipher(name, x, yy, 3.6 * (1 - suck * 0.9), scr, i, lt);
          ctx.restore();
        });
      }

      // the vault: a glass tile that rocks gently and slams shut on the lock beat
      const shut = lt >= LOCK ? Math.exp(-(lt - LOCK) * 6) : 0;
      GLASS({ x: VAULT[0], y: VAULT[1], w: VS * (1 + 0.06 * shut), h: VS * (1 + 0.06 * shut), d: 64, r: VS * 0.22,
        yaw: Math.sin(lt * 1.3) * 0.32 * (1 - locked * 0.7), pitch: 0.12 + Math.cos(lt * 1.1) * 0.12, roll: 0, tex: vaultTex, tint: COL.indigo, gloss: 1.1 });

      // the token: thrown in from the left, refused and shattered on the reject beat
      const ta = lt - TOKEN;
      if (ta >= 0) {
        const k = 3.8, w = 78 * k, h = 47 * k;
        if (lt < REJECT) {
          const u = E.inQ(clamp(ta / (REJECT - TOKEN)));
          const x = lerp(-200, VAULT[0] - VS * 0.9, u), y = lerp(560, VAULT[1] + 20, u) - Math.sin(Math.PI * u) * 120;
          GLASS({ x, y, w, h, d: 7 * k, r: 10 * k, yaw: 0.6 - u * 0.4, pitch: 0.2, roll: -0.2 + u * 0.2, tex: tokenTex, tint: COL.code });
        } else {
          shatterImg(tokenCanvas, VAULT[0] - VS * 0.9 - w / 2, VAULT[1] + 20 - h / 2, w, h, ra * 0.9, 77, { spread: -1.1 });
        }
      }

      const out1 = lt - CIPHER[0] + 0.1;
      if (lt >= SL1) slamLine(Q.slam1.text, CX, 850, lt - SL1, { size: 132, color: COL.danger, out: out1 });
      if (lt >= SL2) slamLine(Q.slam2.text, CX, 850, lt - SL2, { size: 132, color: '#FFFFFF' });
    },
  };
})();
