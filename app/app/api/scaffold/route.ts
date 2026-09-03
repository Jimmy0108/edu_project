import { demoScaffold, normalizeTranscript, type ScaffoldResponse } from "@/lib/classroom";

type GroqChoice = {
  message?: {
    content?: string;
  };
};

const responseSchema = {
  name: "edu_bridge_scaffold",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["summary", "keywords", "visual", "reading", "focus", "sourceNotice"],
    properties: {
      summary: { type: "string" },
      keywords: { type: "array", items: { type: "string" }, maxItems: 6 },
      visual: {
        type: "object",
        additionalProperties: false,
        required: ["title", "cards"],
        properties: {
          title: { type: "string" },
          cards: {
            type: "array",
            maxItems: 4,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "text"],
              properties: {
                label: { type: "string" },
                text: { type: "string" },
              },
            },
          },
        },
      },
      reading: {
        type: "object",
        additionalProperties: false,
        required: ["title", "steps"],
        properties: {
          title: { type: "string" },
          steps: {
            type: "array",
            maxItems: 4,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["title", "text"],
              properties: {
                title: { type: "string" },
                text: { type: "string" },
              },
            },
          },
        },
      },
      focus: {
        type: "object",
        additionalProperties: false,
        required: ["goal", "steps"],
        properties: {
          goal: { type: "string" },
          steps: { type: "array", maxItems: 4, items: { type: "string" } },
        },
      },
      sourceNotice: { type: "string" },
    },
  },
} as const;

export async function POST(request: Request) {
  let payload: { transcript?: unknown };
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "請以 JSON 傳送 transcript。" }, { status: 400 });
  }

  const transcript = normalizeTranscript(payload.transcript);
  if (!transcript) {
    return Response.json({ error: "transcript 不可為空白。" }, { status: 400 });
  }

  const fallback = demoScaffold(transcript);
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return Response.json({ ...fallback, provider: "demo" });
  }

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.GROQ_LLM_MODEL || "openai/gpt-oss-20b",
        temperature: 0.2,
        response_format: { type: "json_schema", json_schema: responseSchema },
        messages: [
          {
            role: "system",
            content:
              "你是融合教育課堂的資訊整理助手。只能根據教師逐字稿輸出繁體中文，不可補充未出現的事實，不可推斷學生診斷或能力。資訊不足時明確寫「教師尚未在本段說明」。一次同時輸出視覺、閱讀與專注三種呈現，不可產生醫療建議或安全攻擊步驟。",
          },
          {
            role: "user",
            content: "教師逐字稿：" + transcript,
          },
        ],
      }),
    });

    if (!response.ok) {
      return Response.json({ ...fallback, provider: "demo", aiError: "AI 暫時不可用，已切換為本地整理。" });
    }

    const body = (await response.json()) as { choices?: GroqChoice[] };
    const content = body.choices?.[0]?.message?.content;
    if (!content) {
      return Response.json({ ...fallback, provider: "demo", aiError: "AI 未回傳可用內容，已切換為本地整理。" });
    }

    const generated = JSON.parse(content) as Omit<ScaffoldResponse, "sourceTranscript">;
    return Response.json({ ...generated, sourceTranscript: transcript, provider: "groq" });
  } catch {
    return Response.json({ ...fallback, provider: "demo", aiError: "AI 回應格式異常，已切換為本地整理。" });
  }
}
