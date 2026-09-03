export const SUPPORT_MODES = ["visual", "reading", "focus"] as const;

export type SupportMode = (typeof SUPPORT_MODES)[number];

export type ScaffoldResponse = {
  sourceTranscript: string;
  summary: string;
  keywords: string[];
  visual: {
    title: string;
    cards: Array<{ label: string; text: string }>;
  };
  reading: {
    title: string;
    steps: Array<{ title: string; text: string }>;
  };
  focus: {
    goal: string;
    steps: string[];
  };
  sourceNotice: string;
};

const MAX_TRANSCRIPT_LENGTH = 2_000;

export function normalizeTranscript(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_TRANSCRIPT_LENGTH);
}

export function demoScaffold(transcript: string): ScaffoldResponse {
  const text = normalizeTranscript(transcript);
  const sentences = text
    .split(/[。！？!?]/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const firstSentence = sentences[0] ?? "等待教師說明後再整理重點。";
  const keyCandidates = ["連結", "附件", "寄件者網域", "網址", "帳號", "密碼"];
  const keywords = keyCandidates.filter((keyword) => text.includes(keyword)).slice(0, 5);

  return {
    sourceTranscript: text,
    summary: firstSentence,
    keywords,
    visual: {
      title: "課堂關鍵概念",
      cards: keywords.slice(0, 4).map((keyword) => ({
        label: "教師本段提及",
        text: keyword,
      })),
    },
    reading: {
      title: "白話短句整理",
      steps: sentences.slice(0, 4).map((sentence, index) => ({
        title: "重點 " + (index + 1),
        text: sentence,
      })),
    },
    focus: {
      goal: firstSentence,
      steps: sentences.slice(0, 4),
    },
    sourceNotice: "示範模式僅依本段文字整理；正式模式會由伺服器端 AI 產生相同欄位。",
  };
}

export function isSupportMode(value: unknown): value is SupportMode {
  return typeof value === "string" && SUPPORT_MODES.includes(value as SupportMode);
}
