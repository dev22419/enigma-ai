// AI-assisted: Used Claude to write this file.
"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { Reveal } from "./reveal";
import { Scramble } from "./scramble";

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
  { title: "Result hash", text: "The answer you got is the one recorded on-chain.", left: "your answer", right: "on-chain", value: "0x4f70…e1c93a58" },
  { title: "Attestation record", text: "Shows which provider served the job.", left: "0G signature", right: "on-chain", value: "0xb28d…07f6c411" },
  { title: "Key destroyed", text: "Your browser wiped the key and left a receipt.", left: "your browser", right: "on-chain", value: "tx 0x51aa…9d30e7c2" },
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

/** Runs one check at a time: two values resolve, match, and get ticked. */
function Verify() {
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const inView = useInView(box, { margin: "-15% 0px" });
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!inView || reduce) return;
    const id = setTimeout(() => setActive((a) => (a + 1) % (CHECKS.length + 1)), active === CHECKS.length ? 2200 : 1900);
    return () => clearTimeout(id);
  }, [active, inView, reduce]);

  return (
    <div ref={box} className="grid gap-3">
      {CHECKS.map((c, i) => {
        const done = reduce || i < active;
        const running = !reduce && i === active;
        return (
          <article key={c.title} className={cn("panel p-5 transition-shadow duration-300", running && "shadow-[inset_0_0_0_1px_rgb(255_154_124/0.7)]")}>
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-[17px] font-semibold">{c.title}</h3>
              <span className={cn("font-mono text-[11.5px]", done ? "text-volt-lit" : running ? "text-frost" : "text-frost-soft")}>
                {done ? "✓ verified" : running ? "checking…" : "queued"}
              </span>
            </div>
            <p className="mt-1 text-[14.5px] leading-snug text-frost-soft">{c.text}</p>
            <dl className="mt-3 grid gap-1 border-t border-frost/10 pt-3 font-mono text-[12px]">
              <div className="flex justify-between gap-4">
                <dt className="text-frost-soft">{c.left}</dt>
                <dd>{running ? <Scramble key={active} text={c.value} ms={1500} /> : c.value}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-frost-soft">{c.right}</dt>
                <dd>{c.value}</dd>
              </div>
            </dl>
          </article>
        );
      })}
    </div>
  );
}

export function Certificate() {
  const reduce = useReducedMotion();
  return (
    <section id="certificate" className="section text-frost">
      <Reveal className="shell">
        <div className="text-center">
          <p className="eyebrow">03 Receipts</p>
          <h2 className="heading">The receipt outlives the data</h2>
          <p className="lede">Hashes and timestamps only. Show an auditor the work without showing the document.</p>
        </div>

        <div className="mt-10 grid grid-cols-[minmax(0,1fr)] items-start gap-3 md:mt-12 lg:grid-cols-2">
          {/* The receipt prints out of the slot, then gets stamped */}
          <figure className="panel p-6 sm:p-8">
            <div className="h-1.5 rounded-full bg-night-3 shadow-[inset_0_1px_0_rgb(238_238_238/0.12)]" aria-hidden="true" />
            <motion.div
              className="mx-3"
              initial={reduce ? false : { clipPath: "inset(0 0 100% 0)" }}
              whileInView={{ clipPath: "inset(0 0 0% 0)" }}
              viewport={{ once: true, margin: "-15% 0px" }}
              transition={{ duration: 1.5, ease: [0.3, 0, 0.2, 1] }}
            >
              <div className="ticket relative bg-night-3 pb-10">
                <div className="relative h-14 overflow-hidden bg-[linear-gradient(90deg,var(--volt),#000_58%,var(--orchid))]">
                  <div className="flute absolute inset-0" aria-hidden="true" />
                  <p className="absolute inset-x-5 bottom-2.5 flex justify-between font-mono text-[11px] text-frost">
                    <span>Enigma receipt</span>
                    <span>No. 1042</span>
                  </p>
                </div>
                <dl className="px-5 pt-3">
                  {FIELDS.map(([k, v]) => (
                    <div key={k} className="flex items-baseline justify-between gap-4 border-b border-dashed border-frost/12 py-2">
                      <dt className="text-[13.5px] text-frost-soft">{k}</dt>
                      <dd className="num truncate font-mono text-[12.5px]">{v}</dd>
                    </div>
                  ))}
                </dl>
                <motion.div
                  className="absolute right-3 bottom-3"
                  initial={reduce ? false : { scale: 1.7, opacity: 0, rotate: -14 }}
                  whileInView={{ scale: 1, opacity: 0.95, rotate: -8 }}
                  viewport={{ once: true }}
                  transition={{ delay: 1.5, duration: 0.3, ease: [0.2, 0.9, 0.3, 1.2] }}
                >
                  <Seal className="size-16 text-volt-lit" />
                </motion.div>
                <p className="mt-4 px-5 font-mono text-[11px] text-frost-soft">Sample values, Whitechain testnet</p>
              </div>
            </motion.div>
          </figure>

          <Verify />
        </div>
      </Reveal>
    </section>
  );
}
