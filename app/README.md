# EduBridge_AI Classroom Support

## 產品流程

1. `/prepare`：教師輸入目標、上傳 DOCX／PPTX／TXT／Markdown，確認教材後建立知識圖譜。
2. `/learn?stage=pretest&student=A`：匿名學生完成 3–5 題前測；一次答錯只標記「需要再確認」。
3. `/teach`：教師授課、同步字幕並控制目前概念；同一概念連續辨識兩次才自動推送提示。
4. `/learn?stage=live&student=A`：學生先看到字幕，再自行展開一張已確認的支援卡。

原本的視覺、閱讀與專注三個固定模式已改為私人呈現偏好，包括字幕、白話短句、一次一步、色覺安全、文字朗讀、減少動態及進階挑戰。系統不儲存或推測 ADHD、聽障、學習障礙等診斷名稱。

## 本機啟動

    npm install
    npm run dev

驗證：

    npm run lint
    npx tsc --noEmit
    npm test

## Groq（選用）

在 `.env.local` 設定：

    GROQ_API_KEY=你的伺服器端金鑰
    GROQ_ASR_MODEL=whisper-large-v3
    GROQ_LLM_MODEL=openai/gpt-oss-20b

- 有金鑰時，`POST /api/lesson/prepare` 可提出結構化課程草稿，發布前仍需教師確認。
- 無金鑰或模型輸出不符來源規則時，使用可重現的本地規則草稿。
- 課中概念比對與卡片選擇在瀏覽器完成，不持續呼叫 LLM。
- 語音金鑰只存在伺服器；無金鑰時音訊端點拒絕上傳且不會外傳。

## 資料與限制

- Office 原檔在瀏覽器解析；課程包與匿名學習證據儲存在本機瀏覽器。
- 競賽版使用 BroadcastChannel 同步同一瀏覽器分頁，不支援跨裝置教室。
- 知識圖譜不是完整向量 RAG；教材來源仍以 ID 與 TF-IDF／概念映射核對。
- 自動字幕、知識關係與前測狀態都可能有誤，教師可暫停、指定、修正或清除。

操作流程見 `DEMO_RUNBOOK.md`，架構見 `ARCHITECTURE.md`。
