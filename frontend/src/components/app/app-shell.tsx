// AI-assisted: Used Claude to write this file.
"use client";

import { House, LayoutGrid, PanelLeft, PanelLeftClose, PanelLeftOpen, Play, SquarePen } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

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

const CLOSED_KEY = "enigma:sidebar-closed";
const CLOSED_EVENT = "enigma:sidebar";

/** Remembered in this browser, so the sidebar stays how you left it. */
function setSidebarClosed(closed: boolean) {
  localStorage.setItem(CLOSED_KEY, closed ? "1" : "0");
  window.dispatchEvent(new Event(CLOSED_EVENT));
}

function useSidebarClosed() {
  return useSyncExternalStore(
    (notify) => {
      window.addEventListener(CLOSED_EVENT, notify);
      return () => window.removeEventListener(CLOSED_EVENT, notify);
    },
    () => localStorage.getItem(CLOSED_KEY) === "1",
    () => false,
  );
}

const ICON_BUTTON = "grid size-8 shrink-0 place-items-center rounded-full text-frost/60 transition-colors hover:bg-frost/[0.07] hover:text-frost";

export function AppShell({ children }: { children: ReactNode }) {
  const [full, setFull] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const closed = useSidebarClosed();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawer(false);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        if (matchMedia("(min-width: 64rem)").matches) setSidebarClosed(!closed);
        else setDrawer((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closed]);

  useEffect(() => {
    if (drawer) panel.current?.focus();
  }, [drawer]);

  return (
    <WaveContext.Provider value={setFull}>
      <VaultInit />
      <KeyWiper />
      <div className="app-theme flex h-dvh flex-col bg-[#0c0c0c] text-frost lg:flex-row lg:p-1.5 lg:pl-0">
        {/* Phone: a top bar, with the full sidebar in a slide-out menu */}
        <header className="flex h-12 shrink-0 items-center gap-1.5 px-2 lg:hidden">
          <button onClick={() => setDrawer(true)} aria-label="Open menu" aria-expanded={drawer} className={ICON_BUTTON}>
            <PanelLeft className="size-[17px]" strokeWidth={1.75} />
          </button>
          <Link href="/" aria-label="Enigma home" className="opacity-90">
            <Logo className="[&_span]:text-[16px]" />
          </Link>
          <Link href="/chat" aria-label="New conversation" className={cn(ICON_BUTTON, "ml-auto")}>
            <SquarePen className="size-[16px]" strokeWidth={1.75} />
          </Link>
        </header>

        {/* Desktop: the full sidebar, or a rail of icons once it's closed */}
        <aside className={cn("hidden h-full shrink-0 overflow-hidden transition-[width] duration-200 motion-reduce:transition-none lg:block", closed ? "w-14" : "w-[15rem]")}>
          <Suspense fallback={null}>{closed ? <Rail /> : <SidebarBody onClose={() => setSidebarClosed(true)} closeHint="Close sidebar (Ctrl+B)" />}</Suspense>
        </aside>

        <main className="relative min-h-0 min-w-0 flex-1 overflow-hidden lg:rounded-[14px]">
          <Wave full={full} />
          <div className="relative h-full overflow-y-auto">{children}</div>
        </main>

        <div className={cn("fixed inset-0 z-40 lg:hidden", !drawer && "pointer-events-none")}>
          <div onClick={() => setDrawer(false)} aria-hidden="true" className={cn("absolute inset-0 bg-black/60 transition-opacity duration-200 motion-reduce:transition-none", drawer ? "opacity-100" : "opacity-0")} />
          <div
            ref={panel}
            role="dialog"
            aria-label="Menu"
            aria-modal="true"
            tabIndex={-1}
            inert={!drawer}
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("a")) setDrawer(false);
            }}
            className={cn(
              "absolute inset-y-0 left-0 w-[17rem] max-w-[85vw] bg-[#0c0c0c] transition-transform duration-200 focus:outline-none motion-reduce:transition-none",
              drawer ? "translate-x-0" : "-translate-x-full",
            )}
          >
            <Suspense fallback={null}>
              <SidebarBody onClose={() => setDrawer(false)} closeHint="Close menu" />
            </Suspense>
          </div>
        </div>
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

/** The open thread, and which of Home and Ledger is lit. */
function useNav() {
  const index = useIndex();
  const path = usePathname();
  const params = useSearchParams();
  const jobId = path.startsWith("/job/") ? path.split("/")[2] : null;
  const current = path === "/chat" ? params.get("t") : jobId ? (index?.find((e) => e.id === jobId)?.thread ?? `job-${jobId}`) : null;
  const threads = index ? threadsOf(index) : [];
  const nav: [string, string, typeof House, boolean][] = [
    // An open conversation lights up in the list, so Home only lights up for a new one.
    ["/chat", "Home", House, path === "/chat" && !threads.some((t) => t.id === current)],
    ["/demo", "Demo", Play, path === "/demo"],
    ["/dashboard", "Ledger", LayoutGrid, path === "/dashboard"],
  ];
  return { index, current, threads, nav };
}

/** The closed sidebar: icons only, with the way back at the top. */
function Rail() {
  const { nav } = useNav();
  return (
    <div className="flex h-full flex-col items-center gap-1 pt-2">
      <button onClick={() => setSidebarClosed(false)} aria-label="Open sidebar" title="Open sidebar (Ctrl+B)" className={ICON_BUTTON}>
        <PanelLeftOpen className="size-[17px]" strokeWidth={1.75} />
      </button>
      <Link href="/chat" aria-label="New conversation" title="New conversation" className={ICON_BUTTON}>
        <SquarePen className="size-[16px]" strokeWidth={1.75} />
      </Link>
      <span className="my-1 h-px w-5 bg-frost/10" aria-hidden="true" />
      {nav.map(([href, label, Icon, on]) => (
        <Link key={href} href={href} aria-label={label} title={label} aria-current={on ? "page" : undefined} className={cn(ICON_BUTTON, on && "bg-frost/[0.1] text-frost")}>
          <Icon className="size-[15px]" strokeWidth={1.8} />
        </Link>
      ))}
    </div>
  );
}

function SidebarBody({ onClose, closeHint }: { onClose: () => void; closeHint: string }) {
  const now = useNow();
  const { index, current, threads, nav } = useNav();

  const groups: [string, Thread[]][] = [];
  for (const t of threads) {
    const label = now ? dayLabel(t.updatedAt, now) : "Recent";
    const g = groups.find(([l]) => l === label);
    if (g) g[1].push(t);
    else groups.push([label, [t]]);
  }

  return (
    <div className="flex h-full flex-col px-2.5 lg:w-[15rem]">
      <div className="flex h-12 items-center justify-between pr-0.5 pl-2">
        <Link href="/" aria-label="Enigma home" className="opacity-90 transition-opacity hover:opacity-100">
          <Logo className="[&_span]:text-[16px]" />
        </Link>
        <div className="flex">
          <Link href="/chat" aria-label="New conversation" title="New conversation" className={ICON_BUTTON}>
            <SquarePen className="size-[16px]" strokeWidth={1.75} />
          </Link>
          <button onClick={onClose} aria-label={closeHint} title={closeHint} className={ICON_BUTTON}>
            <PanelLeftClose className="size-[17px]" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      <nav aria-label="Workspace" className="mt-1 flex flex-col gap-0.5">
        {nav.map(([href, label, Icon, on]) => (
          <Link
            key={href}
            href={href}
            aria-current={on ? "page" : undefined}
            className={cn("flex items-center gap-2.5 rounded-full px-3 py-1.5 text-[14px] transition-colors", on ? "bg-frost/[0.1] text-frost" : "text-frost/65 hover:bg-frost/[0.05] hover:text-frost")}
          >
            <Icon className="size-[15px]" strokeWidth={1.8} />
            {label}
          </Link>
        ))}
      </nav>

      <div className="mt-5 min-h-0 flex-1 overflow-y-auto pb-4">
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
                      <span className={cn("min-w-0 flex-1 truncate", allGone && "text-frost/45")}>{t.jobs[0].fileName}</span>
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

      <div className="mb-1.5 rounded-xl bg-frost/[0.05] p-2">
        <WalletBox />
      </div>
    </div>
  );
}
