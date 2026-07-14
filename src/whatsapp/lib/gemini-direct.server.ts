// Direct Google Generative Language REST calls using GEMINI_API_KEY.
// Used for image generation (Gemini 2.5 Flash Image) and TTS (Gemini TTS).

const BASE = "https://generativelanguage.googleapis.com/v1beta";

function key(): string {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error("Missing GEMINI_API_KEY");
  return k;
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

export async function geminiDirectChat(messages: ChatTurn[]): Promise<string> {
  const model = "gemini-3-flash-preview";
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
  const url = `${BASE}/models/${model}:generateContent?key=${key()}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Gemini direct ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as any;
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p: any) => p.text || "").join("");
}

export async function nvidiaDeepseekChat(messages: ChatTurn[]): Promise<string> {
  const k = process.env.NVIDIA_API_KEY;
  if (!k) throw new Error("Missing NVIDIA_API_KEY");
  // NVIDIA NIM accepts only text content; strip non-text parts.
  const flat = messages.map((m) => {
    if (typeof m.content === "string") return { role: m.role, content: m.content };
    const text = m.content
      .map((p) => (p.type === "text" ? p.text : p.type === "image_url" ? "[afbeelding]" : "[audio]"))
      .join(" ");
    return { role: m.role, content: text };
  });
  let lastErr = "";
  let delay = 800;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${k}`,
      },
      body: JSON.stringify({
        model: "deepseek-ai/deepseek-v4-flash",
        messages: flat,
        max_tokens: 2048,
        temperature: 0.7,
      }),
    });
    if (res.ok) {
      const data = (await res.json()) as any;
      return data.choices?.[0]?.message?.content ?? "";
    }
    lastErr = `NVIDIA deepseek ${res.status}: ${await res.text()}`;
    if (res.status !== 503 && res.status !== 429) break;
    await new Promise((r) => setTimeout(r, delay));
    delay *= 2;
  }
  throw new Error(lastErr);

}

// Nano Banana 2 Lite via directe Gemini API (gebruikt GEMINI_API_KEY).
// Ondersteunt optionele referentie-afbeeldingen zodat gezicht/uiterlijk consistent blijft.
export async function generateImageGeminiNanoBanana2Lite(
  prompt: string,
  referenceUrls: string[] = [],
): Promise<string> {
  const models = ["gemini-3.1-flash-image-lite", "gemini-3.1-flash-image", "gemini-2.5-flash-image-preview"];
  const parts: any[] = [];
  for (const url of referenceUrls) {
    try {
      parts.push({ inlineData: await urlToInlineData(url) });
    } catch (e) {
      console.warn("[gemini-image] ref fetch failed:", (e as Error).message);
    }
  }
  parts.push({ text: prompt });

  let lastErr = "";
  for (const model of models) {
    const url = `${BASE}/models/${model}:generateContent?key=${key()}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { responseModalities: ["IMAGE"] },
      }),
    });
    if (!res.ok) {
      lastErr = `${model} ${res.status}: ${await res.text()}`;
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
    lastErr = `${model}: no inlineData in response`;
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
  for (const model of models) {
    try {
      const url = `${BASE}/models/${model}:generateContent?key=${key()}`;
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
        lastErr = `${model} ${res.status}: ${await res.text()}`;
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
  throw new Error(`Gemini TTS failed: ${lastErr}`);
}
