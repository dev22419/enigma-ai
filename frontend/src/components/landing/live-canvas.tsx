// AI-assisted: Used Claude to write this file.
"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

export type Paint = (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void;

/** A stable 0..1 value per grid cell. */
export function noise(x: number, y: number) {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

/** A small 2D canvas that repaints at about 30 fps, only while on screen. */
export function LiveCanvas({ paint, className }: { paint: Paint; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const latest = useRef(paint);

  useEffect(() => {
    latest.current = paint;
  }, [paint]);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let last = 0;
    let visible = false;
    let w = 0;
    let h = 0;
    const t0 = performance.now();

    const size = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(devicePixelRatio || 1, 2);
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      latest.current(ctx, w, h, t);
    };
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible || now - last < 33) return;
      last = now;
      draw((now - t0) / 1000);
    };

    size();
    const ro = new ResizeObserver(() => {
      size();
      draw(reduce ? 3 : (performance.now() - t0) / 1000);
    });
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(canvas);
    if (reduce) draw(3);
    else raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  return <canvas ref={ref} className={cn("block size-full", className)} aria-hidden="true" />;
}
