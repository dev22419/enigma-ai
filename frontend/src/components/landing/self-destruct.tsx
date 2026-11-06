// AI-assisted: Used Claude to write this file. NumberTicker is from Magic UI (via 21st.dev).
"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

import { Button } from "@/components/ui/button";
import { NumberTicker } from "@/components/ui/number-ticker";
import { cn } from "@/lib/utils";

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
    <section id="lifespan" className="relative overflow-hidden text-frost">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[60%] bg-[radial-gradient(ellipse_50%_60%_at_70%_100%,rgb(2_151_222/0.22),transparent_70%)]" aria-hidden="true" />
      <div className="relative mx-auto grid max-w-[1280px] grid-cols-1 gap-14 px-4 pt-4 pb-8 sm:px-8 md:pt-6 md:pb-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20">
        <div>
          <h2 className="display text-[clamp(2.2rem,5vw,4.2rem)]">You choose when the answer dies</h2>
          <p className="mt-6 max-w-[27rem] text-[17px] leading-relaxed text-frost/75">
            Set a lifespan from one minute to 30 days. When it ends, Arkiv drops the encrypted answer and Enigma
            destroys the key that opens it. Any copy left anywhere stays locked for good.
          </p>

          <div className="mt-10" role="radiogroup" aria-label="Lifespan">
            <div className="grid grid-cols-4 overflow-hidden rounded-[8px] border border-frost/20">
              {OPTIONS.map((o, i) => (
                <button
                  key={o.ttl}
                  role="radio"
                  aria-checked={choice === i}
                  onClick={() => pick(i)}
                  className={cn(
                    "h-12 text-[14px] font-semibold transition-colors",
                    i > 0 && "border-l border-frost/20",
                    choice === i ? "bg-frost text-night" : "text-frost-soft hover:bg-frost/8 hover:text-frost",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <p className="mt-4 font-mono text-[12px] text-frost-soft">
              &quot;ttl&quot;:{" "}
              <NumberTicker key={ttl} value={ttl} startValue={Math.round(ttl * 0.5)} useGrouping={false} className="tracking-normal text-volt-lit dark:text-volt-lit" />
              <span className="ml-2">seconds in the request</span>
            </p>
          </div>
        </div>

        <div className="relative rounded-[12px] border border-night-line bg-night-2/90 p-6 shadow-[0_30px_90px_-40px_rgb(2_151_222/0.5)] sm:p-8">
          <div className="flex items-baseline justify-between gap-4 font-mono text-[11px] text-frost-soft">
            <span>supply-agreement.pdf, legal review</span>
            <span>Sample</span>
          </div>

          <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="font-mono text-[11px] text-frost-soft">{gone ? "key destroyed" : "key destroyed in"}</p>
              <p
                className={cn(
                  "display num mt-1 text-[clamp(2.8rem,7vw,5.6rem)] leading-[0.85] tracking-[-0.03em] transition-colors",
                  gone ? "text-frost/25" : late ? "text-melon" : "text-frost",
                )}
              >
                {clock(frac * ttl)}
              </p>
            </div>
            <Button onClick={run} disabled={running} variant={gone ? "outline-frost" : "primary"} className="mb-1">
              {gone ? "Run it again" : running ? "Running…" : "Run the timer"}
            </Button>
          </div>

          <div className="relative mt-5 h-2 rounded-full bg-frost/10">
            <div
              className={cn("absolute inset-y-0 left-0 w-full origin-left rounded-full transition-colors", late ? "bg-melon" : "bg-volt")}
              style={{ transform: `scaleX(${frac})` }}
            />
            {running && (
              <span
                className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-frost shadow-[0_0_0_4px_rgb(92_196_255/0.3),0_0_18px_rgb(92_196_255/0.9)]"
                style={{ left: `${frac * 100}%` }}
              />
            )}
          </div>
          <p className="mt-2 font-mono text-[11px] text-frost-soft/70">
            {OPTIONS[choice].long}, sped up {Math.round(ttl / SIM).toLocaleString("en-US")} times
          </p>

          <dl className="relative mt-7 space-y-4 border-t border-night-line pt-6">
            {RESULT.map(([k, v], i) => (
              <div key={k} className="grid gap-1 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:gap-5">
                <dt className="text-[13px] font-semibold text-frost-soft">{k}</dt>
                <dd className="relative text-[15px] leading-snug">
                  <span className={cn("transition-opacity duration-300", gone && "opacity-0")} style={{ transitionDelay: `${i * 90}ms` }}>
                    {v}
                  </span>
                  <span
                    className={cn("absolute inset-y-0.5 left-0 origin-left rounded-sm bg-frost/12 transition-transform duration-300", gone ? "scale-x-100" : "scale-x-0")}
                    style={{ right: `${10 + i * 12}%`, transitionDelay: `${i * 90}ms` }}
                  />
                </dd>
              </div>
            ))}
            {gone && (
              <div className="stamp-in pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[6px] border-[4px] border-melon bg-night/50 px-4 py-1.5 text-melon">
                <span className="display narrow block text-[clamp(2rem,5vw,3.2rem)] leading-none tracking-[0.02em]">DESTROYED</span>
              </div>
            )}
          </dl>
        </div>
      </div>
    </section>
  );
}
