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

- 本機音訊匯入、結構化曲庫、metadata、縮圖與 playlists。側欄可用一層資料夾整理自建 playlists：拖到列中間是加入、列之間是排序；專輯拖進資料夾會建立同名、同封面的播放清單；刪除資料夾會一起刪除裡面的播放清單。
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

v0.5.3 已發布，使用者可見範圍見[發行說明](releases/v0.5.3.md)。下表保留 v0.5.2 基線與 v0.5.3 的已實作差異，供回歸查核。後續開發與驗收歸入 v0.6.0，以已發布的 v0.5.3 作升級基準。

| 領域               | v0.5.2 公開基線                                                                       | v0.5.3 已實作                                                                                                 | 驗收與使用邊界                                                                                                                                                                                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 桌面與設定         | Windows 主視窗、系統匣、工作列／媒體控制、App CPU／RAM。                              | 繁中／English 介面，重啟套用；Output 語言獨立且即時套用。設定重分組，關閉提示說明背景與伴奏處理選項。         | 英文介面逐頁與安裝版視窗生命週期待驗。[語言 ADR](adr/0032-ui-and-output-languages.md)                                                                                                                                                                                                                        |
| 曲庫與試聽         | 本機匯入與相容轉檔、作品／版本／發行、資訊校對、FLAC 文字標籤、歌單／藝人與曲目試聽。 | 側欄播放清單資料夾、曲目表欄位保存、同步歌詞試聽與獨立音量。可匯入風格候選並逐曲校對。                        | 試聽已有局部切曲驗證，封裝版轉檔與介面仍待驗。風格標籤分開保存候選與人工結果。[歌曲電台](#621-曲庫風格標籤與歌曲電台)仍待試聽評分。[試聽](contracts/track-preview.md) · [轉檔](adr/0024-explicit-local-audio-compatibility-transcoding.md) · [曲庫校對](contracts/library-reconciliation.md)                 |
| 外部來源與匯入     | 選用的 YT Music／YouTube 搜尋、批次下載與資訊補全。                                   | Firefox 登入或匯入加密保存的登入檔；手動下載仍先走一般路徑。批次進度分組，可重試未完成項目。                  | 登入是選用備援，依來源及登入有效性而定。[下載與登入](adr/0005-python-ytdlp-provider-engine.md)                                                                                                                                                                                                               |
| 播放、排練與快捷鍵 | 播放／佇列恢復、變調／速度／導唱、逐曲三組設定、A–B 練習、節拍器與主視窗快捷鍵。      | 演出待唱操作整合、右側佇列切換、節拍器及擷取音量顯示調整。                                                    | 監聽的短暫無聲、雜訊與延遲待定位；裝置耐久與節拍漂移待驗。背景快捷鍵仍未開放。[播放](contracts/player-audio-controls.md) · [背景快捷鍵](contracts/global-keyboard-shortcuts.md)                                                                                                                              |
| 場間音樂           | 單來源循環、伴奏優先、可開導唱，與演唱互斥。                                          | 待唱面板可展開換曲、拖曳進度、調音量。                                                                        | 共用擷取為預設，監聽／OBS 電平、交接與長時聽感待驗。[場間音樂](contracts/bgm-standby-lane.md)                                                                                                                                                                                                                |
| 演出場次與 OBS     | 本機演出安排、手動項目、封存與恢復；選用的唯讀 OBS 狀態及直播／錄影時間。             | 收播提醒後由使用者確認封存；曲庫可查場次，歌單保留原封存場次連結。可貼 YouTube／Twitch 回放並匯出章節或 CSV。 | Twitch 手動貼連結已有桌面驗證。公開下載版採手動連結；平台自動查詢、整場收播與時碼對照仍待驗。[場次與匯出](contracts/performance-session-preparation.md)                                                                                                                                                      |
| 歌詞與提詞器       | 本機歌詞、多來源搜尋、酷狗逐行備援、讀音與桌面提詞器；波形、句級對時與人工確認。      | 本機校訂、逐句打點、單曲 LRC／SRT 匯出及影片版的本機繁中／英文譯文。                                          | 實曲片段與 Shotcut 匯入已抽驗，漸弱尾音仍需人工判斷。[歌詞來源](contracts/lyrics-sources.md) · [對時確認](contracts/lyrics-timing-review.md) · [本機譯文](contracts/lyrics-timing-contract.md#local-translation-data)                                                                                        |
| OBS 畫面輸出       | 歌詞、歌單與播放中三個固定輸出，共九款模板。                                          | 新增黑板直書、中央直書、演出票根及紅黑緞帶，共十三款。和風直書換句及無結束時間的尾句退場改善。                | 新直書有局部 OBS 取樣；完整模板、透明合成與跨環境耐久待驗。[模板與外觀](contracts/output-appearance.md) · [實機清單](operations/output-appearance-acceptance.md)                                                                                                                                             |
| 音訊分離           | `quick`／`general` 序列處理、導唱、DirectML 與建立失敗時的 CPU 回退。                 | 沿用 WAV。                                                                                                    | 使用 0.5.2 版號的隔離封裝曾完成 OBS 錄影下的整批效能驗證；該證據來自公開 tag 後的快照。隔離工廠已有 FLAC 5 驗證及 WAV 回退，公開入口維持關閉。[DirectML 驗收](adr/0017-directml-execution-provider-for-mdx-separation.md#batch-queue-and-obs-acceptance) · [輸出格式](contracts/separation-output-format.md) |
| 診斷與回饋         | 功能啟用確認、遮蔽敏感資訊的診斷匯出、回饋預覽與同意後的自動錯誤回報。                | 功能告知及常用錯誤訊息補上英文。                                                                              | 回饋 relay 依部署而定。[回饋](adr/0016-user-feedback-intake.md) · [自動回報](adr/0029-consented-automatic-error-reports.md)                                                                                                                                                                                  |

另有開發或隔離功能。聲學歌詞估計可手動準備環境並逐句執行，正式模型下載與人工時間品質仍待驗；BPM／節拍分析已有可執行路徑，公開前需通過準確度、離線及介面驗收。原唱音高預覽、Mic 電平與 Spout2 仍屬開發或原型，Mic 監聽／錄音與正式 Spout2 支援尚未開放。[聲學估計](contracts/lyrics-acoustic-estimate-contract.md) · [音樂分析](contracts/music-analysis.md) · [原唱音高](research/audio/reference-pitch-note-boundary-summary-2026-11-06.md) · [Mic](contracts/microphone-level-research.md) · [Spout2](operations/manual-acceptance.md#spout2)

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

| Gate                    | 保護的動作                            | 依賴原則                                                                                                                   |
| ----------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `provider-flow`         | 外部候選、下載、來源匯入與 backfill   | Provider runtime 原子準備；不阻擋本機匯入；下載失敗時的 YouTube 登入（Firefox 或匯入的登入檔案）需在設定選擇，預設不使用。 |
| `lyrics-flow`           | 外部歌詞查詢與保存                    | 每次外部請求都在 main 再檢查。                                                                                             |
| `audio-processing-flow` | 分離、本機音樂分析與未來 pre-render   | FFmpeg 與各 model 各自管理；缺一項只影響該能力。                                                                           |
| `public-output-flow`    | 啟動 Output server 與發布狀態         | 內建 Overlay 不需外部 binary；stop／status 永遠可用。                                                                      |
| `obs-integration`       | 連線 OBS 並讀取直播／錄影狀態與時間戳 | `obs-websocket-js` 隨 App 提供；密碼只進 OS-backed secure storage。                                                        |

Gate confirmation 只保存 featureId、notice version、時間與 enabled，不保存權利判斷，也不取代 main 的 trust boundary。語意見 [PRODUCT](../PRODUCT.md#feature-gate-語意)。

## 6. 方向與優先順序

先驗收現有演出流程，再依前置條件推進已接受的方向。

### 6.1 既有能力：穩定與驗收優先

1. 完成一場本機 OBS 錄影。固定曲目、裝置及場景，對照原曲／分離曲的監聽、擷取與 OBS 實收，記錄異常的時間與路徑。聲學延遲另以實體量測判定。[實機清單](operations/manual-acceptance.md#local-performance-pass) · [失真排查](research/engineering/playback-distortion-diagnostics-2026-10-26.md)
2. 在同一場核對場間音樂交接、換曲、歌詞／提詞器、收播提醒、封存、貼回放與匯出。用實際素材核對直播／錄影時碼，再測長時節拍、裝置耐久與 OBS 字幕合成。[場次驗收](contracts/performance-session-preparation.md#驗收) · [Output 驗收](operations/output-appearance-acceptance.md)
3. 用 v0.6.0 候選安裝包驗收從已發布 v0.5.3 覆蓋安裝、冷／暖啟動、關閉與恢復。複核雙語長字串、窄窗、登入遷移、封裝版轉檔與依賴／授權清單。公開通道目前沿用未簽章流程。[封裝驗收](operations/manual-acceptance.md#packaged-windows) · [發行手冊](operations/release-runbook.md)
4. 補齊缺檔、損壞 sidecar、依賴修復與曲庫維護的復原流程。先確認原資料保留與可重試，再擴大診斷覆蓋。[曲庫空間與維護](contracts/library-storage-management.md)

### 6.2 已接受方向：依前置條件推進

| 方向             | 下一步                                                                                           | 前置條件                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| 本地演出與回放   | 在已驗收的場次時間軸上補 VOD／clip 狀態與輸出 review。                                           | 一般權利告知採版本化的一次確認，保留重開說明入口；個別素材權利由使用者確認。                                                 |
| 手機遙控／提詞器 | 定義手機選取連線、遙控與讀詞的最小流程，共用桌面提詞呈現。                                       | 先定配對、權限、撤銷與傳輸；保持現有 Output 唯讀。                                                                           |
| 音訊準備與設定   | 評估新分離結果的受控 FLAC 5／WAV 回退，並分別定義變調／速度預渲染與 preset 匯出入。              | 先驗品質、取消與失敗復原；定保存與缺曲處理，既有音訊保留原格式。[音訊處理 ADR](adr/0009-tiered-audio-processing-runtime.md)  |
| Output 外觀交付  | 分期定義 Instance、Presentation Pack／User Variant 與逐模板改善。                                | 先定可分享範圍、取得與復原；帳號、付款與遠端取得各自決策。[外觀交付計畫](governance/appearance-sets-plan.md)                 |
| 曲庫細節         | 先驗[曲目演唱語言](#622-曲目演唱語言)，再推進[曲風覆核與歌曲電台](#621-曲庫風格標籤與歌曲電台)。 | 沿既有人工校對與作品／版本關係保存證據。歌曲電台的預設排序等試聽評分。[作品與版本](contracts/works-versions-and-releases.md) |

逐曲設定、區段練習、對時確認及快捷鍵的驗收案例沿[排練規劃](research/product/player-practice-planning-2026-10-26.md)推進。

#### 6.2.1 曲庫風格標籤與歌曲電台

原 31 首高分候選暫停採用。曲風預覽分為父類、主要曲風、次要風格和製作影響，來源證據與模型分數分開。先用不同藝人、發行和錄音版本驗證各標籤的誤標及覆蓋，再決定批次採用範圍。[曲庫盤點、詞表與試聽研究](research/audio/library-style-taxonomy-2026-11-08.md)

Ballad 的上下文試作仍維持唯讀預覽。固定回歸正例覆蓋 2/11，留出覆蓋 0/2，兩首版本疑義可略過。下一輪先補可獨立裁決的正例及同錄音證據。[Ballad 回歸與留出](research/audio/library-ballad-holdout-2026-11-08.md)

風格標籤與歌曲電台依下列順序推進。

1. **風格候選與校對。** 曲目詳細資訊分開顯示候選和已確認標籤。使用者可接受、修正、略過、移除或新增標籤，可保留未標註狀態。以少量可辨識的風格為主，語言、市場及版本各自表達。內嵌曲風、下載來源明示曲風及模型推估各自保留來源，平台分類與自由關鍵字保留為來源資訊。曲庫篩選使用已確認的風格。
2. **保存與自動候選。** 人工結果與可重算候選分開保存，由 main 管理曲庫 sidecar。模型候選記錄音訊識別、來源、模型／詞表版本和分數。音檔換版後舊候選待覆核，重新分析保留人工修正與駁回。候選分析使用選用的本機能力，依賴缺失時仍可人工編輯、搜尋和播放。原音檔、內嵌標籤及下載的 `info.json` 都維持唯讀。先驗證保存／重啟、重跑、換檔與失敗復原，再開放批次候選。[曲庫校對](contracts/library-reconciliation.md) · [本機分析保存](contracts/music-analysis.md)
3. **歌曲電台。** 從單首種子列出曲庫內最多十首可播放的相似曲，可沿用曲目試聽，並由使用者選擇加入既有播放佇列。候選不足時顯示實際首數。已確認同作品的版本用作品關係去重。正式排序待試聽評分後再定。先用相同片段比較兩組排序，依語言、曲風與版本記錄相近、普通、不相近，並記錄同藝人集中與同作品重複；選定候選後以未參與選擇的種子複驗。驗收前排序僅供試聽比較。[作品與版本](contracts/works-versions-and-releases.md) · [曲目試聽](contracts/track-preview.md)

#### 6.2.2 曲目演唱語言

語言描述這個錄音版本實際唱或說唱的內容。歌名與藝名文字的語系、歌詞的書寫系統及翻譯語言、曲風與市場各有自己的欄位。不同語言的翻唱版本分開確認。

- 語言首版用 BCP 47 識別碼，先涵蓋華語 `cmn`、粵語 `yue`、臺語 `nan-TW`、日語 `ja`、韓語 `ko` 和英語 `en`。只確認為中文但未分辨口語種類時保留 `zh`。繁簡是文字的書寫系統。可清楚辨認的其他語言保留對應識別碼。[BCP 47](https://www.rfc-editor.org/rfc/rfc5646.html) · [語言代碼說明](https://www.loc.gov/standards/iso639-2/faq.html)
- 單語記一項。兩種以上語言各自承擔一段可辨認的演唱或說唱時，列出所有語言，主語言可留空。零星借詞、短口號和藝名不構成混語。證據不足或互相衝突時標為待確認。確定音源沒有語言內容時才用 `zxx`，缺少歌詞時保留待確認 `und`。[ISO 639-2 特殊代碼](https://www.loc.gov/standards/iso639-2/faq.html)
- 以人工試聽確認優先。明示錄音語言的發行資料、已核對為同版本的原文歌詞可提供候選證據。歌詞須先區分原文、翻譯與音譯。歌名、藝人國籍、下載分類和未核對的歌詞只供查找。保存時分開記錄確認狀態與證據，綁定音源版本。
- 先在隔離資料用單語、混語、翻唱改語言、譯詞及無歌詞的樣本做唯讀對照，分開計算單語錯判、混語漏標和待確認比例。曲庫語言篩選以已確認資料為準，可提供「含此語言」及「主要語言」兩種條件。歌曲電台的語言條件待試聽後再決定。

隔離批次預覽只預勾證據一致的單語候選，逐首可取消或修正。正式演唱語言待試聽覆核。[語言盤點與試聽樣本](research/audio/library-style-taxonomy-2026-11-08.md#階段整理)

### 6.3 等待條件與暫緩範圍

| 項目                             | 恢復投入條件                                                                                                                                                                                    |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 曲目準備與首次操作引導           | 等視覺及入口定案，再用首次操作驗證。                                                                                                                                                            |
| 簽章更新                         | 準備正式／復原金鑰、受保護環境與簽署憑證，再以實際 feed 驗證升級。[簽章 ADR](adr/0018-signed-update-manifest.md)                                                                                |
| 背景快捷鍵                       | 逐命令通過持鍵、焦點、Tray 復原等 Windows 平台驗收，才開放 opt-in。                                                                                                                             |
| 場間音樂分軌、響度及交叉淡入淡出 | 完成單來源與共用擷取驗收，量測主播放／場間音樂的監聽、擷取及 Mic 退避，再依需求評估。                                                                                                           |
| Refined 分離                     | 通過授權、離線、依賴、容量、失敗復原與品質門檻。                                                                                                                                                |
| 分離排程擴充                     | 先釐清跨重啟復原、平行處理的資源上限及 ETA，再決定是否排入。                                                                                                                                    |
| 回放平台自動查詢                 | 先有可用憑證、真實平台與權限驗證，再決定公開範圍。                                                                                                                                              |
| 聲學歌詞與原唱音高研究           | 句內混語、GPU 與模型文字預處理維持研究。原唱停唱遮罩及音符切段依獨立標註與留出結果決定是否重開。[原唱音高重開條件](research/audio/reference-pitch-note-boundary-summary-2026-11-06.md#重開條件) |

## 7. 尚待產品決策

### 7.1 既有方向的未決細節

- Preset 匯入遇到缺曲時，如何提示、略過或重新配對。
- Presentation Pack／User Variant 的版本、簽章、分享、取得與復原規則。
- 演唱工具的歌詞頁保留哪些現場操作，以及哪些來源、讀音與編輯工作回到曲庫。[工作區 ADR](adr/0023-renderer-destination-and-workspace-model.md)
- 手動演出項目的定時結束，以及暫停、背景與重啟時的行為。[無伴奏演出覆核](research/product/player-practice-planning-2026-10-26.md#5-無伴奏演出既有能力覆核)
- 依[試聽評分](#621-曲庫風格標籤與歌曲電台)決定電台排序、同藝人上限及多樣性。先以實曲檢查跨語言偏差，再決定候選詞表的合併與門檻。

### 7.2 系統與環境

- 是否在直播期間抑制 App 或系統通知。
- 是否偵測系統字型與 CJK 缺字，以及跟隨 Windows 深淺色與減少動態效果。
- 提詞器與 Workbench 跨螢幕時，如何處理不同 DPI。

### 7.3 研究候選：尚未接受為開發路線

| 想法                    | 下一步或採用前條件                                                                                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 字幕風格候選            | 固定起點的片語歌詞先比較直式頂線、字區容量與細時間回退。其他款式沿候選索引補齊構圖、資料能力與可調項。[字幕候選](research/design/lyrics-overlays/README.md)    |
| 本機影片擷取音訊        | 先確認自備影片的實際需求、格式與保存方式，再評估擴充明示轉檔。                                                                                                 |
| Mic 電平畫面            | 延續 R02 開發原型，先量測真實裝置、串音、延遲及與 OBS 同開的成本。[Mic 研究](contracts/microphone-level-research.md)                                           |
| Mic 音準視覺化          | R03 先驗參考旋律、輸入時間與音高校準，再評估呈現。評分與競賽暫緩。[排練研究](research/product/player-practice-planning-2026-10-26.md#8-mic-音準視覺化研究方案) |
| 原生音訊與可寫 adapters | 先有具體需求證據，再定義失敗處理、授權和控制邊界。[競品與技術研究](research/product/competitive-research.md#52-原生-obs-音訊仍是高成本候選不是追趕項目)        |

#### 7.3.1 曲庫風格與電台的研究及依賴

- 沿用現有 `music-metadata`（MIT，約 1.3k GitHub stars）唯讀提取內嵌曲風，及 Microsoft `onnxruntime-node`（MIT，約 22k）執行 Windows CPU 推論。兩者都已在專案依賴中。Windows 安裝版仍須驗證模型啟動、離線、資源限制及演出中播放穩定度。[標籤解析](https://github.com/Borewit/music-metadata) · [ONNX Runtime](https://github.com/microsoft/onnxruntime) · [官方 Node.js 套件](https://onnxruntime.ai/docs/get-started/with-javascript/node.html)
- MTG Essentia（約 3.8k）提供當輪實測的 Discogs-EffNet，可同時提取風格分數與相似度所需的音訊特徵。保留為離線比較基準。模型權重標示 CC BY-NC-SA 4.0，Essentia 程式庫為 AGPL-3.0。公開交付前須核對指定權重、預處理程式與發行方式的條件，評估取得適用授權或更換模型。[Essentia 專案](https://github.com/MTG/essentia) · [官方模型與授權](https://essentia.upf.edu/models.html)
- Navidrome（約 25k）與 AudioMuse-AI（約 2.9k）的 Instant Mix 已用曲庫音訊產生相似曲佇列，可參考種子曲入口和接續播放。AudioMuse-AI 的 Windows 發行包含資料庫、Web 介面和工作程序，第一版只參考使用流程。[Navidrome 專案](https://github.com/navidrome/navidrome) · [Instant Mix 整合](https://navidrome.org/docs/usage/integration/audiomuse/) · [AudioMuse-AI 專案](https://github.com/NeptuneHub/AudioMuse-AI)
- MusicBrainz Picard（約 5.4k）可參考其曲風詞表與來源辨識。專輯或藝人層級的曲風可作未來選用的查詢線索，曲目版本仍需個別確認。串接前需核對使用資料的授權與查詢限制。[Picard 專案](https://github.com/metabrainz/picard) · [曲風取值](https://picard-docs.musicbrainz.org/en/v3.0/config/options_genres.html) · [資料授權](https://musicbrainz.org/doc/About/Data_License) · [查詢限制](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting)
- 研究已比較不同音訊模型在推薦上的效果，也有結合歌單共同出現與音訊特徵的做法，可用來設計後續對照實驗。第一版使用本機試聽評分決定排序。LAION CLAP（約 2.3k）可作替代模型對照，官方音樂權重仍屬研究發布，檔案約 2.35 GB，暫緩部署。[音訊模型比較](https://arxiv.org/abs/2604.23077) · [歌單與音訊相似度研究](https://arxiv.org/abs/2304.12257) · [LAION CLAP](https://github.com/LAION-AI/CLAP) · [音樂權重](https://huggingface.co/lukewys/laion_clap/blob/main/music_audioset_epoch_15_esc_90.14.pt)

### 7.4 一般歡唱受眾與可選歌曲資訊

- 居家歡唱與聚會先評估本機播放資訊與唯讀選曲。多人／社交等待目標受眾與配套定案。[產品研究](research/README.md#產品與競品)
- 讀榜與自願貢獻歌曲熱度分開決策。現有播放次數只表示符合記錄條件的播放；任何上傳需獨立同意與資料契約。
- MV／影片和正式音源分開確認歸屬與同步。先決定影片來源、嵌入政策及未知版本如何處理，再評估實作。
