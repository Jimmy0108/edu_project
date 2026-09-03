"use client";

import { useState } from "react";

type View = "teacher" | "visual" | "reading" | "focus";

const transcript = "收到陌生郵件時，先不要點連結或下載附件。請檢查寄件者網域、網址拼字，以及信件是否要求你立刻提供帳號或密碼。";

const concepts = [
  ["寄件者網域", "辨識關鍵", "查看 @ 後方的完整網域；不要只看寄件者顯示名稱。"],
  ["可疑網址", "風險特徵", "拼字異常、陌生縮網址或要求立刻登入，都應先停下來查證。"],
  ["緊急要求", "心理陷阱", "急迫語氣常用來催促人跳過檢查。"],
  ["帳密與附件", "安全行動", "不要在陌生頁面輸入帳密，也不要開啟未預期的附件。"],
];

const readingSteps = [
  "收到陌生郵件時，先停下來。不要急著點連結或下載附件。",
  "查看寄件者的完整 Email 網域。確認它是否真的屬於該機構。",
  "看清楚網址的拼字。不要在陌生網站輸入帳號或密碼。",
  "信件若催促你立刻處理，改由官方首頁或可信窗口查證。",
];

const focusSteps = [
  "停一下：先不點連結、不下載附件。",
  "看一看：檢查寄件者網域與網址拼字。",
  "保護帳密：不要在陌生頁面輸入資料。",
  "回報：有疑問時詢問教師或資安窗口。",
];

const navItems: { id: View; label: string }[] = [
  { id: "teacher", label: "教師主控台" },
  { id: "visual", label: "學生：視覺重點" },
  { id: "reading", label: "學生：閱讀鷹架" },
  { id: "focus", label: "學生：專注節奏" },
];

function Logo() {
  return <div className="logo"><b aria-hidden="true">⌁</b><span><strong>EduBridge</strong> AI<small>課堂即時學習支援</small></span></div>;
}

function TranscriptPanel({ compact = false }: { compact?: boolean }) {
  return <section className={"transcript-panel " + (compact ? "compact" : "")} aria-label="教師即時字幕">
    <div className="panel-line"><strong><i />即時字幕</strong><span>教師 A 講授中・本段字幕已更新</span><button type="button">展開課堂原文</button></div>
    <p className="transcript">「{transcript.slice(0, 7)}<mark className="warm">{transcript.slice(7, 18)}</mark>{transcript.slice(18, 23)}<mark>{transcript.slice(23, 28)}</mark>、<mark>{transcript.slice(29, 33)}</mark>{transcript.slice(33, 44)}<mark className="warm">{transcript.slice(44, -1)}</mark>。」</p>
    {!compact && <small>依據：目前課堂字幕。AI 卡片僅協助重組，不取代原文。</small>}
  </section>;
}

function TeacherView({ paused, onPause }: { paused: boolean; onPause: () => void }) {
  return <main className="page-shell">
    <section className="lesson-bar"><div><span className="eyebrow">課綱對應・資訊科技 8 年級單元</span><h1>釣魚郵件與可疑連結辨識</h1></div><div className="lesson-status"><span>測試教室 801</span><span>教師 A 授課中</span><span>已連線 3 台載具</span></div></section>
    <div className="teacher-grid"><div className="teacher-main">
      <section className="card"><div className="section-title"><h2>教師即時口述文字</h2><strong className="chip">收音連線中</strong></div><TranscriptPanel />
        <div className="history"><p><time>10:13:20</time>大家想想看，如果收到一封看起來很像學校發的通知信，但要求你立刻改密碼，第一步該做什麼？</p><p><time>10:12:05</time>今天我們要學習的是如何在數位世界中保護自己的個人隱私與帳號安全。</p></div>
      </section>
      <section className="card material-card"><div><span className="eyebrow">教材知識卡已載入</span><h2>本課重點：三個釣魚郵件辨識線索</h2><p>教材內容用於協助術語與課程脈絡，不作為學生診斷或自動評分依據。</p></div><button className="primary" type="button">推送教材輔助卡</button></section>
    </div><aside className="teacher-rail">
      <section className="card"><h2>單元知識卡</h2><p>已載入安全辨識規則與教師提供的範例內容。</p><div className="tags">{concepts.map(([name]) => <span key={name}>{name}</span>)}</div></section>
      <section className="card"><div className="section-title"><h2>AI 鷹架處理狀態</h2><strong className="chip">{paused ? "已暫停" : "運作中"}</strong></div><ol className="status-list"><li>字幕片段已接收</li><li>教材知識卡已比對</li><li>依支援偏好建立視覺、閱讀、專注卡片</li></ol></section>
      <section className="card"><h2>學生端模式預覽</h2>{navItems.slice(1).map((item) => <div className="mode-preview" key={item.id}><span>{item.label.replace("學生：", "")}</span><strong>1 位學生使用</strong></div>)}</section>
    </aside></div>
    <section className="action-bar"><span><i />進行中授課</span><button type="button" onClick={onPause}>{paused ? "恢復 AI 輔助" : "暫停 AI 輔助"}</button><button type="button">只顯示字幕</button><span className="spacer" /><button className="primary" type="button">廣播課堂提醒</button><button className="danger" type="button">結束課堂</button></section>
  </main>;
}

function VisualView() {
  return <main className="page-shell">
    <TranscriptPanel />
    <section className="student-heading"><div><span className="eyebrow">AI 即時語意對應</span><h1>課堂關鍵概念 <em>（視覺輔助卡）</em></h1><p>文字為主、圖像為輔；協助辨識老師語句中的核心防護詞彙。</p></div><small>依據：目前字幕＋教材知識卡</small></section>
    <section className="concept-grid">{concepts.map(([name, label, detail], index) => <article className="concept-card" key={name}><b>{index + 1}</b><span>{label}</span><h2>{name}</h2><p>{detail}</p><small>教材輔助提示</small></article>)}</section>
    <section className="comparison card"><div className="section-title"><h2>釣魚威脅 vs. 安全自保守則</h2><strong className="chip">本段老師講述重點</strong></div><div className="three-col"><article><b>可疑信件刺激</b><p>陌生寄件者、急迫語氣與未知連結，都是需要停下來檢查的線索。</p></article><article className="featured"><b>停看查</b><p>不點連結，改從官方首頁或可信管道確認資訊。</p></article><article><b>安全防護結果</b><p>保護帳號與個人資料；有疑問就回報並請求協助。</p></article></div></section>
    <section className="takeaway"><b>✦</b><p><small>本段核心重點</small>遇到要求立刻點連結、填密碼的信件，請先停手，再查看網域與寄件者。</p><button className="primary" type="button">標記為已理解</button></section>
  </main>;
}

function ReadingView() {
  const [fontSize, setFontSize] = useState("large");
  const [chunking, setChunking] = useState(true);
  return <main className={"page-shell reading font-" + fontSize}>
    <section className="reading-toolbar"><div><span className="eyebrow">學生端・閱讀鷹架支援</span><h1>看完焦點：辨別仿冒網域、破除時間緊迫陷阱</h1></div><div className="controls"><span>文字大小</span>{["normal", "large", "xlarge"].map((size) => <button className={fontSize === size ? "selected" : ""} key={size} onClick={() => setFontSize(size)} type="button">{size === "normal" ? "A" : size === "large" ? "A+" : "A++"}</button>)}<button className={chunking ? "selected" : ""} onClick={() => setChunking(!chunking)} type="button">斷詞引導</button></div></section>
    <TranscriptPanel compact />
    <div className="reading-grid"><section><div className="section-title"><h2>白話短句解析</h2><strong className="chip">4 個關鍵動作</strong></div>{readingSteps.map((step, index) => <article className="reading-step" key={step}><b>{index + 1}</b><div><p>{chunking ? step.split("，").map((part, partIndex) => <mark key={partIndex}>{part}{partIndex === 0 ? "，" : ""}</mark>) : step}</p><small>依據：課堂字幕與教材規則</small></div></article>)}<section className="dictionary card"><h2>關鍵詞白話小字典</h2><div>{concepts.slice(0, 3).map(([name, , detail]) => <article key={name}><b>{name}</b><p>{detail}</p></article>)}</div></section></section>
    <aside><section className="cause card"><h2>因果風險與行動卡</h2><div><b>如果</b><p>網址拼字奇怪，或信件要求你在短時間內更新密碼。</p></div><div><b>可能</b><p>這可能是仿冒網站，目的是誘使你交出帳密。</p></div><div><b>行動</b><p>不要點擊；改由平常使用的書籤或官方首頁登入。</p></div></section><section className="card"><h2>教材範例：模擬釣魚信件</h2><p className="safe-note">此為教學模擬，不含可點擊連結、惡意程式碼或真實帳密。</p><p><b>寄件者：</b>service@sch00l-edu-verify.example</p><p><b>主旨：</b>【緊急通知】帳號將於今日停權，請立即驗證</p><p>請勿依照信件按鈕行動；先從官方管道確認。</p></section><section className="quiz card"><h2>課堂小挑戰</h2><p>收到要求你立刻輸入帳密的郵件，應該怎麼做？</p><button type="button">A. 直接點連結輸入帳密</button><button className="answer" type="button">B. 不點連結，改由官方首頁查證</button></section></aside></div>
  </main>;
}

function FocusView() {
  const [current, setCurrent] = useState(1);
  const [checked, setChecked] = useState([false, false, false]);
  const [stressFree, setStressFree] = useState(true);
  const checks = ["觀察寄件者地址：確認 @ 後是否為預期網域。", "游標停在連結上方：先確認網址，不直接點擊。", "留意急迫用語：任何催促都先改由官方管道查證。"];
  return <main className="page-shell">
    <TranscriptPanel compact />
    <section className="focus-progress card"><div><span className="eyebrow">當前課堂防護節奏</span><h1>一次專注一個核心防護動作</h1></div><strong>目前進度：第 {current + 1} 步，共 4 步</strong><div className="progress"><i style={{ width: ((current + 1) / focusSteps.length) * 100 + "%" }} /></div><div className="focus-tabs">{focusSteps.map((step, index) => <button className={index === current ? "active" : index < current ? "done" : ""} key={step} onClick={() => setCurrent(index)} type="button">步驟 {index + 1}<small>{step.split("：")[0]}</small></button>)}</div></section>
    <div className="focus-grid"><section className="focus-task card"><span className="eyebrow">現在先注意</span><h2>{focusSteps[current]}</h2><p>按照下列小檢核，一步一步來，不必著急。</p><div className="checks">{checks.map((check, index) => <label key={check}><input checked={checked[index]} onChange={() => setChecked(checked.map((value, itemIndex) => itemIndex === index ? !value : value))} type="checkbox" /><span>{check}</span></label>)}</div><p className="memory"><b>輔助記憶：</b>停、看、查、報。</p><div className="task-actions"><button type="button">需要再聽一次說明</button><button className="primary" onClick={() => setCurrent(Math.min(current + 1, 3))} type="button">我已完成這一步</button></div></section>
    <aside><section className="card"><h2>全防護流程一覽</h2>{focusSteps.map((step, index) => <div className={"timeline " + (index === current ? "current" : "")} key={step}><b>{index + 1}</b><div><strong>{step.split("：")[0]}</strong><p>{step}</p></div></div>)}</section><section className="card"><h2>自訂專注步調</h2><label className="switch-row"><span>無壓力節奏模式<small>依個人理解速度前進</small></span><button aria-pressed={stressFree} className={stressFree ? "switch on" : "switch"} onClick={() => setStressFree(!stressFree)} type="button"><i /></button></label><label className="switch-row"><span>清晰閱讀輔助<small>降低周遭資訊干擾</small></span><button aria-pressed="true" className="switch on" type="button"><i /></button></label><button className="help" type="button">安靜舉手：向教師發送協助訊號</button></section></aside></div>
  </main>;
}

export default function Home() {
  const [view, setView] = useState<View>("teacher");
  const [paused, setPaused] = useState(false);
  return <div className="site-root"><header className="site-header"><Logo /><span className="divider" /><strong className="product">EduBridge_AI</strong><nav aria-label="系統模式">{navItems.map((item) => <button aria-current={view === item.id ? "page" : undefined} className={view === item.id ? "active" : ""} key={item.id} onClick={() => setView(item.id)} type="button">{item.label}</button>)}</nav><div className="header-status"><span><i />測試教室 801</span><span>已連線 3 台</span><button type="button">個人閱讀偏好</button></div></header>
    {view === "teacher" && <TeacherView paused={paused} onPause={() => setPaused(!paused)} />}{view === "visual" && <VisualView />}{view === "reading" && <ReadingView />}{view === "focus" && <FocusView />}
    <footer><Logo /><span>台灣智慧教室全納學習支援平台</span><span>依 UDL 原則設計</span><span>© 2026 EduBridge_AI</span></footer></div>;
}
