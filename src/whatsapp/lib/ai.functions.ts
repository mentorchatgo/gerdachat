import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { gatewayChat, gatewayImage, type ChatTurn } from "./ai-gateway.server";

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
    const dataUrl = await gatewayImage(data.prompt);
    return { dataUrl };
  });

export const getLiveApiKey = createServerFn({ method: "GET" }).handler(async () => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY ontbreekt");
  return { key };
});
