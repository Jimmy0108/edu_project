"use client";
import { useEffect, useRef, useState } from "react";

// Finalize each recording before upload so every WebM has a decodable header.
export function Microphone({ onText, disabled }: { onText: (s: string) => void; disabled: boolean }) {
  const [active, setActive] = useState(false);
  const [notice, setNotice] = useState("");
  const session = useRef(0);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callback = useRef(onText);
  useEffect(() => { callback.current = onText; }, [onText]);
  function stop() {
    session.current++; if (timer.current) clearTimeout(timer.current);
    if (recorder.current?.state === "recording") recorder.current.stop();
    stream.current?.getTracks().forEach(t => t.stop()); stream.current = null;
    setActive(false); setNotice("收音已停止，未送出的片段已捨棄。");
  }
  useEffect(() => () => { session.current++; if (timer.current) clearTimeout(timer.current); if (recorder.current?.state === "recording") recorder.current.stop(); stream.current?.getTracks().forEach(t => t.stop()); }, []);
  async function start() {
    if (active) return stop(); const id = ++session.current;
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (id !== session.current) { mic.getTracks().forEach(t => t.stop()); return; }
      stream.current = mic; setActive(true);
      const cycle = () => {
        if (id !== session.current) return;
        const r = new MediaRecorder(mic); recorder.current = r; const chunks: Blob[] = [];
        r.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
        r.onerror = () => { stop(); setNotice("錄音失敗，請重新啟動麥克風。"); };
        r.onstop = async () => {
          if (id !== session.current) return;
          setNotice("辨識本段中（此時暫停收音）…");
          const form = new FormData(); form.set("audio", new Blob(chunks, { type: r.mimeType }), r.mimeType.includes("mp4") ? "lesson.mp4" : "lesson.webm");
          try {
            const response = await fetch("/api/transcribe", { method: "POST", body: form, signal: AbortSignal.timeout(30000) }); const data = await response.json();
            if (id !== session.current) return;
            if (!response.ok || typeof data.text !== "string") throw new Error(data.error || "辨識失敗");
            callback.current(data.text); cycle();
          } catch (error) { if (id === session.current) { stop(); setNotice(error instanceof Error ? error.message : "辨識失敗"); } }
        };
        r.start(); setNotice("收音中：每段約 10 秒，辨識時請稍停");
        timer.current = setTimeout(() => { if (r.state === "recording") r.stop(); }, 10000);
      }; cycle();
    } catch { stream.current?.getTracks().forEach(t => t.stop()); setActive(false); setNotice("無法取得麥克風，請確認瀏覽器權限與 HTTPS／localhost。"); }
  }
  return <div className="capture"><button disabled={disabled && !active} onClick={() => void start()}>{active ? "停止收音" : "啟動麥克風"}</button><small role="status">{notice}</small></div>;
}
