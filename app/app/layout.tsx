import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EduBridge_AI｜課堂即時認知鷹架",
  description: "以即時字幕與需求導向鷹架支援融合教育課堂。",
  openGraph: {
    title: "EduBridge_AI｜課堂即時認知鷹架",
    description: "以即時字幕與需求導向鷹架支援融合教育課堂。",
    images: [{ url: "/og.png", width: 1672, height: 936, alt: "EduBridge_AI 課堂即時認知鷹架示意圖" }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hant"><body>{children}</body></html>;
}
