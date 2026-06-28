// Server-only helpers for talking to Lovable AI Gateway.

const BASE = "https://ai.gateway.lovable.dev/v1";

function authHeaders() {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  return {
    "Content-Type": "application/json",
    "Lovable-API-Key": key,
    "X-Lovable-AIG-SDK": "vercel-ai-sdk",
  };
}

export class GatewayPaymentRequiredError extends Error {
  constructor(message = "Lovable AI credits zijn op") {
    super(message);
    this.name = "GatewayPaymentRequiredError";
  }
}

export class GatewayRateLimitError extends Error {
  constructor(message = "Lovable AI is tijdelijk te druk") {
    super(message);
    this.name = "GatewayRateLimitError";
  }
}

export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "input_audio"; input_audio: { data: string; format: string } };

export type ChatTurn = {
  role: "system" | "user" | "assistant";
  content: string | ChatContentPart[];
};

export async function gatewayChat(messages: ChatTurn[], model = "google/gemini-3-flash-preview"): Promise<string> {
  // 1) Try direct Gemini API first (uses GEMINI_API_KEY, no Lovable credits).
  if (process.env.GEMINI_API_KEY) {
    try {
      const { geminiDirectChat } = await import("./gemini-direct.server");
      return await geminiDirectChat(messages);
    } catch (e) {
      console.warn("[chat] gemini direct failed, falling back to Lovable gateway:", (e as Error).message);
    }
  }
  // 2) Lovable AI Gateway.
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ model, messages, max_tokens: 2048 }),
    });
    if (!res.ok) {
      const txt = await res.text();
      if (res.status === 402) throw new GatewayPaymentRequiredError(`Gateway chat 402: ${txt}`);
      if (res.status === 429) throw new GatewayRateLimitError(`Gateway chat 429: ${txt}`);
      throw new Error(`Gateway chat error ${res.status}: ${txt}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "";
  } catch (e) {
    // 3) NVIDIA deepseek-v4-flash as last resort.
    if (process.env.NVIDIA_API_KEY) {
      console.warn("[chat] Lovable gateway failed, falling back to NVIDIA deepseek:", (e as Error).message);
      try {
        const { nvidiaDeepseekChat } = await import("./gemini-direct.server");
        return await nvidiaDeepseekChat(messages);
      } catch (e2) {
        console.error("[chat] NVIDIA deepseek also failed:", (e2 as Error).message);
      }
    }
    throw e;
  }
}


// Vaste referentiefoto's voor Gerda — gebruikt om gezicht/uiterlijk consistent te houden.
export const GERDA_REFERENCE_IMAGE = "https://i.imgur.com/e9o18Au.jpeg";
export const GERDA_REFERENCE_IMAGE_2 = "https://i.imgur.com/aVca7ZO.jpeg";
export const GERDA_REFERENCE_IMAGES = [GERDA_REFERENCE_IMAGE, GERDA_REFERENCE_IMAGE_2];

export async function gatewayImage(prompt: string, referenceUrl?: string): Promise<string> {
  const safePrompt = sanitizeImagePrompt(prompt);
  const refLine = referenceUrl
    ? ` The subject's face, hair (completely bald, no hair), body shape and overall look must stay CONSISTENT with the reference character portraits at ${GERDA_REFERENCE_IMAGE} and ${GERDA_REFERENCE_IMAGE_2} (same woman, same bald head, same face, same body type in every image).`
    : "";
  return requestGatewayImage(
    {
      model: "openai/gpt-image-2",
      prompt: safePrompt + refLine,
      quality: "low",
      size: "1024x1536",
      n: 1,
    },
    "Gateway image gpt-image-2",
  );
}

export async function gatewayNanoBananaImage(prompt: string, referenceUrl?: string): Promise<string> {
  const safePrompt = sanitizeImagePrompt(prompt);
  const refUrls = referenceUrl ? [referenceUrl, GERDA_REFERENCE_IMAGE_2] : GERDA_REFERENCE_IMAGES;
  const content: any[] = [
    ...refUrls.map((url) => ({ type: "image_url", image_url: { url } })),
    {
      type: "text",
      text:
        "CRITICAL: The attached photos ARE the character (multiple reference photos of the SAME person). You MUST generate a new image of the EXACT SAME person from those photos — same face shape, COMPLETELY BALD HEAD (no hair at all), same skin tone, same chin, same body, same age, same gender, same overall look. Do NOT invent a different person and do NOT add hair. Treat this as image editing / character consistency: keep the identity from the reference photos 100% intact, but place this same bald person in the new scene described below.\n\nScene: " +
        safePrompt +
        "\n\nVertical 9:16 amateur smartphone photo, authentic everyday candid, not a studio photo, no text overlays.",
    },
  ];
  return requestGatewayImage(
    {
      model: "google/gemini-3.1-flash-image",
      messages: [{ role: "user", content }],
      modalities: ["image", "text"],
    },
    "Gateway image nano-banana-2",
  );
}

async function requestGatewayImage(body: Record<string, unknown>, label: string): Promise<string> {
  const res = await fetch(`${BASE}/images/generations`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`${label} error ${res.status}: ${txt}`);
  }
  const data = await res.json();
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error(`${label} returned no image data`);
  return `data:image/png;base64,${b64}`;
}

export function sanitizeImagePrompt(prompt: string): string {
  return prompt
    .replace(/\bBrendi Boterpak\b/gi, "een volwassen vriend")
    .replace(/\bBrendi\b/gi, "een volwassen vriend")
    .replace(/\bLoek Ezendam\b/gi, "een volwassen vriend")
    .replace(/\bLoek\b/gi, "een volwassen vriend")
    .replace(/\b12\s*jaar oud\b/gi, "volwassen")
    .replace(/\b12[- ]jarige\b/gi, "volwassen")
    .replace(/\b12[- ]year[- ]old\b/gi, "adult")
    .replace(/\bextremely morbidly obese\b/gi, "plus-size")
    .replace(/\bmorbidly obese\b/gi, "plus-size")
    .replace(/\bmorbide obese\b/gi, "plus-size")
    .replace(/\bmorbide obees\b/gi, "plus-size")
    .replace(/\bobese\b/gi, "plus-size")
    .replace(/\bobese\b/gi, "plus-size")
    .replace(/\bextreem dik(?:ke)?\b/gi, "plus-size")
    .replace(/\bdikke\b/gi, "plus-size")
    .replace(/\bheel veel vette? onderkinne?n?\b/gi, "een rond vriendelijk gezicht")
    .replace(/\bheel veel vetlagen\b/gi, "zachte ronde vormen")
    .replace(/\bvetlagen\b/gi, "ronde vormen")
    .replace(/\bmany fat rolls\b/gi, "soft rounded silhouette")
    .replace(/\bfat rolls\b/gi, "rounded silhouette")
    .replace(/\bhuge double chin\b/gi, "round friendly face")
    .replace(/\bdouble chin\b/gi, "round friendly face")
    .replace(/\bextreem dikke onderkin\b/gi, "rond vriendelijk gezicht")
    .replace(/\bonderkin\b/gi, "rond gezicht")
    .replace(/\bdom(?:me)?\b/gi, "speels")
    .replace(/\bdumb\b/gi, "playful")
    .replace(/\bstupid\b/gi, "playful")
    .replace(/\bextremely\b/gi, "")
    .replace(/\bextreem\b/gi, "")
    .replace(/\benorme?\b/gi, "grote")
    .replace(/\bhuge\b/gi, "large")
    .replace(/\b12[- ]jarige vriendje\b/gi, "vriend")
    .replace(/\b12[- ]year[- ]old boyfriend\b/gi, "friend")
    .replace(/\bgeneukt\b/gi, "ontmoet")
    .replace(/\bsex\b/gi, "conversation")
    .replace(/\bseks\b/gi, "gesprek")
    .replace(/\bhomo\b/gi, "vriendelijk")
    .replace(/\bgay\b/gi, "friendly")
    .replace(/\bballen\b/gi, "grappige details")
    .replace(/\bpieleke\b/gi, "grappig detail")
    .replace(/\bkont\b/gi, "pose")
    .replace(/\bbillen\b/gi, "pose")
    .replace(/\bachterwerk\b/gi, "pose")
    .replace(/\s{2,}/g, " ")
    .slice(0, 3800);
}
