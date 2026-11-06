// AI-assisted: Used Claude for the key status badge
import type { JobPhase } from "@/lib/client/api";

const LABEL: Record<JobPhase, string> = {
  running: "Running",
  live: "Key active",
  expired: "Expired",
  destroyed: "Key destroyed",
  failed: "Failed",
};

export function KeyBadge({ phase, keyState }: { phase: JobPhase; keyState?: string | null }) {
  // An expired job without a key row ran on another server, so its key state is unknown here.
  const label = phase === "expired" && !keyState ? "Expired, key not tracked here" : LABEL[phase];
  return <span className="badge" data-phase={phase}>{label}</span>;
}
