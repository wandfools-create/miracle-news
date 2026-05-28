import type { DraftCandidate } from "./types";
import type { ExtractedPreview } from "./types";

function stableId(prefix: string, index: number): string {
  return `${prefix}-${index}`;
}

function mockCandidates(extracted: ExtractedPreview): DraftCandidate[] {
  const base =
    extracted.title?.trim() ||
    extracted.siteName?.trim() ||
    extracted.rawUrl ||
    "링크 기사";

  const snippets: Array<{ title: string; summary_one_line: string; angle: string }> = [
    {
      title: `${base} — 핵심만 정리`,
      summary_one_line:
        "3단계에서 만든 요약 본문과 같은 사실 범위에서 핵심만 압축하는 헤드라인 각도입니다.",
      angle: "핵심 요약·맥락 정리",
    },
    {
      title: `${base} — 왜 중요한가`,
      summary_one_line:
        "요약 본문에 담긴 내용만으로 독자에게 주는 의미·영향을 부각하는 각도입니다.",
      angle: "영향·쟁점 중심",
    },
    {
      title: `${base} — 숫자와 근거`,
      summary_one_line:
        "요약에 근거가 되는 수치·인용 가능한 문장을 앞세우는 각도입니다.",
      angle: "팩트·근거 강화",
    },
    {
      title: `${base} — 한국 독자 관점`,
      summary_one_line:
        "동일 요약을 국내 독자 맥락에 맞게 풀어 쓰는 각도입니다.",
      angle: "로컬 맥락 연결",
    },
    {
      title: `${base} — 타임라인`,
      summary_one_line:
        "요약 속 사건·순서를 시간축으로 정리하는 각도입니다.",
      angle: "시간순 정리",
    },
  ];

  return snippets.map((row, i) => ({
    id: stableId("cand", i),
    title: row.title,
    summary_one_line: row.summary_one_line,
    angle: row.angle,
  }));
}

type OpenAiMessage = { role: string; content: string };

async function proposeWithOpenAi(
  extracted: ExtractedPreview,
  linkTypeLabel: string,
  synthesizedBodyKo: string,
  youtubeTranscript: string | null,
  supplementalText: string | null
): Promise<DraftCandidate[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const payload = {
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: 0.6,
    response_format: { type: "json_object" as const },
    messages: [
      {
        role: "system",
        content:
          'You are a Korean news desk assistant. You are given an already-drafted Korean article BODY (not the dek). Return JSON: {"candidates":[...]} with 4 to 6 items. Each item: title (Korean headline), summary_one_line (one Korean sentence describing the angle), angle (short Korean label). Headlines must reflect distinct editorial angles consistent with the body—do not invent new facts. Never include URLs. No markdown.',
      },
      {
        role: "user",
        content: JSON.stringify({
          linkType: linkTypeLabel,
          url: extracted.submittedOriginalUrl,
          extractedTitle: extracted.title,
          extractedDescription: extracted.description,
          bodySnippet: extracted.bodySnippet?.slice(0, 2000) ?? null,
          youtube_transcript_excerpt:
            youtubeTranscript?.slice(0, 8000) ?? null,
          supplemental_text_excerpt: supplementalText?.slice(0, 8000) ?? null,
          article_body_ko: synthesizedBodyKo.slice(0, 6000),
        }),
      },
    ] satisfies OpenAiMessage[],
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) return null;

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content;
  if (!text) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;
  const candidatesRaw = (parsed as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidatesRaw)) return null;

  const out: DraftCandidate[] = [];
  for (let i = 0; i < candidatesRaw.length; i += 1) {
    const row = candidatesRaw[i];
    if (!row || typeof row !== "object") continue;
    const title = String((row as { title?: unknown }).title || "").trim();
    const summary_one_line = String(
      (row as { summary_one_line?: unknown }).summary_one_line || ""
    ).trim();
    const angle = String((row as { angle?: unknown }).angle || "").trim();
    if (!title || !summary_one_line) continue;
    out.push({
      id: stableId("ai", i),
      title,
      summary_one_line,
      angle: angle || "각도 미정",
    });
  }

  if (out.length < 3) return null;
  if (out.length > 7) return out.slice(0, 7);
  return out;
}

export async function proposeCandidates(
  extracted: ExtractedPreview,
  linkTypeLabel: string,
  synthesizedBodyKo: string,
  supplementalText: string | null = null
): Promise<DraftCandidate[]> {
  const ai = await proposeWithOpenAi(
    extracted,
    linkTypeLabel,
    synthesizedBodyKo,
    extracted.youtubeTranscript?.trim() || null,
    supplementalText
  );
  if (ai && ai.length >= 3) return ai;
  return mockCandidates(extracted);
}
