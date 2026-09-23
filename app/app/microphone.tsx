"use client";
import { useEffect, useRef, useState } from "react";
import { drainOrderedSegments, type TranscriptSegment } from "@/lib/lesson";

type ApiSegment = TranscriptSegment & { error?: string };

// Each 10-second WebM is finalized before upload. The next recorder starts before
// the previous request finishes, so network latency no longer pauses capture.
export function Microphone({ onSegment, disabled }: { onSegment: (segment: TranscriptSegment) => void; disabled: boolean }) {
  const [active, setActive] = useState(false);
  const [notice, setNotice] = useState("");
  const run = useRef(0);
  const running = useRef(false);
  const sequence = useRef(0);
  const nextDelivery = useRef(0);
  const pending = useRef(0);
  const results = useRef(new Map<number, ApiSegment | null>());
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callback = useRef(onSegment);
  useEffect(() => { callback.current = onSegment; }, [onSegment]);

  function flush(id: number) {
    if (id !== run.current) return;
    const drained = drainOrderedSegments(results.current, nextDelivery.current);
    nextDelivery.current = drained.nextSequence;
    drained.values.forEach(result => { if (!result.error) callback.current(result); });
  }

  function stop(message = "收音已停止；仍可使用手動字幕完成展示。") {
    running.current = false;
    run.current++;
    if (timer.current) clearTimeout(timer.current);
    if (recorder.current?.state === "recording") recorder.current.stop();
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    setActive(false);
    setNotice(message);
  }

  useEffect(() => () => {
    running.current = false;
    run.current++;
    if (timer.current) clearTimeout(timer.current);
    if (recorder.current?.state === "recording") recorder.current.stop();
    stream.current?.getTracks().forEach(track => track.stop());
  }, []);

  async function upload(blob: Blob, mimeType: string, itemSequence: number, id: number) {
    if (pending.current >= 2) {
      results.current.set(itemSequence, null); flush(id);
      setNotice("網路辨識較慢，已略過一段音訊；收音仍持續，可用手動字幕補充。");
      return;
    }
    pending.current++;
    const form = new FormData();
    form.set("audio", blob, mimeType.includes("mp4") ? "lesson.mp4" : "lesson.webm");
    form.set("sequence", String(itemSequence));
    try {
      const response = await fetch("/api/transcribe", { method: "POST", body: form, signal: AbortSignal.timeout(30000) });
      const data = await response.json() as ApiSegment;
      if (id !== run.current) return;
      if (!response.ok || typeof data.text !== "string" || !["accepted", "review", "silence"].includes(data.quality)) throw new Error(data.error || "辨識失敗");
      results.current.set(itemSequence, data); flush(id);
      setNotice(data.quality === "accepted" ? "持續收音中；最新片段可參與概念比對。" : data.quality === "review" ? "持續收音中；最新字幕可信度較低，不觸發支援卡。" : "持續收音中；最新片段判定為靜音。");
    } catch (error) {
      if (id === run.current) {
        results.current.set(itemSequence, null); flush(id);
        setNotice(`${error instanceof Error ? error.message : "辨識失敗"}；收音仍持續，可改用手動字幕。`);
      }
    } finally { pending.current = Math.max(0, pending.current - 1); }
  }

  function recordNext(id: number) {
    const mic = stream.current;
    if (!mic || !running.current || id !== run.current) return;
    const currentSequence = sequence.current++;
    const next = new MediaRecorder(mic);
    recorder.current = next;
    const chunks: Blob[] = [];
    next.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    next.onerror = () => stop("錄音失敗；請使用手動字幕完成展示。");
    next.onstop = () => {
      if (!running.current || id !== run.current) return;
      recordNext(id);
      void upload(new Blob(chunks, { type: next.mimeType }), next.mimeType, currentSequence, id);
    };
    next.start();
    setNotice("持續收音中：每段約 10 秒，辨識不會中斷下一段錄音。");
    timer.current = setTimeout(() => { if (next.state === "recording") next.stop(); }, 10000);
  }

  async function start() {
    if (active) return stop();
    const id = ++run.current;
    sequence.current = 0; nextDelivery.current = 0; results.current.clear();
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (id !== run.current) { mic.getTracks().forEach(track => track.stop()); return; }
      stream.current = mic; running.current = true; setActive(true); recordNext(id);
    } catch {
      stream.current?.getTracks().forEach(track => track.stop());
      running.current = false; setActive(false);
      setNotice("無法取得麥克風；請確認瀏覽器權限與 HTTPS／localhost，或改用手動字幕。");
    }
  }

  return <div className="capture"><button disabled={disabled && !active} onClick={() => void start()}>{active ? "停止收音" : "啟動連續收音"}</button><small role="status">{notice}</small></div>;
}
