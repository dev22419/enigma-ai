// AI-assisted: Used Claude to design and write this file.
"use client";

import { ArrowUp, ChevronDown, FileText, ImageIcon, Loader2, Paperclip, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { useSignMessage } from "wagmi";

import { Button } from "@/components/ui/button";
import { SERVICE_PAID } from "@/lib/client/chain";
import { cn } from "@/lib/utils";
import { EnclaveOrb, OrbMark } from "./orb";
import { ConnectPill, useGate, type Gate } from "./wallet";
import {
  ApiError,
  TTL_OPTIONS,
  STAGE_LABEL,
  countdown,
  createPreview,
  newThreadId,
  remember,
  runJob,
  sections,
  ttlLabel,
  useIndex,
  useJobVM,
  useNow,
  type DirectTeeConfig,
  type IndexEntry,
  type Payer,
  type Stage,
  type Task,
} from "./jobs";

export type Sample = { key: string; label: string; task: Task; fileName: string; text: string; blurb: string };

const TASKS: { key: Task; name: string }[] = [
  { key: "medical", name: "Medical" },
  { key: "legal", name: "Legal" },
  { key: "financial", name: "Financial" },
];

const LIFESPANS = [{ label: "5 min", ttl: 300 }, ...TTL_OPTIONS].sort((a, b) => a.ttl - b.ttl);


import { canParse, parseFile } from "@/lib/client/parse-file";

const MAX_CHARS = 8_000_000;
const TEXT_EXT = /\.(txt|md|csv|json|log|xml|html?)$/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp)$/i;

type Attachment = { name: string; content: string; kind: "text" | "image"; bytes: number };
type Outgoing = { label: string; content: string; fileName: string; task: Task; ttl: number; text: string; attachment: Attachment | null };
type Pending = { key: string; thread: string; out: Outgoing; started: number; stage: Stage; error: ApiError | null; jobId?: string };
type Draft = { text: string; att: Attachment | null; task: Task; ttl: number };

/** The balance changes when a job is paid for; ask the wallet box to re-read it once the chain has caught up. */
const refreshCreditSoon = () => setTimeout(() => window.dispatchEvent(new Event("enigma:credit")), 1500);

/** Wall-clock time for event handlers (kept out of render). */
const stamp = () => Date.now();

function kb(n: number) {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function taskName(t: Task | null) {
  return TASKS.find((x) => x.key === t)?.name ?? "";
}

/* ================================================================== chat */

export function Chat({ samples }: { samples: Sample[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const index = useIndex();
  const threadId = params.get("t");
  const [allPending, setPending] = useState<Pending[]>([]);
  // What you typed this session, shown in your messages. Kept in memory only, never saved.
  const [sent, setSent] = useState<Record<string, Outgoing>>({});
  const [preview, setPreview] = useState(false);
  const [draft, setDraft] = useState<Draft>({ text: "", att: null, task: "medical", ttl: 3600 });
  const bottom = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  // Every conversation has an id in the URL; a bare /chat starts a new one.
  useEffect(() => {
    if (!threadId) router.replace(`/chat?t=${newThreadId()}`, { scroll: false });
  }, [threadId, router]);

  const pending = allPending.filter((p) => p.thread === threadId);
  // A job that's still running shows as its pending turn, not twice.
  const runningIds = allPending.map((p) => p.jobId).filter(Boolean).join(",");
  const jobs = useMemo(
    () =>
      (index ?? [])
        .filter((e) => threadId && (e.thread ?? `job-${e.id}`) === threadId && !runningIds.split(",").includes(e.id))
        .sort((a, b) => a.createdAt - b.createdAt),
    [index, threadId, runningIds],
  );
  const threadPreview = preview || jobs.some((j) => j.preview);
  const empty = jobs.length === 0 && pending.length === 0;
  // Real jobs are paid from the connected wallet's balance, by its signature. Previews and demo mode skip this.
  const { gate, credit } = useGate(threadPreview);
  const { signMessageAsync } = useSignMessage();
  const [directTee, setDirectTee] = useState<DirectTeeConfig | null>(null);
  const [directTeeStatus, setDirectTeeStatus] = useState<"idle" | "checking" | "ready" | "unavailable">("idle");

  // Try to set up direct TEE mode (uses a dedicated 0G key, independent of wallet chain).
  useEffect(() => {
    if (threadPreview || SERVICE_PAID) return;
    let cancelled = false;
    setDirectTeeStatus("checking");
    (async () => {
      try {
        const { getBroker, discoverTeeProviders, ensureProviderReady } = await import("@/lib/client/direct-tee");
        console.log("[direct-tee] creating broker...");
        const broker = await getBroker();
        console.log("[direct-tee] broker ready, discovering providers...");
        const providers = await discoverTeeProviders(broker);
        console.log("[direct-tee] found", providers.length, "TeeML providers");
        if (cancelled) return;
        if (providers.length === 0) {
          setDirectTeeStatus("unavailable");
          return;
        }
        const teeProvider = providers[0];
        console.log("[direct-tee] setting up provider", teeProvider.address);
        try {
          await ensureProviderReady(broker, teeProvider.address);
        } catch (fundErr) {
          console.warn("[direct-tee] provider funding skipped (will retry at inference):", fundErr);
        }
        setDirectTee({ broker, provider: teeProvider });
        setDirectTeeStatus("ready");
        console.log("[direct-tee] ready —", teeProvider.model, "at", teeProvider.endpoint);
      } catch (err) {
        console.warn("[direct-tee] init failed:", err);
        if (!cancelled) setDirectTeeStatus("unavailable");
      }
    })();
    return () => { cancelled = true; };
  }, [threadPreview]);

  // Follow the conversation as it grows (new messages, answers arriving), unless you've scrolled up to read.
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sc = scroller.current;
    const el = content.current;
    if (!sc || !el) return;
    let lastHeight = el.scrollHeight;
    const ro = new ResizeObserver(() => {
      const grew = el.scrollHeight > lastHeight;
      const nearBottom = sc.scrollHeight - sc.scrollTop - sc.clientHeight < el.scrollHeight - lastHeight + 160;
      lastHeight = el.scrollHeight;
      if (grew && nearBottom) bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
    ro.observe(el);
    bottom.current?.scrollIntoView({ block: "end" });
    return () => ro.disconnect();
  }, [empty, threadId]);

  async function send(out: Outgoing, asPreview = threadPreview, retryKey?: string) {
    const t = threadId;
    if (!t) return;
    const at = stamp();
    const key = retryKey ?? `p-${at}`;
    setPending((p) =>
      retryKey ? p.map((x) => (x.key === key ? { ...x, error: null, started: at, stage: "encrypt" } : x)) : [...p, { key, thread: t, out, started: at, stage: "encrypt", error: null }],
    );

    if (asPreview) {
      const e = createPreview({ fileName: out.label, task: out.task, ttl: out.ttl, thread: t });
      setSent((s) => ({ ...s, [e.id]: out }));
      setPending((p) => p.filter((x) => x.key !== key));
      return;
    }
    try {
      const payer: Payer | undefined =
        gate.kind === "ok" && gate.address && gate.price ? { address: gate.address, price: gate.price, sign: (message) => signMessageAsync({ message }) } : undefined;
      if (!payer && !SERVICE_PAID) throw new ApiError("Connect a wallet with credit to send.", 0);
      const res = await runJob(
        { taskType: out.task, ttl: out.ttl, fileName: out.fileName, content: out.content },
        (stage) => setPending((p) => p.map((x) => (x.key === key ? { ...x, stage } : x))),
        (jobId) => {
          setPending((p) => p.map((x) => (x.key === key ? { ...x, jobId } : x)));
          remember({ id: jobId, fileName: out.label, task: out.task, ttl: out.ttl, createdAt: stamp(), expiresAt: null, preview: false, thread: t, user: payer?.address.toLowerCase() });
        },
        payer,
        directTee ?? undefined,
      );
      refreshCreditSoon();
      remember({
        id: res.jobId,
        fileName: out.label,
        task: out.task,
        ttl: out.ttl,
        createdAt: stamp(),
        expiresAt: res.expiresAt,
        preview: false,
        thread: t,
      });
      setSent((s) => ({ ...s, [res.jobId]: out }));
      setPending((p) => p.filter((x) => x.key !== key));
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError("Something went wrong sending this message.", 0);
      setPending((p) => p.map((x) => (x.key === key ? { ...x, error: err } : x)));
    }
  }

  function continueInPreview(p: Pending) {
    setPreview(true);
    setPending((all) => all.filter((x) => x.key !== p.key));
    send(p.out, true);
  }

  function pickSample(s: Sample) {
    setDraft((d) => ({ ...d, task: s.task, ttl: 300, att: { name: s.fileName, content: s.text, kind: "text", bytes: new Blob([s.text]).size } }));
    composerRef.current?.focus();
  }

  const composer = (
    <Composer
      draft={draft}
      setDraft={setDraft}
      areaRef={composerRef}
      busy={pending.some((p) => !p.error)}
      gate={gate}
      left={credit.left}
      roomy={empty}
      onSend={(o) => {
        send(o);
        setDraft((d) => ({ ...d, text: "", att: null }));
      }}
    />
  );

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <header className="flex h-14 shrink-0 items-center gap-3 px-5 sm:px-8">
        <p className="min-w-0 truncate text-[13.5px] text-frost/60">{jobs[0]?.fileName ?? pending[0]?.out.label ?? ""}</p>
        {threadPreview && (
          <span className="shrink-0 text-[12px] text-melon" title="The server isn't configured, so answers are simulated in this browser">
            Preview
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-2 text-[12px] text-frost-soft/70 max-sm:hidden">
          <span className={cn("size-1.5 rounded-full", directTeeStatus === "ready" ? "bg-[#3DDC97] shadow-[0_0_8px_#3DDC97]" : "bg-volt-lit shadow-[0_0_8px_#5cc4ff]")} />
          {directTeeStatus === "ready"
            ? `direct TEE, ${directTee?.provider.model ?? "0gm"}`
            : `0gm-1.0-35b-a3b, sealed enclave`}
          {SERVICE_PAID ? ", demo mode" : ""}
        </span>
      </header>

      {empty ? (
        <div className="flex flex-1 flex-col items-center justify-center px-5 pb-24 sm:px-8">
          <div className="rise w-full max-w-[640px]">
            <EnclaveOrb className="size-14 [&>div:first-child]:-inset-3 [&>div:first-child]:blur-xl" />
            <h1 className="mt-8 text-[28px] leading-tight font-semibold tracking-[-0.02em]">Private by default.</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-frost/55">
              Add a document. It&rsquo;s read inside a sealed enclave, and the answer becomes unreadable when its timer ends.
            </p>
            <div className="mt-8">{composer}</div>
            {samples.length > 0 && (
              <p className="mt-5 text-[13px] leading-loose text-frost-soft/70">
                Try a fictional sample:{" "}
                {samples.map((s, i) => (
                  <span key={s.key}>
                    <button onClick={() => pickSample(s)} className="text-frost/80 underline decoration-frost/20 underline-offset-4 transition-colors hover:text-frost hover:decoration-volt-lit">
                      {s.label.toLowerCase()}
                    </button>
                    {i < samples.length - 1 ? ", " : ""}
                  </span>
                ))}
              </p>
            )}
          </div>
        </div>
      ) : (
        <>
          <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
            <div ref={content} className="mx-auto max-w-[680px] space-y-12 px-5 pt-6 pb-10 sm:px-8">
              {jobs.map((j) => (
                <Turn key={j.id} entry={j} out={sent[j.id]} />
              ))}
              {pending.map((p) => (
                <PendingTurn key={p.key} p={p} onRetry={() => send(p.out, false, p.key)} onPreview={() => continueInPreview(p)} />
              ))}
              <div ref={bottom} />
            </div>
          </div>
          <div className="shrink-0 bg-[linear-gradient(180deg,rgb(2_7_10/0),var(--night)_35%)] px-5 pt-4 pb-5 sm:px-8">
            <div className="mx-auto max-w-[680px]">{composer}</div>
          </div>
        </>
      )}
    </div>
  );
}

/* ================================================================== composer */

function QuietSelect({ value, onChange, label, children }: { value: string | number; onChange: (v: string) => void; label: string; children: ReactNode }) {
  return (
    <label className="relative flex items-center gap-1 rounded-md px-2 py-1 text-[13px] text-frost/60 transition-colors hover:bg-frost/[0.05] hover:text-frost">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="cursor-pointer appearance-none bg-transparent pr-4 focus:outline-none [&>option]:bg-night-2">
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-1.5 size-3.5 opacity-60" />
    </label>
  );
}

function Composer({
  draft,
  setDraft,
  onSend,
  busy,
  gate,
  left,
  roomy,
  areaRef,
}: {
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  onSend: (o: Outgoing) => void;
  busy: boolean;
  gate: Gate;
  left: number | null;
  roomy: boolean;
  areaRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const [err, setErr] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const { text, att, task, ttl } = draft;

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(240, Math.max(roomy ? 56 : 24, el.scrollHeight))}px`;
    el.style.overflowY = el.scrollHeight > 240 ? "auto" : "hidden";
  }, [text, roomy, areaRef]);

  const [parsing, setParsing] = useState(false);

  async function attach(f: File | undefined) {
    if (!f) return;
    setErr(null);
    try {
      let next: Attachment;
      if (IMAGE_EXT.test(f.name)) {
        const content = (await readAsDataUrl(f)).replace(/^data:[^,]*,/, "");
        if (content.length > MAX_CHARS) throw new Error("big");
        next = { name: f.name, content, kind: "image", bytes: f.size };
      } else if (canParse(f.name)) {
        setParsing(true);
        try {
          const parsed = await parseFile(f);
          if (parsed.kind === "image") {
            if (parsed.base64.length > MAX_CHARS) throw new Error("big");
            next = { name: f.name, content: parsed.base64, kind: "image", bytes: f.size };
          } else {
            if (parsed.text.length > MAX_CHARS) throw new Error("big");
            next = { name: f.name, content: parsed.text, kind: "text", bytes: f.size };
          }
        } finally {
          setParsing(false);
        }
      } else if (TEXT_EXT.test(f.name) || f.type.startsWith("text/")) {
        const content = await f.text();
        if (content.length > MAX_CHARS) throw new Error("big");
        next = { name: f.name, content, kind: "text", bytes: f.size };
      } else {
        setErr("Unsupported file type. Try a PDF, DOCX, XLSX, text file, or image.");
        return;
      }
      setDraft((d) => ({ ...d, att: next }));
    } catch (e) {
      setParsing(false);
      setErr(e instanceof Error && e.message === "big" ? "That file is over the 8 MB limit." : `Couldn't read that file: ${e instanceof Error ? e.message : "unknown error"}`);
    }
  }

  const canSend = !busy && gate.kind === "ok" && (!!att || text.trim().length > 0);

  function submit() {
    if (!canSend) return;
    const typed = text.trim();
    let out: Outgoing;
    if (att?.kind === "image") {
      out = { label: att.name, content: att.content, fileName: att.name, task, ttl, text: typed, attachment: att };
    } else if (att) {
      // The model treats everything as document content, so notes travel with the document, clearly marked.
      const content = typed ? `${att.content}\n\nNOTES FROM THE SENDER\n${typed}` : att.content;
      out = { label: att.name, content, fileName: att.name, task, ttl, text: typed, attachment: att };
    } else {
      out = { label: typed.split("\n")[0].slice(0, 60) || "Message", content: typed, fileName: "message.txt", task, ttl, text: typed, attachment: null };
    }
    onSend(out);
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div>
      <div
        className="rounded-[18px] border border-frost/[0.12] bg-night-2/80 transition-[border-color,box-shadow] focus-within:border-frost/25 focus-within:shadow-[0_0_0_4px_rgb(2_151_222/0.08)]"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          attach(e.dataTransfer.files?.[0]);
        }}
      >
        {att && (
          <div className="flex items-center gap-2.5 px-4 pt-3.5 text-[13px]">
            {att.kind === "image" ? <ImageIcon className="size-4 text-volt-lit" /> : <FileText className="size-4 text-volt-lit" />}
            <span className="min-w-0 truncate text-frost/90">{att.name}</span>
            <span className="shrink-0 text-frost-soft/70">{kb(att.bytes)}</span>
            <button onClick={() => setDraft((d) => ({ ...d, att: null }))} aria-label="Remove attachment" className="ml-auto grid size-6 place-items-center rounded-md text-frost-soft hover:bg-frost/10 hover:text-frost">
              <X className="size-3.5" />
            </button>
          </div>
        )}
        <label htmlFor="msg" className="sr-only">
          Message
        </label>
        <textarea
          id="msg"
          ref={areaRef}
          rows={1}
          value={text}
          onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
          onKeyDown={onKey}
          disabled={att?.kind === "image"}
          placeholder={parsing ? "Reading document…" : att?.kind === "image" ? "The image is sent on its own." : att ? "Add a note (optional)" : "Paste or attach a document (PDF, DOCX, XLSX, text, image)"}
          className="block w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-[15px] leading-relaxed text-frost placeholder:text-frost/30 focus:outline-none disabled:opacity-50"
        />
        <div className="flex items-center gap-0.5 px-2 pb-2">
          <button
            onClick={() => file.current?.click()}
            disabled={parsing}
            className="grid size-8 place-items-center rounded-md text-frost/50 transition-colors hover:bg-frost/[0.05] hover:text-frost disabled:opacity-50"
            aria-label="Attach a file"
            title="PDF, DOCX, XLSX, text, or image"
          >
            {parsing ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
          </button>
          <QuietSelect label="Task" value={task} onChange={(v) => setDraft((d) => ({ ...d, task: v as Task }))}>
            {TASKS.map((t) => (
              <option key={t.key} value={t.key}>
                {t.name}
              </option>
            ))}
          </QuietSelect>
          <QuietSelect label="Destroy the answer after" value={ttl} onChange={(v) => setDraft((d) => ({ ...d, ttl: Number(v) }))}>
            {LIFESPANS.map((o) => (
              <option key={o.ttl} value={o.ttl}>
                Destroy after {o.label}
              </option>
            ))}
          </QuietSelect>
          {gate.kind === "ok" && gate.price && <span className="num ml-auto mr-2 text-[12px] text-frost-soft/60">{gate.price} USDT{left !== null ? `, ${left} left` : ""}</span>}
          {gate.kind === "connect" ? (
            <ConnectPill className="ml-auto" />
          ) : (
            <button
              onClick={submit}
              disabled={!canSend}
              aria-label="Send"
              className={cn(
                "grid size-8 place-items-center rounded-full bg-frost text-night transition-[background-color,opacity] hover:bg-melon disabled:bg-frost/15 disabled:text-frost/40",
                !(gate.kind === "ok" && gate.price) && "ml-auto",
              )}
            >
              <ArrowUp className="size-4" strokeWidth={2.4} />
            </button>
          )}
        </div>
        <input
          ref={file}
          type="file"
          className="sr-only"
          accept=".txt,.md,.csv,.json,.png,.jpg,.jpeg,.gif,.webp,.pdf,.docx,.doc,.xlsx,.xls,text/*,image/*"
          onChange={(e) => {
            attach(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      {err && (
        <p role="alert" className="mt-2 px-1 text-[13px] text-melon">
          {err}
        </p>
      )}
      {gate.kind === "credit" && (
        <p className="mt-2 px-1 text-[13px] text-melon">
          Your credit is {Number(gate.balance).toFixed(2)} USDT and a message costs {gate.price}.{" "}
          <Link href="/dashboard" className="underline decoration-melon/40 underline-offset-4">
            Add credit
          </Link>
        </p>
      )}
      {gate.kind === "checking" && <p className="mt-2 px-1 text-[13px] text-frost-soft/70">Checking your credit…</p>}
      {gate.kind === "error" && <p className="mt-2 px-1 text-[13px] text-melon">Couldn&rsquo;t read your credit: {gate.message}</p>}
      {gate.kind === "connect" && roomy && <p className="mt-2 px-1 text-[13px] text-frost-soft/70">Connect a wallet to send. Each message is paid from your prepaid USDT balance.</p>}
    </div>
  );
}

/* ================================================================== messages */

function UserMessage({ label, out, ttl, task }: { label: string; out?: Outgoing; ttl: number; task: Task | null }) {
  const typed = out?.text ?? "";
  const doc = out?.attachment;
  return (
    <div className="rise flex flex-col items-end">
      <div className="max-w-[85%] rounded-[16px] bg-frost/[0.06] px-4 py-3">
        {(doc || !out) && (
          <p className="flex items-center gap-2 text-[14px] text-frost/90">
            {doc?.kind === "image" ? <ImageIcon className="size-4 shrink-0 text-volt-lit" /> : <FileText className="size-4 shrink-0 text-volt-lit" />}
            <span className="truncate">{label}</span>
            {doc && <span className="shrink-0 text-frost-soft/60">{kb(doc.bytes)}</span>}
          </p>
        )}
        {typed && <p className={cn("line-clamp-6 text-[15px] leading-relaxed whitespace-pre-wrap text-frost/90", (doc || !out) && "mt-2")}>{typed}</p>}
      </div>
      <p className="mt-1.5 px-1 text-[12px] text-frost-soft/60">
        {taskName(task)}, destroyed after {ttlLabel(ttl)}
        {!out && ". Content isn't kept in this browser"}
      </p>
    </div>
  );
}

function Meta({ children }: { children: ReactNode }) {
  return <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-frost-soft/70">{children}</div>;
}

function Turn({ entry, out }: { entry: IndexEntry; out?: Outgoing }) {
  return (
    <div className="space-y-6">
      <UserMessage label={entry.fileName} out={out} ttl={entry.ttl} task={entry.task} />
      <Reply id={entry.id} />
    </div>
  );
}

function Reply({ id }: { id: string }) {
  const { vm, error, loading } = useJobVM(id);
  const now = useNow();
  const [copied, setCopied] = useState(false);

  if (loading || !vm)
    return (
      <div className="flex items-center gap-3">
        <OrbMark className="size-5" />
        <p className="text-[13.5px] text-frost-soft">{error ? `Couldn't load job ${id}: ${error.message}` : "Loading…"}</p>
      </div>
    );

  const left = vm.expiresAt ? vm.expiresAt - now : 0;
  const frac = vm.ttl && vm.expiresAt ? Math.max(0, Math.min(1, left / (vm.ttl * 1000))) : 0;
  const gone = vm.phase === "destroyed";
  const late = !gone && frac < 0.3;

  return (
    <div className="rise">
      <div className="mb-3 flex items-center gap-2.5">
        <OrbMark className={cn("size-5", vm.phase === "working" && "animate-pulse")} />
        <span className="text-[13px] font-medium text-frost/80">Enigma</span>
      </div>

      {vm.phase === "working" && <Working started={vm.createdAt} />}

      {vm.phase === "readable" && vm.result && (
        <div className="relative pl-5">
          {/* The fuse: one line down the answer, burning away as the key's lifespan runs out */}
          <span className="absolute top-1 bottom-1 left-0 w-px bg-frost/10" aria-hidden="true" />
          <span
            className={cn("absolute top-1 left-0 w-px origin-top transition-transform duration-300", late ? "bg-melon" : "bg-volt-lit")}
            style={{ height: "calc(100% - 0.5rem)", transform: `scaleY(${frac})` }}
            aria-hidden="true"
          />
          <span
            className={cn("absolute left-0 size-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full", late ? "bg-melon shadow-[0_0_10px_#fc734d]" : "bg-volt-lit shadow-[0_0_10px_#5cc4ff]")}
            style={{ top: `calc(0.25rem + (100% - 0.5rem) * ${frac})` }}
            aria-hidden="true"
          />
          <div className="space-y-5">
            {sections(vm.result).map((s, i) => (
              <section key={i}>
                {s.title && i > 0 && <h3 className="text-[13px] font-semibold text-frost">{s.title}</h3>}
                {i === 0 ? (
                  <p className="text-[16.5px] leading-[1.65] text-frost">{s.items.join(" ")}</p>
                ) : (
                  <ul className="mt-1.5 space-y-1">
                    {s.items.map((it, j) => (
                      <li key={j} className="flex gap-2.5 text-[15px] leading-[1.65] text-frost/75">
                        <span className="text-frost/30">–</span>
                        {it}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
          <Meta>
            <span className={late ? "text-melon" : "text-frost/80"}>Key wiped in {countdown(left)}</span>
            {vm.attestationHash && <span>Attested in TDX</span>}
            <button
              onClick={() =>
                navigator.clipboard?.writeText(vm.result ?? "").then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                })
              }
              className="hover:text-frost"
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <Link href={`/job/${vm.id}`} className="hover:text-frost">
              {vm.preview ? "Receipt (preview)" : `Receipt for job ${vm.id}`}
            </Link>
          </Meta>
        </div>
      )}

      {gone && (
        <div className="relative pl-5">
          <span className="absolute top-1 bottom-1 left-0 w-px bg-melon/40" aria-hidden="true" />
          <p className="font-mono text-[12px] leading-relaxed break-all text-frost/20">{vm.ciphertextPreview ?? "The encrypted answer has expired from Arkiv as well."}</p>
          <Meta>
            <span className="text-melon">
              Key wiped{vm.destruction ? ` at ${new Date(vm.destruction.destructionTimestamp * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : ""}. Nobody can read this again.
            </span>
            <Link href={`/job/${vm.id}`} className="hover:text-frost">
              Receipt
            </Link>
          </Meta>
        </div>
      )}

      {vm.phase === "locked" && (
        <div className="relative pl-5">
          <span className="absolute top-1 bottom-1 left-0 w-px bg-frost/15" aria-hidden="true" />
          <p className="font-mono text-[12px] leading-relaxed break-all text-frost/20">{vm.ciphertextPreview ?? "Encrypted answer"}</p>
          <Meta>
            <span className="text-frost/70">The key for this answer was kept in the browser session that sent it, and this one doesn&rsquo;t have it.</span>
          </Meta>
        </div>
      )}

      {(vm.phase === "failed" || vm.phase === "refunded" || vm.phase === "missing") && (
        <p className="border-l border-melon/50 pl-5 text-[14px] text-frost/80">
          {vm.phase === "refunded" ? "This job failed after payment and was refunded." : vm.phase === "missing" ? "This job isn't on-chain." : "This job never completed. The contract refunds it after its timeout."}
        </p>
      )}
    </div>
  );
}

const STAGES: Stage[] = SERVICE_PAID ? ["encrypt", "create", "infer", "seal", "store"] : ["encrypt", "authorize", "create", "infer", "seal", "store"];

function Working({ started, stage }: { started: number; stage?: Stage }) {
  const now = useNow();
  const secs = Math.max(0, Math.floor((now - started) / 1000));
  const at = stage ? STAGES.indexOf(stage) : -1;
  return (
    <div className="pl-5">
      <p className="text-[15px]">
        <span className="shimmer">{stage ? STAGE_LABEL[stage] : "Waiting for the job to complete"}</span>
        <span className="num ml-2 text-[12px] text-frost-soft/50">{secs}s</span>
      </p>
      {stage && (
        <div className="mt-2.5 flex gap-1" aria-hidden="true">
          {STAGES.map((st, i) => (
            <span key={st} className={cn("h-0.5 w-5 rounded-full transition-colors duration-500", i < at ? "bg-volt-lit/80" : i === at ? "animate-pulse bg-frost/70" : "bg-frost/10")} />
          ))}
        </div>
      )}
    </div>
  );
}

function PendingTurn({ p, onRetry, onPreview }: { p: Pending; onRetry: () => void; onPreview: () => void }) {
  const refund = p.error && typeof p.error.body.refund === "string";
  return (
    <div className="space-y-6">
      <UserMessage label={p.out.label} out={p.out} ttl={p.out.ttl} task={p.out.task} />
      <div className="rise">
        <div className="mb-3 flex items-center gap-2.5">
          <OrbMark className={cn("size-5", !p.error && "animate-pulse")} />
          <span className="text-[13px] font-medium text-frost/80">Enigma</span>
        </div>
        {!p.error ? (
          <Working started={p.started} stage={p.stage} />
        ) : (
          <div role="alert" className="border-l border-melon/60 pl-5">
            <p className="text-[15px] text-frost">{p.error.notConfigured ? "The server isn't set up to run jobs yet." : "This message didn't go through."}</p>
            <p className="mt-1.5 font-mono text-[12px] leading-relaxed break-words text-frost/45">{p.error.message}</p>
            {refund && <p className="mt-2 text-[13.5px] text-frost/70">Job {String(p.error.body.jobId)} was opened but couldn&rsquo;t finish, so this browser wiped its key. The payment comes back after the contract&rsquo;s timeout.</p>}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {p.error.notConfigured && (
                <Button size="sm" onClick={onPreview}>
                  Continue as a preview
                </Button>
              )}
              <button onClick={onRetry} className="rounded-md px-2.5 py-1.5 text-[13px] text-frost/70 hover:bg-frost/[0.05] hover:text-frost">
                Try again
              </button>
            </div>
            {p.error.notConfigured && (
              <p className="mt-3 text-[12.5px] leading-relaxed text-frost-soft/70">
                Real jobs need the keys from .env.example on the server. A preview simulates the server in your browser and is marked as one.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
