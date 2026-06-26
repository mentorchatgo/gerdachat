// Server-only helper for NVIDIA NIM flux.2-klein-4b image editing with
// two fixed reference images. Uses the NVCF asset-upload flow so that the
// references survive between requests via a tiny in-memory cache.

const NVCF_ASSETS_URL = "https://api.nvcf.nvidia.com/v2/nvcf/assets";
const INFER_URL =
  "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b";

const REFERENCE_IMAGE_URLS = [
  "https://i.imgur.com/eBVTnWn.png",
  "https://i.imgur.com/uBf5Tp6.jpeg",
];

type CachedAsset = { assetId: string; expiresAt: number };
const assetCache: (CachedAsset | null)[] = [null, null];
// NVCF pre-signed URLs typically last 1h; refresh assets every 45min.
const ASSET_TTL_MS = 45 * 60 * 1000;

function getKey(): string {
  const k = process.env.NVIDIA_API_KEY;
  if (!k) throw new Error("Missing NVIDIA_API_KEY");
  return k;
}

async function createAsset(contentType: string): Promise<{
  assetId: string;
  uploadUrl: string;
}> {
  const res = await fetch(NVCF_ASSETS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getKey()}`,
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      contentType,
      description: "gerda-flux-reference",
    }),
  });
  if (!res.ok) {
    throw new Error(`NVCF createAsset ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { assetId: string; uploadUrl: string };
  return data;
}

async function uploadAsset(
  uploadUrl: string,
  bytes: ArrayBuffer,
  contentType: string,
) {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "x-amz-meta-nvcf-asset-description": "gerda-flux-reference",
    },
    body: bytes,
  });
  if (!res.ok && res.status !== 200) {
    throw new Error(`NVCF uploadAsset ${res.status}: ${await res.text()}`);
  }
}

async function ensureReferenceAsset(idx: number): Promise<string> {
  const cached = assetCache[idx];
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.assetId;

  const imgRes = await fetch(REFERENCE_IMAGE_URLS[idx]);
  if (!imgRes.ok) {
    throw new Error(
      `Reference image fetch failed ${imgRes.status} for ${REFERENCE_IMAGE_URLS[idx]}`,
    );
  }
  const contentType = imgRes.headers.get("content-type") || "image/png";
  const bytes = await imgRes.arrayBuffer();
  const { assetId, uploadUrl } = await createAsset(contentType);
  await uploadAsset(uploadUrl, bytes, contentType);
  assetCache[idx] = { assetId, expiresAt: now + ASSET_TTL_MS };
  return assetId;
}

export async function generateWithFlux(prompt: string): Promise<string> {
  const [id1, id2] = await Promise.all([
    ensureReferenceAsset(0),
    ensureReferenceAsset(1),
  ]);

  // Random seed for variety on every call (uint32 range).
  const seed = Math.floor(Math.random() * 4_294_967_295);

  // FLUX.2-klein supports multi-reference editing. NVCF passes the uploaded
  // assets via the header; the inference body references the primary asset.
  const body = {
    prompt: prompt.slice(0, 9500),
    width: 1024,
    height: 1024,
    cfg_scale: 1,
    samples: 1,
    seed,
    steps: 4,
    image: `data:image/png;asset_id,${id1}`,
  };

  const res = await fetch(INFER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getKey()}`,
      "Content-Type": "application/json",
      accept: "application/json",
      "NVCF-INPUT-ASSET-REFERENCES": `${id1},${id2}`,
      "NVCF-FUNCTION-ASSET-IDS": `${id1},${id2}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`NVIDIA flux infer ${res.status}: ${txt}`);
  }
  const data = (await res.json()) as {
    artifacts?: { base64: string }[];
    image?: string;
  };
  const b64 = data.artifacts?.[0]?.base64 || data.image;
  if (!b64) throw new Error("NVIDIA flux returned no image data");
  return `data:image/png;base64,${b64}`;
}
