// AI-assisted: Used Claude to write this file.
"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

/** Mirrors CreateJobRequest / CreateJobResponse in src/lib/types.ts on master. */
type Tok = [string, "k" | "s" | "n" | "p" | "c"];
const REQ: Tok[][] = [
  [["curl -X POST", "c"], [" https://enigma.example/api/jobs \\", "p"]],
  [["  -H ", "p"], ['"Content-Type: application/json"', "s"], [" \\", "p"]],
  [["  -d ", "p"], ["'{", "p"]],
  [['    "taskType"', "k"], [": ", "p"], ['"legal"', "s"], [",", "p"]],
  [['    "ttl"', "k"], [": ", "p"], ["3600", "n"], [",", "p"]],
  [['    "fileName"', "k"], [": ", "p"], ['"supply-agreement.txt"', "s"], [",", "p"]],
  [['    "fileContent"', "k"], [": ", "p"], ['"<document text or base64 image>"', "s"]],
  [["  }'", "p"]],
];
const RES: Tok[][] = [
  [["{", "p"]],
  [['  "jobId"', "k"], [": ", "p"], ['"1042"', "s"], [",", "p"]],
  [['  "status"', "k"], [": ", "p"], ['"completed"', "s"], [",", "p"]],
  [['  "result"', "k"], [": ", "p"], ['"SUMMARY\\n- Supplier must give 90 days…"', "s"], [",", "p"]],
  [['  "attestationHash"', "k"], [": ", "p"], ['"0xb28d…07f6c411"', "s"], [",", "p"]],
  [['  "createTxHash"', "k"], [": ", "p"], ['"0x2c90…41be7a03"', "s"], [",", "p"]],
  [['  "txHash"', "k"], [": ", "p"], ['"0x51aa…9d30e7c2"', "s"], [",", "p"]],
  [['  "arkivEntityKey"', "k"], [": ", "p"], ['"0x3e1d…88c0f2a1"', "s"], [",", "p"]],
  [['  "expiresAt"', "k"], [": ", "p"], ["1793032071", "n"]],
  [["}", "p"]],
];
const COLOR = { k: "text-frost", s: "text-melon-lit", n: "text-volt-lit", p: "text-frost-soft", c: "text-volt-lit" };

const NOTES = [
  ["Failed jobs are refunded", "If anything breaks after payment is locked, the key is destroyed and the contract refunds you after the timeout."],
  ["Errors never carry secrets", "Every error is scrubbed before it leaves the server: API keys, private keys, bearer tokens, long hex and document text are replaced with [redacted]."],
  ["Documents can't give orders", "Text inside a file is treated as content, never as instructions. A document that tells the model to ignore its rules gets summarised like any other."],
];

export function ApiSection() {
  const [tab, setTab] = useState<"request" | "response">("request");
  const lines = tab === "request" ? REQ : RES;

  return (
    <section id="api" className="bg-night text-frost">
      <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-14 px-4 py-24 sm:px-8 md:py-32 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20">
        <div>
          <h2 className="display text-[clamp(2.2rem,5vw,4.2rem)]">One request per document</h2>
          <p className="mt-6 max-w-[27rem] text-[17px] leading-relaxed text-frost/75">
            Send the document, a task and a lifespan. The answer, the enclave attestation and both transactions
            come back in the same response.
          </p>
          <dl className="mt-10 space-y-6">
            {NOTES.map(([k, v]) => (
              <div key={k} className="border-l-2 border-volt pl-4">
                <dt className="text-[16px] font-semibold">{k}</dt>
                <dd className="mt-1 text-[14.5px] leading-relaxed text-frost-soft">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="self-start overflow-hidden rounded-[12px] border border-night-line bg-night-2 shadow-[0_30px_90px_-40px_rgb(2_151_222/0.6)]">
          <div className="flex items-center border-b border-night-line px-2" role="tablist" aria-label="Example">
            {(["request", "response"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cn("relative px-3 py-3 font-mono text-[12px] capitalize transition-colors", tab === t ? "text-frost" : "text-frost-soft hover:text-frost")}
              >
                {t}
                {tab === t && <span className="absolute inset-x-3 bottom-0 h-[2px] bg-melon" />}
              </button>
            ))}
            <span className="ml-auto pr-3 font-mono text-[11px] text-frost-soft">POST /api/jobs</span>
          </div>
          <pre className="overflow-x-auto px-5 py-6 font-mono text-[13px] leading-[1.75] sm:px-6">
            <code>
              {lines.map((line, i) => (
                <span key={i} className="block">
                  <span className="mr-5 inline-block w-4 text-right text-frost/25 select-none">{i + 1}</span>
                  {line.map(([t, c], j) => (
                    <span key={j} className={COLOR[c]}>
                      {t}
                    </span>
                  ))}
                </span>
              ))}
            </code>
          </pre>
        </div>
      </div>
    </section>
  );
}
