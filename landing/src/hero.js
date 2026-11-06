// AI-assisted: Used Claude for the landing page visuals and animation
import { createRain } from './rain.js';
import { SAMPLE_DOC, sha256Hex, toBase64 } from './crypto.js';
import { createIntro, shouldPlayIntro } from './intro.js';

const TTL_SECONDS = 12;
const FORM = 1.7, MELT = 2.3, GONE = 4.2;

const ease = (x) => 1 - (1 - x) ** 3;
const clamp01 = (x) => Math.min(1, Math.max(0, x));

// Fit the sample contract to a fixed-width block and tile it, so any cell in the grid holds a real character.
function layoutDocument() {
  const width = 124, lines = [];
  for (const para of SAMPLE_DOC.split('\n')) {
    if (!para.trim()) { lines.push(''); continue; }
    let line = '', vis = 0;
    for (const word of para.split(' ')) {
      const len = word.replace(/[{}]/g, '').length;
      if (vis + len + (vis ? 1 : 0) > width) { lines.push(line); line = word; vis = len; }
      else { line += (vis ? ' ' : '') + word; vis += len + (vis ? 1 : 0); }
    }
    lines.push(line);
  }
  const w = width + 4, h = lines.length + 1;
  const data = new Uint8Array(w * h * 2);
  data.fill(32);
  for (let i = 1; i < data.length; i += 2) data[i] = 0;
  lines.forEach((text, y) => {
    let x = 0, flag = 0;
    for (const ch of text) {
      if (ch === '{') { flag = 255; continue; }
      if (ch === '}') { flag = 0; continue; }
      const code = ch.charCodeAt(0);
      const i = (y * w + x) * 2;
      data[i] = code >= 32 && code < 128 ? code : 32;
      data[i + 1] = flag;
      x++;
    }
  });
  return { data, w, h };
}

async function makeCipherField() {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(SAMPLE_DOC.repeat(Math.ceil(50000 / SAMPLE_DOC.length)));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
  const b64 = toBase64(cipher);
  const ascii = new Uint8Array(65536);
  for (let i = 0; i < 65536; i++) ascii[i] = b64.charCodeAt(i % b64.length);
  return ascii;
}

export async function startHero() {
  const hero = document.querySelector('.hero');
  const canvas = hero.querySelector('canvas');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let rain;
  try { rain = createRain(canvas); } catch (e) { console.warn('[enigma]', e); }
  if (!rain) { document.documentElement.classList.remove('gl', 'intro-pending'); return; }

  await Promise.all([
    document.fonts.load('700 100px "Enigma Sans"'),
    document.fonts.load('400 40px "Enigma Mono"'),
  ]);

  rain.buildAtlas();
  rain.setCipher(await makeCipherField());
  const plain = layoutDocument();
  rain.setPlain(plain.data, plain.w, plain.h);
  const emptyPlain = new Uint8Array(plain.data.length).fill(32);

  const words = [...hero.querySelectorAll('h1 [data-line]')];
  const copy = hero.querySelector('.hero-copy');
  const note = hero.querySelector('.hero-note');
  const status = hero.querySelector('[data-status]');
  const clock = hero.querySelector('[data-clock]');
  const receipt = hero.querySelector('.hero-receipt');
  const receiptHash = hero.querySelector('[data-receipt-hash]');
  const mask = document.createElement('canvas');

  const hash = await sha256Hex(new TextEncoder().encode(SAMPLE_DOC));
  receiptHash.textContent = `0x${hash.slice(0, 24)}…${hash.slice(-8)}`;

  let dprCap = 1.5, quietBase = [], intro = null;
  const applyQuiet = () => {
    if (intro?.refreshQuiet()) return;
    const b = receipt.getBoundingClientRect(), r = hero.getBoundingClientRect();
    const on = hero.classList.contains('is-erased');
    rain.state.quiet = [...quietBase, ...(on ? [b.left - r.left, b.top - r.top, b.right - r.left, b.bottom - r.top] : [-999, -999, -999, -999])];
  };

  function drawMask() {
    const s = rain.state.scale;
    const r = hero.getBoundingClientRect();
    mask.width = canvas.width; mask.height = canvas.height;
    const x = mask.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, mask.width, mask.height);
    x.globalCompositeOperation = 'lighter';
    x.textBaseline = 'alphabetic';
    for (const w of words) {
      const cs = getComputedStyle(w), b = w.getBoundingClientRect();
      x.font = `${cs.fontWeight} ${parseFloat(cs.fontSize) * s}px "Enigma Sans"`;
      if ('letterSpacing' in x) x.letterSpacing = `${(parseFloat(cs.letterSpacing) || 0) * s}px`;
      const asc = x.measureText('x').fontBoundingBoxAscent;
      const des = x.measureText('x').fontBoundingBoxDescent;
      const top = (b.top - r.top) * s + (b.height * s - (asc + des)) / 2;
      x.fillStyle = w.dataset.line === '1' ? '#f00' : '#0f0';
      x.fillText(w.textContent, (b.left - r.left) * s, top + asc);
    }
    rain.setMask(mask);
  }

  function layout() {
    const r = hero.getBoundingClientRect();
    rain.resize(r.width, r.height, dprCap);
    drawMask();
    const box = (el) => {
      const b = el.getBoundingClientRect();
      return [b.left - r.left, b.top - r.top, b.right - r.left, b.bottom - r.top];
    };
    const second = words.find((w) => w.dataset.line === '2').getBoundingClientRect();
    receipt.style.left = `${second.left - r.left}px`;
    receipt.style.top = `${second.top - r.top + second.height * 0.28}px`;
    quietBase = [...box(copy), ...box(note)];
    applyQuiet();
  }

  let resizeTimer;
  new ResizeObserver(() => { clearTimeout(resizeTimer); resizeTimer = setTimeout(layout, 80); }).observe(hero);
  layout();

  // Enclave window position, in grid cells. Eases toward the pointer, or drifts on its own.
  const lens = { x: 0, y: 0, tx: 0, ty: 0, pointer: false };
  const lensSize = () => (rain.state.css[0] < 720 ? [30, 9] : [46, 11]);
  hero.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const r = hero.getBoundingClientRect();
    lens.tx = (e.clientX - r.left) / rain.state.cell[0];
    lens.ty = (e.clientY - r.top) / rain.state.cell[1];
    if (!lens.pointer) { lens.x = lens.tx; lens.y = lens.ty; }
    lens.pointer = true;
  });
  hero.addEventListener('pointerleave', () => { lens.pointer = false; });

  function updateLens(t, dt) {
    if (!lens.pointer) {
      const [gx, gy] = rain.state.grid;
      lens.tx = gx * (.43 + Math.sin(t * .23) * .07);
      lens.ty = gy * (.27 + Math.sin(t * .37 + 1) * .03);
    }
    const k = 1 - Math.exp(-dt * (lens.pointer ? 14 : 2));
    lens.x += (lens.tx - lens.x) * k;
    lens.y += (lens.ty - lens.y) * k;
    const [lw, lh] = lensSize();
    const x = Math.round(lens.x - lw / 2), y = Math.round(lens.y - lh / 2);
    rain.state.lens = [x, y, x + lw, y + lh];
  }

  if (reduce) {
    document.documentElement.classList.remove('intro-pending');
    updateLens(2, 1); lens.x = lens.tx; lens.y = lens.ty; updateLens(2, 1);
    rain.state.lensOn = 1;
    clock.textContent = '';
    status.textContent = 'Animation paused';
    const paint = () => rain.draw(19);
    paint();
    new ResizeObserver(() => setTimeout(paint, 120)).observe(hero);
    return;
  }

  // The loop is the product: a key lives, a timer ends, the content goes, the receipt stays.
  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) kick(); }, { threshold: 0 }).observe(hero);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });

  let phase = 'form', phaseT = 0, last = 0, clockT = 0, running = false, shown = -1, slow = 0, frames = 0, fpsT = 0;
  const go = (p) => { phase = p; phaseT = 0; };

  function setStatus(key, text) {
    status.dataset.state = key;
    status.textContent = text;
  }
  setStatus('live', 'Key in memory');

  function step(t, dt) {
    phaseT += dt;
    const st = rain.state;
    if (phase === 'intro') { intro.update(phaseT, dt); return; }
    if (phase === 'form') {
      const a = clamp01(phaseT / FORM);
      st.drop1 = -(1 - ease(a));
      st.drop2 = -(1 - ease(clamp01((phaseT - .25) / FORM)));
      st.lensOn = clamp01((phaseT - 1) / .4);
      if (phaseT > FORM + .25) { st.drop1 = st.drop2 = 0; go('live'); }
    } else if (phase === 'live') {
      const left = Math.max(0, Math.ceil(TTL_SECONDS - phaseT));
      if (left !== shown) { shown = left; clock.textContent = `00:${String(left).padStart(2, '0')}`; }
      if (phaseT >= TTL_SECONDS) {
        // Past this point the page really has no plaintext for the window to show.
        rain.setPlain(emptyPlain, plain.w, plain.h);
        st.lensOn = 0;
        setStatus('gone', 'Key destroyed');
        hero.classList.add('is-forgotten');
        go('melt');
      }
    } else if (phase === 'melt') {
      st.drop2 = clamp01(phaseT / MELT) ** 1.5;
      if (phaseT > MELT * .72 && !hero.classList.contains('is-erased')) { hero.classList.add('is-erased'); applyQuiet(); }
      if (phaseT > MELT) { st.drop2 = 1; go('gone'); }
    } else if (phase === 'gone') {
      if (phaseT > GONE) {
        hero.classList.remove('is-forgotten', 'is-erased');
        applyQuiet();
        makeCipherField().then((c) => rain.setCipher(c));
        rain.setPlain(plain.data, plain.w, plain.h);
        setStatus('live', 'New key in memory');
        shown = -1;
        st.drop1 = 0;
        go('reform');
      }
    } else if (phase === 'reform') {
      st.drop2 = -(1 - ease(clamp01(phaseT / FORM)));
      st.lensOn = clamp01((phaseT - .9) / .4);
      if (phaseT > FORM + .2) { st.drop2 = 0; go('live'); }
    }
  }

  function loop(now) {
    if (!visible || document.hidden) { running = false; return; }
    const t = now / 1000;
    const dt = Math.min(.25, t - (last || t));
    last = t;
    clockT += dt;
    step(clockT, dt);
    updateLens(clockT, dt);
    rain.draw(clockT);

    // Trade detail for frame rate on weak GPUs, once, never back and forth.
    frames++;
    if (t - fpsT > 1.5) {
      const fps = frames / (t - fpsT);
      frames = 0; fpsT = t;
      // Under ~12 fps the tab itself is being throttled, which says nothing about the GPU.
      slow = fps < 42 && fps > 12 ? slow + 1 : 0;
      if (slow >= 2) {
        slow = 0;
        if (rain.state.depth) rain.state.depth = 0;
        else if (dprCap > .75) { dprCap = dprCap > 1 ? 1 : .75; layout(); }
      }
    }
    requestAnimationFrame(loop);
  }
  function kick() {
    if (running) return;
    running = true; last = 0; fpsT = performance.now() / 1000; frames = 0;
    requestAnimationFrame(loop);
  }

  rain.state.drop1 = rain.state.drop2 = -1;
  intro = createIntro({
    rain, hero,
    start() {
      hero.classList.remove('is-forgotten', 'is-erased');
      shown = -1;
      setStatus('live', 'Key in memory');
      go('intro');
    },
    restore() {
      rain.setPlain(plain.data, plain.w, plain.h);
      applyQuiet();
      rain.state.show = 1;
      rain.state.drop1 = rain.state.drop2 = -1;
      go('form');
    },
  });
  if (shouldPlayIntro()) intro.play();
  document.documentElement.classList.remove('intro-pending');
  document.querySelector('[data-replay]')?.addEventListener('click', () => {
    scrollTo({ top: 0, behavior: 'instant' });
    intro.play();
    kick();
  });
  document.documentElement.classList.add('gl-ready');
  kick();
  if (import.meta.env.DEV) {
    window.__enigma = {
      rain,
      intro,
      skip: (p, at = 0) => { go(p); phaseT = at; },
      advance(seconds) {
        for (let left = seconds; left > 0; left -= .033) { clockT += .033; step(clockT, .033); updateLens(clockT, .033); }
        rain.draw(clockT);
      },
      lensAt(x, y) { lens.pointer = true; lens.tx = lens.x = x / rain.state.cell[0]; lens.ty = lens.y = y / rain.state.cell[1]; },
    };
  }
}
