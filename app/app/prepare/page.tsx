"use client";

import { useEffect, useState } from "react";
import { BrandHeader, PageFooter, StatusPill } from "../ui";
import { confirmEntireLesson, lessonReady, PHISHING_SAMPLE_MATERIALS, validateLessonPackage, type LessonPackage, type SupportProfile } from "@/lib/lesson";
import { loadLesson, saveLesson } from "@/lib/lesson-store";
import { parseMaterial, type Material } from "@/lib/materials";

const supportLabels: Record<keyof SupportProfile, string> = {
  captions: "即時字幕", simplifiedText: "白話短句", focusSteps: "一次一步", colorSafe: "色覺安全", textToSpeech: "文字朗讀", reducedMotion: "減少動態", advancedChallenge: "進階挑戰",
};

function download(data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = "edubridge-lesson-package.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 500);
}

export default function PreparePage() {
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("資訊科技：釣魚郵件與可疑連結辨識");
  const [grade, setGrade] = useState("國中八年級");
  const [objective, setObjective] = useState("學生能在收到可疑郵件時停止操作，檢查寄件者、網址與急迫話術，並從官方管道查證。");
  const [materials, setMaterials] = useState<Material[]>([]);
  const [lesson, setLesson] = useState<LessonPackage | null>(null);
  const [published, setPublished] = useState(false);
  const [notice, setNotice] = useState("先放入教案與簡報，或載入已查核的資訊安全示範教材。");
  const [busy, setBusy] = useState(false);

  useEffect(() => { const saved = loadLesson(); if (saved) {
    // Browser storage is unavailable during server rendering.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLesson(saved); setTitle(saved.title); setGrade(saved.grade); setObjective(saved.objective); setMaterials(saved.materials); setPublished(true);
  } }, []);

  async function upload(files: FileList | null) {
    if (!files) return;
    setNotice("正在本機解析教材…");
    try {
      const chunks = (await Promise.all(Array.from(files).map(parseMaterial))).flat().map(item => ({ ...item, sourceKind: "teacher-material" as const }));
      setMaterials(current => [...current, ...chunks]); setLesson(null); setNotice(`已解析 ${chunks.length} 段。請先核對文字與來源，再勾選可用內容。`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "教材解析失敗。"); }
  }

  async function prepareLesson() {
    if (!title.trim() || !grade.trim() || !objective.trim() || !materials.some(item => item.confirmed)) { setNotice("請完整填寫課程資料，並至少確認一段教材。"); return; }
    setBusy(true); setNotice("正在依已確認內容建立課程草稿…");
    try {
      const response = await fetch("/api/lesson/prepare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, grade, objective, materials }) });
      const data = await response.json();
      if (!response.ok || !validateLessonPackage(data.lesson)) throw new Error(data.error || "課程草稿格式不正確。");
      setLesson(data.lesson); setPublished(false); setStep(2); setNotice(data.notice);
    } catch (error) { setNotice(error instanceof Error ? error.message : "無法建立課程草稿。"); }
    finally { setBusy(false); }
  }

  function setConfirmed(section: "nodes" | "questions" | "cards", id: string, checked: boolean) {
    if (!lesson) return;
    setPublished(false);
    setLesson({ ...lesson, [section]: lesson[section].map(item => item.id === id ? { ...item, teacherConfirmed: checked } : item) } as LessonPackage);
  }

  function publish() {
    if (!lesson || !lessonReady(lesson) || !validateLessonPackage(lesson)) { setNotice("尚有未確認內容或圖譜關係不合法，無法發布。"); return; }
    try { saveLesson(lesson); setPublished(true); setNotice("課程包已發布到本機。現在可開啟前測與教師授課頁面。"); setStep(4); }
    catch (error) { setNotice(error instanceof Error ? error.message : "無法儲存課程包。"); }
  }

  async function restore(file?: File) {
    if (!file) return;
    try { const value = JSON.parse(await file.text()); if (!validateLessonPackage(value)) throw new Error("課程包格式不正確。"); setLesson(value); setPublished(false); setTitle(value.title); setGrade(value.grade); setObjective(value.objective); setMaterials(value.materials); setStep(4); setNotice("已載入課程備援包，請再次檢查後發布。"); }
    catch (error) { setNotice(error instanceof Error ? error.message : "無法載入課程包。"); }
  }

  const source = (id: string) => lesson?.materials.find(item => item.id === id);
  const graphConfirmed = !!lesson && lesson.nodes.every(item => item.teacherConfirmed) && lesson.edges.every(item => item.teacherConfirmed);
  const teachingConfirmed = !!lesson && lesson.questions.every(item => item.teacherConfirmed) && lesson.cards.every(item => item.teacherConfirmed);

  return <div className="site-root">
    <BrandHeader active="prepare" actions={<StatusPill tone="neutral">資料僅存於本機</StatusPill>} />
    <main className="app-shell">
      <section className="page-heading"><div><StatusPill>課前準備工作區</StatusPill><h1>先把課程準備好，課中才不需要一直等 AI。</h1><p>AI 只提出草稿；概念關係、題目、卡片與來源皆由教師確認後才可發布。</p></div><label className="file-button compact">載入備援課程包<input type="file" accept=".json" onChange={event => { void restore(event.target.files?.[0]); event.target.value = ""; }} /></label></section>
      <ol className="stepper" aria-label="課前準備進度">{["教材與目標", "知識圖譜", "前測與支援", "發布預覽"].map((label, index) => <li key={label} className={step === index + 1 ? "active" : step > index + 1 ? "done" : ""}><button onClick={() => setStep(index + 1)} disabled={index > 0 && !lesson}><b>{index + 1}</b><span>{label}</span></button></li>)}</ol>
      <p className="notice" role="status">{notice}</p>

      {step === 1 && <div className="prepare-grid"><section className="panel"><header className="panel-title"><div><span>STEP 1</span><h2>課程目標與教材</h2></div><StatusPill tone="neutral">原始檔不離開瀏覽器</StatusPill></header>
        <div className="form-grid"><label>課程名稱<input value={title} maxLength={200} onChange={event => { setTitle(event.target.value); setLesson(null); }} /></label><label>適用年級<input value={grade} maxLength={100} onChange={event => { setGrade(event.target.value); setLesson(null); }} /></label><label className="full">教學目標<textarea value={objective} maxLength={500} onChange={event => { setObjective(event.target.value); setLesson(null); }} /></label></div>
        <div className="upload-zone"><strong>放入教案與上課簡報</strong><p>支援 DOCX、PPTX、TXT、Markdown；圖片式內容需另外提供文字。</p><div className="inline-actions"><label className="file-button">選擇檔案<input type="file" multiple accept=".docx,.pptx,.txt,.md" onChange={event => { void upload(event.target.files); event.target.value = ""; }} /></label><button onClick={() => { setMaterials(PHISHING_SAMPLE_MATERIALS.map(item => ({ ...item }))); setLesson(null); setNotice("已載入教師教材與 4 筆事先查核的官方參考來源；請逐段確認。"); }}>載入已查核資安微課</button></div></div>
      </section><aside className="panel evidence-note"><h2>外部知識如何使用？</h2><p>Demo 只預載官方網站的教學摘要與網址，不在課堂現場爬網，也不複製整篇內容。</p><ul><li>外部來源會標記查核日期。</li><li>仍須與教師教材一起核對。</li><li>來源不足的關係不強行建立。</li></ul></aside></div>}

      {step === 1 && materials.length > 0 && <section className="panel material-review"><header className="panel-title"><div><span>來源核對</span><h2>{materials.length} 段可用內容</h2></div><button onClick={() => setMaterials(items => items.map(item => ({ ...item, confirmed: true })))}>全部標記為已核對</button></header><div className="material-table">{materials.map(item => <article key={item.id}><label><input type="checkbox" checked={item.confirmed} onChange={event => { setMaterials(items => items.map(value => value.id === item.id ? { ...value, confirmed: event.target.checked } : value)); setLesson(null); }} /><span><b>{item.location}</b><small>{item.file} · {item.sourceKind === "official-reference" ? `官方參考 · 查核 ${item.verifiedAt}` : "教師教材"}</small></span></label><p>{item.text}</p>{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer">查看官方來源 ↗</a>}</article>)}</div><div className="panel-actions"><button className="primary" disabled={busy || !materials.some(item => item.confirmed)} onClick={() => void prepareLesson()}>{busy ? "建立草稿中…" : "依已確認內容建立知識圖譜"}</button></div></section>}

      {step === 2 && lesson && <section className="panel"><header className="panel-title"><div><span>STEP 2</span><h2>教師核對知識圖譜</h2></div><button onClick={() => { setPublished(false); setLesson({ ...lesson, nodes: lesson.nodes.map(item => ({ ...item, teacherConfirmed: true })), edges: lesson.edges.map(item => ({ ...item, teacherConfirmed: true })) }); }}>確認全部圖譜項目</button></header><p className="section-intro">箭頭代表「左側概念是右側概念的先備」。只有教材可證明的關係才應保留。</p>
        <div className="knowledge-map">{lesson.nodes.map((node, index) => <article key={node.id} className={node.teacherConfirmed ? "confirmed" : ""}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{node.label}</h3><p>{node.description}</p><div className="source-chips">{node.sourceIds.map(id => <small key={id}>{source(id)?.location || id}</small>)}</div></div><label><input type="checkbox" checked={node.teacherConfirmed} onChange={event => setConfirmed("nodes", node.id, event.target.checked)} />教師確認</label></article>)}</div>
        <div className="edge-list"><h3>概念關係</h3>{lesson.edges.map(edge => <label key={edge.from + edge.to + edge.type}><input type="checkbox" checked={edge.teacherConfirmed} onChange={event => { setPublished(false); setLesson({ ...lesson, edges: lesson.edges.map(item => item === edge ? { ...item, teacherConfirmed: event.target.checked } : item) }); }} /><b>{lesson.nodes.find(node => node.id === edge.from)?.label}</b><span>→ {edge.type === "prerequisite" ? "先備於" : edge.type === "part_of" ? "組成" : "相關"} →</span><b>{lesson.nodes.find(node => node.id === edge.to)?.label}</b><small>{edge.reason}</small></label>)}</div>
        <div className="panel-actions"><button disabled={!graphConfirmed} className="primary" onClick={() => setStep(3)}>圖譜核對完成，準備前測</button></div>
      </section>}

      {step === 3 && lesson && <div className="review-columns"><section className="panel"><header className="panel-title"><div><span>STEP 3A</span><h2>診斷題與支援卡</h2></div><button onClick={() => { setPublished(false); setLesson({ ...lesson, questions: lesson.questions.map(item => ({ ...item, teacherConfirmed: true })), cards: lesson.cards.map(item => ({ ...item, teacherConfirmed: true })) }); }}>確認所有教學內容</button></header>
        <div className="question-review">{lesson.questions.map((question, index) => <article key={question.id}><label><input type="checkbox" checked={question.teacherConfirmed} onChange={event => setConfirmed("questions", question.id, event.target.checked)} /><b>題目 {index + 1}：{question.prompt}</b></label><ol>{question.options.map((option, optionIndex) => <li className={optionIndex === question.correctIndex ? "correct" : ""} key={option}>{option}</li>)}</ol><small>{question.feedback}</small></article>)}</div>
        <div className="card-review"><h3>預先生成的鷹架卡</h3>{lesson.cards.map(card => <label key={card.id}><input type="checkbox" checked={card.teacherConfirmed} onChange={event => setConfirmed("cards", card.id, event.target.checked)} /><span><b>{card.title}</b><small>{card.baseText}</small></span></label>)}</div>
      </section><aside className="panel"><header className="panel-title"><div><span>STEP 3B</span><h2>匿名支援設定</h2></div></header><p>介面只記錄所需功能，不儲存 ADHD、聽障或其他診斷名稱。</p>{lesson.profiles.map(profile => <article className="profile-card" key={profile.id}><h3>{profile.displayName}</h3><div>{(Object.keys(profile.support) as Array<keyof SupportProfile>).map(key => <label key={key}><input type="checkbox" checked={profile.support[key]} onChange={event => { setPublished(false); setLesson({ ...lesson, profiles: lesson.profiles.map(item => item.id === profile.id ? { ...item, support: { ...item.support, [key]: event.target.checked } } : item) }); }} />{supportLabels[key]}</label>)}</div></article>)}<p className="privacy-note">學生進入自己的頁面後仍可私下覆寫這些設定，其他同學不會看到。</p></aside><div className="panel-actions wide"><button className="primary" disabled={!graphConfirmed || !teachingConfirmed} onClick={() => { setPublished(false); setLesson(confirmEntireLesson(lesson)); setStep(4); }}>教學內容確認完成</button></div></div>}

      {step === 4 && lesson && <section className="publish-card"><StatusPill>{published ? "已發布" : lessonReady(lesson) ? "可發布" : "仍有待確認內容"}</StatusPill><h2>{lesson.title}</h2><p>{lesson.objective}</p><div className="publish-metrics"><div><b>{lesson.nodes.length}</b><span>概念節點</span></div><div><b>{lesson.edges.length}</b><span>概念關係</span></div><div><b>{lesson.questions.length}</b><span>診斷題</span></div><div><b>{lesson.cards.length}</b><span>支援卡</span></div></div><div className="source-coverage"><b>來源覆蓋檢查</b><span>{lesson.nodes.every(node => node.sourceIds.length > 0) && lesson.cards.every(card => card.sourceIds.length > 0) ? "全部概念與卡片均有來源" : "有內容缺少來源"}</span></div><div className="hero-actions"><button className="primary" disabled={!lessonReady(lesson)} onClick={publish}>{published ? "重新發布最新設定" : "發布到本機 Demo"}</button><button onClick={() => download(lesson)}>匯出離線備援</button>{published && <><a className="button" href="/learn?stage=pretest&student=A">開啟學生前測</a><a className="button" href="/teach">進入教師授課</a></>}</div>{!published && <p>先按「發布到本機 Demo」，前測與授課頁才會讀取這份課程。</p>}</section>}
    </main>
    <PageFooter />
  </div>;
}
