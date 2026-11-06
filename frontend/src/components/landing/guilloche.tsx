// AI-assisted: Used Claude to design and write this canvas animation.
"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

/**
 * Guilloche: the engraved interlaced line pattern on banknotes and certificates,
 * printed precisely because it is hard to copy.
 *
 * "rosette" draws a slowly breathing medallion that leans toward the pointer.
 * "band" draws a horizontal ribbon, used as a certificate border.
 * Pure 2D canvas: ~30fps, DPR capped at 2, paused offscreen, static for reduced motion.
 */
type Props = {
  variant?: "rosette" | "band";
  color?: string;
  accent?: string;
  className?: string;
  /** Rosette centre and radius as fractions of the canvas; overridden on narrow screens. */
  cx?: number;
  cy?: number;
  size?: number;
  animate?: boolean;
};

export function Guilloche({
  variant = "rosette",
  color = "rgba(223,231,255,0.22)",
  accent = "rgba(255,205,60,0.55)",
  className,
  cx = 0.76,
  cy = 0.46,
  size = 0.42,
  animate = true,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches || !animate;
    let w = 0;
    let h = 0;
    let raf = 0;
    let last = 0;
    let visible = true;
    // Pointer lean, eased
    let tx = 0;
    let ty = 0;
    let lx = 0;
    let ly = 0;
    const t0 = performance.now();

    function layout() {
      if (!canvas || !parent || !ctx) return;
      const r = parent.getBoundingClientRect();
      w = r.width;
      h = r.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function rosette(t: number) {
      if (!ctx) return;
      const narrow = w < 768;
      const ox = (narrow ? 0.82 : cx) * w + lx;
      const oy = (narrow ? 0.2 : cy) * h + ly;
      const R = (narrow ? 0.55 : size) * Math.min(w, h * 1.25);
      const steps = 540;
      const curves = narrow ? 26 : 38;

      // Outer band: many phase-shifted closed curves interlace into a medallion
      ctx.lineWidth = 0.75;
      ctx.strokeStyle = color;
      for (let k = 0; k < curves; k++) {
        const ph = (k / curves) * Math.PI * 2;
        ctx.beginPath();
        for (let i = 0; i <= steps; i++) {
          const th = (i / steps) * Math.PI * 2;
          const r =
            R * 0.78 +
            R * 0.11 * Math.sin(9 * th + ph + t * 0.35) +
            R * 0.07 * Math.sin(23 * th - ph * 2 - t * 0.22);
          const x = ox + r * Math.cos(th + t * 0.02);
          const y = oy + r * Math.sin(th + t * 0.02);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // Inner rosette, in signal yellow, turning the other way
      ctx.strokeStyle = accent;
      ctx.lineWidth = 0.6;
      const inner = narrow ? 10 : 14;
      for (let k = 0; k < inner; k++) {
        const ph = (k / inner) * Math.PI * 2;
        ctx.beginPath();
        for (let i = 0; i <= steps; i++) {
          const th = (i / steps) * Math.PI * 2;
          const r = R * 0.34 + R * 0.1 * Math.sin(8 * th + ph - t * 0.4) + R * 0.03 * Math.sin(16 * th - ph);
          const x = ox + r * Math.cos(th - t * 0.03);
          const y = oy + r * Math.sin(th - t * 0.03);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // Engraved rings
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      for (const f of [0.52, 0.55, 1.0, 1.03]) {
        ctx.beginPath();
        ctx.arc(ox, oy, R * f, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    function band(t: number) {
      if (!ctx) return;
      const lines = 16;
      const mid = h / 2;
      const amp = h * 0.32;
      ctx.lineWidth = 0.7;
      for (let j = 0; j < lines; j++) {
        const ph = (j / lines) * Math.PI * 2;
        ctx.strokeStyle = j % 4 === 0 ? accent : color;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 2) {
          const y =
            mid +
            amp * 0.62 * Math.sin(x * 0.045 + ph + t * 0.5) +
            amp * 0.38 * Math.sin(x * 0.013 - ph * 0.5 - t * 0.2);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }

    function draw(t: number) {
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);
      if (variant === "band") band(t);
      else rosette(t);
    }

    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      if (!visible || now - last < 33) return;
      last = now;
      lx += (tx - lx) * 0.06;
      ly += (ty - ly) * 0.06;
      draw((now - t0) / 1000);
    }

    function onMove(e: PointerEvent) {
      if (!parent) return;
      const r = parent.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * 36;
      ty = ((e.clientY - r.top) / r.height - 0.5) * 24;
    }

    layout();
    const ro = new ResizeObserver(() => {
      layout();
      if (reduce) draw(4);
    });
    ro.observe(parent);
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));

    if (reduce) {
      draw(4);
    } else {
      io.observe(canvas);
      if (variant === "rosette") parent.addEventListener("pointermove", onMove);
      raf = requestAnimationFrame(frame);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      parent.removeEventListener("pointermove", onMove);
    };
  }, [variant, color, accent, cx, cy, size, animate]);

  return <canvas ref={ref} aria-hidden="true" className={cn("pointer-events-none absolute inset-0", className)} />;
}
