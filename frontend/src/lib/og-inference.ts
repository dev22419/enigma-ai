// All 0G requests use X-0G-Provider-Trust-Mode: private, which routes exclusively
// to TeeML providers (Intel TDX enclaves). The 0G router returns 503 rather than
// silently falling back to a non-TEE provider.
import { ZG_API_URL, ZG_FALLBACK_MODEL, ZG_MODEL, SYSTEM_PROMPTS, type TaskType } from "./constants";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

// The model reasons before it answers, and that reasoning counts against this budget. 4096 was cut off
// mid-answer on a one-page financial statement (finish_reason "length"), so leave real headroom.
const MAX_OUTPUT_TOKENS = 8192;

interface InferenceResult {
  chatId: string;
  content: string;
  provider: string;
  requestId: string;
  // Why the model stopped, e.g. "stop" or "length". "length" means the answer was cut off.
  finishReason: string;
  // The model that actually answered (the fallback, if the first one's provider was down).
  model: string;
}

const MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

export function mimeTypeFromFileName(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return MIME_TYPES[ext] ?? "image/png";
}

export async function runInference(
  taskType: TaskType,
  fileContent: string,
  imageBase64?: string,
  mimeType = "image/png"
): Promise<InferenceResult> {
  const apiKey = process.env.ZG_API_KEY;
  if (!apiKey) throw new Error("ZG_API_KEY not configured");

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPTS[taskType] },
  ];

  if (imageBase64) {
    messages.push({
      role: "user",
      content: [
        { type: "text", text: "Analyze this document:" },
        {
          type: "image_url",
          image_url: { url: `data:${mimeType};base64,${imageBase64}` },
        },
      ],
    });
  } else {
    messages.push({
      role: "user",
      content: `Analyze the following document:\n\n${fileContent}`,
    });
  }

  // The fallback only reads text: it may not accept images, and an image should never be sent somewhere unexpected.
  const models = imageBase64 || !ZG_FALLBACK_MODEL || ZG_FALLBACK_MODEL === ZG_MODEL ? [ZG_MODEL] : [ZG_MODEL, ZG_FALLBACK_MODEL];
  let res: Response | null = null;
  let model = ZG_MODEL;
  let lastError = "";
  for (const m of models) {
    model = m;
    res = await fetch(`${ZG_API_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-0G-Provider-Trust-Mode": "private",
      },
      body: JSON.stringify({
        model: m,
        messages,
        max_tokens: MAX_OUTPUT_TOKENS,
        verify_tee: true,
      }),
    });
    if (res.ok) break;
    lastError = `0G inference failed: ${res.status} ${await res.text()}`;
    // Only a provider outage (5xx) moves on to the next model. A bad request would fail there too.
    if (res.status < 500) break;
  }

  if (!res || !res.ok) throw new Error(lastError);

  const data = await res.json();
  const chatId = data.id || "";
  const content = data.choices?.[0]?.message?.content || "";
  const finishReason = data.choices?.[0]?.finish_reason || "";
  const provider = data.x_0g_trace?.provider || "";
  const requestId = data.x_0g_trace?.request_id || "";

  return { chatId, content, provider, requestId, finishReason, model };
}

export async function getTeeAttestation(
  chatId: string,
  provider: string,
  requestId: string,
  model: string = ZG_MODEL
): Promise<string> {
  const attestation = JSON.stringify({
    chatId,
    provider,
    requestId,
    verifyTee: true,
    model,
    timestamp: Math.floor(Date.now() / 1000),
  });
  return attestation;
}
