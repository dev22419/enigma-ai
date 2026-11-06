// AI-assisted: Used Claude to write this file.
"use client";

import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";

import { cn } from "@/lib/utils";
import { Reveal } from "./reveal";

/** Sample values in the shape of GET /api/jobs/[id]/receipt. Not a real transaction. */
const FIELDS: [string, string][] = [
  ["Job", "1042"],
  ["Task", "legal"],
  ["File hash", "0x9c1e…a47b02d6"],
  ["Result hash", "0x4f70…e1c93a58"],
  ["Attestation record", "0xb28d…07f6c411"],
  ["Arkiv entity", "0x3e1d…88c0f2a1"],
  ["Expired", "07 Nov 2026, 17:41 UTC"],
  ["Completed", "tx 0x51aa…9d30e7c2"],
];

const CHECKS = [
  ["attestation record", "Which provider served the job, recorded on-chain."],
  ["result hash", "Your answer matches the hash on-chain."],
  ["key destroyed", "Your browser wiped the key and kept a receipt."],
];

export function Seal({ className = "size-28 text-night" }: { className?: string }) {
  const id = useId();
  const text = "ENIGMA · KEY DESTROYED · RECEIPT ON-CHAIN · ";
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden="true">
      <defs>
        <path id={id} d="M60,60 m-44,0 a44,44 0 1,1 88,0 a44,44 0 1,1 -88,0" />
      </defs>
      <circle cx="60" cy="60" r="57" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="60" cy="60" r="53" fill="none" stroke="currentColor" strokeWidth="0.75" strokeDasharray="1.5 2.5" />
      <circle cx="60" cy="60" r="34" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <text fontSize="7.4" fontFamily="var(--font-plex-mono)" letterSpacing="1.6" fill="currentColor">
        <textPath href={`#${id}`}>{text + text}</textPath>
      </text>
      <circle cx="60" cy="60" r="27" fill="var(--volt)" />
      <path d="M48 60.5 56 68 72 52" fill="none" stroke="var(--night)" strokeWidth="4.5" strokeLinecap="square" />
    </svg>
  );
}

function Callout({ title, text, side }: { title: string; text: string; side: "left" | "right" }) {
  return (
    <div className={cn("relative lg:max-w-[15rem]", side === "left" ? "lg:ml-auto lg:pr-10 lg:text-right" : "lg:pl-10")}>
      <span
        className={cn("absolute top-[11px] hidden h-px w-7 bg-volt-lit/60 lg:block", side === "left" ? "right-0" : "left-0")}
        aria-hidden="true"
      />
      <p className="text-[17px] font-semibold first-letter:uppercase">{title}</p>
      <p className="mt-2 text-[14.5px] leading-snug text-frost-soft">{text}</p>
    </div>
  );
}

export function Certificate() {
  const reduce = useReducedMotion();
  return (
    <section id="certificate" className="section text-frost">
      <Reveal className="shell">
        <div className="text-center">
          <h2 className="heading">The receipt outlives the data</h2>
          <p className="lede">Hashes and timestamps only. Show an auditor the work without showing the document.</p>
        </div>

        <div className="mt-16 grid items-center gap-10 md:mt-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)_minmax(0,1fr)] lg:gap-0">
          <div className="order-2 grid gap-10 lg:order-1">
            <Callout side="left" title={CHECKS[0][0]} text={CHECKS[0][1]} />
            <Callout side="left" title={CHECKS[1][0]} text={CHECKS[1][1]} />
          </div>

          {/* The receipt prints out of the slot, then gets stamped */}
          <figure className="order-1 mx-auto w-full max-w-[460px] lg:order-2">
            <div className="h-1.5 rounded-full bg-night-3 shadow-[inset_0_1px_0_rgb(234_243_249/0.12)]" aria-hidden="true" />
            <motion.div
              className="mx-3"
              initial={reduce ? false : { clipPath: "inset(0 0 100% 0)" }}
              whileInView={{ clipPath: "inset(0 0 0% 0)" }}
              viewport={{ once: true, margin: "-15% 0px" }}
              transition={{ duration: 1.5, ease: [0.3, 0, 0.2, 1] }}
            >
              <div className="ticket relative bg-night-2 pb-10">
                <div className="relative h-16 overflow-hidden bg-[linear-gradient(90deg,var(--volt),#08131b_58%,var(--melon))]">
                  <div className="flute absolute inset-0" aria-hidden="true" />
                  <p className="absolute inset-x-5 bottom-3 flex justify-between font-mono text-[11px] text-frost">
                    <span>Enigma receipt</span>
                    <span>No. 1042</span>
                  </p>
                </div>
                <dl className="px-5 pt-3">
                  {FIELDS.map(([k, v]) => (
                    <div key={k} className="flex items-baseline justify-between gap-4 border-b border-dashed border-frost/12 py-2.5">
                      <dt className="text-[13.5px] text-frost-soft">{k}</dt>
                      <dd className="num truncate font-mono text-[12.5px]">{v}</dd>
                    </div>
                  ))}
                </dl>
                <motion.div
                  className="absolute right-3 bottom-4 opacity-95"
                  initial={reduce ? false : { scale: 1.7, opacity: 0, rotate: -14 }}
                  whileInView={{ scale: 1, opacity: 0.95, rotate: -8 }}
                  viewport={{ once: true }}
                  transition={{ delay: 1.5, duration: 0.3, ease: [0.2, 0.9, 0.3, 1.2] }}
                >
                  <Seal className="size-16 text-volt-lit" />
                </motion.div>
                <p className="mt-5 px-5 font-mono text-[11px] text-frost-soft">Sample values, Whitechain testnet</p>
              </div>
            </motion.div>
          </figure>

          <div className="order-3 grid gap-10">
            <Callout side="right" title={CHECKS[2][0]} text={CHECKS[2][1]} />
          </div>
        </div>
      </Reveal>
    </section>
  );
}
