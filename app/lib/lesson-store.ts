import { migrateLessonPackage, type LessonPackage, type LiveFrame, type MasteryEvidence, type SupportProfile } from "./lesson";

export const LESSON_KEY = "edubridge-lesson-v3";
export const FRAME_KEY = "edubridge-live-frame-v3";

export function saveLesson(lesson: LessonPackage) {
  const text = JSON.stringify(lesson);
  if (text.length > 1_500_000) throw new Error("課程包過大，請縮小教材範圍後重試。");
  localStorage.setItem(LESSON_KEY, text);
}

export function loadLesson(): LessonPackage | null {
  try {
    const current = migrateLessonPackage(JSON.parse(localStorage.getItem(LESSON_KEY) || "null"));
    if (current) return current;
    const migrated = migrateLessonPackage(JSON.parse(localStorage.getItem("edubridge-lesson-v2") || "null"));
    if (migrated) { saveLesson(migrated); return migrated; }
    return null;
  }
  catch { return null; }
}

export function masteryKey(studentId: string) { return `edubridge-mastery-v3-${studentId}`; }
export function preferenceKey(studentId: string) { return `edubridge-support-v3-${studentId}`; }

export function loadMastery(studentId: string): MasteryEvidence[] {
  try { const value = JSON.parse(localStorage.getItem(masteryKey(studentId)) || "[]"); return Array.isArray(value) ? value.filter(item => item && typeof item.conceptId === "string" && ["unknown", "needs-check", "developing", "ready"].includes(item.state) && Array.isArray(item.events)) : []; }
  catch { return []; }
}

export function saveMastery(studentId: string, mastery: MasteryEvidence[]) { localStorage.setItem(masteryKey(studentId), JSON.stringify(mastery)); }
export function loadSupport(studentId: string, fallback: SupportProfile): SupportProfile {
  try {
    const value = JSON.parse(localStorage.getItem(preferenceKey(studentId)) || "null");
    const booleanKeys = ["captions", "simplifiedText", "focusSteps", "colorSafe", "textToSpeech", "reducedMotion", "advancedChallenge"];
    return value && booleanKeys.every(key => typeof value[key] === "boolean") && value.reading ? value : fallback;
  }
  catch { return fallback; }
}
export function saveSupport(studentId: string, support: SupportProfile) { localStorage.setItem(preferenceKey(studentId), JSON.stringify(support)); }
export function saveFrame(frame: LiveFrame) { localStorage.setItem(FRAME_KEY, JSON.stringify(frame)); }
export function loadFrame(): LiveFrame | null {
  try { const frame = JSON.parse(localStorage.getItem(FRAME_KEY) || "null"); return frame && typeof frame.lessonId === "string" && Array.isArray(frame.transcriptSegments) ? frame : null; }
  catch { return null; }
}
