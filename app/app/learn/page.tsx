"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BrandHeader, PageFooter, StatusPill } from "../ui";
import { updateMastery, type LessonPackage, type LiveFrame, type MasteryEvidence, type StudentProfile, type SupportProfile } from "@/lib/lesson";
import { loadFrame, loadLesson, loadMastery, loadSupport, saveMastery, saveSupport } from "@/lib/lesson-store";

const preferenceLabels: Record<keyof SupportProfile, string> = { captions: "強化即時字幕", simplifiedText: "使用白話短句", focusSteps: "一次顯示一步", colorSafe: "色覺安全配色", textToSpeech: "提供文字朗讀", reducedMotion: "減少畫面動態", advancedChallenge: "提供進階挑戰" };
const stateLabels: Record<MasteryEvidence["state"], string> = { unknown: "尚未取得證據", "needs-check": "需要再確認", developing: "正在建立理解", ready: "目前可繼續" };

function speak(text: string) { speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text); utterance.lang = "zh-TW"; utterance.rate = 0.85; speechSynthesis.speak(utterance); }

export default function LearnPage() {
  const [lesson, setLesson] = useState<LessonPackage | null>(null);
  const [student, setStudent] = useState<StudentProfile | null>(null);
  const [stage, setStage] = useState<"pretest" | "live">("pretest");
  const [support, setSupport] = useState<SupportProfile | null>(null);
  const [mastery, setMastery] = useState<MasteryEvidence[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState<string[]>([]);
  const [frame, setFrame] = useState<LiveFrame | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);
  const [notice, setNotice] = useState("");
  const channel = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    const stored = loadLesson();
    // Browser storage and URL parameters are unavailable during server rendering.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLesson(stored);
    if (!stored) return;
    const params = new URLSearchParams(location.search); const studentId = params.get("student") || "A"; const nextStage = params.get("stage") === "live" ? "live" : "pretest";
    const profile = stored.profiles.find(item => item.id === studentId) || stored.profiles[0];
    setStudent(profile); setStage(nextStage); setSupport(loadSupport(profile.id, profile.support)); setMastery(loadMastery(profile.id)); setFrame(loadFrame());
    if (typeof BroadcastChannel !== "undefined") {
      const bus = new BroadcastChannel("edubridge-classroom-v2"); channel.current = bus;
      bus.onmessage = event => { if (event.data?.type === "frame" && event.data.frame?.lessonId === stored.id) { setFrame(event.data.frame); setSupportOpen(false); setFocusIndex(0); } };
    }
    const storage = (event: StorageEvent) => { if (event.key === "edubridge-live-frame-v2") setFrame(loadFrame()); };
    addEventListener("storage", storage);
    return () => { channel.current?.close(); removeEventListener("storage", storage); };
  }, []);

  const currentQuestion = lesson?.questions[questionIndex];
  const activeNode = lesson?.nodes.find(node => node.id === frame?.activeConceptId) || null;
  const activeCard = lesson?.cards.find(card => card.id === frame?.decision?.supportCardId) || null;
  const sources = lesson?.materials.filter(item => frame?.decision?.sourceIds.includes(item.id)) || [];
  const evidence = activeNode ? mastery.find(item => item.conceptId === activeNode.id) : undefined;
  const quickQuestion = lesson?.questions.find(question => activeNode && question.conceptIds.includes(activeNode.id));
  const cardText = support?.simplifiedText ? activeCard?.simplifiedText : activeCard?.baseText;
  const className = `site-root learner ${support?.colorSafe ? "color-safe" : ""} ${support?.reducedMotion ? "reduced-motion" : ""}`;
  const completed = answered.length >= (lesson?.questions.length || 0);
  const masterySummary = useMemo(() => lesson?.nodes.map(node => ({ node, evidence: mastery.find(item => item.conceptId === node.id) })) || [], [lesson, mastery]);

  function commitEvidence(conceptIds: string[], correct: boolean) {
    if (!student) return;
    const next = [...mastery];
    for (const id of conceptIds) { const index = next.findIndex(item => item.conceptId === id); const updated = updateMastery(index >= 0 ? next[index] : undefined, id, correct); if (index >= 0) next[index] = updated; else next.push(updated); }
    setMastery(next); saveMastery(student.id, next); channel.current?.postMessage({ type: "mastery", studentId: student.id });
  }

  function answerPretest(index: number) {
    if (!currentQuestion || answered.includes(currentQuestion.id)) return;
    setSelected(index); setAnswered(items => [...items, currentQuestion.id]); commitEvidence(currentQuestion.conceptIds, index === currentQuestion.correctIndex);
  }

  function nextQuestion() { if (!lesson) return; setQuestionIndex(index => Math.min(index + 1, lesson.questions.length - 1)); setSelected(null); }
  function changeSupport(key: keyof SupportProfile, value: boolean) { if (!support || !student) return; const next = { ...support, [key]: value }; setSupport(next); saveSupport(student.id, next); }

  if (!lesson || !student || !support) return <div className="site-root"><BrandHeader active="learn" /><main className="empty-page"><StatusPill tone="amber">找不到課程包</StatusPill><h1>請先由教師發布本堂課</h1><p>競賽版不使用學生帳號，課程與匿名設定會保存在同一瀏覽器。</p><a className="button primary" href="/prepare">前往課前準備</a></main><PageFooter /></div>;

  if (stage === "pretest") return <div className={className}><BrandHeader active="learn" actions={<StatusPill tone="neutral">{student.displayName} · 匿名</StatusPill>} /><main className="student-shell">
    <section className="student-intro"><div><StatusPill>課前理解檢核</StatusPill><h1>{lesson.title}</h1><p>這不是考試，也不會替你貼標籤。答案只幫助系統判斷上課時可能需要補充哪個概念。</p></div><b>{Math.min(questionIndex + 1, lesson.questions.length)} / {lesson.questions.length}</b></section>
    {!completed || selected !== null ? <section className="pretest-card"><div className="question-progress"><span style={{ width: `${((questionIndex + 1) / lesson.questions.length) * 100}%` }} /></div><small>請選擇最符合目前理解的答案</small><h2>{currentQuestion?.prompt}</h2><div className="answer-list">{currentQuestion?.options.map((option, index) => <button key={option} disabled={selected !== null} className={selected === index ? (index === currentQuestion.correctIndex ? "correct" : "selected") : ""} onClick={() => answerPretest(index)}><b>{String.fromCharCode(65 + index)}</b><span>{option}</span></button>)}</div>{selected !== null && currentQuestion && <div className="feedback"><StatusPill tone={selected === currentQuestion.correctIndex ? "teal" : "amber"}>{selected === currentQuestion.correctIndex ? "目前理解正確" : "需要再確認"}</StatusPill><p>{currentQuestion.feedback}</p><small>一次作答不代表固定能力，課中的理解檢核仍會更新狀態。</small>{questionIndex < lesson.questions.length - 1 ? <button className="primary" onClick={nextQuestion}>下一題</button> : <button className="primary" onClick={() => { setSelected(null); setQuestionIndex(lesson.questions.length - 1); }}>查看結果</button>}</div>}</section> : <section className="pretest-card"><StatusPill>前測完成</StatusPill><h2>這是暫時的學習證據，不是能力判定。</h2><div className="mastery-list">{masterySummary.map(({ node, evidence: item }) => <div key={node.id}><b>{node.label}</b><span className={item?.state || "unknown"}>{stateLabels[item?.state || "unknown"]}</span></div>)}</div><div className="hero-actions"><a className="button primary" href={`/learn?stage=live&student=${student.id}`}>進入課堂畫面</a><button onClick={() => { saveMastery(student.id, []); setMastery([]); setAnswered([]); setQuestionIndex(0); }}>清除並重新作答</button></div></section>}
  </main><PageFooter /></div>;

  return <div className={className}><BrandHeader active="learn" actions={<button className="preference-button" onClick={() => setPreferencesOpen(value => !value)} aria-expanded={preferencesOpen}>我的呈現偏好</button>} />
    {preferencesOpen && <section className="preference-drawer"><header><div><small>僅儲存在這台裝置</small><h2>我的呈現偏好</h2></div><button onClick={() => setPreferencesOpen(false)}>關閉</button></header><div>{(Object.keys(support) as Array<keyof SupportProfile>).map(key => <label key={key}><input type="checkbox" checked={support[key]} onChange={event => changeSupport(key, event.target.checked)} />{preferenceLabels[key]}</label>)}</div><p>這些是功能選擇，不是醫療或特殊教育診斷。</p></section>}
    <main className="student-shell live-learning"><section className="live-course-head"><div><StatusPill>{frame?.paused ? "教師已暫停 AI" : "課堂同步中"}</StatusPill><h1>{lesson.title}</h1></div><span>{student.displayName}</span></section>
      <div className="student-learning-grid"><section className="learning-main"><div className="student-canvas">{activeNode ? <><small>教師目前講到</small><h2>{activeNode.label}</h2><p>{activeNode.description}</p><div className="concept-keywords">{activeNode.aliases.map(alias => <span key={alias}>{alias}</span>)}</div></> : <><small>本堂學習目標</small><h2>{lesson.objective}</h2><p>等待教師開始授課；沒有足夠證據時，系統不會猜測概念。</p></>}</div>
        <section className={`student-caption ${support.captions ? "enhanced" : ""}`} aria-live="polite"><header><b>教師即時字幕</b><small>自動辨識可能有誤，以教師說明為準</small></header><p>{frame?.transcript || "等待教師端同步字幕…"}</p></section>
      </section><aside className="support-rail"><section className={`support-prompt ${activeCard ? "available" : ""}`}><small>當下學習支援</small>{activeCard ? <><h2>需要補充「{activeCard.title}」嗎？</h2><p>系統找到一張經教師確認、與目前內容相符的卡片。</p><button className="primary" onClick={() => setSupportOpen(value => !value)}>{supportOpen ? "收合補充" : "由我展開補充"}</button></> : <><h2>目前不需要額外卡片</h2><p>字幕會持續顯示；系統不會為了填滿畫面而生成內容。</p></>}</section>
        {supportOpen && activeCard && <section className="support-card"><div className="support-card-head"><StatusPill>{evidence ? stateLabels[evidence.state] : "尚未取得前測證據"}</StatusPill>{support.textToSpeech && <button onClick={() => speak(cardText || "")}>朗讀</button>}</div><h2>{activeCard.title}</h2>{support.focusSteps ? <div className="focus-support"><small>一次只看一個步驟 · {focusIndex + 1}/{activeCard.focusSteps.length}</small><p>{activeCard.focusSteps[focusIndex]}</p><div><button disabled={focusIndex === 0} onClick={() => setFocusIndex(index => Math.max(0, index - 1))}>上一步</button><button disabled={focusIndex >= activeCard.focusSteps.length - 1} onClick={() => setFocusIndex(index => Math.min(activeCard.focusSteps.length - 1, index + 1))}>下一步</button></div></div> : <p className="support-text">{cardText}</p>}<div className="concept-keywords">{activeCard.keywords.map(keyword => <span key={keyword}>{keyword}</span>)}</div>{support.advancedChallenge && <div className="advanced"><b>進階挑戰</b><p>{activeCard.advancedPrompt}</p></div>}<details><summary>為什麼現在顯示？</summary><p>{frame?.decision?.reason}</p>{sources.map(item => <p key={item.id}><b>{item.location}</b>{item.sourceUrl && <> · <a href={item.sourceUrl} target="_blank" rel="noreferrer">官方來源 ↗</a></>}</p>)}</details></section>}
        {supportOpen && quickQuestion && <QuickCheck key={quickQuestion.id} question={quickQuestion} onAnswer={correct => { commitEvidence(quickQuestion.conceptIds, correct); setNotice(correct ? "理解證據已更新。" : "已標記為需要再確認，不代表你不會。"); }} />}
        <button className="quiet-help" onClick={() => { channel.current?.postMessage({ type: "help", studentId: student.id }); setNotice("已私密通知教師，其他同學不會看到。"); }}>安靜舉手：我需要協助</button>{notice && <p className="student-notice" role="status">{notice}</p>}
      </aside></div>
    </main><PageFooter /></div>;
}

function QuickCheck({ question, onAnswer }: { question: LessonPackage["questions"][number]; onAnswer: (correct: boolean) => void }) {
  const [choice, setChoice] = useState<number | null>(null);
  return <section className="quick-check"><small>課堂理解檢核</small><h3>{question.prompt}</h3>{question.options.map((option, index) => <button key={option} disabled={choice !== null} onClick={() => { setChoice(index); onAnswer(index === question.correctIndex); }} className={choice === index ? "selected" : ""}>{option}</button>)}{choice !== null && <p>{choice === question.correctIndex ? "目前可以繼續下一個概念。" : "先保留這個疑問，必要時請教師協助。"}</p>}</section>;
}
