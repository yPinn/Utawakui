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

## 2026-09-09 階段快照

| 範圍                | 已確認／已建立                                                                                                                                          | 仍屬候選或現行缺口                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 系統預設色          | 中性低干擾 surface，以 Indigo 負責主題、選取與 focus                                                                                                    | production-wide semantic mapping 尚未採用                                                                   |
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

只有 Icon Button hard-floor 修正屬於這個 checkpoint 的正式 active 變更。
其餘 Candidate 標本仍由 development-only F8 與 `tokens-v2.css` 隔離；
production bundle 不含 F8 標本或 candidate token payload。

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

## 下一階段需要 owner 決定

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
| Candidate production adoption | 僅凍結被實際 slice 證明的 token／component subset，不做全專案機械替換                                                                                  | F8 元件與 F7 visible acceptance 完成後        |

## 驗證與提交邊界

每個 phase 必須包含實際元件標本、Candidate／Current 真值、深色／淺色、
窄容器、keyboard focus、語意／ARIA、focused tests、完整 tests、lint、
format、build、candidate isolation 與 production bundle isolation。

提交分成兩類：

- active component fix：正式 token／元件／consumer 及其測試；
- development review checkpoint：F8 標本、Candidate mapping、檢查測試與文件。

不要把尚未 owner 核准的 Candidate 值混入 active component fix。
