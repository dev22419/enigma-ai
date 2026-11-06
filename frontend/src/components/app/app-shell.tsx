// AI-assisted: Used Claude to write this file.
"use client";

import { SquarePen } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";

import { Logo } from "@/components/landing/site-nav";
import { cn } from "@/lib/utils";
import { countdown, getBalance, knownAddress, localPhase, threadsOf, useIndex, useNow, type Thread } from "./jobs";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-night text-frost lg:flex-row">
      <Suspense fallback={<aside className="shrink-0 lg:w-[16rem]" />}>
        <Sidebar />
      </Suspense>
      <div className="relative min-w-0 flex-1">
        {/* A single, faint pool of light at the top of the workspace */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(ellipse_50%_60%_at_50%_0%,rgb(2_151_222/0.09),transparent_70%)]" aria-hidden="true" />
        <div className="relative">{children}</div>
      </div>
    </div>
  );
}

function dayLabel(ms: number, now: number) {
  const d = new Date(ms).toDateString();
  if (d === new Date(now).toDateString()) return "Today";
  if (d === new Date(now - 86400000).toDateString()) return "Yesterday";
  return "Earlier";
}

function Sidebar() {
  const index = useIndex();
  const now = useNow();
  const path = usePathname();
  const params = useSearchParams();
  const current = path === "/chat" ? params.get("t") : null;
  const threads = index ? threadsOf(index) : [];

  const groups: [string, Thread[]][] = [];
  for (const t of threads) {
    const label = now ? dayLabel(t.updatedAt, now) : "Recent";
    const g = groups.find(([l]) => l === label);
    if (g) g[1].push(t);
    else groups.push([label, [t]]);
  }

  return (
    <aside className="flex shrink-0 flex-col border-frost/[0.06] max-lg:border-b lg:sticky lg:top-0 lg:h-dvh lg:w-[16rem] lg:border-r">
      <div className="flex h-14 items-center justify-between px-4">
        <Link href="/" aria-label="Enigma home" className="opacity-90 transition-opacity hover:opacity-100">
          <Logo className="[&_span]:text-[17px]" />
        </Link>
        <Link href="/chat" aria-label="New conversation" title="New conversation" className="grid size-8 place-items-center rounded-md text-frost/60 transition-colors hover:bg-frost/[0.06] hover:text-frost">
          <SquarePen className="size-[17px]" strokeWidth={1.75} />
        </Link>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pt-2 pb-4 max-lg:hidden">
        {index && threads.length === 0 && <p className="px-2 text-[13px] leading-relaxed text-frost-soft/60">Conversations appear here with the time their answers have left.</p>}
        {groups.map(([label, list]) => (
          <div key={label} className="mb-5">
            <p className="px-2 pb-1 text-[11.5px] text-frost-soft/50">{label}</p>
            <ul>
              {list.map((t) => {
                const phases = t.jobs.map((j) => (now ? localPhase(j, now) : "working"));
                const live = t.jobs.filter((j, i) => phases[i] === "readable" && j.expiresAt).sort((a, b) => (a.expiresAt ?? 0) - (b.expiresAt ?? 0))[0];
                const allGone = phases.every((p) => p === "destroyed");
                return (
                  <li key={t.id}>
                    <Link
                      href={`/chat?t=${t.id}`}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-2 py-1.5 text-[13.5px] transition-colors",
                        current === t.id ? "bg-frost/[0.07] text-frost" : "text-frost/70 hover:bg-frost/[0.04] hover:text-frost",
                      )}
                    >
                      <span className={cn("min-w-0 flex-1 truncate", allGone && "text-frost/30")}>{t.jobs[0].fileName}</span>
                      {live?.expiresAt ? (
                        <span className="shrink-0 font-mono text-[10.5px] text-volt-lit/80">{countdown(live.expiresAt - now)}</span>
                      ) : allGone ? (
                        <span className="size-1 shrink-0 rounded-full bg-melon/60" title="All answers destroyed" />
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="space-y-0.5 border-frost/[0.06] px-2 py-3 max-lg:flex max-lg:gap-1 max-lg:space-y-0 max-lg:pt-0 lg:border-t">
        {[
          ["/chat", "Chat", path === "/chat" || path.startsWith("/job")],
          ["/dashboard", "Ledger", path === "/dashboard"],
        ].map(([href, label, on]) => (
          <Link
            key={href as string}
            href={href as string}
            className={cn("block rounded-md px-2 py-1.5 text-[13.5px] transition-colors", on ? "text-frost" : "text-frost/55 hover:text-frost")}
          >
            {label}
          </Link>
        ))}
        <Balance address={knownAddress(index)} />
      </div>
    </aside>
  );
}

function Balance({ address }: { address: string | null }) {
  const [balance, setBalance] = useState<string | null>(null);
  useEffect(() => {
    if (!address) return;
    let off = false;
    getBalance(address)
      .then((b) => !off && setBalance(Number(b.balance).toFixed(2)))
      .catch(() => undefined);
    return () => {
      off = true;
    };
  }, [address]);
  return (
    <p className="px-2 pt-2 text-[12px] text-frost-soft/60 max-lg:hidden">
      Balance: <span className="num text-frost/80">{balance ? `${balance} USDT` : "shown after your first job"}</span>
    </p>
  );
}
