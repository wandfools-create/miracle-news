import "server-only";

import { buildThumbnailImagePrompt } from "./buildThumbnailPrompt";

export type GenerateAiThumbnailInput = {
  category: string | null | undefined;
  titleKo: string;
  summaryKo?: string | null;
};

export type GenerateAiThumbnailResult =
  | { ok: true; buffer: Buffer; mimeType: "image/png" }
  | { ok: false; error: string };

/**
 * Generate a news-style editorial illustration via OpenAI Images API.
 */
export async function generateAiThumbnailImage(
  input: GenerateAiThumbnailInput
): Promise<GenerateAiThumbnailResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "OPENAI_API_KEY is not set" };
  }

  const titleKo = input.titleKo.trim();
  if (!titleKo) {
    return { ok: false, error: "titleKo is required for thumbnail generation" };
  }

  const model = process.env.OPENAI_IMAGE_MODEL?.trim() || "dall-e-2";
  const prompt = buildThumbnailImagePrompt(input);

  const payload = {
    model,
    prompt,
    n: 1,
    size: "1024x1024",
    response_format: "b64_json",
  };

  try {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return {
        ok: false,
        error: `OpenAI image API ${res.status}: ${errText.slice(0, 400)}`,
      };
    }

    const data = (await res.json()) as {
      data?: Array<{ b64_json?: string }>;
    };
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) {
      return { ok: false, error: "OpenAI image API returned no image data" };
    }

    const buffer = Buffer.from(b64, "base64");
    if (buffer.length < 500) {
      return { ok: false, error: "Generated image data is too small" };
    }

    return { ok: true, buffer, mimeType: "image/png" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
