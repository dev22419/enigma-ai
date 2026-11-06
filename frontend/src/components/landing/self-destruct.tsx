// AI-assisted: Used Claude to write this file.
"use client";

import { useInView, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { LiveCanvas, noise, type Paint } from "./live-canvas";
import { Reveal } from "./reveal";

/** The range the API accepts: ttl between 60 seconds and 30 days. */
const OPTIONS = [
  { label: "1 min", long: "1 minute", ttl: 60 },
  { label: "1 hour", long: "1 hour", ttl: 3600 },
  { label: "7 days", long: "7 days", ttl: 604800 },
  { label: "30 days", long: "30 days", ttl: 2592000 },
];
const SIM = 9; // seconds to play a whole lifespan
const REST = 2600; // pause on "destroyed" before it plays again

/** 5x7 LED glyphs, one string per row. */
const FONT: Record<string, string[]> = {
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  ":": ["0", "1", "1", "0", "1", "1", "0"],
  d: ["00001", "00001", "01101", "10011", "10001", "10011", "01101"],
  " ": ["000", "000", "000", "000", "000", "000", "000"],
};

function clock(sec: number) {
  const s = Math.max(0, Math.ceil(sec));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  if (d) return `${d}d ${p(h)}:${p(m)}`;
  return h ? `${p(h)}:${p(m)}:${p(r)}` : `${p(m)}:${p(r)}`;
}

/** Lit cells for a string, centred on a cols x rows grid. */
function ledCells(text: string, cols: number, rows: number) {
  const glyphs = [...text].map((c) => FONT[c] ?? FONT[" "]);
  const width = glyphs.reduce((sum, g) => sum + g[0].length + 1, -1);
  const scale = Math.max(1, Math.min(Math.floor((cols * 0.86) / width), Math.floor((rows * 0.8) / 7)));
  const ox = Math.floor((cols - width * scale) / 2);
  const oy = Math.floor((rows - 7 * scale) / 2);
  const cells = new Set<number>();
  let cx = 0;
  for (const g of glyphs) {
    g.forEach((row, y) =>
      [...row].forEach((bit, x) => {
        if (bit !== "1") return;
        for (let sx = 0; sx < scale; sx++) {
          for (let sy = 0; sy < scale; sy++) cells.add((oy + y * scale + sy) * cols + ox + (cx + x) * scale + sx);
        }
      }),
    );
    cx += g[0].length + 1;
  }
  return cells;
}

export function SelfDestruct() {
  const [choice, setChoice] = useState(1);
  const [frac, setFrac] = useState(1);
  const box = useRef<HTMLDivElement>(null);
  const inView = useInView(box, { margin: "-10% 0px" });
  const reduce = useReducedMotion();
  const ttl = OPTIONS[choice].ttl;
  const gone = frac <= 0;
  const late = !gone && frac < 0.3;

  // Plays on its own while on screen, and starts over when a lifespan is picked.
  useEffect(() => {
    if (!inView || reduce) return;
    let raf = 0;
    let wait = 0;
    const play = () => {
      const t0 = performance.now();
      const tick = (now: number) => {
        const f = Math.max(0, 1 - (now - t0) / 1000 / SIM);
        setFrac(f);
        if (f > 0) raf = requestAnimationFrame(tick);
        else wait = window.setTimeout(play, REST);
      };
      raf = requestAnimationFrame(tick);
    };
    play();
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(wait);
    };
  }, [inView, reduce, choice]);

  const paint = useCallback<Paint>(
    (ctx, w, h, t) => {
      const gap = w < 640 ? 6 : 8;
      const cols = Math.floor(w / gap);
      const rows = Math.floor(h / gap);
      const left = (w - cols * gap) / 2;
      const top = (h - rows * gap) / 2;
      const lit = ledCells(gone ? "00:00" : clock(frac * ttl), cols, rows);
      const edge = frac * cols;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const n = noise(x, y);
          let fill: string;
          if (lit.has(y * cols + x)) {
            fill = gone ? "rgba(238,238,238,0.2)" : late ? "rgb(242,200,248)" : "rgb(238,238,238)";
          } else if (!gone && x < edge) {
            const twinkle = Math.max(0, Math.sin(t * 1.6 + n * 40));
            fill = `rgba(242,200,248,${0.05 + 0.3 * twinkle * n})`;
          } else {
            fill = "rgba(238,238,238,0.045)";
          }
          if (!gone && Math.abs(x - edge) < 1.5) fill = "rgba(229,156,244,0.85)";
          ctx.fillStyle = fill;
          ctx.fillRect(left + x * gap + 1, top + y * gap + 1, gap - 2.5, gap - 2.5);
        }
      }
    },
    [frac, ttl, gone, late],
  );

  const status = [
    { name: "Answer on Arkiv", live: "Encrypted, stored", dead: "Dropped" },
    { name: "Key in your browser", live: "Held", dead: "Wiped" },
    { name: "Receipt on Whitechain", live: "Waiting for expiry", dead: "Recorded" },
  ];

  return (
    <section id="lifespan" className="section text-frost">
      <Reveal className="shell">
        <div className="text-center">
          <p className="eyebrow">02 Lifespan</p>
          <h2 className="heading">You choose when the answer dies</h2>
          <p className="lede">Set a timer from one minute to 30 days. When it hits zero, the answer can&rsquo;t be read by anyone.</p>
        </div>

        <div ref={box} className="panel mt-10 overflow-hidden md:mt-12">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-frost/10 px-5 py-3">
            <p className={cn("font-mono text-[12px]", gone ? "text-orchid-lit" : "text-frost-soft")}>
              {gone ? "key destroyed" : "key destroyed in"}
              <span className="sr-only"> {clock(frac * ttl)}</span>
            </p>
            <div className="flex gap-1" role="radiogroup" aria-label="Lifespan">
              {OPTIONS.map((o, i) => (
                <button
                  key={o.ttl}
                  role="radio"
                  aria-checked={choice === i}
                  onClick={() => {
                    setFrac(1);
                    setChoice(i);
                  }}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-[13.5px] transition-colors",
                    choice === i ? "bg-frost font-semibold text-night" : "text-frost-soft hover:text-frost",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div className="h-[clamp(150px,17vw,220px)]">
            <LiveCanvas paint={paint} />
          </div>
          <ul className="grid border-t border-frost/10 sm:grid-cols-3">
            {status.map((s, i) => (
              <li key={s.name} className="flex items-center justify-between gap-3 border-frost/10 px-5 py-3 not-first:max-sm:border-t sm:block sm:not-first:border-l">
                <p className="text-[13.5px] text-frost-soft">{s.name}</p>
                <p className="flex items-center gap-2 text-[14.5px] font-semibold sm:mt-0.5">
                  <span
                    className={cn("size-2 rounded-full transition-colors duration-300", gone ? "bg-orchid" : "bg-volt-lit")}
                    style={{ transitionDelay: `${i * 160}ms` }}
                  />
                  {gone ? s.dead : s.live}
                </p>
              </li>
            ))}
          </ul>
          <p className="border-t border-frost/10 px-5 py-2.5 font-mono text-[11.5px] text-frost-soft">
            Sample. {OPTIONS[choice].long}, sped up {Math.round(ttl / SIM).toLocaleString("en-US")} times.
          </p>
        </div>

      </Reveal>
    </section>
  );
}
