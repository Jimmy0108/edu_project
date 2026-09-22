import { validateLessonPackage, type LessonPackage, type LiveFrame, type MasteryEvidence, type SupportProfile } from "./lesson";

export const LESSON_KEY = "edubridge-lesson-v2";
export const FRAME_KEY = "edubridge-live-frame-v2";

export function saveLesson(lesson: LessonPackage) {
  const text = JSON.stringify(lesson);
  if (text.length > 1_500_000) throw new Error("課程包過大，請縮小教材範圍後重試。");
  localStorage.setItem(LESSON_KEY, text);
}

export function loadLesson(): LessonPackage | null {
  try { const value = JSON.parse(localStorage.getItem(LESSON_KEY) || "null"); return validateLessonPackage(value) ? value : null; }
  catch { return null; }
}

export function masteryKey(studentId: string) { return `edubridge-mastery-v2-${studentId}`; }
export function preferenceKey(studentId: string) { return `edubridge-support-v2-${studentId}`; }

export function loadMastery(studentId: string): MasteryEvidence[] {
  try { const value = JSON.parse(localStorage.getItem(masteryKey(studentId)) || "[]"); return Array.isArray(value) ? value.filter(item => item && typeof item.conceptId === "string" && ["unknown", "needs-check", "developing", "ready"].includes(item.state)) : []; }
  catch { return []; }
}

export function saveMastery(studentId: string, mastery: MasteryEvidence[]) { localStorage.setItem(masteryKey(studentId), JSON.stringify(mastery)); }
export function loadSupport(studentId: string, fallback: SupportProfile): SupportProfile {
  try { const value = JSON.parse(localStorage.getItem(preferenceKey(studentId)) || "null"); return value && Object.values(value).every(item => typeof item === "boolean") ? value : fallback; }
  catch { return fallback; }
}
export function saveSupport(studentId: string, support: SupportProfile) { localStorage.setItem(preferenceKey(studentId), JSON.stringify(support)); }
export function saveFrame(frame: LiveFrame) { localStorage.setItem(FRAME_KEY, JSON.stringify(frame)); }
export function loadFrame(): LiveFrame | null {
  try { const frame = JSON.parse(localStorage.getItem(FRAME_KEY) || "null"); return frame && typeof frame.lessonId === "string" && typeof frame.transcript === "string" ? frame : null; }
  catch { return null; }
}
