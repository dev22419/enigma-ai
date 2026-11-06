// AI-assisted: Used Claude to design and write this file.
"use client";

import { FileText } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * The hero's product moment: one job from upload to key destruction, replayed.
 * Mirrors the real flow: browser encrypts, /api/jobs, /api/infer, /api/jobs/[id]/result. Sample data throughout.
 */
const STAGES = [
  { key: "encrypt", label: "Encrypt", ms: 2600 },
  { key: "enclave", label: "Enclave", ms: 3000 },
  { key: "answer", label: "Answer", ms: 4600 },
  { key: "destroyed", label: "Key destroyed", ms: 3600 },
] as const;

const HEX = "0123456789abcdef";
function hex(n: number) {
  let s = "";
  for (let i = 0; i < n; i++) s += HEX[Math.floor(Math.random() * 16)];
  return s;
}

const ANSWER = [
  "Type 2 diabetes, HbA1c 8.4%, up from 7.6% in April.",
  "Lisinopril 10 mg daily. Penicillin allergy (rash).",
  "Needs attention: dizziness on standing, eGFR trending down.",
];

export function JobConsole({ className }: { className?: string }) {
  const [stage, setStage] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduce = useReducedMotion() ?? false;
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    if (paused || reduce) return;
    const id = setTimeout(() => {
      setStage((s) => {
        const next = (s + 1) % STAGES.length;
        if (next === 0) setCycle((c) => c + 1);
        return next;
      });
    }, STAGES[stage].ms);
    return () => clearTimeout(id);
  }, [stage, paused, reduce]);

  const s = STAGES[stage].key;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[10px] border border-white/10 bg-night/85 text-frost shadow-[0_0_0_1px_rgb(0_0_0/0.6)] backdrop-blur-md",
        className,
      )}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="flex items-center justify-between gap-3 border-b border-night-line px-4 py-3">
        <div className="flex items-baseline gap-3 font-mono text-[11.5px]">
          <span className="text-frost">Job 1042</span>
          <span className="text-frost-soft">deleted after 60 s</span>
        </div>
        <StatusChip stage={s} />
      </div>

      <div className="relative h-[15.5rem] px-5 py-5 sm:h-[16rem]" aria-live="polite">
        {s === "encrypt" && <Encrypt key={`e${cycle}`} />}
        {s === "enclave" && <Enclave key={`n${cycle}`} />}
        {s === "answer" && <Answer key={`a${cycle}`} ms={STAGES[2].ms} still={reduce} />}
        {s === "destroyed" && <Destroyed key={`d${cycle}`} />}
      </div>

      <div className="grid grid-cols-4 border-t border-night-line" role="tablist" aria-label="Job stages">
        {STAGES.map((st, i) => (
          <button
            key={st.key}
            role="tab"
            aria-selected={i === stage}
            onClick={() => setStage(i)}
            className={cn(
              "relative truncate px-3 py-2.5 text-left font-mono text-[10.5px] tracking-wide transition-colors",
              i === stage ? "text-frost" : i < stage ? "text-frost-soft" : "text-frost-soft/50 hover:text-frost-soft",
              i > 0 && "border-l border-night-line",
            )}
          >
            <span className="num mr-1.5 opacity-60">0{i + 1}</span>
            {st.label}
            <span
              className={cn(
                "absolute inset-x-0 top-0 h-[2px] origin-left",
                st.key === "destroyed" ? "bg-orchid" : "bg-volt",
                i < stage ? "scale-x-100" : "scale-x-0",
              )}
              style={
                i === stage && !paused && !reduce
                  ? { animation: `rail ${st.ms}ms linear forwards` }
                  : i === stage
                    ? { transform: "scaleX(1)" }
                    : undefined
              }
            />
          </button>
        ))}
      </div>
      <style>{`@keyframes rail{from{transform:scaleX(0)}to{transform:scaleX(1)}}`}</style>
    </div>
  );
}

function StatusChip({ stage }: { stage: string }) {
  const map: Record<string, [string, string]> = {
    encrypt: ["Encrypting", "text-frost border-frost/30"],
    enclave: ["In enclave", "text-volt-lit border-volt/50"],
    answer: ["Readable", "text-volt-lit border-volt/50"],
    destroyed: ["Key destroyed", "text-orchid border-orchid/60"],
  };
  const [label, cls] = map[stage];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10.5px]", cls)}>
      <span className={cn("size-1.5 rounded-full bg-current", stage !== "destroyed" && "animate-pulse")} />
      {label}
    </span>
  );
}

function Encrypt() {
  // Fixed first frame so server and client render the same; randomness starts in the interval
  const [lines, setLines] = useState([
    "9c1e04b7a2f3d8e15c60a47b02d6f19e3b7c0d4a5e28",
    "4f70c2e91a3b8d5f60e1c93a58b2d7f04a6e19c3b085",
    "b28d5e0f17a4c9b3e62d07f6c4118a2e5d9b0c3f7a61",
    "51aa3c8e2b9f04d7e61a9d30e7c25b8f1a4c0e9d3b72",
  ]);
  useEffect(() => {
    const id = setInterval(() => setLines((l) => [...l.slice(1), hex(44)]), 140);
    return () => clearInterval(id);
  }, []);
  return (
    <div>
      <div className="flex items-center gap-3 rounded-[8px] border border-night-line bg-night-3/60 p-3">
        <div className="grid size-10 place-items-center rounded-[6px] bg-frost text-night">
          <FileText className="size-5" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold">clinic_summary.pdf</p>
          <p className="font-mono text-[11px] text-frost-soft">Encrypted in your browser, AES-256-GCM</p>
        </div>
      </div>
      <div className="mt-4 h-1 overflow-hidden rounded-full bg-frost/10">
        <div className="h-full origin-left bg-volt" style={{ animation: "rail 2400ms cubic-bezier(.4,0,.2,1) forwards" }} />
      </div>
      <div className="mt-4 space-y-1 font-mono text-[11px] leading-snug text-volt-lit/70">
        {lines.map((l, i) => (
          <p key={i} className="truncate" style={{ opacity: 0.3 + i * 0.2 }}>
            {l}
          </p>
        ))}
      </div>
    </div>
  );
}

const ENCLAVE_STEPS = [
  ["2.00 USDT locked for this job", "Whitechain", "tx 0x51aa…"],
  ["Encrypted copy stored", "0G Storage", "root 0x9c1e…"],
  ["Enclave attestation checked", "0G Compute", "TDX"],
  ["Reading with 0gm-1.0-35b-a3b", "in the enclave", ""],
];

function Enclave() {
  const [n, setN] = useState(1);
  useEffect(() => {
    const id = setInterval(() => setN((x) => Math.min(ENCLAVE_STEPS.length, x + 1)), 650);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="relative h-full">
      <ul className="relative space-y-2.5">
        {ENCLAVE_STEPS.slice(0, n).map(([what, where, ref], i) => {
          const last = i === ENCLAVE_STEPS.length - 1;
          return (
            <li key={what} className="flex items-center gap-3 text-[13.5px]">
              <span
                className={cn(
                  "grid size-4 shrink-0 place-items-center rounded-full border",
                  last ? "animate-spin border-volt border-t-transparent" : "border-volt bg-volt text-night",
                )}
              >
                {!last && (
                  <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
                    <path d="M1 4.2 3 6 7 1.8" fill="none" stroke="currentColor" strokeWidth="1.6" />
                  </svg>
                )}
              </span>
              <span className="min-w-0 flex-1 truncate">{what}</span>
              <span className="hidden font-mono text-[11px] text-frost-soft sm:inline">{where}</span>
              {ref && <span className="hidden w-24 text-right font-mono text-[11px] text-frost-soft/60 md:inline">{ref}</span>}
            </li>
          );
        })}
      </ul>
      <p className="absolute bottom-0 left-0 font-mono text-[11px] text-frost-soft/70">
        What the machine&rsquo;s operator sees: <span className="text-frost/35">██████ ████ ████████</span>
      </p>
    </div>
  );
}

function Answer({ ms, still }: { ms: number; still: boolean }) {
  const total = 60;
  const [left, setLeft] = useState(total);
  const start = useRef(0);
  useEffect(() => {
    if (still) return;
    start.current = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const f = Math.min(1, (now - start.current) / ms);
      setLeft(total * (1 - f));
      if (f < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ms, still]);
  const frac = left / total;
  const late = frac < 0.3;
  return (
    <div className="flex h-full flex-col">
      <ul className="space-y-2 text-[14px] leading-snug">
        {ANSWER.map((l) => (
          <li key={l} className="flex gap-2.5">
            <span className="mt-[7px] size-1 shrink-0 rounded-full bg-volt-lit" />
            {l}
          </li>
        ))}
      </ul>
      <div className="mt-auto">
        <div className="flex items-end justify-between">
          <span className="font-mono text-[11px] text-frost-soft">key destroyed in</span>
          <span className={cn("display num text-[2.6rem] leading-none tracking-[-0.02em]", late ? "text-orchid" : "text-frost")}>
            00:{String(Math.ceil(left)).padStart(2, "0")}
          </span>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-frost/10">
          <div className={cn("h-full origin-left transition-colors", late ? "bg-orchid" : "bg-volt")} style={{ transform: `scaleX(${frac})` }} />
        </div>
      </div>
    </div>
  );
}

function Destroyed() {
  return (
    <div className="relative flex h-full flex-col">
      <div className="space-y-2 pt-1 font-mono text-[11px] leading-snug text-frost/30">
        <p className="truncate">a9f3c01e7b42d8e5f60c1a3b9d2e7f04c6a81b3e92d05f7a</p>
        <p className="truncate">0e7c25b8f1a4c09d3b7251aa3c8e2b9f04d7e61a9d30e7c2</p>
        <p className="truncate">5d9b0c3f7a61b28d5e0f17a4c9b3e62d07f6c4118a2e4f70</p>
      </div>
      <div className="stamp-in pointer-events-none absolute top-5 right-2 rounded-[6px] border-[3px] border-orchid px-3 py-1 text-orchid sm:right-6">
        <span className="display narrow block text-[2rem] leading-none tracking-[0.02em]">DESTROYED</span>
        <span className="block text-center font-mono text-[9.5px] tracking-[0.2em]">KEY GONE, DATA UNREADABLE</span>
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-dashed border-frost/20 pt-3 font-mono text-[11px]">
        <span className="text-frost-soft">Key wiped by your browser</span>
        <span className="text-volt-lit">receipt 0x7a3f…c210</span>
      </div>
    </div>
  );
}
