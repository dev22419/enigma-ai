// AI-assisted: Used Claude to write this file.
"use client";

import { House, LayoutGrid, SquarePen } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";

import { Logo } from "@/components/landing/site-nav";
import { cn } from "@/lib/utils";
import { countdown, localPhase, threadsOf, useIndex, useNow, wipeExpired, type Thread } from "./jobs";
import { initVault } from "@/lib/client/vault";
import { WalletBox } from "./wallet";
import { Wave, WaveContext } from "./wave";

/** Populates the sync key-cache from IndexedDB on first mount. */
function VaultInit() {
  useEffect(() => { initVault(); }, []);
  return null;
}

/** Wipes each job's key from this browser the moment its lifespan ends (task #74). */
function KeyWiper() {
  const index = useIndex();
  useEffect(() => {
    if (!index) return;
    wipeExpired(index, Date.now());
    const id = setInterval(() => wipeExpired(index, Date.now()), 1000);
    return () => clearInterval(id);
  }, [index]);
  return null;
}

export function AppShell({ children }: { children: ReactNode }) {
  const [full, setFull] = useState(false);
  return (
    <WaveContext.Provider value={setFull}>
      <VaultInit />
      <KeyWiper />
      <div className="app-theme flex h-dvh flex-col bg-[#0c0c0c] text-frost lg:flex-row lg:p-1.5 lg:pl-0">
        <Suspense fallback={<aside className="shrink-0 lg:w-[15rem]" />}>
          <Sidebar />
        </Suspense>
        <main className="relative min-h-0 min-w-0 flex-1 overflow-hidden lg:rounded-[14px]">
          <Wave full={full} />
          <div className="relative h-full overflow-y-auto">{children}</div>
        </main>
      </div>
    </WaveContext.Provider>
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

  const nav: [string, string, typeof House, boolean][] = [
    ["/chat", "Home", House, path === "/chat" || path.startsWith("/job")],
    ["/dashboard", "Ledger", LayoutGrid, path === "/dashboard"],
  ];

  return (
    <aside className="flex shrink-0 flex-col px-2.5 max-lg:pb-2 lg:h-full lg:w-[15rem]">
      <div className="flex h-12 items-center justify-between px-2">
        <Link href="/" aria-label="Enigma home" className="opacity-90 transition-opacity hover:opacity-100">
          <Logo className="[&_span]:text-[16px]" />
        </Link>
        <Link href="/chat" aria-label="New conversation" title="New conversation" className="grid size-8 place-items-center rounded-full text-frost/60 transition-colors hover:bg-frost/[0.07] hover:text-frost">
          <SquarePen className="size-[16px]" strokeWidth={1.75} />
        </Link>
      </div>

      <nav aria-label="Workspace" className="mt-1 flex gap-0.5 lg:flex-col">
        {nav.map(([href, label, Icon, on]) => (
          <Link
            key={href}
            href={href}
            className={cn("flex items-center gap-2.5 rounded-full px-3 py-1.5 text-[14px] transition-colors", on ? "bg-frost/[0.1] text-frost" : "text-frost/65 hover:bg-frost/[0.05] hover:text-frost")}
          >
            <Icon className="size-[15px]" strokeWidth={1.8} />
            {label}
          </Link>
        ))}
      </nav>

      <div className="mt-5 min-h-0 flex-1 overflow-y-auto pb-4 max-lg:hidden">
        {index && threads.length === 0 && <p className="px-2 text-[13px] leading-relaxed text-frost-soft/60">Conversations appear here with the time their answers have left.</p>}
        {groups.map(([label, list]) => (
          <div key={label} className="mb-5">
            <p className="px-2.5 pb-1 text-[12.5px] text-frost-soft">{label}</p>
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
                        "flex items-center gap-2 rounded-full px-3 py-1.5 text-[14px] transition-colors",
                        current === t.id ? "bg-frost/[0.07] text-frost" : "text-frost/70 hover:bg-frost/[0.04] hover:text-frost",
                      )}
                    >
                      <span className={cn("min-w-0 flex-1 truncate", allGone && "text-frost/30")}>{t.jobs[0].fileName}</span>
                      {live?.expiresAt ? (
                        <span className="shrink-0 font-mono text-[10.5px] text-volt-lit/80">{countdown(live.expiresAt - now)}</span>
                      ) : allGone ? (
                        <span className="size-1 shrink-0 rounded-full bg-orchid/60" title="All answers destroyed" />
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="mb-1.5 rounded-xl bg-frost/[0.05] p-2 max-lg:hidden">
        <WalletBox />
      </div>
    </aside>
  );
}
