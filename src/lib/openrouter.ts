import type { ORModel } from "@/lib/types";

const OR_BASE = "https://openrouter.ai/api/v1" as const;

export async function fetchModels(apiKey: string): Promise<ORModel[]> {
  const res = await fetch(`${OR_BASE}/models`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "Byzantine Chat",
    },
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error("unauthorized");
  }
  if (!res.ok) {
    throw new Error(`models_failed_${res.status}`);
  }
  const data = await res.json();
  const items = Array.isArray(data.data) ? data.data : data;
  return (items as any[]).map((m) => ({
    id: m.id,
    name: m.name,
    context_length: m.context_length,
    pricing: m.pricing,
    raw: m,
  }));
}

export type StreamCallbacks = {
  onStart?: () => void;
  onToken?: (delta: string) => void;
  onDone?: (full: string) => void;
  onError?: (err: Error) => void;
};

export async function streamChatCompletion(params: {
  apiKey: string;
  model: string;
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  callbacks?: StreamCallbacks;
}) {
  const { apiKey, model, messages, temperature, top_p, max_tokens, callbacks } = params;

  // Build body with only provided optional fields so OpenRouter can apply model defaults
  const body: any = { model, messages, stream: true };
  if (typeof temperature === "number") body.temperature = temperature;
  if (typeof top_p === "number") body.top_p = top_p;
  if (typeof max_tokens === "number") body.max_tokens = max_tokens;

  const res = await fetch(`${OR_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "Byzantine Chat",
    },
    body: JSON.stringify(body),
  });

  if (res.status === 401 || res.status === 403) throw new Error("unauthorized");
  if (res.status === 429) throw new Error("rate_limited");
  if (!res.ok || !res.body) throw new Error(`chat_failed_${res.status}`);

  callbacks?.onStart?.();
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") {
        callbacks?.onDone?.(full);
        return;
      }
      try {
        const json = JSON.parse(data);
        const delta: string = json.choices?.[0]?.delta?.content ?? "";
        if (delta) {
          full += delta;
          callbacks?.onToken?.(delta);
        }
      } catch (e) {
        // ignore malformed line
      }
    }
  }
  callbacks?.onDone?.(full);
}


