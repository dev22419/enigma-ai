// AI-assisted: Used Claude to write this file.
"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

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
const COLOR = { k: "text-frost", s: "text-melon-lit", n: "text-volt-lit", p: "text-frost-soft", c: "text-volt-lit" };

const NOTES = [
  ["The key never leaves the browser", "The server only ever stores ciphertext. Reading an answer later needs both the job's access token and the key in your browser."],
  ["Errors never carry secrets", "Every error is scrubbed before it leaves the server: API keys, private keys, bearer tokens, long hex and document text are replaced with [redacted]."],
  ["Documents can't give orders", "Text inside a file is treated as content, never as instructions. A document that tells the model to ignore its rules gets summarised like any other."],
];

export function ApiSection() {
  const [tab, setTab] = useState(CALLS[0].key);
  const call = CALLS.find((c) => c.key === tab) ?? CALLS[0];

  return (
    <section id="api" className="relative text-frost">
      <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-14 px-4 pt-4 pb-8 sm:px-8 md:pt-6 md:pb-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20">
        <div>
          <h2 className="display text-[clamp(2.2rem,5vw,4.2rem)]">Three calls, no keys on the server</h2>
          <p className="mt-6 max-w-[27rem] text-[17px] leading-relaxed text-frost/75">
            Open the job with ciphertext, have the enclave read the document, then store the answer your browser
            encrypted. The server is a proxy: it never holds a key or an answer it could read.
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
          <div className="flex items-center border-b border-night-line px-2" role="tablist" aria-label="API calls">
            {CALLS.map((c) => (
              <button
                key={c.key}
                role="tab"
                aria-selected={tab === c.key}
                onClick={() => setTab(c.key)}
                className={cn("relative px-3 py-3 font-mono text-[12px] transition-colors", tab === c.key ? "text-frost" : "text-frost-soft hover:text-frost")}
              >
                {c.label}
                {tab === c.key && <span className="absolute inset-x-3 bottom-0 h-[2px] bg-melon" />}
              </button>
            ))}
            <span className="ml-auto truncate pr-3 font-mono text-[11px] text-frost-soft max-sm:hidden">{call.route}</span>
          </div>
          <pre className="overflow-x-auto px-5 py-6 font-mono text-[13px] leading-[1.75] sm:px-6">
            <code>
              {call.lines.map((line, i) => (
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
