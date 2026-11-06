// AI-assisted: Used Claude for the landing page visuals and animation
// Page-wide motion: headings decrypt into place, blocks reveal, numbers count, mini demos loop.
const POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

function decrypt(el) {
  const words = [...el.querySelectorAll('.w')];
  const t0 = performance.now(), dur = 620;
  const frame = (now) => {
    const k = Math.min(1, (now - t0) / dur);
    for (const w of words) {
      const real = w.dataset.t;
      let out = '';
      for (let i = 0; i < real.length; i++) {
        const at = (Number(w.dataset.i) * 3 + i) / (el.dataset.len || 40);
        out += k >= at * .75 + .25 ? real[i] : POOL[Math.floor(Math.random() * POOL.length)];
      }
      w.textContent = out;
    }
    if (k < 1) requestAnimationFrame(frame);
    else for (const w of words) w.textContent = w.dataset.t;
  };
  requestAnimationFrame(frame);
}

function prepareDecrypt(el) {
  const text = el.textContent.trim();
  el.setAttribute('aria-label', text);
  el.dataset.len = text.length;
  el.textContent = '';
  text.split(' ').forEach((word, i) => {
    const s = document.createElement('span');
    s.className = 'w'; s.textContent = word; s.dataset.t = word; s.dataset.i = i;
    s.setAttribute('aria-hidden', 'true');
    el.append(s, ' ');
  });
  // Lock each word's width so scrambling never rewraps the heading.
  for (const s of el.querySelectorAll('.w')) s.style.width = `${s.getBoundingClientRect().width + .5}px`;
}

function countUp(el) {
  const to = Number(el.dataset.count), dec = Number(el.dataset.dec || 0), t0 = performance.now();
  const fmt = (v) => `${el.dataset.pre || ''}${v.toFixed(dec)}${el.dataset.post || ''}`;
  const frame = (now) => {
    const k = Math.min(1, (now - t0) / 1100), e = 1 - (1 - k) ** 3;
    el.textContent = fmt(to * e);
    if (k < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

export function startFx() {
  const decrypts = [...document.querySelectorAll('[data-decrypt]')];
  document.fonts.ready.then(() => {
    if (!reduce) decrypts.forEach(prepareDecrypt);
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        e.target.classList.add('is-in');
        if (!reduce && e.target.hasAttribute('data-decrypt')) decrypt(e.target);
        if (!reduce && e.target.dataset.count) countUp(e.target);
      }
    }, { rootMargin: '0px 0px -12% 0px' });
    document.querySelectorAll('[data-decrypt],[data-reveal],[data-count]').forEach((el) => io.observe(el));
  });

  // Pause diagram loops while they are off screen.
  document.querySelectorAll('.flow svg, .tile svg').forEach((flow) => {
    if (reduce) flow.pauseAnimations();
    else new IntersectionObserver(([e]) => (e.isIntersecting ? flow.unpauseAnimations() : flow.pauseAnimations())).observe(flow);
  });
}
