# Token v2 元件檢查契約

Status: active staged review; F8 is the owner-facing inspection surface and does
not authorize whole-view redesign or production-wide token adoption.

本文件保存 Token v2 視覺重新設計的現行檢查順序、已確認範圍與下一個
owner decision。F8 只呈現新制定候選與現行設定的差異；F7 是後續
Studio Library／Controlled Dossier 的 View 候選，不得反過來替基礎元件定案。

## 核准順序

每一層都必須在進入下一層前完成可視檢查：

1. Foundation：色彩責任、字體、文字層級、spacing、radius、單位、核心下限與密度。
2. Primitive／Field family：基礎尺寸、min／max、父層寬度責任、owned anatomy、內容行為、狀態與 accessibility。
3. Compound component：由已核准 primitive 組成 Search、Tabs、menus、notices 等互動契約。
4. View：最後才制定完整頁面的資訊架構、密度切換條件與藝術方向。

F8 的展示順序遵守這個 gate。標本看起來完整不等於 production adoption，
也不等於 F7 View 已核准。

## 2026-09-12 階段快照

| 範圍                | 已確認／已建立                                                                                                                                          | 仍屬候選或現行缺口                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 系統預設色          | 中性低干擾 surface，以 Indigo 負責主題、選取、current 與 focus；內容類型／格式／來源預設維持 Neutral                                                    | production-wide semantic mapping 尚未採用                                                                   |
| Folder 色           | Folder 可使用 Mosby Files 式高彩度強對比，與系統預設色分責                                                                                              | F8 目前只有參考色票；正式 folder palette 與元件映射未定                                                     |
| 狀態色              | Mildliner 作色相來源而非螢光筆材質；主要訊號用原色強度，soft 只作選用背景                                                                               | Live 與 Danger 可同色但維持不同 token、形狀及標籤語法                                                       |
| 字體與文字          | Electron 使用 Windows 原生字型堆疊；Display／Emphasis 暫定 28／700；長標題維持單行截斷                                                                  | Display 日後只有在具體強調情境出現時才重新評估                                                              |
| 單位                | 字體、spacing、radius、元件幾何及 CSS breakpoint 用 rem；hairline／focus／drag 用 CSS px；Electron window 用 DIP；raster／canvas backing 用 physical px | 不得把 16px root 下的 CSS px 等值寫成 DIP                                                                   |
| 核心尺寸            | 一般操作 hard floor 32、Primary transport 44、緊急 48 CSS px；windowed／restored 使用 Compact，maximize／fullscreen 使用 Standard                       | 既有 Candidate alias 仍名為 `control-height-live`；Icon Button 不將它解讀為所有 Live action 的通則          |
| Icon Button         | active `sm` 已移除；`md` 32px、`lg` 44px，glyph 維持 16 unit；context-neutral primitive 與 parent-owned recipes 已分區並完成 owner 可視確認             | Emergency 48px variant 未映射，Current Accent／Overlay 狀態不完整；production adoption 待後續               |
| Text Action         | 預設如一般文字無底線，hover／focus-visible 顯示底線；維持 caller typography、intrinsic width、`click.stop` 與 `UiMarqueeText` overflow                  | Candidate 與 Current 的主行為已對齊；Candidate 另補 disabled 50%，production adoption 待後續                |
| Field shell         | Candidate Standard 36px／Compact 32px；現行 30px；寬度由 parent 擁有，`min-width: 0`、無 component max；readonly quiet surface 已完成跨家族候選檢查     | Candidate label／disabled select-none 與 readonly surface 尚未採用到正式 Field                              |
| Search Box          | Candidate 已定左右各 32px slot、16-unit glyph、兩側各 4px text gap、自訂 Clear、可清除互動及完整狀態標本                                                | active 仍是 30px、缺整體 hover／disabled surface、Clear hit token，且 native cancel ownership 未正式落地    |
| Text Field          | Candidate／Current 的尺寸、寬度、單行 anatomy、內容及七種狀態已檢查；readonly 採平面 quiet surface、完整文字對比與可選取／複製                          | active light placeholder 對比 4.23:1；readonly Candidate production adoption 待後續                         |
| Textarea            | rows、hard floor、soft wrap、native overflow、vertical resize、內容與七種狀態已檢查；readonly 與 Text Field 共用 quiet surface 語法                     | active hard floor 60px；readonly Candidate production adoption 待後續                                       |
| Validation feedback | 上游 issue → form controller → localized `invalid + error` → UiField；required pristine 不報錯，blur／submit 後顯示，修正後移除；Error 取代 Hint        | `auto` 是現行預設；父層 `reserved` 只是一行空間候選；未新增 Zod、正式 prop、token 或產品表單流程            |
| Select              | Candidate 36／32px、project-owned indicator、12px end inset、closed-lane ellipsis 與 overflow-only 完整值提示已完成 owner 視覺檢查                      | native popup 尺寸／option rendering 仍由 Chromium／Windows 擁有；production adoption 待後續                 |
| Checkbox            | Candidate／Current、36／32px full-row target、16px indicator、多行首行對齊、Boolean／mixed、validation 與 ARIA 已完成 owner 視覺檢查                    | Candidate custom indicator、整列 disabled 與 `indeterminate` public contract 的 production adoption 待後續  |
| Range               | Candidate／Current、36／32px full-track target、6px Candidate track／fill、16px thumb、等距 stops、validation 與 ARIA 已完成 owner 視覺檢查             | Candidate custom track／thumb／optional ticks、窄幅 value output reflow 與 production adoption 待後續       |
| Button              | Candidate／Current 36／32／30px、Primary／Secondary／Ghost hierarchy、Field 同列、內容、狀態與 native／ARIA 已完成 owner 視覺檢查                       | Current 無獨立 Secondary、authored pressed，仍有 icon-only compatibility branch；production adoption 待後續 |
| Tabs                | Candidate／Current 36／32／30px、Panel／Bar、內容 overflow、狀態、automatic keyboard activation 與真實 tabpanel 關係已完成 owner 可視確認               | 現行只管理 tab list、panel wiring 由 caller 擁有；Candidate 與 compound API 的 production adoption 待後續   |
| Chip                | Candidate Standard 24px／Compact 20px、靜態 badge／label 邊界、內容、8 semantic tones、recipes 與 ARIA ownership 已完成 owner 可視確認                  | Current 約 21.5px 且無邊界；`background`／`color` escape hatch 與 Candidate production adoption 待後續      |
| Status Icon         | Candidate Standard 24px／Compact 20px、16-unit glyph、狀態／裝飾 ARIA 邊界、8 semantic tones、motion 與 recipes 已完成 owner 可視確認                   | Current 固定 24px；`text`／`highlight` compatibility tones 與 Candidate production adoption 待後續          |

只有 Icon Button hard-floor 修正屬於這個 checkpoint 的正式 active 變更。
其餘 Candidate 標本仍由 development-only F8 與 `tokens-v2.css` 隔離；
production bundle 不含 F8 標本或 candidate token payload。

F8 已將 Foundation 至 Status Icon 的 21 個已審查 section 統一為
Candidate／Current 對照；Feedback 只完成 Chip 與 Status Icon，後續 section
維持待審查。共用比較層明確分離 Token v2 surface 與 active-token 快照，窄內容
使用 container reflow，不改動 production component。

## 已完成階段：Text Action（現行 UiTextButton）Candidate／Current 檢查

Foundation 與 Input family 已完成階段性 checkpoint `0261df5`。`UiButton` 與
`UiIconButton` 已完成 owner 可視確認；依 owner 指示只向下進入 Actions 的
Text Action 標本，並已完成本階段 owner 可視確認。其他 primitive／compound
component、production adoption 與完整 View 仍不得先進：

1. Candidate 與 Current 分區；Current 使用 active token 快照，不繼承 Candidate 色彩或狀態樣式。
2. Primitive 是「顯示文字本身就是次要目的地」的 Text Action，不是一般 Secondary Button；native `button` 只承接 action 語意，獨立 32px action 使用 `UiButton`。
3. 字型、字級、行高、字重與文字色由 caller 繼承；寬度維持 `fit-content`、`max-width: 100%`、`min-width: 0`，不新增 density、size、full-width 或 appearance API。Candidate 只擁有互動時的底線 affordance。
4. 內容只接受 `text: String／Number`；visible text 是預設 accessible name，optional `ariaLabel` 只在需要補充目的地語意時覆寫。
5. 短字維持靜態，溢位由現行 `UiMarqueeText` 擁有 marquee 與 native title；reduced motion 回到單行 ellipsis。不把啟動條件、速度或模式上提為 `UiTextButton` prop。
6. Candidate Default 無底線，hover／focus-visible 顯示一般底線，focus 另保留 2 CSS px inset ring；pressed 沿用 hover，disabled 維持無底線並降至 50%，所有狀態不位移。
7. Current 誠實保留 default 無底線、hover／focus-visible 才顯示底線，以及無 authored pressed／disabled appearance 的現況。
8. Native boundary 維持單一 `button[type="button"]`、native attrs fallthrough 與 `click.stop`；navigation intent、URL 與 row-level action 均由 parent 擁有。
9. Parent-owned recipes 獨立陳列 Track row sibling destination、Queue section 靜態 prefix＋interactive destination、Playlist table title cell；row geometry、available width、z-index 與導覽不是 primitive prop。
10. 不新增 icon、button variant、size、full-width、appearance、active、loading、readonly、permission 或 `href`；不提供 reveal／dotted／dashed，也不修改 active tokens、正式 `UiTextButton` 或 `UiMarqueeText`。本階段已完成 owner 可視確認；production adoption 仍待後續 gate。

## 已完成階段：UiTabs Candidate／Current 檢查

Text Action 已完成 owner 可視確認；依 owner 指示只向下進入 Navigation 的
`UiTabs`。F8 已建立標本並完成 owner 可視確認；不代表 production adoption，
也沒有把 Tabs presentation 當成 filter／mode switch／global navigation：

1. Candidate 與 Current 分區；Current 使用 active token 快照，保留現行 30px 與青綠 selected tile，不繼承 Candidate 的 Indigo、36／32px 或狀態補強。
2. `UiTabs` 只用於一組 tabs 控制一組互斥且相關的 tabpanels。全域 navigation、資料 filter 與 mode switch 不因外觀相似而使用 Tabs；未來 segmented control 另案處理。
3. Candidate target 依 density 為 Standard 36px／Compact 32px，Current 為 30px。Panel 使用 intrinsic width＋`max-width: 100%`；Bar 使用 parent available width；元件不建立固定 component max。
4. Tab 維持單行與 `min-width: 0`。單一長標籤靜態 ellipsis，多 tabs 超出 group 時使用 native horizontal scroll，不使用 marquee；短 CJK、長 CJK／Latin、多語、number、disabled 與 non-interactive `after` metadata 皆已覆蓋。
5. Panel 使用 neutral shell＋tonal selected tile；Bar 使用平面底線與 2 CSS px selected indicator。兩者只是 presentation variant，仍須控制真實 tabpanels。
6. Candidate 已覆蓋 default、hover、pressed、focus-visible、selected、selected-hover、disabled；focus 使用 2 CSS px inset ring，所有狀態不改變 target 幾何。Current 缺少 authored pressed，維持現況可見。
7. 維持水平 automatic activation：ArrowLeft／ArrowRight 循環、Home／End 跳轉並略過 disabled；每組只有一個 roving tab stop，方向鍵移動時同步切換即時 panel。
8. 現行 `UiTabs` 只管理 tab list；caller 仍須擁有 panel 內容、顯示狀態、唯一 ids 及 `aria-controls` ↔ `aria-labelledby` 關係。F8 每一組標本皆已接上真實 panel，以明示這項風險。
9. 不新增 vertical、manual activation、closeable、route／`href`、async panel、icon、segmented 或 feature-specific prop；不修改正式 `UiTabs`、active tokens 或既有 feature duplicates。

## 已完成階段：UiChip Candidate／Current 檢查

Tabs 已完成 owner 可視確認；依 owner 指示只向下進入 Feedback 的
`UiChip`。F8 已建立本階段標本並完成 owner 可視確認；不代表 production
adoption，也沒有藉此採用 Candidate 到正式 component：

1. Candidate 與 Current 分區；Current 使用 active token 快照，保留現行 content-driven 約 21.5px、無邊界 soft fill 與青綠／珊瑚等 active 色，不繼承 Candidate box、border 或 Indigo／Mildliner semantic mapping。
2. `UiChip` 維持非互動 native `span`，只標記系統產生的短狀態、屬性或數量。可選 filter、mode switch、dismiss、action 與 navigation 必須使用具正確 native／ARIA 行為的其他元件；外觀為 pill 不足以決定元件類型。
3. Candidate 依 density 為 Standard 24px／Compact 20px；這是 inline information box，不套用 36／32px action target floor。Current 高度由 14px label line-height、padding 與全域 border-box 共同決定。
4. 寬度維持 intrinsic、`min-width: 0`、`max-width: 100%` 且沒有固定 component max。標籤預設短而單行；必要的系統／使用者長值由 parent 限寬後 ellipsis 並提供 native title，chip group 由 parent 以 8px gap wrap，不使用 marquee。
5. Owned anatomy 只有 container、concise visible label 與 optional decorative leading icon。Icon 使用 project-owned 16-unit glyph 且 `aria-hidden`，不得建立 icon-only chip；baseline、available width、group order 與 reflow 由 parent recipe 擁有。
6. 保留 `muted`、`accent`、`current`、`info`、`success`、`warning`、`danger`、`gated` 八個現行 tone 名稱。內容類型、格式與來源預設使用 Neutral；Candidate 使用不透明語意前景＋低強度 supporting surface＋subtle border，`current` 與 `accent` 統一使用 Indigo family 並以 glyph／文案分責。顏色只加速掃描，visible label 仍完整命名狀態。
7. `gated` 表示外部來源、衍生內容或公開輸出進入需使用者確認的 feature boundary；Candidate 文案使用「需確認」，不暗示付費、權限不足、法律核准或安全判定。Current 原「需啟用」保留在快照中。
8. Plain chip 不自行設定 `role` 或 `aria-live`；可見文字就是 accessible content。動態值若需宣告，由知道更新時機與完整句子的 parent 擁有 live region；嵌在已具 accessible name 的 control 時，parent 必須確保狀態文字不遺失或重複。
9. 不新增 selected、dismissible、interactive、disabled、href 或 `role="status"` prop，也沒有 hover、pressed、focus 或 keyboard contract。`background`／`color` 仍是 Current compatibility escape hatch；Candidate 以 tone-first 顯示，是否收斂 override 留待 production migration audit。
10. 不修改正式 `UiChip`、active tokens 或 28 個現行 consumer；F8 只委派 `DemoFeedback` 的 chips section，其他 Feedback 標本維持現況。

## 已完成階段：UiStatusIcon Candidate／Current 檢查

`UiChip` 已完成 owner 可視確認；依 owner 指示只向下進入 Feedback 的
`UiStatusIcon`。F8 已建立標本並完成 owner 可視確認；不代表
production adoption，也沒有進入 `UiHint`、其他 Feedback／Content 元件或 F7 View：

1. Candidate 與 Current 分區；Current 使用 active token 快照，保留現行 24px neutral circle、語意前景及 `text`／`highlight` compatibility tones，不繼承 Candidate 的 tone-specific surface、border 或 Compact size。
2. 名稱保留 `UiStatusIcon`，不改叫 Badge 或泛化為 Status Indicator。現行 public API 必須提供 icon，責任是附著在其他內容旁的純圖示狀態；帶可見短文字／數量的 badge 仍使用 `UiChip`，互動目標使用相符的 native control。
3. Candidate 依 density 為 Standard 24px／Compact 20px，Current 為 24px；glyph 固定使用 project-owned 16 unit。這是 inline information box，不套用 36／32px action target floor，也不擁有 row 尺寸或 spacing。
4. Owned anatomy 只有 stable circle container 與 glyph。Candidate 使用 tone-specific soft supporting surface、細邊界與至少 3:1 的 graphical contrast；語意仍由 glyph shape、placement 與 concise label 共同提供，不能只靠色彩。
5. Candidate 使用 `muted`、`accent`、`info`、`success`、`warning`、`danger`、`current`、`gated` 八個 tone。內容類型、格式與來源預設使用 Neutral；`current` 統一使用 Accent／Indigo family；`live` 與 `danger` 保留獨立紅色 token、形狀與文案。Current 另誠實呈現 `text` 與 `highlight`；production migration 前將未掃描且不需立即處理的 availability 狀態映射到 `muted`，實際處理映射到 `info`，失敗才使用 `danger`，不先破壞現行 lyrics consumer。
6. `gated` 表示進入外部來源、衍生內容或公開輸出流程前需使用者確認；Candidate 文案使用「需確認」，不暗示付費、權限不足、法律核准或安全判定。
7. `spinning` 只旋轉 glyph，container 不變形；同時尊重 root `data-ui-motion="reduced"` 與 `prefers-reduced-motion`。它只表示正在處理，不建立 progress value 或 loading controller。
8. 圖示獨立承擔狀態時，以 required `label` 建立 `role="img"`、`aria-label` 與現行 native title；相鄰可見文字已完整重複狀態時使用 `decorative`，移除 role／name 並設 `aria-hidden="true"`。
9. 動態更新若需要宣告，由知道 update timing 與完整句子的 parent 擁有 `role="status"`／`aria-live`；row trail、selection、adjacent visible status 與 live region 都是 parent-owned recipes，不轉成 primitive props。
10. 不新增 action、focus、disabled、tooltip、size 或 live-region prop；Candidate 的 Standard／Compact 只存在 development wrapper。正式 `UiStatusIcon`、active tokens 與 5 個 production consumer／13 個使用點保持不變。

## 已記錄決定與後續 gate

下一個可開始的元件只有 `UiHint`。開始前仍須先檢查 active contract、Token v2
候選與 F8 specimen；不得順帶進入 `UiNotice`、`UiProgress`、Content、Overlay
或 F7 View。

| 決定                          | 建議基線                                                                                                                                               | 決定時點                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| Select trailing indicator     | Candidate closed control 使用 project-owned ChevronDown 與 12px end inset；Current 保留 native indicator                                               | Candidate 已核定；production adoption 待後續  |
| Selected value 過長           | Candidate closed lane 單行 ellipsis；確實溢位時在 hover／focus 顯示同寬靜態完整值提示，不使用 marquee；native popup 寬度仍由 UA 決定                   | Candidate 已核定；production adoption 待後續  |
| Select readonly 替代          | 不增加假 readonly prop；不可編輯值用 disabled 或非表單文字，依產品語意選擇                                                                             | Select public contract                        |
| Field readonly surface        | Candidate 的 Text Field／Textarea 使用較平 quiet surface、一般邊界、完整文字對比、可選取／複製與 focus ring；不加 lock／badge                          | Candidate 已核定；production adoption 待後續  |
| Checkbox target／indicator    | Candidate 使用 36／32px full-row target、16px project-owned Check／Minus；多行 label 對齊第一行，native input 保留互動與語意                           | Candidate 已核定；production adoption 待後續  |
| Checkbox mixed ownership      | `indeterminate` 是 caller-owned visual／ARIA projection；Boolean selection 後由 controller 清除，不建立 readonly 或 tri-state value                    | Candidate 已核定；production adoption 待後續  |
| Range track／thumb ownership  | Candidate 使用 6px project-owned base／fill、16px Chromium thumb pseudo-element、2px canvas rim 與互動 halo／ring；單一 native input 保留所有輸入語意  | Candidate 已核定；production adoption 待後續  |
| Range stops                   | 等距吸附維持 native step；3–7 個有意義 stops 可使用軌道內無標籤 ticks，不永久預留 marks row；具名／不規則 marks 延後至具體需求                         | Candidate 已核定；production adoption 待後續  |
| Range target／output          | Candidate full-track target 為 36／32px；`valueText` 同時供 output／ARIA，窄幅時完整 reflow 而不壓縮 track                                             | Candidate 已核定；production adoption 待後續  |
| Reserved support row          | 維持 layout-owned 候選，不進 `UiField` API；等真實同列表單證明重用需求                                                                                 | 第一個產品表單 migration                      |
| Zod／required controller      | UI 只接收本地化 `invalid + error`；驗證時機與 issue mapping 由產品 form owner 負責                                                                     | 實際表單 migration                            |
| Standard／Compact activation  | Electron `BrowserWindow` windowed／restored 投影 Compact，maximize／fullscreen 投影 Standard；root 永遠保留明確值，不依 viewport 或 sidebar 猜測       | 已核定；目前只有 opt-in Token v2 surface 消費 |
| Button pressed state          | Candidate Secondary 使用 active surface＋strong border、Accent 使用 `--ui-color-accent-active`；Current 無 authored `:active`，不假造 production style | Candidate 已核定；production adoption 待後續  |
| Button long label             | 一般動作文案優先保持精簡；受限 Candidate 單行 ellipsis、不跑馬燈，full-width 與可用寬度仍由 parent 擁有                                                | Candidate 已核定；production adoption 待後續  |
| Field＋Button composition     | 同一 density scope 對齊 36／32／30px control box；外部 row gap 8px、內部 icon／label gap 4px，窄幅由 parent 堆疊與 full width                          | Candidate 已核定；production adoption 待後續  |
| Button action hierarchy       | Candidate Primary 使用 Accent；Secondary 使用 neutral raised surface＋subtle border；Ghost 只供 contextual tertiary action                             | Candidate 已核定；production adoption 待後續  |
| Button icon-only boundary     | 新用法交給 `UiIconButton`；現行 `UiButton` compatibility branch 暫不在 review 標本中擴張或移除                                                         | 後續 production adoption                      |
| Icon Button target／glyph     | Candidate routine 為 36／32px、Primary transport 44px、glyph 固定 16 unit；Current 維持 32／44px hard floor；Emergency 48px 暫不映射                   | Candidate 已核准；production adoption 待後續  |
| Icon Button context mapping   | Primitive 與 recipe 分責；toolbar／transport／artwork／stretch／title-bar 都由 parent 組合既有 size／shape／variant，不新增 context prop               | Candidate 已核准；production adoption 待後續  |
| Icon Button pressed states    | Candidate Accent 使用 accent-active，Overlay 使用 theme-independent 55%／68%／78% scrim；Current 缺口維持可見                                          | Candidate 已核准；production adoption 待後續  |
| Icon Button title-bar focus   | 36px target 位於 40px title bar 時由 parent 改用 inset focus offset；一般 surface 保留外擴 focus ring                                                  | Candidate 已核准；production adoption 待後續  |
| Text Action role              | 現行元件仍為 native `button`，但 Candidate 視覺角色是可點擊文字；獨立動作用 `UiButton`，不以 button variant／size／full-width 擴張 primitive           | Candidate 已核准；production adoption 待後續  |
| Text Action affordance        | Candidate Default 無底線，hover／focus-visible 顯示底線，pressed 沿用 hover，disabled 無底線並降至 50%；Current 主行為一致                             | Candidate 已核准；production adoption 待後續  |
| Text Action overflow          | 沿用 `UiMarqueeText` 的 overflow-only marquee／title／reduced-motion ellipsis，不增加速度或開關 prop                                                   | Candidate 已核准；production adoption 待後續  |
| Text Action recipes           | Track row、section heading、table cell 的 geometry、z-index、navigation 與可用寬度由 parent 擁有，recipe 不轉成 primitive prop                         | Candidate 已核准；production adoption 待後續  |
| Tabs usage boundary           | `UiTabs` 只服務相鄰且互斥的 tabpanels；global navigation 維持專用 `nav`，單選 filter／mode switch 留給未來 segmented control                           | Candidate 已核准；production adoption 待後續  |
| Tabs Panel／Bar               | Panel 使用 neutral shell＋tonal tile；Bar 使用 flat surface＋2px indicator；兩者只改 presentation，不改 tab／tabpanel 語意                             | Candidate 已核准；production adoption 待後續  |
| Tabs size／overflow           | Candidate 36／32px、Current 30px；Panel intrinsic、Bar available width；長項目單行 ellipsis，多項超出以 native horizontal scroll 承接                  | Candidate 已核准；production adoption 待後續  |
| Tabs panel ownership          | 目前 caller 提供 panels、visibility、ids 與雙向 ARIA 關係；production adoption 前再決定是否提升為完整 compound API                                     | F8 owner 確認後的 architecture gate           |
| Chip role boundary            | `UiChip` 是非互動 system-generated badge／label；filter、dismiss、action、navigation 與 selection 使用其他互動元件                                     | Candidate 已核准；production adoption 待後續  |
| Chip size／overflow           | Candidate 24／20px、Current 約 21.5px；intrinsic、max 100%、必要長值由 parent 限寬 ellipsis，group 以 8px gap wrap                                     | Candidate 已核准；production adoption 待後續  |
| Chip tone／gated              | 八個 tone 維持文字語意＋色彩輔助；`gated` Candidate 顯示「需確認」，不代表權限、付費、法律或安全判定                                                   | Candidate 已核准；production adoption 待後續  |
| Chip custom overrides         | Candidate 優先 semantic tone；現行 `background`／`color` compatibility escape hatch 是否收斂需先稽核既有 surface／selected 用法                        | production migration audit                    |
| Status Icon naming／role      | 保留 `UiStatusIcon` 給純圖示狀態；可見文字 badge 用 `UiChip`，可互動內容用相符 native control                                                          | Candidate 已核准；production adoption 待後續  |
| Status Icon size／tone        | Candidate 24／20px、Current 24px、glyph 固定 16 unit；`current` 用 Accent／Indigo，內容分類用 Neutral，Current 額外保留 `text`／`highlight`            | Candidate 已核准；production adoption 待後續  |
| Status Icon ARIA／motion      | 獨立意義用 named image，重複文字用 decorative；parent 擁有 live region，spinning 只作用 glyph 並尊重 reduced motion                                    | Candidate 已核准；production adoption 待後續  |
| Candidate production adoption | 僅凍結被實際 slice 證明的 token／component subset，不做全專案機械替換                                                                                  | F8 元件與 F7 visible acceptance 完成後        |

## 驗證與提交邊界

每個 phase 必須包含實際元件標本、Candidate／Current 真值、深色／淺色、
窄容器、keyboard focus、語意／ARIA、focused tests、完整 tests、lint、
format、build、candidate isolation 與 production bundle isolation。

提交分成兩類：

- active component fix：正式 token／元件／consumer 及其測試；
- development review checkpoint：F8 標本、Candidate mapping、檢查測試與文件。

不要把尚未 owner 核准的 Candidate 值混入 active component fix。
