// AI-assisted: Used Claude to write this file.
import { useId } from "react";

import { Guilloche } from "./guilloche";

/** Sample values in the shape of GET /api/jobs/[id]/receipt. Not a real transaction. */
const FIELDS: [string, string][] = [
  ["Job", "1042"],
  ["Task", "legal"],
  ["File hash", "0x9c1e…a47b02d6"],
  ["Result hash", "0x4f70…e1c93a58"],
  ["TEE attestation", "0xb28d…07f6c411"],
  ["Arkiv entity", "0x3e1d…88c0f2a1"],
  ["Expired", "07 Nov 2026, 17:41 UTC"],
  ["Completed in", "tx 0x51aa…9d30e7c2"],
];

const CHECKS = [
  ["attestation", "0G's model ran inside a TDX enclave, and the attestation hash is on-chain."],
  ["result hash", "The answer you received matches the hash the contract recorded."],
  ["key destroyed", "Your browser wiped the job's key at expiry and kept a receipt of it. The ciphertext on Arkiv can't be opened again."],
];

export function Seal({ className = "size-28 text-night" }: { className?: string }) {
  const id = useId();
  const text = "ENIGMA · TEE ATTESTED · KEY DESTROYED · ";
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden="true">
      <defs>
        <path id={id} d="M60,60 m-44,0 a44,44 0 1,1 88,0 a44,44 0 1,1 -88,0" />
      </defs>
      <circle cx="60" cy="60" r="57" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="60" cy="60" r="53" fill="none" stroke="currentColor" strokeWidth="0.75" strokeDasharray="1.5 2.5" />
      <circle cx="60" cy="60" r="34" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <text fontSize="7.4" fontFamily="var(--font-jetbrains)" letterSpacing="1.6" fill="currentColor">
        <textPath href={`#${id}`}>{text + text}</textPath>
      </text>
      <circle cx="60" cy="60" r="27" fill="var(--volt)" />
      <path d="M48 60.5 56 68 72 52" fill="none" stroke="var(--night)" strokeWidth="4.5" strokeLinecap="square" />
    </svg>
  );
}

export function Certificate() {
  return (
    <section id="certificate" className="relative text-frost">
      <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-16 px-4 pt-4 pb-8 sm:px-8 md:pt-6 md:pb-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20">
        <div>
          <h2 className="display text-[clamp(2.2rem,5vw,4.2rem)]">The receipt outlives the data</h2>
          <p className="mt-6 max-w-[27rem] text-[17px] leading-relaxed text-frost/70">
            Every job ends with two records: the completed job on Whitechain, and the receipt your browser keeps when it
            wipes the key. Both hold hashes and timestamps only. You can show an auditor what happened without showing
            them the document.
          </p>
          <ul className="mt-10 divide-y divide-frost/10 border-y border-frost/10">
            {CHECKS.map(([k, v]) => (
              <li key={k} className="flex gap-4 py-4">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-volt text-night">
                  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                    <path d="M1.5 5.2 4 7.5 8.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
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
          <div className="pointer-events-none absolute -inset-10 -z-10 bg-[radial-gradient(ellipse_at_center,rgb(2_151_222/0.22),transparent_65%)] blur-2xl" aria-hidden="true" />
          <div className="relative rotate-[0.6deg] rounded-[4px] bg-sheet p-2 text-ink shadow-[0_0_0_1px_rgb(255_255_255/0.4),0_50px_120px_-30px_rgb(2_151_222/0.45),0_30px_80px_-40px_rgb(252_115_77/0.4)]">
            <div className="border-[1.5px] border-night p-1">
              <div className="relative border border-night/30">
                <div className="relative h-14 overflow-hidden border-b border-night/20">
                  <Guilloche variant="band" color="rgba(2,151,222,0.35)" accent="rgba(252,115,77,0.7)" />
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

                  <p className="display narrow mt-6 text-center text-[clamp(1.6rem,3.6vw,2.6rem)] leading-none tracking-[0.01em] uppercase">
                    Certificate of destruction
                  </p>
                  <p className="mt-3 text-center text-[14px] text-ink-soft">
                    The document below was read once inside a sealed enclave. The key to its answer no longer exists.
                  </p>

                  <dl className="mt-8 grid gap-x-8 sm:grid-cols-2">
                    {FIELDS.map(([k, v]) => (
                      <div key={k} className="flex items-baseline justify-between gap-3 border-b border-dotted border-night/25 py-2">
                        <dt className="text-[12.5px] text-ink-soft">{k}</dt>
                        <dd className="num truncate font-mono text-[12px] text-ink">{v}</dd>
                      </div>
                    ))}
                  </dl>

                  <div className="mt-8 flex items-end justify-between gap-6">
                    <div className="min-w-0">
                      <svg viewBox="0 0 180 44" className="h-11 w-44 text-night" aria-hidden="true">
                        <path
                          d="M4 30c8-14 14-22 18-20s-6 22-2 24 12-26 18-26-4 24 2 24 10-16 16-18 2 14 8 14 8-10 14-12 4 8 10 8 14-6 22-10 18-4 30-6"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                        />
                      </svg>
                      <p className="mt-2 border-t border-night/40 pt-1.5 font-mono text-[10.5px] text-ink-soft">Oracle 0x7a3f…c210</p>
                    </div>
                    <Seal />
                  </div>
                </div>

                <div className="relative h-10 overflow-hidden border-t border-night/20">
                  <Guilloche variant="band" color="rgba(2,151,222,0.28)" accent="rgba(252,115,77,0.6)" />
                </div>
              </div>
            </div>
          </div>
          <figcaption className="mt-5 font-mono text-[11px] text-frost-soft">Sample values. Real receipts come from /api/jobs/[id]/receipt.</figcaption>
        </figure>
      </div>
    </section>
  );
}
