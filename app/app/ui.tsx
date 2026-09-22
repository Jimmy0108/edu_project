import type { ReactNode } from "react";
import Link from "next/link";

export function BrandHeader({ active, actions }: { active?: "prepare" | "teach" | "learn"; actions?: ReactNode }) {
  return <header className="site-header">
    <Link className="brand" href="/" aria-label="EduBridge AI 首頁"><span aria-hidden="true">E</span><strong>EduBridge<em>AI</em><small>知識圖譜驅動的課堂認知鷹架</small></strong></Link>
    <nav aria-label="主要導覽">
      <a className={active === "prepare" ? "active" : ""} href="/prepare">課前準備</a>
      <a className={active === "teach" ? "active" : ""} href="/teach">教師授課</a>
      <a className={active === "learn" ? "active" : ""} href="/learn?stage=pretest&student=A">學生學習</a>
    </nav>
    {actions && <div className="header-actions">{actions}</div>}
  </header>;
}

export function PageFooter() {
  return <footer><strong>EduBridge_AI</strong><span>AI 提供建議，教師保有教學決定權</span><span>競賽 Demo · 匿名學生資料 · 2026</span></footer>;
}

export function StatusPill({ children, tone = "teal" }: { children: ReactNode; tone?: "teal" | "amber" | "neutral" }) {
  return <span className={`status-pill ${tone}`}>{children}</span>;
}
