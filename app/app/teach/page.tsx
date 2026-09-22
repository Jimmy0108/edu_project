"use client";

import { useEffect, useRef, useState } from "react";
import { Microphone } from "../microphone";
import { BrandHeader, PageFooter, StatusPill } from "../ui";
import { decideLiveSupport, type LessonPackage, type LiveFrame, type LiveSupportDecision } from "@/lib/lesson";
import { loadLesson, loadMastery, saveFrame } from "@/lib/lesson-store";

const DEMO_SCRIPT = "收到陌生郵件時，先不要點連結或下載附件。判斷寄件者是否可信時，不要只看顯示名稱，要仔細檢查 @ 後方的完整寄件者網域。";

export default function TeachPage() {
  const [lesson, setLesson] = useState<LessonPackage | null>(null);
  const [draft, setDraft] = useState(DEMO_SCRIPT);
  const [transcript, setTranscript] = useState("");
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const [activeConceptId, setActiveConceptId] = useState<string | null>(null);
  const [decision, setDecision] = useState<LiveSupportDecision | null>(null);
  const [paused, setPaused] = useState(false);
  const [notice, setNotice] = useState("等待授課。概念需連續出現兩次，或由教師手動指定後才會推送。");
  const [help, setHelp] = useState<string[]>([]);
  const [revision, setRevision] = useState(0);
  const channel = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    const stored = loadLesson();
    // Browser storage is unavailable during server rendering.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLesson(stored);
    if (typeof BroadcastChannel === "undefined") return;
    const bus = new BroadcastChannel("edubridge-classroom-v2"); channel.current = bus;
    bus.onmessage = event => { if (event.data?.type === "help" && typeof event.data.studentId === "string") setHelp(current => [...new Set([...current, event.data.studentId])]); if (event.data?.type === "mastery") setRevision(value => value + 1); };
    return () => bus.close();
  }, []);

  const activeNode = lesson?.nodes.find(node => node.id === activeConceptId) || null;
  const activeCard = lesson?.cards.find(card => card.id === decision?.supportCardId) || null;
  const sourceMaterials = lesson?.materials.filter(item => decision?.sourceIds.includes(item.id)) || [];
  const supportCount = (() => {
    void revision;
    if (!lesson || !activeConceptId) return 0;
    return lesson.profiles.filter(profile => {
      const evidence = loadMastery(profile.id).find(item => item.conceptId === activeConceptId);
      return !evidence || evidence.state === "unknown" || evidence.state === "needs-check";
    }).length;
  })();

  function broadcast(nextTranscript: string, nextConcept: string | null, nextDecision: LiveSupportDecision | null, nextPaused = paused) {
    if (!lesson) return;
    const frame: LiveFrame = { lessonId: lesson.id, transcript: nextTranscript, activeConceptId: nextConcept, decision: nextDecision, paused: nextPaused, updatedAt: new Date().toISOString() };
    saveFrame(frame); channel.current?.postMessage({ type: "frame", frame });
  }

  function processText(text: string) {
    if (!lesson) return;
    const clean = text.trim().slice(0, 2_000); if (!clean) return;
    setTranscript(clean);
    if (paused) { setNotice("字幕已更新；AI 概念比對目前暫停。"); broadcast(clean, activeConceptId, decision, true); return; }
    const next = decideLiveSupport(clean, lesson, candidateId);
    if (!next) { setCandidateId(null); setNotice("本段沒有足夠的概念證據，只同步字幕，不顯示支援卡。"); broadcast(clean, activeConceptId, null); return; }
    setCandidateId(next.conceptId);
    if (next.stable) {
      setActiveConceptId(next.conceptId); setDecision(next); setNotice("概念已連續辨識，學生端只會出現一個可自行展開的提示。"); broadcast(clean, next.conceptId, next);
    } else {
      setNotice(`可能提到「${lesson.nodes.find(node => node.id === next.conceptId)?.label}」，等待下一段確認；目前只同步字幕。`); broadcast(clean, activeConceptId, null);
    }
  }

  function forceConcept(id: string) {
    if (!lesson) return;
    const node = lesson.nodes.find(item => item.id === id); if (!node) return;
    const card = lesson.cards.find(item => item.conceptId === id && item.teacherConfirmed);
    const next: LiveSupportDecision = { conceptId: id, supportCardId: card?.id || null, reason: `教師手動指定目前概念為「${node.label}」。`, sourceIds: card?.sourceIds || node.sourceIds, stable: true };
    setCandidateId(id); setActiveConceptId(id); setDecision(next); setNotice("教師已手動指定概念並推送提示。"); broadcast(transcript, id, next);
  }

  function togglePause() {
    const next = !paused; setPaused(next); setNotice(next ? "AI 比對已暫停；字幕仍會繼續同步。" : "AI 比對已恢復。"); broadcast(transcript, activeConceptId, decision, next);
  }

  if (!lesson) return <div className="site-root"><BrandHeader active="teach" /><main className="empty-page"><StatusPill tone="amber">尚未發布課程</StatusPill><h1>請先完成課前準備</h1><p>教師需要確認教材、知識圖譜、診斷題與支援卡，才能開始授課。</p><a className="button primary" href="/prepare">前往課前準備</a></main><PageFooter /></div>;

  return <div className="site-root"><BrandHeader active="teach" actions={<StatusPill>{paused ? "AI 已暫停" : "課堂可開始"}</StatusPill>} /><main className="app-shell teach-shell">
    <section className="lesson-banner"><div><small>{lesson.grade} · 教師授課</small><h1>{lesson.title}</h1></div><div className="lesson-stats"><span>匿名學生 {lesson.profiles.length} 位</span><span>支援卡 {lesson.cards.length} 張</span><span>本機課程包</span></div></section>
    <p className="notice" role="status">{notice}</p>
    <div className="teach-layout"><section className="teaching-stage panel"><header className="panel-title"><div><span>主要教學畫面</span><h2>{activeNode?.label || "等待目前概念"}</h2></div>{activeNode && <StatusPill>{supportCount} 位可能需要補充</StatusPill>}</header>
      <div className="lesson-canvas">{activeNode ? <><small>目前教學概念</small><h2>{activeNode.label}</h2><p>{activeNode.description}</p><div className="concept-keywords">{activeNode.aliases.map(alias => <span key={alias}>{alias}</span>)}</div></> : <><small>本堂目標</small><h2>{lesson.objective}</h2><p>開始講解後，系統只會依已確認圖譜比對概念。</p></>}</div>
      <section className="live-caption"><div><b>即時字幕</b><StatusPill tone="neutral">自動辨識可能有誤</StatusPill></div><p>{transcript || "字幕會先到達，概念支援稍後出現。"}</p></section>
      <label className="transcript-entry">手動字幕／Demo 講稿<textarea value={draft} maxLength={2000} onChange={event => setDraft(event.target.value)} /></label><div className="inline-actions"><button className="primary" onClick={() => processText(draft)}>更新字幕並檢查概念</button><button onClick={() => processText(draft)}>再次確認同一概念</button><button onClick={togglePause}>{paused ? "恢復 AI 比對" : "暫停 AI，保留字幕"}</button><Microphone disabled={false} onText={text => { setDraft(text); processText(text); }} /></div>
    </section><aside className="teacher-console"><section className="panel"><header className="panel-title"><div><span>教師可採取的行動</span><h2>目前概念</h2></div></header><div className="concept-nav">{lesson.nodes.map(node => <button key={node.id} className={activeConceptId === node.id ? "active" : candidateId === node.id ? "candidate" : ""} onClick={() => forceConcept(node.id)}><span>{node.label}</span><small>{activeConceptId === node.id ? "正在教學" : candidateId === node.id ? "等待穩定" : "手動指定"}</small></button>)}</div></section>
      <section className="panel"><header className="panel-title"><div><span>學生端預覽</span><h2>{activeCard?.title || "尚未推送支援卡"}</h2></div></header>{activeCard ? <><p>{activeCard.baseText}</p><div className="source-chips">{sourceMaterials.map(item => <span key={item.id}>{item.location}</span>)}</div></> : <p>學生目前只會看到字幕，不會出現無依據的卡片。</p>}<div className="student-links">{lesson.profiles.map(profile => <a key={profile.id} href={`/learn?stage=live&student=${profile.id}`} target="_blank" rel="noreferrer">開啟 {profile.displayName} ↗</a>)}</div></section>
      {help.length > 0 && <section className="panel help-alert" role="status"><h2>有學生私密求助</h2>{help.map(id => <p key={id}>{lesson.profiles.find(profile => profile.id === id)?.displayName || id} 需要協助</p>)}<button onClick={() => setHelp([])}>標記為已處理</button></section>}
    </aside></div>
    <section className="panel provenance-panel"><header className="panel-title"><div><span>當下來源</span><h2>為什麼可以顯示這張卡？</h2></div></header>{decision ? <><p>{decision.reason}</p><div className="provenance-grid">{sourceMaterials.map(item => <article key={item.id}><StatusPill tone={item.sourceKind === "official-reference" ? "teal" : "neutral"}>{item.sourceKind === "official-reference" ? "官方參考" : "教師教材"}</StatusPill><h3>{item.location}</h3><p>{item.text}</p>{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer">核對官方頁面 ↗</a>}</article>)}</div></> : <p>尚未穩定辨識概念，因此沒有推送任何知識補充。</p>}</section>
  </main><PageFooter /></div>;
}
