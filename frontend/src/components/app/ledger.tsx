// AI-assisted: Used Claude to design and write this file.
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useAccount } from "wagmi";
import { loadWipeReceipt } from "@/lib/client/vault";
import { DepositFlow, useMounted } from "./wallet";
import { cn } from "@/lib/utils";
import { Fuse, TaskChip } from "./bits";
import { ApiError, countdown, forgetAll, getBalance, knownAddress, localPhase, short, ttlLabel, useIndex, useNow, type Phase } from "./jobs";

type HistoryJob = {
  jobId: number;
  status: string;
  expirySeconds: number;
  payment: string;
  expiresAt: number | null;
  completeTxHash: string | null;
  error: string | null;
  refund: { state: string } | null;
  destruction: { valid: boolean } | null;
};

type Row = {
  id: string;
  fileName: string;
  task: string | null;
  ttl: number;
  expiresAt: number | null;
  phase: Phase;
  preview: boolean;
  tx: string | null;
  verified: boolean | null;
};

export function Ledger() {
  const index = useIndex();
  const now = useNow();
  const { address: wallet } = useAccount();
  const mounted = useMounted();
  // The connected wallet wins; otherwise fall back to the wallet that paid for jobs started in this browser.
  const address = (mounted ? wallet : undefined) ?? knownAddress(index);
  const [balance, setBalance] = useState<{ balance: string; queryPrice: string; queriesRemaining: number } | null>(null);
  const [history, setHistory] = useState<HistoryJob[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;
    let off = false;
    Promise.all([
      getBalance(address),
      fetch(`/api/history?address=${address}`, { cache: "no-store" }).then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw new ApiError(b.error ?? "History failed", r.status);
        return b.jobs as HistoryJob[];
      }),
    ])
      .then(([b, h]) => {
        if (off) return;
        setBalance(b);
        setHistory(h);
      })
      .catch((e) => !off && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      off = true;
    };
  }, [address]);

  if (!index || !now) return <p className="p-12 font-mono text-[12px] text-frost-soft">Opening the ledger…</p>;

  // Jobs from the chain for this wallet, joined with names from this browser; then local-only previews.
  const byId = new Map(index.map((e) => [e.id, e]));
  const rows: Row[] = [
    ...(history ?? []).map((h): Row => {
      const e = byId.get(String(h.jobId));
      const exp = h.expiresAt ? h.expiresAt * 1000 : null;
      const phase: Phase =
        h.status === "Refunded" ? "refunded" : loadWipeReceipt(String(h.jobId)) || (exp && now >= exp) ? "destroyed" : h.status === "Completed" ? "readable" : h.error ? "failed" : "working";
      return { id: String(h.jobId), fileName: e?.fileName ?? `Job ${h.jobId}`, task: e?.task ?? null, ttl: h.expirySeconds, expiresAt: exp, phase, preview: false, tx: h.completeTxHash, verified: h.destruction?.valid ?? null };
    }),
    ...index
      .filter((e) => e.preview || !history)
      .map((e): Row => ({ id: e.id, fileName: e.fileName, task: e.task, ttl: e.ttl, expiresAt: e.expiresAt, phase: localPhase(e, now), preview: e.preview, tx: null, verified: null })),
  ].sort((a, b) => (b.expiresAt ?? 0) - (a.expiresAt ?? 0));

  const live = rows.filter((r) => r.phase === "readable" || r.phase === "working");
  const destroyed = rows.filter((r) => r.phase === "destroyed").length;

  return (
    <div className="px-4 py-8 sm:px-8 lg:px-12 lg:py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="display text-[clamp(2.1rem,4.2vw,3.4rem)]">Ledger</h1>
        {address && <p className="font-mono text-[12px] text-frost-soft">Wallet {short(address, 6, 4)}</p>}
      </div>

      <dl className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="relative overflow-hidden rounded-[14px] border border-volt/30 bg-[linear-gradient(160deg,rgb(2_151_222/0.22),rgb(2_7_10/0)_60%),var(--night-2)] p-5">
          <dt className="text-[13px] font-semibold text-frost-soft">Prepaid balance</dt>
          <dd className="mt-2 flex items-baseline gap-2">
            <span className="display num text-[2.5rem] leading-none">{balance ? Number(balance.balance).toFixed(2) : "–"}</span>
            <span className="font-mono text-[11px] text-frost-soft">USDT</span>
          </dd>
          <dd className="mt-2 text-[12.5px] text-frost-soft">
            {balance ? `${balance.queriesRemaining} jobs left at ${Number(balance.queryPrice).toFixed(2)} each` : address ? "Loading…" : "Shown after your first real job"}
          </dd>
        </div>
        <div className="rounded-[14px] border border-night-line bg-night-2 p-5">
          <dt className="text-[13px] font-semibold text-frost-soft">Readable right now</dt>
          <dd className="display num mt-2 text-[2.5rem] leading-none text-volt-lit">{live.length}</dd>
          <dd className="mt-2 text-[12.5px] text-frost-soft">Answers whose key still exists</dd>
        </div>
        <div className="rounded-[14px] border border-night-line bg-night-2 p-5">
          <dt className="text-[13px] font-semibold text-frost-soft">Destroyed</dt>
          <dd className="display num mt-2 text-[2.5rem] leading-none text-melon">{destroyed}</dd>
          <dd className="mt-2 text-[12.5px] text-frost-soft">Keys wiped, receipts kept</dd>
        </div>
      </dl>

      {error && <p className="mt-4 font-mono text-[12px] text-melon">Couldn&rsquo;t load on-chain data: {error}</p>}

      <div className="mt-8 max-w-[34rem]">
        <DepositFlow />
      </div>

      <h2 className="mt-12 text-[15px] font-semibold">All jobs</h2>
      {rows.length === 0 ? (
        <div className="mt-3 rounded-[14px] border border-dashed border-frost/15 p-8 text-center">
          <p className="text-[15px]">No jobs yet.</p>
          <Button asChild className="mt-4">
            <Link href="/chat">Start one</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-[14px] border border-night-line">
          <table className="w-full min-w-[44rem] text-left text-[13.5px]">
            <thead className="bg-night-2 text-[12px] text-frost-soft">
              <tr>
                {["Job", "Document", "Task", "Lifespan", "Status", "Receipt"].map((h) => (
                  <th key={h} className="px-4 py-2.5 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const frac = r.phase === "readable" && r.expiresAt ? (r.expiresAt - now) / (r.ttl * 1000) : r.phase === "destroyed" ? 0 : 1;
                return (
                  <tr key={r.id} className="border-t border-night-line transition-colors hover:bg-night-2/70">
                    <td className="px-4 py-3 font-mono text-[12px]">
                      <Link href={`/job/${r.id}`} className="text-frost hover:text-volt-lit">
                        {r.preview ? "Preview" : r.id}
                      </Link>
                    </td>
                    <td className="max-w-[16rem] px-4 py-3">
                      <Link href={`/job/${r.id}`} className="block truncate hover:underline">
                        {r.fileName}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <TaskChip task={r.task} className="text-frost-soft" />
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px] text-frost-soft">{r.ttl ? ttlLabel(r.ttl) : ""}</td>
                    <td className="w-48 px-4 py-3">
                      <span
                        className={cn(
                          "font-mono text-[11.5px]",
                          r.phase === "destroyed" || r.phase === "failed" ? "text-melon" : r.phase === "readable" ? "text-volt-lit" : "text-frost-soft",
                        )}
                      >
                        {r.phase === "readable" && r.expiresAt ? `readable, ${countdown(r.expiresAt - now)}` : r.phase === "destroyed" ? "key destroyed" : r.phase}
                      </span>
                      <Fuse frac={frac} className="mt-1.5 h-1" />
                    </td>
                    <td className="px-4 py-3 font-mono text-[11.5px]">
                      {r.verified === true ? <span className="text-volt-lit">signature valid</span> : r.tx ? <span className="text-frost/60">{short(r.tx, 6, 4)}</span> : <span className="text-frost/30">pending</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {index.length > 0 && (
        <button onClick={forgetAll} className="mt-6 text-[13px] text-frost-soft underline underline-offset-4 hover:text-frost">
          Forget the job list in this browser
        </button>
      )}
    </div>
  );
}
