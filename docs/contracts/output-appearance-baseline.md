# Output 顯示設定與 F1 驗收基線

日期：2026-10-20。F1 已建立測試／工具專用契約與合成情境；未改八模板外觀、renderer、儲存 schema、gate 或付款。
本契約區分目前可驗證行為與後續規劃，不因列為 opt 就新增 UI 控制。共用基礎階段與下一步仍見[現行計畫](../governance/appearance-sets-plan.md)。

## 權威與設定層次

執行時仍由 [outputAppearance.mjs](../../shared/outputAppearance.mjs)、[模板 registry](../../shared/outputTemplateValues.json)、[timing 能力](../../shared/presentation/lyricsTemplateCapabilities.mjs)及既有 main／Overlay 驗證決定。
[F1 固定基線](../../scripts/fixtures/output/appearance-baseline.json)是測試期望，不是第二套 runtime 設定；改正式能力時須明確審閱基線差異，不能讓測試即時從同一能力產生 expected。

| 層次                | 責任                                                                          | 是否自動影響其他模板                                                                      |
| ------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 專案程式共用規則    | 設定名稱、值域、Look 語意、驗證、安全、OS reduced motion、fallback 與設定群組 | 規則一致，不代表顏色／字型或版面值相同                                                    |
| 工作區偏好          | 已實作的最近／常用色票；只是選色工具                                          | 不會自動改寫所有模板配色                                                                  |
| 模板／家族能力      | 哪些欄位可調、可選項、預設及時序／幾何不變條件                                | 決定本模板可消費哪些值；設定數量不代表品質級距                                            |
| Slot 中的使用者設定 | 目前三 slot 保存所選模板、設定與 capture                                      | 不存在獨立每 set 的完整 preference profile；切模板有既有 carry 規則，不宣稱能各自完整記住 |
| 個別 set            | 未來的藝術預設、資產與在能力內的參數                                          | 不得擴大 host 權限、增加任意 CSS／JS 或更改 timing 權威                                   |

目前沒有使用者「專案檔」或全域主題繼承系統。專案等級共用在 F1 指程式／契約與工具共用，不新增自動跨模板同步。
有效呈現依序受安全／可及性限制、模板能力、合法已存值、模板預設約束；不存在的選項不因 main 保存相容 scalar 就變成可用能力。
切模板時，仍等於舊預設的值跟隨新模板預設；合法自訂值經既有 carry／新模板 normalization 決定是否保留。不是任意跨作品複製全部欄位。

## Default、opt、advanced 與鎖定的意義

- default：不用額外資產或外部服務即可使用的基線與初始值；例如字級預設 medium。不是要求所有控制都常駐。
- opt：使用者明確選擇其他值；原本就有安全預設，不等於整個欄位預設停用。例如 Kinetic 的 candy-rim 本來就有效，cycle 才是另選。
- advanced：只有已驗證 consumer 的模板提供之藝術角色覆寫，仍有值域，不能寫任意 CSS。
- template invariant：App-owned 的時序、幾何、source mapping 或安全規則，外觀包不能改。
- not-exposed：目前沒有公開可調 consumer，不推定是永遠禁止；需要個別範圍／實測才能開放。
- not-implemented／planned：尚未交付，不用 opt 字樣冒充已存在。

## 共用欄位與可調程度

下表描述目前 schema；實際可用欄位再受八模板清單限制。可選值與初始值的完整機器紀錄保留於固定基線的 fields。

| 欄位                                             | F1 分類／預設                                   | 允許程度                                                                                                            |
| ------------------------------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| paletteId／lookAmount                            | opt；original／100                              | Look 為 original、warm、cool、monochrome、high-contrast；強度 0–100，step 5。混合語意角色，不是成品透明度或影像 LUT |
| fontScale                                        | default；medium                                 | small／medium／large；各模板對應自己已編排的大小，不是任意 px／vh                                                   |
| fontFamily                                       | opt；依模板                                     | 只提供列明的字型角色；僅 Live Stage 額外接受經驗證的本機已安裝字型描述                                              |
| fontWeight                                       | opt；依模板                                     | regular／semibold／bold，只有公開該欄位的模板可用                                                                   |
| contrastStyle                                    | opt；balanced                                   | clean／balanced／strong-outline；目前只有 Live Stage 提供                                                           |
| surface                                          | opt；相關模板 solid                             | transparent／soft／solid；目前 queue-board／cover-player 提供。不能藉此改成自訂背景檔                               |
| spacingDensity                                   | opt；normal                                     | compact／normal／relaxed；目前只有 queue-board 提供                                                                 |
| furigana                                         | opt；auto                                       | Manga 的 auto／off；只顯示已有 reading，不代表提供新的讀音模型                                                      |
| kineticMaterial／kineticArrangement              | opt；candy-rim／straight                        | 三個既有材料或 cycle；straight／subtle-offset。不允許任意動畫程式或 layer 順序                                      |
| textColor／accentColor                           | advanced；#fff8ec／#ffffff                      | Ornate 的六位 Hex 角色色，拒絕 CSS 函式／路徑；既有 Look 對預設色的有效角色映射仍由 renderer 負責                   |
| positionAnchor／positionOffsetX／positionOffsetY | opt anchor／advanced offset；center-right／0／0 | Ornate 只開右上／右中／右下，X −12%～12%、Y −25%～25%，step 1；不提供任意 transform／z-index                        |
| lyricsPresentationPolicyId                       | 模板 opt；broadcast-compact                     | Live Stage 的 broadcast-compact／balanced／literal；屬內容呈現 policy，與一般外觀欄位分開驗證                       |
| captureSize                                      | 模板範圍                                        | 依 registry 固定支援尺寸，不因 UI 共用小／中／大選單就全部開放                                                      |

alignment、contentWidth 雖存在於共用 schema／相容路徑，目前八個 active 模板都未公開。它們不是可隱藏解鎖的進階功能。
本輪不擴充「基礎可調」承諾到尚無 consumer 的欄位，也不把安全／可讀性改進列為付費能力。

## 八模板的預設、選用與不變條件

所有模板共同為 original Look、強度 100、medium 字級；以下只列其餘差異。字型與字重的固定藝術實作不能由未公開的 schema 預設值推定。

| 模板／capture              | 目前可選用及初始值                                                       | Template invariants／未開放項                                                              |
| -------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| queue-board／480×810       | 字型 sans、字重 semibold、背景 solid、密度 normal                        | current／played membership、history 分頁接續；位置未公開可調，非宣稱永遠鎖死               |
| karaoke-stack／1920×1080   | 除共用 Look／字級外無其他外觀欄位                                        | 既有雙 lane、count-in、timing mask 與字型角色；不可讓外觀設定改計時或直接換任意字型        |
| kinetic-pop／1920×1080     | 材料 candy-rim、排列 straight；可另選材料／cycle                         | 三層 paint order、phrase source boundaries 與既有字型角色                                  |
| ornate-vertical／1920×1080 | 字型 ornate／可選 antique；兩色與右側 anchor／offset 如上                | 直書、至多兩欄、grapheme 分組與換行時序；T2 不消費，驗收行級回退                           |
| live-stage／1920×1080      | 字型 sans／本機已安裝字型 opt；對比 balanced；文字策略 broadcast-compact | title-card 時窗、caption 分頁、現有 U／UW 品牌標記；尚未提供替換 logo／背景圖              |
| manga-frame／1920×1080     | 字型 antique／可選 sans、serif、rounded；字重 bold；reading auto         | ruby atomicity、框內安全版面、bubble source timing；框型美術不是外部 executable            |
| art-card／480×270          | 字型 sans、字重 bold                                                     | 唱片 playhead／封套交換、validated artwork route；沒有背景或本機圖片的 appearance selector |
| cover-player／480×540      | 字重 bold、背景 solid                                                    | 同一 artwork route 與播放進度權威；沒有本機字型／背景圖片 selector                         |

T1／T2 能力與 scheduler 已逐項固定在基線；F1 不改任何材料、字型、字級換算或藝術 controller。

## 本機字型、圖片與設定來源

| 來源                           | 已實作範圍                                                                           | 必須維持的界線                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| App bundled 字型／程序圖形     | 既有模板使用，按原 license／附文交付                                                 | 不由 set 覆寫到任意路徑或外網                                                                                         |
| 使用者已安裝字型               | Live Stage 明確操作 queryLocalFonts；main 只對可信控制台 main frame 允許 local-fonts | 不在啟動背景列舉；保存有限 family／postscriptName／style 描述，不讀字型檔 bytes，不讓 Overlay／iframe 列舉本機字型    |
| OBS 所在環境的字型             | CSS 嘗試已選 family 與 fallback                                                      | 控制台選到不保證 OBS 找到完全相同字型；需實機 fallback 驗收，不傳字型檔補齊                                           |
| 使用者選取 .ttf／.otf 等檔案   | 尚未實作，舊資產安全文件描述的是未來能力                                             | 未來若開放，需 main picker、格式／大小驗證、managed asset id／hash 與使用權處理；F1 不建立 store 或新 IPC             |
| 曲目／藝人本機圖片             | 曲庫自己的 main-managed 匯入／驗證流程；Output 封面用 track id 對應安全 route        | 不是外觀包直接讀檔；不要把曲目圖片或其授權打包進可分享 set                                                            |
| set 背景／logo／材質圖片選檔   | 目前未提供通用能力                                                                   | 未來可按模板能力另作 opt；只能 main 驗證後的受管 asset id，不能 renderer path、file URL、任意 HTTPS、未核的 SVG／HTML |
| 共享／匯出含使用者素材的外觀包 | 尚未實作                                                                             | 選用本機資產不代表可再散布；不得把本機路徑、字型目錄或私人圖片帶進共享包                                              |

Main 的相容儲存目前可保存部分未公開 scalar keys；F1 不收緊磁碟 schema，也不聲稱所有未知值都在儲存時被拒絕。實際 appearance normalization／asset allowlist 不消費這些任意圖片／URL 欄位。
不得只因一個字串保存在 overlays.json 就聲稱它是可用圖片來源或新欄位。正式加入來源能力須同時有 main 驗證、模板 consumer、回退、隱私／授權與測試。

## F1 工具與驗收狀態

執行 `npm run output:baseline` 可唯讀核對八模板能力／default／值域 snapshot、必要情境及固定資料版本。工具不啟動 App／OBS、不讀真實曲庫、不列舉本機資產、不開網路或寫入設定。
情境資料在 [scripts/fixtures/output](../../scripts/fixtures/output/README.md)，涵蓋四種語言短／長內容及來源／播放／資產／動態情境；只使用原創合成文字與自製 8×8 PNG。
環境與 steps 是後續驅動器的輸入，F1 的純 projection 不會真的執行 font-denied、image-error、reconnect 或 reduced-motion 切換。

`createAcceptanceMatrix()` 產生八模板逐 case 的適用性與證據層次；非歌詞模板的 T0／T2 為不適用，Ornate T2 為 line-fallback，非封面模板不驗 artwork，非 Live Stage 不驗已安裝字型列舉被拒。
projection-only 只代表可做純投影檢查；runtime-pending、manual-pending 不因 F1 工具通過而改判。通過基線不等於前面八個作品可售，也不證明後續階段完成；F2 已採用的生命週期邊界另見 [host 契約](output-host-lifecycle.md)。
實際可見與長時間結果記錄在 dated acceptance record，不在本契約勾成已通過。
