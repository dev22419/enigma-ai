// AI-assisted: Used Claude to write this file.
"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { Reveal } from "./reveal";

/** Mirrors the request and response types in src/lib/types.ts (zero-storage proxy, #26). */
type Tok = [string, "k" | "s" | "n" | "p" | "c"];
type Call = { key: string; label: string; route: string; lines: Tok[][] };

const CALLS: Call[] = [
  {
    key: "open",
    label: "1. Open",
    route: "POST /api/jobs",
    lines: [
      [["// your browser encrypted the file with a key only it holds", "p"]],
      [["{", "p"]],
      [['  "ttl"', "k"], [": ", "p"], ["3600", "n"], [",", "p"]],
      [['  "fileName"', "k"], [": ", "p"], ['"supply-agreement.txt"', "s"], [",", "p"]],
      [['  "fileHash"', "k"], [": ", "p"], ['"0x9c1e…a47b02d6"', "s"], [",", "p"]],
      [['  "encryptedFile"', "k"], [": ", "p"], ['"{\\"alg\\":\\"AES-256-GCM\\",…}"', "s"]],
      [["}", "p"]],
      [["→ ", "c"], ['{ "jobId": "1042", "accessToken": "…", "createTxHash": "0x2c90…" }', "p"]],
    ],
  },
  {
    key: "read",
    label: "2. Read",
    route: "POST /api/infer",
    lines: [
      [["// plaintext passes through to the enclave, never stored or logged", "p"]],
      [["{", "p"]],
      [['  "fileName"', "k"], [": ", "p"], ['"supply-agreement.txt"', "s"], [",", "p"]],
      [['  "content"', "k"], [": ", "p"], ['"<document text or base64 image>"', "s"]],
      [["}", "p"]],
      [["→ ", "c"], ['{ "result": "SUMMARY…", "resultHash": "0x4f70…",', "p"]],
      [["   ", "p"], ['"attestationHash": "0xb28d…", "chatId": "…" }', "p"]],
    ],
  },
  {
    key: "store",
    label: "3. Store",
    route: "POST /api/jobs/1042/result",
    lines: [
      [["// x-access-token: <token from step 1>", "p"]],
      [["// your browser encrypted the answer with the same key", "p"]],
      [["{", "p"]],
      [['  "encryptedResult"', "k"], [": ", "p"], ['"{\\"alg\\":\\"AES-256-GCM\\",…}"', "s"], [",", "p"]],
      [['  "resultHash"', "k"], [": ", "p"], ['"0x4f70…e1c93a58"', "s"], [",", "p"]],
      [['  "attestationHash"', "k"], [": ", "p"], ['"0xb28d…07f6c411"', "s"], [",", "p"]],
      [['  "chatId"', "k"], [": ", "p"], ['"…"', "s"]],
      [["}", "p"]],
      [["→ ", "c"], ['{ "completeTxHash": "0x51aa…", "arkivEntityKey": "0x3e1d…", "expiresAt": 1793032071 }', "p"]],
    ],
  },
];
const COLOR = { k: "text-frost", s: "text-frost/70", n: "text-volt-lit", p: "text-frost-soft", c: "text-volt-lit" };

export function ApiSection() {
  const [step, setStep] = useState(0);
  const [held, setHeld] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const inView = useInView(box, { margin: "-20% 0px" });
  const reduce = useReducedMotion();
  const call = CALLS[step];

  useEffect(() => {
    if (!inView || held || reduce) return;
    const id = setInterval(() => setStep((s) => (s + 1) % CALLS.length), 6000);
    return () => clearInterval(id);
  }, [inView, held, reduce]);

  return (
    <section id="api" className="section text-frost">
      <Reveal className="shell">
        <div className="text-center">
          <p className="eyebrow">04 API</p>
          <h2 className="heading">Three calls, no keys on the server</h2>
          <p className="lede">The server is a proxy. It never holds a key or an answer it could read.</p>
        </div>

        <div ref={box} className="mx-auto mt-10 max-w-[980px] overflow-hidden rounded-[14px] bg-night-2 shadow-[0_0_0_1px_rgb(238_238_238/0.1)] md:mt-12">
          <div className="relative h-2 overflow-hidden bg-[linear-gradient(90deg,var(--volt),#000_60%,var(--orchid))]" aria-hidden="true">
            <div className="flute absolute inset-0" />
          </div>

          <div className="grid md:grid-cols-[230px_minmax(0,1fr)]">
            <div className="relative border-b border-frost/10 p-3 md:border-r md:border-b-0 md:p-5" role="tablist" aria-label="API calls">
              {CALLS.map((c, i) => (
                <button
                  key={c.key}
                  role="tab"
                  aria-selected={step === i}
                  onClick={() => {
                    setHeld(true);
                    setStep(i);
                  }}
                  className={cn("relative block w-full rounded-[20px] px-4 py-3 text-left transition-colors", step === i ? "text-frost" : "text-frost-soft hover:text-frost")}
                >
                  {step === i && <motion.span layoutId="api-step" className="absolute inset-0 rounded-[20px] bg-frost/8" />}
                  <span className="relative block text-[15px] font-semibold">{c.label}</span>
                  <span className="relative mt-0.5 block truncate font-mono text-[11px] text-frost-soft">{c.route}</span>
                </button>
              ))}
            </div>

            <pre className="min-h-[290px] overflow-x-auto px-5 py-6 font-mono text-[13px] leading-[1.75] sm:px-7">
              <code>
                {call.lines.map((line, i) => (
                  <motion.span
                    key={`${call.key}-${i}`}
                    className="block"
                    initial={reduce ? false : { opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.06, duration: 0.25 }}
                  >
                    {line.map(([t, c], j) => (
                      <span key={j} className={COLOR[c]}>
                        {t}
                      </span>
                    ))}
                  </motion.span>
                ))}
              </code>
            </pre>
          </div>

          <div className="grid grid-cols-2 border-t border-frost/10 font-mono text-[11.5px]">
            <p className="flex items-center gap-2 px-5 py-3 text-frost">
              <span className="size-2 rounded-full bg-orchid" aria-hidden="true" />
              Your browser: holds the key
            </p>
            <p className="flex items-center gap-2 border-l border-frost/10 px-5 py-3 text-frost-soft">
              <span className="size-2 rounded-full border border-frost/40" aria-hidden="true" />
              Server: holds nothing
            </p>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
