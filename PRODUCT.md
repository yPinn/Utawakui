# Product

<!-- impeccable:product-schema 1 -->

本文件只保存 Utawakui 穩定的產品真相與承諾。功能完成度與 roadmap 見
[產品規格](docs/spec.md)，技術分工見[架構圖](docs/architecture.md)，視覺與元件規範見
[設計指南](DESIGN.md)。

## Platform

web

Utawakui 的主要交付形式是 Windows Electron 桌面應用程式；`web` 表示主要介面採
Web renderer 的設計語言，不表示它是一般網站或雲端服務。控制台使用 Vue renderer，
OBS 畫面則透過獨立 Browser Source 文件交付。

## Users

主要使用者是直播主、VTuber、cover singer、歌回企劃與直播技術人員。他們在自己的
Windows 電腦上準備媒體、排練、控制歌唱場次，並把必要資訊輸出到 OBS。

產品不依身份建立不同版本；不同使用者共享同一套工作流，只依本次資料如何被準備、
播放、處理與輸出來啟用功能。

## Product Purpose

Utawakui 讓使用者在同一套本機工作流中完成：

1. **Prepare**：匯入自備媒體，整理曲庫、歌單、metadata、封面與歌詞。
2. **Play**：管理待播佇列，穩定操作播放、切歌與音量。
3. **Practice**：使用歌詞、pitch／tempo 與 guide vocal 協助排練。
4. **Process**：產生可在本機播放的分離或處理結果。
5. **Output**：將 now-playing、setlist、lyrics 與 artwork 投影到 OBS。
6. **Provider Assist**：只在明確啟用後，使用外部 metadata 或下載工具輔助建曲。

成功代表使用者能在開播前快速檢查、演出中低干擾操作，並在故障時立即知道發生什麼事
與如何恢復；可選服務失效時，本機播放核心仍可使用。

## Positioning

Utawakui 是 **local-first 的 Windows 歌唱場次控制台**。它把本機媒體、播放、歌詞、
音訊處理與 OBS 輸出收斂成一條操作工作流，同時把 Provider、外部歌詞、音訊處理、
公開輸出與外部應用連線拆成可獨立啟用、準備與復原的單位。

它的差異不是提供內容庫或雲端服務，而是讓本機核心不必等待任何外部服務，並讓所有公開
輸出都來自同一份播放器、佇列與歌詞權威狀態。

## Operating Context

- **開播前**：匯入與整理本機媒體，準備歌單、歌詞、封面、可選依賴與 OBS 畫面。
- **演出中**：在高注意力、低容錯的情境下操作播放、待播與音量，快速辨識目前狀態與
  可恢復錯誤。
- **排練與製作**：調整 pitch／tempo、使用 guide vocal、執行本機分析或分離，並保留
  可重現的本機結果。
- **公開呈現**：控制台與演出者視窗是本機操作面；Browser Source 是直播、錄影與 VOD
  可能看見的公開呈現面。
- **外部整合**：OBS WebSocket 僅讀取直播／錄影狀態與時間戳；Browser Source、Provider
  與其他外部服務各有獨立邊界，不得成為應用程式啟動的前置條件。

## Capabilities and Constraints

- 本機匯入、結構化曲庫、歌單、播放、待播與純本機歌詞操作是預設核心。
- Provider acquisition、外部歌詞、音訊處理、公開輸出與 OBS 連線是可分離的 gated flows；
  每個 main operation 都會重新檢查自己的 gate。
- Renderer 只透過 secure preload 發送 bounded intent；檔案路徑、下載位置、URL、執行檔與
  其他可由 main 推導的資料不得由 renderer 指定。
- HTML audio element 是播放時間與播放狀態的唯一權威；播放器、佇列與歌詞各自只有一份
  renderer 狀態，視窗與 Overlay 只接收投影。
- 使用者檔案系統是曲目存在與否的權威；曲庫 metadata 不保存 absolute path。
- Browser Source 是支援基線；目前不提供 OBS scene／source 寫入或遠端播放控制。
- 產品協助整理、播放、處理與輸出，但不替使用者判定素材、直播、錄影、VOD 或平台權利。

### Feature Gate 語意

Feature gate 表示使用者已看過提示並選擇啟用某個流程，不是授權資料庫。現行五個產品
gate 為：

- `provider-flow`：外部候選搜尋、匯入、下載與 metadata backfill。
- `lyrics-flow`：外部歌詞查詢與保存；純本機歌詞操作不需 gate。
- `audio-processing-flow`：分離與其他本機音訊處理。
- `public-output-flow`：啟動或發布 Browser Source 狀態。
- `obs-integration`：以唯讀 OBS WebSocket 連線取得直播／錄影狀態與時間戳。

Gate 內的預設偏好只在對應 gate 已啟用且依賴就緒時生效。例如「匯入後自動分析」可預設
開啟，但不能取代 `audio-processing-flow` 確認。

啟動時自動檢查應用程式更新不屬於上述 gate。它只連線固定 release feed 查詢版本；下載
與安裝仍是 Settings 中的明確使用者動作。這個例外不包含使用者素材、外部 credential 或
可變 endpoint。

### 明確非目標

Utawakui 不提供：

- 內建商用曲庫、素材授權代理或權利管理服務。
- 規避平台規則、存取控制或下載限制的能力。
- Twitch／YouTube chat 點歌自動化。
- 多使用者協作、雲端同步或將使用者媒體上傳到 Utawakui 服務。
- OBS native plugin；除非 Browser Source 無法滿足已驗證需求，且另有產品決策。

## Brand Commitments

- 產品名稱是 **Utawakui**。
- 文字應像可靠的直播工具：清楚、冷靜、具體，優先說明狀態、影響與下一步。
- 使用「候選來源」、「本機曲庫」、「啟用輸出前確認」與「請確認本次使用所需的權利」
  等準確用語。
- 不使用「合法來源」、「安全下載」、「不會被 Content ID 偵測」或任何代替使用者保證
  權利與平台結果的說法。
- 控制台是操作者介面，Overlay 是公開呈現面；兩者共享資料語意與產品語氣，但不共享互動
  假設。

## Evidence on Hand

- [產品規格](docs/spec.md) 是產品範圍、現況與發展方向的權威來源。
- [架構圖](docs/architecture.md)、active ADR 與 focused contracts 記錄已實作的 runtime、
  trust boundary、封裝與輸出契約。
- [設計指南](DESIGN.md) 與現有 Vue components／semantic tokens 是目前介面行為與元件規範
  的實作證據。
- `public/assets/icons/` 包含正式應用程式圖示；發布與安裝證據位於 `docs/operations/`、
  `docs/releases/` 與相應自動化測試。
- 目前沒有可供產品介面引用的客戶名單、使用者 testimonial、第三方背書、定價資料或素材
  權利保證；未提供的證據不得虛構。

## Product Principles

1. **Local-first by default**：本機匯入、曲庫與播放永遠是預設核心。
2. **Workflow over identity**：依資料與輸出行為切分功能；進階流程各自 gate、各自準備，
   不依使用者標籤切分產品。
3. **Public output is explicit**：進入 OBS、直播、錄影或 VOD 的內容必須有明確狀態，且不
   暗示 Utawakui 已代替使用者確認權利。
4. **One source of truth**：播放器、佇列與歌詞只保有一份權威狀態，其他視窗與 Overlay
   只接收投影。
5. **Operational clarity first**：介面優先支援檢查、切換、復原與低注意力操作；錯誤要說明
   問題與可行下一步。

## Accessibility & Inclusion

- 控制台須保留清楚的鍵盤焦點、鍵盤可達操作、WCAG AA 文字對比與可辨識的 disabled、
  loading、error 及 empty state。
- 必須尊重 reduced-motion；重要狀態不得只靠動畫、顏色或短暫視覺效果表達。
- 密集的直播操作介面仍需提供可掃讀標題、直接動作名稱與不依賴技術背景的錯誤復原文字。
- 公開錯誤不得暴露路徑、URL、stderr、credential 或其他私人診斷內容。
- **Open decision**：是否把 Windows「減少動態效果」設定投影到 Self-View／Overlay，並提供
  App 內覆寫，仍以產品規格中的開放決策為準。
