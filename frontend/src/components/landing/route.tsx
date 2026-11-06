// AI-assisted: Used Claude to write this file.
"use client";

import { useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { Reveal } from "./reveal";

type NodeId = "browser" | "chain" | "storage" | "compute" | "arkiv";

const NODES: Record<NodeId, { name: string; role: string; x: number; y: number }> = {
  browser: { name: "Your browser", role: "Holds the key", x: 11, y: 50 },
  chain: { name: "Whitechain", role: "Payment and receipt", x: 43, y: 17 },
  storage: { name: "0G Storage", role: "Encrypted copy", x: 43, y: 83 },
  compute: { name: "0G Compute", role: "Sealed enclave", x: 68, y: 50 },
  arkiv: { name: "Arkiv", role: "Encrypted answer", x: 89, y: 50 },
};

/** In job order, following the calls in src/components/app/jobs.ts. */
const STEPS: { node: NodeId; wire: string | null; title: string; text: string }[] = [
  { node: "browser", wire: null, title: "Encrypt", text: "Your browser makes a key and encrypts the file with AES-256-GCM." },
  { node: "chain", wire: "M110 210 C270 210 270 72 430 72", title: "Pay", text: "Whitechain opens the job and locks 0.50 USDT." },
  { node: "storage", wire: "M110 210 C270 210 270 348 430 348", title: "Store", text: "0G Storage keeps the encrypted copy. It can't read it." },
  { node: "compute", wire: "M110 210 L680 210", title: "Read", text: "The document passes through our proxy into the enclave, where the model reads it." },
  { node: "arkiv", wire: "M680 210 L890 210", title: "Seal", text: "Your browser encrypts the answer, and Arkiv stores only that." },
  { node: "chain", wire: "M890 210 C760 90 600 72 430 72", title: "Prove", text: "Whitechain records the hashes, so the job can be checked later." },
];

const ACCESS: { id: NodeId; cells: number[] }[] = [
  { id: "browser", cells: [2, 2, 2, 2] },
  { id: "chain", cells: [0, 0, 0, 2] },
  { id: "storage", cells: [0, 0, 0, 0] },
  { id: "compute", cells: [1, 1, 0, 0] },
  { id: "arkiv", cells: [0, 0, 0, 0] },
];
const COLUMNS = ["Document", "Answer", "Key", "Hashes"];

export function Route() {
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const trail = useRef<SVGPathElement>(null);
  const spark = useRef<SVGCircleElement>(null);
  const inView = useInView(box, { margin: "-15% 0px" });
  const reduce = useReducedMotion();
  const current = STEPS[step];

  useEffect(() => {
    if (!inView || picked || reduce) return;
    const id = setTimeout(() => setStep((s) => (s + 1) % STEPS.length), 2800);
    return () => clearTimeout(id);
  }, [step, inView, picked, reduce]);

  // Runs the pulse along the active wire, drawing the wire behind it.
  useEffect(() => {
    const path = trail.current;
    const dot = spark.current;
    if (!path || !dot || !current.wire) return;
    const length = path.getTotalLength();
    const place = (p: number) => {
      const at = path.getPointAtLength(length * p);
      dot.setAttribute("cx", String(at.x));
      dot.setAttribute("cy", String(at.y));
      path.style.strokeDashoffset = String(1 - p);
    };
    if (reduce) return place(1);
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / 1300, 1);
      place(1 - (1 - p) ** 3);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [current, reduce]);

  return (
    <section id="route" className="section text-frost">
      <Reveal className="shell">
        <div className="text-center">
          <p className="eyebrow">02 How it works</p>
          <h2 className="heading">Where your document goes</h2>
          <p className="lede">Six steps across five systems. Each one gets only what its part needs.</p>
        </div>

        <div ref={box} className="panel mt-14 overflow-hidden md:mt-20">
          {/* Wide layout: the wired diagram */}
          <div className="dot-floor relative hidden aspect-[1000/420] lg:block">
            <svg viewBox="0 0 1000 420" className="absolute inset-0 size-full" aria-hidden="true">
              {STEPS.map((s, i) =>
                s.wire ? (
                  <path key={i} d={s.wire} fill="none" stroke={i < step ? "rgb(242 200 248 / 0.45)" : "rgb(238 238 238 / 0.14)"} strokeWidth="1.5" />
                ) : null,
              )}
              {current.wire && (
                <>
                  <path ref={trail} d={current.wire} pathLength={1} fill="none" stroke="rgb(242 200 248)" strokeWidth="2" strokeDasharray="1" strokeDashoffset="1" />
                  <circle ref={spark} r="5" fill="rgb(255 255 255)" className="spark" />
                </>
              )}
            </svg>

            {(Object.keys(NODES) as NodeId[]).map((id) => {
              const n = NODES[id];
              const on = current.node === id;
              return (
                <div
                  key={id}
                  className={cn(
                    "absolute w-[164px] -translate-x-1/2 -translate-y-1/2 rounded-[10px] border bg-night-2 px-3.5 py-3 transition-all duration-300",
                    on ? "border-volt-lit shadow-[0_0_0_4px_rgb(255_154_124/0.14),0_0_34px_rgb(229_156_244/0.4)]" : "border-frost/14",
                  )}
                  style={{ left: `${n.x}%`, top: `${n.y}%` }}
                >
                  <p className="flex items-center justify-between text-[14.5px] font-semibold">
                    {n.name}
                    <span className={cn("size-1.5 rounded-full", on ? "bg-volt-lit" : "bg-frost/25")} />
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-frost-soft">{n.role}</p>
                </div>
              );
            })}
          </div>

          {/* Narrow layout: the same systems as a list */}
          <ul className="grid gap-2 p-4 lg:hidden">
            {(Object.keys(NODES) as NodeId[]).map((id) => (
              <li
                key={id}
                className={cn(
                  "flex items-center justify-between rounded-[10px] border bg-night-2 px-3.5 py-3 transition-colors duration-300",
                  current.node === id ? "border-volt-lit" : "border-frost/14",
                )}
              >
                <span className="text-[14.5px] font-semibold">{NODES[id].name}</span>
                <span className="font-mono text-[11px] text-frost-soft">{NODES[id].role}</span>
              </li>
            ))}
          </ul>

          <div className="grid grid-cols-6 border-t border-frost/10" role="tablist" aria-label="Job steps">
            {STEPS.map((s, i) => (
              <button
                key={s.title}
                role="tab"
                aria-selected={step === i}
                onClick={() => {
                  setPicked(true);
                  setStep(i);
                }}
                className={cn("relative px-1 py-3.5 text-center text-[13px] transition-colors sm:text-[14px]", step === i ? "font-semibold text-frost" : "text-frost-soft hover:text-frost")}
              >
                <span className={cn("absolute inset-x-0 top-0 h-0.5 transition-colors", i <= step ? "bg-volt-lit" : "bg-transparent")} />
                {s.title}
              </button>
            ))}
          </div>
          <p className="min-h-[3.75rem] border-t border-frost/10 px-5 py-4 text-center text-[15.5px] leading-snug">
            <span className="mr-2 font-mono text-[12px] text-volt-lit">step {step + 1}/6</span>
            {current.text}
          </p>
        </div>

        <div className="panel mt-3 overflow-x-auto p-5 sm:p-7">
          <div className="min-w-[520px]">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <h3 className="text-[18px] font-semibold">Who can read what</h3>
              <p className="flex gap-5 font-mono text-[11px] text-frost-soft">
                <span><i className="mr-1.5 inline-block size-2 rounded-full bg-frost" />Can read</span>
                <span><i className="mr-1.5 inline-block size-2 rounded-full bg-volt-lit" />Sealed, in the enclave</span>
              </p>
            </div>
            <div className="mt-5 grid grid-cols-[1.5fr_repeat(4,1fr)] items-center gap-y-1 text-center text-[14px]">
              <span />
              {COLUMNS.map((c) => (
                <span key={c} className="pb-2 font-mono text-[11.5px] text-frost-soft">{c}</span>
              ))}
              {ACCESS.map((row) => {
                const on = current.node === row.id;
                return (
                  <div key={row.id} className="contents">
                    <span className={cn("rounded-l-[8px] py-2.5 pl-3 text-left transition-colors duration-300", on ? "bg-frost/8 font-semibold text-frost" : "text-frost/80")}>
                      {NODES[row.id].name}
                    </span>
                    {row.cells.map((v, i) => (
                      <span key={i} className={cn("flex h-full items-center justify-center transition-colors duration-300", on && "bg-frost/8", i === 3 && "rounded-r-[8px]")}>
                        <i
                          className={cn(
                            "block size-3 rounded-full transition-transform duration-300",
                            v === 2 ? "bg-frost" : v === 1 ? "bg-volt-lit" : "border border-frost/20",
                            on && v > 0 && "scale-125",
                          )}
                        />
                      </span>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
