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

## 開發版跟唱

提詞器預設「讀詞」。「跟唱」共用歌詞、閱讀距離與底部控制，在上方增加音高圖，沿主播放器的媒體時間顯示目前曲目。此階段使用音訊曲目。

- **畫面** — 八秒視窗向左捲動，掃條固定在填色邊緣，未啟用即時麥克風時位於左側三分之一。導唱膠囊以等高圓角框呈現目標半音，內帶是中心上下各 50 音分。當前音符加重中性框線。原唱細線預設顯示，可在顯示設定關閉並保留選擇。細線以分離導唱的逐幀估音畫出，保留音分與膠囊外的起音、轉音和弱尾，前後各有四格穩定且音高相近時，可接過單一 16 ms 估音缺格。較長空白、確認無人聲及相鄰估音大幅跳動處斷線。實唱線在最上層。超出譜面的實唱在上下緣以梅紫色短線提示。整首導唱扣除「無人聲」標記後的主要音域加上下餘量決定固定刻度，各八度只標 C。疑似短碎框在膠囊投影省略，已唱框降低對比。譜面保留顫音與句首標記。
- **播放線填色** — 導唱膠囊以背景區分待唱和已通過。前方採表面色，已通過的部分採高對比主題色。即時麥克風啟用時，掃條、分色邊緣及當前音符框共用固定緩衝位置。輸入未啟用時直接使用顯示位置。音準內帶以細線標出，原唱和實唱曲線疊於背景上。暫停凍結填色，跳轉時直接對應新位置。減少動態效果仍保留同一進度提示。
- **掃條光效** — 播放中掃條後方保留固定的主題淡色。導唱膠囊的起點過線時，膠囊內靠起點的區域以主題色亮起並淡出，沿用標準動效 token。固定淡色與膠囊閃光均與歌詞時間層級無關。逐字底線和音高圖的逐字背景使用有效的逐字時間。原唱曲線繪於光效上方，只隨譜面捲動。暫停和跳轉清除閃光，減少動態時保留掃條、固定淡色和膠囊填色。
- **同步** — 歌詞、逐字提示與譜面共用跟唱的顯示位置。跟唱播放中讀取變調處理器回報的延遲，以實際播放速度換算成歌曲時間，再套到顯示位置與麥克風取樣對位。原調直通時變調延遲為零，變速由播放元素的速率推進。即時麥克風開啟時，共用畫面預留 80 ms 繪製緩衝，掃條與膠囊再預留固定 70 ms。輸入仍按取樣窗中心定位，曲線與電平在同一條掃條裁切。超過緩衝的輸入留白，掃條位置維持穩定。暫停凍結顯示位置，跳轉或音訊路徑改變重新對齊。手動麥克風位移與歌詞 offset 依各自原有設定套用，麥克風位移同樣按實際播放速度換算。顫音記號與膠囊共用掃條時間亮起。小節首拍畫細線，其餘拍點畫底部刻度；缺少可信節拍資料時沿用音高格線。
- **輔助顯示** — 小節線和拍點退到背景。麥克風電平尺和電平歷史預設顯示，可在顯示設定分別關閉並保留選擇。電平尺與底部操作同列，下一首資訊顯示於上一列。隱藏電平尺時，下一首回到底部操作列。電平歷史與音高圖共用時間軸和游標，高度沿用電平尺的 −60 至 0 dBFS 刻度。音高無法判定時仍顯示電平。麥克風電平歷史以狀態色區分音高可用、低於門檻或未判出音高、接近削波。實唱線使用梅紫色，導唱膠囊保留主題色。底部工具列左側的資訊按鈕直接開啟譜面圖例，不暫停播放。
- **導唱** — 開發版分離成品發布後，Main 排程準備選用版本的導唱音高。提詞器重用有效快取，或等待同一個準備工作。設定的音訊處理區可檢查並補齊既有曲目的導唱音高。各入口重查 gate、依賴和來源。原調音高與適用的歌聲活動遮罩分開快取，缺少適用遮罩時沿用原調分析。[分析準備](../../prototypes/reference-pitch/README.md)
- **跟唱工具** — 首次進入可見的跟唱頁啟用系統預設麥克風，之後沿用本機的啟用選擇與裝置。收音中可手動切換裝置、即時調整麥克風增益及低切，切換降噪會短暫重開所選輸入。電平區塊上排顯示擷取裝置，下排為 −60 至 0 dBFS 的整數刻度。綠黃紅電平分區在 −20 和 −9 dBFS 交界，尺上另有 −55 dBFS 估音和約 0 dBFS 削波停估標記。輔助技術仍可取得精確電平與削波峰值。收音只在提詞器記憶體，離開跟唱、隱藏或關閉時停止。跳轉、切曲或 Key／速度變更清除舊實唱線。同步位移預設 0 ms，正值延後跟唱曲線。本機保留增益、低切、降噪和同步位移。[麥克風契約](microphone-level-research.md)
- **Live 對照** — 選擇已對齊的單聲道 WAV 後，預設開始 SwiftF0 離線估音，可切換 YIN 即時對照。離線結果依同一檔案時間軸顯示，保留音分和低可信度留白，分析後同次載入可直接切換和跳轉。WAV 選擇與分析狀態集中在跟唱工具，譜面沒有選檔及播完提示。WAV 與結果只在本機記憶體，切曲或離開跟唱時清除。
- **內部複核** — 開發環境以 `UTAWAKUI_GUIDE_SEGMENT_REVIEW=1` 啟動後，跟唱工具才顯示「檢查這段」。暫停主播放器後可選段、試聽三軌和對照音高。同一分離版本的「無人聲」標記會讓膠囊和原唱曲線留白。與「有人聲」或「不確定」重疊時，該區間沿用自動分析。已確認的八度誤判可在同一版本選段升降八度。既有標記直接作用於導唱顯示。
- **技巧提示** — 開發版可讀同一曲目及分離版本的本機複核資料。符合已複核區段的顫音符號提前出現，短線末端對準量到的起點。確認誤標時可依符號類型與原位置隱藏該符號。

## 顯示層級

同曲有可讀歌詞時直接以歌詞作主要內容，不以「等待下一句」取代。首句開始前預顯第一句與下一句，句間保留最近已到的句子，下一句起點才切換，末句結束後保留末句；T0 先顯示第一個可讀行，不自動製造時間。閱讀位置與實際演唱活動分開，保留文字不表示仍在唱；沒有曲目、來源不符或沒有可讀歌詞才顯示對應空狀態。

目前詞只用靜態底線，不連續填色或累積劃線。主 renderer 重用 `useLyrics.localLyricsFrame` 的原生 T2／已套用 T1+ cue；沒有可靠時間、空白、fine evidence 的已知停頓與句間皆不標詞。`lyricsCueTextGroups` 與歌詞閱讀頁共用文字／讀音交界分組，保留原文及 ruby；一個時間詞可跨讀音區塊，沒有讀音不能補造逐字時間。歌詞與羅馬字保留原有換行，長句依可用寬度平衡換行，容量量測沿用可見歌詞的換行樣式。容量分頁只裁切可見文字範圍，不重分詞長、改時間或以換行建立新時間。下一句保持純文字／讀音。

Performer 是讀詞工具，不是資訊 dashboard。目前句是唯一高顯著層；目前讀音、下一句與下一句讀音以字級、字重與間距建立層次，資訊文字仍須在當下背景達到正常文字 4.5:1 或大字 3:1。次要資訊使用 `--ui-performer-secondary-foreground`，不以全域 subtle 色或 opacity 降低整區可讀性。次句假名在 near／desk／stage 使用 14／16／18px，獨立於目前句的 55% ruby 比例。曲名／藝人、播放狀態、Key／Tempo、同步微調與閱讀距離屬 quiet edge chrome，不得回復為與歌詞競爭的框狀 status chips、全寬分隔或裝飾 surface。

控制仍須持續可見並保有完整 focus、disabled、saving、error 與 retry 狀態；低干擾不等於 hover-only 或隱藏功能。下一首等 optional context 只有真實資料存在時才渲染，不以「未排定」或空容器長期占位。

顯示設定沿用 `UiPopover` 的 panel style 介面，以 feature width token 約束在 15rem，保留共用 viewport cap／scroll，使用語意 border 輪廓；錯誤文案換行而不擴寬浮層。浮層標籤用 muted 角色。共用 `UiSegmentedControl` 的 selected foreground／indicator tokens 分別擁有文字與可辨選取邊界，不在 feature 以 deep selector 改 paint。Offset 儲存失敗沿用 `UiNotice` 的 danger 表面、正常文字及重試 action。

## 權威與資料流

HTML audio element、`usePlayer`、`usePlaybackQueue` 與 `useLyrics` 保持唯一 renderer owner。主 renderer 產生版本化 Performer snapshot；main 驗證後交給 sandboxed Performer window。Performer 只從 snapshot 建立 pure frame，不維護播放 clock 或 lyrics document。

讀音顯示沿用歌詞頁的 `useLyricsReading.variant` session preference，不在提詞器另存一份。
Snapshot 的 `readings.variant` 只接受 `off`、`furigana`、`romaji`；舊 snapshot 缺欄位時回退 `off`，main 拒絕其他已提供值。

Snapshot 可選帶單一 `wordCue`：`lineIndex`、UTF-16 的 `from`／`to`、canonical `startMs`／`endMs`。Main 驗同曲、目前已發布行、完整 grapheme 邊界、非空白範圍、正長度整數時間及原行／時間上限，拒絕額外欄位；舊 snapshot 未帶此成員仍可讀。只傳目前 cue，不複製整份 timing、模型證據或 editor 草稿，不新增控制 IPC。每次發布使用既有 player sampler 的實際位置、phase、rate 與配對時間；提詞器沿原 snapshot clock 與同一個邊界 timer 在 cue 終點清除底線，晚到 snapshot 不延長舊詞。Pause 保留所在詞，seek／offset／來源變更按新投影重新判斷，不改播放或來源時間，也不將 T1+ 升格為 T2。
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
