# 產品定位

本文件只保存 Utawakui 穩定的產品承諾、設計原則與非目標。功能完成度與 roadmap
請見 [產品規格](docs/spec.md)，技術分工請見 [架構圖](docs/architecture.md)。

## 產品與平台

Utawakui 是一套 **local-first OBS singing-session control tool**，主要交付形式為
Windows Electron 桌面應用程式。控制台使用 Vue renderer；OBS 畫面則透過獨立的
Browser Source 文件交付，不是一般網站或雲端服務。

它服務直播主、VTuber、cover singer、歌回企劃與直播技術人員，但功能不依身份
分類，而依本次資料如何被準備、播放、處理與輸出分類。

## 產品承諾

Utawakui 讓使用者在同一套本機工作流中完成：

1. **Prepare**：匯入自備媒體、整理曲庫、歌單、metadata、封面與歌詞。
2. **Play**：管理待播佇列，穩定操作播放、切歌與音量。
3. **Practice**：使用歌詞、pitch／tempo 與 guide vocal 協助排練。
4. **Process**：產生可在本機播放的分離或處理結果。
5. **Output**：將 now-playing、setlist、lyrics 與 artwork 投影到 OBS。
6. **Provider Assist**：只在明確啟用後，使用外部 metadata 或下載工具輔助建曲。

成功的體驗重點是開播前能快速檢查，演出中能低干擾操作，故障時能看見清楚且
可恢復的狀態。

## 產品原則

1. **Local-first by default**：本機匯入、曲庫與播放永遠是預設核心。
2. **Workflow over identity**：依資料與輸出行為切分功能，不依使用者標籤切分。
3. **Public output is explicit**：進入 OBS、直播、錄影或 VOD 的內容必須有明確狀態。
4. **Advanced flows are separable**：Provider、歌詞服務、音訊處理與公開輸出各自
   gate、各自準備依賴，不能成為啟動核心的前置條件。
5. **One source of truth**：播放器、佇列與歌詞只保有一份權威狀態；視窗與 Overlay
   只接收投影。
6. **Operational clarity first**：介面優先支援檢查、切換、復原與低注意力操作。
7. **No licensing implication**：產品協助整理、播放、處理與輸出，但不提供素材、
   授權判定或平台規則保證。

## Feature Gate 語意

Feature gate 表示使用者已看過提示並選擇啟用某個流程，不是授權資料庫。現行四個
產品 gate 為：

- `provider-flow`：外部候選搜尋、匯入、下載與 metadata backfill。
- `lyrics-flow`：外部歌詞查詢與保存；純本機歌詞操作不需 gate。
- `audio-processing-flow`：分離與未來的音訊 pre-render。
- `public-output-flow`：啟動或發布 OBS Browser Source 狀態。

「無 gate」與「已啟用某個 gate」之間還有兩種容易混淆的狀態，需要分開理解：

- **Gate 內的預設偏好**：某個已 gate 的流程本身可以預設開啟，但這只是該流程
  「啟用後」的行為偏好，不能取代 gate 確認本身。例如「匯入後自動分析」
  （`autoAnalyzeMusicStructure`）預設為 true，但每次觸發前仍會重新檢查
  `audio-processing-flow` 是否已啟用、分析元件是否就緒；使用者從未啟用該 gate
  或元件未安裝時，這個預設偏好不會生效。
- **不受四個 gate 保護的預設背景行為**：極少數與素材權利無關、純屬應用程式
  維護性質的行為，預設開啟且不經過上述任何一個 gate。目前只有「啟動時自動
  檢查應用程式更新」（`autoCheckAppUpdates`）屬於這類：它只主動連線 release
  feed 查詢版本，範圍明確止於「查詢」，下載與安裝仍是使用者在 Settings 的
  另一個明確動作。這類行為之所以不進入 gate 模型，是因為 gate 存在的理由是
  提示素材與平台權利風險，而不是「任何預設連外行為都必須有提示」；是否應該
  納入額外提示，留待後續產品決策，不在此文件預先認定。

## 非目標

Utawakui 不提供：

- 內建商用曲庫、素材授權代理或權利管理服務。
- 規避平台規則、存取控制或下載限制的能力。
- Twitch／YouTube chat 點歌自動化。
- 多使用者協作、雲端同步或將使用者媒體上傳到 Utawakui 服務。
- OBS native plugin；除非 Browser Source 確實無法滿足已驗證需求。

## 產品語氣

文字應像可靠的直播工具：清楚、冷靜、具體。使用「候選來源」、「本機曲庫」、
「啟用輸出前確認」與「請確認本次使用所需的權利」；避免「合法來源」、
「安全下載」、「不會被 Content ID 偵測」或任何代替使用者保證的說法。

控制台是操作者介面，Overlay 是公開呈現面。兩者可以共享資料語意與產品語氣，
但不共享同一套視覺 token 或互動假設。
