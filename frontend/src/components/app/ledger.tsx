// AI-assisted: Used Claude to design and write this file.
"use client";

import { FileText, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useAccount } from "wagmi";
import { loadWipeReceipt } from "@/lib/client/vault";
import { DepositFlow, WalletBox, useMounted } from "./wallet";
import { cn } from "@/lib/utils";
import { TaskChip } from "./bits";
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

/** One tile per task type the API accepts, each lit with one colour from the palette. */
const FOLDERS = [
  { key: "medical", name: "Medical", tone: "#0297de" },
  { key: "legal", name: "Legal", tone: "#e59cf4" },
  { key: "financial", name: "Financial", tone: "#eaf3f9" },
];

function Folder({ tone, id }: { tone: string; id: string }) {
  return (
    <svg viewBox="0 0 120 92" className="h-[76px] w-auto" aria-hidden="true">
      <defs>
        <linearGradient id={`front-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={tone} stopOpacity="0.5" />
          <stop offset="1" stopColor={tone} stopOpacity="0.08" />
        </linearGradient>
      </defs>
      <path d="M6 18a8 8 0 0 1 8-8h28l10 10h54a8 8 0 0 1 8 8v54a8 8 0 0 1-8 8H14a8 8 0 0 1-8-8Z" fill="#17181a" />
      <rect x="20" y="4" width="62" height="56" rx="5" fill="#f2f5f7" transform="rotate(-5 50 30)" />
      <rect x="30" y="16" width="34" height="3.5" rx="1.75" fill="#02070a" opacity="0.28" transform="rotate(-5 47 18)" />
      <rect x="31" y="25" width="24" height="3.5" rx="1.75" fill="#02070a" opacity="0.18" transform="rotate(-5 43 27)" />
      <path d="M6 42a8 8 0 0 1 8-8h92a8 8 0 0 1 8 8v40a8 8 0 0 1-8 8H14a8 8 0 0 1-8-8Z" fill="#101113" />
      <path d="M6 42a8 8 0 0 1 8-8h92a8 8 0 0 1 8 8v40a8 8 0 0 1-8 8H14a8 8 0 0 1-8-8Z" fill={`url(#front-${id})`} stroke="#ffffff" strokeOpacity="0.14" />
    </svg>
  );
}

function StatusPill({ row, now }: { row: Row; now: number }) {
  const readable = row.phase === "readable";
  const gone = row.phase === "destroyed" || row.phase === "failed";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] whitespace-nowrap",
        readable ? "bg-volt/15 text-volt-lit" : gone ? "bg-orchid/12 text-orchid" : "bg-frost/[0.07] text-frost-soft",
      )}
    >
      <i className={cn("size-1.5 rounded-full", readable ? "live-dot bg-volt-lit" : gone ? "bg-orchid" : "bg-frost-soft")} />
      {readable && row.expiresAt ? countdown(row.expiresAt - now) : row.phase === "destroyed" ? "key destroyed" : row.phase}
    </span>
  );
}

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
  const [filter, setFilter] = useState<string | null>(null);
  const [loads, setLoads] = useState(0);

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
  }, [address, loads]);

  // A deposit changes the balance, so read it again
  useEffect(() => {
    const again = () => setLoads((n) => n + 1);
    window.addEventListener("enigma:credit", again);
    return () => window.removeEventListener("enigma:credit", again);
  }, []);

  if (!index || !now) return <p className="p-12 font-mono text-[12px] text-frost-soft">Opening the ledger…</p>;

  // Jobs from the chain for this wallet, joined with names from this browser; then local-only previews.
  // What was read for a wallet leaves with it
  const onChain = address ? history : null;
  const credit = address ? balance : null;
  const byId = new Map(index.map((e) => [e.id, e]));
  const rows: Row[] = [
    ...(onChain ?? []).map((h): Row => {
      const e = byId.get(String(h.jobId));
      const exp = h.expiresAt ? h.expiresAt * 1000 : null;
      const phase: Phase =
        h.status === "Refunded" ? "refunded" : loadWipeReceipt(String(h.jobId)) || (exp && now >= exp) ? "destroyed" : h.status === "Completed" ? "readable" : h.error ? "failed" : "working";
      return { id: String(h.jobId), fileName: e?.fileName ?? `Job ${h.jobId}`, task: e?.task ?? null, ttl: h.expirySeconds, expiresAt: exp, phase, preview: false, tx: h.completeTxHash, verified: h.destruction?.valid ?? null };
    }),
    ...index
      .filter((e) => e.preview || !onChain)
      .map((e): Row => ({ id: e.id, fileName: e.fileName, task: e.task, ttl: e.ttl, expiresAt: e.expiresAt, phase: localPhase(e, now), preview: e.preview, tx: null, verified: null })),
  ].sort((a, b) => (b.expiresAt ?? 0) - (a.expiresAt ?? 0));

  const live = rows.filter((r) => r.phase === "readable" || r.phase === "working");
  const destroyed = rows.filter((r) => r.phase === "destroyed").length;
  const shown = filter ? rows.filter((r) => r.task === filter) : rows;

  const stats: [string, string, string, string][] = [
    ["Prepaid balance", credit ? Number(credit.balance).toFixed(2) : "–", "USDT", ""],
    ["Jobs left", credit ? String(credit.queriesRemaining) : "–", credit ? `at ${Number(credit.queryPrice).toFixed(2)} each` : "", ""],
    ["Readable now", String(live.length), "keys still alive", "text-volt-lit"],
    ["Destroyed", String(destroyed), "receipts kept", "text-orchid"],
  ];

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-frost/[0.07] pb-4">
        <div>
          <p className="font-mono text-[11.5px] text-frost-soft">Workspace / Ledger</p>
          <h1 className="mt-1 text-[24px] font-semibold tracking-[-0.02em]">Ledger</h1>
        </div>
        <div className="flex items-center gap-3">
          {address && <p className="font-mono text-[12px] text-frost-soft">{short(address, 6, 4)}</p>}
          <Button asChild size="sm">
            <Link href="/chat">New job</Link>
          </Button>
        </div>
      </div>

      {/* The sidebar's wallet box is hidden on small screens */}
      <div className="mt-4 rounded-xl bg-frost/[0.05] p-3 lg:hidden">
        <WalletBox />
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-[14px] bg-frost/[0.07] lg:grid-cols-4">
        {stats.map(([label, value, note, tone]) => (
          <div key={label} className="bg-[#242424]/90 p-4">
            <dt className="text-[12.5px] text-frost-soft">{label}</dt>
            <dd className="mt-2 flex items-baseline gap-2">
              <span className={cn("num text-[26px] leading-none font-semibold tracking-[-0.02em]", tone)}>{value}</span>
              <span className="font-mono text-[11px] text-frost-soft">{note}</span>
            </dd>
          </div>
        ))}
      </dl>

      {error && address && <p className="mt-4 font-mono text-[12px] text-orchid">Couldn&rsquo;t load on-chain data: {error}</p>}

      <div className="mt-7 grid gap-7 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold">Document types</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {FOLDERS.map((f) => {
              const all = rows.filter((r) => r.task === f.key);
              const open = all.filter((r) => r.phase === "readable").length;
              const on = filter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setFilter(on ? null : f.key)}
                  aria-pressed={on}
                  className={cn(
                    "rounded-[14px] bg-[#242424]/70 p-4 text-left backdrop-blur-md shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)] transition-shadow hover:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.2)]",
                    on && "shadow-[inset_0_0_0_1px_rgb(255_255_255/0.5)]",
                  )}
                >
                  <Folder tone={f.tone} id={f.key} />
                  <p className="mt-3 text-[14.5px] font-semibold">{f.name}</p>
                  <p className="mt-0.5 font-mono text-[11.5px] text-frost-soft">
                    {all.length} {all.length === 1 ? "job" : "jobs"}, {open} readable
                  </p>
                </button>
              );
            })}
          </div>

          <div className="mt-7 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">Recent jobs</h2>
            {filter && (
              <button onClick={() => setFilter(null)} className="flex items-center gap-1 text-[12.5px] text-frost-soft hover:text-frost">
                <X className="size-3.5" /> Clear filter
              </button>
            )}
          </div>

          {shown.length === 0 ? (
            <div className="mt-3 rounded-[14px] border border-dashed border-frost/15 p-8 text-center">
              <p className="text-[15px]">{filter ? "No jobs of this type in this list." : "No jobs yet."}</p>
              {!filter && (
                <Button asChild className="mt-4">
                  <Link href="/chat">Start one</Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-[14px] bg-[#242424]/70 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)] backdrop-blur-md">
              <table className="w-full min-w-[40rem] text-left text-[13.5px]">
                <thead className="text-[12px] text-frost-soft">
                  <tr>
                    {["Document", "Task", "Lifespan", "Status", "Receipt"].map((h) => (
                      <th key={h} className="px-4 py-3 font-normal">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.id} className="border-t border-frost/[0.06] transition-colors hover:bg-frost/[0.03]">
                      <td className="max-w-[17rem] px-4 py-2.5">
                        <Link href={`/job/${r.id}`} className="flex items-center gap-2.5">
                          <FileText className="size-4 shrink-0 text-frost-soft" strokeWidth={1.6} />
                          <span className="min-w-0 truncate">{r.fileName}</span>
                          <span className="shrink-0 font-mono text-[11px] text-frost-soft">{r.preview ? "Preview" : `#${r.id}`}</span>
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        <TaskChip task={r.task} className="text-frost-soft" />
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[12px] text-frost-soft">{r.ttl ? ttlLabel(r.ttl) : ""}</td>
                      <td className="px-4 py-2.5">
                        <StatusPill row={r} now={now} />
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[11.5px]">
                        {r.verified === true ? <span className="text-volt-lit">signature valid</span> : r.tx ? <span className="text-frost/60">{short(r.tx, 6, 4)}</span> : <span className="text-frost-soft/60">pending</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {index.length > 0 && (
            <button onClick={forgetAll} className="mt-4 text-[12.5px] text-frost-soft underline underline-offset-4 hover:text-frost">
              Forget the job list in this browser
            </button>
          )}
        </div>

        <aside className="min-w-0">
          <h2 className="text-[15px] font-semibold">Credit</h2>
          <div className="mt-3">
            <DepositFlow />
          </div>
        </aside>
      </div>
    </div>
  );
}
