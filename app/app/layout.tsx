import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EduBridge_AI｜知識圖譜驅動的課堂認知鷹架",
  description: "教師先確認課程知識結構，再以課前診斷與課中低干擾提示支援每位學生。",
  openGraph: {
    title: "EduBridge_AI｜知識圖譜驅動的課堂認知鷹架",
    description: "教師先確認課程知識結構，再以課前診斷與課中低干擾提示支援每位學生。",
    images: [{ url: "/og.png", width: 1672, height: 936, alt: "EduBridge_AI 課堂即時認知鷹架示意圖" }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hant"><body>{children}</body></html>;
}
