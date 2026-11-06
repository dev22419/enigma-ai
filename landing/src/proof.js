// AI-assisted: Used Claude for the landing page visuals and animation
import { SAMPLE_DOC, sha256Hex, toHex } from './crypto.js';

const MAX_BYTES = 25 * 1024 * 1024;

// Everything here is real and local: nothing on this page makes a network request with the file.
export function startProof() {
  const root = document.querySelector('.proof-desk');
  if (!root) return;
  const $ = (s) => root.querySelector(s);

  const input = $('#proof-file');
  const drop = $('.drop');
  const ttlButtons = [...root.querySelectorAll('[data-ttl]')];
  const view = {
    name: $('[data-v="name"]'), size: $('[data-v="size"]'), hash: $('[data-v="hash"]'),
    cipher: $('[data-v="cipher"]'), key: $('[data-v="key"]'), attempt: $('[data-v="attempt"]'),
    clock: $('[data-v="clock"]'), bar: $('[data-v="bar"]'), body: $('[data-v="body"]'),
    verdict: $('[data-v="verdict"]'),
  };

  let ttl = 15, timer = 0, receipt = null, live = null;

  ttlButtons.forEach((b) => b.addEventListener('click', () => {
    ttl = Number(b.dataset.ttl);
    ttlButtons.forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
  }));

  function setStage(s) { root.dataset.stage = s; }

  function readable(bytes) {
    const head = bytes.subarray(0, 2600);
    if (head.includes(0)) return null;
    try { return new TextDecoder('utf-8', { fatal: true }).decode(head); }
    catch { return null; }
  }

  function preview(bytes) {
    const text = readable(bytes);
    if (text) return text.replace(/[{}]/g, '');
    const hex = toHex(bytes.subarray(0, 900)).replace(/(.{2})/g, '$1 ').replace(/(.{72})/g, '$1\n');
    return `Binary file, first bytes:\n\n${hex}`;
  }

  async function run(name, bytes) {
    clearInterval(timer);
    view.verdict.textContent = '';
    // A second drop during the receipt stage is a verification, not a new job.
    if (root.dataset.stage === 'receipt' && receipt) return verify(name, bytes);

    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const t0 = performance.now();
    const hash = await sha256Hex(bytes);
    const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
    const ms = performance.now() - t0;

    live = { key, iv, cipher };
    view.name.textContent = name;
    view.size.textContent = `${bytes.length.toLocaleString('en-IN')} bytes`;
    view.hash.textContent = hash;
    view.cipher.textContent = `${cipher.length.toLocaleString('en-IN')} bytes in ${ms.toFixed(1)} ms · iv ${toHex(iv)}`;
    view.key.textContent = 'In memory, non-extractable';
    view.attempt.textContent = 'Not attempted';
    view.body.textContent = preview(bytes);
    view.body.dataset.state = 'live';
    setStage('live');

    const end = performance.now() + ttl * 1000;
    const tick = () => {
      const left = Math.max(0, end - performance.now());
      view.clock.textContent = `00:${String(Math.ceil(left / 1000)).padStart(2, '0')}`;
      view.bar.style.transform = `scaleX(${left / (ttl * 1000)})`;
      if (left === 0) { clearInterval(timer); expire({ name, size: bytes.length, hash }); }
    };
    tick();
    timer = setInterval(tick, 100);
  }

  async function expire(meta) {
    const { iv, cipher } = live;
    live = null;
    receipt = { ...meta, at: new Date() };
    view.key.textContent = 'Destroyed';

    // Overwrite the visible copy one character at a time, in random order.
    const chars = [...view.body.textContent];
    const order = chars.map((_, i) => i).filter((i) => chars[i].trim()).sort(() => Math.random() - .5);
    const chunk = Math.max(1, Math.ceil(order.length / 45));
    await new Promise((done) => {
      const id = setInterval(() => {
        order.splice(0, chunk).forEach((i) => { chars[i] = ' '; });
        view.body.textContent = chars.join('');
        if (!order.length) { clearInterval(id); done(); }
      }, 30);
    });
    view.body.textContent = '';
    view.body.dataset.state = 'gone';

    // A real decrypt against the real ciphertext, using the only thing left: a different key.
    try {
      const other = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['decrypt']);
      await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, other, cipher);
      view.attempt.textContent = 'Decrypted';
    } catch (e) {
      view.attempt.textContent = `Failed: ${e.name}. The bytes are noise now.`;
    }
    setStage('receipt');
  }

  async function verify(name, bytes) {
    const hash = await sha256Hex(bytes);
    const match = hash === receipt.hash;
    view.verdict.dataset.ok = String(match);
    view.verdict.textContent = match
      ? `${name} matches the receipt. The file was never stored, and it can still be proven.`
      : `${name} does not match this receipt. Different content, different hash.`;
  }

  async function take(file) {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      root.querySelector('[data-v="dropsub"]').textContent = `${file.name} is over the 25 MB limit. Try a smaller file.`;
      return;
    }
    run(file.name, new Uint8Array(await file.arrayBuffer()));
  }

  input.addEventListener('change', () => { take(input.files[0]); input.value = ''; });
  $('[data-a="sample"]').addEventListener('click', () => {
    run('harbourline-msa.txt', new TextEncoder().encode(SAMPLE_DOC));
  });
  $('[data-a="again"]').addEventListener('click', () => {
    receipt = null;
    view.verdict.textContent = '';
    setStage('idle');
  });
  $('[data-a="reverify"]').addEventListener('click', () => {
    if (receipt?.name === 'harbourline-msa.txt') verify(receipt.name, new TextEncoder().encode(SAMPLE_DOC));
    else input.click();
  });

  ['dragenter', 'dragover'].forEach((e) => root.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach((e) => root.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.remove('is-over'); }));
  root.addEventListener('drop', (ev) => take(ev.dataTransfer.files[0]));
}
