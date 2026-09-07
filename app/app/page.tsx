"use client";

import { useEffect, useRef, useState } from "react";
import { demoScaffold, validScaffold, type ScaffoldResponse } from "@/lib/classroom";
import { parseMaterial, retrieve, validateMaterials, type Material } from "@/lib/materials";
import { Microphone } from "@/app/microphone";

type View = "teacher" | "visual" | "reading" | "focus";
type Result = ScaffoldResponse & { provider: string; sourceIds: string[]; retrieved: Material[]; aiError?: string };
type Frame = { transcript: string; result: Result | null; title: string };
const views: { id: View; label: string }[] = [{ id: "teacher", label: "教師主控台" }, { id: "visual", label: "學生：視覺重點" }, { id: "reading", label: "學生：閱讀鷹架" }, { id: "focus", label: "學生：專注節奏" }];
const report = [
  ["問題與目標", "EduBridge_AI 支援融合教育課堂。教師的口語資訊可轉換為不同呈現方式，讓學生依個人偏好接收課堂內容。"],
  ["字幕優先", "ASR 是語音辨識，先把教師聲音轉成文字字幕。字幕先出現，再逐步補充 AI 鷹架；AI 整理不能取代教師原話。"],
  ["教材檢索 RAG", "RAG 先從教師確認的教材檢索相關段落，再提供給大型語言模型整理。來源包含檔名及投影片編號，讓教師能核對依據。"],
  ["三種支持方式", "視覺重點提供關鍵詞卡，閱讀鷹架提供短句，專注節奏一次呈現一個重點。三種模式共用一次生成的結果，學生自主選擇，不推斷診斷。"],
  ["驗證與限制", "本次展示是單堂課競賽原型，使用競賽報告本身作為教學教材。斷網時可載入事先匯出的展示備援；備援必須標示，不當作即時 AI 結果。"],
];
function download(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function speak(text: string) { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = "zh-TW"; u.rate = 0.85; speechSynthesis.speak(u); }
function validResult(value: unknown): value is Result {
  if (!validScaffold(value)) return false;
  const r = value as Result;
  return typeof r.provider === "string" && validateMaterials(r.retrieved) && r.retrieved.length <= 3 && Array.isArray(r.sourceIds) && r.sourceIds.length <= 3 && r.sourceIds.every(id => typeof id === "string" && r.retrieved.some(c => c.id === id));
}

export default function Home() {
  const [view, setView] = useState<View>("teacher");
  const [title, setTitle] = useState("我的競賽示範課");
  const [materials, setMaterials] = useState<Material[]>([]);
  const [draft, setDraft] = useState("");
  const [transcript, setTranscript] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [history, setHistory] = useState<Frame[]>([]);
  const [notice, setNotice] = useState("先上傳教材，檢查文字後確認，即可開始示範。");
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  const [offline, setOffline] = useState(false);
  const [preferences, setPreferences] = useState(false);
  const [font, setFont] = useState(18);
  const [contrast, setContrast] = useState(false);
  const [lowStimulus, setLowStimulus] = useState(false);
  const [focus, setFocus] = useState(0);
  const [heldFrame, setHeldFrame] = useState<Frame | null>(null);
  const [receiver, setReceiver] = useState(false);
  const [room, setRoom] = useState("");
  const [help, setHelp] = useState(false);
  const [preferenceReady, setPreferenceReady] = useState(false);
  const channel = useRef<BroadcastChannel | null>(null);
  const requestId = useRef(0);
  const inFlight = useRef<AbortController | null>(null);
  const snapshot = useRef<Frame>({ transcript: "", result: null, title: "" });
  const cache = useRef(new Map<string, Result>());

  useEffect(() => {
    const params = new URLSearchParams(location.search); const mode = params.get("view");
    // Browser-only URL/preferences are hydrated after SSR; the server cannot read them.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (mode === "visual" || mode === "reading" || mode === "focus") { setView(mode); setReceiver(true); }
    setRoom(params.get("room") || crypto.randomUUID());
    try { const p = JSON.parse(localStorage.getItem("edubridge-preferences") || "{}"); if ([18, 22, 26].includes(p.font)) setFont(p.font); setContrast(p.contrast === true); setLowStimulus(p.lowStimulus === true); } catch { /* Keep defaults. */ }
    setPreferenceReady(true);
  }, []);
  useEffect(() => { if (preferenceReady) { try { localStorage.setItem("edubridge-preferences", JSON.stringify({ font, contrast, lowStimulus })); } catch { /* In-memory preferences remain usable. */ } } }, [font, contrast, lowStimulus, preferenceReady]);
  useEffect(() => {
    if (!room || typeof BroadcastChannel === "undefined") return;
    const c = new BroadcastChannel("edubridge-" + room); channel.current = c;
    c.onmessage = event => {
      const m = event.data;
      if (!receiver && m?.type === "request") c.postMessage({ type: "frame", frame: snapshot.current });
      if (!receiver && m?.type === "help") setHelp(true);
      if (receiver && m?.type === "frame" && typeof m.frame?.transcript === "string" && typeof m.frame?.title === "string" && (m.frame.result === null || validResult(m.frame.result))) { setTranscript(m.frame.transcript); setResult(m.frame.result); setTitle(m.frame.title); setFocus(0); }
    };
    if (receiver) c.postMessage({ type: "request" });
    return () => { c.close(); channel.current = null; };
  }, [room, receiver]);
  useEffect(() => { snapshot.current = { transcript, result, title }; if (!receiver) channel.current?.postMessage({ type: "frame", frame: snapshot.current }); }, [transcript, result, title, receiver]);
  useEffect(() => () => inFlight.current?.abort(), []);

  function invalidate() { requestId.current++; inFlight.current?.abort(); cache.current.clear(); setBusy(false); setResult(null); setHeldFrame(null); }
  async function upload(files: FileList | null) {
    if (!files) return; setNotice("正在解析教材文字…");
    try {
      const added = (await Promise.all(Array.from(files).map(parseMaterial))).flat();
      if (materials.length + added.length > 200) throw new Error("本堂課最多 200 段教材。");
      invalidate(); setMaterials(old => [...old, ...added]); setNotice(`已解析 ${added.length} 段，請核對順序、文字及來源後確認。圖片、動畫與講者備註不會自動擷取。`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "教材解析失敗"); }
  }
  function sample() {
    invalidate(); setTitle("EduBridge_AI：競賽報告就是教學現場");
    setMaterials(report.map(([heading, text], i) => ({ id: "report-" + i, file: "內建報告示例（請以正式簡報替換）", location: `投影片 ${i + 1}：${heading}`, text, confirmed: false })));
    setDraft(report[2][1]); setNotice("已載入報告示例，請先確認教材。示例敘述仍需配合實際測試結果調整。");
  }
  async function generate(text: string) {
    const clean = text.trim().slice(0, 2000); if (!clean) return;
    const id = ++requestId.current; inFlight.current?.abort(); setTranscript(clean); setResult(null); setFocus(0); setBusy(false);
    if (paused) { setNotice("字幕已更新，AI 輔助暫停中。"); return; }
    const confirmed = materials.filter(c => c.confirmed); const key = JSON.stringify([clean, confirmed, offline]);
    const accept = (r: Result) => { if (id !== requestId.current) return; setResult(r); setHistory(h => [...h.slice(-29), { transcript: clean, result: r, title }]); cache.current.set(key, r); if (cache.current.size > 30) cache.current.delete(cache.current.keys().next().value!); setNotice(r.aiError || (r.provider === "groq" ? "AI 鷹架已更新，請核對內容及引用。" : "本地原文分句備援已更新，未使用生成式 AI。")); };
    if (cache.current.has(key)) { accept(cache.current.get(key)!); return; }
    if (offline) { accept({ ...demoScaffold(clean), provider: "demo", retrieved: retrieve(clean, confirmed), sourceIds: [] }); return; }
    setBusy(true); const controller = new AbortController(); inFlight.current = controller; const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch("/api/scaffold", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transcript: clean, materials: confirmed }), signal: controller.signal });
      const data = await response.json(); if (!response.ok || !validResult(data)) throw new Error(data.error || "AI 輸出格式不正確"); accept(data);
    } catch { if (id === requestId.current) accept({ ...demoScaffold(clean), provider: "demo", retrieved: retrieve(clean, confirmed), sourceIds: [], aiError: "連線失敗或逾時，已保留字幕並使用原文分句備援。" }); }
    finally { clearTimeout(timeout); if (id === requestId.current) setBusy(false); }
  }
  async function restore(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("備援檔案上限 5 MB");
      const data = JSON.parse(await file.text());
      if (data.version !== 1 || typeof data.title !== "string" || data.title.length > 200 || !validateMaterials(data.materials) || !Array.isArray(data.frames) || data.frames.length > 30 || !data.frames.every((f: Frame) => f && typeof f.transcript === "string" && f.transcript.length <= 2000 && typeof f.title === "string" && f.title.length <= 200 && validResult(f.result))) throw new Error("備援格式不正確");
      invalidate(); setTitle(data.title); setMaterials(data.materials); setHistory(data.frames); setTranscript(""); setOffline(true); setNotice("已載入備援，請選擇一段已儲存結果播放。");
    } catch (e) { setNotice(e instanceof Error ? e.message : "無法載入備援"); }
  }
  function replay(f: Frame) { invalidate(); setTranscript(f.transcript); setResult(f.result ? { ...f.result, provider: "replay", sourceNotice: "事先儲存的展示備援，並非現場 AI 生成。" } : null); setFocus(0); setNotice("正在播放事先儲存的結果。"); }
  const shown = heldFrame || { transcript, result, title }; const r = shown.result;
  const ready = materials.some(c => c.confirmed); const confirmedCount = materials.filter(c => c.confirmed).length;
  return <div className={`site-root demo-app ${contrast ? "high-contrast" : ""} ${lowStimulus ? "low-stimulus" : ""}`} style={{ "--reading-size": font + "px" } as React.CSSProperties}>
    <header className="site-header"><div className="logo"><b aria-hidden="true">⌁</b><span><strong>EduBridge</strong> AI<small>課堂即時認知鷹架</small></span></div><nav aria-label="系統模式">{views.filter(v => !receiver || v.id !== "teacher").map(v => <button key={v.id} aria-current={view === v.id ? "page" : undefined} className={view === v.id ? "active" : ""} onClick={() => setView(v.id)}>{v.label}</button>)}</nav><button onClick={() => setPreferences(!preferences)} aria-expanded={preferences}>閱讀偏好</button></header>
    {preferences && <section className="preferences card"><label>文字大小 <select value={font} onChange={e => setFont(Number(e.target.value))}><option value={18}>標準</option><option value={22}>大字</option><option value={26}>特大</option></select></label><label><input type="checkbox" checked={contrast} onChange={e => setContrast(e.target.checked)} />高對比／非色彩提示</label><label><input type="checkbox" checked={lowStimulus} onChange={e => setLowStimulus(e.target.checked)} />低干擾、減少動畫</label><small>僅保存本機呈現偏好，不記錄診斷。</small></section>}
    <main className="page-shell"><section className="lesson-bar"><div><span className="eyebrow">單堂課競賽 Demo · 用報告內容示範教學</span><h1>{title}</h1></div><span className="chip">{receiver ? "同瀏覽器分頁接收端" : `${confirmedCount} 段教材已確認`}</span></section><p className="notice" role="status">{receiver ? "等待教師分頁同步；請保持教師頁開啟。" : notice}</p>
      {view === "teacher" && <><div className="teacher-grid"><section className="card"><h2>1．準備這堂課的教材</h2><label className="field">課程名稱<input value={title} maxLength={200} onChange={e => setTitle(e.target.value)} /></label><div className="toolbar"><label className="file-button">上傳 Word／PowerPoint<input aria-label="上傳教材" type="file" accept=".docx,.pptx,.txt,.md" multiple onChange={e => { void upload(e.target.files); e.target.value = ""; }} /></label><button onClick={sample}>載入競賽報告示例</button></div><p>支援 DOCX、PPTX、TXT、MD，每份 10 MB。原檔在本機解析；生成時僅將檢索到的文字送往 AI。課堂暫存在本頁，關閉前請匯出備援。</p><details open={materials.length > 0}><summary>檢查與修正教材（{materials.length} 段）</summary><div className="material-list">{materials.map(c => <article key={c.id}><strong>{c.file} · {c.location}</strong><textarea aria-label={`${c.location} 教材文字`} maxLength={2000} value={c.text} onChange={e => { invalidate(); setMaterials(ms => ms.map(m => m.id === c.id ? { ...m, text: e.target.value, confirmed: false } : m)); }} /><label><input type="checkbox" checked={c.confirmed} disabled={!c.text.trim()} onChange={e => { invalidate(); setMaterials(ms => ms.map(m => m.id === c.id ? { ...m, confirmed: e.target.checked } : m)); }} />已核對，可用於本堂課</label><button onClick={() => { invalidate(); setMaterials(ms => ms.filter(m => m.id !== c.id)); }}>移除</button></article>)}</div></details><button disabled={!materials.length} onClick={() => { invalidate(); setMaterials(ms => ms.map(m => ({ ...m, confirmed: !!m.text.trim() }))); setNotice("教材已確認，可貼上講稿或啟動麥克風。"); }}>我已檢查全部教材，確認使用</button></section>
      <aside className="teacher-rail"><section className="card"><h2>展示方式</h2><p>同一段報告，同步呈現原文與三種支援方式。</p>{views.slice(1).map(v => <a className="student-link" key={v.id} href={`?view=${v.id}&room=${room}`} target="_blank" rel="noreferrer">另開 {v.label} ↗</a>)}<small>分頁同步限同一瀏覽器、同一網站；跨裝置教室连線尚未提供。</small></section><section className="card backup"><h2>現場備援</h2><label><input type="checkbox" checked={offline} onChange={e => { invalidate(); setOffline(e.target.checked); }} />使用本地原文分句（不呼叫 AI）</label><button onClick={() => download("edubridge-demo-backup.json", { version: 1, title, materials, frames: history })}>匯出教材與已生成結果</button><label className="file-button">載入備援 JSON<input aria-label="載入備援" type="file" accept=".json" onChange={e => { void restore(e.target.files?.[0]); e.target.value = ""; }} /></label><p>匯出檔包含教材及字幕，請保存在自己的裝置。</p></section>{help && <section className="card" role="status"><h2>有學生需要協助</h2><button onClick={() => setHelp(false)}>已收到</button></section>}</aside></div>
      <section className="card report-input"><h2>2．開始講解你的競賽報告</h2><label className="field">講稿／手動字幕<textarea maxLength={2000} value={draft} onChange={e => setDraft(e.target.value)} placeholder="輸入你正在講解的一段內容，也可使用麥克風。" /></label><div className="toolbar"><button className="primary" disabled={!ready || !draft.trim() || busy} onClick={() => void generate(draft)}>{busy ? "整理中…" : "送出本段，更新學生端"}</button><button onClick={() => { invalidate(); setPaused(!paused); }}>{paused ? "恢復 AI 輔助" : "暫停 AI，僅更新字幕"}</button></div></section></>}
      {!receiver && <div className="action-bar"><Microphone disabled={!ready} onText={text => { setDraft(text); void generate(text); }} /></div>}
      <section className="transcript-panel" aria-label="教師原始字幕"><div className="panel-line"><strong>教師原始字幕</strong><span>{shown.transcript ? "本段原文" : "等待授課"}</span>{view !== "teacher" && <button onClick={() => setHeldFrame(heldFrame ? null : { transcript, result, title })}>{heldFrame ? "回到最新內容" : "暫停我的畫面更新"}</button>}</div><p className="transcript">{shown.transcript || "上傳並確認教材後，開始你的報告。"}</p><small>辨識文字仍可能有誤，請由教師核對；AI 整理另外標示。</small></section>
      {r ? <><section className="student-heading"><div><span className="eyebrow">{r.provider === "groq" ? "AI 整理 · 待教師核對" : r.provider === "replay" ? "預錄結果回放" : "本地原文分句備援"}</span><h2>{r.summary}</h2></div><button onClick={() => speak(r.summary)}>朗讀本段</button></section>
      {(view === "visual" || view === "teacher") && <section className="concept-grid" aria-label="視覺重點">{r.visual.cards.map((c, i) => <article className="concept-card" key={i}><b>{i + 1}</b><span>{c.label}</span><p>{c.text}</p></article>)}</section>}
      {(view === "reading" || view === "teacher") && <section className="card scaffold-reading"><h2>{r.reading.title}</h2>{r.reading.steps.map((s, i) => <article className="reading-step" key={i}><b>{i + 1}</b><div><strong>{s.title}</strong><p>{s.text}</p></div></article>)}</section>}
      {(view === "focus" || view === "teacher") && <section className="card focus-task"><span className="eyebrow">一次專注一個重點</span><h2>{r.focus.goal}</h2>{r.focus.steps.length > 0 && <><p>第 {Math.min(focus + 1, r.focus.steps.length)} 步／共 {r.focus.steps.length} 步</p><p className="focus-current">{r.focus.steps[Math.min(focus, r.focus.steps.length - 1)]}</p><div className="toolbar"><button disabled={focus === 0} onClick={() => setFocus(Math.max(0, focus - 1))}>上一步</button><button disabled={focus >= r.focus.steps.length - 1} onClick={() => setFocus(Math.min(r.focus.steps.length - 1, focus + 1))}>我準備好，下一步</button><button onClick={() => speak(r.focus.steps[Math.min(focus, r.focus.steps.length - 1)])}>再聽一次</button></div></>}</section>}
      <section className="card sources"><h2>教材來源與核對</h2><p>{r.sourceNotice}</p><small>「AI 引用」表示模型選用該段，仍需人工核對是否有充分依據。</small>{r.retrieved.length ? r.retrieved.map(c => <details key={c.id}><summary>{c.file} · {c.location} {r.sourceIds.includes(c.id) ? "［AI 引用］" : "［檢索候選］"}</summary><p>{c.text}</p></details>) : <p>未找到足夠相關的教材段落，本段只能依字幕整理。</p>}{!receiver && <button onClick={() => { invalidate(); setNotice("已移除本段鷹架。請修正教材或字幕後重新生成。"); }}>這段整理不適合，退回字幕</button>}</section></> : <p className="empty-state">{busy ? "字幕已到達，正在整理三種鷹架…" : "尚無本段鷹架；原始字幕持續保留。"}</p>}
      {view !== "teacher" && <button className="help" onClick={() => { if (receiver) channel.current?.postMessage({ type: "help" }); else setHelp(true); }}>安靜舉手：我需要協助</button>}
      {view === "teacher" && history.length > 0 && <section className="card history"><h2>3．已完成的展示片段（最多保留 30 段）</h2>{history.map((f, i) => <button key={i} onClick={() => replay(f)}>回放 {i + 1}：{f.transcript.slice(0, 55)}</button>)}</section>}
    </main><footer><strong>EduBridge_AI</strong><span>學生自主選擇呈現偏好 · 教材、字幕與 AI 整理可核對</span><span>競賽 Demo · 2026</span></footer>
  </div>;
}
