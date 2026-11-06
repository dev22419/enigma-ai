// AI-assisted: Used Claude to write this file.
"use client";

import { useMemo } from "react";

import { LiveCanvas, noise, type Paint } from "./live-canvas";
import { Reveal } from "./reveal";

/** One entry per task type the API accepts (TASK_TYPES in src/lib/constants.ts). */
const CASES = [
  {
    who: "Clinics",
    task: "Medical records",
    life: "1 hour",
    seconds: 3600,
    why: "Enough time to write the referral letter.",
    gets: ["Summary", "Key findings", "Medications", "Items needing attention"],
  },
  {
    who: "Law firms",
    task: "Contracts",
    life: "7 days",
    seconds: 604800,
    why: "A week to negotiate the draft.",
    gets: ["Parties and dates", "Obligations", "Renewal terms", "Unusual clauses"],
  },
  {
    who: "Banks",
    task: "Financial statements",
    life: "30 days",
    seconds: 2592000,
    why: "Long enough for a month-end review.",
    gets: ["Key figures", "Trends", "Anomalies", "Open questions"],
  },
];

const MIN = Math.log(60);
const MAX = Math.log(2592000);

/** Bars from one minute to 30 days on a log scale, lit up to this lifespan. */
function lifeBars(seconds: number): Paint {
  const reach = (Math.log(seconds) - MIN) / (MAX - MIN);
  return (ctx, w, h, t) => {
    const bars = Math.floor(w / 7);
    for (let i = 0; i < bars; i++) {
      const p = i / (bars - 1);
      const wave = 0.4 + 0.42 * (0.5 + 0.5 * Math.sin(t * 2.2 + i * 0.42)) + 0.18 * noise(i, 4);
      const height = Math.max(3, wave * h);
      const on = p <= reach;
      ctx.fillStyle = on ? (p > reach - 0.04 ? "rgb(229,156,244)" : "rgb(238,238,238)") : "rgba(238,238,238,0.1)";
      ctx.fillRect(i * 7, on ? h - height : h - height * 0.3, 3.5, on ? height : height * 0.3);
    }
  };
}

function CaseCard({ c }: { c: (typeof CASES)[number] }) {
  const paint = useMemo(() => lifeBars(c.seconds), [c.seconds]);
  return (
    <article className="panel flex flex-col p-6">
      <p className="flex items-baseline justify-between text-[15px]">
        <span className="font-semibold">{c.who}</span>
        <span className="font-mono text-[11.5px] text-frost-soft">{c.task}</span>
      </p>
      <p className="display mt-6 text-[clamp(2.75rem,5vw,3.75rem)]">{c.life}</p>
      <p className="mt-2 text-[15.5px] text-frost/85">{c.why}</p>

      <div className="mt-6 h-20">
        <LiveCanvas paint={paint} />
      </div>
      <p className="mt-2 flex justify-between font-mono text-[11px] text-frost-soft">
        <span>1 min</span>
        <span>30 days</span>
      </p>

      <ul className="mt-5 flex flex-wrap gap-1.5 border-t border-frost/10 pt-5">
        {c.gets.map((g) => (
          <li key={g} className="rounded-full border border-frost/14 px-2.5 py-1 text-[13px] text-frost/85">
            {g}
          </li>
        ))}
      </ul>
    </article>
  );
}

export function UseCases() {
  return (
    <section id="who" className="section text-frost">
      <Reveal className="shell">
        <div className="text-center">
          <p className="eyebrow">05 Who it&rsquo;s for</p>
          <h2 className="heading">For work that can&rsquo;t leak</h2>
          <p className="lede">Each team gets a structured answer, kept only as long as the job needs it.</p>
        </div>

        <div className="mt-14 grid gap-3 md:mt-20 md:grid-cols-3">
          {CASES.map((c) => (
            <CaseCard key={c.who} c={c} />
          ))}
        </div>
      </Reveal>
    </section>
  );
}
