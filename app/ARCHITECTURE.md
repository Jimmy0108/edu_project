# EduBridge_AI 系統架構

## 資料流

```text
教師教案／簡報
  → 瀏覽器本機解析與教師確認
  → POST /api/lesson/prepare（選用 LLM，嚴格 JSON 與來源 ID 驗證）
  → LessonPackage v3：教學頁面、概念、關係、題目、支援卡、匿名偏好
  → 教師再次確認並儲存在 localStorage／匯出 JSON

學生前測 → 本機 MasteryEvidence（unknown / needs-check / developing / ready）

教師語音 → 連續 10 秒片段 → POST /api/transcribe → 有序字幕與品質資料
合格字幕 → 瀏覽器詞彙／別名比對 → 連續兩次或教師指定 → 一張預先核准支援卡
LiveFrame → BroadcastChannel／localStorage → 同瀏覽器學生分頁
```

## 核心界面

- `LessonPackage`：上限 24 個教學頁面、12 個節點、18 條關係、5 題；每個頁面、節點、關係、題目與卡片都必須有合法來源 ID。
- `KnowledgeEdge`：只允許 `prerequisite`、`part_of`、`related`，且先備關係不得形成循環。
- `SupportProfile`：只儲存介面功能與字級、行距、逐行聚焦偏好，不儲存診斷名稱。
- `MasteryEvidence`：記錄前測、課中檢核與教師判斷事件；跨階段正確證據或教師確認才可成為 `ready`，不等同能力或特教鑑定。
- `TranscriptSegment`：保留錄音序號、品質與 Whisper 中繼資料；低品質與靜音片段不能觸發卡片。
- `LiveSupportDecision`：低匹配回傳 `null`；第一次命中為不穩定，第二次相同概念才可自動顯示。

## API

- `POST /api/lesson/prepare`：輸入課程資料與已確認教材，輸出待教師核對的課程包。模型不得創造來源 ID；無金鑰或驗證失敗時回到本地草稿。
- `POST /api/scaffold`：保留舊版輸入相容；若傳入 `lesson`，回傳本機知識圖譜概念決策，不呼叫 LLM。
- `POST /api/transcribe`：驗證音訊 MIME 與 25 MB 上限後才呼叫 Groq ASR，使用 `verbose_json` 回傳品質資料。

## 可靠性邊界

- 課中不生成新教學事實；只選取課前已核准卡片。
- 字幕先顯示；低品質片段標為待確認但不參與概念比對，無匹配時不新增支援卡。
- v2 課程包可匯入並轉成 v3；舊的計數型學習證據不會被偽造成事件歷程。
- 官方來源只是事先查核的教學參考，並不代表所有課程敘述自動正確。
- 競賽版不含登入、跨裝置、正式同意流程、長期學習紀錄、OCR、PDF 或向量資料庫。
