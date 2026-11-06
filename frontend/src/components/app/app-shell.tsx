// AI-assisted: Used Claude to write this file.
"use client";

import { BookText, MessageSquare, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";

import { Logo } from "@/components/landing/site-nav";
import { cn } from "@/lib/utils";
import { countdown, getBalance, knownAddress, localPhase, threadsOf, useIndex, useNow, type Thread } from "./jobs";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-night text-frost lg:flex-row">
      <Suspense fallback={<aside className="shrink-0 bg-night lg:w-[17.5rem]" />}>
        <Sidebar />
      </Suspense>
      <div className="relative min-w-0 flex-1">
        {/* Light falling into the workspace from above, as on the landing */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(ellipse_55%_70%_at_50%_0%,rgb(2_151_222/0.16),transparent_70%)]" aria-hidden="true" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[360px] bg-[radial-gradient(ellipse_45%_60%_at_50%_100%,rgb(252_115_77/0.08),transparent_70%)]" aria-hidden="true" />
        <div className="relative">{children}</div>
      </div>
    </div>
  );
}

function dayLabel(ms: number, now: number) {
  const d = new Date(ms);
  const today = new Date(now);
  const yesterday = new Date(now - 86400000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
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

  const nav: [string, string, typeof MessageSquare, boolean][] = [
    ["/chat", "Chat", MessageSquare, path === "/chat" || path.startsWith("/job")],
    ["/dashboard", "Ledger", BookText, path === "/dashboard"],
  ];

  return (
    <aside className="flex shrink-0 flex-col border-night-line bg-[linear-gradient(180deg,#040b11,#02070a)] max-lg:border-b lg:sticky lg:top-0 lg:h-dvh lg:w-[17.5rem] lg:border-r">
      <div className="flex items-center justify-between px-5 pt-5 pb-4">
        <Link href="/" aria-label="Enigma home">
          <Logo />
        </Link>
        <span className="rounded-full border border-volt/30 bg-volt/10 px-2 py-0.5 font-mono text-[10px] text-volt-lit">testnet</span>
      </div>

      <div className="px-3">
        <Link
          href="/chat"
          className="group flex items-center gap-2.5 rounded-[12px] border border-frost/10 bg-frost/[0.04] px-3 py-2.5 text-[14px] font-medium transition-colors hover:border-melon/50 hover:bg-melon/10"
        >
          <span className="grid size-6 place-items-center rounded-full bg-melon text-night transition-shadow group-hover:shadow-[0_0_16px_rgb(252_115_77/0.7)]">
            <Plus className="size-3.5" strokeWidth={3} />
          </span>
          New conversation
        </Link>
        <nav className="mt-3 space-y-0.5 max-lg:flex max-lg:gap-1 max-lg:space-y-0">
          {nav.map(([href, label, Icon, on]) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-[14px] transition-colors",
                on ? "bg-frost/[0.07] text-frost" : "text-frost-soft hover:bg-frost/[0.04] hover:text-frost",
              )}
            >
              <Icon className="size-4" strokeWidth={1.75} />
              {label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="mt-5 min-h-0 flex-1 overflow-y-auto px-3 pb-4 max-lg:hidden">
        {index && threads.length === 0 && (
          <p className="px-3 text-[13px] leading-relaxed text-frost-soft/80">Your conversations show up here, each with the time its answers have left.</p>
        )}
        {groups.map(([label, list]) => (
          <div key={label} className="mb-4">
            <p className="px-3 pb-1.5 text-[11.5px] font-medium text-frost-soft/70">{label}</p>
            <ul className="space-y-0.5">
              {list.map((t) => {
                const phases = t.jobs.map((j) => (now ? localPhase(j, now) : "working"));
                const live = t.jobs.filter((j, i) => phases[i] === "readable" && j.expiresAt).sort((a, b) => (a.expiresAt ?? 0) - (b.expiresAt ?? 0))[0];
                const allGone = phases.every((p) => p === "destroyed");
                const frac = live?.expiresAt ? Math.max(0, (live.expiresAt - now) / (live.ttl * 1000)) : allGone ? 0 : 1;
                return (
                  <li key={t.id}>
                    <Link
                      href={`/chat?t=${t.id}`}
                      className={cn(
                        "relative block overflow-hidden rounded-[10px] px-3 py-2 transition-colors",
                        current === t.id ? "bg-frost/[0.07]" : "hover:bg-frost/[0.04]",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn("truncate text-[13.5px]", allGone ? "text-frost/35 line-through decoration-frost/20" : "text-frost/90")}>
                          {t.jobs[0].fileName}
                        </span>
                        <span className={cn("shrink-0 font-mono text-[10.5px]", allGone ? "text-melon/70" : live ? "text-volt-lit" : "text-frost-soft")}>
                          {allGone ? "gone" : live?.expiresAt ? countdown(live.expiresAt - now) : "…"}
                        </span>
                      </div>
                      {/* Hairline fuse along the bottom of the row */}
                      <span
                        className={cn("absolute bottom-0 left-3 h-px origin-left", frac < 0.3 && frac > 0 ? "bg-melon" : "bg-volt/70")}
                        style={{ width: "calc(100% - 1.5rem)", transform: `scaleX(${frac})` }}
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <BalanceCard address={knownAddress(index)} />
    </aside>
  );
}

function BalanceCard({ address }: { address: string | null }) {
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
    <div className="p-3 max-lg:hidden">
      <Link href="/dashboard" className="relative block overflow-hidden rounded-[14px] border border-frost/10 p-4 transition-colors hover:border-volt/40">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_90%_at_0%_100%,rgb(2_151_222/0.3),transparent_60%),radial-gradient(ellipse_70%_80%_at_100%_100%,rgb(252_115_77/0.22),transparent_60%),#061019]" />
        <div className="absolute inset-0 -z-10 bg-[repeating-linear-gradient(90deg,rgb(2_7_10/0.4)_0_1px,transparent_1px_10px)]" />
        <p className="text-[12px] text-frost-soft">Prepaid balance</p>
        <p className="display num mt-1 text-[1.6rem] leading-none">
          {balance ?? "–"} <span className="font-mono text-[11px] font-normal tracking-normal text-frost-soft">USDT</span>
        </p>
        <p className="mt-2 text-[11.5px] text-frost-soft">{address ? "Each message locks one query price" : "Shown after your first real job"}</p>
      </Link>
    </div>
  );
}
