"use client";
// AI-assisted: Used Claude for the upload page
import { useCallback, useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { createJob, rememberJob } from "@/lib/client/api";
import { TASK_TYPES, type TaskType } from "@/lib/constants";

const TASK_LABEL: Record<TaskType, string> = { medical: "Medical", legal: "Legal", financial: "Financial" };
const SAMPLE: Record<TaskType, string> = {
  medical: "sample-medical-report.txt",
  legal: "sample-legal-contract.txt",
  financial: "sample-financial-statement.txt",
};
const TTLS = [
  { label: "2 min", seconds: 120 },
  { label: "1 hour", seconds: 3600 },
  { label: "1 day", seconds: 86400 },
  { label: "7 days", seconds: 604800 },
];

const MAX_CHARS = 8_000_000; // Same limit as POST /api/jobs.
const TEXT_FILE = /\.(txt|md|csv|json|log|xml|html?)$/i;
const IMAGE_FILE = /\.(png|jpe?g|gif|webp)$/i;

async function readFile(file: File) {
  if (TEXT_FILE.test(file.name)) return file.text();
  if (IMAGE_FILE.test(file.name)) {
    const url = await new Promise<string>((done, fail) => {
      const reader = new FileReader();
      reader.onload = () => done(String(reader.result));
      reader.onerror = () => fail(new Error("Could not read that file"));
      reader.readAsDataURL(file);
    });
    return url.slice(url.indexOf(",") + 1); // The API adds its own data: prefix.
  }
  throw new Error("Use a text file or an image. PDF and Word are not supported yet.");
}

export default function UploadPage() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [task, setTask] = useState<TaskType>("legal");
  const [ttl, setTtl] = useState(120);
  const [file, setFile] = useState<{ name: string; content: string } | null>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const take = useCallback(async (picked?: File) => {
    if (!picked) return;
    setError("");
    try {
      const content = await readFile(picked);
      if (content.length > MAX_CHARS) throw new Error("That file is too large. The limit is about 8 MB.");
      setFile({ name: picked.name, content });
    } catch (e) {
      setFile(null);
      setError(e instanceof Error ? e.message : "Could not read that file");
    }
  }, []);

  const useSample = async () => {
    setError("");
    const name = SAMPLE[task];
    const res = await fetch(`/samples/${name}`);
    setFile({ name, content: await res.text() });
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    take(e.dataTransfer.files[0]);
  };

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const job = await createJob({ taskType: task, ttl, fileName: file.name, fileContent: file.content });
      rememberJob({ id: job.jobId, fileName: file.name, taskType: task, createdAt: Date.now() });
      router.push(`/job/${job.jobId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The job failed");
      setBusy(false);
    }
  };

  if (busy) {
    return (
      <main className="page page-narrow">
        <h1>Working on {file?.name}</h1>
        {/* The API reports nothing until the end, so this loops rather than claiming a stage. See issue #20. */}
        <svg className="run" viewBox="0 0 640 90" role="img" aria-label="The job is running">
          <path className="run-line" d="M20 40 H620" />
          {["Encrypt", "Enclave", "Arkiv", "Whitechain"].map((label, i) => (
            <g key={label}>
              <circle className="run-node" cx={20 + i * 200} cy={40} r={7} />
              <text x={20 + i * 200} y={74} textAnchor={i === 0 ? "start" : i === 3 ? "end" : "middle"}>{label}</text>
            </g>
          ))}
          <circle className="run-dot" r={6}>
            <animateMotion dur="2.8s" repeatCount="indefinite" path="M20 40 H620" />
          </circle>
        </svg>
        <p className="muted">This can take a minute. Keep this tab open.</p>
      </main>
    );
  }

  return (
    <main className="page page-narrow">
      <h1>New job</h1>

      <label
        className="drop"
        data-over={over}
        data-filled={!!file}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <input ref={input} type="file" accept=".txt,.md,.csv,.json,.log,.xml,.html,.png,.jpg,.jpeg,.gif,.webp" onChange={(e) => { take(e.target.files?.[0]); e.target.value = ""; }} />
        <strong>{file ? file.name : "Drop a file here"}</strong>
        <span>{file ? `${file.content.length.toLocaleString()} characters` : "Text or image, up to 8 MB"}</span>
      </label>
      <button type="button" className="link" onClick={useSample}>Use a synthetic sample</button>

      <fieldset className="choice">
        <legend>Document</legend>
        {TASK_TYPES.map((t) => (
          <button key={t} type="button" aria-pressed={task === t} onClick={() => setTask(t)}>{TASK_LABEL[t]}</button>
        ))}
      </fieldset>

      <fieldset className="choice">
        <legend>Forget after</legend>
        {TTLS.map((o) => (
          <button key={o.seconds} type="button" aria-pressed={ttl === o.seconds} onClick={() => setTtl(o.seconds)}>{o.label}</button>
        ))}
      </fieldset>

      {error && <p className="err" role="alert">{error}</p>}
      <button type="button" className="btn btn-lg" disabled={!file} onClick={submit}>Run job</button>
      <p className="muted">Testnet build. Do not submit real confidential data.</p>
    </main>
  );
}
