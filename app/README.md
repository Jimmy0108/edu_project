# EduBridge_AI Classroom Support

這是 EduBridge_AI 的可執行競賽原型。系統的先後順序固定為：

1. 教師語音轉為即時逐字稿。
2. 所有學生先收到相同的文字資訊。
3. 系統以一次結構化回應，提供視覺重點、閱讀鷹架與專注節奏三種介面。

目前畫面以「釣魚郵件與可疑連結辨識」作為安全的資訊科技課示範內容。

## 本機啟動

    npm install
    npm run dev

開啟本機開發伺服器顯示的網址。Windows 中文資料夾名稱已由 build script 處理：

    npm run lint
    npm run build

## 設定 Groq

請在本機建立 .env.local，內容可參考 .env.example：

    GROQ_API_KEY=請放入你自己的金鑰
    GROQ_ASR_MODEL=whisper-large-v3
    GROQ_LLM_MODEL=openai/gpt-oss-20b

不要把金鑰貼到聊天室、截圖或提交到 Git。無金鑰時：

- POST /api/scaffold 回傳標示為 demo 的確定性整理。
- POST /api/transcribe 回傳 503，且不會把音訊傳送到外部服務。

## API

### POST /api/scaffold

請傳送 JSON：

    { "transcript": "教師本段逐字稿" }

回傳一份同時包含 visual、reading 與 focus 欄位的 JSON；這避免為三種學生介面發送三次 LLM 請求。

### POST /api/transcribe

請使用 multipart/form-data 上傳 audio 欄位。端點驗證 MIME type 和 25 MB 上限，並在伺服器端才讀取 GROQ_API_KEY。

## 文件

- ARCHITECTURE.md：架構、限制與 RAG 演進方向。
- SECURITY_AND_PRIVACY.md：隱私與上線前檢核。
- THIRD_PARTY_NOTICES.md：第三方與設計來源聲明。

## 授權

程式碼採 MIT License。設計來源與第三方條款請見 THIRD_PARTY_NOTICES.md。
