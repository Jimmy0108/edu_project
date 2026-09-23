"use client";

import { useEffect, useState } from "react";
import { BrandHeader, PageFooter, StatusPill } from "../ui";
import { confirmEntireLesson, hasPrerequisiteCycle, lessonReady, migrateLessonPackage, PHISHING_SAMPLE_MATERIALS, validateLessonPackage, type KnowledgeEdge, type LessonPackage, type SupportProfile } from "@/lib/lesson";
import { loadLesson, saveLesson } from "@/lib/lesson-store";
import { parseMaterial, type Material } from "@/lib/materials";

type BooleanSupportKey = Exclude<keyof SupportProfile, "reading">;
const supportLabels: Record<BooleanSupportKey, string> = {
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
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

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

  function setConfirmed(section: "slides" | "nodes" | "questions" | "cards", id: string, checked: boolean) {
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
    try { const value = migrateLessonPackage(JSON.parse(await file.text())); if (!value) throw new Error("課程包格式不正確。"); setLesson(value); setPublished(false); setTitle(value.title); setGrade(value.grade); setObjective(value.objective); setMaterials(value.materials); setStep(4); setNotice("已載入課程備援包，請再次檢查後發布。"); }
    catch (error) { setNotice(error instanceof Error ? error.message : "無法載入課程包。"); }
  }

  const validMaterialIds = new Set(lesson?.materials.map(item => item.id) || []);
  const validNodeIds = new Set(lesson?.nodes.map(item => item.id) || []);
  const graphIssues = !lesson ? ["尚未建立圖譜"] : [
    ...(new Set(lesson.nodes.map(node => node.id)).size !== lesson.nodes.length ? ["概念節點 ID 重複"] : []),
    ...(lesson.nodes.some(node => !node.label.trim() || !node.description.trim()) ? ["節點名稱或說明不可空白"] : []),
    ...(hasPrerequisiteCycle(lesson.nodes, lesson.edges) ? ["先備關係形成循環"] : []),
    ...(lesson.nodes.some(node => !node.sourceIds.length || node.sourceIds.some(id => !validMaterialIds.has(id))) ? ["節點含無效來源"] : []),
    ...(lesson.edges.some(edge => edge.from === edge.to || !edge.reason.trim() || !validNodeIds.has(edge.from) || !validNodeIds.has(edge.to) || !edge.sourceIds.length || edge.sourceIds.some(id => !validMaterialIds.has(id))) ? ["關係含自我連線、空白理由、無效節點或來源"] : []),
  ];
  const contentIssues = !lesson ? ["尚未建立教學內容"] : [
    ...(lesson.slides.some(slide => !slide.title.trim() || !slide.body.length || slide.body.some(line => !line.trim()) || !slide.conceptIds.length || slide.conceptIds.some(id => !validNodeIds.has(id)) || !slide.sourceIds.length || slide.sourceIds.some(id => !validMaterialIds.has(id))) ? ["教學頁面含空白內容、無效概念或來源"] : []),
    ...(lesson.questions.some(question => !question.prompt.trim() || !question.feedback.trim() || question.options.length < 2 || question.options.some(option => !option.trim()) || question.correctIndex < 0 || question.correctIndex >= question.options.length || !question.conceptIds.length || question.conceptIds.some(id => !validNodeIds.has(id)) || !question.sourceIds.length || question.sourceIds.some(id => !validMaterialIds.has(id))) ? ["診斷題含空白欄位、無效答案、概念或來源"] : []),
    ...(lesson.cards.some(card => !card.title.trim() || !card.baseText.trim() || !card.simplifiedText.trim() || !card.focusSteps.length || card.focusSteps.some(stepText => !stepText.trim()) || !card.keywords.length || !card.advancedPrompt.trim() || !validNodeIds.has(card.conceptId) || !card.sourceIds.length || card.sourceIds.some(id => !validMaterialIds.has(id))) ? ["支援卡含空白欄位、無效概念或來源"] : []),
  ];
  const graphConfirmed = !!lesson && lesson.nodes.every(item => item.teacherConfirmed) && lesson.edges.every(item => item.teacherConfirmed);
  const teachingConfirmed = !!lesson && lesson.slides.every(item => item.teacherConfirmed) && lesson.questions.every(item => item.teacherConfirmed) && lesson.cards.every(item => item.teacherConfirmed);

  function updateNode(id: string, patch: Partial<LessonPackage["nodes"][number]>) {
    if (!lesson) return;
    setPublished(false); setLesson({ ...lesson, nodes: lesson.nodes.map(node => node.id === id ? { ...node, ...patch, teacherConfirmed: false } : node) });
  }

  function removeNode(id: string) {
    if (!lesson || lesson.nodes.length <= 3) return;
    setPublished(false); setSelectedNodeId(null); setLesson({ ...lesson,
      nodes: lesson.nodes.filter(node => node.id !== id), edges: lesson.edges.filter(edge => edge.from !== id && edge.to !== id),
      questions: lesson.questions.map(question => ({ ...question, conceptIds: question.conceptIds.filter(value => value !== id), teacherConfirmed: false })).filter(question => question.conceptIds.length),
      cards: lesson.cards.filter(card => card.conceptId !== id), slides: lesson.slides.map(slide => ({ ...slide, conceptIds: slide.conceptIds.filter(value => value !== id), teacherConfirmed: false })),
    });
  }

  function addEdge() {
    if (!lesson || lesson.nodes.length < 2 || lesson.edges.length >= 18) return;
    const edge: KnowledgeEdge = { from: lesson.nodes[0].id, to: lesson.nodes[1].id, type: "related", reason: "請補充此關係的教材依據。", sourceIds: lesson.nodes[0].sourceIds.slice(0, 1), teacherConfirmed: false };
    setLesson({ ...lesson, edges: [...lesson.edges, edge] }); setPublished(false);
  }

  return <div className="site-root">
    <BrandHeader active="prepare" actions={<StatusPill tone="neutral">資料僅存於本機</StatusPill>} />
    <main className="app-shell">
      <section className="page-heading"><div><StatusPill>課前準備工作區</StatusPill><h1>先把課程準備好，課中才不需要一直等 AI。</h1><p>AI 只提出草稿；概念關係、題目、卡片與來源皆由教師確認後才可發布。</p></div><label className="file-button compact">載入備援課程包<input type="file" accept=".json" onChange={event => { void restore(event.target.files?.[0]); event.target.value = ""; }} /></label></section>
      <ol className="stepper" aria-label="課前準備進度">{["教材與目標", "知識圖譜", "前測與支援", "發布預覽"].map((label, index) => <li key={label} className={step === index + 1 ? "active" : step > index + 1 ? "done" : ""}><button onClick={() => setStep(index + 1)} disabled={index > 0 && !lesson}><b>{index + 1}</b><span>{label}</span></button></li>)}</ol>
      <p className="notice" role="status">{notice}</p>

      {step === 1 && <div className="prepare-grid"><section className="panel"><header className="panel-title"><div><span>STEP 1</span><h2>課程目標與教材</h2></div><StatusPill tone="neutral">原始檔不離開瀏覽器</StatusPill></header>
        <div className="form-grid"><label>課程名稱<input value={title} maxLength={200} onChange={event => { setTitle(event.target.value); setLesson(null); }} /></label><label>適用年級<input value={grade} maxLength={100} onChange={event => { setGrade(event.target.value); setLesson(null); }} /></label><label className="full">教學目標<textarea value={objective} maxLength={500} onChange={event => { setObjective(event.target.value); setLesson(null); }} /></label></div>
        <div className="upload-zone"><strong>選擇準備方式</strong><p>自訂教材支援 DOCX、PPTX、TXT、Markdown；圖片式內容需另外提供文字。競賽現場可直接使用已查核的快速展示包。</p><div className="path-choice"><label className="file-button"><span><b>自訂教材</b><small>從自己的教案與簡報開始</small></span><input type="file" multiple accept=".docx,.pptx,.txt,.md" onChange={event => { void upload(event.target.files); event.target.value = ""; }} /></label><button className="demo-path" onClick={() => { setMaterials(PHISHING_SAMPLE_MATERIALS.map(item => ({ ...item, confirmed: true }))); setLesson(null); setNotice("已載入並核對競賽用資安微課；可直接建立草稿，現場不需要等待外部知識搜尋。"); }}><span><b>快速展示</b><small>載入已查核資安微課</small></span></button></div></div>
      </section><aside className="panel evidence-note"><h2>外部知識如何使用？</h2><p>Demo 只預載官方網站的教學摘要與網址，不在課堂現場爬網，也不複製整篇內容。</p><ul><li>外部來源會標記查核日期。</li><li>仍須與教師教材一起核對。</li><li>來源不足的關係不強行建立。</li></ul></aside></div>}

      {step === 1 && materials.length > 0 && <section className="panel material-review"><header className="panel-title"><div><span>來源核對</span><h2>{materials.length} 段可用內容</h2></div><button onClick={() => setMaterials(items => items.map(item => ({ ...item, confirmed: true })))}>全部標記為已核對</button></header><div className="material-table">{materials.map(item => <article key={item.id}><label><input type="checkbox" checked={item.confirmed} onChange={event => { setMaterials(items => items.map(value => value.id === item.id ? { ...value, confirmed: event.target.checked } : value)); setLesson(null); }} /><span><b>{item.location}</b><small>{item.file} · {item.sourceKind === "official-reference" ? `官方參考 · 查核 ${item.verifiedAt}` : "教師教材"}</small></span></label><p>{item.text}</p>{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer">查看官方來源 ↗</a>}</article>)}</div><div className="panel-actions"><button className="primary" disabled={busy || !materials.some(item => item.confirmed)} onClick={() => void prepareLesson()}>{busy ? "建立草稿中…" : "依已確認內容建立知識圖譜"}</button></div></section>}

      {step === 2 && lesson && <section className="panel graph-workspace"><header className="panel-title"><div><span>STEP 2</span><h2>教師核對並編輯知識圖譜</h2></div><button disabled={graphIssues.length > 0} onClick={() => { setPublished(false); setLesson({ ...lesson, nodes: lesson.nodes.map(item => ({ ...item, teacherConfirmed: true })), edges: lesson.edges.map(item => ({ ...item, teacherConfirmed: true })) }); }}>我已檢查本頁無警告</button></header><p className="section-intro">箭頭表示左側概念是右側概念的先備；點擊節點可修改。只有教材可證明的關係才應保留。</p>
        <div className="graph-status" role="status">{graphIssues.length ? graphIssues.map(issue => <span key={issue}>⚠ {issue}</span>) : <span className="ok">✓ 圖譜結構與來源檢查通過</span>}</div>
        <svg className="knowledge-graph" viewBox="0 0 900 380" role="img" aria-label="課程概念知識圖譜">
          <defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker></defs>
          {lesson.edges.map((edge, index) => { const from = lesson.nodes.findIndex(node => node.id === edge.from), to = lesson.nodes.findIndex(node => node.id === edge.to); if (from < 0 || to < 0) return null; const point = (value: number) => ({ x: 112 + (value % 4) * 220, y: 62 + Math.floor(value / 4) * 120 }); const a = point(from), b = point(to); return <line key={`${edge.from}-${edge.to}-${index}`} x1={a.x} y1={a.y + 24} x2={b.x} y2={b.y - 24} className={edge.type} markerEnd="url(#arrow)" />; })}
          {lesson.nodes.map((node, index) => { const x = 20 + (index % 4) * 220, y = 34 + Math.floor(index / 4) * 120; return <g key={node.id} className={`graph-node ${selectedNodeId === node.id ? "selected" : ""} ${node.teacherConfirmed ? "confirmed" : ""}`} role="button" tabIndex={0} onClick={() => setSelectedNodeId(node.id)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") setSelectedNodeId(node.id); }}><rect x={x} y={y} width="184" height="56" rx="12" /><text x={x + 14} y={y + 25}>{node.label.slice(0, 12)}</text><text className="graph-node-status" x={x + 14} y={y + 43}>{node.teacherConfirmed ? "教師已確認" : "待確認與編輯"}</text></g>; })}
        </svg>
        {selectedNodeId && (() => { const node = lesson.nodes.find(item => item.id === selectedNodeId); if (!node) return null; return <section className="node-editor"><header><div><small>編輯概念節點</small><h3>{node.label}</h3></div><button title={lesson.nodes.length <= 3 ? "至少保留三個概念，才能建立三題前測" : "刪除節點"} disabled={lesson.nodes.length <= 3} onClick={() => removeNode(node.id)}>刪除節點</button></header><div className="form-grid"><label>名稱<input value={node.label} onChange={event => updateNode(node.id, { label: event.target.value })} /></label><label>別名（以逗號分隔）<input value={node.aliases.join("、")} onChange={event => updateNode(node.id, { aliases: event.target.value.split(/[、,，]/).map(value => value.trim()).filter(Boolean).slice(0, 8) })} /></label><label className="full">說明<textarea value={node.description} onChange={event => updateNode(node.id, { description: event.target.value })} /></label><fieldset className="full source-picker"><legend>教材來源</legend>{lesson.materials.map(item => <label key={item.id}><input type="checkbox" checked={node.sourceIds.includes(item.id)} onChange={event => updateNode(node.id, { sourceIds: event.target.checked ? [...node.sourceIds, item.id].slice(0, 5) : node.sourceIds.filter(id => id !== item.id) })} />{item.location}</label>)}</fieldset></div><label className="confirm-row"><input type="checkbox" checked={node.teacherConfirmed} onChange={event => setConfirmed("nodes", node.id, event.target.checked)} />我已核對此節點與來源</label></section>; })()}
        <div className="edge-list edge-editor"><div className="subsection-head"><h3>概念關係</h3><button disabled={lesson.edges.length >= 18} onClick={addEdge}>新增關係</button></div>{lesson.edges.map((edge, edgeIndex) => <article key={`${edge.from}-${edge.to}-${edgeIndex}`}><input aria-label="確認關係" type="checkbox" checked={edge.teacherConfirmed} onChange={event => { setPublished(false); setLesson({ ...lesson, edges: lesson.edges.map((item, index) => index === edgeIndex ? { ...item, teacherConfirmed: event.target.checked } : item) }); }} /><select aria-label="起點概念" value={edge.from} onChange={event => setLesson({ ...lesson, edges: lesson.edges.map((item, index) => index === edgeIndex ? { ...item, from: event.target.value, teacherConfirmed: false } : item) })}>{lesson.nodes.map(node => <option key={node.id} value={node.id}>{node.label}</option>)}</select><select aria-label="關係類型" value={edge.type} onChange={event => setLesson({ ...lesson, edges: lesson.edges.map((item, index) => index === edgeIndex ? { ...item, type: event.target.value as KnowledgeEdge["type"], teacherConfirmed: false } : item) })}><option value="prerequisite">先備於</option><option value="part_of">組成</option><option value="related">相關</option></select><select aria-label="終點概念" value={edge.to} onChange={event => setLesson({ ...lesson, edges: lesson.edges.map((item, index) => index === edgeIndex ? { ...item, to: event.target.value, teacherConfirmed: false } : item) })}>{lesson.nodes.map(node => <option key={node.id} value={node.id}>{node.label}</option>)}</select><input aria-label="關係理由" value={edge.reason} onChange={event => setLesson({ ...lesson, edges: lesson.edges.map((item, index) => index === edgeIndex ? { ...item, reason: event.target.value, teacherConfirmed: false } : item) })} /><select aria-label="關係來源" value={edge.sourceIds[0] || ""} onChange={event => setLesson({ ...lesson, edges: lesson.edges.map((item, index) => index === edgeIndex ? { ...item, sourceIds: [event.target.value], teacherConfirmed: false } : item) })}>{lesson.materials.map(material => <option key={material.id} value={material.id}>{material.location}</option>)}</select><button aria-label="刪除關係" onClick={() => setLesson({ ...lesson, edges: lesson.edges.filter((_, index) => index !== edgeIndex) })}>刪除</button></article>)}</div>
        <div className="panel-actions"><button disabled={!graphConfirmed || graphIssues.length > 0} className="primary" onClick={() => setStep(3)}>圖譜核對完成，準備前測</button></div>
      </section>}

      {step === 3 && lesson && <div className="review-columns"><section className="panel"><header className="panel-title"><div><span>STEP 3A</span><h2>診斷題與支援卡</h2></div><button disabled={contentIssues.length > 0} onClick={() => { setPublished(false); setLesson({ ...lesson, slides: lesson.slides.map(item => ({ ...item, teacherConfirmed: true })), questions: lesson.questions.map(item => ({ ...item, teacherConfirmed: true })), cards: lesson.cards.map(item => ({ ...item, teacherConfirmed: true })) }); }}>我已檢查本頁無警告</button></header>
        <div className="graph-status" role="status">{contentIssues.length ? contentIssues.map(issue => <span key={issue}>⚠ {issue}</span>) : <span className="ok">✓ 教學頁面、題目、卡片與來源檢查通過</span>}</div>
        <div className="slide-review"><h3>教學檢視頁面</h3><p>這是依教材文字建立的無障礙教學檢視，不宣稱完整還原原始簡報版面。</p>{lesson.slides.map(slide => <article key={slide.id}><label><input type="checkbox" checked={slide.teacherConfirmed} onChange={event => setConfirmed("slides", slide.id, event.target.checked)} />第 {slide.order} 頁</label><input value={slide.title} onChange={event => setLesson({ ...lesson, slides: lesson.slides.map(item => item.id === slide.id ? { ...item, title: event.target.value, teacherConfirmed: false } : item) })} /><textarea value={slide.body.join("\n")} onChange={event => setLesson({ ...lesson, slides: lesson.slides.map(item => item.id === slide.id ? { ...item, body: event.target.value.split("\n").filter(Boolean).slice(0, 12), teacherConfirmed: false } : item) })} /></article>)}</div>
        <div className="question-review">{lesson.questions.map((question, index) => <article key={question.id}><label><input type="checkbox" checked={question.teacherConfirmed} onChange={event => setConfirmed("questions", question.id, event.target.checked)} /><b>題目 {index + 1}</b></label><input value={question.prompt} onChange={event => setLesson({ ...lesson, questions: lesson.questions.map(item => item.id === question.id ? { ...item, prompt: event.target.value, teacherConfirmed: false } : item) })} />{question.options.map((option, optionIndex) => <label className={`option-editor ${optionIndex === question.correctIndex ? "correct" : ""}`} key={`${question.id}-${optionIndex}`}><input type="radio" name={`correct-${question.id}`} checked={optionIndex === question.correctIndex} onChange={() => setLesson({ ...lesson, questions: lesson.questions.map(item => item.id === question.id ? { ...item, correctIndex: optionIndex, teacherConfirmed: false } : item) })} /><input value={option} onChange={event => setLesson({ ...lesson, questions: lesson.questions.map(item => item.id === question.id ? { ...item, options: item.options.map((value, itemIndex) => itemIndex === optionIndex ? event.target.value : value), teacherConfirmed: false } : item) })} /></label>)}<textarea value={question.feedback} onChange={event => setLesson({ ...lesson, questions: lesson.questions.map(item => item.id === question.id ? { ...item, feedback: event.target.value, teacherConfirmed: false } : item) })} /><div className="compact-edit"><label>對應概念<select value={question.conceptIds[0]} onChange={event => setLesson({ ...lesson, questions: lesson.questions.map(item => item.id === question.id ? { ...item, conceptIds: [event.target.value], teacherConfirmed: false } : item) })}>{lesson.nodes.map(node => <option key={node.id} value={node.id}>{node.label}</option>)}</select></label><details><summary>編輯題目來源（{question.sourceIds.length}）</summary><div className="source-picker">{lesson.materials.map(material => <label key={material.id}><input type="checkbox" checked={question.sourceIds.includes(material.id)} onChange={event => setLesson({ ...lesson, questions: lesson.questions.map(item => item.id === question.id ? { ...item, sourceIds: event.target.checked ? [...item.sourceIds, material.id].slice(0, 5) : item.sourceIds.filter(id => id !== material.id), teacherConfirmed: false } : item) })} />{material.location}</label>)}</div></details></div></article>)}</div>
        <div className="card-review"><h3>預先生成的鷹架卡</h3>{lesson.cards.map(card => <article key={card.id}><label><input type="checkbox" checked={card.teacherConfirmed} onChange={event => setConfirmed("cards", card.id, event.target.checked)} /><input aria-label="卡片標題" value={card.title} onChange={event => setLesson({ ...lesson, cards: lesson.cards.map(item => item.id === card.id ? { ...item, title: event.target.value, teacherConfirmed: false } : item) })} /></label><label>一般說明<textarea value={card.baseText} onChange={event => setLesson({ ...lesson, cards: lesson.cards.map(item => item.id === card.id ? { ...item, baseText: event.target.value, teacherConfirmed: false } : item) })} /></label><label>白話短句<textarea value={card.simplifiedText} onChange={event => setLesson({ ...lesson, cards: lesson.cards.map(item => item.id === card.id ? { ...item, simplifiedText: event.target.value, teacherConfirmed: false } : item) })} /></label><label>一次一步<textarea value={card.focusSteps.join("\n")} onChange={event => setLesson({ ...lesson, cards: lesson.cards.map(item => item.id === card.id ? { ...item, focusSteps: event.target.value.split("\n").filter(Boolean).slice(0, 4), teacherConfirmed: false } : item) })} /></label><label>關鍵詞（以逗號分隔）<input value={card.keywords.join("、")} onChange={event => setLesson({ ...lesson, cards: lesson.cards.map(item => item.id === card.id ? { ...item, keywords: event.target.value.split(/[、,，]/).map(value => value.trim()).filter(Boolean).slice(0, 6), teacherConfirmed: false } : item) })} /></label><label>進階挑戰<textarea value={card.advancedPrompt} onChange={event => setLesson({ ...lesson, cards: lesson.cards.map(item => item.id === card.id ? { ...item, advancedPrompt: event.target.value, teacherConfirmed: false } : item) })} /></label><details><summary>編輯卡片來源（{card.sourceIds.length}）</summary><div className="source-picker">{lesson.materials.map(material => <label key={material.id}><input type="checkbox" checked={card.sourceIds.includes(material.id)} onChange={event => setLesson({ ...lesson, cards: lesson.cards.map(item => item.id === card.id ? { ...item, sourceIds: event.target.checked ? [...item.sourceIds, material.id].slice(0, 5) : item.sourceIds.filter(id => id !== material.id), teacherConfirmed: false } : item) })} />{material.location}</label>)}</div></details></article>)}</div>
      </section><aside className="panel"><header className="panel-title"><div><span>STEP 3B</span><h2>匿名支援設定</h2></div></header><p>介面只記錄所需功能，不儲存 ADHD、聽障或其他診斷名稱。</p>{lesson.profiles.map(profile => <article className="profile-card" key={profile.id}><h3>{profile.displayName}</h3><div>{(Object.keys(supportLabels) as BooleanSupportKey[]).map(key => <label key={key}><input type="checkbox" checked={profile.support[key]} onChange={event => { setPublished(false); setLesson({ ...lesson, profiles: lesson.profiles.map(item => item.id === profile.id ? { ...item, support: { ...item.support, [key]: event.target.checked } } : item) }); }} />{supportLabels[key]}</label>)}</div><small>閱讀顯示預設：100% 字級、標準行距；學生可私下調整。</small></article>)}<p className="privacy-note">學生進入自己的頁面後仍可私下覆寫這些設定，其他同學不會看到。</p></aside><div className="panel-actions wide"><button className="primary" disabled={!graphConfirmed || !teachingConfirmed || graphIssues.length > 0 || contentIssues.length > 0} onClick={() => { setPublished(false); setLesson(confirmEntireLesson(lesson)); setStep(4); }}>教學內容確認完成</button></div></div>}

      {step === 4 && lesson && <section className="publish-card"><StatusPill>{published ? "已發布" : lessonReady(lesson) && validateLessonPackage(lesson) ? "可發布" : "仍有待確認內容"}</StatusPill><h2>{lesson.title}</h2><p>{lesson.objective}</p><div className="publish-metrics"><div><b>{lesson.slides.length}</b><span>教學頁面</span></div><div><b>{lesson.nodes.length}</b><span>概念節點</span></div><div><b>{lesson.edges.length}</b><span>概念關係</span></div><div><b>{lesson.questions.length}</b><span>診斷題</span></div><div><b>{lesson.cards.length}</b><span>支援卡</span></div></div><div className="source-coverage"><b>來源覆蓋檢查</b><span>{lesson.nodes.every(node => node.sourceIds.length > 0) && lesson.cards.every(card => card.sourceIds.length > 0) && lesson.slides.every(slide => slide.sourceIds.length > 0) ? "教學頁面、概念與卡片均有來源" : "有內容缺少來源"}</span></div>{[...graphIssues, ...contentIssues].length > 0 && <div className="graph-status" role="alert">{[...graphIssues, ...contentIssues].map(issue => <span key={issue}>⚠ {issue}</span>)}</div>}<div className="truth-note">AI 只提出草稿；教師已核准後，課中只選取這些內容。此流程降低但不能完全消除 AI 錯誤。</div><div className="hero-actions"><button className="primary" disabled={!lessonReady(lesson) || !validateLessonPackage(lesson)} onClick={publish}>{published ? "重新發布最新設定" : "發布到本機 Demo"}</button><button onClick={() => download(lesson)}>匯出離線備援</button>{published && <><a className="button" href="/learn?stage=pretest&student=A">開啟學生前測</a><a className="button" href="/teach">進入教師授課</a></>}</div>{!published && <p>先按「發布到本機 Demo」，前測與授課頁才會讀取這份課程。</p>}</section>}
    </main>
    <PageFooter />
  </div>;
}
