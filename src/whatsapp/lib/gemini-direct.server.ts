// Direct Google Generative Language REST calls using GEMINI_API_KEY.
// Used for image generation (Gemini 2.5 Flash Image) and TTS (Gemini TTS).

const BASE = "https://generativelanguage.googleapis.com/v1beta";

function key(): string {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error("Missing GEMINI_API_KEY");
  return k;
}

export async function generateImageGemini(prompt: string): Promise<string> {
  const model = "gemini-2.5-flash-image-preview";
  const url = `${BASE}/models/${model}:generateContent?key=${key()}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE"] },
    }),
  });
  if (!res.ok) {
    throw new Error(`Gemini image ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as any;
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  for (const p of parts) {
    const inline = p.inlineData || p.inline_data;
    if (inline?.data) {
      const mime = inline.mimeType || inline.mime_type || "image/png";
      return `data:${mime};base64,${inline.data}`;
    }
  }
  throw new Error("Gemini image: no inlineData in response");
}

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
  const models = ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"];
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
