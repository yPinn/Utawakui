# Product

## Register

product

## Platform

web

Utawakui is a web-rendered Vue control panel packaged as an Electron desktop app. OBS-facing surfaces are delivered separately as Browser Source outputs.

## Product Positioning

Utawakui 是一個 **local-first OBS singing-session control tool**。它協助使用者在本機整理媒體、準備歌單、操作播放、處理音訊、管理歌詞，並在需要時輸出 OBS 可使用的畫面來源。

產品不以「使用者身份」作為功能分類主軸。VTuber、實況主、cover singer、歌回企劃者或直播技術人員都可能使用同一套流程；真正影響產品設計與風險提示的是本次操作行為：

- 是否只在本機整理與練習。
- 是否把音訊送進串流。
- 是否把歌詞、封面或其他素材送進 OBS 畫面。
- 是否錄影、保存 VOD、剪 clips 或二次發布。
- 是否啟用 provider-assisted import / download。

## Product Promise

Utawakui 讓歌唱直播或錄製前後的操作更安定：使用者可以把素材、歌單、播放、歌詞、音訊處理與 OBS 輸出放在同一個清楚的本機工作流裡，而不是在多個工具與資料夾之間臨場切換。

成功的產品體驗應該是：

- 開播前能快速確認曲庫、歌單、歌詞、key、tempo 與 OBS 輸出狀態。
- 演出中能穩定播放、切歌、查看下一首與控制 guide vocal。
- 錄影或 VOD 情境能和 live-only 情境分開管理。
- 進階來源功能可以使用，但不會被包裝成產品的預設入口或授權保證。

## Workflow Model

Utawakui 的產品結構以媒體工作流階段切分：

1. **Prepare**
   匯入本機素材、整理曲庫、建立歌單、補齊 metadata、縮圖與歌詞。

2. **Play**
   在本機播放曲目、管理佇列、調整音量、進度、repeat、shuffle 與上一首/下一首。

3. **Practice**
   使用 pitch/tempo preview、guide vocal、歌詞 self-view 等功能協助練習與演出準備。

4. **Process**
   產生 vocal separation、stems、render cache 或未來的 pre-rendered pitch/tempo assets。

5. **Output**
   將 queue、lyrics、artwork、now-playing 或其他狀態送到 OBS Browser Source。

6. **Session**
   依當次用途切換 live-only、recording、VOD、clips 或 cross-platform replay 的提示與狀態。

7. **Provider Assist**
   在明確啟用後，以 provider metadata、candidate search 或 downloader 工具協助建立曲目。

## Feature Segmentation

### Default Core

預設核心功能是產品的主要入口，應維持低風險、低摩擦、可離線操作。

| Feature                   | Product role                                  | Status |
| ------------------------- | --------------------------------------------- | ------ |
| Local Library             | 保存與列出本機可播放曲目。                    | Built  |
| Player                    | 播放、暫停、seek、音量與目前曲目。            | Built  |
| Playback Queue            | 待播、歷史、shuffle、repeat、prev/next。      | Built  |
| Playlist / Collection     | 保存使用者集合、排序與 track ids。            | Built  |
| Track Metadata            | 顯示曲名、歌手、duration、album、year、縮圖。 | Built  |
| Local Config              | 保存下載資料夾與 machine-local settings。     | Built  |
| Windows Shell Integration | 顯示 now-playing、SMTC 與 taskbar controls。  | Built  |

### Practice & Processing

這些功能服務本機練習、現場操作與處理後播放。它們可以是核心體驗的一部分，但公開輸出前需要清楚提示。

| Feature             | Product role                               | Gate expectation                  | Status          |
| ------------------- | ------------------------------------------ | --------------------------------- | --------------- |
| Lyrics Workspace    | 管理 synced lyrics、字幕與自用歌詞資料。   | OBS 顯示前 gate。                 | Partially built |
| Pitch / Tempo       | 調整 key 與速度，支援練習與演出。          | 公開輸出或 render cache 前 gate。 | Built preview   |
| Vocal Separation    | 產生 generated media，支援 guide vocal。   | 產生/公開使用前 gate。            | Built           |
| Performer Self-View | 給操作者看的 lyrics、cue、key、下一首。    | 低風險，除非內容進入公開輸出。    | Built MVP       |
| Pre-rendered Assets | 產生可重播的 pitch/tempo processed files。 | Generated media gate。            | Planned         |

### OBS Output

OBS 輸出是獨立產品面，不能和控制台 UI 混為一談。純 UI overlay 與含第三方素材 overlay 應分開設計。

| Feature                   | Product role                          | Gate expectation                   | Status           |
| ------------------------- | ------------------------------------- | ---------------------------------- | ---------------- |
| OBS Browser Source Server | 以本機 HTTP/WebSocket 提供 overlay。  | 啟用 OBS 輸出前 gate。             | Built MVP        |
| Queue Overlay             | 顯示目前曲目、下一首與 setlist 狀態。 | 低風險，仍需 session output 提示。 | Built MVP        |
| Lyrics Overlay            | 在 OBS 場景顯示歌詞或字幕。           | Lyrics display gate。              | Built MVP        |
| Artwork Overlay           | 在 OBS 場景顯示封面、縮圖或素材圖。   | Artwork display gate。             | Planned          |
| Overlay Themes            | 為 OBS 畫面提供可選主題。             | 不得與 control panel tokens 耦合。 | Token foundation |

### Session Output

Session Output 決定本次操作是只直播、只錄影、直播並保存 VOD，或後續剪輯。這應成為獨立模式，不藏在 OBS overlay 設定裡。

| Feature              | Product role                              | Gate expectation     | Status  |
| -------------------- | ----------------------------------------- | -------------------- | ------- |
| Live Session Mode    | 開播前確認本次串流輸出狀態。              | Live output gate。   | Planned |
| Recording / VOD Mode | 區分 live-only 與 recording/VOD session。 | Recording/VOD gate。 | Planned |
| Source Output Review | 列出會進入 OBS 輸出的畫面來源。           | 依來源類型顯示提示。 | Planned |
| Audio Track Notes    | 提醒 OBS 音訊軌道分離只是風險控管。       | 不作為授權替代說明。 | Planned |

### Provider-Assisted Features

Provider-assisted features 是進階流程，不是預設入口。它們可以提升效率，但必須保持可關閉、可分離、可清楚提示。

| Feature                   | Product role                             | Gate expectation           | Status          |
| ------------------------- | ---------------------------------------- | -------------------------- | --------------- |
| Provider Metadata Import  | 匯入 playlist 或 track metadata。        | Provider policy notice。   | Partially built |
| Provider Candidate Search | 產生可能匹配的候選曲目。                 | Candidate wording only。   | Built core path |
| Provider Download Path    | 透過 downloader 工具建立本機可播放曲目。 | Advanced provider gate。   | Built core path |
| Thumbnail / Info Sidecars | 保存本機輔助資料。                       | 公開顯示前另行 gate。      | Partially built |
| Optional Provider Module  | 將高風險來源能力拆成可控模組。           | 可在 build/settings 停用。 | To evaluate     |
| Spotify Official Import   | 讀取 playlist metadata，不作為音訊來源。 | Metadata-only notice。     | Planned         |

## Feature Gate Model

Feature gates 是產品工作流的一部分，不只是免責文字。它們的目標是讓使用者在啟用較敏感能力前，理解本次功能會影響哪個輸出面。

建議 gate 類型：

| Gate                  | Trigger                                  | Product tone                              |
| --------------------- | ---------------------------------------- | ----------------------------------------- |
| Provider Gate         | 啟用 candidate search 或 download path。 | 來源平台條款與下載/快取權限由使用者確認。 |
| Generated Media Gate  | 產生 stems、render cache 或處理後檔案。  | Generated assets 只屬本機工作流。         |
| Lyrics / Artwork Gate | 將歌詞、字幕、封面或縮圖送進 OBS。       | 畫面素材可能需要公開顯示/傳輸授權。       |
| OBS Output Gate       | 啟用 Browser Source 或公開輸出來源。     | 來源可能出現在串流或錄影中。              |
| Recording / VOD Gate  | 開始錄影、保存 VOD、clips 或精華輸出。   | 錄影/VOD 與 live 應分開確認。             |

Gate 文案應正式、親切、短句；不應恐嚇使用者，也不應暗示 Utawakui 會替使用者判斷授權狀態。

## Product Principles

1. **Workflow over identity.**
   功能依輸入、處理與輸出切分，不依使用者身份切分。

2. **Local-first by default.**
   預設入口是使用者自己的本機曲庫與設定，不是 provider acquisition。

3. **Public output is explicit.**
   任何會進入 OBS、串流、錄影、VOD 或剪輯的內容，都應有清楚狀態與必要提示。

4. **Advanced flows are gated and separable.**
   Provider download、lyrics/artwork output、generated media 與 recording/VOD mode 都應能獨立啟用、停用或抽離。

5. **Operational clarity beats decoration.**
   UI 應支援開播前檢查與演出中快速操作，不用裝飾競爭注意力。

6. **No licensing implication.**
   產品可以協助整理、播放、處理與輸出，但不宣稱提供歌曲來源、授權服務或平台替代品。

## Product Voice

Utawakui 的文字應像可靠的直播工具：清楚、冷靜、具體。

適合使用：

- 「候選來源」
- 「本機曲庫」
- 「啟用 OBS 輸出前確認」
- 「此來源可能出現在串流或錄影中」
- 「請確認本次使用所需的權利」

避免使用：

- 「合法來源」
- 「安全下載」
- 「不會被 Content ID 偵測」
- 「只要不留 VOD 就沒問題」
- 「自動取得授權」

## Non-goals

Utawakui 不做以下事情：

- 內建商用曲庫。
- 素材授權代理或權利管理服務。
- 以規避平台規則、存取控制或下載限制為目標的功能。
- Twitch / YouTube chat song request automation。
- 多使用者協作與雲端同步。
- OBS native plugin。
- 將使用者媒體上傳到 Utawakui 服務。

## Design Implications

產品資訊架構應支援以下分區：

- **Library**：本機曲庫與 track assets。
- **Setlist**：歌單、佇列與 live operation。
- **Practice**：lyrics self-view、pitch/tempo、guide vocal。
- **Processing**：vocal separation、generated assets、render cache。
- **Output**：OBS Browser Source、overlay sources、session mode。
- **Import**：local import first；provider assist 作為 advanced path。
- **Settings**：feature gates、local paths、output behavior、license notices。

Control panel 和 OBS overlay 應維持不同設計面：control panel 是操作者介面；overlay 是公開輸出畫面。兩者可以共享產品語氣，但不應共享同一套視覺 token 假設。
