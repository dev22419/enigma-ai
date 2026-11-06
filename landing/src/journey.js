// AI-assisted: Used Claude for the landing page visuals and animation
// How it works, as one large line diagram driven by scroll. Same visual language as the
// comparison diagram: a file, a sealed room, two outcomes. Scrolling back rewinds it.
const INK = '#ECF1EA', DIM = '#8C9C93', GREEN = '#4FEA92', LINE = 'rgba(236,241,234,.2)', BLACK = '#050807';
const SANS = '"Enigma Sans",Arial,sans-serif';

const clamp = (x) => Math.min(1, Math.max(0, x));
const seg = (p, a, b) => clamp((p - a) / (b - a));
const ease = (x) => x * x * (3 - 2 * x);
const lerp = (a, b, k) => a + (b - a) * k;
const bez = (a, b, c, d, t) => {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
};

export async function startJourney() {
  const root = document.querySelector('.journey');
  if (!root) return;
  const canvas = root.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const items = [...root.querySelectorAll('.jstep')];
  const fill = root.querySelector('.jsteps i');
  const levels = [...root.querySelectorAll('.level button')];
  const list = root.querySelector('.jsteps');

  levels.forEach((b) => b.addEventListener('click', () => {
    list.dataset.show = b.dataset.level;
    levels.forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
  }));

  let W = 0, H = 0, G = null;

  function layout() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const s = Math.min(H * .46, W * .2, 190), y = H * .5;
    const k = s / 190;
    G = {
      s, y, k,
      file: { x: W * .11, w: 74 * k + 20, h: 92 * k + 24 },
      room: { x: W * .47 },
      answer: { x: W * .86, y: y - s * .72 },
      receipt: { x: W * .86, y: y + s * .72 },
    };
  }

  const label = (s, x, y, color, font) => {
    ctx.font = font; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(s, x, y);
  };

  function line(x1, y1, x2, y2, color, width = 1.5) {
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }

  // Part of a curve, so a path can draw itself as the dot travels along it.
  function curve(c, t, color, width = 1.5) {
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const k = (i / 40) * t, x = bez(c[0], c[2], c[4], c[6], k), y = bez(c[1], c[3], c[5], c[7], k);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
  }

  function fileIcon(x, y, w, h, sealed, alpha) {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = sealed > .5 ? '#0C1110' : '#FFFFFF';
    ctx.strokeStyle = sealed > .5 ? GREEN : INK; ctx.lineWidth = 2;
    ctx.fillRect(x - w / 2, y - h / 2, w, h); ctx.strokeRect(x - w / 2, y - h / 2, w, h);
    [.62, .62, .4].forEach((l, i) => {
      const ly = y - h * .22 + i * h * .22;
      line(x - w * .3, ly, x - w * .3 + w * l, ly, sealed > .5 ? GREEN : '#59605B', 2.5);
    });
    ctx.restore();
  }

  function padlock(x, y, a, k) {
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a; ctx.translate(x, y); ctx.scale(k, k);
    ctx.strokeStyle = GREEN; ctx.fillStyle = GREEN; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, -8, 8, Math.PI, 0); ctx.stroke();
    ctx.fillRect(-12, -8, 24, 18);
    ctx.restore();
  }

  function draw(p, t) {
    ctx.clearRect(0, 0, W, H);
    const { s, y, k, file, room, answer, receipt } = G;
    const title = `600 ${Math.max(14, 17 * k)}px ${SANS}`, sub = `${Math.max(12, 14 * k)}px ${SANS}`;

    const lock = ease(seg(p, .04, .18));
    const go = ease(seg(p, .22, .38));
    const inside = seg(p, .38, .42);
    const read = seg(p, .42, .56);
    const out = ease(seg(p, .56, .7));
    const wiped = seg(p, .74, .8);
    const timer = seg(p, .76, .88);
    const gone = seg(p, .88, .95);
    const end = seg(p, .95, 1);

    const left = room.x - s / 2, right = room.x + s / 2, r = 34 * k + 8;
    const cA = [right, y - s * .22, right + (answer.x - right) * .5, y - s * .22, right + (answer.x - right) * .4, answer.y, answer.x - r - 16, answer.y];
    const cR = [right, y + s * .22, right + (receipt.x - right) * .5, y + s * .22, right + (receipt.x - right) * .4, receipt.y, receipt.x - r * 1.1 - 6, receipt.y];

    // Paths
    line(file.x + file.w / 2, y, left, y, LINE);
    if (go > 0) line(file.x + file.w / 2, y, lerp(file.x + file.w / 2, left, go), y, GREEN, 2);
    curve(cA, 1, LINE); curve(cR, 1, LINE);
    if (out > 0) { curve(cA, out, `rgba(79,234,146,${.9 * (1 - gone)})`, 2); curve(cR, out, GREEN, 2); }

    // File
    const fx = lerp(file.x, left - file.w * .1, go), fScale = 1 - .6 * go;
    fileIcon(fx, y, file.w * fScale, file.h * fScale, lock, 1 - inside);
    padlock(fx + file.w * fScale * .34, y - file.h * fScale * .5, seg(p, .14, .18) * (1 - inside), .8 * Math.max(k, .7));
    if (go > .05) {
      ctx.setLineDash([5, 6]); ctx.strokeStyle = LINE; ctx.lineWidth = 1.5;
      ctx.strokeRect(file.x - file.w / 2, y - file.h / 2, file.w, file.h); ctx.setLineDash([]);
    }
    label(go > .1 ? 'Uploaded' : lock > .5 ? 'Locked' : 'Your file', file.x, y + file.h / 2 + 30, go > .1 ? DIM : INK, title);

    // Enclave
    const active = inside * (1 - wiped);
    ctx.fillStyle = '#0C1110'; ctx.fillRect(left, y - s / 2, s, s);
    ctx.strokeStyle = active > .5 ? GREEN : 'rgba(236,241,234,.42)';
    ctx.lineWidth = active > .5 ? 3 : 1.5;
    ctx.strokeRect(left, y - s / 2, s, s);
    if (active > 0) {
      ctx.globalAlpha = active;
      for (let i = 0; i < 5; i++) {
        const ly = y - s * .24 + i * s * .12;
        line(left + s * .2, ly, left + s * (i === 2 ? .62 : .8), ly, i === 2 && read > .5 ? GREEN : 'rgba(236,241,234,.55)', 2.5);
      }
      if (read > 0 && read < 1) {
        const sy = y - s * .32 + read * s * .64;
        line(left + s * .1, sy, right - s * .1, sy, GREEN, 2);
      }
      ctx.globalAlpha = 1;
    }
    if (wiped > 0) { ctx.globalAlpha = wiped * (1 - end); label('Key destroyed', room.x, y + 5, DIM, sub); ctx.globalAlpha = 1; }
    label('Enclave', room.x, y - s / 2 - 28, active > .5 ? GREEN : INK, title);
    label('0G', room.x, y - s / 2 - 8, DIM, sub);
    if (inside > 0 && wiped < 1) {
      ctx.globalAlpha = inside * (1 - wiped);
      label('Sealed from the operator', room.x, y + s / 2 + 30, DIM, sub);
      ctx.globalAlpha = 1;
    }

    // Travelling dots
    if (out > 0 && out < 1) {
      for (const c of [cA, cR]) {
        ctx.fillStyle = GREEN; ctx.beginPath();
        ctx.arc(bez(c[0], c[2], c[4], c[6], out), bez(c[1], c[3], c[5], c[7], out), 6, 0, 7); ctx.fill();
      }
    }

    // Answer: a page with a countdown ring around it
    const aOn = seg(p, .68, .72);
    if (aOn > 0 && gone < 1) {
      ctx.globalAlpha = aOn * (1 - gone);
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(answer.x - r * .42, answer.y - r * .52, r * .84, r * 1.04);
      [0, 1, 2].forEach((i) => {
        const ly = answer.y - r * .24 + i * r * .24;
        line(answer.x - r * .26, ly, answer.x + r * (i === 2 ? .04 : .26), ly, '#59605B', 2);
      });
      ctx.strokeStyle = LINE; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(answer.x, answer.y, r + 8, 0, 7); ctx.stroke();
      ctx.strokeStyle = GREEN; ctx.beginPath(); ctx.arc(answer.x, answer.y, r + 8, -Math.PI / 2, -Math.PI / 2 + (1 - timer) * Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (aOn === 0 || gone > 0) {
      ctx.setLineDash([5, 6]); ctx.strokeStyle = gone > 0 ? 'rgba(255,120,100,.55)' : LINE; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(answer.x, answer.y, r + 8, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    }
    label(gone > .5 ? 'Gone' : 'Answer', answer.x, answer.y - r - 42 + 4, gone > .5 ? '#FF8E7A' : aOn > 0 ? INK : DIM, title);
    label('Arkiv', answer.x, answer.y - r - 18, DIM, sub);

    // Receipt: the one thing that stays
    const b = r * 1.1;
    if (aOn < 1) {
      ctx.setLineDash([5, 6]); ctx.strokeStyle = LINE; ctx.lineWidth = 1.5;
      ctx.strokeRect(receipt.x - b, receipt.y - b * .7, b * 2, b * 1.4); ctx.setLineDash([]);
    }
    if (aOn > 0) {
      if (end > 0) {
        ctx.strokeStyle = `rgba(79,234,146,${end * (.5 + .3 * Math.sin(t * 3))})`; ctx.lineWidth = 2;
        ctx.strokeRect(receipt.x - b - 9, receipt.y - b * .7 - 9, b * 2 + 18, b * 1.4 + 18);
      }
      ctx.globalAlpha = aOn;
      ctx.fillStyle = GREEN; ctx.fillRect(receipt.x - b, receipt.y - b * .7, b * 2, b * 1.4);
      line(receipt.x - b * .5, receipt.y - b * .18, receipt.x + b * .5, receipt.y - b * .18, BLACK, 2.5);
      line(receipt.x - b * .5, receipt.y + b * .16, receipt.x + b * .2, receipt.y + b * .16, BLACK, 2.5);
      ctx.globalAlpha = 1;
    }
    label(end > .4 ? 'Only this remains' : 'Receipt', receipt.x, receipt.y + b * .7 + 28, end > .4 ? GREEN : aOn > 0 ? INK : DIM, title);
    label('Whitechain', receipt.x, receipt.y + b * .7 + 48, DIM, sub);
  }

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let target = 0, cur = 0, visible = false, running = false, last = 0;

  function sync(p) {
    const i = p < .22 ? 0 : p < .56 ? 1 : p < .74 ? 2 : 3;
    items.forEach((b, n) => b.setAttribute('aria-current', String(n === i)));
    fill.style.transform = `scaleX(${p})`;
  }

  function frame(now) {
    if (!visible) { running = false; return; }
    const t = now / 1000, dt = Math.min(.1, t - (last || t));
    last = t;
    const r = root.getBoundingClientRect();
    target = clamp(-r.top / (r.height - innerHeight));
    cur = reduce ? target : cur + (target - cur) * (1 - Math.exp(-dt * 10));
    draw(cur, t);
    sync(cur);
    requestAnimationFrame(frame);
  }

  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && !running) { running = true; last = 0; requestAnimationFrame(frame); }
  }).observe(root);
  new ResizeObserver(() => { layout(); draw(cur, 0); }).observe(canvas);
  await document.fonts.load(`600 17px ${SANS}`);
  layout();
  draw(0, 0);
  sync(0);

  const stops = [.14, .5, .68, .96];
  items.forEach((b, i) => b.addEventListener('click', () => {
    const r = root.getBoundingClientRect();
    scrollTo({ top: scrollY + r.top + stops[i] * (r.height - innerHeight) });
  }));

  if (import.meta.env.DEV) window.__journey = (p) => { cur = target = p; draw(p, 1); sync(p); };
}
