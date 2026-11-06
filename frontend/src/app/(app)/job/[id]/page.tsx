"use client";
// AI-assisted: Used Claude for the job detail page
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Countdown } from "@/components/countdown";
import { KeyBadge } from "@/components/key-badge";
import { KeyDestruction } from "@/components/key-destruction";
import { ReceiptCard } from "@/components/receipt-card";
import { expiryOf, getJob, getReceipt, phaseOf, type JobView, type ReceiptView } from "@/lib/client/api";

export default function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [job, setJob] = useState<JobView | null>(null);
  const [receipt, setReceipt] = useState<ReceiptView | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [j, r] = await Promise.all([getJob(id), getReceipt(id)]);
      setJob(j);
      setReceipt(r);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load this job");
    }
  }, [id]);

  useEffect(() => {
    // Polling keeps the key state honest: it comes from the server, never from the local clock.
    const start = setTimeout(load, 0);
    const timer = setInterval(load, 5000);
    return () => { clearTimeout(start); clearInterval(timer); };
  }, [load]);

  if (error && !job) {
    return (
      <main className="page page-narrow">
        <h1>Job {id}</h1>
        <p className="err" role="alert">{error}</p>
        <Link className="link" href="/dashboard">Back to dashboard</Link>
      </main>
    );
  }
  if (!job) return <main className="page"><p className="muted">Loading job {id}</p></main>;

  const phase = phaseOf(job), expiry = expiryOf(job);
  const gone = phase === "destroyed" || phase === "expired";

  return (
    <main className="page">
      <header className="head">
        <h1>Job {job.jobId}</h1>
        <KeyBadge phase={phase} keyState={job.keyState} />
      </header>

      <div className="job">
        <div className="job-time">
          {phase === "live" && expiry
            ? <Countdown expiresAt={expiry} totalSeconds={job.expirySeconds} onExpire={load} />
            : <div className="count count-lg" data-tone={gone ? "red" : "green"}><span>{gone ? "00:00" : "--:--"}</span></div>}
        </div>

        <section className="job-result" aria-label="Result">
          <h2>Result</h2>
          {job.result ? <pre>{job.result}</pre>
            : phase === "live" ? <p className="muted">Result not available here. The decryption key may not be on this server.</p>
            : phase === "running" ? <p className="muted">Still running.</p>
            : phase === "failed" ? <p className="muted">This job failed. The payment is refundable.</p>
            : <p className="job-gone">Gone</p>}
        </section>
      </div>

      {/* Only real states: an expired job with no key record says nothing about its key. */}
      {(job.keyDestroyed || job.ciphertextPreview) && (
        <KeyDestruction stage={job.keyDestroyed ? "destroyed" : "live"} ciphertext={job.ciphertextPreview} />
      )}
      {receipt && <ReceiptCard receipt={{ ...receipt, expiresAt: receipt.expiresAt ?? expiry }} />}
    </main>
  );
}
