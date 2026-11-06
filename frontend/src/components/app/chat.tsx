// AI-assisted: Used Claude to design and write this file.
"use client";

import { BorderBeam } from "border-beam";
import { ArrowUp, Check, ChevronDown, FileText, ImageIcon, Paperclip, X } from "lucide-react";
import Link from "next/link";
import { useReducedMotion } from "motion/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Select } from "radix-ui";
import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from "react";

import { useSignMessage } from "wagmi";

import { Button } from "@/components/ui/button";
import { SERVICE_PAID } from "@/lib/client/chain";
import { withImageNote } from "@/lib/image-note";
import { cn } from "@/lib/utils";
import { DotOrb, OrbMark } from "./orb";
import { useFullWave } from "./wave";
import { ConnectPill, useGate, walletProblem, type Gate } from "./wallet";
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


const MAX_CHARS = 8_000_000;
const TEXT_EXT = /\.(txt|md|csv|json|log|xml|html?)$/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp)$/i;

// `src` is only for showing the image in this tab. It is never sent.
type Attachment = { name: string; content: string; kind: "text" | "image"; bytes: number; src?: string };
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
  // A conversation keeps its document type, so the next message isn't sent as the wrong kind.
  const lastTask = jobs.at(-1)?.task;
  const [followed, setFollowed] = useState("");
  if (lastTask && followed !== `${threadId}:${lastTask}`) {
    setFollowed(`${threadId}:${lastTask}`);
    setDraft((d) => ({ ...d, task: lastTask }));
  }
  const threadPreview = preview || jobs.some((j) => j.preview);
  const empty = jobs.length === 0 && pending.length === 0;
  useFullWave(empty);
  // Real jobs are paid from the connected wallet's balance, by its signature. Previews and demo mode skip this.
  const { gate, credit } = useGate(threadPreview);
  const { signMessageAsync } = useSignMessage();

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
      const said = walletProblem(e instanceof Error ? e.message : "");
      const err = e instanceof ApiError ? e : new ApiError(said ?? "Something went wrong sending this message.", 0);
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
    <div className="flex h-full flex-col">
      {!empty && (
        <header className="flex h-12 shrink-0 items-center gap-3 px-5 sm:px-8">
          <p className="min-w-0 truncate text-[14px] text-frost/70">{jobs[0]?.fileName ?? pending[0]?.out.label ?? ""}</p>
          {threadPreview && (
            <span className="shrink-0 text-[12px] text-orchid" title="The server isn't configured, so answers are simulated in this browser">
              Preview
            </span>
          )}
          <span className="ml-auto shrink-0 text-[12.5px] text-frost-soft max-sm:hidden">Sealed enclave{SERVICE_PAID ? ", demo mode" : ""}</span>
        </header>
      )}

      {empty ? (
        <div className="flex min-h-full flex-1 flex-col px-5 sm:px-8">
          <div className="rise mx-auto flex w-full max-w-[640px] flex-1 flex-col items-center justify-center pt-10 pb-8 text-center">
            <p className="inline-flex items-center gap-2 rounded-full bg-black/25 py-1 pr-3 pl-1 text-[13px] text-frost/90 backdrop-blur-sm">
              <span className="rounded-full bg-volt px-2 py-0.5 text-[12px] font-medium text-night">Private</span>
              Encrypted before it leaves your browser
            </p>
            <h1 className="mt-4 text-[clamp(1.75rem,3.2vw,2.5rem)] leading-tight font-semibold tracking-[-0.03em]">What should Enigma read?</h1>
            <div className="mt-6 w-full text-left">{composer}</div>
          </div>
          {samples.length > 0 && (
            <section className="mx-auto w-full max-w-[920px] rounded-t-[16px] bg-[#1a100f]/90 p-4 pb-5 backdrop-blur-md">
              <h2 className="text-[14px] font-medium">Try a fictional sample</h2>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {samples.map((s) => (
                  <button key={s.key} onClick={() => pickSample(s)} className="flex flex-col items-start rounded-xl bg-frost/[0.06] p-3 text-left transition-colors hover:bg-frost/[0.11]">
                    <span className="block text-[14px] font-medium">{s.label}</span>
                    <span className="mt-0.5 line-clamp-2 block text-[12.5px] leading-snug text-frost-soft">{s.blurb}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
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
          <div className="shrink-0 px-5 pt-3 pb-5 sm:px-8">
            <div className="mx-auto max-w-[680px]">{composer}</div>
          </div>
        </>
      )}
    </div>
  );
}

/* ================================================================== composer */

/** The composer's small menus, styled like the rest of the app in place of the browser's own list. */
function QuietSelect({ value, onChange, label, options }: { value: string; onChange: (v: string) => void; label: string; options: { value: string; label: string }[] }) {
  return (
    <Select.Root value={value} onValueChange={onChange}>
      <Select.Trigger
        aria-label={label}
        className="group flex min-w-0 cursor-pointer items-center gap-1 rounded-full py-1 pr-1 pl-1.5 text-[12.5px] text-frost/75 transition-colors hover:bg-frost/[0.06] hover:text-frost focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-frost/40 data-[state=open]:bg-frost/[0.08] data-[state=open]:text-frost sm:pr-2 sm:pl-2.5 sm:text-[13.5px]"
      >
        <span className="min-w-0 truncate">
          <Select.Value />
        </span>
        <Select.Icon asChild>
          <ChevronDown className="size-3.5 shrink-0 opacity-60 transition-transform group-data-[state=open]:rotate-180" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={8}
          align="start"
          collisionPadding={10}
          className="app-theme z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-[14px] bg-[#282826] p-1 text-frost shadow-[0_12px_40px_rgb(0_0_0/0.45),inset_0_0_0_1px_rgb(255_255_255/0.09)]"
        >
          <Select.Viewport>
            {options.map((o) => (
              <Select.Item
                key={o.value}
                value={o.value}
                className="flex cursor-pointer items-center justify-between gap-5 rounded-[10px] px-2.5 py-1.5 text-[13.5px] whitespace-nowrap text-frost/75 outline-none select-none data-[highlighted]:bg-frost/[0.08] data-[highlighted]:text-frost data-[state=checked]:text-frost"
              >
                <Select.ItemText>{o.label}</Select.ItemText>
                <Select.ItemIndicator>
                  <Check className="size-3.5 text-frost/70" strokeWidth={2.2} />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
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
  const [dragging, setDragging] = useState(false);
  const reduce = useReducedMotion();
  const file = useRef<HTMLInputElement>(null);
  const { text, att, task, ttl } = draft;

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(240, Math.max(roomy ? 56 : 24, el.scrollHeight))}px`;
    el.style.overflowY = el.scrollHeight > 240 ? "auto" : "hidden";
  }, [text, roomy, areaRef]);

  async function attach(f: File | undefined) {
    if (!f) return;
    setErr(null);
    try {
      let next: Attachment;
      if (IMAGE_EXT.test(f.name)) {
        // The API wants the image as raw base64 (it builds the data URL itself), not a full data URL.
        const src = await readAsDataUrl(f);
        const content = src.replace(/^data:[^,]*,/, "");
        if (content.length > MAX_CHARS) throw new Error("big");
        next = { name: f.name, content, kind: "image", bytes: f.size, src };
      } else if (TEXT_EXT.test(f.name) || f.type.startsWith("text/")) {
        const content = await f.text();
        if (content.length > MAX_CHARS) throw new Error("big");
        if (!content.trim()) {
          setErr("That file is empty.");
          return;
        }
        next = { name: f.name, content, kind: "text", bytes: f.size };
      } else {
        setErr("Only text files and images for now. For a PDF, paste its text instead.");
        return;
      }
      setDraft((d) => ({ ...d, att: next }));
    } catch (e) {
      setErr(e instanceof Error && e.message === "big" ? "That file is too large. The limit is 6 MB for images and 8 MB for text." : "That file couldn't be read.");
    }
  }

  const canSend = !busy && gate.kind === "ok" && (!!att || text.trim().length > 0);

  function submit() {
    if (!canSend) return;
    const typed = text.trim();
    let out: Outgoing;
    if (att?.kind === "image") {
      out = { label: att.name, content: withImageNote(att.content, typed), fileName: att.name, task, ttl, text: typed, attachment: att };
    } else if (att) {
      // The model treats everything as document content, so notes travel with the document, clearly marked.
      const content = typed ? `${att.content}\n\nNOTES FROM THE SENDER\n${typed}` : att.content;
      out = { label: att.name, content, fileName: att.name, task, ttl, text: typed, attachment: att };
    } else {
      out = { label: typed.split("\n")[0].slice(0, 60) || "Message", content: typed, fileName: "message.txt", task, ttl, text: typed, attachment: null };
    }
    onSend(out);
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = e.clipboardData.files?.[0];
    if (!pasted) return;
    e.preventDefault();
    attach(pasted);
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div>
      <BorderBeam borderRadius={16} active={!reduce}>
        <div
          className={cn(
            "rounded-[16px] bg-[#282826] shadow-[0_12px_40px_rgb(0_0_0/0.3),inset_0_0_0_1px_rgb(255_255_255/0.07)] transition-shadow focus-within:shadow-[0_12px_40px_rgb(0_0_0/0.3),inset_0_0_0_1px_rgb(255_255_255/0.2)]",
            dragging && "shadow-[0_12px_40px_rgb(0_0_0/0.3),inset_0_0_0_1.5px_rgb(255_255_255/0.5)]",
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            attach(e.dataTransfer.files?.[0]);
          }}
        >
          {att && (
            <div className="flex items-center gap-2.5 px-4 pt-3.5 text-[13px]">
              {att.src ? <Thumb src={att.src} className="size-11" /> : <FileText className="size-4 text-volt-lit" />}
              <span className="min-w-0 truncate text-frost/90">{att.name}</span>
              <span className="shrink-0 text-frost-soft/70">{kb(att.bytes)}</span>
              <button
                onClick={() => {
                  setErr(null);
                  setDraft((d) => ({ ...d, att: null }));
                }}
                aria-label="Remove attachment"
                className="ml-auto grid size-6 shrink-0 place-items-center rounded-full text-frost-soft hover:bg-frost/10 hover:text-frost"
              >
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
            onPaste={onPaste}
            placeholder={att?.kind === "image" ? "Ask something about this image (optional)" : att ? "Add a note (optional)" : "Paste a document or attach one"}
            className="block w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-[15px] leading-relaxed text-frost placeholder:text-frost/30 focus:outline-none"
          />
          <div className="flex items-center gap-0.5 px-2 pb-2.5 sm:gap-1.5 sm:px-2.5">
            <button
              onClick={() => file.current?.click()}
              className="grid size-8 shrink-0 place-items-center rounded-full text-frost/70 transition-colors hover:bg-frost/[0.06] hover:text-frost"
              aria-label="Attach a text file or image"
              title="Attach a text file or image"
            >
              <Paperclip className="size-4" />
            </button>
            <QuietSelect label="Task" value={task} onChange={(v) => setDraft((d) => ({ ...d, task: v as Task }))} options={TASKS.map((t) => ({ value: t.key, label: t.name }))} />
            <QuietSelect
              label="Destroy the answer after"
              value={String(ttl)}
              onChange={(v) => setDraft((d) => ({ ...d, ttl: Number(v) }))}
              options={LIFESPANS.map((o) => ({ value: String(o.ttl), label: `Destroy after ${o.label}` }))}
            />
            {gate.kind === "ok" && gate.price && <span className="num mr-2 ml-auto text-[12px] text-frost-soft/60 max-sm:hidden">{gate.price} USDT{left !== null ? `, ${left} left` : ""}</span>}
            {gate.kind === "connect" ? (
              <ConnectPill className="ml-auto" />
            ) : (
              <button
                onClick={submit}
                disabled={!canSend}
                aria-label="Send"
                title={busy ? "Enigma is still working on your last message" : undefined}
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full bg-frost text-night transition-[background-color,opacity] hover:bg-orchid disabled:bg-frost/15 disabled:text-frost/40",
                  gate.kind === "ok" && gate.price ? "max-sm:ml-auto" : "ml-auto",
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
            accept=".txt,.md,.csv,.json,.log,.xml,.html,.htm,.png,.jpg,.jpeg,.gif,.webp,text/*"
            onChange={(e) => {
              attach(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
      </BorderBeam>
      {gate.kind === "ok" && gate.price && (
        <p className="num mt-2 px-1 text-[12px] text-frost-soft/60 sm:hidden">
          {gate.price} USDT{left !== null ? `, ${left} left` : ""}
        </p>
      )}
      {err && (
        <p role="alert" className="mt-2 px-1 text-[13px] text-orchid">
          {err}
        </p>
      )}
      {gate.kind === "credit" && (
        <p className="mt-2 px-1 text-[13px] text-orchid">
          Your credit is {Number(gate.balance).toFixed(2)} USDT and a message costs {gate.price}.{" "}
          <Link href="/dashboard" className="underline decoration-orchid/40 underline-offset-4">
            Add credit
          </Link>
        </p>
      )}
      {gate.kind === "checking" && <p className="mt-2 px-1 text-[13px] text-frost-soft/70">Checking your credit…</p>}
      {gate.kind === "error" && <p className="mt-2 px-1 text-[13px] text-orchid">Couldn&rsquo;t read your credit: {gate.message}</p>}
      {gate.kind === "connect" && roomy && <p className="mt-2 px-1 text-[13px] text-frost-soft/70">Connect a wallet to send. Each message is paid from your prepaid USDT balance.</p>}
    </div>
  );
}

/* ================================================================== messages */

/** Upstream errors carry raw provider JSON. Say what happened instead. */
export function plainError(message: string) {
  if (/0G inference failed|no provider|upstream/i.test(message)) return "0G's sealed model didn't respond. Try again in a minute.";
  if (/attestation|no request id|empty result/i.test(message)) return "0G's answer couldn't be verified, so it wasn't used.";
  return message.split(/[{[]/)[0].trim() || "The server couldn't finish this message.";
}

function Thumb({ src, className }: { src: string; className?: string }) {
  // A data URL held in this tab, so next/image has nothing to optimise
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className={cn("shrink-0 rounded-lg object-cover", className)} />;
}

function UserMessage({ label, out, ttl, task }: { label: string; out?: Outgoing; ttl: number; task: Task | null }) {
  const typed = out?.text ?? "";
  const doc = out?.attachment;
  return (
    <div className="rise flex flex-col items-end">
      <div className="max-w-[85%] rounded-[16px] bg-frost/[0.06] px-4 py-3">
        {doc?.src && <Thumb src={doc.src} className="mb-2.5 max-h-56 w-full max-w-72" />}
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
        <OrbMark />
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
        <OrbMark />
        <span className="text-[13px] font-medium text-frost/80">Enigma</span>
      </div>

      {vm.phase === "working" && <Working started={vm.createdAt} />}

      {vm.phase === "readable" && vm.result && (
        <div className="relative pl-5">
          {/* The fuse: one line down the answer, burning away as the key's lifespan runs out */}
          <span className="absolute top-1 bottom-1 left-0 w-px bg-frost/10" aria-hidden="true" />
          <span
            className={cn("absolute top-1 left-0 w-px origin-top transition-transform duration-300", late ? "bg-orchid" : "bg-volt-lit")}
            style={{ height: "calc(100% - 0.5rem)", transform: `scaleY(${frac})` }}
            aria-hidden="true"
          />
          <span
            className={cn("absolute left-0 size-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full", late ? "bg-orchid shadow-[0_0_10px_#e59cf4]" : "bg-volt-lit shadow-[0_0_10px_#7fdcd2]")}
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
            <span className={late ? "text-orchid" : "text-frost/80"}>Key wiped in {countdown(left)}</span>
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
          <span className="absolute top-1 bottom-1 left-0 w-px bg-orchid/40" aria-hidden="true" />
          <p className="font-mono text-[12px] leading-relaxed break-all text-frost/40">{vm.ciphertextPreview ?? "The encrypted answer has expired from Arkiv as well."}</p>
          <Meta>
            <span className="text-orchid">
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
          <p className="font-mono text-[12px] leading-relaxed break-all text-frost/40">{vm.ciphertextPreview ?? "Encrypted answer"}</p>
          <Meta>
            <span className="text-frost/70">The key for this answer was kept in the browser session that sent it, and this one doesn&rsquo;t have it.</span>
          </Meta>
        </div>
      )}

      {(vm.phase === "failed" || vm.phase === "refunded" || vm.phase === "missing") && (
        <p className="border-l border-orchid/50 pl-5 text-[14px] text-frost/80">
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
    <div>
      <p className="inline-flex max-w-full items-center gap-3 rounded-full bg-frost/[0.04] py-2 pr-5 pl-2.5 text-[15px] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.05)]">
        <DotOrb size={46} />
        <span className="shimmer min-w-0">{stage ? STAGE_LABEL[stage] : "Waiting for the job to complete"}</span>
        <span className="num shrink-0 text-[12px] text-frost-soft/60">{secs}s</span>
      </p>
      {stage && (
        <div className="mt-3 flex gap-1 pl-3" aria-hidden="true">
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
          <OrbMark />
          <span className="text-[13px] font-medium text-frost/80">Enigma</span>
        </div>
        {!p.error ? (
          <Working started={p.started} stage={p.stage} />
        ) : (
          <div role="alert" className="border-l border-orchid/60 pl-5">
            <p className="text-[15px] text-frost">{p.error.notConfigured ? "The server isn't set up to run jobs yet." : "This message didn't go through."}</p>
            <p className="mt-1.5 text-[13.5px] leading-relaxed break-words text-frost/60">{plainError(p.error.message)}</p>
            {refund && <p className="mt-2 text-[13.5px] text-frost/70">Job {String(p.error.body.jobId)} was opened but couldn&rsquo;t finish, so this browser wiped its key. The payment comes back after the contract&rsquo;s timeout.</p>}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {p.error.notConfigured && (
                <Button size="sm" onClick={onPreview}>
                  Continue as a preview
                </Button>
              )}
              <button onClick={onRetry} className="rounded-full px-3 py-1.5 text-[13px] text-frost/70 hover:bg-frost/[0.05] hover:text-frost">
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
