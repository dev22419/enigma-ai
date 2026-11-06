// AI-assisted: Used Claude to design and write this file.
"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

type Rgb = readonly [number, number, number];

const TILT = -0.1;
const BLUE: Rgb = [2, 151, 222];
const LIT: Rgb = [92, 196, 255];
const MELON: Rgb = [252, 115, 77];
const PEACH: Rgb = [255, 190, 160];
const REST_TIME = 2.2; // the frame shown when the orb isn't animating

const mix = (a: Rgb, b: Rgb, k: number): Rgb => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const clamp = (v: number) => Math.min(1, Math.max(0, v));

/**
 * A sphere of fine vertical ribs, each made of dots, with a dark wave rolling through its middle.
 * Blue on one side, cantaloupe on the other. Below 90px it draws fewer ribs without additive light,
 * otherwise they pile up to white and the colours are lost.
 */
function drawOrb(ctx: CanvasRenderingContext2D, size: number, t: number) {
  const c = size / 2;
  const R = size * 0.47;
  const cosT = Math.cos(TILT);
  const sinT = Math.sin(TILT);
  const small = size < 90;
  const meridians = small ? 34 : 58;
  const points = small ? 34 : 72;
  const spin = t * 0.5;
  const w = small ? size / 62 : size / 135;

  ctx.globalCompositeOperation = small ? "source-over" : "lighter";
  for (let i = 0; i < meridians; i++) {
    const lon = (i / meridians) * Math.PI * 2 + spin;
    const sn = Math.sin(lon);
    const cn = Math.cos(lon);
    // The wave drifts slower than the sphere turns, so the gap rolls and breathes
    const phase = lon - spin * 0.35;
    const crest = -0.1 + 0.2 * Math.sin(phase * 2 + t * 1.15) + 0.08 * Math.sin(phase * 3 - t * 0.7);
    const half = 0.2 + 0.05 * Math.sin(t * 0.8 + phase);

    for (let j = 2; j < points - 1; j++) {
      const lat = -Math.PI / 2 + (j / points) * Math.PI;
      const cl = Math.cos(lat);
      const yy = Math.sin(lat);
      const open = clamp((Math.abs(yy - crest) / half - 0.82) / 0.42);
      if (open <= 0) continue;

      const x = cl * sn;
      const z0 = cl * cn;
      const y = yy * cosT - z0 * sinT;
      const z = yy * sinT + z0 * cosT;
      const depth = (z + 1) / 2;
      const light = Math.pow(depth, 1.5);
      const rim = Math.pow(1 - Math.abs(z), 3);
      // Fades towards the poles, where the meridians crowd together
      const a = Math.min(1, (small ? 0.14 : 0.06) + 1.15 * light + 0.55 * rim) * open * Math.pow(cl, 0.45);
      if (a < 0.02) continue;

      const side = clamp(0.5 + 0.85 * x + 0.24 * Math.sin(t * 0.5));
      const base = side < 0.5 ? mix(LIT, BLUE, side * 2) : mix(BLUE, MELON, Math.pow((side - 0.5) * 2, 0.7));
      const rgb = mix(base, side > 0.62 ? PEACH : LIT, light * light * (small ? 0.12 : 0.35));
      const r = w * (0.5 + 0.9 * depth);
      ctx.fillStyle = `rgba(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0},${a.toFixed(3)})`;
      ctx.fillRect(c + x * R - r / 2, c - y * R - r, r, r * (small ? 1.5 : 2.1));
    }
  }
  ctx.globalCompositeOperation = "source-over";
}

/** The orb. Live ones run at about 30 fps and pause off screen; the rest draw a single frame. */
export function DotOrb({ size, live = true, className }: { size: number; live?: boolean; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const scale = Math.max(devicePixelRatio || 1, 3);
    canvas.width = canvas.height = Math.round(size * scale);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    const paint = (t: number) => {
      ctx.clearRect(0, 0, size, size);
      drawOrb(ctx, size, t);
    };
    if (!live || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      paint(REST_TIME);
      return;
    }

    let raf = 0;
    let last = 0;
    let visible = true;
    const t0 = performance.now() - REST_TIME * 1000;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible || now - last < 33) return;
      last = now;
      paint((now - t0) / 1000);
    };
    paint(REST_TIME);
    raf = requestAnimationFrame(frame);
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [size, live]);

  return <canvas ref={ref} className={cn("block shrink-0", className)} style={{ width: size, height: size }} aria-hidden="true" />;
}

/** The large orb on the empty chat screen. */
export function EnclaveOrb({ className, live = true }: { className?: string; live?: boolean }) {
  return <DotOrb size={92} live={live} className={className} />;
}

/** The small still orb beside each answer. */
export function OrbMark({ className }: { className?: string }) {
  return <DotOrb size={22} live={false} className={className} />;
}
