// AI-assisted: Used Claude to write this file.
"use client";

import { useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { Reveal } from "./reveal";
import { Scramble } from "./scramble";

const DOC = [
  "Supply agreement, draft 3",
  "Supplier: Meridian Foods Pvt Ltd",
  "Notice period: 90 days",
  "Clause 14.2 caps liability at one month of fees",
  "Renews each year unless cancelled 60 days before",
];
const CHAIN = [
  "job         1042",
  "fileHash    0x9c1e…a47b02d6",
  "payment     0.50 USDT locked",
  "resultHash  0x4f70…e1c93a58",
  "receipt     recorded at expiry",
];

/** Fixed fake ciphertext, the same length as each document line. */
function cipher(seed: number) {
  let x = seed;
  return DOC.map((line) =>
    [...line]
      .map(() => {
        x = (Math.imul(x, 1103515245) + 12345) & 0x7fffffff;
        return ((x >>> 16) & 15).toString(16);
      })
      .join(""),
  );
}

type Stop = { name: string; does: string; reads: string; lines: string[]; tone: string; sealed?: boolean };

/** In job order, mirroring POST /api/jobs: who touches the document, and what they can read. */
const STOPS: Stop[] = [
  { name: "Your browser", does: "Encrypts the file and holds the only key", reads: "Everything", lines: DOC, tone: "text-frost" },
  { name: "Whitechain", does: "Locks the payment, then records the receipt", reads: "Hashes", lines: CHAIN, tone: "text-volt-lit" },
  { name: "0G Storage", does: "Keeps the encrypted copy", reads: "Ciphertext", lines: cipher(20261106), tone: "text-frost/45" },
  { name: "0G Compute", does: "Runs the model inside a sealed enclave", reads: "The document, sealed", lines: DOC, tone: "text-frost", sealed: true },
  { name: "Arkiv", does: "Stores the encrypted answer until it expires", reads: "Ciphertext", lines: cipher(7794095), tone: "text-frost/45" },
];

export function Route() {
  const [active, setActive] = useState(0);
  const [held, setHeld] = useState(false);
  const [picked, setPicked] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const inView = useInView(box, { margin: "-20% 0px" });
  const reduce = useReducedMotion();
  const stop = STOPS[active];

  useEffect(() => {
    if (!inView || held || picked || reduce) return;
    const id = setInterval(() => setActive((a) => (a + 1) % STOPS.length), 3400);
    return () => clearInterval(id);
  }, [inView, held, picked, reduce]);

  return (
    <section id="route" className="section text-frost">
      <Reveal className="shell">
        <div className="text-center">
          <h2 className="heading">Where your document goes</h2>
          <p className="lede">Five systems handle each job. This is the same document, as each one sees it.</p>
        </div>

        <div ref={box} className="mx-auto mt-16 max-w-[980px] md:mt-24" onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)}>
          <div className="relative">
            <div className="absolute top-[21px] right-[10%] left-[10%] h-px bg-frost/15" aria-hidden="true">
              <div className="h-full origin-left bg-volt-lit transition-transform duration-700" style={{ transform: `scaleX(${active / (STOPS.length - 1)})` }} />
            </div>
            <div className="relative grid grid-cols-5" role="tablist" aria-label="Systems">
              {STOPS.map((s, i) => (
                <button
                  key={s.name}
                  role="tab"
                  aria-selected={active === i}
                  onClick={() => {
                    setPicked(true);
                    setActive(i);
                  }}
                  className="group flex flex-col items-center gap-3 pt-3 text-center"
                >
                  <span
                    className={cn(
                      "block size-[19px] rounded-full border-[5px] transition-all duration-500",
                      i <= active ? "border-volt-lit bg-night" : "border-frost/25 bg-night group-hover:border-frost/60",
                      active === i && "scale-125 shadow-[0_0_0_6px_rgb(92_196_255/0.16)]",
                    )}
                  />
                  <span className={cn("hidden text-[15px] font-semibold transition-colors sm:block", active === i ? "text-frost" : "text-frost-soft")}>
                    {s.name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="relative mt-10 overflow-hidden rounded-[14px] bg-night-2 shadow-[0_0_0_1px_rgb(234_243_249/0.1)]">
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-b border-frost/10 px-5 py-3.5 sm:px-7">
              <p className="text-[15px] font-semibold">
                {stop.name}
                <span className="ml-3 font-normal text-frost-soft max-sm:block max-sm:ml-0">{stop.does}</span>
              </p>
              <p className={cn("font-mono text-[11.5px]", stop.sealed ? "text-volt-lit" : "text-frost/60")}>can read: {stop.reads}</p>
            </div>

            <div className="relative min-h-[220px] px-5 py-7 font-mono text-[clamp(12.5px,1.6vw,15px)] leading-[1.8] break-all whitespace-pre-wrap sm:px-7 sm:leading-[2]">
              <div className="overflow-hidden">
                {stop.lines.map((line, i) => (
                  <p key={i} className={cn("transition-colors duration-500", stop.tone)}>
                    <Scramble text={line} ms={420 + i * 70} />
                  </p>
                ))}
              </div>

              {/* The enclave: the model reads the document, nobody outside can */}
              <div className={cn("absolute inset-0 transition-opacity duration-500", stop.sealed ? "opacity-100" : "pointer-events-none opacity-0")} aria-hidden={!stop.sealed}>
                <div className="absolute inset-0 bg-[linear-gradient(100deg,rgb(2_151_222/0.5),rgb(2_7_10/0.2)_60%,rgb(252_115_77/0.34))]" />
                <div className="flute absolute inset-0" />
                <p className="absolute right-5 bottom-4 font-mono text-[11.5px] text-frost sm:right-7">sealed enclave</p>
              </div>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
