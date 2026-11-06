// AI-assisted: Used Claude to write this file.
"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

const GLYPHS = "0123456789abcdef";

/** Text that resolves character by character into a new value, like data being re-encoded. */
export function Scramble({ text, ms = 520, className }: { text: string; ms?: number; className?: string }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(text);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / ms, 1);
      setShown(
        [...text]
          .map((c, i) => (c === " " || i / text.length < p ? c : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]))
          .join(""),
      );
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, ms]);

  return <span className={className}>{reduce ? text : shown}</span>;
}
