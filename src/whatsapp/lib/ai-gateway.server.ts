// Server-only helpers for talking to Lovable AI Gateway.

const BASE = "https://ai.gateway.lovable.dev/v1";

function authHeaders() {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
    "X-Lovable-AIG-SDK": "vercel-ai-sdk",
  };
}

export type ChatTurn = { role: "system" | "user" | "assistant"; content: string };

export async function gatewayChat(messages: ChatTurn[], model = "google/gemini-3-flash-preview"): Promise<string> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ model, messages, max_tokens: 2048 }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Gateway chat error ${res.status}: ${txt}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

export async function gatewayImage(prompt: string): Promise<string> {
  const safePrompt = sanitizeImagePrompt(prompt);
  const res = await fetch(`${BASE}/images/generations`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      model: "openai/gpt-image-2",
      prompt: safePrompt,
      quality: "low",
      size: "1024x1536",
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Gateway image error ${res.status}: ${txt}`);
  }
  const data = await res.json();
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error("Image gateway returned no data");
  return `data:image/png;base64,${b64}`;
}

function sanitizeImagePrompt(prompt: string): string {
  return prompt
    .replace(/\bmorbidly obese\b/gi, "very plus-size")
    .replace(/\bmorbide obese\b/gi, "very plus-size")
    .replace(/\bextremely morbidly obese\b/gi, "very plus-size")
    .replace(/\bextreem dik(?:ke)?\b/gi, "very plus-size")
    .replace(/\bheel veel vetlagen\b/gi, "soft facial features")
    .replace(/\bmany fat rolls\b/gi, "soft rounded features")
    .replace(/\bfat rolls\b/gi, "rounded features")
    .replace(/\bhuge double chin\b/gi, "soft double chin")
    .replace(/\bextreem dikke onderkin\b/gi, "soft double chin")
    .replace(/\b12[- ]jarige vriendje\b/gi, "vriend")
    .replace(/\b12[- ]year[- ]old boyfriend\b/gi, "friend")
    .replace(/\bgeneukt\b/gi, "ontmoet")
    .replace(/\bkont\b/gi, "pose")
    .replace(/\bbillen\b/gi, "pose")
    .replace(/\bachterwerk\b/gi, "pose")
    .slice(0, 3800);
}
