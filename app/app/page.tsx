import { BrandHeader, PageFooter, StatusPill } from "./ui";

export default function Home() {
  return <div className="site-root">
    <BrandHeader />
    <main className="landing">
      <section className="hero">
        <div>
          <StatusPill>教師主導 · 來源可查 · 課中低干擾</StatusPill>
          <h1>不是再做一份摘要，<br />而是在學生卡住時補上<span>剛好的先備知識</span>。</h1>
          <p>EduBridge_AI 把教案與簡報整理成教師可核對的知識圖譜，利用前測形成暫時學習證據，再於授課當下提供一張可自行展開的認知鷹架卡。</p>
          <div className="hero-actions"><a className="button primary" href="/prepare">建立示範課程</a><a className="button" href="/teach">進入教師授課</a></div>
        </div>
        <aside className="hero-preview" aria-label="產品流程預覽">
          <div className="preview-top"><span>資訊科技 · 釣魚郵件辨識</span><b>課堂進行中</b></div>
          <article><small>教師目前講到</small><h2>寄件者網域</h2><p>不要只看顯示名稱，請檢查 @ 後方的完整網域。</p></article>
          <div className="preview-support"><b>需要補充嗎？</b><span>1 張經教師確認的支援卡</span></div>
          <small>依據：教師簡報＋官方資安來源</small>
        </aside>
      </section>
      <section className="outcome-strip"><div><b>課前</b><span>上傳教材、確認圖譜與前測</span></div><i aria-hidden="true">→</i><div><b>課中</b><span>字幕同步、穩定辨識概念</span></div><i aria-hidden="true">→</i><div><b>學生端</b><span>一次只呈現一個必要支援</span></div></section>
      <section className="home-section"><header><StatusPill tone="neutral">產品核心</StatusPill><h2>同一份知識，不同的可及方式</h2><p>系統不公開診斷名稱，也不把學生鎖在固定類別；教師預設需求，學生仍可私下調整。</p></header><div className="feature-grid">
        <article><b>01</b><h3>可驗證的知識圖譜</h3><p>概念、先備關係、題目與卡片都必須連回已確認教材。證據不足時保留不確定，不自動補寫。</p></article>
        <article><b>02</b><h3>暫時的學習證據</h3><p>一次答錯只代表「需要再確認」，後續隨堂檢核可以修正狀態，不把結果當成能力標籤。</p></article>
        <article><b>03</b><h3>低干擾即時支援</h3><p>字幕持續存在；概念需連續辨識才出現提示，學生展開後才看到短句、步驟或進階挑戰。</p></article>
      </div></section>
    </main>
    <PageFooter />
  </div>;
}
