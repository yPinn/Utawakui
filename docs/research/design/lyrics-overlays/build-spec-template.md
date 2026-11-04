# 字幕模板 Build Spec 格式

Proposal 方向選定後，依本格式建立 `<working-id>-build-spec.md` 並與[索引](README.md)及原 Proposal 互相連結。

## 決策輸入與範圍

- Proposal、已確認方向／來源與日期、spec 狀態連結。
- Template ID、顯示名稱、所屬 slot、資料需求、預設與支援 capture size。
- 本次交付、保留 invariant、明確排除範圍、尚未阻擋／會阻擋實作的問題。
- 需要更動哪些現行契約或 ADR；只是新模板採用既有能力時，不另造競爭模型。

## Canonical 資料與呈現

描述 renderer player／queue／lyrics owner → Main Projection Hub → Browser Source 的資料流，列出必要 projection 與驗證，不新增另一播放器或權威時鐘。

- `shared/presentation/lyricsTemplateCapabilities.mjs`：最低時間級別、T1／T2／T1+ 消費方式、source mapping、music cues、scheduler wake；只宣告確實有 consumer 的能力。
- `shared/presentation/`：profile、分句／分頁、角色／讀音、靜態快取 identity、動態 frame 與失效規則；先找可重用投影。
- T0／T1／T2／T1+、缺讀音／音樂結構的處理矩陣；不合成來源未提供的精確時間。
- 共用文字處理與模板 policy 的邊界、來源範圍守恆及不可改寫的原始資料。

## 登錄與屬性

- `shared/outputTemplateValues.json`：slot 相容性、capture sizes；新增模板不擅改既有 slot 預設。
- `src/constants/outputTemplates.js`：Gallery metadata、能力敘述與排序；新 UI 文案沿既有 locale 規則。
- `shared/outputAppearance.mjs`：模板採用的共用欄位及正規化；新增欄位由共用目錄持有。

| Key  | 對象／scope | family／tier | 型別、單位、範圍、step | 預設 | reflow | Consumer／恢復與切換規則 |
| ---- | ----------- | ------------ | ---------------------- | ---- | ------ | ------------------------ |
| 待填 | 待定        | 待定         | 待定                   | 待定 | 待定   | 待定                     |

補充可讀性 floor、端點驗證及失敗回退。欄位定義中現有的 `family`、`scope`、`tier`、`reflow` 與新增設計要求分開說明，不能把 ADR 中尚未落地的屬性或儲存形狀當作現行 schema。

若採用元素／群組，另列 `shared/outputTemplateElements.mjs` 宣告、邏輯 ID、DOM 節點對應、允許屬性、Workbench box 回報與選取。依 [ADR 0027](../../../adr/0027-output-template-elements-and-property-workspace.md)逐模板證明適用性；位置／尺寸、層級排序及 Styles 若需未交付能力，明列為獨立前置，不順帶實作。

## Runtime、排版與動態

- `overlay/lyrics/` 的 DOM／CSS／renderer adapter 與共用部分；使用 `--ovl-*`，不引入控制台 token。
- 字型量測、文字擬合、讀音 atomicity、閱讀順序、安全區與溢位／分頁規則；精確支援尺寸及極值。
- GSAP、CSS 各自擁有的動畫屬性，canonical clock、可中斷交接與舊 callback 失效；不讓兩套引擎同時控制一項屬性。
- mount／apply／update／resize／destroy 等價生命週期、字型 readiness、seek／重連／隱藏恢復、reduced motion 及清理。
- 新模組、字型與圖形的 exact HTTP allowlist、CSP、fallback；輸出維持唯讀，不接受任意路徑／URL。

## 預覽、素材與封裝

- Gallery static thumbnail、動態預覽如何使用共用合成場景；列出與正式 scheduler 的已知差異。
- Workbench 使用正式 Output iframe 與真實投影，不自動塞示範資料；編輯專用參數不進 OBS URL。
- 每項素材記錄來源、版本、hash／大小、license／NOTICE、再散布依據及 fallback；參考圖不是交付資產。
- Runtime／worker／shared asset／dependency 新增或移動時，同步 `electron-builder.yml`、`docs/operations/release-inventory.md` 與 packaging tests；不新增無關依賴。
- 有正式 Pack／Variant 依賴時遵循 [Pack 契約](../../../contracts/overlay-pack.md)，不能以一般 slot 設定假裝已交付 Pack 功能。

## 驗證計畫與結果

| 面向         | 固定案例與通過條件                                                              | 證據／結果 |
| ------------ | ------------------------------------------------------------------------------- | ---------- |
| 純呈現與時間 | 原文／來源對映、T0／T1／T2／T1+、短長句、多語與缺資料                           | 待執行     |
| 設定與編輯   | Main 驗證、正規化、保存／恢復、換模板、所有公開端點與選項                       | 待執行     |
| Runtime      | 真實 route 載入、字型失敗、切換／seek、隱藏恢復、取消與清理                     | 待執行     |
| 可見呈現     | Workbench 及指定 Electron／OBS 模式，尺寸、alpha、背景、可讀性與 reduced motion | 待執行     |
| 成本與交付   | 事前固定效能預算、並行來源情境、build／packaging／startup 與來源附文            | 待執行     |

具體列出環境、版本、輸入、預算、命令及收據位置，失敗與未測保留。純函式、DOM／離屏截圖、預覽與可見 OBS 證據分開，不相互替代。完整驗證依[外觀驗收](../../../operations/output-appearance-acceptance.md)與[作品交付標準](../../../governance/appearance-sets-plan.md)收斂。

## 實作切片與收尾

按有驗收出口的切片列檔案責任、focused tests 與回復方式。主程序／preload 改動需完整重啟後再驗；完成時同步行為契約、必要的架構／ADR 與 spec 第 3 節，未完成驗收不得標記全部交付。沒有使用者明確要求時不 commit。
