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
});

export const chatTurn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ChatInput.parse(d))
  .handler(async ({ data }) => {
    const turns: ChatTurn[] = [
      { role: "system", content: data.systemPrompt },
      ...data.history,
      { role: "user", content: data.message },
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
