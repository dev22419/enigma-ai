// AI-assisted: Used Claude to write this file. AnimatedBeam is from Magic UI (via 21st.dev).
"use client";

import { forwardRef, useRef } from "react";
import { useReducedMotion } from "motion/react";

import { AnimatedBeam } from "@/components/ui/animated-beam";
import { cn } from "@/lib/utils";

type Stop = { n: string; name: string; does: string; sees: string };

/** Mirrors POST /api/jobs on master: who touches the document, and what they can read. */
const STOPS: Record<string, Stop> = {
  api: { n: "01", name: "Your browser", does: "Encrypts everything and wipes the key at expiry", sees: "Everything, holds the only key" },
  storage: { n: "02", name: "0G Storage", does: "Keeps the encrypted copy", sees: "Ciphertext" },
  chain: { n: "03", name: "Whitechain", does: "Holds your payment, then records the receipt", sees: "Hashes" },
  tee: { n: "04", name: "0G Compute", does: "Runs the model. The document arrives through our proxy, in transit only", sees: "The document, sealed" },
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
        "relative z-10 w-full max-w-[15rem] justify-self-center overflow-hidden rounded-[8px] border",
        sealed ? "border-volt/60 bg-night text-frost" : "border-frost/12 bg-night-2 text-frost",
        className,
      )}
    >
      <div className={cn("relative flex items-center justify-between border-b px-3 py-1.5 font-mono text-[10.5px]", sealed ? "border-night-line text-frost-soft" : "border-frost/10 text-frost-soft")}>
        <span>{stop.n}</span>
        {sealed && <span className="text-volt-lit">sealed</span>}
      </div>
      <div className="relative px-3 py-3">
        <p className="text-[17px] leading-tight font-semibold">{stop.name}</p>
        <p className={cn("mt-2 text-[13px] leading-snug", "text-frost/70")}>{stop.does}</p>
        <p className={cn("mt-3 font-mono text-[10.5px]", sealed ? "text-volt-lit" : "text-frost/90")}>
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
    pathColor: "#eaf3f9",
    pathOpacity: 0.12,
    pathWidth: 2,
    gradientStartColor: reduce ? "transparent" : "#0297de",
    gradientStopColor: reduce ? "transparent" : "#5cc4ff",
    duration: 2.4,
    repeatDelay: 3.2,
    repeat: reduce ? 0 : Infinity,
  };

  return (
    <section id="route" className="section text-frost">
      <div className="shell">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end">
          <h2 className="heading">Where your document goes</h2>
          <p className="max-w-[28rem] text-[17px] leading-relaxed text-frost/70 lg:pb-2">
            Each system only gets what its part needs. Everything stored is encrypted.
          </p>
        </div>

        <div
          ref={box}
          className="relative mt-12 grid grid-cols-2 items-center gap-x-4 gap-y-10 md:grid-cols-4 md:grid-rows-2 md:gap-y-12"
        >
          <StopCard ref={api} stop={STOPS.api} className="col-span-2 md:col-span-1 md:col-start-1 md:row-span-2" />
          <StopCard ref={storage} stop={STOPS.storage} className="md:col-start-2 md:row-start-1" />
          <StopCard ref={chain} stop={STOPS.chain} className="md:col-start-2 md:row-start-2" />
          <StopCard ref={tee} stop={STOPS.tee} sealed className="col-span-2 md:col-span-1 md:col-start-3 md:row-span-2" />
          <StopCard ref={arkiv} stop={STOPS.arkiv} className="col-span-2 md:col-span-1 md:col-start-4 md:row-span-2" />

          <AnimatedBeam {...beam} fromRef={api} toRef={chain} curvature={-20} delay={0} />
          <AnimatedBeam {...beam} fromRef={api} toRef={storage} curvature={20} delay={0.5} />
          <AnimatedBeam {...beam} fromRef={api} toRef={tee} curvature={-60} delay={1.1} />
          <AnimatedBeam {...beam} fromRef={tee} toRef={arkiv} delay={1.8} />
          <AnimatedBeam {...beam} fromRef={tee} toRef={chain} curvature={-20} reverse delay={2.4} />
        </div>
      </div>
    </section>
  );
}
