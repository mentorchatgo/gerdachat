import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  gatewayChat,
  gatewayImage,
  gatewayNanoBananaImage,
  sanitizeImagePrompt,
  GERDA_REFERENCE_IMAGE,
  GatewayPaymentRequiredError,
  GatewayRateLimitError,
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
      data: z.string(),
      format: z.string(),
    })
    .optional(),
  imageDataUrl: z.string().optional(),
  videoFrames: z.array(z.string()).optional(),
});

export const chatTurn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ChatInput.parse(d))
  .handler(async ({ data }) => {
    let latest: ChatTurn;
    const hasMedia =
      data.audio ||
      data.imageDataUrl ||
      (data.videoFrames && data.videoFrames.length > 0);
    if (hasMedia) {
      const parts: any[] = [];
      if (data.message && data.message.trim()) {
        parts.push({ type: "text", text: data.message });
      } else if (data.audio) {
        parts.push({
          type: "text",
          text: "(Spraakbericht van de gebruiker — luister naar de audio hieronder en reageer kort en natuurlijk in spreektaal alsof je het gewoon hebt gehoord.)",
        });
      } else if (data.videoFrames && data.videoFrames.length) {
        parts.push({
          type: "text",
          text: `(De gebruiker heeft een video gestuurd. Hieronder zie je ${data.videoFrames.length} losse frames uit die video, op volgorde. Bekijk ze, snap wat er gebeurt, en reageer er kort en speels op alsof je het filmpje hebt gezien.)`,
        });
      } else {
        parts.push({ type: "text", text: "(Bekijk de meegestuurde afbeelding en reageer.)" });
      }
      if (data.imageDataUrl) {
        parts.push({ type: "image_url", image_url: { url: data.imageDataUrl } });
      }
      if (data.videoFrames) {
        for (const frame of data.videoFrames) {
          parts.push({ type: "image_url", image_url: { url: frame } });
        }
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
    try {
      const text = await gatewayChat(turns);
      return { text };
    } catch (error) {
      if (error instanceof GatewayPaymentRequiredError) {
        return {
          text: "[SYSTEM_ERROR: Lovable AI credits zijn op. Voeg credits toe via Settings → Plans & credits om Gerda weer te laten antwoorden.]",
        };
      }
      if (error instanceof GatewayRateLimitError) {
        return {
          text: "[SYSTEM_ERROR: Lovable AI is tijdelijk te druk. Probeer het zo nog eens.]",
        };
      }
      throw error;
    }
  });

const ImageInput = z.object({
  prompt: z.string().min(1),
  useReference: z.boolean().optional(),
});

export const generateContactImage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ImageInput.parse(d))
  .handler(async ({ data }) => {
    const imagePrompt = sanitizeImagePrompt(data.prompt);
    // When a reference photo is provided, Nano Banana 2 (gemini-3.1-flash-image) is the
    // primary because it can ACTUALLY see the reference image (gpt-image-2 only gets text).
    // Zonder referentie: gpt-image-2 eerst.
    const ref = data.useReference ? GERDA_REFERENCE_IMAGE : undefined;
    const primary = ref
      ? () => gatewayNanoBananaImage(imagePrompt, ref)
      : () => gatewayImage(imagePrompt, ref);
    const fallback = ref
      ? () => gatewayNanoBananaImage(imagePrompt, ref) // retry nano banana — gpt-image-2 negeert de referentie toch
      : () => gatewayNanoBananaImage(imagePrompt, ref);
    try {
      const dataUrl = await primary();
      return { dataUrl };
    } catch (e1) {
      console.error("[image] primary image gen failed, retrying:", e1);
      try {
        const dataUrl = await fallback();
        return { dataUrl };
      } catch (e2) {
        console.error("[image] fallback failed too:", e2);
        throw new Error(
          `Image generation failed: ${(e1 as Error).message} | fallback: ${(e2 as Error).message}`,
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
