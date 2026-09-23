"use client";

import { useEffect, useRef, useState } from "react";
import { Microphone } from "../microphone";
import { BrandHeader, PageFooter, StatusPill } from "../ui";
import { decideLiveSupport, updateMastery, type LessonPackage, type LiveFrame, type LiveSupportDecision, type TranscriptSegment } from "@/lib/lesson";
import { loadLesson, loadMastery, saveFrame, saveMastery } from "@/lib/lesson-store";

const DEMO_SCRIPT = "收到陌生郵件時，先不要點連結或下載附件。判斷寄件者是否可信時，不要只看顯示名稱，要仔細檢查 @ 後方的完整寄件者網域。";

export default function TeachPage() {
  const [lesson, setLesson] = useState<LessonPackage | null>(null);
  const [draft, setDraft] = useState(DEMO_SCRIPT);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const [activeConceptId, setActiveConceptId] = useState<string | null>(null);
  const [activeSlideId, setActiveSlideId] = useState<string | null>(null);
  const [decision, setDecision] = useState<LiveSupportDecision | null>(null);
  const [paused, setPaused] = useState(false);
  const [notice, setNotice] = useState("等待授課。概念需連續出現在兩個合格語音片段，或由教師手動指定後才會推送。");
  const [help, setHelp] = useState<string[]>([]);
  const [revision, setRevision] = useState(0);
  const channel = useRef<BroadcastChannel | null>(null);
  const manualSequence = useRef(100_000);
  const segmentBuffer = useRef<TranscriptSegment[]>([]);
  const candidateRef = useRef<string | null>(null);
  const activeConceptRef = useRef<string | null>(null);
  const activeSlideRef = useRef<string | null>(null);
  const decisionRef = useRef<LiveSupportDecision | null>(null);
  const pausedRef = useRef(false);

  useEffect(() => {
    const stored = loadLesson();
    // Browser storage is unavailable during server rendering.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLesson(stored);
    const firstSlideId = stored?.slides[0]?.id || null;
    setActiveSlideId(firstSlideId); activeSlideRef.current = firstSlideId;
    if (typeof BroadcastChannel === "undefined") return;
    const bus = new BroadcastChannel("edubridge-classroom-v3"); channel.current = bus;
    bus.onmessage = event => {
      if (event.data?.type === "help" && typeof event.data.studentId === "string") setHelp(current => [...new Set([...current, event.data.studentId])]);
      if (event.data?.type === "mastery") setRevision(value => value + 1);
    };
    return () => bus.close();
  }, []);

  const activeNode = lesson?.nodes.find(node => node.id === activeConceptId) || null;
  const activeSlide = lesson?.slides.find(slide => slide.id === activeSlideId) || lesson?.slides[0] || null;
  const activeCard = lesson?.cards.find(card => card.id === decision?.supportCardId) || null;
  const sourceMaterials = lesson?.materials.filter(item => decision?.sourceIds.includes(item.id)) || [];
  const transcriptText = segments.filter(segment => segment.quality !== "silence").slice(-3).map(segment => segment.text).join(" ");
  const supportCount = (() => {
    void revision;
    if (!lesson || !activeConceptId) return 0;
    return lesson.profiles.filter(profile => {
      const evidence = loadMastery(profile.id).find(item => item.conceptId === activeConceptId);
      return !evidence || evidence.state === "unknown" || evidence.state === "needs-check";
    }).length;
  })();

  function broadcast(nextSegments: TranscriptSegment[], nextConcept: string | null, nextDecision: LiveSupportDecision | null, nextSlideId = activeSlideRef.current, nextPaused = pausedRef.current) {
    if (!lesson) return;
    const frame: LiveFrame = { lessonId: lesson.id, activeSlideId: nextSlideId, activeConceptId: nextConcept, transcriptSegments: nextSegments.slice(-6), decision: nextDecision, paused: nextPaused, updatedAt: new Date().toISOString() };
    saveFrame(frame); channel.current?.postMessage({ type: "frame", frame });
  }

  function processSegment(segment: TranscriptSegment) {
    if (!lesson) return;
    const nextSegments = [...segmentBuffer.current, segment].slice(-6);
    segmentBuffer.current = nextSegments; setSegments(nextSegments);
    if (segment.quality !== "accepted") {
      setNotice(segment.quality === "silence" ? "本段判定為靜音，不參與概念比對。" : "本段字幕可信度較低，已保留供教師查看，但不觸發支援卡。");
      broadcast(nextSegments, activeConceptRef.current, decisionRef.current);
      return;
    }
    if (pausedRef.current) { setNotice("字幕已更新；AI 概念比對目前暫停。"); broadcast(nextSegments, activeConceptRef.current, decisionRef.current, activeSlideRef.current, true); return; }
    const next = decideLiveSupport(segment.text, lesson, candidateRef.current);
    if (!next) { candidateRef.current = null; setCandidateId(null); setNotice("本段沒有足夠的概念證據，只同步字幕，不新增支援卡。"); broadcast(nextSegments, activeConceptRef.current, decisionRef.current); return; }
    candidateRef.current = next.conceptId; setCandidateId(next.conceptId);
    if (next.stable) {
      activeConceptRef.current = next.conceptId; decisionRef.current = next;
      setActiveConceptId(next.conceptId); setDecision(next);
      setNotice("概念已由兩個合格片段穩定辨識；學生端只出現一個可自行展開的提示。");
      broadcast(nextSegments, next.conceptId, next);
    } else {
      setNotice(`可能提到「${lesson.nodes.find(node => node.id === next.conceptId)?.label}」，等待下一個合格片段；目前只同步字幕。`);
      broadcast(nextSegments, activeConceptRef.current, decisionRef.current);
    }
  }

  function processManualText() {
    const text = draft.trim().slice(0, 2_000); if (!text) return;
    processSegment({ sequence: manualSequence.current++, text, quality: "accepted", avgLogprob: null, compressionRatio: null, noSpeechProbability: null });
  }

  function forceConcept(id: string) {
    if (!lesson) return;
    const node = lesson.nodes.find(item => item.id === id); if (!node) return;
    const card = lesson.cards.find(item => item.conceptId === id && item.teacherConfirmed);
    const next: LiveSupportDecision = { conceptId: id, supportCardId: card?.id || null, reason: `教師手動指定目前概念為「${node.label}」。`, sourceIds: card?.sourceIds || node.sourceIds, stable: true };
    candidateRef.current = id; activeConceptRef.current = id; decisionRef.current = next;
    setCandidateId(id); setActiveConceptId(id); setDecision(next); setNotice("教師已手動指定概念並推送提示。"); broadcast(segmentBuffer.current, id, next);
  }

  function selectSlide(id: string) {
    activeSlideRef.current = id; setActiveSlideId(id); broadcast(segmentBuffer.current, activeConceptRef.current, decisionRef.current, id); setNotice("教學頁面已同步到所有匿名 Demo 學生頁。");
  }

  function moveSlide(offset: number) {
    if (!lesson || !activeSlide) return;
    const index = lesson.slides.findIndex(slide => slide.id === activeSlide.id);
    const next = lesson.slides[Math.max(0, Math.min(lesson.slides.length - 1, index + offset))];
    if (next) selectSlide(next.id);
  }

  function togglePause() {
    const next = !pausedRef.current; pausedRef.current = next; setPaused(next); setNotice(next ? "AI 比對已暫停；字幕與投影片仍會同步。" : "AI 比對已恢復。"); broadcast(segmentBuffer.current, activeConceptRef.current, decisionRef.current, activeSlideRef.current, next);
  }

  function markTeacherReady(studentId: string) {
    if (!activeConceptId) return;
    const current = loadMastery(studentId); const index = current.findIndex(item => item.conceptId === activeConceptId);
    const evidence = updateMastery(index >= 0 ? current[index] : undefined, activeConceptId, true, "teacher", null);
    const next = index >= 0 ? current.map((item, itemIndex) => itemIndex === index ? evidence : item) : [...current, evidence];
    saveMastery(studentId, next); setRevision(value => value + 1); channel.current?.postMessage({ type: "mastery", studentId });
    setNotice("教師已加入一筆人工確認證據；這是課堂判斷，不是正式能力診斷。");
  }

  if (!lesson) return <div className="site-root"><BrandHeader active="teach" /><main className="empty-page"><StatusPill tone="amber">尚未發布課程</StatusPill><h1>請先完成課前準備</h1><p>教師需要確認教材、知識圖譜、診斷題與支援卡，才能開始授課。</p><a className="button primary" href="/prepare">前往課前準備</a></main><PageFooter /></div>;

  return <div className="site-root"><BrandHeader active="teach" actions={<StatusPill>{paused ? "AI 已暫停" : "課堂可開始"}</StatusPill>} /><main className="app-shell teach-shell">
    <section className="lesson-banner"><div><small>{lesson.grade} · 教師授課</small><h1>{lesson.title}</h1></div><div className="lesson-stats"><span>匿名 Demo 學生頁 {lesson.profiles.length} 個</span><span>支援卡 {lesson.cards.length} 張</span><span>同瀏覽器同步</span></div></section>
    <p className="notice" role="status">{notice}</p>
    <div className="teach-layout"><section className="teaching-stage panel"><header className="panel-title"><div><span>主要教學畫面</span><h2>{activeSlide?.title || "等待教學頁面"}</h2></div>{activeNode && <StatusPill>{supportCount} 位目前可能需要補充</StatusPill>}</header>
      <div className="lesson-canvas accessible-slide">{activeSlide ? <><small>依教材文字建立的教學檢視 · 第 {activeSlide.order}/{lesson.slides.length} 頁</small><h2>{activeSlide.title}</h2><ul>{activeSlide.body.map((line, index) => <li key={`${line}-${index}`}>{line}</li>)}</ul>{activeNode && <div className="concept-keywords"><span>目前概念：{activeNode.label}</span>{activeNode.aliases.map(alias => <span key={alias}>{alias}</span>)}</div>}</> : <h2>{lesson.objective}</h2>}</div>
      <div className="slide-controls"><button onClick={() => moveSlide(-1)} disabled={activeSlide?.order === 1}>上一頁</button><select aria-label="選擇教學頁面" value={activeSlide?.id || ""} onChange={event => selectSlide(event.target.value)}>{lesson.slides.map(slide => <option key={slide.id} value={slide.id}>{slide.order}. {slide.title}</option>)}</select><button onClick={() => moveSlide(1)} disabled={activeSlide?.order === lesson.slides.length}>下一頁</button></div>
      <section className="live-caption"><div><b>即時字幕</b><StatusPill tone={segments.at(-1)?.quality === "review" ? "amber" : "neutral"}>{segments.at(-1)?.quality === "review" ? "待教師確認" : "自動辨識可能有誤"}</StatusPill></div><p>{transcriptText || "字幕會先到達；只有合格且穩定的概念證據才會觸發支援卡。"}</p></section>
      <label className="transcript-entry">手動字幕／Demo 講稿<textarea value={draft} maxLength={2000} onChange={event => setDraft(event.target.value)} /></label><div className="inline-actions"><button className="primary" onClick={processManualText}>送出合格字幕片段</button><button onClick={processManualText}>再次確認同一概念</button><button onClick={togglePause}>{paused ? "恢復 AI 比對" : "暫停 AI，保留字幕"}</button><Microphone disabled={false} onSegment={segment => { setDraft(segment.text || draft); processSegment(segment); }} /></div>
    </section><aside className="teacher-console"><section className="panel"><header className="panel-title"><div><span>教師可採取的行動</span><h2>目前概念</h2></div></header><div className="concept-nav">{lesson.nodes.map(node => <button key={node.id} className={activeConceptId === node.id ? "active" : candidateId === node.id ? "candidate" : ""} onClick={() => forceConcept(node.id)}><span>{node.label}</span><small>{activeConceptId === node.id ? "正在教學" : candidateId === node.id ? "等待穩定" : "手動指定"}</small></button>)}</div></section>
      <section className="panel"><header className="panel-title"><div><span>學生端提示預覽</span><h2>{activeCard?.title || "尚未推送支援卡"}</h2></div></header>{activeCard ? <><p>{activeCard.baseText}</p><div className="source-chips">{sourceMaterials.map(item => <span key={item.id}>{item.location}</span>)}</div></> : <p>學生目前只會看到教學頁面與字幕，不會出現無依據的卡片。</p>}<div className="student-links">{lesson.profiles.map(profile => <a key={profile.id} href={`/learn?stage=live&student=${profile.id}`} target="_blank" rel="noreferrer">開啟匿名 Demo {profile.displayName} ↗</a>)}</div></section>
      {help.length > 0 && <section className="panel help-alert" role="status"><h2>有學生私密求助</h2>{help.map(id => <p key={id}>{lesson.profiles.find(profile => profile.id === id)?.displayName || id} 需要協助</p>)}<button onClick={() => setHelp([])}>標記為已處理</button></section>}
      {activeConceptId && <section className="panel teacher-evidence"><header className="panel-title"><div><span>教師人工判斷</span><h2>確認目前可繼續</h2></div></header><p>只有教師觀察後才使用，不由 AI 自動替學生判定。</p>{lesson.profiles.map(profile => <button key={profile.id} onClick={() => markTeacherReady(profile.id)}>確認 {profile.displayName}</button>)}</section>}
    </aside></div>
    <details className="panel provenance-panel"><summary>查看當下來源與顯示原因</summary>{decision ? <><p>{decision.reason}</p><div className="provenance-grid">{sourceMaterials.map(item => <article key={item.id}><StatusPill tone={item.sourceKind === "official-reference" ? "teal" : "neutral"}>{item.sourceKind === "official-reference" ? "官方參考" : "教師教材"}</StatusPill><h3>{item.location}</h3><p>{item.text}</p>{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer">核對官方頁面 ↗</a>}</article>)}</div></> : <p>尚未穩定辨識概念，因此沒有推送任何知識補充。</p>}</details>
  </main><PageFooter /></div>;
}
