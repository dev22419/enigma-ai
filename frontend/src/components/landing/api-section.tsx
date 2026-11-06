// AI-assisted: Used Claude to write this file.
"use client";

import { useState } from "react";

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
      [['  "taskType"', "k"], [": ", "p"], ['"legal"', "s"], [",", "p"]],
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
      [['  "taskType"', "k"], [": ", "p"], ['"legal"', "s"], [",", "p"]],
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
  const [tab, setTab] = useState(CALLS[0].key);
  const call = CALLS.find((c) => c.key === tab) ?? CALLS[0];

  return (
    <section id="api" className="section text-frost">
      <Reveal className="shell">
        <div className="text-center">
          <h2 className="heading">Three calls, no keys on the server</h2>
          <p className="lede">The server is a proxy. It never holds a key or an answer it could read.</p>
        </div>

        <div className="mx-auto mt-16 max-w-[820px] md:mt-24">
          <div className="flex justify-center gap-8" role="tablist" aria-label="API calls">
            {CALLS.map((c) => (
              <button
                key={c.key}
                role="tab"
                aria-selected={tab === c.key}
                onClick={() => setTab(c.key)}
                className={cn("py-2 text-[15px] transition-colors", tab === c.key ? "font-semibold text-frost" : "text-frost-soft hover:text-frost")}
              >
                {c.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-center font-mono text-[12px] text-frost-soft">{call.route}</p>

          <pre className="mt-8 overflow-x-auto border-y border-frost/10 py-7 font-mono text-[13px] leading-[1.75]">
            <code>
              {call.lines.map((line, i) => (
                <span key={i} className="block">
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
      </Reveal>
    </section>
  );
}
