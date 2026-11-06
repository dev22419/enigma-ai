// AI-assisted: Used Claude to write this file.
"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";

import { burnPlan, MAX_TIMER_MS } from "@/lib/burn-plan";

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth noise, for the ragged edge of the fire. */
function noise(seed: number) {
  const r = rng(seed);
  const N = 128;
  const lattice = new Float32Array(N * N).map(() => r());
  const at = (x: number, y: number) => lattice[(y & (N - 1)) * N + (x & (N - 1))];
  const one = (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const u = smooth(x - xi);
    const v = smooth(y - yi);
    return mix(mix(at(xi, yi), at(xi + 1, yi), u), mix(at(xi, yi + 1), at(xi + 1, yi + 1), u), v);
  };
  return (x: number, y: number) => one(x, y) * 0.55 + one(x * 2.1, y * 2.1) * 0.3 + one(x * 4.3, y * 4.3) * 0.15;
}

/** Paints the real text, letter by letter, exactly where it sits on the page. */
function snapshot(content: HTMLElement, W: number, H: number, dpr: number) {
  const origin = content.getBoundingClientRect();
  const src = document.createElement("canvas");
  src.width = W * dpr;
  src.height = H * dpr;
  const ctx = src.getContext("2d")!;
  ctx.scale(dpr, dpr);

  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const cs = getComputedStyle(node.parentElement!);
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    ctx.fillStyle = cs.color;
    const m = ctx.measureText("x");
    const ascent = m.fontBoundingBoxAscent;
    const descent = m.fontBoundingBoxDescent;
    const text = node.textContent ?? "";
    for (let i = 0; i < text.length; i++) {
      if (!text[i].trim()) continue;
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const b = range.getBoundingClientRect();
      ctx.fillText(text[i], b.left - origin.left, b.top - origin.top + (b.height - ascent - descent) / 2 + ascent);
    }
  }

  // List bullets are empty spans, not text
  for (const dot of content.querySelectorAll<HTMLElement>("span:empty")) {
    const b = dot.getBoundingClientRect();
    ctx.fillStyle = getComputedStyle(dot).backgroundColor;
    ctx.beginPath();
    ctx.arc(b.left - origin.left + b.width / 2, b.top - origin.top + b.height / 2, b.width / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  return src;
}

/** Sets the fire up over the content and returns one function that draws any moment of it. */
function prepare(content: HTMLElement, canvas: HTMLCanvasElement) {
  const box = content.getBoundingClientRect();
  const W = Math.ceil(box.width);
  const H = Math.ceil(box.height);
  if (!W || !H) return null;

  const dpr = W * H > 800_000 ? 1 : Math.min(devicePixelRatio || 1, 2);
  const src = snapshot(content, W, H, dpr);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // The fire works at a lower resolution on long answers, so a long answer burns as smoothly as a short one
  const k = Math.min(1, Math.sqrt(260_000 / (W * H)));
  const mw = Math.max(1, Math.round(W * k));
  const mh = Math.max(1, Math.round(H * k));

  // Every pixel gets the moment it burns: from the top, where the fuse dies, with a ragged edge of a fixed height
  const nz = noise(23);
  const rag = Math.min(0.34, 70 / H);
  const burnsAt = new Float32Array(mw * mh);
  for (let y = 0, i = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++, i++) {
      const px = x / k;
      const py = y / k;
      burnsAt[i] = clamp((1 - rag - 0.12) * (py / H) + 0.12 * (px / W) + rag * nz(px / 34, py / 26) - 0.03);
    }
  }

  const layer = () => {
    const c = document.createElement("canvas");
    c.width = mw;
    c.height = mh;
    const g = c.getContext("2d")!;
    return { c, g, img: g.createImageData(mw, mh) };
  };
  const mask = layer();
  const rim = layer();
  const band = clamp(3 / (0.64 * H), 0.004, 0.03);
  const soft = band * 2;

  const r = rng(5);
  const embers = Array.from({ length: Math.round(clamp((W * H) / 2000, 60, 220)) }, () => {
    const x = r() * mw;
    const y = r() * mh;
    return {
      x: x / k,
      y: y / k,
      at: burnsAt[Math.floor(y) * mw + Math.floor(x)],
      vx: (r() - 0.5) * 34,
      vy: -18 - r() * 44,
      life: 0.5 + r() * 0.5,
      size: 0.7 + r() * 1.1,
    };
  });

  return (sec: number, total: number) => {
    // The front finishes early, so the last embers can fade before the key goes
    const span = total * 0.86;
    const p = mix(-0.04, 1.03, clamp(sec / span));

    const m = mask.img.data;
    const e = rim.img.data;
    for (let i = 0, j = 3; i < burnsAt.length; i++, j += 4) {
      const d = burnsAt[i] - p;
      m[j] = clamp(d / soft) * 255;
      const near = 1 - Math.abs(d) / band;
      if (near <= 0) {
        e[j] = 0;
        continue;
      }
      const heat = near * near;
      e[j - 3] = mix(229, 255, heat);
      e[j - 2] = mix(156, 238, heat);
      e[j - 1] = mix(244, 205, heat);
      e[j] = heat * 255;
    }
    mask.g.putImageData(mask.img, 0, 0);
    rim.g.putImageData(rim.img, 0, 0);

    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(src, 0, 0, W, H);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(mask.c, 0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = clamp((1.03 - p) * 12);
    ctx.filter = "blur(9px)";
    ctx.drawImage(rim.c, 0, 0, W, H);
    ctx.filter = "none";
    ctx.drawImage(rim.c, 0, 0, W, H);
    for (const em of embers) {
      const age = sec - ((em.at + 0.04) / 1.07) * span;
      if (age < 0 || age > em.life) continue;
      const fade = age / em.life;
      ctx.fillStyle = fade < 0.45 ? "#ffeecd" : "#e59cf4";
      ctx.globalAlpha = 1 - fade;
      ctx.fillRect(em.x + em.vx * age + Math.sin(age * 7 + em.x) * 3, em.y + em.vy * age, em.size, em.size);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  };
}

/**
 * Burns an answer away in the last seconds of its lifespan. It starts early so the fire ends as the key is
 * wiped: the answer is never kept around after the key to play an animation.
 */
export function BurnAway({ expiresAt, className, children }: { expiresAt: number | null | undefined; className?: string; children: ReactNode }) {
  const content = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!expiresAt || reduce) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let raf = 0;
    const el = content.current;
    const c = canvas.current;

    const arm = () => {
      const plan = burnPlan(expiresAt - Date.now());
      if (!plan || !el || !c) return;
      if (plan.wait > 0) {
        timer = setTimeout(arm, Math.min(plan.wait, MAX_TIMER_MS));
        return;
      }
      if (document.hidden) return;
      const draw = prepare(el, c);
      if (!draw) return;
      draw(0, plan.ms / 1000);
      el.style.visibility = "hidden";
      const start = performance.now();
      const tick = (time: number) => {
        const ms = Math.max(0, time - start);
        draw(ms / 1000, plan.ms / 1000);
        if (ms < plan.ms) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    arm();

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
      if (el) el.style.visibility = "";
      // Drops the picture of the text along with the text itself
      if (c) c.width = 0;
    };
  }, [expiresAt, reduce]);

  return (
    <div className="relative">
      <div ref={content} className={className}>
        {children}
      </div>
      <canvas ref={canvas} className="pointer-events-none absolute top-0 left-0" width={0} height={0} aria-hidden="true" />
    </div>
  );
}
