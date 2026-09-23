# EduBridge_AI Classroom Support

## 產品流程

1. `/prepare`：教師輸入目標、上傳 DOCX／PPTX／TXT／Markdown，編輯並確認教學頁面、知識圖譜、題目與支援卡。
2. `/learn?stage=pretest&student=A`：匿名學生完成 3–5 題前測；一次答錯只標記「需要再確認」。
3. `/teach`：教師切換教學頁面、同步字幕並控制目前概念；同一概念連續出現在兩個合格片段才自動推送提示。
4. `/learn?stage=live&student=A`：學生同步看到教學頁面與字幕，再自行展開一張已確認的支援卡。

原本的視覺、閱讀與專注三個固定模式已改為私人呈現偏好，包括字幕、白話短句、一次一步、色覺安全、文字朗讀、減少動態、進階挑戰、字級、行距及逐行聚焦。系統不儲存或推測 ADHD、聽障、學習障礙等診斷名稱。

## 本機啟動

    npm install
    npm run dev

驗證：

    npm run lint
    npx tsc --noEmit
    npm test
    npm run test:e2e

`test:e2e` 不新增瀏覽器測試套件，會使用本機 Chrome 或 Edge；也可用 `CHROME_PATH` 指定執行檔。

## Groq（選用）

在 `.env.local` 設定：

    GROQ_API_KEY=你的伺服器端金鑰
    GROQ_ASR_MODEL=whisper-large-v3
    GROQ_LLM_MODEL=openai/gpt-oss-20b

- 有金鑰時，`POST /api/lesson/prepare` 可提出結構化課程草稿，發布前仍需教師確認。
- 無金鑰或模型輸出不符來源規則時，使用可重現的本地規則草稿。
- 課中概念比對與卡片選擇在瀏覽器完成，不持續呼叫 LLM。
- 語音金鑰只存在伺服器；無金鑰時音訊端點拒絕上傳且不會外傳。
- 音訊以連續 10 秒片段錄製；上一段辨識時下一段持續收音，低品質或靜音片段不觸發支援卡。

## 資料與限制

- Office 原檔在瀏覽器解析；課程包與匿名學習證據儲存在本機瀏覽器。
- 競賽版使用 BroadcastChannel 同步同一瀏覽器分頁，不支援跨裝置教室。
- 知識圖譜不是完整向量 RAG；教材來源仍以 ID 與 TF-IDF／概念映射核對。
- 自動字幕、知識關係與前測狀態都可能有誤，教師可暫停、指定、修正或清除。

操作流程見 `DEMO_RUNBOOK.md`，架構見 `ARCHITECTURE.md`。
