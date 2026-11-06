export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

const DEFAULT_MAX_CHARS = 200_000;

interface JobLike {
  id: string;
  createdAt: number;
}

interface SentLike {
  content: string;
  attachment?: { kind: string } | null;
}

export function buildHistory(
  threadJobs: JobLike[],
  sent: Record<string, SentLike>,
  getFresh: (id: string) => string | undefined,
  maxChars = DEFAULT_MAX_CHARS,
): HistoryMessage[] {
  const sorted = [...threadJobs].sort((a, b) => a.createdAt - b.createdAt);

  const pairs: { user: string; assistant: string }[] = [];
  for (const job of sorted) {
    const s = sent[job.id];
    if (!s) continue;
    const assistantContent = getFresh(job.id);
    if (!assistantContent) continue;

    const isImage = s.attachment?.kind === "image";
    const userContent = isImage ? "[Image document attached]" : s.content;

    pairs.push({ user: userContent, assistant: assistantContent });
  }

  let total = 0;
  for (const p of pairs) total += p.user.length + p.assistant.length;

  while (total > maxChars && pairs.length > 1) {
    const drop = pairs.splice(1, 1)[0];
    total -= drop.user.length + drop.assistant.length;
  }

  const result: HistoryMessage[] = [];
  for (const p of pairs) {
    result.push({ role: "user", content: p.user });
    result.push({ role: "assistant", content: p.assistant });
  }
  return result;
}
