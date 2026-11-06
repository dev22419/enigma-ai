// AI-assisted: Used Claude to write this file.
import { FlutedGlass } from "./fluted-glass";
import { Reveal } from "./reveal";

/** One entry per task type the API accepts (TASK_TYPES in src/lib/constants.ts). */
const CASES = [
  {
    who: "Clinics",
    life: "1 hour",
    why: "Enough time to write the referral letter.",
    gets: "Summary, key findings, medications, items needing attention",
  },
  {
    who: "Law firms",
    life: "7 days",
    why: "A week to negotiate the draft.",
    gets: "Parties, obligations, renewal terms, unusual clauses",
  },
  {
    who: "Banks",
    life: "30 days",
    why: "Long enough for a month-end review.",
    gets: "Key figures, trends, anomalies, open questions",
  },
];

export function UseCases() {
  return (
    <section id="who" className="section text-frost">
      <Reveal className="shell">
        <div className="text-center">
          <h2 className="heading">Who it&rsquo;s for</h2>
          <p className="lede">Set the lifespan to fit the work, and nothing stays longer.</p>
        </div>

        {/* One sheet of glass behind three panes */}
        <div className="relative isolate mt-16 grid gap-px overflow-hidden rounded-[16px] bg-night shadow-[0_0_0_1px_rgb(234_243_249/0.1)] md:mt-24 md:grid-cols-3">
          <FlutedGlass className="-z-10" rib={46} focus={0} />
          {CASES.map((c) => (
            <div key={c.who} className="group relative flex min-h-[340px] flex-col justify-end p-7 md:min-h-[460px] md:p-8">
              <div className="absolute inset-0 -z-[1] bg-[linear-gradient(180deg,rgb(2_7_10/0.12),rgb(2_7_10/0.92)_72%)] transition-opacity duration-500 group-hover:opacity-70" aria-hidden="true" />
              <p className="text-[17px] text-frost/80">{c.who}</p>
              <p className="display mt-2 text-[clamp(2.75rem,5vw,4rem)]">{c.life}</p>
              <p className="mt-4 text-[16px] text-frost">{c.why}</p>
              <p className="mt-2 min-h-[2.6em] text-[14.5px] leading-snug text-frost/65">{c.gets}</p>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
