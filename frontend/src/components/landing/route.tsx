// AI-assisted: Used Claude to write this file. AnimatedBeam is from Magic UI (via 21st.dev).
"use client";

import { forwardRef, useRef } from "react";
import { useReducedMotion } from "motion/react";

import { AnimatedBeam } from "@/components/ui/animated-beam";
import { cn } from "@/lib/utils";

type Stop = { n: string; name: string; does: string; sees: string };

/** Mirrors POST /api/jobs on master: who touches the document, and what they can read. */
const STOPS: Record<string, Stop> = {
  api: { n: "01", name: "Enigma API", does: "Makes a key for this job and encrypts the document with it", sees: "The document, in memory" },
  storage: { n: "02", name: "0G Storage", does: "Keeps the encrypted copy", sees: "Ciphertext" },
  chain: { n: "03", name: "Whitechain", does: "Holds your payment, then records the receipt", sees: "Hashes" },
  tee: { n: "04", name: "0G Compute", does: "Runs 0G's model inside an Intel TDX enclave", sees: "The document, sealed" },
  arkiv: { n: "05", name: "Arkiv", does: "Stores the encrypted answer and drops it at expiry", sees: "Ciphertext" },
};

const StopCard = forwardRef<HTMLDivElement, { stop: Stop; sealed?: boolean; className?: string }>(function StopCard(
  { stop, sealed, className },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "relative z-10 w-full max-w-[15rem] justify-self-center overflow-hidden rounded-[10px] border",
        sealed ? "border-volt/60 bg-night text-frost shadow-[0_20px_60px_-20px_rgb(2_151_222/0.6)]" : "border-ink/15 bg-sheet text-ink shadow-[0_1px_0_rgb(2_7_10/0.04)]",
        className,
      )}
    >
      <div className={cn("relative flex items-center justify-between border-b px-3 py-1.5 font-mono text-[10.5px]", sealed ? "border-night-line text-frost-soft" : "border-ink/10 text-ink-soft")}>
        <span>{stop.n}</span>
        {sealed && <span className="text-volt-lit">sealed</span>}
      </div>
      <div className="relative px-3 py-3">
        <p className="display narrow text-[1.35rem] leading-none tracking-[-0.01em]">{stop.name}</p>
        <p className={cn("mt-2 text-[13px] leading-snug", sealed ? "text-frost/80" : "text-ink-soft")}>{stop.does}</p>
        <p className={cn("mt-3 font-mono text-[10.5px]", sealed ? "text-volt-lit" : "text-ink")}>
          <span className="opacity-60">can read: </span>
          {stop.sees}
        </p>
      </div>
    </div>
  );
});

export function Route() {
  const box = useRef<HTMLDivElement>(null);
  const api = useRef<HTMLDivElement>(null);
  const storage = useRef<HTMLDivElement>(null);
  const chain = useRef<HTMLDivElement>(null);
  const tee = useRef<HTMLDivElement>(null);
  const arkiv = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  const beam = {
    containerRef: box,
    pathColor: "#02070a",
    pathOpacity: 0.16,
    pathWidth: 2,
    gradientStartColor: reduce ? "transparent" : "#0297de",
    gradientStopColor: reduce ? "transparent" : "#5cc4ff",
    duration: 2.4,
    repeatDelay: 3.2,
    repeat: reduce ? 0 : Infinity,
  };

  return (
    <section id="route" className="relative bg-paper text-ink">
      <div className="mx-auto max-w-[1280px] px-4 py-24 sm:px-8 md:py-32">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end">
          <h2 className="display text-[clamp(2.3rem,5vw,4.4rem)]">Where your document goes</h2>
          <p className="max-w-[28rem] text-[17px] leading-relaxed text-ink-soft lg:pb-2">
            Five systems handle each job, and each one only gets what its part needs. The document is read inside
            the enclave. Everything that gets stored is encrypted.
          </p>
        </div>

        <div
          ref={box}
          className="relative mt-14 grid grid-cols-2 items-center gap-x-4 gap-y-10 rounded-[14px] border border-ink/10 bg-[radial-gradient(rgb(2_7_10/0.09)_1px,transparent_1px)] bg-[size:18px_18px] px-4 py-10 md:grid-cols-4 md:grid-rows-2 md:gap-y-14 md:px-10 md:py-16"
        >
          <StopCard ref={api} stop={STOPS.api} className="col-span-2 md:col-span-1 md:col-start-1 md:row-span-2" />
          <StopCard ref={storage} stop={STOPS.storage} className="md:col-start-2 md:row-start-1" />
          <StopCard ref={chain} stop={STOPS.chain} className="md:col-start-2 md:row-start-2" />
          <StopCard ref={tee} stop={STOPS.tee} sealed className="col-span-2 md:col-span-1 md:col-start-3 md:row-span-2" />
          <StopCard ref={arkiv} stop={STOPS.arkiv} className="col-span-2 md:col-span-1 md:col-start-4 md:row-span-2" />

          <AnimatedBeam {...beam} fromRef={api} toRef={chain} curvature={-20} delay={0} />
          <AnimatedBeam {...beam} fromRef={api} toRef={storage} curvature={20} delay={0.5} />
          <AnimatedBeam {...beam} fromRef={storage} toRef={tee} curvature={20} delay={1.1} />
          <AnimatedBeam {...beam} fromRef={tee} toRef={arkiv} delay={1.8} />
          <AnimatedBeam {...beam} fromRef={tee} toRef={chain} curvature={-20} reverse delay={2.4} />
        </div>
      </div>
    </section>
  );
}
