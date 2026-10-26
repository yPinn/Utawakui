# Utawakui 產品規格

產品範圍、功能現況與方向的唯一來源。定位見 [PRODUCT](../PRODUCT.md)，技術邊界見[架構圖](architecture.md)，行為細節見各[契約](contracts/README.md)。

## 1. 產品定位

Utawakui 是 Windows 桌面歌唱工作流控制台，協助使用者在 OBS 歌回、翻唱錄製與排練時管理本機媒體、歌單、播放、歌詞、音訊處理與畫面輸出。

產品採 local-first：

- 使用者自備的本機音訊是預設入口。
- 曲庫與設定保存在使用者電腦，不依賴 Utawakui 雲端服務。
- Provider、歌詞服務、音訊處理與公開輸出可獨立啟用、停用與復原。
- OBS Browser Source 是公開呈現面；控制台與演出者視窗是本機操作面。

Utawakui 不是曲庫、授權服務、素材權利管理工具或串流平台替代品。Feature gate 只記錄流程啟用，不代表已確認素材或平台權利。

## 2. 產品範圍

### 2.1 預設核心

以下能力不依賴網路、provider runtime、模型或 Output server：

- 本機音訊匯入、結構化曲庫、metadata、縮圖與 playlists。
- 播放、seek、音量、待播、歷史、shuffle、repeat、previous／next。
- 演出安排：從 playlist／album 或曲庫搜尋建立場次，逐曲記錄完成／略過／中止，可連續播放並在重啟後恢復，不依賴 OBS。
- BGM 待機播放：與演唱播放器嚴格互斥的獨立單 deck，服務曲間休息；控制整合在演出安排。
- 本機設定、Windows window／taskbar／SMTC 整合。
- 純本機歌詞匯入、編輯、讀取與刪除。

### 2.2 可選工作流

- Lyrics：外部歌詞查詢、同步資料、讀音、提詞器與 Lyrics Overlay。
- Audio processing：pitch／tempo preview、分離 recipe、guide vocal 與選用分析。
- Public output：Setlist、Lyrics、Now Playing Browser Sources。
- Provider assist：候選搜尋、來源匯入、下載與 metadata backfill。
- External integrations：唯讀 OBS WebSocket、直播／錄影時間戳與本機 session history。

任一可選工作流在 gate 關閉或依賴缺失時，預設核心仍須可用。

### 2.3 非目標

完整清單見 [PRODUCT](../PRODUCT.md)。外部整合先以 Browser Source 與 adapters 評估，不做 OBS native plugin。

## 3. 功能現況

本表區分可執行能力、公開支援與尚缺的驗收；沒有列出的能力不因競品提供就自動成為承諾。實作、資料欄位與歷史測試細節由連結文件持有。

| 領域                      | 現況                  | 已具備                                                                                                                                                             | 驗收／邊界                                                                                                                                                                                                                                                                                                                                           |
| ------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop shell             | 已實作                | Secure preload、single instance、tray 背景執行與關閉選擇。                                                                                                         | 不含登入自啟動與 tray 播放控制。                                                                                                                                                                                                                                                                                                                     |
| 資源監視                  | 已實作                | App CPU／RAM 與 heavy job 子程序投影。                                                                                                                             | 不含整機、GPU 與 yt-dlp 程序。                                                                                                                                                                                                                                                                                                                       |
| 曲庫與資訊                | 已實作                | 本機匯入／明示相容轉檔、作品／版本／發行、資訊校對與復原；native FLAC 文字 tags 回寫。                                                                             | 封裝版轉檔矩陣待驗；其他 tags 格式、音檔封面回寫與整庫同步未開放。[校對](contracts/library-reconciliation.md)、[作品與版本](contracts/works-versions-and-releases.md)、[回寫](contracts/audio-tag-writeback.md)、[ADR 0024](adr/0024-explicit-local-audio-compatibility-transcoding.md)。                                                            |
| 集合、藝人與空間          | 已實作                | Playlists、來源專輯完整曲序／本地持有、專輯批次下載／停止／重試、藝人整理／照片、試聽與 Folder 頁面物件；分離結果安全清理。                                        | 弱 alias、本機藝人 tags 與試聽歌詞／音量控制未完成；視覺待驗。[來源曲序](contracts/release-source-catalog.md)、[藝人](adr/0022-artist-identity-and-organization.md)、[照片](contracts/artist-photo-provider.md)、[試聽](contracts/track-preview.md)、[頁面物件](contracts/folder-page-objects.md)、[空間](contracts/library-storage-management.md)。 |
| 播放與佇列                | 已實作                | Audio element 時間權威、佇列、最近播放、paused 恢復、pitch／tempo preview、Windows 控制與節拍器。                                                                  | 偶發失真根因仍未定位，真實裝置／OBS 聽感與節拍器 drift 待驗。[播放紀錄](contracts/playback-history-and-resume.md)、[失真診斷](research/engineering/playback-distortion-diagnostics-2026-10-26.md)。                                                                                                                                                  |
| BGM 待機播放              | monitor／capture 基礎 | 單來源、loop、fade／Talk／急停、位置恢復及演唱互斥交接；共用擷取裝置與獨立擷取總音量。                                                                             | Loudness policy 與實際 OBS 錄音／聽感待驗。[BGM 契約](contracts/bgm-standby-lane.md)。                                                                                                                                                                                                                                                               |
| 演出安排                  | 本地流程              | 目前／待唱／紀錄、manual 手動項目、連續播放、完成／略過／中止、封存／恢復及另存歌單；confirmed start 已接 Main 場次時間軸。                                        | 實際 OBS 連線／去重、BGM 交接及最終操作／聽感待驗。[演出安排](contracts/performance-session-preparation.md)。                                                                                                                                                                                                                                        |
| 歌詞與提詞器              | 主路徑                | T0／T1／T2、多來源、保真編輯、可撤回的 Output 文字處理、持久化聲部標註、讀音與桌面提詞器。                                                                         | 人工視覺／時間品質待驗；手機 transport 未接入。[時間](contracts/lyrics-timing-contract.md)、[文字](contracts/lyrics-text-processing.md)、[來源](contracts/lyrics-sources.md)、[讀音](contracts/lyrics-reading-quality-contract.md)、[提詞器](contracts/performer-prompter-contract.md)。                                                             |
| 聲學歌詞估計              | 實驗性 T1+            | 手動準備環境後，CPU 逐句分流中／日／英；來源版本隔離、相容舊分析及有界細時間呈現／回退。                                                                           | 正式模型 gate／預設下載與人工時間驗收未完成；句內混語與 GPU 擴充暫緩。[聲學估計](contracts/lyrics-acoustic-estimate-contract.md)。                                                                                                                                                                                                                   |
| 音訊分離                  | 基礎能力              | `quick`／`general`、DirectML→CPU 回退、guide vocal 與序列處理佇列。                                                                                                | 跨重啟／平行處理／ETA、Refined 與 pre-render 未完成。[ADR 0009](adr/0009-tiered-audio-processing-runtime.md)。                                                                                                                                                                                                                                       |
| 音樂分析                  | 可執行、待品質驗收    | BPM／節拍分析與有界 sidecar；就緒時可在匯入後背景執行。                                                                                                            | 尚未列為正式公開能力，準確度、離線、容量與 UI 門檻見[分析契約](contracts/music-analysis.md)。                                                                                                                                                                                                                                                        |
| Provider assist           | 核心路徑              | App-managed yt-dlp、YT Music 優先搜尋、recording-first 匯入／backfill、批次下載與封面候選。                                                                        | 非官方 API；不含 Spotify／Apple Music 轉換與帳號歌單。[ADR 0015](adr/0015-recording-first-provider-discovery.md)。                                                                                                                                                                                                                                   |
| OBS 輸出                  | MVP                   | 三個固定 slot、九個模板、Gallery／Workbench、字體／色票與只讀擷取視窗。                                                                                            | Default pack W3 短測已確認；alpha／跨環境／耐久待驗，Instance／Pack 未交付。[顯示契約](contracts/output-appearance.md)、[驗收](operations/output-appearance-acceptance.md#w3-收尾紀錄2026-10-21)。                                                                                                                                                   |
| OBS 整合                  | 唯讀路徑              | WebSocket 5 狀態、secure storage、本機 session history／YouTube 章節與防休眠。                                                                                     | 不提供 scene／source 寫入。[整合契約](contracts/integration-adapter-contract.md)。                                                                                                                                                                                                                                                                   |
| Feature gates／診斷／回饋 | 已實作                | 五個 gate、Main diagnostics／遮蔽匯出；四類回報強制預覽，嚴重錯誤可另行同意自動回報。                                                                              | 其他 domain 持續導入；回饋 relay 需部署設定。[診斷](adr/0008-local-diagnostics-and-error-handling.md)、[回饋](adr/0016-user-feedback-intake.md)、[自動回報](adr/0029-consented-automatic-error-reports.md)。                                                                                                                                         |
| 發行                      | 公開測試              | 截至 2026-10-26 可驗證的最新公開版為 [v0.5.0](https://github.com/yPinn/Utawakui-Releases/releases/tag/v0.5.0)；工作樹版本 v0.5.1 與其 release notes 不等於已發布。 | Unsigned channel；正式 feed 升級證據待補，signed manifest 只有 dev key。[ADR 0007](adr/0007-public-release-app-updates.md)、[ADR 0018](adr/0018-signed-update-manifest.md)。                                                                                                                                                                         |
| VOD／clip review          | 已接受方向            | 目前 history 只保存時間戳。                                                                                                                                        | 每場權利狀態與輸出 review 未實作。                                                                                                                                                                                                                                                                                                                   |
| Native adapters           | 原型                  | Windows x64 固定 `Utawakui.Lyrics` Spout2 sender。                                                                                                                 | Receiver／alpha／GPU／安裝版驗收前不列正式支援。[Spout2](contracts/integration-adapter-contract.md#spout2-native-video-profile)。                                                                                                                                                                                                                    |

## 4. 產品與資料邊界

### 4.1 曲庫

預設 library root 是 Music 目錄下的 `Utawakui`，可在 Settings 更改。檔案系統決定 track 是否存在；metadata index 只補充 scalar fields。

```text
<library>/
  library.json
  playlists.json
  folder-page-assets.json
  performance-session-plan.json
  folder-page-assets/<assetId>/image.<ext>
  tracks/<trackId>/
    audio.<ext>
    info.json
    thumbnail.<ext>
    artwork.json
    lyrics/
    analysis/
    separations/
```

- `library.json` 不保存絕對路徑；`playlists.json` 保存有順序的 collections。
- 封面、歌詞、分析與分離結果是 main-owned sidecars；renderer 只傳 track id 與產品 intent，media URL 一律經 `utawakui-media:` allowlist。
- 自動清理只動可重新產生的分離結果，預設關閉；細節見[空間管理](contracts/library-storage-management.md)。
- 需要更複雜查詢時再遷移 SQLite，不擴張 `library.json`。

### 4.2 播放與投影

- HTML audio element 是播放時間、狀態與錯誤的唯一權威；Queue 與歌詞由 renderer owner 管理。
- 最近播放、啟動恢復見[播放紀錄契約](contracts/playback-history-and-resume.md)；恢復資料不成為第二個播放權威。
- Main Projection Hub 只接受版本化投影；提詞器與 Overlay 不建立第二份播放狀態，Browser Source 通道唯讀。
- 演出安排以 occurrence 記錄每次演唱，不取代一般 Queue；BGM 不是安排項目。見[演出安排契約](contracts/performance-session-preparation.md)。
- BGM 與演唱嚴格互斥、不跨 lane crossfade，也不投影到 Queue、最近播放、章節、SMTC 或 Output。見 [BGM 契約](contracts/bgm-standby-lane.md)。

### 4.3 音訊處理

- Recipe 使用穩定 intent；renderer 不選 path、model 或執行參數，也不顯示這些內部資訊。
- 每個結果是四聲道：accompaniment L/R、guide vocal L/R。
- FFmpeg 與各 model 獨立準備、修復與移除；Provider Python 與 Audio Python 是不同 runtime family。
- 單曲與批次共用 main-owned 序列佇列，每首開始時重新檢查 gate 與依賴。
- Refined 須通過依賴、授權、離線、安全與品質 gate 才能成為產品能力。

### 4.4 Output

- Server 只綁定 loopback，以 exact route allowlist 提供資產；snapshot 不含路徑、provider payload 或任意 HTML。
- 三個固定 slot（Setlist／Lyrics／Now Playing）是 MVP 基線；模板與設定見[顯示契約](contracts/output-appearance.md)。
- 演出安排中未開始的項目不進公開輸出；confirmed playing 後才使用該次的顯示名稱。
- OBS WebSocket 是獨立、可停用的唯讀 adapter，不經 Browser Source 通道。

### 4.5 使用者回饋

四類回報共用預覽後送出；只有錯誤回報可附最近 50 筆診斷。嚴重錯誤經使用者同意可自動回報固定格式報告（[ADR 0029](adr/0029-consented-automatic-error-reports.md)）。不受 gate 保護，強制預覽即為防護。Relay、速率限制與回報碼見 [ADR 0016](adr/0016-user-feedback-intake.md)。

## 5. Feature Gates

| Gate                    | 保護的動作                            | 依賴原則                                                                                |
| ----------------------- | ------------------------------------- | --------------------------------------------------------------------------------------- |
| `provider-flow`         | 外部候選、下載、來源匯入與 backfill   | Provider runtime 原子準備；不阻擋本機匯入；瀏覽器登入資料重試另需設定同意（預設關閉）。 |
| `lyrics-flow`           | 外部歌詞查詢與保存                    | 每次外部請求都在 main 再檢查。                                                          |
| `audio-processing-flow` | 分離、本機音樂分析與未來 pre-render   | FFmpeg 與各 model 各自管理；缺一項只影響該能力。                                        |
| `public-output-flow`    | 啟動 Output server 與發布狀態         | 內建 Overlay 不需外部 binary；stop／status 永遠可用。                                   |
| `obs-integration`       | 連線 OBS 並讀取直播／錄影狀態與時間戳 | `obs-websocket-js` 隨 App 提供；密碼只進 OS-backed secure storage。                     |

Gate confirmation 只保存 featureId、notice version、時間與 enabled，不保存權利判斷，也不取代 main 的 trust boundary。語意見 [PRODUCT](../PRODUCT.md#feature-gate-語意)。

## 6. 方向與優先順序

投入順序以現有播放可靠性與完整演出操作為先，不承諾日期。競品研究提供需求證據，不自動改變產品範圍；功能現況只以上表為準。

### 6.1 既有能力：穩定與驗收優先

- 優先定位偶發播放失真，補真實裝置、擷取與 OBS 的同步證據；不把局部路由修正當成根因已解決。
- 補齊 BGM 交接／擷取聽感、節拍器 drift、歌詞／提詞器／Workbench／OBS 可見驗收與演出耐久。
- 延續 startup、封裝邊界、依賴／資產／授權稽核與 installed-upgrade 驗收；已完成量測作為基線，不反覆列為新功能。
- 完成缺檔、損壞 sidecar、依賴修復與曲庫維護的復原路徑；擴大 diagnostics 覆蓋。
- Signed manifest 正式啟用前仍需 active／recovery key、protected environment、signing secrets 與真實升級證據。最新公開版、候選版及已驗證範圍分開記錄。

### 6.2 已接受方向：依前置條件推進

| 方向             | 後續範圍                                                          | 前置與界線                                                                                                       |
| ---------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 本地演出完整性   | 既有場次／OBS 時間軸的實機驗收；VOD／clip 狀態與輸出 review。     | 本機播放與安排不依賴 OBS；review 政策另定。                                                                      |
| 手機遙控／提詞器 | 延續既有手機操作與讀詞規劃，共用 Performer presentation。         | 桌面提詞器已存在；手機 pairing／權限／撤銷與 transport 未接入，不暴露現有唯讀 Output 為控制 API。                |
| 音訊準備與設定   | Pitch／tempo pre-render cache、preset 匯出入。                    | 非即時變調的重做；保存範圍、缺曲 remap 與結果生命週期另定。                                                      |
| Output 外觀交付  | Instance、受限 Presentation Pack／User Variant 與逐模板藝術改善。 | 依 ADR 0011／0027 與[外觀交付標準](governance/appearance-sets-plan.md)分期；帳號、付款與遠端取得不隨之自動啟動。 |
| 曲庫細節         | 跨語言弱藝人證據、本機 tag 與翻唱歸屬。                           | 延續已保存的人工校對與作品／版本邊界，不重做既有曲庫能力。                                                       |

### 6.3 等待條件與暫緩範圍

- 曲目準備與首次操作引導等待視覺定案；不因競品改版而提前增加引導工作。
- BGM 先完成現有單 deck／capture 驗收；loudness policy 需明定，A／B deck 與曲間 crossfade 再依需求評估。
- Refined 須先通過授權、離線、wheel、容量、失敗復原與品質門檻，才可成為可選 recipe。
- 句內混語、歌詞分析 GPU 與模型文字預處理維持研究限制；實驗結果不等於正式採用或新下載承諾。
- Provider 與官方 metadata 整合維持 optional；可選服務失效不擴大到本機核心。

## 7. 尚待產品決策

### 7.1 既有方向的未決細節

1. VOD／clip 權利狀態每場確認，或保存可重用的 session preset？
2. Preset 匯入遇到缺曲時提示、略過或 remap？
3. Official Presentation Pack 與 User Variant 的版本、簽章、分享與取得／復原邊界？
4. Refined 的品質與容量門檻？
5. BGM 的 accompaniment／loudness policy 與預設 capture profile。
6. 演唱工具「歌詞」頁與曲庫歌詞編輯的分工：現行來源切換、讀音產生與編輯超出 [ADR 0023](adr/0023-renderer-destination-and-workspace-model.md) 的現場職責。

### 7.2 系統與環境

1. 直播期間是否抑制 App 或系統通知？
2. 啟動完整 i18n，或先依 OS locale 處理數字／日期？
3. 偵測系統字型供 Lyrics／Overlay，並檢查 CJK 缺字？
4. 控制台主題是否跟隨 Windows 深淺色？
5. Per-monitor DPI 與提詞器／Workbench 跨螢幕重算？
6. 是否投影 Windows 減少動態效果設定？

### 7.3 研究候選：尚未接受為開發路線

Owner 已要求依序開始規劃，前三項已有小規格，快捷操作有範圍提案；其餘仍待研究，全部未實作、未承諾交付日期。排序與進入條件見[順序規劃](research/product/player-practice-planning-2026-10-26.md)，與既有手機規劃、等待視覺的引導分開。來源與採用理由見[競品研究](research/product/competitive-research.md#5-對-utawakui-的產品含義)。

| 候選                    | 要先回答的問題                                                                                                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 逐曲演唱設定            | 已開始規劃草案：Key／微調／速度與監聽導唱開關；比例與裝置保留機器偏好，明確保存、套用與暫時覆寫。[第1項規格](research/product/player-practice-planning-2026-10-26.md#1-逐曲演唱設定)。                |
| 區段練習                | 已開始規劃草案：A–B、重播前等待、單一 transport 與 BGM／歷史邊界；精度需原型驗證。[第2項規格](research/product/player-practice-planning-2026-10-26.md#2-區段練習)。                                   |
| 歌詞對時確認            | 已開始規劃草案：既有 editor 的波形／人工確認，依來源與時間修訂失效，不將估計升格為 T2。[第3項規格](research/product/player-practice-planning-2026-10-26.md#3-歌詞對時確認)。                          |
| 可自訂／全域快捷操作    | 已定義第一階段命令與衝突／焦點驗收，未實作全域註冊。[第4項提案](research/product/player-practice-planning-2026-10-26.md#4-可自訂全域快捷操作)。                                                       |
| 本機影片擷取音訊        | 是否有足夠 MP4／MKV 等自備素材需求，值得擴充明示轉檔入口？不由此擴張成影片播放器。                                                                                                                    |
| 衍生音訊節省空間        | 保留原始素材的前提下，分離與未來 pre-render 結果能否減量並維持四聲道、seek、變調品質與可靠性？既有清理不重列新功能。                                                                                  |
| Mic 音準視覺化          | 單獨評估只讀輸入分析的練習價值、參考旋律、延遲校準與串音；不以分數／榜單為目標。                                                                                                                      |
| Mic 音量驅動畫面        | 以輸入電平控制裝飾幅度、密度或亮度，是否改善指定畫面的演出表現？與音準分析獨立驗證。                                                                                                                  |
| 原生音訊與可寫 adapters | 只有經驗證需求才評估 OBS 原生音訊、OBS 寫入、VTube Studio 或 Stream Deck；需各自的命令、故障與依賴邊界。[研究](research/product/competitive-research.md#52-原生-obs-音訊仍是高成本候選不是追趕項目)。 |

無伴奏／自行伴奏已有 manual 項目與明確開始／完成，列回既有能力；定時結束另議，不新建平行模型。[入口與驗收覆核](research/product/player-practice-planning-2026-10-26.md#5-無伴奏演出既有能力覆核)。

Mic 尚未實作輸入、軟體監聽或錄音。音量候選使用 dBFS／正規化相對電平，不視為已校準環境聲壓；需噪聲門檻、平滑起落、強度上限、獨立開關與失訊回基準，並遵守減少動態效果。歌詞時間、可讀性與播放狀態保持原權威；適用模板、輸入權限生命週期及只傳有界強度摘要的投影另行驗證。輸入分析、視覺反應、評分對齊與人聲監聽往返延遲分開，不宣稱已解決硬體監聽延遲。成績比較／排行榜與遊戲化回饋目前不投入；整體非目標仍見 [PRODUCT](../PRODUCT.md#明確非目標)。
