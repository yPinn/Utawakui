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

## 2026-09-07 階段快照

| 範圍                | 已確認／已建立                                                                                                                                          | 仍屬候選或現行缺口                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 系統預設色          | 中性低干擾 surface，以 Indigo 負責主題、選取與 focus                                                                                                    | production-wide semantic mapping 尚未採用                                                                  |
| Folder 色           | Folder 可使用 Mosby Files 式高彩度強對比，與系統預設色分責                                                                                              | F8 目前只有參考色票；正式 folder palette 與元件映射未定                                                    |
| 狀態色              | Mildliner 作色相來源而非螢光筆材質；主要訊號用原色強度，soft 只作選用背景                                                                               | Live 與 Danger 可同色但維持不同 token、形狀及標籤語法                                                      |
| 字體與文字          | Electron 使用 Windows 原生字型堆疊；Display／Emphasis 暫定 28／700；長標題維持單行截斷                                                                  | Display 日後只有在具體強調情境出現時才重新評估                                                             |
| 單位                | 字體、spacing、radius、元件幾何及 CSS breakpoint 用 rem；hairline／focus／drag 用 CSS px；Electron window 用 DIP；raster／canvas backing 用 physical px | 不得把 16px root 下的 CSS px 等值寫成 DIP                                                                  |
| 核心尺寸            | 一般操作 hard floor 32、Live 44、緊急 48 CSS px；視窗不足先收起或重排，不縮小 hard floor                                                                | Standard／Compact 是離散候選；實際切換條件留到 View 階段                                                   |
| Icon Button         | active `sm` 已移除；`md` 32px、`lg` 44px，glyph 維持 16 unit                                                                                            | Emergency 48px variant 尚未建立                                                                            |
| Field shell         | Candidate Standard 36px／Compact 32px；現行 30px；寬度由 parent 擁有，`min-width: 0`、無 component max；readonly quiet surface 已完成跨家族候選檢查     | Candidate label／disabled select-none 與 readonly surface 尚未採用到正式 Field                             |
| Search Box          | Candidate 已定左右各 32px slot、16-unit glyph、兩側各 4px text gap、自訂 Clear、可清除互動及完整狀態標本                                                | active 仍是 30px、缺整體 hover／disabled surface、Clear hit token，且 native cancel ownership 未正式落地   |
| Text Field          | Candidate／Current 的尺寸、寬度、單行 anatomy、內容及七種狀態已檢查；readonly 採平面 quiet surface、完整文字對比與可選取／複製                          | active light placeholder 對比 4.23:1；readonly Candidate production adoption 待後續                        |
| Textarea            | rows、hard floor、soft wrap、native overflow、vertical resize、內容與七種狀態已檢查；readonly 與 Text Field 共用 quiet surface 語法                     | active hard floor 60px；readonly Candidate production adoption 待後續                                      |
| Validation feedback | 上游 issue → form controller → localized `invalid + error` → UiField；required pristine 不報錯，blur／submit 後顯示，修正後移除；Error 取代 Hint        | `auto` 是現行預設；父層 `reserved` 只是一行空間候選；未新增 Zod、正式 prop、token 或產品表單流程           |
| Select              | Candidate 36／32px、project-owned indicator、12px end inset、closed-lane ellipsis 與 overflow-only 完整值提示已完成 owner 視覺檢查                      | native popup 尺寸／option rendering 仍由 Chromium／Windows 擁有；production adoption 待後續                |
| Checkbox            | Candidate／Current、36／32px full-row target、16px indicator、多行首行對齊、Boolean／mixed、validation 與 ARIA 已完成 owner 視覺檢查                    | Candidate custom indicator、整列 disabled 與 `indeterminate` public contract 的 production adoption 待後續 |
| Range               | Candidate／Current、36／32px full-track target、6px Candidate track／fill、16px thumb、等距 stops、validation 與 ARIA 已完成 owner 視覺檢查             | Candidate custom track／thumb／optional ticks、窄幅 value output reflow 與 production adoption 待後續      |

只有 Icon Button hard-floor 修正屬於這個 checkpoint 的正式 active 變更。
其餘 Candidate 標本仍由 development-only F8 與 `tokens-v2.css` 隔離；
production bundle 不含 F8 標本或 candidate token payload。

## 目前階段：Foundation／Input catalogue layout 收尾

Foundation 與 Input family 的 Candidate／Current 決策已完成 owner 階段性檢查。
目前只整理 development-only F8 的閱讀順序、背景責任與 responsive 分段；不得先進
操作元件、其他 compound component、production adoption 或完整 View：

1. Canvas 只作頁面底；已檢查的 catalogue section 使用 Surface；Surface Raised 只留給 specimen 或必要 preview。
2. 只有 Foundation 與 Input 標示為 reviewed；尚未檢查的群組保留原有中性版面，不以相同 frame 暗示已完成。
3. Candidate／Current 使用一致的標頭欄位、間距與 neutral divider；不以 Accent、Selected 或 Folder 色裝飾分區。
4. 閱讀順序維持 Foundation → Field → Search Box → Text Field → Textarea → Select → Checkbox → Range；DOM 與 keyboard order 不因版面調整改變。
5. F8 頁首只保留已檢查範圍與「Candidate 不等於 production adoption／View 核准」邊界；元件內仍保留實際尺寸、狀態、ARIA 與 public contract 證據。
6. 寬幅使用 title rail＋content；58rem 以下改為單欄，42rem 以下再收斂頁首 meta。Sticky index 不遮住目標 heading。
7. 本階段不修改 active tokens、正式 `Ui*` 元件 API、validation ownership 或 production bundle。
8. 完成後停在 Input family，等待 owner 可視確認，不自行進入 UiButton。

## 下一階段需要 owner 決定

| 決定                          | 建議基線                                                                                                                                              | 決定時點                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Select trailing indicator     | Candidate closed control 使用 project-owned ChevronDown 與 12px end inset；Current 保留 native indicator                                              | Candidate 已核定；production adoption 待後續 |
| Selected value 過長           | Candidate closed lane 單行 ellipsis；確實溢位時在 hover／focus 顯示同寬靜態完整值提示，不使用 marquee；native popup 寬度仍由 UA 決定                  | Candidate 已核定；production adoption 待後續 |
| Select readonly 替代          | 不增加假 readonly prop；不可編輯值用 disabled 或非表單文字，依產品語意選擇                                                                            | Select public contract                       |
| Field readonly surface        | Candidate 的 Text Field／Textarea 使用較平 quiet surface、一般邊界、完整文字對比、可選取／複製與 focus ring；不加 lock／badge                         | Candidate 已核定；production adoption 待後續 |
| Checkbox target／indicator    | Candidate 使用 36／32px full-row target、16px project-owned Check／Minus；多行 label 對齊第一行，native input 保留互動與語意                          | Candidate 已核定；production adoption 待後續 |
| Checkbox mixed ownership      | `indeterminate` 是 caller-owned visual／ARIA projection；Boolean selection 後由 controller 清除，不建立 readonly 或 tri-state value                   | Candidate 已核定；production adoption 待後續 |
| Range track／thumb ownership  | Candidate 使用 6px project-owned base／fill、16px Chromium thumb pseudo-element、2px canvas rim 與互動 halo／ring；單一 native input 保留所有輸入語意 | Candidate 已核定；production adoption 待後續 |
| Range stops                   | 等距吸附維持 native step；3–7 個有意義 stops 可使用軌道內無標籤 ticks，不永久預留 marks row；具名／不規則 marks 延後至具體需求                        | Candidate 已核定；production adoption 待後續 |
| Range target／output          | Candidate full-track target 為 36／32px；`valueText` 同時供 output／ARIA，窄幅時完整 reflow 而不壓縮 track                                            | Candidate 已核定；production adoption 待後續 |
| Reserved support row          | 維持 layout-owned 候選，不進 `UiField` API；等真實同列表單證明重用需求                                                                                | 第一個產品表單 migration                     |
| Zod／required controller      | UI 只接收本地化 `invalid + error`；驗證時機與 issue mapping 由產品 form owner 負責                                                                    | 實際表單 migration                           |
| Standard／Compact activation  | 不依 viewport 連續縮放；等 View 階段依容器及內容下限制定離散切換條件                                                                                  | Primitive／compound 全部核定後               |
| Candidate production adoption | 僅凍結被實際 slice 證明的 token／component subset，不做全專案機械替換                                                                                 | F8 元件與 F7 visible acceptance 完成後       |

## 驗證與提交邊界

每個 phase 必須包含實際元件標本、Candidate／Current 真值、深色／淺色、
窄容器、keyboard focus、語意／ARIA、focused tests、完整 tests、lint、
format、build、candidate isolation 與 production bundle isolation。

提交分成兩類：

- active component fix：正式 token／元件／consumer 及其測試；
- development review checkpoint：F8 標本、Candidate mapping、檢查測試與文件。

不要把尚未 owner 核准的 Candidate 值混入 active component fix。
