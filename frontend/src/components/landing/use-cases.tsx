// AI-assisted: Used Claude to write this file.
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

        <div className="mt-20 grid gap-16 text-center md:mt-28 md:grid-cols-3 md:gap-10">
          {CASES.map((c) => (
            <div key={c.who}>
              <p className="text-[17px] text-frost-soft">{c.who}</p>
              <p className="display mt-3 text-[clamp(2.75rem,5vw,4rem)]">{c.life}</p>
              <p className="mt-5 text-[16px] text-frost">{c.why}</p>
              <p className="mx-auto mt-2 max-w-[19rem] text-[14.5px] leading-snug text-frost-soft">{c.gets}</p>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
