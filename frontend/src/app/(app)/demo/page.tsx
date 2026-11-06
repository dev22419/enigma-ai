"use client";
// AI-assisted: Used Claude for the demo page
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Countdown } from "@/components/countdown";
import { KeyBadge } from "@/components/key-badge";
import { KeyDestruction, type KeyStage } from "@/components/key-destruction";
import { expiryOf, getJob, localJobs, phaseOf, type JobPhase, type JobView } from "@/lib/client/api";

const REPLAY_SECONDS = 20;
const REPLAY_RESULT = "SUMMARY\nThe agreement renews automatically for 24 months.\n\nRISKS AND UNUSUAL CLAUSES\n- Clause 7: notice is due 90 days before expiry.";

interface Panel {
  jobId: string;
  phase: JobPhase;
  expiresAt: number | null;
  total: number;
  result: string | null;
  ciphertext: string | null;
  entityExists: boolean;
  keyState: string | null;
  stage: KeyStage;
}

function fromJob(job: JobView): Panel {
  const phase = phaseOf(job);
  return {
    jobId: String(job.jobId), phase, expiresAt: expiryOf(job), total: job.expirySeconds,
    result: job.result, ciphertext: job.ciphertextPreview, entityExists: job.arkivEntityExists,
    keyState: job.keyState, stage: job.keyDestroyed ? "destroyed" : "live",
  };
}

/** Encrypts in this browser, so the replay's ciphertext is real even though no job ran. */
async function sealForReplay() {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(REPLAY_RESULT)));
  return btoa(String.fromCharCode(...bytes));
}

function SplitScreen({ panel, simulated }: { panel: Panel; simulated: boolean }) {
  const live = panel.phase === "live";
  const query = `GET /entity/job_${panel.jobId}`;
  return (
    <>
      <div className="split">
        <section className="split-left" aria-label="What the user sees">
          <header><h2>Result</h2><KeyBadge phase={panel.phase} keyState={panel.keyState ?? (simulated ? "SIMULATED" : null)} /></header>
          {live && panel.expiresAt
            ? <Countdown expiresAt={panel.expiresAt} totalSeconds={panel.total} />
            : <div className="count count-lg" data-tone="red"><span>00:00</span></div>}
          {live && panel.result ? <pre>{panel.result}</pre> : <p className="job-gone">{live ? "Encrypted" : "Gone"}</p>}
        </section>
        <section className="split-right" aria-label="The raw record">
          <header><h2>Raw Arkiv query</h2></header>
          <pre className="raw">
            <span>{query}</span>{"\n"}
            <em data-ok={panel.entityExists}>{panel.entityExists ? "200 OK" : "404 not found"}</em>{"\n\n"}
            {panel.entityExists ? (panel.ciphertext ?? "") : "entity expired"}
          </pre>
        </section>
      </div>
      {(panel.stage !== "live" || panel.ciphertext) && <KeyDestruction stage={panel.stage} ciphertext={panel.ciphertext} />}
    </>
  );
}

function Replay() {
  const [run, setRun] = useState(0);
  const [panel, setPanel] = useState<Panel | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    sealForReplay().then((ciphertext) => {
      if (cancelled) return;
      const base: Panel = {
        jobId: "replay", phase: "live", expiresAt: Math.floor(Date.now() / 1000) + REPLAY_SECONDS, total: REPLAY_SECONDS,
        result: REPLAY_RESULT, ciphertext, entityExists: true, keyState: "SIMULATED", stage: "live",
      };
      setPanel(base);
      timers.push(setTimeout(() => setPanel({ ...base, phase: "destroyed", result: null, entityExists: false, stage: "destroying" }), REPLAY_SECONDS * 1000));
      timers.push(setTimeout(() => setPanel({ ...base, phase: "destroyed", result: null, entityExists: false, stage: "destroyed" }), (REPLAY_SECONDS + 1.2) * 1000));
    });
    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, [run]);

  return (
    <>
      <p className="sim">Simulated replay. No job ran. Run a real job to see live data here.</p>
      {panel && <SplitScreen panel={panel} simulated />}
      <button type="button" className="btn" onClick={() => setRun((r) => r + 1)}>Replay</button>
    </>
  );
}

function RealJob({ id }: { id: string }) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setPanel(fromJob(await getJob(id)));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load this job");
    }
  }, [id]);

  useEffect(() => {
    const start = setTimeout(load, 0);
    const timer = setInterval(load, 3000);
    return () => { clearTimeout(start); clearInterval(timer); };
  }, [load]);

  if (error) return <p className="err" role="alert">{error}</p>;
  return panel ? <SplitScreen panel={panel} simulated={false} /> : <p className="muted">Loading job {id}</p>;
}

function Demo() {
  const fromUrl = useSearchParams().get("job");
  const [recent, setRecent] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // localStorage exists only in the browser, so this has to wait for mount.
    const start = setTimeout(() => { setRecent(localJobs()[0]?.id ?? null); setReady(true); }, 0);
    return () => clearTimeout(start);
  }, []);

  const id = fromUrl ?? recent;
  return (
    <main className="page">
      <header className="head"><h1>Watch it disappear</h1></header>
      {!fromUrl && !ready ? null : id ? <RealJob id={id} /> : <Replay />}
    </main>
  );
}

export default function DemoPage() {
  return <Suspense><Demo /></Suspense>;
}
