// AI-assisted: Used Claude to design and write this file.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Fuse } from "@/components/app/bits";
import { BurnAway } from "@/components/app/burn-away";
import { countdown, sections } from "@/components/app/jobs";

/**
 * Demo page for judges: a split-screen view that makes Enigma's cryptographic
 * erasure visible. Left shows the decrypted result (readable while the key lives),
 * right shows what Arkiv stores (raw ciphertext). A countdown burns down, and when
 * it hits zero the key is destroyed with an animation and the left panel goes dark.
 */

const DEMO_TTL = 60;

const DEMO_RESULT = `SUMMARY
- Follow-up for type 2 diabetes and raised blood pressure. Increased thirst and dizziness on standing for three weeks.

KEY FINDINGS
- HbA1c 8.4% (flagged high), up from 7.6% in April.
- Blood pressure 148/92 mmHg seated.

DIAGNOSES AND HISTORY
- Type 2 diabetes since 2019. Hypertension since 2021. Penicillin allergy (rash).

MEDICATIONS
- Metformin 1000 mg twice daily.
- Lisinopril 10 mg once daily.

ITEMS NEEDING CLINICIAN ATTENTION
- Dizziness on standing while on lisinopril.
- HbA1c rising across the last two results.`;

function rand(n: number) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

type DemoPhase = "idle" | "encrypting" | "inferring" | "readable" | "wiping" | "destroyed";

export default function DemoPage() {
  const [phase, setPhase] = useState<DemoPhase>("idle");
  const [expiresAt, setExpiresAt] = useState(0);
  const [now, setNow] = useState(0);
  const [ciphertext, setCiphertext] = useState("");
  const [keyHex, setKeyHex] = useState("");
  const [wipeFlash, setWipeFlash] = useState(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    tickRef.current = setInterval(() => setNow(Date.now()), 250);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, []);

  useEffect(() => {
    if (phase === "readable" && expiresAt && now >= expiresAt) {
      setPhase("wiping");
      setWipeFlash(true);
      setTimeout(() => setWipeFlash(false), 600);
      setTimeout(() => setPhase("destroyed"), 1800);
    }
  }, [phase, expiresAt, now]);

  const start = useCallback(() => {
    setPhase("encrypting");
    const key = rand(32);
    setKeyHex(key);
    setCiphertext(rand(128));

    setTimeout(() => {
      setPhase("inferring");
      setTimeout(() => {
        setPhase("readable");
        setExpiresAt(Date.now() + DEMO_TTL * 1000);
      }, 2200);
    }, 1500);
  }, []);

  const reset = useCallback(() => {
    setPhase("idle");
    setExpiresAt(0);
    setCiphertext("");
    setKeyHex("");
  }, []);

  const left = expiresAt ? Math.max(0, expiresAt - now) : DEMO_TTL * 1000;
  const frac = expiresAt ? left / (DEMO_TTL * 1000) : 1;
  const gone = phase === "destroyed" || phase === "wiping";

  return (
    <div className="relative flex min-h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-night-line px-4 py-4 sm:px-8">
        <div>
          <h1 className="display text-[clamp(1.4rem,3vw,2rem)]">Live demo</h1>
          <p className="mt-0.5 text-[13px] text-frost-soft">
            Watch a document get analysed inside a TEE, encrypted, and then irreversibly destroyed.
          </p>
        </div>
        <div className="flex gap-3">
          {phase === "idle" && (
            <Button onClick={start}>Run the demo</Button>
          )}
          {(phase === "destroyed" || phase === "readable") && (
            <Button variant="outline-frost" onClick={reset}>Reset</Button>
          )}
        </div>
      </header>

      {phase === "idle" ? (
        <IdleState onStart={start} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* Left: decrypted result */}
          <div className="relative flex min-h-0 flex-1 flex-col border-night-line lg:border-r">
            <div className="flex items-center justify-between border-b border-night-line px-4 py-3 sm:px-6">
              <span className="font-mono text-[12px] text-frost-soft">Decrypted result</span>
              <span className={cn(
                "font-mono text-[11px]",
                gone ? "text-orchid" : "text-volt-lit",
              )}>
                {gone ? "KEY DESTROYED" : phase === "readable" ? "KEY IN BROWSER" : "PROCESSING"}
              </span>
            </div>

            {/* Countdown */}
            {(phase === "readable" || gone) && (
              <div className="border-b border-night-line px-4 py-4 sm:px-6">
                <p className="font-mono text-[10px] text-frost-soft">
                  {gone ? "destroyed at" : "key destroyed in"}
                </p>
                <p className={cn(
                  "display num mt-1 text-[clamp(2rem,5vw,3.6rem)] leading-[0.85] tracking-[-0.03em]",
                  gone ? "text-frost/25" : frac < 0.3 ? "text-orchid" : "text-frost",
                )}>
                  {gone
                    ? new Date(expiresAt).toLocaleTimeString("en-GB")
                    : countdown(left)}
                </p>
                <Fuse frac={gone ? 0 : frac} burning={!gone} className="mt-3" />
              </div>
            )}

            {/* Result body */}
            <div className={cn(
              "flex-1 overflow-y-auto px-4 py-5 sm:px-6 transition-opacity duration-700",
              gone && "opacity-0",
              (phase === "encrypting" || phase === "inferring") && "flex items-center justify-center",
            )}>
              {phase === "encrypting" && (
                <div className="text-center">
                  <Spinner />
                  <p className="mt-3 text-[14px] text-frost-soft">Encrypting document in your browser…</p>
                </div>
              )}
              {phase === "inferring" && (
                <div className="text-center">
                  <Spinner />
                  <p className="mt-3 text-[14px] text-frost-soft">Reading inside the TEE enclave…</p>
                </div>
              )}
              {(phase === "readable" || phase === "wiping") && (
                <BurnAway expiresAt={expiresAt} className="grid gap-5 md:grid-cols-2">
                  {sections(DEMO_RESULT).map((s, i) => (
                    <div key={i} className={cn(i === 0 && "md:col-span-2")}>
                      {s.title && <h3 className="text-[13px] font-semibold text-volt-lit">{s.title}</h3>}
                      <ul className="mt-2 space-y-1.5">
                        {s.items.map((it, j) => (
                          <li key={j} className={cn("flex gap-2.5 leading-snug", i === 0 ? "text-[15px]" : "text-[13.5px] text-frost/90")}>
                            {i !== 0 && <span className="mt-[7px] size-1 shrink-0 rounded-full bg-frost/40" />}
                            {it}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </BurnAway>
              )}
            </div>

            {/* Destroyed overlay */}
            {gone && (
              <div className={cn(
                "absolute inset-0 flex flex-col items-center justify-center bg-night/80 backdrop-blur-sm transition-opacity duration-500",
                phase === "wiping" ? "opacity-0 animate-[fadeIn_0.8s_ease-out_forwards]" : "opacity-100",
              )}>
                <KeyWipeAnimation active={phase === "wiping"} />
                {phase === "destroyed" && (
                  <>
                    <p className="mt-6 max-w-[28rem] text-center text-[14px] leading-relaxed text-frost-soft">
                      The encryption key was destroyed. The ciphertext on the right is now permanently unreadable — not even Enigma can recover it.
                    </p>
                  </>
                )}
              </div>
            )}

            {/* Wipe flash effect */}
            {wipeFlash && (
              <div className="pointer-events-none absolute inset-0 animate-[flashOut_0.6s_ease-out_forwards] bg-orchid/30" />
            )}
          </div>

          {/* Right: raw ciphertext + key */}
          <div className="flex min-h-0 flex-col bg-night-2/50 lg:w-[28rem] xl:w-[32rem]">
            <div className="flex items-center justify-between border-b border-night-line px-4 py-3 sm:px-6">
              <span className="font-mono text-[12px] text-frost-soft">What Arkiv stores</span>
              <span className="font-mono text-[10px] text-frost-soft/60">raw ciphertext</span>
            </div>

            {/* Key display */}
            <div className={cn(
              "border-b border-night-line px-4 py-4 sm:px-6 transition-all duration-500",
              gone && "bg-orchid/[0.06]",
            )}>
              <p className="font-mono text-[10px] text-frost-soft">AES-256-GCM key (browser only)</p>
              <div className={cn(
                "mt-2 overflow-hidden rounded-md border px-3 py-2 font-mono text-[11px] leading-relaxed transition-all duration-700",
                gone
                  ? "border-orchid/30 bg-orchid/[0.08] text-orchid/70 line-through decoration-orchid/50"
                  : "border-frost/10 bg-night-3 text-volt-lit/80",
              )}>
                {keyHex ? (
                  gone ? (
                    <span className="opacity-40">{"0".repeat(64)}</span>
                  ) : (
                    <span className="break-all">{keyHex}</span>
                  )
                ) : (
                  <span className="text-frost/20">not yet generated</span>
                )}
              </div>
              <p className={cn(
                "mt-1.5 font-mono text-[10px] transition-colors duration-500",
                gone ? "text-orchid" : "text-frost-soft/60",
              )}>
                {gone ? "zeroed and deleted from IndexedDB" : "non-extractable CryptoKey in IndexedDB"}
              </p>
            </div>

            {/* Ciphertext */}
            <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
              <p className="font-mono text-[10px] text-frost-soft">Encrypted result (AES-256-GCM envelope)</p>
              <div className="mt-2 font-mono text-[10.5px] leading-relaxed break-all text-frost/25">
                {ciphertext ? (
                  <>
                    <span className="text-frost/40">{"{"}&quot;v&quot;:1,&quot;kid&quot;:&quot;k-demo&quot;,&quot;ct&quot;:&quot;</span>
                    {ciphertext}
                    <span className="text-frost/40">&quot;,&quot;iv&quot;:&quot;{rand(12)}&quot;,&quot;tag&quot;:&quot;{rand(16)}&quot;{"}"}</span>
                  </>
                ) : (
                  <span className="text-frost/15">waiting for job…</span>
                )}
              </div>
              {ciphertext && (
                <div className="mt-6 space-y-3 border-t border-night-line pt-4">
                  <p className="font-mono text-[10px] text-frost-soft">Proof of what happened</p>
                  <ProofRow label="File hash" value={`0x${rand(32)}`} />
                  <ProofRow label="Result hash" value={`0x${rand(32)}`} />
                  <ProofRow label="TEE attestation" value={`0x${rand(32)}`} />
                  <ProofRow label="Whitechain tx" value={`0x${rand(32)}`} />
                  <ProofRow label="Arkiv entity" value={`0x${rand(32)}`} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function IdleState({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      <div className="size-20 rounded-full border border-frost/10 bg-frost/[0.04] grid place-items-center">
        <svg viewBox="0 0 24 24" className="size-9 text-volt" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      </div>
      <h2 className="display mt-6 text-[clamp(1.6rem,3.5vw,2.4rem)]">AI that forgets by design</h2>
      <p className="mt-3 max-w-[30rem] text-[14.5px] leading-relaxed text-frost-soft">
        Upload a sensitive document. Watch it get analysed inside a TEE. See the encryption key get destroyed when the timer runs out. The ciphertext remains, but nobody can ever read it again.
      </p>
      <Button onClick={onStart} className="mt-8">
        Run the demo
      </Button>
      <p className="mt-3 font-mono text-[11px] text-frost-soft/60">
        Uses synthetic data — no real documents are processed
      </p>
    </div>
  );
}

function Spinner() {
  return (
    <div className="size-10 animate-spin rounded-full border-[2.5px] border-frost/15 border-t-volt" />
  );
}

function KeyWipeAnimation({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <div className="size-16 animate-ping rounded-full bg-orchid/30" />
        <div className="absolute inset-0 grid place-items-center">
          <svg viewBox="0 0 24 24" className="size-10 text-orchid animate-[shake_0.4s_ease-in-out_3]" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
          </svg>
        </div>
      </div>
      <p className="font-mono text-[13px] text-orchid animate-pulse">Destroying encryption key…</p>
    </div>
  );
}

function ProofRow({ label, value }: { label: string; value: string }) {
  const short = value.length > 20 ? `${value.slice(0, 10)}…${value.slice(-8)}` : value;
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="font-mono text-[10px] text-frost-soft">{label}</span>
      <span className="font-mono text-[10px] text-frost/50">{short}</span>
    </div>
  );
}
