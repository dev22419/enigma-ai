// AI-assisted: Used Claude to write this file.
"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
      <Reveal className="shell text-center">
        <h2 className="heading">You choose when the answer dies</h2>
        <p className="lede">One minute to 30 days. When it ends, Arkiv drops the answer and your browser wipes the key.</p>

        <p className="mt-16 font-mono text-[12px] text-frost-soft md:mt-24">{gone ? "key destroyed" : "key destroyed in"}</p>
        <p
          className={cn(
            "num mt-3 font-mono text-[clamp(3.25rem,12vw,9rem)] leading-none tracking-[-0.04em] transition-colors",
            gone ? "text-frost/25" : late ? "text-melon" : "text-frost",
          )}
        >
          {clock(frac * ttl)}
        </p>

        <div className="relative mx-auto mt-10 h-px max-w-[640px] bg-frost/15">
          <div
            className={cn("absolute inset-y-0 left-0 w-full origin-left transition-colors", late ? "bg-melon" : "bg-frost")}
            style={{ transform: `scaleX(${frac})` }}
          />
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-x-8 gap-y-2" role="radiogroup" aria-label="Lifespan">
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

        <Button onClick={run} disabled={running} variant={gone ? "outline-frost" : "primary"} className="mt-8">
          {gone ? "Run it again" : running ? "Running…" : "Run the timer"}
        </Button>

        <dl className="mx-auto mt-16 max-w-[640px] text-left">
          {RESULT.map(([k, v], i) => (
            <div key={k} className="grid gap-1 border-t border-frost/10 py-4 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:gap-5">
              <dt className="text-[14px] text-frost-soft">{k}</dt>
              <dd className="relative text-[15px] leading-snug">
                <span className={cn("transition-opacity duration-300", gone && "opacity-0")} style={{ transitionDelay: `${i * 90}ms` }}>
                  {v}
                </span>
                <span
                  className={cn("absolute inset-y-0.5 left-0 origin-left rounded-sm bg-frost/10 transition-transform duration-300", gone ? "scale-x-100" : "scale-x-0")}
                  style={{ right: `${10 + i * 12}%`, transitionDelay: `${i * 90}ms` }}
                />
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 font-mono text-[11.5px] text-frost-soft">
          Sample answer. {OPTIONS[choice].long}, sped up {Math.round(ttl / SIM).toLocaleString("en-US")} times.
        </p>
      </Reveal>
    </section>
  );
}
