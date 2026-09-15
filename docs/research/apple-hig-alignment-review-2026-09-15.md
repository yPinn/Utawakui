# Apple HIG Alignment Review

- **產品：** Utawakui
- **日期：** 2026-09-15
- **狀態：** 待 owner 核閱（未核准，不授權任何 token／component 變更）
- **範圍：** 對照 Apple Human Interface Guidelines 與已核准的 Studio Library／
  Architectural Slate foundation

## 1. 文件角色

本文件是有日期的對照研究，用來回答「Apple 官方設計原則裡，有哪些對 Utawakui
仍有幫助」。它不取代、不覆寫已核准的
[Visual System Discovery](visual-system-discovery-2026-08-25.md)、
[Visual Direction Options](visual-direction-options-2026-08-25.md)、
[Visual System Foundation](visual-system-foundation-2026-08-28.md)、
[UI Component Foundation](ui-component-foundation-2026-08-28.md) 或根目錄
[DESIGN.md](../../DESIGN.md)。本文件只記錄比對結果與待 owner 決定的候選項目；
任何採用都必須回到既有的 F8 owner checkpoint 流程逐項核准，不得因為本文件存在
就視為已核准。

## 2. 方法與限制

Apple Developer 的 HIG 頁面是 JS 動態渲染，直接抓取（WebFetch）只拿得到頁面
標題，抓不到內文。以下 Apple 原則摘要來自既有訓練知識，並以 WebSearch 交叉
確認官方摘要與來源連結：

- [Apple Developer – Materials](https://developers.apple.com/design/human-interface-guidelines/foundations/materials/)
- [Apple Developer – Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars)
- [Apple Developer – Icons (Foundations)](https://developers.apple.com/design/human-interface-guidelines/foundations/icons)

這代表本文件的 Apple 原則描述是「原則層級」的忠實摘要，不是逐字轉載官方文案；
若後續需要逐字引用做正式決策依據，應另行以可存取的官方文件或截圖佐證。

## 3. Apple 現行原則摘要

| 面向                        | 摘要                                                                                                                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Materials／Vibrancy         | 材質提供半透明＋模糊建立前後景層次；vibrancy 讓前景內容從材質後方「吸色」增加深度感。官方明講：依語意用途選材質，不要依「目前看起來的顏色」選，因為系統設定會改變外觀 |
| **Liquid Glass（2025 起）** | Apple 在 WWDC25 推出 Liquid Glass，macOS Tahoe 26／iOS 26 起系統大量採用半透明、動態折射材質，是近十年最大的視覺翻新方向                                              |
| Sidebars                    | 側欄用系統 accent 色或背景表示選取狀態；icon 不需另畫 selected／unselected 兩版，選取時系統自動加深 stroke＋背景                                                      |
| Toolbars                    | Unified toolbar 與 titlebar 合併；leading 放身分／主要導覽、trailing 放次要動作，用 separator 分組，盡量精簡把空間留給內容                                            |
| Color                       | Semantic color（依用途命名而非色值）、尊重系統 accent、WCAG AA 最低對比、色彩只能輔助不能是唯一語意載體                                                               |
| Typography                  | Large Title／Title／Headline／Body／Caption 階層命名；Dynamic Type 11 級縮放；避免大字重用極端 weight                                                                 |
| Motion                      | 動畫要有目的（狀態改變、引導注意力），常見 200–500ms，尊重 reduced motion                                                                                             |
| Hit target                  | iOS 44×44pt 是門檻；macOS 因滑鼠精準，控制項可以小到 20–24pt                                                                                                          |

## 4. 與 Utawakui 現況對照

| 面向                 | Apple 現行做法                                           | Utawakui 現況                                                                                                                     | 判斷                                                                                                                                      |
| -------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Materials／層次      | Liquid Glass：大量 translucency、動態折射                | 明確拒絕 glass／gradient／shadow，採 flat archival，只有 contact／overlay／dialog 三級陰影                                        | 刻意分歧，理由充分（效能、OBS 合成不能依賴 blur、演出時要求穩定幾何、深色長工作降低疲勞）。**建議維持**，不必為了追新 Liquid Glass 改方向 |
| Sidebar 選取         | Accent 色／背景表示選取，icon 系統自動處理 selected 外觀 | Indigo accent＋selected-soft 背景，16-unit 專案自有 glyph                                                                         | 精神已對齊；可作為既有 icon 系統的驗收項（見第 5 節）                                                                                     |
| Toolbar／Header 分組 | Leading／trailing 分區、separator 分組、精簡優先         | Controlled Dossier 的 bounded header「擁有 page title、readiness／visibility context、primary actions」，但未明訂內部分組排列規則 | 可直接借用的落地細節（見第 5 節）                                                                                                         |
| Color／語意色        | Semantic + 系統 accent + AA 對比                         | Clear Pastel 六語意角色＋實測 WCAG 對比表、Live／Danger 形狀與文案分離                                                            | Utawakui 已比 Apple 官方文件本身更嚴謹，無需補強                                                                                          |
| Typography 階層      | Large Title/Title/Headline/Body/Caption                  | Object title/View heading/Section title/Body/Label/Caption                                                                        | 概念一對一對應，已對齊                                                                                                                    |
| Dynamic Type         | 11 級縮放                                                | 100%／110%／125% ＋ 200% 驗證                                                                                                     | 顆粒較粗但方向一致；短期不必補，未來深化無障礙時可參考                                                                                    |
| Motion               | 200–500ms，尊重 reduced motion                           | 100/140/200/280ms，禁止 bounce／elastic／持續 loop，reduced-motion 全面 remap                                                     | Utawakui 比 Apple 更克制，符合「專業工具、非娛樂」的產品人格，不需改                                                                      |
| Hit target           | iOS 44pt／macOS 20–24pt                                  | 一般 32px、Live 44px、Emergency 48px                                                                                              | 沒有照抄 macOS 小尺寸，偏向 iOS 安全尺寸；這是依「降低誤操作」產品需求做的正確取捨，不是遺漏                                              |
| 形狀語言             | Continuous corner（squircle）是近年視覺簽名              | Shape scale 用一般 border-radius（2/4/6/8px 等效）                                                                                | 唯一可考慮但非必要的落差，見第 5 節                                                                                                       |

## 5. 建議吸收的 Apple 優點（待 owner 決定，不自動生效）

以下每一項都需要回到既有 F8／owner checkpoint 流程個別核准，本文件只負責
提出候選與理由，不視為核准。

### 5.1 Toolbar／Header 排列邏輯（建議優先採用）

借用 Apple「leading＝身分與主要導覽、trailing＝次要動作、用 separator
分組、內容優先於工具列」的排列原則，套用到：

- Controlled Dossier 的 bounded internal header；
- 未來若建立全域 toolbar 或任何 feature-owned header。

這不需要新增材質或視覺語言，只是排列規則，與現有 flat archival 立場不衝突，
可以作為 header／toolbar 相關元件下一次 owner checkpoint 的排列準則草案。

### 5.2 Icon selection 不另畫兩版（建議作為既有 icon 系統的驗收項）

Apple 原則：sidebar／toolbar 這類會自動表示選取狀態的位置，不需要為 icon
準備 selected／unselected 兩份圖檔，選取由背景／stroke 處理。建議在下次
icon／glyph 相關 owner checkpoint 時，順帶確認 Utawakui 現有 16-unit
project-owned glyph 系統是否已經符合這條（避免重複資產、避免用兩份圖檔表達
同一個語意狀態）。這是驗收既有系統，不是新增元件。

### 5.3 Semantic-first 材質／token 選擇原則（確認性引用，非新規則）

Apple 明講：選材質要依語意用途，不要依「目前看起來的顏色」，因為系統設定
會改變外觀。這與 Visual System Foundation 既有的「Semantic 名稱描述用途，
不描述當下色值，例如 `status-critical` 而非 `red-strong`」完全一致。列在
這裡作為外部佐證，強化既有 token 契約的正當性，不需要任何變更。

### 5.4 Continuous corner／squircle（低優先，實驗性）

Apple 近年（含 Liquid Glass 前就已存在的 continuous corner）大量使用
superellipse 圓角作為視覺簽名。CSS 對應屬性（如 `corner-shape`）目前仍是
較新的實驗性標準，需先確認 Utawakui 使用的 Electron／Chromium 版本支援度。
建議：

- 不列入近期 F8 checkpoint；
- 若未來要做，僅限 Popover／Dialog／較大圓角的浮動元件做小規模試驗，
  不擴及一般 row／button／field；
- 純屬裝飾細節，缺席不影響現有系統完整性。

### 5.5 Dynamic Type 式的更細縮放分級（低優先，僅供未來參考）

Apple 用 11 級 Dynamic Type 分級。Utawakui 目前是 100%／110%／125%／200% 四級。
不建議現在擴充，但未來若有更深入的無障礙工作，可以參考 Apple 這種「更細顆粒
分級」的方向，而非直接照搬 11 級。

## 6. 重要提醒：Liquid Glass 分歧需要被記錄，避免被誤判為落後

Apple 在 2025 年後的官方視覺方向已大幅轉向 Liquid Glass（大量 translucency／
動態折射），與 Utawakui Foundation 目前「flat archival，不使用 glass／
gradient／shadow」的立場方向相反。這是**刻意且有理由的分歧**（效能、OBS
合成穩定性、演出情境降低視覺疲勞、跨平台一致性），但目前 Foundation 文件
沒有明講「為什麼不跟隨 Liquid Glass」。

建議：下次 Visual System Foundation 或 DESIGN.md 更新時，補一句明確記錄
這個取捨原因，避免未來有人拿最新 macOS 截圖比對時，誤以為系統設計「跟不上
Apple」而重新引發不必要的方向討論。

## 7. 非目標

- 不變更任何 production／candidate token 或 component。
- 不核准 squircle、toolbar 分組規則或任何本文件列出的候選項目；核准仍需個別
  回到 F8／owner checkpoint。
- 不建議採用 Liquid Glass 或任何形式的 glass／blur／gradient 材質。
- 不重新開啟已核准的 Direction B（Studio Library）或 Architectural Slate 決策。

## 8. Owner 核閱檢查

請確認本文件是否正確表達：

- Utawakui 現有系統已經是「理解 Apple／Spotify 原則後、依產品情境做刻意取捨」
  的結果，多數面向已對齊或更嚴謹，不需要大改。
- 唯一值得記錄但目前缺席的，是「為什麼不跟隨 2025 起 Liquid Glass」的
  明確理由陳述。
- 5.1（toolbar 排列邏輯）與 5.2（icon selection 驗收）是相對低成本、
  可在下一次相關元件 checkpoint 順帶處理的項目；5.4、5.5 是低優先、
  可延後或不做的候選。
