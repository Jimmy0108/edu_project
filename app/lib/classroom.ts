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
  const keywords = Array.from(new Set(Array.from(new Intl.Segmenter("zh-TW", { granularity: "word" }).segment(text))
    .filter(s => s.isWordLike && s.segment.length >= 2).map(s => s.segment))).slice(0, 6);

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
    sourceNotice: "本地備援：僅分句與擷取原文，未使用生成式 AI。",
  };
}

export function validScaffold(value: unknown): value is ScaffoldResponse {
  if (!value || typeof value !== "object") return false;
  const v = value as ScaffoldResponse;
  const str = (x: unknown) => typeof x === "string" && x.length <= 2000;
  const strings = (x: unknown, max: number) => Array.isArray(x) && x.length <= max && x.every(str);
  return str(v.summary) && str(v.sourceTranscript) && str(v.sourceNotice) && strings(v.keywords, 6) &&
    !!v.visual && str(v.visual.title) && Array.isArray(v.visual.cards) && v.visual.cards.length <= 4 && v.visual.cards.every(c => c && str(c.label) && str(c.text)) &&
    !!v.reading && str(v.reading.title) && Array.isArray(v.reading.steps) && v.reading.steps.length <= 4 && v.reading.steps.every(s => s && str(s.title) && str(s.text)) &&
    !!v.focus && str(v.focus.goal) && strings(v.focus.steps, 4);
}

export function isSupportMode(value: unknown): value is SupportMode {
  return typeof value === "string" && SUPPORT_MODES.includes(value as SupportMode);
}
