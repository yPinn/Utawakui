# Performer 提詞與窄域控制契約

本契約定義 Performer surface 的 presentation、同步微調與 responsive 共用邊界。它不把 Self-View 升格為第二個播放器，也不開放手機或 LAN 寫入通道。

## 產品模式

提詞器只有一個入口：`src/entries/prompter/index.html` 與相鄰的 `main.js`。Main 從 `shared/rendererEntries.json` 推導 development URL 與 `dist/` 下的對應 HTML，視窗由 `electron/main/windows/prompterWindow.js` 管理，仍使用 `electron/performerPreload.js`。原根目錄 HTML 與 `src/performer-main.js` 不再提供平行入口；這次搬遷不改模板、動畫或任何 intent 語意。

共用品牌由 `shared/appIdentity.json` 定義，中文角色為控制台／提詞器／輸出，工程角色為 `main`／`prompter`／`output`。提詞器 native icon 與控制台共用 ICO，HTML favicon 使用同一品牌 PNG；兩者經不同載入機制解析。既有 `performer-view:*` IPC、`UtawakuiPerformer` bridge 與設定鍵保持相容，不因角色命名另存設定。

主題與讀音沿用既有 owner；`performerReadingScale`、`performerWindowBounds` 仍為提詞器專用。置頂只在 manager 存活期間記憶，不跨 App 重啟持久化。共用品牌不合併 preload、權限或視窗生命週期；公開 Output 仍使用獨立模板設定與視覺 tokens。

`PerformerSurface` 接受顯式 `mode`，目前 Electron shell 使用 `prompter`。`remote` 與 `combined` 是未來 transport adapter 可使用的組合語意，不得由 viewport 寬度自動推測。

| Mode     | 主要責任                           | 本切片狀態                                            |
| -------- | ---------------------------------- | ----------------------------------------------------- |
| prompter | 目前／下一句、讀音、狀態與同步微調 | Electron Performer 已接入                             |
| remote   | 操作優先的窄域遙控                 | 只保留 component contract，未接 transport             |
| combined | 寬型平板的讀詞與控制組合           | 可組合 layout；限定本機播放／暫停，未接遠端 transport |

閱讀距離另以 `near`、`desk`、`stage` 三段顯式設定，依 surface 保存。Responsive reflow 只改變排列、空間與操作目標，不改變 mode，也不自動猜測觀看距離。切換閱讀距離只重組讀詞 typography、line measure 與 cue rhythm，不得改動 Electron window bounds。

## 顯示層級

Performer 是讀詞工具，不是資訊 dashboard。目前句是唯一高顯著層；目前讀音、下一句與下一句讀音以字級、字重與間距建立層次，資訊文字仍須在當下背景達到正常文字 4.5:1 或大字 3:1。次要資訊使用 `--ui-performer-secondary-foreground`，不以全域 subtle 色或 opacity 降低整區可讀性。次句假名在 near／desk／stage 使用 14／16／18px，獨立於目前句的 55% ruby 比例。曲名／藝人、播放狀態、Key／Tempo、同步微調與閱讀距離屬 quiet edge chrome，不得回復為與歌詞競爭的框狀 status chips、全寬分隔或裝飾 surface。

控制仍須持續可見並保有完整 focus、disabled、saving、error 與 retry 狀態；低干擾不等於 hover-only 或隱藏功能。下一首等 optional context 只有真實資料存在時才渲染，不以「未排定」或空容器長期占位。

顯示設定沿用 `UiPopover` 的 panel style 介面，以 feature width token 約束在 15rem，保留共用 viewport cap／scroll，使用語意 border 輪廓；錯誤文案換行而不擴寬浮層。浮層標籤用 muted 角色。共用 `UiSegmentedControl` 的 selected foreground／indicator tokens 分別擁有文字與可辨選取邊界，不在 feature 以 deep selector 改 paint。Offset 儲存失敗沿用 `UiNotice` 的 danger 表面、正常文字及重試 action。

## 權威與資料流

HTML audio element、`usePlayer`、`usePlaybackQueue` 與 `useLyrics` 保持唯一 renderer owner。主 renderer 產生版本化 Performer snapshot；main 驗證後交給 sandboxed Performer window。Performer 只從 snapshot 建立 pure frame，不維護播放 clock 或 lyrics document。

讀音顯示沿用歌詞頁的 `useLyricsReading.variant` session preference，不在提詞器另存一份。
Snapshot 的 `readings.variant` 只接受 `off`、`furigana`、`romaji`；舊 snapshot 缺欄位時回退 `off`，main 拒絕其他已提供值。
Pure frame 對目前與下一句一併套用選項：關閉時不顯示讀音也不提示缺讀音，假名只提供 ruby，羅馬字只提供輔助文字行。
切換時透過現有 snapshot publisher 更新已開啟的提詞器；關閉後重新開啟使用目前選項，閱讀距離與歌詞 offset 不受影響。

底部 `PerformerActionBar` 使用正式 `UiButtonGroup` 組合播放控制、歌詞同步及顯示工具，三區間使用垂直 `UiSeparator`。
播放／暫停各自只發出固定 `play`／`pause` intent，仍由主 renderer 的 HTML audio element 與 `usePlayer` 執行，不提供切歌、seek 或第二個播放狀態。
讀音與閱讀距離收在「顯示設定」`UiPopover`；讀音選擇使用 `reading-off`／`reading-furigana`／`reading-romaji` action 回到同一個主 renderer owner。
顯示設定使用 `closeOnScroll: false`：snapshot、讀音準備狀態、背景捲動及讀音／閱讀距離變更均保留展開；外部 pointer、trigger toggle 與 Escape 才關閉。這與控制台的歌詞、欄位及密度設定採相同策略，不改變共用 Popover 的預設或 Action Menu 契約。
新的固定 `performer-view:control` 僅授予 Performer main frame，preload 只傳 action、revision 與 track id；main 驗證後轉送主 renderer。
播放操作驗證最近發布的 revision 與目前曲目，讀音操作另外驗證目前歌詞曲目、來源及可用選項；視窗關閉後拒絕新操作。
讀音準備沿用 `useLyricsDisplay`，其 detached scope 由提詞器生命週期擁有，讓主頁不在歌詞頁時仍能載入／缺檔才產生；關閉時停止該 scope，不建立第二份偏好或文件。
Snapshot 的 `readings.availableVariants`、`preparing` 與 bounded `error` 只投影目前設定能力與準備狀態；圖示使用可存取名稱、Tooltip、鍵盤焦點及 disabled 狀態。

同步控制只允許 `delay`、`reset`、`advance`、`retry` 四種 action。Intent 只包含 action、snapshot revision 與 track id，不包含 filename、path、任意秒數或 IPC channel。Main 驗證固定 schema 後轉送主 renderer；主 renderer 必須同時確認：

- revision 仍存在於最近發布的 bounded context；
- intent track、發布時 player track、發布時 lyrics track 與目前兩個 track 相同；
- 發布時與目前 selected lyrics source filename 相同。

任一條件不成立即拒絕。通過後才呼叫既有 `useLyrics.adjustOffset(-0.1／+0.1)`、`resetOffset()` 或 `retryOffsetSave()`；持久化仍走原本 track＋source 的 main-owned sidecar 路徑。

Snapshot 的 `controls.lyricsOffset` 只投影 `available`、`saving` 與最長 240 字元的 public error。沒有同步歌詞、目前 track 不一致或沒有 selected source 時必須 fail closed，並清除 saving／error。實際 offset 繼續使用 `state.lyrics.offsetMs`。

## Component reuse 分級

| 等級 | 可共用內容                                                                  | 不應混入                                |
| ---- | --------------------------------------------------------------------------- | --------------------------------------- |
| A    | Cue、track context、next track、sync、display controls 與 `Ui*` primitives  | Electron window lifecycle、pairing      |
| B    | `PerformerSurface` 的 props／emits、mode、reading scale 與 container recipe | 裝置 transport、來源 filename           |
| C    | Bounded intent interface；Electron IPC 與未來 mobile adapter 分別實作       | 任意 channel、任意 offset write         |
| D    | Shell-local chrome：Electron titlebar、未來 mobile pairing／safe-area host  | OBS Overlay renderer 或 `--ovl-*` token |

所有 surface 直接組合 `PerformerSurface`；已無相容 wrapper。Electron toolbar 永遠屬於 window shell，不進入共用 surface。

## Token reuse 分級

Foundation 與 control semantics 使用既有 `--ui-*`。Performer feature aliases 使用 `--ui-performer-*`，包括三段 cue／reading size、line measure、cue gap 與 action minimum block size。Reading scale 只切換 feature aliases，component 不寫 page-local 顏色。

| Reading scale | Current cue | Comfortable cue gap | Line measure |
| ------------- | ----------- | ------------------- | ------------ |
| `near`        | 2rem        | 16px                | 72rem        |
| `desk`        | 2.5rem      | 24px                | 64rem        |
| `stage`       | 3.5rem      | 32px                | 56rem        |

距離專屬 cue gap 只在 surface 高度至少 30rem 的 comfortable tier 生效；較短 surface 收斂為 16px，避免最小 Electron window 與 mobile landscape 被 stage spacing 擠壓。Track context、utility controls 與 control target 不隨閱讀距離放大。

Desktop 沿用 `--ui-control-height`；coarse pointer 將 Performer action minimum block size提升為 `--ui-control-height-live`（44 CSS px）。Public OBS Overlay 繼續只使用獨立 `--ovl-*`，不得引用或覆寫 Performer token。

## Responsive contract

`PerformerSurface` 自己建立 named size container，內層 layout 接收 container query。這是必要邊界，因為 container query 不能替 container 本身改樣式。

| Specimen         | 最小驗證                    | 期待行為                                          |
| ---------------- | --------------------------- | ------------------------------------------------- |
| Mobile portrait  | 320 CSS px                  | 單欄、可換行、safe area、無 hover 依賴            |
| Mobile landscape | 568×320 CSS px              | 短高度收斂間距，cue region 保持可捲動             |
| Tablet／combined | 約 768 CSS px 以上          | 同步與閱讀設定可並列                              |
| Electron minimum | 800×360 window              | Toolbar 外，surface 不溢出且控制可操作            |
| Electron default | 960×540 window              | 讀詞優先，cue 周圍保留 comfortable breathing room |
| Stage display    | 1920×1080 CSS px equivalent | `stage` scale 可讀，line measure 維持上限         |

所有互動須保留原生 button／radiogroup keyboard 行為、visible focus、disabled、saving、error 與 retry 狀態。控制不得只在 hover 時出現。

Surface 高度達 30rem 時使用 comfortable spacing tier，增加 perimeter、major row 與 current／next cue 間距；短高度仍以 24rem 以下的 compact tier 收斂。留白必須來自 container-aware rhythm，不以絕對定位、固定 offset 或隱藏 controls 製造。

`PerformerSurface` 的歌詞、狀態與控制 caption 屬即時操作 chrome，surface root 必須同時使用 prefixed／standard `user-select: none`，避免觸控滑動、拖移與連點時意外反白。此規則不得外溢到全域、可編輯 Lyrics workspace、OBS Overlay 或 surface 外的公開錯誤 notice。

## Electron window geometry

首次開啟使用 960×540，800×360 是安全下限而非可見 preset。`near`／`desk`／`stage` 不自動縮放視窗；需要占滿舞台螢幕時使用既有明確 fullscreen action。本切片不提供尺寸 switch 或 preset menu。

Normal window bounds `{ x, y, width, height }` 由 Electron main 驗證並保存到 config；renderer 不得提供 geometry intent。Move／resize 使用 bounded debounce，close 時 flush 最後的 normal bounds；fullscreen 與 maximized bounds 不得污染保存值。

每次建立視窗都以目前 display work area 重新檢查保存值，保留 32px 可見 margin，並處理螢幕移除、工作列位置與 DPI 改變。沒有有效保存值時，使用 960×540 並置中於主視窗所在 display；可用空間小於安全下限時仍優先保留 800×360 的操作契約。

## Mobile transport 邊界

本契約不授權把 Performer preload、loopback Output WebSocket 或 renderer IPC 暴露到 LAN。手機控制需要另一個產品與 security 決策，至少定義 pairing、authentication、session expiry、network binding、read／write channel 分離與撤銷。完成該決策前，mobile work 只能重用 presentation contract、components、tokens 與 bounded intent interface。
