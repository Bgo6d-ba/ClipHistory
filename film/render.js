const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');

const PAGE = 'index.html', AUDIO = 'film.wav', NAME = 'cliphistory_presentation';
const DIR = __dirname, FPS = 60, DUR = require('./voice.json').duration, TOTAL = Math.ceil(FPS * DUR);
const LANG = '';
const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.json': 'application/json' };

const server = http.createServer((q, r) => {
  const rel = decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/' + PAGE);
  const f = path.join(DIR, path.normalize(rel));
  if (!f.startsWith(DIR)) { r.writeHead(403); return r.end(); }
  fs.readFile(f, (e, d) => {
    if (e) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
    r.end(d);
  });
});

function run(cmd, args) {
  return new Promise((res, rej) => spawn(cmd, args, { stdio: 'inherit' }).on('close', (c) => (c ? rej(new Error(`${cmd} exited ${c}`)) : res())));
}

async function openPage(browser, port) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', (e) => console.error('PAGEERR', e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) console.error('CONSOLE', m.text()); });
  await page.goto(`http://127.0.0.1:${port}/${PAGE}`);
  await page.evaluate(() => window.ready);
  return page;
}
const grab = (page, t) => page.evaluate((t) => { window.renderFrame(t); return window.snap(); }, t).then((u) => Buffer.from(u.split(',')[1], 'base64'));

async function video(browser, port, workers) {
  const per = Math.ceil(TOTAL / workers), t0 = Date.now(), segs = [];
  fs.mkdirSync(path.join(DIR, 'out'), { recursive: true });
  await Promise.all([...Array(workers)].map(async (_, w) => {
    const a = w * per, b = Math.min(TOTAL, a + per), seg = path.join(DIR, 'out', `.seg_${w}.mp4`);
    segs[w] = seg;
    const page = await openPage(browser, port);
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
      '-vf', 'noise=c0s=2:c0f=t,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-maxrate', '22M', '-bufsize', '44M',
      '-tune', 'film', '-g', '120', '-x264-params', 'keyint=120:min-keyint=120:scenecut=0', seg], { stdio: ['pipe', 'inherit', 'inherit'] });
    for (let f = a; f < b; f++) {
      const buf = await grab(page, f / FPS);
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
      if ((f - a) % 240 === 0) console.log(`worker ${w}: ${f - a}/${b - a} frames, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
    ff.stdin.end();
    await new Promise((r) => ff.on('close', r));
  }));
  const list = path.join(DIR, 'out', '.segs.txt');
  fs.writeFileSync(list, segs.map((s) => `file '${s}'`).join('\n'));
  const outFile = path.join(DIR, 'out', `${NAME}.mp4`), wav = path.join(DIR, AUDIO);
  const audioArgs = fs.existsSync(wav) ? ['-i', wav, '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '320k', '-shortest'] : [];
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, ...audioArgs, '-c:v', 'copy', '-movflags', '+faststart', outFile]);
  [...segs, list].forEach((f) => fs.rmSync(f, { force: true }));
  console.log(`wrote ${path.relative(DIR, outFile)} in ${((Date.now() - t0) / 1000).toFixed(0)}s${audioArgs.length ? '' : ' (no soundtrack: run `node audio.js` first)'}`);
}

async function stills(browser, port, times) {
  const dir = path.join(DIR, 'stills');
  fs.mkdirSync(dir, { recursive: true });
  const page = await openPage(browser, port);
  for (const s of times) {
    const t = parseFloat(s), t0 = Date.now(), file = path.join(dir, `t${t.toFixed(2).padStart(5, '0')}.png`);
    fs.writeFileSync(file, await grab(page, t));
    console.log(`${path.relative(DIR, file)} (${Date.now() - t0} ms)`);
  }
}

(async () => {
  const [mode = 'video', ...rest] = process.argv.slice(2);
  if (mode === 'serve') {
    const port = Number(rest[0]) || 8000;
    server.listen(port, () => console.log(`open http://localhost:${port}/?play  (click the page to start with sound)`));
    return;
  }
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const args = ['--headless=new', '--enable-gpu', '--ignore-gpu-blocklist', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])];
  const executablePath = process.env.CHROME_PATH || (fs.existsSync(MAC_CHROME) ? MAC_CHROME : undefined);
  const browser = await chromium.launch({ executablePath, args });
  try {
    if (mode === 'still') await stills(browser, port, rest);
    else await video(browser, port, parseInt(rest[0] || '4'));
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
