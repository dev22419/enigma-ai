// AI-assisted: Used Claude to design and write this file.
"use client";

import { ArrowUp, ArrowUpRight, Copy, FileText, ImageIcon, LineChart, Paperclip, Receipt, Scale, Stethoscope, Timer, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EnclaveOrb, OrbMark } from "./orb";
import {
  ApiError,
  TTL_OPTIONS,
  countdown,
  createJob,
  createPreview,
  newThreadId,
  remember,
  sections,
  ttlLabel,
  useIndex,
  useJobVM,
  useNow,
  type IndexEntry,
  type Task,
} from "./jobs";

export type Sample = { key: string; label: string; task: Task; fileName: string; text: string; blurb: string };

const TASKS: { key: Task; name: string; icon: typeof Stethoscope; card: string; gets: string }[] = [
  { key: "medical", name: "Medical", icon: Stethoscope, card: "Review a patient record", gets: "Findings, medication and what needs a clinician's attention" },
  { key: "legal", name: "Legal", icon: Scale, card: "Review a contract", gets: "Obligations, renewal terms and risky clauses with references" },
  { key: "financial", name: "Financial", icon: LineChart, card: "Review a statement", gets: "Key figures, trends and anomalies worth a question" },
];

const LIFESPANS = [{ label: "5 min", ttl: 300 }, ...TTL_OPTIONS].sort((a, b) => a.ttl - b.ttl);

const SERVER_STEPS = [
  "Locking the price on Whitechain",
  "Encrypting with a one-time key",
  "Storing the encrypted copy",
  "Reading inside the 0G enclave",
  "Checking the attestation",
  "Storing the encrypted answer on Arkiv",
  "Recording the job on Whitechain",
];

const MAX_CHARS = 8_000_000;
const TEXT_EXT = /\.(txt|md|csv|json|log|xml|html?)$/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp)$/i;

type Attachment = { name: string; content: string; kind: "text" | "image"; bytes: number };
type Outgoing = { label: string; content: string; fileName: string; task: Task; ttl: number; text: string; attachment: Attachment | null };
type Pending = { key: string; thread: string; out: Outgoing; started: number; error: ApiError | null };
type Draft = { text: string; att: Attachment | null; task: Task; ttl: number };

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
  // What you typed this session, shown in your bubbles. Kept in memory only, never saved.
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
  const jobs = useMemo(
    () => (index ?? []).filter((e) => threadId && (e.thread ?? `job-${e.id}`) === threadId).sort((a, b) => a.createdAt - b.createdAt),
    [index, threadId],
  );
  const threadPreview = preview || jobs.some((j) => j.preview);
  const empty = jobs.length === 0 && pending.length === 0;

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
    setPending((p) => (retryKey ? p.map((x) => (x.key === key ? { ...x, error: null, started: at } : x)) : [...p, { key, thread: t, out, started: at, error: null }]));

    if (asPreview) {
      const e = createPreview({ fileName: out.label, task: out.task, ttl: out.ttl, thread: t });
      setSent((s) => ({ ...s, [e.id]: out }));
      setPending((p) => p.filter((x) => x.key !== key));
      return;
    }
    try {
      const res = await createJob({ taskType: out.task, ttl: out.ttl, fileName: out.fileName, fileContent: out.content });
      remember({
        id: res.jobId,
        fileName: out.label,
        task: out.task,
        ttl: out.ttl,
        createdAt: stamp(),
        expiresAt: res.expiresAt ? res.expiresAt * 1000 : null,
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
      big={empty}
      onSend={(o) => {
        send(o);
        setDraft((d) => ({ ...d, text: "", att: null }));
      }}
    />
  );

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <TopBar title={jobs[0]?.fileName ?? pending[0]?.out.label ?? null} preview={threadPreview} />

      {empty ? (
        <div className="flex flex-1 flex-col items-center justify-center px-4 pt-6 pb-14 sm:px-6">
          <div className="rise w-full max-w-[760px]">
            <div className="flex justify-center">
              <EnclaveOrb className="size-36 sm:size-44" />
            </div>
            <h1 className="display mt-10 text-center text-[clamp(1.9rem,4vw,3rem)] text-balance">What should stay private today?</h1>
            <p className="mx-auto mt-3 max-w-[34rem] text-center text-[15px] leading-relaxed text-frost/60">
              Every message is read inside 0G&rsquo;s sealed enclave and becomes unreadable when its timer ends.
            </p>
            <div className="mt-9">{composer}</div>

            {samples.length > 0 && (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <span className="py-1.5 text-[12.5px] text-frost-soft/70">Fictional samples:</span>
                {samples.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => pickSample(s)}
                    className="glass rounded-full px-3.5 py-1.5 text-[13px] text-frost/80 transition-[color,box-shadow] hover:text-frost hover:shadow-[inset_0_1px_0_rgb(234_243_249/0.1),0_0_0_1px_rgb(92_196_255/0.5)]"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              {TASKS.map(({ key, card, gets, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => {
                    setDraft((d) => ({ ...d, task: key }));
                    composerRef.current?.focus();
                  }}
                  className={cn(
                    "glass group relative rounded-[16px] p-4 text-left transition-shadow hover:shadow-[inset_0_1px_0_rgb(234_243_249/0.1),0_0_0_1px_rgb(92_196_255/0.45)]",
                    draft.task === key && "shadow-[inset_0_1px_0_rgb(234_243_249/0.1),0_0_0_1px_rgb(92_196_255/0.6)]",
                  )}
                >
                  <div className="flex items-start justify-between">
                    <span className="grid size-9 place-items-center rounded-[10px] bg-[linear-gradient(140deg,rgb(2_151_222/0.35),rgb(252_115_77/0.25))] text-frost">
                      <Icon className="size-[18px]" strokeWidth={1.75} />
                    </span>
                    <ArrowUpRight className="size-4 text-frost-soft transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-frost" />
                  </div>
                  <p className="mt-4 text-[14.5px] font-semibold">{card}</p>
                  <p className="mt-1 text-[12.5px] leading-snug text-frost-soft">{gets}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
            <div ref={content} className="mx-auto max-w-[780px] space-y-10 px-4 pt-8 pb-12 sm:px-6">
              {jobs.map((j) => (
                <Turn key={j.id} entry={j} out={sent[j.id]} />
              ))}
              {pending.map((p) => (
                <PendingTurn key={p.key} p={p} onRetry={() => send(p.out, false, p.key)} onPreview={() => continueInPreview(p)} />
              ))}
              <div ref={bottom} />
            </div>
          </div>
          <div className="sticky bottom-0 shrink-0 bg-[linear-gradient(180deg,rgb(2_7_10/0),var(--night)_30%)] px-3 pt-6 pb-4 sm:px-6">
            <div className="mx-auto max-w-[780px]">{composer}</div>
          </div>
        </>
      )}
    </div>
  );
}

/* ================================================================== top bar */

function TopBar({ title, preview }: { title: string | null; preview: boolean }) {
  return (
    <div className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-night-line/60 bg-night/70 px-4 backdrop-blur-xl sm:px-6">
      <p className="min-w-0 truncate text-[14px] font-medium text-frost/85">{title ?? "New conversation"}</p>
      {preview && (
        <span className="shrink-0 rounded-full border border-melon/40 bg-melon/10 px-2.5 py-0.5 text-[11.5px] text-melon" title="The server isn't configured, so answers are simulated in this browser">
          Preview
        </span>
      )}
      <span className="glass ml-auto hidden shrink-0 items-center gap-2 rounded-full px-3 py-1 text-[12px] text-frost/80 sm:flex">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-volt opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-volt-lit" />
        </span>
        0gm-1.0-35b-a3b
        <span className="text-frost-soft">in a TDX enclave</span>
      </span>
    </div>
  );
}

/* ================================================================== composer */

function Composer({
  draft,
  setDraft,
  onSend,
  busy,
  big,
  areaRef,
}: {
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  onSend: (o: Outgoing) => void;
  busy: boolean;
  big: boolean;
  areaRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const [err, setErr] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const { text, att, task, ttl } = draft;

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(240, Math.max(big ? 72 : 28, el.scrollHeight))}px`;
  }, [text, big, areaRef]);

  async function attach(f: File | undefined) {
    if (!f) return;
    setErr(null);
    try {
      let next: Attachment;
      if (IMAGE_EXT.test(f.name)) {
        const content = await readAsDataUrl(f);
        if (content.length > MAX_CHARS) throw new Error("big");
        next = { name: f.name, content, kind: "image", bytes: f.size };
      } else if (TEXT_EXT.test(f.name) || f.type.startsWith("text/")) {
        const content = await f.text();
        if (content.length > MAX_CHARS) throw new Error("big");
        next = { name: f.name, content, kind: "text", bytes: f.size };
      } else {
        setErr("Only text files and images for now. For a PDF, paste its text into the message.");
        return;
      }
      setDraft((d) => ({ ...d, att: next }));
    } catch (e) {
      setErr(e instanceof Error && e.message === "big" ? "That file is over the 8 MB limit." : "That file couldn't be read.");
    }
  }

  const canSend = !busy && (!!att || text.trim().length > 0);

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
        className={cn(
          "lit-border relative rounded-[24px] transition-shadow",
          big ? "shadow-[0_30px_100px_-30px_rgb(2_151_222/0.55),0_20px_80px_-40px_rgb(252_115_77/0.5)]" : "shadow-[0_-10px_60px_-30px_rgb(2_151_222/0.45)]",
          "focus-within:shadow-[0_30px_110px_-25px_rgb(2_151_222/0.7),0_20px_90px_-35px_rgb(252_115_77/0.6)]",
        )}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          attach(e.dataTransfer.files?.[0]);
        }}
      >
        {att && (
          <div className="px-4 pt-4">
            <div className="inline-flex max-w-full items-center gap-3 rounded-[14px] border border-frost/10 bg-night-3/80 py-2 pr-2 pl-2">
              <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[linear-gradient(140deg,#0297de,#fc734d)] text-night">
                {att.kind === "image" ? <ImageIcon className="size-4" /> : <FileText className="size-4" />}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] font-medium">{att.name}</span>
                <span className="block font-mono text-[11px] text-frost-soft">{kb(att.bytes)}</span>
              </span>
              <button onClick={() => setDraft((d) => ({ ...d, att: null }))} aria-label="Remove attachment" className="grid size-7 place-items-center rounded-full text-frost-soft hover:bg-frost/10 hover:text-frost">
                <X className="size-3.5" />
              </button>
            </div>
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
          placeholder={att?.kind === "image" ? "The image is sent on its own." : att ? "Add a note for the reviewer (optional)" : "Paste a document, or attach one…"}
          className="block w-full resize-none bg-transparent px-5 pt-4 pb-2 text-[15.5px] leading-relaxed text-frost placeholder:text-frost/35 focus:outline-none disabled:opacity-50"
        />
        <div className="flex flex-wrap items-center gap-2 px-3 pb-3">
          <button
            onClick={() => file.current?.click()}
            className="grid size-9 place-items-center rounded-full border border-frost/10 text-frost-soft transition-colors hover:border-frost/25 hover:text-frost"
            aria-label="Attach a text file or image"
            title="Attach a text file or image"
          >
            <Paperclip className="size-4" />
          </button>
          <div className="flex rounded-full border border-frost/10 bg-night/60 p-0.5" role="radiogroup" aria-label="Task">
            {TASKS.map(({ key, name, icon: Icon }) => (
              <button
                key={key}
                role="radio"
                aria-checked={task === key}
                onClick={() => setDraft((d) => ({ ...d, task: key }))}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                  task === key ? "bg-frost text-night" : "text-frost-soft hover:text-frost",
                )}
              >
                <Icon className="size-3.5" strokeWidth={2} />
                <span className="max-sm:hidden">{name}</span>
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 rounded-full border border-frost/10 bg-night/60 py-1 pr-1 pl-2.5 text-[12.5px] text-frost-soft">
            <Timer className="size-3.5 text-melon" />
            <span className="max-sm:hidden">Destroy after</span>
            <select
              value={ttl}
              onChange={(e) => setDraft((d) => ({ ...d, ttl: Number(e.target.value) }))}
              className="cursor-pointer rounded-full bg-night-3 px-2 py-1 text-[12.5px] font-medium text-frost focus:outline-none"
            >
              {LIFESPANS.map((o) => (
                <option key={o.ttl} value={o.ttl}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={submit}
            disabled={!canSend}
            aria-label="Send"
            className="ml-auto grid size-10 place-items-center rounded-full bg-[linear-gradient(140deg,#ff9a7c,#fc734d_55%,#e9542e)] text-night shadow-[0_0_0_1px_rgb(255_255_255/0.15)_inset,0_8px_24px_-6px_rgb(252_115_77/0.8)] transition-[transform,opacity,box-shadow] hover:scale-105 active:scale-95 disabled:scale-100 disabled:opacity-25 disabled:shadow-none"
          >
            <ArrowUp className="size-5" strokeWidth={2.4} />
          </button>
        </div>
        <input
          ref={file}
          type="file"
          className="sr-only"
          accept=".txt,.md,.csv,.json,.png,.jpg,.jpeg,.gif,.webp,text/*,image/*"
          onChange={(e) => {
            attach(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      {err && (
        <p role="alert" className="mt-2 px-2 text-[13px] text-melon">
          {err}
        </p>
      )}
      {!big && (
        <p className="mt-2 text-center text-[11.5px] text-frost-soft/55">
          Enter to send, Shift and Enter for a new line. Each message is its own paid job.
        </p>
      )}
    </div>
  );
}

/* ================================================================== messages */

function UserMessage({ label, out, ttl, task }: { label: string; out?: Outgoing; ttl: number; task: Task | null }) {
  const typed = out?.text ?? "";
  const doc = out?.attachment;
  const docText = doc?.kind === "text" ? doc.content : "";
  return (
    <div className="rise flex flex-col items-end gap-2">
      {(doc || !out) && (
        <div className="flex max-w-[85%] items-center gap-3 rounded-[16px] border border-frost/10 bg-night-2 py-2.5 pr-4 pl-2.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-[11px] bg-[linear-gradient(140deg,#0297de,#fc734d)] text-night">
            {doc?.kind === "image" ? <ImageIcon className="size-[18px]" /> : <FileText className="size-[18px]" />}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[14px] font-medium">{label}</span>
            <span className="block font-mono text-[11px] text-frost-soft">
              {doc ? `${kb(doc.bytes)}, ` : ""}
              {taskName(task)}, destroy after {ttlLabel(ttl)}
            </span>
          </span>
        </div>
      )}
      {(typed || (!doc && out)) && (
        <div className="glass max-w-[85%] rounded-[20px] rounded-br-[6px] px-4 py-3">
          <p className="line-clamp-6 text-[15px] leading-relaxed whitespace-pre-wrap text-frost/90">{typed}</p>
          {!doc && <p className="mt-1.5 font-mono text-[11px] text-frost-soft">{taskName(task)}, destroy after {ttlLabel(ttl)}</p>}
        </div>
      )}
      {doc && !typed && docText && (
        <p className="max-w-[70%] truncate text-right font-mono text-[11px] text-frost-soft/60">{docText.split("\n").find((l) => l.trim())}</p>
      )}
      {!out && <p className="text-[11.5px] text-frost-soft/60">What you sent isn&rsquo;t kept in this browser.</p>}
    </div>
  );
}

function ReplyHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="text-[14px] font-semibold">Enigma</span>
      {children}
    </div>
  );
}

function Chip({ children, tone = "plain", href }: { children: React.ReactNode; tone?: "plain" | "volt" | "melon"; href?: string }) {
  const cls = cn(
    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10.5px]",
    tone === "volt" && "bg-volt/12 text-volt-lit",
    tone === "melon" && "bg-melon/12 text-melon",
    tone === "plain" && "bg-frost/[0.06] text-frost-soft",
  );
  return href ? (
    <Link href={href} className={cn(cls, "hover:text-frost")}>
      {children}
    </Link>
  ) : (
    <span className={cls}>{children}</span>
  );
}

/** The fuse: a vertical line down the answer that burns from the bottom as the key's lifespan runs out. */
function Fuse({ frac }: { frac: number }) {
  const f = Math.max(0, Math.min(1, frac));
  const late = f < 0.3;
  return (
    <div className="absolute top-1 bottom-1 left-0 w-[3px] rounded-full bg-frost/[0.07]" aria-hidden="true">
      <div
        className={cn(
          "absolute inset-x-0 top-0 h-full origin-top rounded-full transition-[transform] duration-300",
          late ? "bg-[linear-gradient(180deg,#fc734d,#ff9a7c)]" : "bg-[linear-gradient(180deg,#0297de,#5cc4ff_70%,#fc734d)]",
        )}
        style={{ transform: `scaleY(${f})` }}
      />
      {f > 0 && (
        <span
          className={cn(
            "absolute left-1/2 size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white",
            late ? "shadow-[0_0_0_3px_rgb(252_115_77/0.35),0_0_16px_4px_rgb(252_115_77/0.8)]" : "shadow-[0_0_0_3px_rgb(92_196_255/0.3),0_0_14px_3px_rgb(92_196_255/0.8)]",
          )}
          style={{ top: `${f * 100}%` }}
        />
      )}
    </div>
  );
}

function Turn({ entry, out }: { entry: IndexEntry; out?: Outgoing }) {
  return (
    <div className="space-y-5">
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
      <div className="flex gap-3.5">
        <OrbMark />
        <p className="pt-1.5 text-[13.5px] text-frost-soft">{error ? `Couldn't load job ${id}: ${error.message}` : "Loading…"}</p>
      </div>
    );

  const left = vm.expiresAt ? vm.expiresAt - now : 0;
  const frac = vm.ttl && vm.expiresAt ? left / (vm.ttl * 1000) : 0;
  const gone = vm.phase === "destroyed";
  const late = !gone && frac < 0.3;
  const jobLabel = vm.preview ? "preview" : `job ${vm.id}`;

  return (
    <div className="rise flex gap-3.5">
      <OrbMark className={cn(vm.phase === "working" && "animate-pulse")} />
      <div className="min-w-0 flex-1 pt-0.5">
        <ReplyHeader>
          <Chip href={`/job/${vm.id}`}>{jobLabel}</Chip>
          {vm.attestationHash && <Chip tone="volt">attested in TDX</Chip>}
          {vm.phase === "readable" && <Chip tone={late ? "melon" : "plain"}>key wiped in {countdown(left)}</Chip>}
          {gone && <Chip tone="melon">key wiped</Chip>}
        </ReplyHeader>

        {vm.phase === "working" && <Working started={vm.createdAt} />}

        {vm.phase === "readable" && vm.result && (
          <div className="relative mt-3 pl-6">
            <Fuse frac={frac} />
            <div className="space-y-5">
              {sections(vm.result).map((s, i) => (
                <section key={i}>
                  {s.title && <h3 className="text-[13px] font-semibold text-volt-lit">{s.title}</h3>}
                  {i === 0 ? (
                    <p className="mt-1.5 text-[17px] leading-relaxed text-frost">{s.items.join(" ")}</p>
                  ) : (
                    <ul className="mt-2 space-y-1.5">
                      {s.items.map((it, j) => (
                        <li key={j} className="flex gap-3 text-[15px] leading-relaxed text-frost/85">
                          <span className="mt-[10px] size-[5px] shrink-0 rounded-full bg-[linear-gradient(140deg,#5cc4ff,#fc734d)]" />
                          {it}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-1">
              <button
                onClick={() =>
                  navigator.clipboard?.writeText(vm.result ?? "").then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  })
                }
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12.5px] text-frost-soft transition-colors hover:bg-frost/[0.06] hover:text-frost"
              >
                <Copy className="size-3.5" />
                {copied ? "Copied" : "Copy"}
              </button>
              <Link href={`/job/${vm.id}`} className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12.5px] text-frost-soft transition-colors hover:bg-frost/[0.06] hover:text-frost">
                <Receipt className="size-3.5" />
                Receipt and evidence
              </Link>
              {vm.expiresAt && (
                <span className="ml-auto font-mono text-[11px] text-frost-soft/60">
                  unreadable from {new Date(vm.expiresAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </div>
          </div>
        )}

        {gone && (
          <div className="rise relative mt-3 overflow-hidden rounded-[16px] border border-frost/[0.07] bg-[repeating-linear-gradient(90deg,rgb(234_243_249/0.02)_0_1px,transparent_1px_6px)] p-4">
            <p className="font-mono text-[11.5px] leading-relaxed break-all text-frost/25 sm:pr-40">
              {vm.ciphertextPreview ?? "The encrypted answer has expired from Arkiv as well."}
            </p>
            <p className="mt-3 text-[13.5px] text-frost-soft">
              Key wiped{vm.destruction ? ` at ${new Date(vm.destruction.destructionTimestamp * 1000).toLocaleTimeString("en-GB")}` : ""}. This answer can&rsquo;t be read again, by anyone.{" "}
              <Link href={`/job/${vm.id}`} className="text-frost underline decoration-frost/30 underline-offset-4 hover:decoration-frost">
                See the receipt
              </Link>
            </p>
            <div className="stamp-in pointer-events-none absolute top-3 right-3 rounded-[5px] border-[3px] border-melon px-2.5 py-0.5 text-melon max-sm:hidden">
              <span className="display narrow block text-[1.4rem] leading-none tracking-[0.02em]">DESTROYED</span>
            </div>
          </div>
        )}

        {(vm.phase === "failed" || vm.phase === "refunded" || vm.phase === "missing") && (
          <p className="mt-3 rounded-[16px] border border-melon/30 bg-melon/[0.08] p-4 text-[14px]">
            {vm.phase === "refunded" ? "This job failed after payment and was refunded." : vm.phase === "missing" ? "This job isn't on-chain." : "This job failed. Nothing was stored."}
          </p>
        )}
      </div>
    </div>
  );
}

function Working({ started }: { started: number }) {
  const now = useNow();
  const secs = Math.max(0, Math.floor((now - started) / 1000));
  // The server doesn't report progress, so this walks the real order without claiming which step it is on.
  const step = Math.min(SERVER_STEPS.length - 1, Math.floor(secs / 5));
  return (
    <div className="mt-2.5">
      <div className="flex items-center gap-3">
        <span className="shimmer text-[15px] font-medium">{SERVER_STEPS[step]}</span>
        <span className="num font-mono text-[11.5px] text-frost-soft/70">{secs}s</span>
      </div>
      <div className="mt-3 flex gap-1" aria-hidden="true">
        {SERVER_STEPS.map((_, i) => (
          <span key={i} className={cn("h-1 w-6 rounded-full transition-colors duration-500", i < step ? "bg-volt" : i === step ? "animate-pulse bg-volt-lit" : "bg-frost/10")} />
        ))}
      </div>
      <p className="mt-2 text-[12px] text-frost-soft/70">The server runs these steps in order. Usually under a minute.</p>
    </div>
  );
}

function PendingTurn({ p, onRetry, onPreview }: { p: Pending; onRetry: () => void; onPreview: () => void }) {
  const refund = p.error && typeof p.error.body.refund === "string";
  return (
    <div className="space-y-5">
      <UserMessage label={p.out.label} out={p.out} ttl={p.out.ttl} task={p.out.task} />
      <div className="rise flex gap-3.5">
        <OrbMark className={cn(!p.error && "animate-pulse")} />
        <div className="min-w-0 flex-1 pt-0.5">
          <ReplyHeader>{p.error ? <Chip tone="melon">not sent</Chip> : <Chip>working</Chip>}</ReplyHeader>
          {!p.error ? (
            <Working started={p.started} />
          ) : (
            <div role="alert" className="mt-3 rounded-[18px] border border-melon/30 bg-[linear-gradient(160deg,rgb(252_115_77/0.12),rgb(252_115_77/0.03))] p-4 sm:p-5">
              <p className="text-[15px] font-semibold">{p.error.notConfigured ? "The server isn't set up to run jobs yet" : "This message didn't go through"}</p>
              <p className="mt-1.5 font-mono text-[12px] leading-relaxed break-words text-frost/70">{p.error.message}</p>
              {refund && <p className="mt-2 text-[13px] text-frost/80">Job {String(p.error.body.jobId)} was stopped and its key wiped. The payment comes back after the contract&rsquo;s timeout.</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                {p.error.notConfigured && (
                  <Button size="sm" onClick={onPreview}>
                    Continue as a preview
                  </Button>
                )}
                <Button size="sm" variant="outline-frost" onClick={onRetry}>
                  Try again
                </Button>
              </div>
              {p.error.notConfigured && (
                <p className="mt-3 text-[12px] leading-relaxed text-frost-soft">
                  Real jobs need the keys from .env.example on the server. The preview simulates the server in your browser and is labelled on every answer.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
