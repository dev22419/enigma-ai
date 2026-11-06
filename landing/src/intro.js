// AI-assisted: Used Claude for the landing page visuals and animation
// Opening sequence. Device details are read locally and never leave the page.
const DOSSIER = 4.2, SNAP_END = 8.2, SEAL_START = 8.4, SEAL_END = 10, END = 10.4;
const AGENTS = ['log-archive', 'human-review', 'training-set', 'vendor-agent', 'legal-hold'];
const ALARM_TITLE = 'Your data does not stay with one AI.';
const ALARM_SUB = 'What you send can be logged, reviewed, kept for training and passed to other agents and vendors.';
const SAFE_TITLE = 'Enigma locks it, reads it in an enclave, then forgets it.';
const SAFE_SUB = 'No copy left for anyone else to read. Only a receipt.';

// Fictional records. Braces mark what the agents go for.
const EXPOSED = `DISCHARGE SUMMARY  Patient {Meera Iyer}  Age 54  MRN {HD-2291-774}  Ward 4B  Diagnosis {Type 2 diabetes, CKD stage 3}
Attending Dr {R. Nair}  Medication {Metformin 500 mg}  Insurance policy {SH-55120-88}  Next of kin {Arjun Iyer +91 98XXX 41207}
BANK STATEMENT  Account {0049 2210 7781}  IFSC {HDFC0000412}  Holder {Kaveri Exports Pvt Ltd}  Closing balance {INR 4,18,22,960.14}
Credit facility {INR 12 crore}  Covenant breach flagged {Q3 FY26}  Relationship manager {S. Mehta}  Internal risk grade {B-minus}
MASTER SERVICES AGREEMENT  Harbourline Diagnostics  Fees {INR 18,40,000} per quarter  Auto-renewal {24 months}  Notice {90 days}
Liability cap {twelve months of fees}  Termination for breach  Governing law India  Exclusive jurisdiction {Mumbai}
MERGER MEMO  STRICTLY CONFIDENTIAL  Target {Project Heron}  Offer {INR 86 crore}  Board vote {12 March}  Advisers {not to be disclosed}
Employee list attached  Salary band {L5 INR 42 lakh}  PAN {ABCPK1234L}  Passport {Z1234567}  Home address {14 Marine Lines, Mumbai}
SOURCE CODE  const API_KEY = {"sample_key_not_real_0000"}  db.connect({"postgres://admin:sample@10.0.4.12"})  // prod only
LEGAL HOLD NOTICE  Matter {2026-CV-1187}  Privileged and confidential  Witness statement {draft 3}  Settlement floor {INR 2.4 crore}
`.repeat(5);

function buildPlain(text, width = 132) {
  const lines = text.trimEnd().split('\n');
  const h = lines.length, data = new Uint8Array(width * h * 2);
  for (let i = 0; i < data.length; i += 2) data[i] = 32;
  lines.forEach((line, y) => {
    const chars = [...line, ' ', ' ', ' '];
    let x = 0, flag = 0, k = (y * 17) % 40;
    while (x < width) {
      const ch = chars[k];
      k = (k + 1) % chars.length;
      if (ch === '{') { flag = 255; continue; }
      if (ch === '}') { flag = 0; continue; }
      data[(y * width + x) * 2] = ch.charCodeAt(0) < 128 ? ch.charCodeAt(0) : 32;
      data[(y * width + x) * 2 + 1] = flag;
      x++;
    }
  });
  return { data, w: width, h };
}

function readDevice(gpu) {
  const inner = gpu.match(/ANGLE \([^,]*,\s*([^,]+?)(?:\s*\(0x[0-9A-Fa-f]+\))?\s*(?:Direct3D|OpenGL|Metal|,)/);
  const name = (inner ? inner[1] : gpu).replace(/\(R\)|\(TM\)/g, '').replace(/\s+/g, ' ').trim();
  return [
    ['Time zone', Intl.DateTimeFormat().resolvedOptions().timeZone],
    ['Language', navigator.language],
    ['Screen', `${screen.width} × ${screen.height}`],
    ['Graphics', name],
    ['Processor', navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency} threads` : ''],
  ].filter((r) => r[1]);
}

export function shouldPlayIntro() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  if (new URLSearchParams(location.search).get('intro') === '0' || location.hash) return false;
  try {
    if (sessionStorage.getItem('enigma-intro')) return false;
    sessionStorage.setItem('enigma-intro', '1');
  } catch { /* storage blocked: play it */ }
  return true;
}

export function createIntro({ rain, hero, start, restore }) {
  const root = hero.querySelector('.intro');
  const $ = (k) => root.querySelector(`[data-i="${k}"]`);
  const st = rain.state;
  const exposed = buildPlain(EXPOSED);
  let playing = false, snapped = false, safe = false, tags = [], spots = [], sealed = [], lastNum = -1;

  const place = (i, hop) => {
    const [gx, gy] = st.grid;
    const narrow = gx < 60, w = narrow ? 18 : 26, h = 5;
    const minX = narrow ? 1 : Math.floor(gx * .44);
    const x = minX + Math.floor(Math.random() * Math.max(1, gx - minX - w - 1));
    // Each agent keeps its own lane so the labels never stack.
    const span = (narrow ? gy * .42 : gy - h - 16) - 4;
    const y = 4 + Math.floor(span * i / AGENTS.length);
    spots[i] = { x, y, w, h, hop };
  };

  function finish() {
    if (!playing) return;
    playing = false;
    root.hidden = true;
    document.documentElement.classList.remove('intro-on');
    removeEventListener('keydown', finish);
    removeEventListener('wheel', finish);
    st.alarm = 0; st.flash = 0; st.fade = 1; st.seal = -20;
    st.agents.fill(-99);
    restore();
  }
  root.querySelector('.intro-skip').addEventListener('click', finish);

  function setQuiet(a, b) {
    const r = hero.getBoundingClientRect();
    const box = (n) => { const q = n.getBoundingClientRect(); return [q.left - r.left, q.top - r.top, q.right - r.left, q.bottom - r.top]; };
    st.quiet = [...box(a), ...box(b), -999, -999, -999, -999];
  }

  function play() {
    if (playing) return;
    playing = true; snapped = false; safe = false; lastNum = -1;
    document.documentElement.classList.add('intro-on');
    root.hidden = false; root.dataset.stage = 'dossier';

    const list = $('facts');
    list.replaceChildren(...readDevice(rain.gpu).map(([k, v]) => {
      const row = document.createElement('div');
      const dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = k; dd.textContent = v;
      row.append(dt, dd);
      return row;
    }));
    $('bridge').classList.remove('is-in');
    $('title').textContent = ALARM_TITLE; $('sub').textContent = ALARM_SUB;
    $('flag').textContent = 'Warning'; $('num').textContent = '1';

    tags = AGENTS.map((name) => {
      const t = document.createElement('span');
      t.className = 'intro-tag'; t.hidden = true; t.textContent = `${name} reading`;
      return t;
    });
    $('tags').replaceChildren(...tags);
    spots = []; sealed = [];

    st.show = 0; st.fade = 0; st.alarm = 0; st.seal = -20; st.lensOn = 0; st.drop1 = st.drop2 = -1;
    rain.setPlain(exposed.data, exposed.w, exposed.h);
    addEventListener('keydown', finish);
    addEventListener('wheel', finish, { passive: true });
    start();
  }

  function setCount(n) {
    if (n !== lastNum) { lastNum = n; $('num').textContent = n; }
  }

  function update(t, dt) {
    $('secs').textContent = Math.min(t, DOSSIER).toFixed(1);
    if (t < DOSSIER) {
      [...$('facts').children].forEach((row, i) => row.classList.toggle('is-in', t > .55 + i * .38));
      $('bridge').classList.toggle('is-in', t > 2.75);
      return;
    }
    if (!snapped) {
      snapped = true;
      root.dataset.stage = 'alarm';
      st.alarm = 1; st.fade = 1; st.flash = 1;
      setQuiet($('alarm'), $('count'));
      hero.classList.add('is-shaking');
      setTimeout(() => hero.classList.remove('is-shaking'), 340);
    }
    st.flash *= Math.exp(-dt * 6);

    // Agents arrive one by one and hop between records.
    AGENTS.forEach((_, i) => {
      if (t < DOSSIER + .55 + i * .42 || sealed[i]) return;
      const hop = Math.floor((t - DOSSIER) / (.52 + i * .07));
      if (!spots[i] || spots[i].hop !== hop) place(i, hop);
      const s = spots[i];
      st.agents.splice(i * 4, 4, s.x, s.y, s.x + s.w, s.y + s.h);
      tags[i].hidden = false;
      tags[i].style.transform = `translate(${s.x * st.cell[0]}px, ${(s.y - 1) * st.cell[1]}px)`;
    });

    if (t < SEAL_START) {
      const k = Math.min(1, (t - DOSSIER - .3) / (SNAP_END - DOSSIER - .3));
      setCount(Math.max(1, Math.round(1 + 22 * k * k)));
    }
    if (t >= SNAP_END && !safe) {
      safe = true;
      root.dataset.stage = 'safe';
      $('flag').textContent = 'Enigma';
      $('title').textContent = SAFE_TITLE;
      $('sub').textContent = SAFE_SUB;
    }
    if (t >= SEAL_START) {
      const k = Math.min(1, (t - SEAL_START) / (SEAL_END - SEAL_START));
      st.seal = -8 + k * k * (3 - 2 * k) * (st.grid[1] + 18);
      AGENTS.forEach((name, i) => {
        const s = spots[i];
        if (!s || sealed[i] || st.seal < s.y) return;
        sealed[i] = true;
        st.agents.splice(i * 4, 4, -99, -99, -99, -99);
        tags[i].textContent = `${name} locked out`;
        tags[i].classList.add('is-out');
      });
      setCount(Math.round(23 * (1 - k)));
    }
    if (t >= END) finish();
  }

  // Resizes during the alarm must keep the warning's quiet zones, not the hero's.
  function refreshQuiet() {
    if (!playing || !snapped) return false;
    setQuiet($('alarm'), $('count'));
    return true;
  }

  return { play, update, refreshQuiet, skip: finish };
}
