"use client";
// AI-assisted: Used Claude for the receipt card
import { useState } from "react";
import { hasHash, short, type ReceiptView } from "@/lib/client/api";

function Row({ label, value, full }: { label: string; value: string | null; full?: string | null }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!full) return;
    await navigator.clipboard.writeText(full);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <div className="rc-row">
      <dt>{label}</dt>
      <dd>
        {full ? <button type="button" className="rc-copy" onClick={copy} title={full}>{copied ? "Copied" : value}</button> : value}
      </dd>
    </div>
  );
}

const when = (unix: number | null | undefined) => (unix ? new Date(unix * 1000).toLocaleString() : "Not recorded");

export function ReceiptCard({ receipt }: { receipt: ReceiptView }) {
  const d = receipt.destruction;
  const attested = hasHash(receipt.attestationHash);
  return (
    <section className="rc" aria-label="Receipt">
      <header>
        <h2>Receipt</h2>
        <span>Job {receipt.jobId}</span>
      </header>
      <dl>
        <Row label="Job tx" value={short(receipt.createTxHash)} full={receipt.createTxHash} />
        <Row label="Completion tx" value={short(receipt.completeTxHash)} full={receipt.completeTxHash} />
        <Row label="File hash" value={short(receipt.fileHash)} full={receipt.fileHash} />
        <Row label="Result hash" value={hasHash(receipt.resultHash) ? short(receipt.resultHash) : "None"} full={hasHash(receipt.resultHash) ? receipt.resultHash : null} />
        {/* attestationHash commits to the 0G request record. It is not an enclave signature: see docs/attestation-status.md. */}
        <Row label="TEE run" value={attested ? `Recorded ${short(receipt.attestationHash)}` : "Not recorded"} full={attested ? receipt.attestationHash : null} />
        <Row label="Expires" value={when(receipt.expiresAt)} />
        <Row label="Key" value={receipt.keyDestroyed ? "Destroyed" : "Active or not tracked here"} />
        {d && <Row label="Destroyed at" value={when(d.destructionTimestamp)} />}
        {d && <Row label="Destruction proof" value={`${receipt.destructionReceiptValid ? "Valid" : "Invalid"} ${short(d.receiptHash)}`} full={d.receiptHash} />}
      </dl>
      <p className="rc-foot">TEE run records the serving provider. Independent enclave verification is not available yet.</p>
    </section>
  );
}
