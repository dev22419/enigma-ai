// AI-assisted: Used Claude to write this file.
import { useId } from "react";

import { Guilloche } from "./guilloche";

/** Sample values in the shape of GET /api/jobs/[id]/receipt. Not a real transaction. */
const FIELDS: [string, string][] = [
  ["Job", "1042"],
  ["Task", "legal"],
  ["File hash", "0x9c1e…a47b02d6"],
  ["Result hash", "0x4f70…e1c93a58"],
  ["Attestation record", "0xb28d…07f6c411"],
  ["Arkiv entity", "0x3e1d…88c0f2a1"],
  ["Expired", "07 Nov 2026, 17:41 UTC"],
  ["Completed in", "tx 0x51aa…9d30e7c2"],
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

export function Certificate() {
  return (
    <section id="certificate" className="section text-frost">
      <div className="shell grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
        <div>
          <h2 className="heading">The receipt outlives the data</h2>
          <p className="mt-4 max-w-[27rem] text-[17px] leading-relaxed text-frost-soft">Hashes and timestamps only. Show an auditor the work without showing the document.</p>
          <ul className="mt-10 divide-y divide-frost/10 border-y border-frost/10">
            {CHECKS.map(([k, v]) => (
              <li key={k} className="flex gap-4 py-4">
                <span className="mt-1 shrink-0 text-volt-lit">
                  <svg width="12" height="12" viewBox="0 0 10 10" aria-hidden="true">
                    <path d="M1.5 5.2 4 7.5 8.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
                  </svg>
                </span>
                <div>
                  <p className="text-[15px] font-semibold first-letter:uppercase">{k}</p>
                  <p className="mt-1 text-[15px] leading-snug text-frost-soft">{v}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <figure className="relative">
          <div className="relative rounded-[3px] bg-sheet p-2 text-ink">
            <div className="border-[1.5px] border-night p-1">
              <div className="relative border border-night/30">
                <div className="relative h-14 overflow-hidden border-b border-night/20">
                  <Guilloche variant="band" color="rgba(2,7,10,0.2)" accent="rgba(2,7,10,0.38)" />
                </div>

                <div className="px-5 py-7 sm:px-9">
                  <div className="flex items-start justify-between gap-4">
                    <p className="font-mono text-[10.5px] text-ink-soft">
                      Whitechain testnet
                      <br />
                      chain 1874
                    </p>
                    <p className="font-mono text-[13px] font-medium text-melon">No. 1042</p>
                  </div>

                  <p className="mt-6 text-center text-[clamp(1.4rem,3vw,2rem)] leading-tight font-semibold tracking-[-0.015em]">
                    Certificate of destruction
                  </p>
                  
                  <dl className="mt-8 grid gap-x-8 sm:grid-cols-2">
                    {FIELDS.map(([k, v]) => (
                      <div key={k} className="flex items-baseline justify-between gap-3 border-b border-dotted border-night/25 py-2">
                        <dt className="text-[12.5px] text-ink-soft">{k}</dt>
                        <dd className="num truncate font-mono text-[12px] text-ink">{v}</dd>
                      </div>
                    ))}
                  </dl>

                  <div className="mt-7 flex justify-end">
                    <Seal className="size-20 text-night" />
                  </div>
                </div>

                <div className="relative h-10 overflow-hidden border-t border-night/20">
                  <Guilloche variant="band" color="rgba(2,7,10,0.18)" accent="rgba(2,7,10,0.32)" />
                </div>
              </div>
            </div>
          </div>
          <figcaption className="mt-3 font-mono text-[11.5px] text-frost-soft">Sample values.</figcaption>
        </figure>
      </div>
    </section>
  );
}
