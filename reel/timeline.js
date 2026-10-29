// 128 BPM grid: beat 0.46875 s, bar 1.875 s, 16 bars = exactly 30 s. The page and audio.js both read this file,
// so moving a cue moves picture and sound together. at(bar, beat) counts beats from 1.
(function (root) {
  const BPM = 128, BEAT = 60 / BPM, BAR = BEAT * 4, S16 = BEAT / 4, S32 = BEAT / 8;
  const bar = (n) => n * BAR;
  const at = (b, beat = 1) => b * BAR + (beat - 1) * BEAT;

  const SCENES = [
    { id: 'copy', start: bar(0), end: bar(4), tag: '01 · The problem' },
    { id: 'reveal', start: bar(4), end: bar(6), tag: '02 · Meet ClipHistory' },
    { id: 'demo', start: bar(6), end: bar(10), tag: '03 · One shortcut' },
    { id: 'sort', start: bar(10), end: bar(12), tag: '04 · Sorted for you' },
    { id: 'secure', start: bar(12), end: bar(14), tag: '05 · Private by design' },
    { id: 'finale', start: bar(14), end: bar(16), tag: '06 · Free for Mac' },
  ];

  const CUES = {
    copy: {
      presses: [at(0, 1), at(0, 2), at(0, 3), at(0, 4), at(1, 1), at(1, 2), at(1, 3), at(1, 4)],
      slams: [{ t: at(1, 1), text: 'YOU COPY' }, { t: at(1, 3), text: 'ALL DAY.' }],
      overwrite: [at(2, 1), at(2, 2), at(2, 3)],
      slams2: [{ t: at(2, 1), text: 'YOUR MAC' }, { t: at(2, 3), text: 'KEEPS ONE.' }],
      eyebrow: at(3, 1),
      implode: [at(3, 3), at(3, 4)],
    },
    reveal: {
      burst: at(4, 1),
      settle: at(4, 3),
      crisp: [at(4, 3), at(4, 4)],
      shift: [at(5, 1) - BEAT / 2, at(5, 1)],
      word: at(5, 1),
      eyebrow: at(5, 2),
      hudBoot: [at(5, 2), at(5, 4)],
    },
    demo: {
      keys: at(6, 1),
      drop: at(6, 2),
      moves: [at(6, 4), at(7, 1), at(7, 2), at(7, 3)],
      back: at(7, 4),
      paste: at(8, 1),
      land: at(8, 2),
      slams: [{ t: at(8, 3), text: 'ONE SHORTCUT.' }, { t: at(9, 1), text: 'EVERYTHING YOU COPIED.' }],
      out: at(9, 4),
    },
    sort: {
      streams: at(10, 1),
      columns: [at(10, 1), at(10, 2), at(10, 3), at(10, 4), at(11, 1)],
      words: [{ t: at(11, 1), text: 'SORTED.' }, { t: at(11, 2), text: 'SEARCHABLE.' }, { t: at(11, 3), text: 'PINNED.' }],
      search: [at(11, 2), at(11, 3)],
      pin: at(11, 3) + BEAT / 2,
    },
    secure: {
      token: at(12, 1),
      reject: at(12, 2),
      slam1: { t: at(12, 3), text: 'SECRETS SKIPPED.' },
      cipher: [at(13, 1), at(13, 2)],
      lock: at(13, 2),
      slam2: { t: at(13, 3), text: 'ENCRYPTED ON YOUR MAC.' },
    },
    finale: {
      free: at(14, 1),
      open: at(14, 2),
      clear: at(14, 4),
      lockup: at(15, 1),
      cta: at(15, 2),
      hit: at(15, 2),
    },
  };

  const IMPACTS = [{ t: bar(4), a: 0.9 }, { t: at(2, 2), a: 0.35 }, { t: bar(10), a: 0.45 }, { t: at(12, 2), a: 0.5 }, { t: at(15, 2), a: 0.6 }];

  const api = { BPM, BEAT, BAR, S16, S32, bar, at, SCENES, CUES, IMPACTS, DURATION: 30 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TL = api;
})(this);
