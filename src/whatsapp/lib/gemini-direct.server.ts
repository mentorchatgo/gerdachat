// Direct Google Generative Language REST calls using GEMINI_API_KEY.
// Used for image generation (Gemini 2.5 Flash Image) and TTS (Gemini TTS).

const BASE = "https://generativelanguage.googleapis.com/v1beta";

// Chat/TTS: alleen de standaard sleutel.
function keys(): string[] {
  const primary = process.env.GEMINI_API_KEY;
  if (!primary) throw new Error("Missing GEMINI_API_KEY");
  return [primary];
}

// Afbeeldingen: standaard sleutel + alle reservesleutels.
function imageKeys(): string[] {
  const list = keys().slice();
  const fallbacks = process.env.GEMINI_API_KEYS_FALLBACK;
  if (fallbacks) {
    for (const k of fallbacks.split(/[,\s]+/)) {
      const t = k.trim();
      if (t && !list.includes(t)) list.push(t);
    }
  }
  return list;
}


type ChatPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "input_audio"; input_audio: { data: string; format: string } };
type ChatTurn = { role: "system" | "user" | "assistant"; content: string | ChatPart[] };

async function urlToInlineData(url: string): Promise<{ mimeType: string; data: string }> {
  if (url.startsWith("data:")) {
    const m = url.match(/^data:([^;]+);base64,(.*)$/);
    if (!m) throw new Error("Invalid data URL");
    return { mimeType: m[1], data: m[2] };
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ref ${r.status}`);
  const mimeType = r.headers.get("content-type") || "image/jpeg";
  const buf = new Uint8Array(await r.arrayBuffer());
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    s += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + chunk)) as any);
  }
  return { mimeType, data: btoa(s) };
}

export async function geminiDirectChat(
  messages: ChatTurn[],
  models: string[] = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"],
): Promise<string> {
  const sys = messages.find((m) => m.role === "system");
  const rest = messages.filter((m) => m.role !== "system");
  const contents: any[] = [];
  for (const m of rest) {
    const parts: any[] = [];
    if (typeof m.content === "string") {
      parts.push({ text: m.content });
    } else {
      for (const p of m.content) {
        if (p.type === "text") parts.push({ text: p.text });
        else if (p.type === "image_url") {
          try {
            parts.push({ inlineData: await urlToInlineData(p.image_url.url) });
          } catch {}
        } else if (p.type === "input_audio") {
          const mime = p.input_audio.format === "wav" ? "audio/wav" : `audio/${p.input_audio.format}`;
          parts.push({ inlineData: { mimeType: mime, data: p.input_audio.data } });
        }
      }
    }
    contents.push({ role: m.role === "assistant" ? "model" : "user", parts });
  }
  const body: any = { contents, generationConfig: { maxOutputTokens: 2048 } };
  if (sys && typeof sys.content === "string") {
    body.systemInstruction = { parts: [{ text: sys.content }] };
  }
  let lastErr = "";
  const apiKeys = keys();
  for (const model of models) {
    for (const apiKey of apiKeys) {
      const url = `${BASE}/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        lastErr = `Gemini direct ${model} ${res.status}`;
        console.warn(lastErr, await res.text());
        continue;
      }
      const data = (await res.json()) as any;
      const parts = data?.candidates?.[0]?.content?.parts ?? [];
      const text = parts.map((p: any) => p.text || "").join("");
      if (text.trim()) return text;
      lastErr = `Gemini direct ${model}: empty response`;
    }
  }
  throw new Error(lastErr || "Gemini direct failed");
}

// Afbeeldingen via apimart.ai (OpenAI-compatible) met OPENAI_API_KEY.
// Model: gemini-3.1-flash-lite-image (Nano Banana 2 Flash Lite) — werkt altijd.
// Fallback: Google AI Studio met alle sleutels.
const APIMART_BASE = "https://api.apimart.ai/v1";
const APIMART_MODEL = "gemini-3.1-flash-lite-image";

async function generateImageApimart(prompt: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Missing OPENAI_API_KEY");
  const { GERDA_REF_DATA_URLS } = await import("./gerda-refs.server");
  const content: any[] = [];
  for (const url of GERDA_REF_DATA_URLS) {
    content.push({ type: "image_url", image_url: { url } });
  }
  content.push({ type: "text", text: prompt });

  const res = await fetch(`${APIMART_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: APIMART_MODEL,
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`apimart ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = (await res.json()) as any;
  const msg = data?.choices?.[0]?.message ?? {};
  // Mogelijke vormen: images-array, content met image_url-parts, of data-URL in content.
  const images = msg.images ?? [];
  for (const img of images) {
    const u = img?.image_url?.url || img?.url;
    if (u) {
      if (u.startsWith("data:")) return u;
      const { data, mimeType } = await urlToInlineData(u);
      return `data:${mimeType};base64,${data}`;
    }
  }
  const mc = msg.content;
  if (Array.isArray(mc)) {
    for (const p of mc) {
      const u = p?.image_url?.url || (p?.type === "image_url" ? p?.url : undefined);
      if (u?.startsWith("data:")) return u;
    }
  }
  if (typeof mc === "string") {
    const m = mc.match(/data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+/i);
    if (m) return m[0];
  }
  throw new Error("apimart: geen afbeelding in antwoord");
}

const IMAGE_MODELS = [
  "gemini-3.1-flash-lite-image", // Nano Banana 2 Flash Lite (primair)
  "gemini-3.1-flash-image",
  "gemini-3.1-flash-image-preview",
  "gemini-2.5-flash-image",
  "gemini-3-pro-image",
];

function shuffled<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function generateImageGeminiNanoBanana2Lite(
  prompt: string,
  _referenceUrls: string[] = [],
): Promise<string> {
  // 1) Primair: apimart.ai met OPENAI_API_KEY (Nano Banana 2 Flash Lite).
  try {
    return await generateImageApimart(prompt);
  } catch (e: any) {
    console.warn("[image] apimart failed:", e?.message || e);
  }

  // 2) Fallback: Google AI Studio met alle sleutels.
  const { GERDA_REF_INLINE } = await import("./gerda-refs.server");
  const parts: any[] = GERDA_REF_INLINE.map((r) => ({ inlineData: r }));
  parts.push({ text: prompt });

  const body = JSON.stringify({
    contents: [{ role: "user", parts }],
    generationConfig: { responseModalities: ["IMAGE"] },
  });

  const apiKeys = shuffled(imageKeys());
  let lastErr = "";

  for (const apiKey of apiKeys) {
    for (const model of IMAGE_MODELS) {
      let res: Response;
      try {
        res = await fetch(`${BASE}/models/${model}:generateContent?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
      } catch (e: any) {
        lastErr = `${model}: network ${e?.message || e}`;
        continue;
      }
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        lastErr = `${model} ${res.status}`;
        console.warn("[image]", lastErr, txt.slice(0, 200));
        // 400/404 = model bestaat niet of prompt geweigerd -> volgend model.
        // 429/5xx = quota of storing -> volgende sleutel/model.
        continue;
      }
      const data = (await res.json()) as any;
      const outParts = data?.candidates?.[0]?.content?.parts ?? [];
      for (const p of outParts) {
        const inline = p.inlineData || p.inline_data;
        if (inline?.data) {
          const mime = inline.mimeType || inline.mime_type || "image/png";
          return `data:${mime};base64,${inline.data}`;
        }
      }
      lastErr = `${model}: geen afbeelding in antwoord`;
    }
  }
  throw new Error(`Gemini image failed: ${lastErr}`);
}

// Backwards-compat alias.
export const generateImageGemini = (prompt: string) => generateImageGeminiNanoBanana2Lite(prompt, []);


// PCM16 mono @ sampleRate to base64 WAV (data URL). Worker-safe.
function pcm16Base64ToWavDataUrl(pcmB64: string, sampleRate = 24000): { dataUrl: string; durationSec: number } {
  // decode base64 -> Uint8Array
  const bin = atob(pcmB64);
  const pcm = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) pcm[i] = bin.charCodeAt(i);
  const dataLen = pcm.length;
  const buf = new ArrayBuffer(44 + dataLen);
  const v = new DataView(buf);
  // RIFF
  v.setUint32(0, 0x52494646, false);
  v.setUint32(4, 36 + dataLen, true);
  v.setUint32(8, 0x57415645, false);
  // fmt
  v.setUint32(12, 0x666d7420, false);
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  // data
  v.setUint32(36, 0x64617461, false);
  v.setUint32(40, dataLen, true);
  new Uint8Array(buf, 44).set(pcm);
  // base64-encode
  const bytes = new Uint8Array(buf);
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
  }
  const b64 = btoa(s);
  return { dataUrl: `data:audio/wav;base64,${b64}`, durationSec: dataLen / 2 / sampleRate };
}

export async function ttsGemini(text: string, voiceName = "Despina"): Promise<{ dataUrl: string; duration: string }> {
  // Try newer TTS models in order.
  const models = ["gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"];
  let lastErr: string | undefined;
  const apiKeys = keys();
  for (const model of models) {
    for (const apiKey of apiKeys) {
      try {
        const url = `${BASE}/models/${model}:generateContent?key=${apiKey}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text }] }],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
            },
          }),
        });
        if (!res.ok) {
          lastErr = `${model} ${res.status}`;
          console.warn(lastErr, await res.text());
          continue;
        }
        const data = (await res.json()) as any;
        const parts = data?.candidates?.[0]?.content?.parts ?? [];
        const inline = parts.find((p: any) => (p.inlineData || p.inline_data)?.data);
        const b64 = (inline?.inlineData || inline?.inline_data)?.data;
        if (!b64) {
          lastErr = `${model}: no audio in response`;
          continue;
        }
        const { dataUrl, durationSec } = pcm16Base64ToWavDataUrl(b64, 24000);
        const m = Math.floor(durationSec / 60);
        const s = Math.floor(durationSec % 60);
        return { dataUrl, duration: `${m}:${s < 10 ? "0" : ""}${s}` };
      } catch (e: any) {
        lastErr = `${model}: ${e?.message || e}`;
      }
    }
  }
  throw new Error(`Gemini TTS failed: ${lastErr}`);
}
