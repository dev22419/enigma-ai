// AI-assisted: Used Claude to write this file.
"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FlutedGlass } from "./fluted-glass";
import { Reveal } from "./reveal";

/** The range the API accepts: ttl between 60 seconds and 30 days. */
const OPTIONS = [
  { label: "1 min", long: "1 minute", ttl: 60 },
  { label: "1 hour", long: "1 hour", ttl: 3600 },
  { label: "7 days", long: "7 days", ttl: 604800 },
  { label: "30 days", long: "30 days", ttl: 2592000 },
];
const SIM = 8; // seconds to play a whole lifespan

const RESULT = [
  ["Key obligations", "Supplier must give 90 days' notice before ending the agreement."],
  ["Unusual clause", "Clause 14.2 caps liability at one month of fees."],
  ["Renewal", "Renews automatically each year unless cancelled 60 days before."],
];

/** Eats a string as time runs out. Stable per character, so it decays instead of flickering. */
function decay(text: string, amount: number) {
  const glyphs = "0123456789abcdef";
  return [...text]
    .map((c, i) => (c !== " " && ((i * 37 + text.length * 11) % 100) / 100 < amount ? glyphs[(i * 7) % 16] : c))
    .join("");
}

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

export function SelfDestruct() {
  const [choice, setChoice] = useState(1);
  const [frac, setFrac] = useState(1);
  const [running, setRunning] = useState(false);
  const raf = useRef(0);
  const reduce = useReducedMotion();
  const ttl = OPTIONS[choice].ttl;
  const gone = frac <= 0;
  const late = !gone && frac < 0.3;

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  function run() {
    cancelAnimationFrame(raf.current);
    setFrac(1);
    if (reduce) return setFrac(0);
    setRunning(true);
    const t0 = performance.now();
    const tick = (now: number) => {
      const f = Math.max(0, 1 - (now - t0) / 1000 / SIM);
      setFrac(f);
      if (f > 0) raf.current = requestAnimationFrame(tick);
      else setRunning(false);
    };
    raf.current = requestAnimationFrame(tick);
  }

  function pick(i: number) {
    cancelAnimationFrame(raf.current);
    setRunning(false);
    setFrac(1);
    setChoice(i);
  }

  return (
    <section id="lifespan" className="section text-frost">
      <Reveal className="shell">
        <div className="text-center">
          <h2 className="heading">You choose when the answer dies</h2>
          <p className="lede">One minute to 30 days. When it ends, Arkiv drops the answer and your browser wipes the key.</p>
        </div>

        {/* The light behind the glass dies with the timer */}
        <div className="relative isolate mt-16 overflow-hidden rounded-[16px] bg-night px-5 py-14 text-center shadow-[0_0_0_1px_rgb(234_243_249/0.1)] sm:px-10 md:mt-20 md:py-20">
          <FlutedGlass className="-z-20" rib={58} focus={0} />
          <div className="absolute inset-0 -z-10 bg-night" style={{ opacity: 0.5 + 0.5 * (1 - frac) }} aria-hidden="true" />

          <p className={cn("font-mono text-[12px]", gone ? "text-melon-lit" : "text-frost/75")}>
            {gone ? "key destroyed" : "key destroyed in"}
          </p>
          <p
            className={cn(
              "num mt-3 font-mono text-[clamp(3.25rem,12vw,9rem)] leading-none tracking-[-0.04em] transition-colors",
              gone ? "text-frost/25" : late ? "text-melon-lit" : "text-frost",
            )}
          >
            {clock(frac * ttl)}
          </p>

          <dl className="mx-auto mt-12 max-w-[640px] text-left">
            {RESULT.map(([k, v]) => (
              <div key={k} className="grid gap-1 border-t border-frost/15 py-3.5 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:gap-5">
                <dt className="text-[14px] text-frost/70">{k}</dt>
                <dd className={cn("font-mono text-[13px] leading-snug transition-opacity duration-500", gone && "opacity-30")}>
                  {decay(v, 1 - frac)}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
          <div className="flex gap-6" role="radiogroup" aria-label="Lifespan">
            {OPTIONS.map((o, i) => (
              <button
                key={o.ttl}
                role="radio"
                aria-checked={choice === i}
                onClick={() => pick(i)}
                className={cn(
                  "py-2 text-[15px] transition-colors",
                  choice === i ? "font-semibold text-frost" : "text-frost-soft hover:text-frost",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          <Button onClick={run} disabled={running} variant={gone ? "outline-frost" : "primary"}>
            {gone ? "Run it again" : running ? "Running…" : "Run the timer"}
          </Button>
        </div>
        <p className="mt-4 text-center font-mono text-[11.5px] text-frost-soft">
          Sample answer. {OPTIONS[choice].long}, sped up {Math.round(ttl / SIM).toLocaleString("en-US")} times.
        </p>
      </Reveal>
    </section>
  );
}
