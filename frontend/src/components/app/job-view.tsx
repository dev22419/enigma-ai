// AI-assisted: Used Claude to design and write this file.
"use client";

import Link from "next/link";
import { useState } from "react";

import { Seal } from "@/components/landing/certificate";
import { Guilloche } from "@/components/landing/guilloche";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check, Fuse, PhaseChip, Ref, Stamp, TaskChip } from "./bits";
import { countdown, getReceipt, sections, short, tryDecrypt, ttlLabel, useJobVM, useNow, when, type ApiReceipt, type JobVM } from "./jobs";

export function JobView({ id }: { id: string }) {
  const { vm, error, receipt, loading } = useJobVM(id);
  const now = useNow();

  if (loading) return <p className="p-12 font-mono text-[12px] text-frost-soft">Loading job {id}…</p>;
  if (!vm)
    return (
      <div className="px-4 py-16 sm:px-12">
        <h1 className="display text-[2.4rem]">Couldn&rsquo;t open job {id}</h1>
        <p className="mt-3 max-w-[34rem] font-mono text-[13px] leading-relaxed text-frost/75">{error?.message}</p>
        <Button asChild className="mt-6">
          <Link href="/chat">Start a new job</Link>
        </Button>
      </div>
    );

  return (
    <div className="grid min-h-full grid-cols-1 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <main className="min-w-0 px-4 py-8 sm:px-8 lg:px-12 lg:py-10">
        <Header vm={vm} />
        {error && <p className="mt-4 font-mono text-[12px] text-orchid">Last refresh failed: {error.message}</p>}
        <AnswerCard vm={vm} now={now} />
        <Trail vm={vm} />
      </main>
      <CertificateDrawer vm={vm} receipt={receipt} />
    </div>
  );
}

function Header({ vm }: { vm: JobVM }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 font-mono text-[12px] text-frost-soft">
          <span>{vm.preview ? "Preview job" : `Job ${vm.id}`}</span>
          <TaskChip task="analysis" className="text-frost-soft" />
          {vm.ttl > 0 && <span>lifespan {ttlLabel(vm.ttl)}</span>}
          {vm.preview && (
            <span className="rounded-full border border-orchid/50 px-2 py-px text-orchid" title="Simulated in this browser because the server isn't configured">
              simulated
            </span>
          )}
        </div>
        <h1 className={cn("display mt-3 truncate text-[clamp(1.7rem,3.4vw,2.8rem)]", vm.phase === "destroyed" && "text-frost/45")}>{vm.fileName}</h1>
        <p className="mt-1 font-mono text-[11.5px] text-frost-soft">Started {when(vm.createdAt)}</p>
      </div>
      <PhaseChip phase={vm.phase} />
    </div>
  );
}

function AnswerCard({ vm, now }: { vm: JobVM; now: number }) {
  const [copied, setCopied] = useState(false);
  const left = vm.expiresAt ? vm.expiresAt - now : 0;
  const frac = vm.ttl && vm.expiresAt ? left / (vm.ttl * 1000) : 0;

  if (vm.phase === "working")
    return (
      <section className="relative mt-8 h-72 overflow-hidden rounded-[16px] border border-night-line bg-night-2">
        <Guilloche variant="rosette" cx={0.5} cy={0.5} size={0.5} color="rgba(92,196,255,0.14)" accent="rgba(229,156,244,0.45)" />
        <div className="absolute inset-0 grid place-items-center text-center">
          <div className="rounded-[12px] bg-night-2/90 px-5 py-3">
            <p className="text-[19px] font-semibold">Inside the enclave</p>
            <p className="mt-1 text-[14px] text-frost-soft">The answer shows up here once the job completes.</p>
          </div>
        </div>
      </section>
    );

  if (vm.phase === "locked")
    return (
      <section className="mt-8 rounded-[16px] border border-night-line bg-night-2 p-6">
        <p className="text-[18px] font-semibold">The key for this answer isn&rsquo;t in this browser</p>
        <p className="mt-2 max-w-[38rem] text-[14.5px] leading-relaxed text-frost-soft">
          Keys live only in the browser session that sent the job. This one doesn&rsquo;t have it, so the answer stays
          encrypted here, which is how it should be.
        </p>
        {vm.ciphertextPreview && <p className="mt-4 font-mono text-[12px] leading-relaxed break-all text-frost/30">{vm.ciphertextPreview}</p>}
        <DecryptCheck id={vm.id} />
      </section>
    );

  if (vm.phase === "failed" || vm.phase === "refunded" || vm.phase === "missing")
    return (
      <section className="mt-8 rounded-[16px] border border-night-line bg-night-2 p-6">
        <p className="text-[18px] font-semibold">
          {vm.phase === "refunded" ? "This job was refunded" : vm.phase === "missing" ? "No job with this id on-chain" : "This job failed"}
        </p>
        <p className="mt-2 max-w-[36rem] text-[14.5px] leading-relaxed text-frost-soft">
          {vm.phase === "refunded"
            ? "Something failed after payment was locked, so the key was wiped and the contract returned the payment."
            : vm.phase === "failed"
              ? "The job was opened but never completed. The contract refunds the payment after its timeout."
              : "Nothing was stored for it."}
        </p>
      </section>
    );

  const gone = vm.phase === "destroyed";
  const late = !gone && frac < 0.3;
  return (
    <section
      className={cn(
        "relative mt-8 overflow-hidden rounded-[16px] border bg-night-2",
        gone ? "border-night-line" : "border-volt/30 shadow-[0_30px_100px_-50px_rgb(53_184_173/0.7)]",
      )}
      aria-live="polite"
    >
      <div className="flex flex-wrap items-end justify-between gap-6 p-5 sm:p-7">
        <div>
          <p className="font-mono text-[11px] text-frost-soft">{gone ? "key destroyed at" : "key destroyed in"}</p>
          <p
            className={cn(
              "display num mt-1 text-[clamp(2.6rem,6.5vw,5.2rem)] leading-[0.85] tracking-[-0.03em]",
              gone ? "text-frost/30" : late ? "text-orchid" : "text-frost",
            )}
          >
            {gone
              ? new Date((vm.destruction?.destructionTimestamp ?? 0) * 1000 || vm.expiresAt || now).toLocaleTimeString("en-GB")
              : countdown(left)}
          </p>
        </div>
        {!gone && vm.result && (
          <Button
            variant="outline-frost"
            onClick={() =>
              navigator.clipboard?.writeText(vm.result ?? "").then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              })
            }
          >
            {copied ? "Copied" : "Copy answer"}
          </Button>
        )}
      </div>
      <Fuse frac={gone ? 0 : frac} burning={!gone} className="mx-5 h-2 sm:mx-7" />

      <div className="relative mt-6 border-t border-night-line p-5 sm:p-7">
        {!gone && vm.result && (
          <div className="grid gap-6 md:grid-cols-2">
            {sections(vm.result).map((s, i, all) => (
              <div key={i} className={cn((i === 0 || (i === all.length - 1 && i % 2 === 1)) && "md:col-span-2")}>
                {s.title && <h3 className="text-[13px] font-semibold text-volt-lit">{s.title}</h3>}
                <ul className="mt-2 space-y-1.5">
                  {s.items.map((it, j) => (
                    <li key={j} className={cn("flex gap-2.5 leading-snug", i === 0 ? "text-[17px]" : "text-[14.5px] text-frost/90")}>
                      {i !== 0 && <span className="mt-[8px] size-1 shrink-0 rounded-full bg-frost/40" />}
                      {it}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {gone && (
          <div>
            <p className="text-[13px] text-frost-soft">What&rsquo;s left of the answer</p>
            <p className="mt-2 font-mono text-[12px] leading-relaxed break-all text-frost/30">
              {vm.ciphertextPreview ?? "The Arkiv entity has expired, so even the ciphertext is gone."}
            </p>
            <p className="mt-4 max-w-[34rem] text-[14px] leading-relaxed text-frost-soft">
              Your browser wiped the only key that could open this. Nobody can read the answer again, including Enigma.
            </p>
            <div className="mt-5 flex flex-wrap items-end justify-between gap-5">
              {!vm.preview && <DecryptCheck id={vm.id} />}
              <Stamp className="ml-auto" sub="KEY WIPED" />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function Trail({ vm }: { vm: JobVM }) {
  const done = (v: unknown) => (v ? "done" : vm.phase === "working" ? "active" : "todo");
  const rows: { what: string; where: string; value: string | null; state: "done" | "active" | "todo" | "skipped" }[] = [
    { what: "Payment locked", where: "Whitechain", value: vm.createTxHash, state: done(vm.createTxHash) },
    {
      what: vm.inputStorage ? "Encrypted copy stored" : "Encrypted copy stored (off on this server)",
      where: "0G Storage",
      value: vm.inputStorage?.rootHash ?? null,
      state: vm.inputStorage ? "done" : vm.phase === "working" ? "todo" : "skipped",
    },
    { what: "Read inside the enclave", where: "0G Compute", value: vm.requestId, state: done(vm.requestId) },
    { what: "Attestation checked", where: "0G Compute", value: vm.attestationHash, state: done(vm.attestationHash) },
    { what: "Encrypted answer stored", where: "Arkiv", value: vm.arkivEntityKey, state: done(vm.arkivEntityKey) },
    { what: "Job completed", where: "Whitechain", value: vm.completeTxHash, state: done(vm.completeTxHash) },
    {
      what: "Key destroyed",
      where: "Enigma oracle",
      value: vm.destruction?.receiptHash ?? null,
      state: vm.destruction ? "done" : vm.phase === "readable" ? "todo" : done(null),
    },
    { what: "Wipe recorded on-chain", where: "Whitechain", value: vm.anchorTxHash, state: vm.anchorTxHash ? "done" : "todo" },
  ];
  return (
    <section className="mt-8">
      <h2 className="text-[15px] font-semibold">Evidence</h2>
      <ol className="mt-3 overflow-hidden rounded-[14px] border border-night-line bg-night-2/70">
        {rows.map((r, i) => (
          <li key={r.what} className={cn("flex items-center gap-4 px-4 py-3 text-[14px]", i > 0 && "border-t border-night-line", (r.state === "todo" || r.state === "skipped") && "opacity-50")}>
            <Check state={r.state === "active" && i > 0 && rows[i - 1].state !== "done" ? "todo" : r.state} />
            <span className="min-w-0 flex-1">{r.what}</span>
            <span className="hidden font-mono text-[11px] text-frost-soft sm:inline">{r.where}</span>
            {r.value ? (
              <CopyValue value={r.value} />
            ) : (
              <span className="w-28 shrink-0 sm:w-36" />
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function CertificateDrawer({ vm, receipt }: { vm: JobVM; receipt: ApiReceipt | null }) {
  const gone = vm.phase === "destroyed";
  // Sealed once the wipe is on record: anchored on-chain, done in this browser, or the older server-signed receipt checks out.
  const valid = vm.preview ? !!vm.destruction : !!vm.anchorTxHash || vm.destruction?.signer === "this browser" || receipt?.destructionReceiptValid === true;
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const data = vm.preview
        ? { note: "Preview job simulated in the browser. Not a real receipt.", ...vm, result: undefined }
        : await getReceipt(vm.id);
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `enigma-receipt-${vm.id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="border-night-line bg-night-2/60 px-5 py-8 max-xl:border-t xl:border-l">
      <p className="text-[13px] font-semibold text-frost-soft">Receipt</p>
      <div className="mt-4 rotate-[0.4deg] rounded-[4px] bg-sheet p-1.5 text-ink shadow-[0_30px_60px_-30px_rgb(0_0_0/0.8)]">
        <div className="border-[1.5px] border-night p-0.5">
          <div className="relative border border-night/30">
            <div className="relative h-9 overflow-hidden border-b border-night/20">
              <Guilloche variant="band" color="rgba(2,151,222,0.32)" accent="rgba(229,156,244,0.65)" animate={!gone} />
            </div>
            <div className="px-4 py-5">
              <div className="flex items-start justify-between font-mono text-[9.5px] text-ink-soft">
                <span>Whitechain testnet, 1874</span>
                <span className="text-[11px] text-orchid">No. {vm.preview ? "preview" : vm.id}</span>
              </div>
              <p className="display narrow mt-4 text-center text-[1.35rem] leading-none tracking-[0.01em] uppercase">
                {gone ? "Certificate of destruction" : "Receipt pending"}
              </p>
              <dl className="mt-5 divide-y divide-dotted divide-night/20">
                <Ref paper label="File hash" value={vm.fileHash} display={short(vm.fileHash)} />
                <Ref paper label="Result hash" value={vm.resultHash} display={short(vm.resultHash)} />
                <Ref paper label="TEE attestation" value={vm.attestationHash} display={short(vm.attestationHash)} />
                <Ref paper label="Arkiv entity" value={vm.arkivEntityKey} display={short(vm.arkivEntityKey)} />
                <Ref paper label="Expires" value={vm.expiresAt ? when(vm.expiresAt) : null} />
                <Ref paper label="Key destroyed" value={vm.destruction ? when(vm.destruction.destructionTimestamp * 1000) : null} />
                <Ref paper label="Wiped by" value={vm.destruction?.signer ?? null} display={vm.destruction?.signer?.startsWith("0x") ? short(vm.destruction.signer, 6, 4) : vm.destruction?.signer} />
              </dl>
              <div className="mt-5 flex items-end justify-between gap-3">
                <p className="font-mono text-[9.5px] leading-relaxed text-ink-soft">
                  {gone
                    ? vm.anchorTxHash
                      ? "Key wipe recorded on-chain."
                      : valid
                        ? "Key wiped in this browser. Not yet recorded on-chain."
                        : "Waiting for the wipe to be recorded…"
                    : "The seal appears once the key is destroyed."}
                </p>
                <div className={cn("transition-[opacity,transform,filter] duration-500", gone && valid ? "scale-100 opacity-100" : "scale-90 opacity-15 grayscale")}>
                  <Seal className="size-20 text-night" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Button onClick={download} disabled={busy || !vm.completeTxHash} variant="outline-frost" className="mt-6 w-full">
        {busy ? "Preparing…" : "Download receipt"}
      </Button>
      <p className="mt-3 text-[12.5px] leading-snug text-frost-soft">
        The receipt holds hashes, ids and timestamps only. It never contains the document or the answer.
      </p>
    </aside>
  );
}

/** Task #76: show, live, that the ciphertext can't be opened once the key is gone. */
function DecryptCheck({ id }: { id: string }) {
  const [state, setState] = useState<{ busy: boolean; msg: string | null; ok: boolean }>({ busy: false, msg: null, ok: false });
  return (
    <div>
      <button
        onClick={async () => {
          setState({ busy: true, msg: null, ok: false });
          const r = await tryDecrypt(id);
          setState({ busy: false, ok: r.ok, msg: r.ok ? "Decrypted. The key is still in this browser." : `Decryption failed: ${r.reason}` });
        }}
        disabled={state.busy}
        className="rounded-full border border-frost/15 px-4 py-1.5 text-[13px] text-frost/80 transition-colors hover:border-frost/30 hover:text-frost disabled:opacity-50"
      >
        {state.busy ? "Trying…" : "Try to decrypt it now"}
      </button>
      {state.msg && <p className={cn("mt-2 font-mono text-[12px]", state.ok ? "text-volt-lit" : "text-orchid")}>{state.msg}</p>}
    </div>
  );
}

function CopyValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() =>
        navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        })
      }
      title="Copy"
      className="w-28 shrink-0 truncate text-right font-mono text-[11px] text-frost/70 hover:text-volt-lit sm:w-36"
    >
      {copied ? "Copied" : short(value, 8, 6)}
    </button>
  );
}
