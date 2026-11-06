// AI-assisted: Used Claude to write this file.
"use client";

import { cn } from "@/lib/utils";
import type { Phase } from "./jobs";

/** Lifespan bar: electric blue while there is time, orchid in the last 30%. */
export function Fuse({ frac, className, burning }: { frac: number; className?: string; burning?: boolean }) {
  const f = Math.max(0, Math.min(1, frac));
  const late = f > 0 && f < 0.3;
  return (
    <div className={cn("relative h-1.5 rounded-full bg-frost/10", className)}>
      <div
        className={cn("absolute inset-y-0 left-0 w-full origin-left rounded-full transition-colors duration-500", late ? "bg-orchid" : "bg-volt")}
        style={{ transform: `scaleX(${f})` }}
      />
      {burning && f > 0 && (
        <span
          className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-frost shadow-[0_0_0_3px_rgb(92_196_255/0.3),0_0_12px_rgb(92_196_255/0.9)]"
          style={{ left: `${f * 100}%` }}
        />
      )}
    </div>
  );
}

export function TaskChip({ task, className }: { task: string | null; className?: string }) {
  if (!task) return null;
  return (
    <span className={cn("inline-flex items-center rounded-full border border-current/30 px-2 py-px font-mono text-[10.5px] capitalize", className)}>
      {task}
    </span>
  );
}

const PHASE: Record<Phase, [string, string]> = {
  working: ["Working", "border-frost/30 text-frost"],
  readable: ["Readable", "border-volt/50 text-volt-lit"],
  locked: ["Key not in this browser", "border-frost/30 text-frost-soft"],
  destroyed: ["Key destroyed", "border-orchid/60 text-orchid"],
  failed: ["Failed", "border-orchid/60 text-orchid"],
  refunded: ["Refunded", "border-frost/30 text-frost-soft"],
  missing: ["Not found", "border-frost/30 text-frost-soft"],
};

export function PhaseChip({ phase }: { phase: Phase }) {
  const [label, cls] = PHASE[phase];
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full border px-2.5 py-1 font-mono text-[11px]", cls)}>
      <span className={cn("size-1.5 rounded-full bg-current", (phase === "working" || phase === "readable") && "animate-pulse")} />
      {label}
    </span>
  );
}

export function Check({ state }: { state: "done" | "active" | "todo" | "skipped" }) {
  if (state === "active")
    return <span className="size-4 shrink-0 animate-spin rounded-full border-[1.5px] border-volt border-t-transparent" aria-label="In progress" />;
  if (state === "todo") return <span className="size-4 shrink-0 rounded-full border-[1.5px] border-frost/20" aria-label="Waiting" />;
  if (state === "skipped") return <span className="grid size-4 shrink-0 place-items-center rounded-full border-[1.5px] border-frost/20 text-[9px] text-frost/40" aria-label="Skipped">–</span>;
  return (
    <span className="grid size-4 shrink-0 place-items-center rounded-full bg-volt text-night" aria-label="Done">
      <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
        <path d="M1 4.2 3 6 7 1.8" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    </span>
  );
}

/** A labelled value that can be copied. Hashes and ids only, never secrets. */
export function Ref({ label, value, display, paper }: { label: string; value: string | null | undefined; display?: string; paper?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className={cn("shrink-0 text-[12px]", paper ? "text-ink-soft" : "text-frost-soft")}>{label}</dt>
      <dd className="min-w-0 truncate text-right font-mono text-[11px]">
        {value ? (
          <button
            type="button"
            title={`Copy ${label.toLowerCase()}`}
            onClick={() => navigator.clipboard?.writeText(value)}
            className={cn("transition-colors", paper ? "text-ink hover:text-volt" : "text-frost/85 hover:text-volt-lit")}
          >
            {display ?? value}
          </button>
        ) : (
          <span className={paper ? "text-ink/30" : "text-frost/30"}>not yet</span>
        )}
      </dd>
    </div>
  );
}
