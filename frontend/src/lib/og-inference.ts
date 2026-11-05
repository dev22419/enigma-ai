import { ZG_API_URL, ZG_MODEL, SYSTEM_PROMPTS, type TaskType } from "./constants";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

interface InferenceResult {
  chatId: string;
  content: string;
}

export async function runInference(
  taskType: TaskType,
  fileContent: string,
  imageBase64?: string
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
          image_url: { url: `data:image/png;base64,${imageBase64}` },
        },
      ],
    });
  } else {
    messages.push({
      role: "user",
      content: `Analyze the following document:\n\n${fileContent}`,
    });
  }

  const res = await fetch(`${ZG_API_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: ZG_MODEL,
      messages,
      max_tokens: 2048,
      verify_tee: true,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`0G inference failed: ${res.status} ${err}`);
  }

  const data = await res.json();
  const chatId = data.id || data._0g?.chat_id || "";
  const content = data.choices?.[0]?.message?.content || "";

  return { chatId, content };
}

export async function getTeeAttestation(chatId: string): Promise<string> {
  const apiKey = process.env.ZG_API_KEY;
  if (!apiKey) throw new Error("ZG_API_KEY not configured");

  const res = await fetch(`${ZG_API_URL.replace("/v1", "")}/signature/${chatId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`TEE attestation fetch failed: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data.signature || data.attestation || JSON.stringify(data);
}
