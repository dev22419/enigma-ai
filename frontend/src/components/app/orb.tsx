// AI-assisted: Used Claude to write this file. The orb's motion is the `composing` state of thinking-orbs (MIT).
"use client";

import { useEffect, useRef } from "react";
import { MODE_FRAMES, resolvePreset, type OrbFrame } from "thinking-orbs/engine";

import { cn } from "@/lib/utils";

type Rgb = readonly [number, number, number];

const TEAL: Rgb = [53, 184, 173];
const LIT: Rgb = [127, 220, 210];
const ORCHID: Rgb = [229, 156, 244];
const PETAL: Rgb = [242, 200, 248];
const REST_TIME = 0.6; // the frame thinking-orbs shows for reduced motion

const mix = (a: Rgb, b: Rgb, k: number): Rgb => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const clamp = (v: number) => Math.min(1, Math.max(0, v));

/**
 * The package only paints in one ink, so its dots are painted here instead: position, size and depth come
 * straight from the engine, and colour runs from Electric Blue on the left to orchid on the right.
 * `white` is the engine's ink value: 0 is the nearest, brightest dot on a dark background.
 */
function paintFrame(ctx: CanvasRenderingContext2D, frame: OrbFrame, design: number, t: number) {
  const drift = 0.14 * Math.sin(t * 0.5);
  for (const d of frame.dots) {
    const near = 1 - d.white;
    const side = clamp(0.5 + (d.x / design - 0.5) * 1.5 + drift);
    const base = side < 0.5 ? mix(LIT, TEAL, side * 2) : mix(TEAL, ORCHID, Math.pow((side - 0.5) * 2, 0.75));
    const lit = mix(base, side > 0.6 ? PETAL : LIT, near * near * 0.42);
    const k = 0.5 + 0.5 * Math.sqrt(near);
    ctx.globalAlpha = d.a ?? 1;
    ctx.fillStyle = `rgb(${(lit[0] * k) | 0},${(lit[1] * k) | 0},${(lit[2] * k) | 0})`;
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** The orb. Live ones pause off screen; the rest draw a single frame. */
export function DotOrb({ size, live = true, className }: { size: number; live?: boolean; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    // The package ships two tuned designs, so draw the nearest one and scale it
    const design = size < 32 ? 20 : 64;
    const { mode, speed, opts } = resolvePreset("composing", design);
    const scale = Math.max(devicePixelRatio || 1, 2);
    canvas.width = canvas.height = Math.round(size * scale);

    const draw = (t: number) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform((size * scale) / design, 0, 0, (size * scale) / design, 0, 0);
      paintFrame(ctx, MODE_FRAMES[mode](design, t, opts), design, t);
    };

    if (!live || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      draw(REST_TIME);
      return;
    }

    let raf = 0;
    let running = false;
    const loop = () => {
      draw((performance.now() / 1000) * speed);
      if (running) raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    draw((performance.now() / 1000) * speed);
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? start() : stop()));
    io.observe(canvas);
    return () => {
      stop();
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
