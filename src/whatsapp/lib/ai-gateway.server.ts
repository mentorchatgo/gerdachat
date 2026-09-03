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

export async function gatewayChat(messages: ChatTurn[], _model = "google/gemini-3-flash-preview"): Promise<string> {
  // Alles gaat via Google AI Studio (Gemini API) met meerdere fallback-sleutels.
  const { geminiDirectChat } = await import("./gemini-direct.server");
  let lastErr: Error | null = null;
  let delay = 700;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await geminiDirectChat(messages);
    } catch (e) {
      lastErr = e as Error;
      console.warn(`[chat] gemini direct attempt ${attempt + 1} failed:`, lastErr.message);
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, delay));
        delay *= 2;
      }
    }
  }
  throw lastErr ?? new Error("Gemini chat failed");
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
