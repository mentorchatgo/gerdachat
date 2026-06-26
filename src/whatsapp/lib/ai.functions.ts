import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  gatewayChat,
  gatewayImage,
  gatewayNanoBananaImage,
  sanitizeImagePrompt,
  type ChatTurn,
} from "./ai-gateway.server";

const ChatInput = z.object({
  systemPrompt: z.string(),
  history: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    }),
  ),
  message: z.string(),
  audio: z
    .object({
      data: z.string(), // base64 (no data URL prefix)
      format: z.string(), // "webm" | "mp4" | "wav" | "mp3" | ...
    })
    .optional(),
  imageDataUrl: z.string().optional(),
});

export const chatTurn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ChatInput.parse(d))
  .handler(async ({ data }) => {
    // Build the latest user turn. If we have audio or an image, send a
    // multimodal content array so Gemini actually understands the input.
    let latest: ChatTurn;
    if (data.audio || data.imageDataUrl) {
      const parts: any[] = [];
      if (data.message && data.message.trim()) {
        parts.push({ type: "text", text: data.message });
      } else if (data.audio) {
        parts.push({
          type: "text",
          text: "(Spraakbericht van de gebruiker — luister naar de audio hieronder en reageer kort en natuurlijk in spreektaal alsof je het gewoon hebt gehoord.)",
        });
      } else {
        parts.push({ type: "text", text: "(Bekijk de meegestuurde afbeelding en reageer.)" });
      }
      if (data.imageDataUrl) {
        parts.push({ type: "image_url", image_url: { url: data.imageDataUrl } });
      }
      if (data.audio) {
        parts.push({
          type: "input_audio",
          input_audio: { data: data.audio.data, format: data.audio.format },
        });
      }
      latest = { role: "user", content: parts };
    } else {
      latest = { role: "user", content: data.message };
    }

    const turns: ChatTurn[] = [
      { role: "system", content: data.systemPrompt },
      ...data.history,
      latest,
    ];
    const text = await gatewayChat(turns);
    return { text };
  });

const ImageInput = z.object({ prompt: z.string().min(1) });

export const generateContactImage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ImageInput.parse(d))
  .handler(async ({ data }) => {
    const imagePrompt = sanitizeImagePrompt(data.prompt);
    // Primary: Lovable AI Gateway (openai/gpt-image-2). Fallback: Nano Banana 2.
    // Flux is intentionally not used.
    try {
      const dataUrl = await gatewayImage(imagePrompt);
      return { dataUrl };
    } catch (e1) {
      console.error("[image] gateway gpt-image-2 failed, trying nano banana 2:", e1);
      try {
        const dataUrl = await gatewayNanoBananaImage(imagePrompt);
        return { dataUrl };
      } catch (e2) {
        console.error("[image] nano banana 2 failed too:", e2);
        throw new Error(
          `Image generation failed: ${(e1 as Error).message} | nano banana 2: ${(e2 as Error).message}`,
        );
      }
    }
  });

const TtsInput = z.object({ text: z.string().min(1), voiceName: z.string().optional() });

export const ttsForText = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => TtsInput.parse(d))
  .handler(async ({ data }) => {
    const { ttsGemini } = await import("./gemini-direct.server");
    return await ttsGemini(data.text, data.voiceName || "Despina");
  });

export const getLiveApiKey = createServerFn({ method: "GET" }).handler(async () => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY ontbreekt");
  return { key };
});
