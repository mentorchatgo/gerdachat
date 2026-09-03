// Server-only fallback: FireRed-Image-Edit-1.0-Fast via Hugging Face Inference API.
// Used only when Gemini image models, NVIDIA flux and the Lovable Gateway all fail.

import { GERDA_REF_1_B64, GERDA_REF_2_B64 } from "./gerda-refs.server";

const MODEL_URL =
  "https://router.huggingface.co/hf-inference/models/FireRedTeam/FireRed-Image-Edit-1.0-Fast";

function getKey(): string {
  const k = process.env.HF_API_KEY;
  if (!k) throw new Error("Missing HF_API_KEY");
  return k;
}

export async function generateWithFireRed(prompt: string): Promise<string> {
  // FireRed image edit: prompt + reference image (primary), second reference
  // attached as extra context when supported.
  const body = {
    inputs: {
      prompt: prompt.slice(0, 9500),
      image: GERDA_REF_1_B64,
      images: [GERDA_REF_1_B64, GERDA_REF_2_B64],
    },
    parameters: {
      num_inference_steps: 8,
      guidance_scale: 3.5,
    },
  };

  const res = await fetch(MODEL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getKey()}`,
      "Content-Type": "application/json",
      Accept: "image/png",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`HuggingFace FireRed ${res.status}: ${txt}`);
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("image")) {
    const bytes = await res.arrayBuffer();
    const b64 = Buffer.from(bytes).toString("base64");
    const mime = contentType.split(";")[0] || "image/png";
    return `data:${mime};base64,${b64}`;
  }

  // Some deployments return JSON with base64 inside.
  const data = (await res.json().catch(() => null)) as
    | { image?: string; images?: string[]; b64_json?: string }
    | null;
  const b64 = data?.image || data?.images?.[0] || data?.b64_json;
  if (!b64) throw new Error("HuggingFace FireRed returned no image data");
  return `data:image/png;base64,${b64}`;
}
