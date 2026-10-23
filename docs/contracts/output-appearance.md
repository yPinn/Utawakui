# Output 外觀契約

三個 slot、九個模板的可調欄位、本機來源與預覽一致性。分階段計畫見[外觀 set 計畫](../governance/appearance-sets-plan.md)；傳輸與頁面生命週期見 [Output runtime](output-runtime.md)；可見驗收見[驗收清單](../operations/output-appearance-acceptance.md)。

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
| lyricsPresentationPolicyId                       | opt；balanced                     | Live Stage 的 broadcast-compact／balanced／literal，獨立列在模板進階顯示              |
| captureSize                                      | 依 registry                       | 只開放各模板支援的尺寸                                                                |

`alignment`、`contentWidth` 存在於 schema，但九個模板都未公開。控制依「配色、自訂色、字體、可讀性、背景、版面、動態、內容」分組，空組不顯示。

每個欄位另宣告 [ADR 0027](../adr/0027-output-template-elements-and-property-workspace.md) 的定義屬性；`group` 仍只決定 Inspector 分組，畫面與儲存不受這些屬性影響。

| 屬性     | 值與目前規則                                                                                                                                                                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `family` | document：Look、強度、字級、讀音、歌詞呈現策略；swatch：兩個自訂色；character：字型、字重；legibility：對比、文字材質；fill：背景；layout：對齊、密度、內容寬度、文字排列、出紙方向、位置與微調；motion：回顧開關與間隔。stacking、visibility、asset 尚無欄位 |
| `scope`  | 上表欄位皆為 `template`；元素屬性為 `element`，見下方「元素層級設定」                                                                                                                                                                                         |
| `tier`   | `advanced` 只有 textColor、accentColor、positionOffsetX、positionOffsetY，與上表分級一致；其餘為 `basic`                                                                                                                                                      |
| `reflow` | 會讓文字重新排版的欄位（字級、字型、字重、讀音、歌詞呈現策略與 layout 中改變尺寸者）為 true；位置、色彩、背景、材質與動態為 false                                                                                                                             |

`receipt-setlist` 另提供 `receiptDirection`（down／up，預設down）、`receiptReview`（on／off，預設on）與 `receiptReviewInterval`（5–60秒、step5，預設15）；只公開這三項與字級，不顯示未消費的Look或背景控制。外觀schema 6 起提供這三項，舊欄位相容；既存間隔以新範圍正規化。

### 元素層級設定

外觀 schema 為 7。元素宣告在 [outputTemplateElements.mjs](../../shared/outputTemplateElements.mjs)，目前只有 cover-player；其他模板沒有元素層級設定。

| 元素      | 屬性                               | 備註                                     |
| --------- | ---------------------------------- | ---------------------------------------- |
| title     | fontWeight、fontSizeScale          | 不可隱藏                                 |
| artist    | fontWeight、fontSizeScale、visible |                                          |
| progress  | visible                            | 進度條與時間                             |
| transport | visible                            | 播放鍵；與 progress 都隱藏時收起整個區塊 |

- fontWeight：inherit（跟隨模板）／regular／semibold／bold，預設 inherit；fontSizeScale：80–125% step 5，預設 100；visible：shown／hidden，預設 shown。
- 儲存為 `element.<元素>.<屬性>` 扁平鍵，值存完整而非差異。Main 只保留該模板宣告的鍵；換到未宣告該元素的模板時清除。
- Browser Source 在 root 投影 `--ovl-el-<元素>-font-weight`、`--ovl-el-<元素>-size-scale` 與 `data-ovl-el-<元素>-visible`，只由 cover-player 規則讀取，不碰動畫節點。
- `ovl-constraints` 的 `--ovl-text-min-size`（0.75rem）為縮小下限：元素字級不低於此值與原始字級中較小者，預設輸出不變。
- Workbench 有元素的模板在 Inspector 頂端提供「調整對象」，預設「整個模板」；選元素時只顯示該元素的屬性群組，底部「恢復模板預設」一併重設元素設定。

## 九模板

歌單slot預設為receipt-setlist，並排列於歌單模板首位；既存合法模板選擇維持原值。共同預設為 original Look、強度 100、medium 字級；下表只列差異。

| 模板／capture              | 可選與初始值                                                   | Invariant                                                    |
| -------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------ |
| queue-board／480×810       | 字型 sans、字重 semibold、背景 solid、密度 normal              | current／played membership、history 分頁接續                 |
| receipt-setlist／480×810   | 字級medium、向下出紙、回顧開啟／15秒                           | 單行優先／最多兩行省略、完成才送紙、最近100筆回顧            |
| karaoke-stack／1920×1080   | 只有共用 Look／字級                                            | 雙 lane、count-in、timing mask、字型角色                     |
| kinetic-pop／1920×1080     | 材料 candy-rim、排列 straight                                  | 三層 paint order、phrase source boundaries                   |
| ornate-vertical／1920×1080 | 字型 ornate／antique；兩色與右側位置                           | 直書、至多兩欄、grapheme 分組；不消費 T2，行級回退           |
| live-stage／1920×1080      | 字型 sans／本機字型；對比 balanced；文字策略 broadcast-compact | Title-card 時窗、caption 分頁、U／UW 標記；不可換 logo／背景 |
| manga-frame／1920×1080     | 字型 antique／sans／serif／rounded；字重 bold；reading auto    | Ruby atomicity、框內安全版面、bubble timing                  |
| art-card／480×270          | 字型 sans、字重 bold                                           | 唱片 playhead、封套交換、驗證過的 artwork route              |
| cover-player／480×640      | 字重 bold、背景 solid                                          | 同一 artwork route 與進度權威                                |

Setlist 只公開目前演唱曲目與已唱紀錄，不投影待唱。480×810 是擷取尺寸而非固定版面：queue-board 以約兩成高度保留目前歌曲，其餘給已唱紀錄，兩區只以固定 spacing 分隔；最近八首依播放順序向下排列，超出時才自動垂直滾動。

Now Playing 的 `art-card` 與 `cover-player` 共用 `artwork-overlay` 結構及 `artwork.css`，沒有第二份 compact renderer。舊 `now-next` id 在設定讀取邊界回退為 `art-card`，不再交付舊版 HTML／CSS 分支。

`cover-player` 採使用者確認的Apple Music參考比例：專用portrait擷取480×640，舊medium設定正規化為portrait；medium本身仍為480×540。封面方形、曲目資訊靠左，單行超長省略；字級基準為曲名22px、藝人18px。背景依既有封面取色產生暗色暈染，透明／柔和背景仍可選。細進度條與剩餘時間跟隨播放器權威；僅保留上一首、播放／暫停、下一首三個圖示及音量外觀。這些是只讀Output的非互動圖示；音量列同步App主音量與靜音，播放／暫停符號跟隨實際狀態。音量為0或靜音時顯示靜音符號，靜音時滑塊歸零，解除後恢復原設定；沒有音量資料的舊來源保留該列空間但不顯示數值或符號。隱藏transport時一併隱藏音量列。封面沿用已驗證media route，缺圖用曲名首字；不交付參考截圖或其專輯美術。

Gallery 的 CoverPlayerPreview 沿用相同 480×640 畫布比例，以 canvas 單位縮放封面、metadata、16px 時間行框、進度與控制列；詳細預覽與 16:9 縮圖容器都保留完整直式版面。進度填色與圓點共用同一有界 scene progress，不以假循環或封面位移動畫改變此版型；預設示範封面仍使用既有曲名首字與 feature 色彩 tokens。

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

相鄰測試比較九模板 canonical frame、設定正規化、V3 讀音 document、空態、Vue reactive prop 與 URL 隔離。`createAcceptanceMatrix()` 產生逐模板的適用 case 與證據層級；純投影通過不代表 runtime 或人工驗收完成，也不代表作品可上架。真實 OBS、透明合成與長時間效能仍待驗證。

## 收據歌單

`receipt-setlist` 使用480×810透明外圍與無字熱感紙底圖。SETLIST與NOW PLAYING為固定區塊，不顯示播放清單名稱或曲目計數；向下為預設，向上另選。紙卷側保留76px安全區，文字避開陰影。短曲名自然一行，長曲名最多兩行、第二行末省略，原唱一行緊接下方；缺原唱保留該行。最新端依實際列高取完整可見項目，不為短曲名保留空白第二行。一般播放歷史可顯示但不視為確認完成。演出安排只以completed項目產生內部已唱總數與明細；略過、中止不列印，最後一首已完成但沒有下一首仍可顯示。

完成一項僅將該項從固定印字邊界送入歷史，不重印整張，送紙距離使用該項實際高度。定時回顧僅於溢位時啟動，預設15秒。回顧期間同一DOM清單在固定viewport內連續位移，不切頁、不改裁切高度或重建項目；內部有界分段只用來選更舊的終點，每輪最多推進三段，長歷史下輪接續。每程依距離0.8–6秒勻速移動，抵達後停1秒，再反向連續捲回最新端；回程完成才重設間隔。新完成優先取消去程／停留／回程，回到最新端送紙並重設計時。Reduced-motion直接安置；inactive／dispose取消timer與tween，恢復或切方向不補播舊列印。

Browser Source與Vue預覽共用receiptView、receiptMotion與receipt.css。正式回顧最多最近100筆來源確認明細，來源總數另計；不是無界整場歷史瀏覽。實機OBS alpha與使用者視覺驗收另記，不以單測／截圖代替。

紙面採已確認的淡紙紋：`receipt-grain.png`以0.32圖層opacity、multiply輕疊，並以既有`receipt-paper.png`的alpha作mask；單次覆蓋、不重複接縫。紋理在文字下方且不隨歷史捲動改變，紙邊輪廓與排版維持原樣。

切歌文字共用`createSetlistCurrentMotionController`的fade-only交接，只作用於曲名與原唱：160ms淡出後才commit新frame，再260ms淡入；NOW PLAYING標籤與紙面不位移。交接時一併commit該frame的歷史，避免先換文再補動畫。一般播放時鐘更新不重播；快速連切保留最新pending frame，recovery／停用直接安置，reduced-motion改為120／180ms淡出淡入。

字體與對齊以480px寬度為基準：SETLIST採等寬22／30px、600字重、0.04em字距並置中；NOW PLAYING維持16／22px靠左。目前曲名26／34px、600字重，明細曲名20／26px、400字重，原唱18／22px。序號欄右對齊並與曲名第一行共用基線，續行與原唱保留同一文字起點；列高仍依實際字型量測，不固定回兩行槽位。
