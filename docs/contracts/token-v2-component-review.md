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

| 範圍                | 已確認／已建立                                                                                                                                          | 仍屬候選或現行缺口                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 系統預設色          | 中性低干擾 surface，以 Indigo 負責主題、選取與 focus                                                                                                    | production-wide semantic mapping 尚未採用                                                                |
| Folder 色           | Folder 可使用 Mosby Files 式高彩度強對比，與系統預設色分責                                                                                              | F8 目前只有參考色票；正式 folder palette 與元件映射未定                                                  |
| 狀態色              | Mildliner 作色相來源而非螢光筆材質；主要訊號用原色強度，soft 只作選用背景                                                                               | Live 與 Danger 可同色但維持不同 token、形狀及標籤語法                                                    |
| 字體與文字          | Electron 使用 Windows 原生字型堆疊；Display／Emphasis 暫定 28／700；長標題維持單行截斷                                                                  | Display 日後只有在具體強調情境出現時才重新評估                                                           |
| 單位                | 字體、spacing、radius、元件幾何及 CSS breakpoint 用 rem；hairline／focus／drag 用 CSS px；Electron window 用 DIP；raster／canvas backing 用 physical px | 不得把 16px root 下的 CSS px 等值寫成 DIP                                                                |
| 核心尺寸            | 一般操作 hard floor 32、Live 44、緊急 48 CSS px；視窗不足先收起或重排，不縮小 hard floor                                                                | Standard／Compact 是離散候選；實際切換條件留到 View 階段                                                 |
| Icon Button         | active `sm` 已移除；`md` 32px、`lg` 44px，glyph 維持 16 unit                                                                                            | Emergency 48px variant 尚未建立                                                                          |
| Field shell         | Candidate Standard 36px／Compact 32px；現行 30px；寬度由 parent 擁有，`min-width: 0`、無 component max                                                  | Candidate label／disabled select-none 尚未採用到正式 Field；Readonly 專屬 surface 未定                   |
| Search Box          | Candidate 已定左右各 32px slot、16-unit glyph、兩側各 4px text gap、自訂 Clear、可清除互動及完整狀態標本                                                | active 仍是 30px、缺整體 hover／disabled surface、Clear hit token，且 native cancel ownership 未正式落地 |
| Text Field          | Candidate／Current 的尺寸、寬度、單行 anatomy、內容及七種狀態已檢查                                                                                     | active light placeholder 對比 4.23:1；Readonly quiet surface 只是提案                                    |
| Textarea            | rows、hard floor、soft wrap、native overflow、vertical resize、內容與七種狀態已檢查                                                                     | active hard floor 60px；Readonly surface 與整個 Field family 一起待定                                    |
| Validation feedback | 上游 issue → form controller → localized `invalid + error` → UiField；required pristine 不報錯，blur／submit 後顯示，修正後移除；Error 取代 Hint        | `auto` 是現行預設；父層 `reserved` 只是一行空間候選；未新增 Zod、正式 prop、token 或產品表單流程         |

只有 Icon Button hard-floor 修正屬於這個 checkpoint 的正式 active 變更。
其餘 Candidate 標本仍由 development-only F8 與 `tokens-v2.css` 隔離；
production bundle 不含 F8 標本或 candidate token payload。

## 下一階段：Select

下一個檢查對象是 `UiSelect`。不得先進 Checkbox、Range、其他 compound
component 或完整 View。檢查順序如下：

1. 分開顯示 Token v2 Candidate 與 Current，不讓候選樣式污染現行快照。
2. 基礎尺寸：Candidate Standard 36px／Compact 32px、Current 30px；
   `width: 100%`、`min-width: 0`、無 component max。
3. Owned anatomy：label、select control、selected-value lane、trailing indicator、
   Hint／Error；釐清下拉選單 popup 由瀏覽器／Windows 擁有的範圍。
4. 內容：placeholder、已選值、長 CJK／Latin、多語文字、number value、disabled
   option，以及不改變控制高度的截斷或 native 行為。
5. 狀態：default、filled、hover、focus-visible、invalid、required、disabled；
   Select 沒有 native readonly，不得虛構 readonly state。
6. Validation：沿用 UiField 的 Danger border、Error、`aria-invalid` 與
   `aria-describedby`，並確認 Hint → Error 替換。
7. Public contract：`modelValue`、`options`、`placeholder`、`required`、
   `disabled`、`invalid`、native attrs 與 `update:modelValue`。

## 下一階段需要 owner 決定

| 決定                          | 建議基線                                                                                        | 決定時點                               |
| ----------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------- |
| Select trailing indicator     | 優先保留 Chromium／Windows native indicator；只有原生對齊或主題明確失敗才考慮自訂               | Select anatomy 實際標本後              |
| Selected value 過長           | 保持單行，不增高；先觀察 native clipping，再決定是否需要自訂 ellipsis                           | Select content 檢查                    |
| Select readonly 替代          | 不增加假 readonly prop；不可編輯值用 disabled 或非表單文字，依產品語意選擇                      | Select public contract                 |
| Field readonly surface        | Text Field／Textarea 目前維持與 editable 相同；看完 Select 後再決定是否需要跨家族 quiet surface | Select 結束時                          |
| Reserved support row          | 維持 layout-owned 候選，不進 `UiField` API；等真實同列表單證明重用需求                          | 第一個產品表單 migration               |
| Zod／required controller      | UI 只接收本地化 `invalid + error`；驗證時機與 issue mapping 由產品 form owner 負責              | 實際表單 migration                     |
| Standard／Compact activation  | 不依 viewport 連續縮放；等 View 階段依容器及內容下限制定離散切換條件                            | Primitive／compound 全部核定後         |
| Candidate production adoption | 僅凍結被實際 slice 證明的 token／component subset，不做全專案機械替換                           | F8 元件與 F7 visible acceptance 完成後 |

## 驗證與提交邊界

每個 phase 必須包含實際元件標本、Candidate／Current 真值、深色／淺色、
窄容器、keyboard focus、語意／ARIA、focused tests、完整 tests、lint、
format、build、candidate isolation 與 production bundle isolation。

提交分成兩類：

- active component fix：正式 token／元件／consumer 及其測試；
- development review checkpoint：F8 標本、Candidate mapping、檢查測試與文件。

不要把尚未 owner 核准的 Candidate 值混入 active component fix。
