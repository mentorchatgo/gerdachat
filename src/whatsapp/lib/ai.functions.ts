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
          text: `(De gebruiker heeft een filmpje gestuurd — hieronder krijg je het filmpje mee${data.videoFrames.length > 1 ? ` (of ${data.videoFrames.length} frames eruit)` : ""}. Bekijk het echt, snap wat er gebeurt, en reageer er kort en speels op alsof je het net hebt gezien.)`,
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
    const ref = data.useReference ? GERDA_REFERENCE_IMAGE : undefined;

    // 1) Primair: Nano Banana 2 Lite via directe Gemini API (GEMINI_API_KEY, geen Lovable credits).
    if (process.env.GEMINI_API_KEY) {
      try {
        const { generateImageGeminiNanoBanana2Lite } = await import("./gemini-direct.server");
        const { GERDA_REFERENCE_IMAGE_2 } = await import("./ai-gateway.server");
        const refs = ref ? [ref, GERDA_REFERENCE_IMAGE_2] : [];
        const scenePrompt = ref
          ? `CRITICAL: Reference photos show the EXACT character. Generate a new image of the SAME person — same face, COMPLETELY BALD (no hair), same skin tone, same body, same age. Keep identity 100% intact.\n\nScene: ${imagePrompt}\n\nVertical 9:16 amateur smartphone photo, authentic candid, no text.`
          : imagePrompt;
        const dataUrl = await generateImageGeminiNanoBanana2Lite(scenePrompt, refs);
        return { dataUrl };
      } catch (e) {
        console.warn("[image] Nano Banana 2 Lite via Gemini API failed, falling back to gateway:", (e as Error).message);
      }
    }

    // 2) Fallback: Lovable AI Gateway (gpt-image-2 / nano-banana-2).
    const primary = ref
      ? () => gatewayNanoBananaImage(imagePrompt, ref)
      : () => gatewayImage(imagePrompt, ref);
    try {
      const dataUrl = await primary();
      return { dataUrl };
    } catch (e1) {
      console.error("[image] gateway failed, retrying nano banana:", e1);
      try {
        const dataUrl = await gatewayNanoBananaImage(imagePrompt, ref);
        return { dataUrl };
      } catch (e2) {
        console.error("[image] gateway fallback failed too:", e2);
        // 3) Final fallback: NVIDIA flux.
        if (process.env.NVIDIA_API_KEY) {
          try {
            const { generateWithFlux } = await import("./nvidia-flux.server");
            const dataUrl = await generateWithFlux(imagePrompt);
            return { dataUrl };
          } catch (e3) {
            console.error("[image] NVIDIA flux fallback failed:", e3);
            throw new Error(
              `Image gen failed: gateway=${(e1 as Error).message} | retry=${(e2 as Error).message} | nvidia=${(e3 as Error).message}`,
            );
          }
        }
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
