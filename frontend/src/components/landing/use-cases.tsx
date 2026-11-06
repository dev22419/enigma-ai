// AI-assisted: Used Claude to write this file.
"use client";

import { AnimatePresence, motion } from "motion/react";
import { useId, useState } from "react";

import { cn } from "@/lib/utils";

/** One entry per task type the API accepts (TASK_TYPES in src/lib/constants.ts). */
const CASES = [
  {
    key: "medical",
    who: "Clinics",
    file: "outpatient_summary.pdf",
    gets: ["Summary", "Key findings with units", "Medications", "Items needing clinician attention"],
    life: "1 hour",
    why: "Enough time to write the referral letter. After that, no copy of the record is readable anywhere.",
  },
  {
    key: "legal",
    who: "Law firms",
    file: "supply-agreement.pdf",
    gets: ["Parties and dates", "Key obligations", "Termination and renewal", "Risky or unusual clauses"],
    life: "7 days",
    why: "A week to negotiate the draft. The receipt shows the review happened without disclosing the contract.",
  },
  {
    key: "financial",
    who: "Banks",
    file: "q3_statement.pdf",
    gets: ["Key figures", "Trends against prior periods", "Risks and anomalies", "Open questions"],
    life: "30 days",
    why: "Long enough for a month-end review. Customer data never becomes another database to protect.",
  },
];

export function UseCases() {
  const [active, setActive] = useState(0);
  const id = useId();
  const c = CASES[active];

  return (
    <section className="relative text-frost">
      <div className="mx-auto max-w-[1280px] px-4 pt-4 pb-8 sm:px-8 md:pt-6 md:pb-12">
        <p className="max-w-[30rem] text-[17px] leading-relaxed text-frost-soft">Who it&rsquo;s for</p>

        <div role="tablist" aria-label="Who uses Enigma" className="mt-4 flex flex-col items-start gap-1 md:flex-row md:flex-wrap md:gap-x-10">
          {CASES.map((x, i) => (
            <button
              key={x.key}
              role="tab"
              id={`${id}-t${i}`}
              aria-selected={active === i}
              aria-controls={`${id}-p`}
              onClick={() => setActive(i)}
              className={cn(
                "display relative text-[clamp(2.4rem,5.4vw,4.6rem)] whitespace-nowrap transition-colors",
                active === i ? "text-frost" : "text-frost/20 hover:text-frost/45",
              )}
            >
              {active === i && (
                <motion.span layoutId={`${id}-mark`} className="absolute inset-x-[-0.06em] bottom-[0.04em] h-[0.12em] rounded-full bg-melon" />
              )}
              <span className="relative">{x.who}</span>
            </button>
          ))}
        </div>

        <div id={`${id}-p`} role="tabpanel" aria-labelledby={`${id}-t${active}`} className="mt-12 min-h-[12rem]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={c.key}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="grid gap-8 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:gap-16"
            >
              <div className="overflow-hidden rounded-[10px] border border-night-line bg-night">
                <div className="flex items-center justify-between border-b border-night-line px-4 py-2.5 font-mono text-[11.5px]">
                  <span>{c.file}</span>
                  <span className="text-frost-soft">task: {c.key}</span>
                </div>
                <div className="px-4 py-5">
                  <p className="text-[13px] text-frost-soft">The answer comes back in these sections</p>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {c.gets.map((g) => (
                      <li key={g} className="rounded-full border border-volt/40 bg-volt/10 px-3 py-1 text-[13.5px] text-frost">
                        {g}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div>
                <p className="font-mono text-[11.5px] text-frost-soft">typical lifespan</p>
                <p className="display mt-1 text-[3rem] text-melon">{c.life}</p>
                <p className="mt-3 text-[15px] leading-relaxed text-frost/75">{c.why}</p>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
