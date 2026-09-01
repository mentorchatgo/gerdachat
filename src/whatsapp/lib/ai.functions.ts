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
      // Alles faalde (Gemini 3.5 lite, 3.1 lite, NVIDIA): left on seen, geen antwoord.
      console.error("[chat] all providers failed:", (error as Error)?.message);
      return { text: "" };
    }
  });

const ImageInput = z.object({
  prompt: z.string().min(1),
  useReference: z.boolean().optional(),
});

// Vaste look-instructies: exact hetzelfde lichaam en dezelfde kleding in ELKE afbeelding.
const GERDA_LOOK_LOCK = `
IDENTITY LOCK (must be followed exactly, every single time):
- The two attached reference photos ARE the character. Generate the SAME woman: same face, same double chin, same skin tone, same age.
- She is COMPLETELY BALD: no hair, no wig, no hat, no eyebrows changes. Never add hair.
- BODY LOCK: always the exact same body — extremely large, plus-size, very wide torso, thick arms and legs, same proportions as the reference photos. Never slimmer, never a different build.
- CLOTHING LOCK: she ALWAYS wears the exact same outfit — a dark grey/green camouflage-print t-shirt that is too small and rides up over her belly, and blue denim jeans, with black ankle socks. Same clothes in every image, no other outfits.
- Vertical 9:16 amateur smartphone photo, authentic candid snapshot, natural lighting, no text overlays, no watermarks.`;

export const generateContactImage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ImageInput.parse(d))
  .handler(async ({ data }) => {
    const imagePrompt = sanitizeImagePrompt(data.prompt);
    const ref = data.useReference ? GERDA_REFERENCE_IMAGE : undefined;
    const scenePrompt = `${GERDA_LOOK_LOCK}\n\nScene: ${imagePrompt}`;

    // 1) Primair: Nano Banana 2 Lite (gemini-3.1-flash-image-lite) via directe Gemini API.
    if (process.env.GEMINI_API_KEY) {
      const { generateImageGeminiNanoBanana2Lite } = await import("./gemini-direct.server");
      let delay = 800;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const dataUrl = await generateImageGeminiNanoBanana2Lite(scenePrompt);
          return { dataUrl };
        } catch (e) {
          console.warn(`[image] nano banana 2 lite attempt ${attempt + 1} failed:`, (e as Error).message);
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, delay));
            delay *= 2;
          }
        }
      }
    }

    // 2) Fallback: Lovable AI Gateway.
    try {
      const dataUrl = await gatewayNanoBananaImage(scenePrompt, ref);
      return { dataUrl };
    } catch (e1) {
      console.error("[image] gateway nano banana failed:", e1);
      try {
        const dataUrl = await gatewayImage(scenePrompt, ref);
        return { dataUrl };
      } catch (e2) {
        console.error("[image] gateway gpt-image-2 failed too:", e2);
        // 3) Allerlaatste redmiddel: NVIDIA flux (alleen als niets anders meer werkt).
        if (process.env.NVIDIA_API_KEY) {
          try {
            const { generateWithFlux } = await import("./nvidia-flux.server");
            const dataUrl = await generateWithFlux(imagePrompt);
            return { dataUrl };
          } catch (e3) {
            console.error("[image] NVIDIA flux fallback failed:", e3);
            return {
              dataUrl: "",
              error: "ik kan nu effe geen foto maken, me foto-ding is op of stuk",
            };
          }
        }
        return {
          dataUrl: "",
          error: "ik kan nu effe geen foto maken, me foto-ding is op",
        };
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
