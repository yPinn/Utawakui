# Output 外觀契約

三個 slot、八個模板的可調欄位、本機來源與預覽一致性。分階段計畫見[外觀 set 計畫](../governance/appearance-sets-plan.md)；傳輸與頁面生命週期見 [Output runtime](output-runtime.md)；可見驗收見[驗收清單](../operations/output-appearance-acceptance.md)。

## 權威

- 執行時由 [outputAppearance.mjs](../../shared/outputAppearance.mjs)、[模板 registry](../../shared/outputTemplateValues.json)、[timing 能力](../../shared/presentation/lyricsTemplateCapabilities.mjs) 與 main／Overlay 驗證決定。Main 在儲存邊界驗證、renderer 依模板欄位清單產生控制、Browser Source 再次正規化後才投影為 `--ovl-*`。
- [固定基線](../../scripts/fixtures/output/appearance-baseline.json)是測試期望，不是第二套 runtime 設定；改能力時須明確審閱基線差異。`npm run output:baseline` 唯讀核對，不啟動 App 或 OBS。
- CSS layer 順序：`ovl-reset`、`ovl-fallback`、`ovl-semantic`、`ovl-template`、`ovl-appearance`、`ovl-constraints`，四個 HTML route 以相同順序載入。Fallback 是內建復原基線，不是 Style Set。
- 沒有全域主題或跨模板同步。最近／常用色票只是選色工具。切模板時，仍等於舊預設的值跟隨新模板預設，合法自訂值依既有 carry 規則與正規化決定是否保留。

## 欄位與分級

- **default**：不需額外資產即可用的初始值。
- **opt**：使用者另選的值；原本就有安全預設。
- **advanced**：已驗證 consumer 的模板才有的藝術角色覆寫，仍有值域。
- **invariant**：App 持有的時序、幾何、source mapping 與安全規則，外觀不能改。
- **not-exposed**：目前沒有 consumer，不代表永遠禁止。

| 欄位                                             | 分級／預設                        | 範圍                                                                                  |
| ------------------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------- |
| paletteId／lookAmount                            | opt；original／100                | original、warm、cool、monochrome、high-contrast；0–100 step 5，混合語意角色而非透明度 |
| fontScale                                        | default；medium                   | small／medium／large，各模板對應自己的尺寸                                            |
| fontFamily                                       | opt；依模板                       | 列明的字型角色；只有 Live Stage 另接受已驗證的本機已安裝字型                          |
| fontWeight                                       | opt；依模板                       | regular／semibold／bold                                                               |
| contrastStyle                                    | opt；balanced                     | clean／balanced／strong-outline；只有 Live Stage                                      |
| surface                                          | opt；solid                        | transparent／soft／solid；queue-board、cover-player                                   |
| spacingDensity                                   | opt；normal                       | compact／normal／relaxed；只有 queue-board                                            |
| furigana                                         | opt；auto                         | Manga 的 auto／off；只顯示既有讀音                                                    |
| kineticMaterial／kineticArrangement              | opt；candy-rim／straight          | 三個既有材料或 cycle；straight／subtle-offset                                         |
| textColor／accentColor                           | advanced；#fff8ec／#ffffff        | Ornate 的六位 Hex，拒絕 CSS 函式與路徑                                                |
| positionAnchor／positionOffsetX／positionOffsetY | opt／advanced；center-right／0／0 | Ornate 只開右上／右中／右下，X −12%～12%、Y −25%～25%                                 |
| lyricsPresentationPolicyId                       | opt；broadcast-compact            | Live Stage 的 broadcast-compact／balanced／literal，屬內容呈現 policy                 |
| captureSize                                      | 依 registry                       | 只開放各模板支援的尺寸                                                                |

`alignment`、`contentWidth` 存在於 schema，但八個模板都未公開。控制依「配色、自訂色、字體、可讀性、背景、版面、動態、內容」分組，空組不顯示。

## 八模板

共同預設為 original Look、強度 100、medium 字級；下表只列差異。

| 模板／capture              | 可選與初始值                                                   | Invariant                                                    |
| -------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------ |
| queue-board／480×810       | 字型 sans、字重 semibold、背景 solid、密度 normal              | current／played membership、history 分頁接續                 |
| karaoke-stack／1920×1080   | 只有共用 Look／字級                                            | 雙 lane、count-in、timing mask、字型角色                     |
| kinetic-pop／1920×1080     | 材料 candy-rim、排列 straight                                  | 三層 paint order、phrase source boundaries                   |
| ornate-vertical／1920×1080 | 字型 ornate／antique；兩色與右側位置                           | 直書、至多兩欄、grapheme 分組；不消費 T2，行級回退           |
| live-stage／1920×1080      | 字型 sans／本機字型；對比 balanced；文字策略 broadcast-compact | Title-card 時窗、caption 分頁、U／UW 標記；不可換 logo／背景 |
| manga-frame／1920×1080     | 字型 antique／sans／serif／rounded；字重 bold；reading auto    | Ruby atomicity、框內安全版面、bubble timing                  |
| art-card／480×270          | 字型 sans、字重 bold                                           | 唱片 playhead、封套交換、驗證過的 artwork route              |
| cover-player／480×540      | 字重 bold、背景 solid                                          | 同一 artwork route 與進度權威                                |

Setlist 只公開目前演唱曲目與已唱紀錄，不投影待唱。480×810 是擷取尺寸而非固定版面：queue-board 以約兩成高度保留目前歌曲，其餘給已唱紀錄，兩區只以固定 spacing 分隔；最近八首依播放順序向下排列，超出時才自動垂直滾動。

## 歌詞模板呈現

歌詞呈現分兩層：`lyricsTimingUnits.mjs` 只把 T1 fallback 切成無語意的 `{ text, weight }` 單元，原文換行、空白與標點無損附著；`lyricsPresentation.mjs` 再依版本化的 Generic／KTV／Kinetic Pop／Ornate Vertical／Manga／Live Stage profile 解讀為 phrase、role、bubble 或 caption page。Browser Source 依 document id、revision、language 與 profile 快取靜態結果，`state.mjs` 投影動態 frame 與下一個 boundary。`lyricsTemplateCapabilities.mjs` 是各模板 T1／T2、source mapping、music cue 與 scheduler wake 的唯一宣告。模板分句不回寫 canonical timing，T2 永遠優先；raw LRC／VTT parser 不進模板。

- **karaoke-stack**：封裝 justfont open-huninn 2.1（OFL 1.1）；唯一消費 beat phase 與段落的模板（見[音樂分析](music-analysis.md)）。
- **live-stage**：轉播精簡（移除可判定的 filler、連續重複與 CJK 顯示標點）、平衡分行、忠實原文三個 policy，都保留 canonical `sourceText` 與 line／segment identity。Caption 先列出 1／2、2／1、2／2 候選，依容量、作者與跨語邊界、附著性與幾何選解，不為個別歌曲加例外。多頁且有 T2 時以 `lyricsSourceMapping.mjs` 映回來源區間插值，失敗才用 T1 權重。
- **manga-frame**：依 document language、實際假名或既有讀音投影 `ja`／`other`。預設封裝 GenEi Antique 6.0a，可改 sans／serif／rounded；ruby 繼承對話框字體。可從 `lyrics.document` 取得已存在且 identity 相符的日文讀音；publisher 只讀 sidecar，不為 OBS 啟動讀音 worker。
- **ornate-vertical**：以 grapheme 保留原文，連續漢字為一個 reveal 單元、假名逐字、標點附著前一單元、拉丁字母與數字成詞；整份文件最多一個漢字群組成為同尺寸藝術詞。長句依原文斷點、標點與日文詞邊界拆成至多兩欄，不切連續漢字、不建立新 timing。`ornateVerticalMotion.mjs` 提供 Browser Source 與 Gallery 共用的 stagger／裁切揭示，不用位移旋轉縮放；換句時舊句完整淡出後新句才進場，seek、來源中斷與 reduced motion 直接 commit。字型為封裝的 Hina Mincho 與 GenEi Antique。
- **kinetic-pop**：依 source line index 輪替三種材質；每個計時行任一時刻只有一列，行內作者空白編譯成依字重分配 `lineProgress` 的連續 phrases，有 T2 時以 source mapping 對齊起點。無空白的過長內容須由上游斷行，模板不以第二列掩蓋。Glyph 以輸出畫布為中心，超寬內容向兩側等量溢出。`kineticPopMotion.mjs` 共用 28ms 內重複的 burst delay 與可選的八相位 rest pose（「端正」為零偏移，「些微偏移」才保留傾斜、基線與尺寸差）；三個材質 track 共用每字姿態，fill 先畫、細白 stroke 後畫。字型為 M PLUS Rounded 1c 與 Keifont。
- **混語長句**：`lyricsPhraseBreaks.mjs` 提供最多兩段的顯示候選，只在來源 T2 或已套用 T1+ 的精確起點切換；無時間、粗詞塊或過快切換保留整句，不插值。Kinetic Pop 與來源視窗的預覽共用同一組時間。

所有封裝字型、來源 checksum 與授權位於 `shared/assets/fonts/`，只經 Output server exact allowlist 提供，Renderer 預覽與 Browser Source 用同一份檔案，不依賴遠端 webfont。GSAP recipe 持有可中斷的 playhead、sequencing、reduced motion 與清理，CSS 持有版面、材質與靜態狀態，兩者不同時控制同一屬性。

## 本機字型與圖片

| 來源                        | 現況                                                                  | 界線                                                                     |
| --------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 內建字型與圖形              | 既有模板使用，依原授權交付                                            | 不可由 set 覆寫到任意路徑或外網                                          |
| 已安裝字型                  | Live Stage 明確操作 `queryLocalFonts`；只對可信控制台 main frame 允許 | 不在啟動時列舉；只存 family／postscriptName／style；Overlay 不能列舉字型 |
| OBS 端字型                  | CSS 嘗試所選 family 再 fallback                                       | 不保證與控制台相同；不傳字型檔補齊                                       |
| 字型檔、背景／logo 圖片選檔 | 未實作                                                                | 未來須 main picker、格式／大小驗證、受管 asset id 與使用權處理           |
| 曲目／藝人圖片              | 曲庫自己的匯入流程；Output 以 track id 走安全 route                   | 不打包進可分享 set                                                       |
| 含使用者素材的分享包        | 未實作                                                                | 不帶入本機路徑、字型目錄或私人圖片                                       |

Main 的相容儲存可能保存未公開的 scalar；只保存在 `overlays.json` 不代表是可用來源。新增來源能力須同時有 main 驗證、模板 consumer、回退、授權與測試。

## 預覽

`shared/presentation/outputPreviewScene.mjs` 提供唯一的合成場景 `showcase-t1-v1`：固定時間 2026-10-20T00:00:00Z，paused 5 秒／長度 32 秒，自製日文 T1 與讀音、示範曲目與目前／已唱／待唱項目，不摘錄真實歌曲。`createOutputPreviewScene()` 直接呼叫 canonical frame selector，同一 snapshot、時間與設定得到相同 frame；空 snapshot 得到空 frame。

| 入口             | 資料                                               | 界線                                 |
| ---------------- | -------------------------------------------------- | ------------------------------------ |
| Gallery 動態縮略 | 共用合成場景，以該模板預設設定投影                 | 示意，不是播放器                     |
| Gallery 靜態縮圖 | 原有內建圖片                                       | 只作風格參考                         |
| Workbench        | 正式 Output iframe，讀 main 保存的 slot 與真實投影 | 不自動塞示範；自訂外觀以此為確認依據 |
| 正式 OBS Output  | 正式 route 與真實投影                              | 缺內容時顯示空態，不顯示示範         |
| `preview=1` 頁   | 有 live frame 時顯示 live，空時用共用示範          | 不混入 Workbench 或複製給 OBS 的 URL |

- Workbench URL 先清除 query／hash 再加受控參數；OBS 複製 URL 只附 layer 名稱與尺寸，由 main 推導。
- Gallery 為 static-first、lazy Mockup；hover 250ms 啟動，觸控與 reduced motion 不自動播放。

縮略的已知限制（正式驗收以 Workbench／Output 為準）：

| 模板            | 縮略限制                                        |
| --------------- | ----------------------------------------------- |
| queue-board     | 連續 CSS 捲動，不是 runtime 的逐列分頁與 reveal |
| karaoke-stack   | 掃色為示意，未消費逐字 progress                 |
| kinetic-pop     | 循環不是整首 scheduler                          |
| ornate-vertical | 固定循環 offset，正式依來源時間換詞             |
| live-stage      | 固定時刻的標題卡與 caption                      |
| manga-frame     | 可同時顯示全部 bubble，非逐框交接               |
| art-card        | 文字代封面、簡化唱盤                            |
| cover-player    | 文字代封面；靜態時間正確，動態進度非時鐘        |

## 驗證

相鄰測試比較八模板 canonical frame、設定正規化、V3 讀音 document、空態、Vue reactive prop 與 URL 隔離。`createAcceptanceMatrix()` 產生逐模板的適用 case 與證據層級；純投影通過不代表 runtime 或人工驗收完成，也不代表作品可上架。真實 OBS、透明合成與長時間效能仍待驗證。
