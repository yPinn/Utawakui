# Token v2 完整替換契約

Status: replacement direction and migration architecture frozen; Phase 1 Persistent App Shell active; replacement in progress.

本文件是控制台 Token v2 完整取代 Token v1 的單一實作計畫。它整合設計方向、Page／Layout ownership、component 與 token 命名、F8 review 邊界、surface 遷移順序、驗證與最終刪除條件。

目標不是長期維持兩套主題，也不是逐檔把舊 token 改成近似名稱。每次切換都以可辨識的完整 surface 為單位，並在同一 slice 移除舊 layout、component、selector、token reference 與名稱。

Public Browser Source `overlay/` 維持獨立 `--ovl-*` 視覺系統，不參與這次替換。F8 是 development-only 決策／回歸 surface；本契約不授權刪除、簡化或重畫任何已核准的 feature 視覺。

## 最終結果

- Token v2 成為控制台唯一視覺系統，Token v1 不保留永久 compatibility layer。
- 遷移採 surface／layout 層級重構，不做跨頁零散 token substitution。
- Folder 外觀色、navigation 與 perimeter 由 `AppFolderLayout` 擁有；feature 不再自行繪製 page chrome。
- `AppFolderPage` 統一 header、body mode、focus 與 scroll ownership，feature 只負責內容與其內部 workspace。
- Component、file、CSS、token、surface id 與測試名稱在各自 surface cutover 時同步收斂，不留下雙名稱。
- Production 只以完整 registered surface 原子切換；已完成的 Main Shell 為 v2，尚未切換的 child／renderer 明確維持 v1。
- 最終只有在 legacy manifest 歸零、無 v1 scope／import／payload、無 migration alias 且所有 surface 通過 no-T1 驗證後刪除 Token v1。

## 範圍與非目標

### 本次範圍

- Renderer App Shell、Folder page family、主要 feature pages、utility／specialist surfaces 與 Performer renderer。
- Token scope、surface registry、legacy invalidation、migration manifest 與 no-T1 harness。
- 正式 `Ui*` component consolidation、layout ownership 與 surface 內的命名收斂。
- Dark／light、standard／compact、responsive、keyboard、focus、forced-colors、reduced-motion 與 Windows scaling acceptance。

### 本次非目標

- 不改變播放器、Queue、Lyrics、Output、Performance Session 或 BGM 的資料 authority。
- 不重畫 feature photo、stack、note、template artwork 或其他已核准 feature identity。
- 不把 Studio Library Candidate 建成額外 production destination。
- 不把 public `overlay/` 匯入控制台，也不將 `--ovl-*` 與 `--ui-*` 合併。
- 不為了 catalogue 完整度提前建立沒有 production consumer 的 token、variant 或 component API。
- 不以全域 search／replace 追求名稱外觀一致，也不改穩定 IPC、serialized field、URL 或外部 compatibility term。

## 現況與完整度判斷

Token v2 foundation 已足以開始 replacement infrastructure。現有 palette、semantic color、typography、spacing、shape、elevation、z-index、motion、density、dark／light、focus、forced-colors、reduced-motion，以及 Field／row／overlay／scroll 等基礎 recipe 不需要再以增加 generic token 數量為目標。

| 指標                              | Phase 0 baseline | Phase 0.3 後 | Phase 1 後 | Phase 2 後 | 判斷                                                          |
| --------------------------------- | ---------------: | -----------: | ---------: | ---------: | ------------------------------------------------------------- |
| T1 unique declared names          |              413 |          341 |        341 |        331 | Folder cutover 同批刪除 10 個 `--ui-archive-*` names          |
| T1 raw declarations               |              450 |          378 |        378 |        368 | 包含 theme 等重複宣告，不用作 migration 分母                  |
| T2 unique declared names          |              372 |          372 |        411 |        407 | Folder 正式 aliases 取代 6 個 candidate aliases               |
| T2 raw declarations               |              432 |          432 |        472 |        468 | 包含 theme 等重複宣告，不用作 migration 分母                  |
| Production-consumed T1-only names |              149 |           85 |         47 |         39 | Folder family cutover 再移除 8 個 legacy names                |
| Production file／token pairs      |              273 |          198 |        132 |        122 | Folder family cutover 再移除 10 個 legacy pairs               |
| True legacy aliases               |               21 |           21 |         18 |          8 | Archive aliases 已刪除，其餘跟隨後續 atomic surface 改寫      |
| Cross-version feature tokens      |               64 |            0 |          0 |          0 | 已退出 T1 core，由 feature-owned styles 提供                  |
| Component-local tokens            |               59 |           59 |         28 |         24 | Folder 只保留兩個有真實 owner 的正式 component aliases        |
| T2 semantic gaps                  |                5 |            5 |          1 |          1 | Main Shell／Folder gaps 已補齊；只剩 Performer titlebar owner |

主要缺口是正式 component consolidation、Shell／Folder ownership、fail-closed migration boundary、少量真實 consumer token 與命名一致性，不是 foundation 規模。

Baseline 是 2026-10-03 由 `tasks/token-v1-gap-audit.mjs` 與 stylesheet declaration inventory 重算的 Phase 0 起點；Phase 0.3 至 Phase 2 數字由 `scripts/token-v2-migration-inventory.mjs` 產生的 checked-in manifest 驗證。Migration gate 只引用去重後的 `--ui-*` declared name 與 production `surface／file／token` pair；raw declarations只用來解釋 theme override 等重複來源。`tokens-v2.prototype.test.js` 的 pinned unique-name baseline 現為 407，後續數字只能由同一 canonical audit 更新。

## 設計方向

| 分類            | 採用內容                                                                    | 限制／排除                                                                            |
| --------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 主方向          | Direction B 的準備清晰度、音樂資料掃讀、dark／light 對等與低誤操作          | 不繼承 dashboard card nesting                                                         |
| 輔助方向        | Direction A 的 Settings／Modal 克制與低疲勞                                 | 不形成另一套 page style                                                               |
| Context variant | Direction C 只供 live／Queue／Output 等真實情境使用 named tone／variant     | 不建立全域高彩度或 operations-board density                                           |
| Folder identity | Restrained primary material，Folder 外觀色由 layout component 擁有          | 不使用 raw color prop、feature identity override 或裝飾性 secondary／tertiary variant |
| Document plane  | 內容維持中性，文字與資料掃讀優先                                            | Material 色不承擔 status                                                              |
| Context bay     | 只有真實 consumer 才存在，Right Dock 保持 shell-owned sibling               | 不保留空白 Inspector column                                                           |
| Status          | Current、selected、danger、gated 各用正式 semantic role 與 component intent | 不以文字比對、偶然色值或 Folder 色推導狀態                                            |

Direction C 不是第二套視覺系統。只有在 domain state 成立時由正式 variant 觸發，並維持與基礎系統相同的 typography、spacing、focus 與 accessibility contract。

## 目標 Page／Layout 架構

```text
App Shell
├─ Persistent navigation
├─ AppFolderLayout
│  ├─ Folder navigation
│  ├─ Folder material and perimeter
│  └─ AppFolderPage
│     ├─ Fixed page header
│     └─ Body
│        ├─ document mode
│        └─ workspace mode
├─ Right Dock
└─ Player and BGM surfaces
```

| Owner             | 責任                                                                                                      | 不負責                                                 |
| ----------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| App Shell         | App grid、persistent navigation、Titlebar、Right Dock、PlayerBar、BGM safe boundary、global overlay hosts | Feature document perimeter 與 feature state            |
| `AppFolderLayout` | Folder navigation、material、cover rail、perimeter、responsive outer geometry                             | Feature body、status 或 internal pane scroll           |
| `AppFolderPage`   | Neutral document、fixed header、focus target、document／workspace body mode                               | Folder 外觀色或 feature-specific controls              |
| `UiPageHeader`    | Title、description、actions 的內容 primitive                                                              | Page placement、sticky behavior 或 scroll owner        |
| Feature surface   | Domain content、commands、state、workspace pane 與 named internal scroll region                           | App Shell、Folder perimeter 或第二套 page header owner |
| Right Dock        | Shell edge surface、foreground surface stack 與 Dock width／collapse behavior                             | Folder page column 或 feature membership owner         |

### Body modes

- `document`：layout-owned 單一 page scroll。Setlist、Import 等線性文件／清單頁使用此模式。
- `workspace`：page body 本身 bounded 且不捲動，feature 以具名區域擁有必要的 pane scroll。Performance Session、Lyrics、Output 等多區域操作面使用此模式。
- 同一 page 只能選一種模式。Header、Folder navigation、toolbar 與 table heading 必須位於其 scroll authority 指定的邊界外。
- Library 是否成為 production surface 由其 entry inventory 決定；Studio Library Candidate 本身不建立 production route。

### Renderer viewport ownership

Surface boundary 不能從 feature component 才開始。每個 renderer 都先建立一個佔滿視窗的 registered root，再在其內組合 Shell、Folder 與 feature surfaces。

| Owner                             | 責任                                                                                                | 限制                                                                                             |
| --------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `html`／`body`                    | Viewport geometry、margin reset、system-neutral mount 前 fallback                                   | 不持有 `--ui-*` visual token，不作 v1／v2 system root                                            |
| Document root                     | Theme、density、motion、language metadata 與對平台的 literal `color-scheme` projection              | 不宣告 `data-ui-system`，不以 `--ui-color-scheme` 取得平台值                                     |
| Renderer `#app`                   | 在 Vue mount 前登記 renderer surface／system，佔滿 viewport，提供 canvas、text、font 與 token graph | Main 已於 Phase 1 切為 v2；Performer 維持 v1                                                     |
| App Shell／Performer visible root | 完整覆蓋各自 renderer canvas，承接該 renderer 的可見背景與內容                                      | 不依賴 `body` 從另一套 system 補色                                                               |
| Native `BrowserWindow` substrate  | Mount 前與透明縫隙可見的 `backgroundColor`；main window 另含 titlebar overlay palette               | 不由 CSS inheritance 推導；Main Shell 與 Performer 各自在其 atomic cutover 同步更新              |
| Formal native-control component   | Range accent、focus ring、field chrome 等 platform control 外觀                                     | `base.css` 不保留全域 visual-token recipe；現行 range rule 收回 `UiRangeControl`／正式 primitive |

`src/main.js` 與 `src/performer-main.js` 都屬 Phase 0 renderer bootstrap inventory。Main window 的 native background／titlebar 在 Phase 1 Shell cutover 更新；Performer 的 native background 在 Phase 5 更新。每次更新都要驗證從建立視窗、`ready-to-show` 到 Vue mount 後沒有異色閃爍或未擁有的邊緣。

## 替換不可破壞條件

- Token v2 是控制台唯一目標系統。Token v1 沒有永久 compatibility layer。
- 遷移期間只允許已登記 surface 之間的明確 v1／v2 並存；同一 surface 內不得無聲混用。
- T1-only 名稱不得複製到 T2，也不得建立 `var(--new, var(--old))`、新舊雙向 alias 或 page-local fallback。
- 共用 token 依 primitive → semantic → component 三層管理。Shell／page geometry 由 layout contract 擁有；feature geometry 留在 component 或 feature recipe。
- Candidate recipe 只有在真實 surface 需要時才合併回正式 `Ui*`。切換後 F8 與 production 使用同一正式元件，不保留第二套 `DemoCandidate*` 真值。

## T1 繼承判斷

繼承的是已驗證的產品行為，不是 T1 的外觀或實作。

| 判斷         | 可繼承內容                                                                                   | T2 表達                                                                          | 不繼承內容                                                 |
| ------------ | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Good／保留   | Titlebar、navigation、workspace、Right Dock、PlayerBar 的固定位置與不位移操作                | Shell layout contract、named regions、穩定 control slots                         | T1 surface 色、shadow、radius 或 selector 結構             |
| Good／保留   | Sidebar 的 resize floor／default／ceiling 與 keyboard resize 行為                            | Shell navigation inline-size contract 與既有 state owner                         | `playlist` feature 名稱被誤當成 shell token owner          |
| Good／保留   | Current、selected、danger、gated 分責；不可逆操作需確認                                      | T2 semantic state＋正式 component intent／variant                                | `surface-playing`、文字比對動詞或 material 色代替狀態      |
| Good／保留   | 固定 header、body-only scroll、bounded workspace panes                                       | `AppFolderLayout`＋`AppFolderPage` document／workspace mode                      | Page 與 feature 重複 perimeter、雙重 vertical scroll       |
| Good／保留   | Track／playlist metadata 的掃讀順序、穩定 artwork／action lane、ellipsis／marquee 規則       | 正式 Row／Thumb／Text Action component contract                                  | 全域高密度、hover 才存在的必要操作                         |
| Good／保留   | Dark／light、density、keyboard、focus、forced-colors、reduced-motion 與 Windows scaling 證據 | 每個 surface 的共同 acceptance matrix                                            | 只因舊值通過測試就複製舊 palette                           |
| Mixed／收斂  | Folder personality 與 Context bay                                                            | Folder exterior material 由 layout component 擁有；Right Dock 維持 shell sibling | Raw color prop、feature identity 色、空白 Inspector column |
| Mixed／收斂  | Direction C 的 live／queue／Output 辨識強度                                                  | 只在真實 live context 使用 named tone／variant                                   | 全域 operations-board 密度或高彩度模式                     |
| Reject／排除 | Archive aliases、generic legacy aliases、跨元件偶然共值                                      | 改寫到既有 T2 role 或正確 owner 後刪除                                           | 舊名稱、舊數值、compatibility fallback                     |
| Reject／排除 | Output-preview、Lyrics、Performer 的特殊呈現被算進 core parity                               | 獨立 feature-token layer                                                         | 為讓差距數字歸零而灌入 T2 core                             |

## Token ownership

Token 使用 primitive → semantic → component／layout 三層。Primitive 保存原始尺度與 palette；semantic 表達 canvas、text、accent、danger、focus、border 等跨元件角色並負責 theme mapping；component／layout token 描述單一 owner 的 property、variant 與 state。Feature-token layer 保存無法提升成控制台共用語意的特殊 presentation contract。

新 token 遵守：

```text
--ui-{owner}-{property}-{variant}-{state}
```

- 新名稱使用完整 property word，不再為新 contract 混用 `bg`／`background`。
- 新 layout geometry 優先使用 `inline-size`、`block-size`、`inset-inline`、`inset-block`。
- Variant 表達結構或 tone；state 表達 hover、pressed、focus、disabled、selected 等互動狀態。
- 只有兩個以上獨立 owner 證明相同語意，component token 才能提升到 semantic／core。
- 既有正式 T2 token 不做全域機械改名；只有 owner contract 改變或對應 surface cutover 時遷移，且不建立第二層 alias。

### Core T2

Core 只包含跨控制台通用的 primitives、semantic roles 與已被正式元件消費的 aliases。現行 gap audit 的 danger contrast 已完成正式 adoption；剩餘五項 shell geometry 在 shell replacement slice 以新 owner 名稱建立：

- `--ui-shell-navigation-inline-size`
- `--ui-shell-navigation-inline-size-min`
- `--ui-shell-navigation-inline-size-max`
- `--ui-shell-content-inset-block`
- `--ui-window-titlebar-block-size`

這些名稱取代 `playlist` feature ownership 與舊 titlebar／panel aliases。既有 JavaScript resize authority、Electron DIP boundary 與測試過的 min／max 行為不因 CSS 改名而改變。

### Component／layout layer

元件內部 geometry 由正式 component root 宣告 component aliases，值只引用 T2 foundation／semantic roles。只有兩個以上獨立 owner 證明相同語意時才提升到 core。

Folder family 是 layout layer：`AppFolderLayout` 擁有 navigation、cover rail、外觀色與 perimeter；`AppFolderPage` 擁有 neutral document、fixed header 與唯一 body mode。第一版只有 primary Folder material，不建立裝飾性 variant。

Folder 第一版使用 `--ui-color-folder-primary` 作 semantic source、`--ui-folder-layout-background` 作 exterior layout alias、`--ui-folder-page-background` 作 neutral document alias。既有 `--ui-folder-bg` 在 Folder cutover 同 slice 遷移並刪除，不保留 alias；`secondary`／`tertiary` material 在沒有獨立 production consumer 前不公開。

### Feature-token layer

Lyrics、Output preview 與 Performer 的特殊字級、舞台色與 presentation geometry 移至各自載入的 feature styles，例如 `styles/features/lyrics.css`、`output-preview.css` 與 `performer.css`。新名稱使用 feature namespace，不從 T1 alias，也不反向供 core component 消費。

Public Output 繼續只使用 `--ovl-*`。控制台 Output preview 可以保留其藝術方向，但不得匯入 public Overlay stylesheet 或把 preview palette 提升成控制台品牌 palette。

## Component 與程式命名治理

一般 repository 命名以 [Codebase Naming Contract](codebase-naming.md) 為準。本節只定義 Token v2 replacement 會碰到的 UI layer、domain vocabulary 與 rename gate。

### Layer suffix

| Suffix          | 使用時機                                          | 不應用於                          |
| --------------- | ------------------------------------------------- | --------------------------------- |
| `View`          | `src/views/` 的 destination／頂層 composition     | Reusable chrome 或 primitive      |
| `Layout`        | 可重用 geometry、slots 與外層 ownership           | Domain state 或資料操作           |
| `Page`          | Header、body mode、focus 與 page anatomy          | App-wide persistent chrome        |
| `Shell`         | App-wide persistent chrome 與 top-level placement | Feature body                      |
| `Workspace`     | Feature-owned 多區域操作面                        | 單一 bounded region               |
| `Panel`         | Bounded subregion、disclosure 或 Dock content     | Route／destination                |
| `Dock`          | Shell-owned persistent edge surface               | Feature page column               |
| `Section`       | Component／page 內的內容分組                      | 獨立 destination                  |
| `Header`        | Heading、description 與 actions region            | 整頁 anatomy                      |
| `Toolbar`       | 主要由 actions 組成的操作列                       | Navigation destination            |
| `Popover`       | Anchored transient surface                        | Protected interruption            |
| `Modal`         | Protected top-layer interruption                  | 新增平行的 `Dialog` public family |
| `Row`           | 一筆重複 record identity                          | Generic clickable container       |
| `List`／`Table` | Collection semantics                              | 單筆 editor                       |
| `Picker`        | 選擇既有 object                                   | 修改 object content               |
| `Editor`        | 修改 draft／document                              | Read-only projection              |
| `Preview`       | Non-authoritative projection                      | Runtime state owner               |
| `Stage`         | Authored presentation canvas                      | Generic page wrapper              |
| `Transport`     | Playback control cluster                          | 整個 player surface               |
| `Workbench`     | Specialist multi-tool operating surface           | 一般設定或文件頁                  |

### Domain vocabulary

- Code domain 使用 `PerformanceSession`；使用者文案可維持「待唱安排」。
- `Folder` 指 `AppFolderLayout` 的外觀與 navigation family，不用 `Archive` 作 compatibility metaphor。
- `RightDock` 指 Shell edge surface；feature context 不把自身命名成第二個 Dock。
- Runtime visual-system API 使用 `uiSystem`；F8 review page selection 使用 `visualReview`，兩者不得共用 `visualSystemMode`。
- `Bgm` 用於 PascalCase／camelCase identifier，`BGM` 用於 user-facing prose。
- `Output`、`Overlay`、`Workbench` 維持既有明確 domain 差異，不互相正規化成同一詞。
- `Candidate`、`Dossier` 只允許 development review artifact；不得成為 production public component、route 或 state API。

### Rename matrix

| Current                       | Target／結論                                                                 | Action boundary                                                        |
| ----------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `AppArchiveFrame`             | `AppFolderLayout`                                                            | Folder family cutover 時 rename，刪除舊 component 與 aliases           |
| `AppTopTabs`                  | Delete；只有 navigation 真有獨立 owner 時建立 internal `AppFolderNavigation` | Folder family cutover                                                  |
| `AppInnerPage`                | `AppFolderPage`                                                              | Folder family cutover 時 rename，禁止 compatibility wrapper            |
| `UiPageHeader`                | Retain                                                                       | 作為內容 primitive，由 `AppFolderPage` 擁有 placement                  |
| `AppUtilityFrame`             | `AppUtilityPage`                                                             | Utility surface cutover；不提前 cosmetic rename                        |
| `SessionPreparationWorkspace` | `PerformanceSessionWorkspace`                                                | 已隨 Performance Session cutover 完成，舊檔已刪除                      |
| `SessionPlanList`             | `PerformanceSessionPlanList`                                                 | 已隨 Performance Session cutover 完成，舊檔已刪除                      |
| `SessionPlanReviewEditor`     | `PerformanceSessionPlanEditor`                                               | 已隨 Performance Session cutover 完成，舊檔已刪除                      |
| `SessionManualItemForm`       | `PerformanceSessionManualItemForm`                                           | 已隨 Performance Session cutover 完成，舊檔已刪除                      |
| `PerformanceSessionPanel`     | Retain                                                                       | 名稱與 domain owner 已一致                                             |
| `useVisualSystemMode`         | `useVisualReviewMode`                                                        | F8 review infrastructure slice；不得成為 production runtime API        |
| `StudioLibraryDossier*`       | Development-only retain until candidate disposition                          | 不得直接 promotion 到 production；adoption 時改用正式 owner 名稱或刪除 |
| `DemoCandidate*`              | Delete after formal adoption                                                 | 每個 component adoption slice 同步移除                                 |

未列入矩陣的 stable component 不因字面整齊而改名。若 owner 尚未確認，先完成 responsibility split，再決定 rename／move；不得以 barrel 或 wrapper 永久保留雙名稱。

### Rename gate

Rename 必須與對應 atomic surface cutover 同一 slice 完成：

1. 改 component／file／export 名稱與必要 folder ownership。
2. 更新 imports、CSS selectors、surface ids、tests、fixtures 與 documentation references。
3. 移除舊 component、selector、registry entry 與 compatibility alias。
4. 驗證 serialized data、IPC、URL 與外部 contract 未被誤改。
5. 以 visual／behavior regression 證明只有 ownership 與命名改變，feature 設計與功能未被刪減。

## F8 與 Candidate 邊界

F8 保留三個用途：

1. 最終決策板：只顯示精簡設計方向、保留／收斂／排除與完整 layout specimen。
2. Studio Library Candidate：用真實資料檢查 feature density、Folder material 與 document plane。
3. 完整元件回歸目錄：檢查 theme、density、state、responsive 與 accessibility。

F8 已移除 `Setlist Current` 比較頁；這不代表刪除 production Setlist。最終決策板不得再加入 migration、token、registry、production status 等工程文案。

Candidate recipe 只有在真實 production consumer 需要時才能進入正式 API。通過後將 recipe 合併到正式 `Ui*`，讓 F8 與 production 使用同一 implementation，並刪除對應 `DemoCandidate*`。完整 catalogue 是 regression evidence，不是 owner approval surface。

## Fail-closed surface boundary

混合遷移期的 document root 只持有 theme、density、motion、語言與 literal platform `color-scheme` 投影，不持有 visual-system token，也不宣告 `data-ui-system`。每個已登記的 surface root 同時宣告：

```html
<section data-ui-surface="folder-layout" data-ui-system="v2">...</section>
```

Surface id 使用穩定、kebab-case、owner-oriented 名稱，例如 `app-shell`、`folder-layout`、`setlist`、`performance-session`、`import`、`lyrics`、`output`、`settings` 與 `performer`。未登記 surface 不得自行切換 system。

Scope contract：

1. V1 declarations 只匹配 `[data-ui-system='v1']`；V2 declarations 只匹配 `[data-ui-system='v2']`。Component selectors 也從最近的 registered surface boundary 開始，不再依賴 `:root` 才能 opt in。外層 system selector 不得穿過內層 registered boundary。
2. V2 boundary 載入 legacy-token invalidation layer，將所有尚存 T1-only names 設為 guaranteed-invalid custom-property value。若 migrated code 引用舊名稱，畫面與測試必須失敗，不能從 v1 ancestor 繼承。
3. 只有 machine-readable surface registry 內的 root 可以改變 `data-ui-system`。不得在單一 button、row、modal body 或 page fragment 建立 v1 island。
4. 一條 DOM path 在 transition 中最多改變一次 visual system；允許 v2 shell 暫時承載完整 v1 child surface，不允許 v2 → v1 → v2 的交錯 nesting。
5. Teleport／portal 必須進入與觸發 owner 相同 system 的 surface-local overlay host。Global notification 與 shell menu host 屬 shell；feature modal 屬該 feature 或其同系統 overlay surface。
6. `base.css` 保持 system-neutral。任何消費 visual token 的 base rule 必須移至 registered system scope 或正式 component recipe；`body`、全域 range accent 與 range focus 不得繼續引用 `--ui-*`。
7. Theme／density／motion 是 metadata，不是 system selector。Scoped token entry 以 ancestor metadata 投影到 descendant surface，例如 `:root[data-ui-theme='light'] [data-ui-system='v2']`；不得把 `data-ui-system` 寫回 document root。`:lang()` 與 truly cross-system 的 reduced-motion behavior 可以保持 document-wide，但 system-specific motion values 仍由 surface token graph 提供。

這種並存是有名稱、可計數、可整面移除的 migration boundary，不是允許元件從另一套系統補值的 compatibility hybrid。

### Phase 0 pre-activation scope inventory

| Inventory                           | Pre-activation evidence                                                                                                                              | Phase 0 disposition                                                                                                                  |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Token entries                       | `tokens.css` 以無條件 `:root` 提供 v1；`tokens-v2.css` 有 9 個 `:root[data-ui-system='v2']` selector                                                 | 改為明確 v1／v2 surface entries，metadata 由 document root 向 descendant surface 投影                                                |
| Adopted component／layout selectors | 6 個檔案共 50 處 root-bound v2 selector：`UiRangeControl` 26、`UiButton` 8、`UiRange` 6、`UiIconButton` 4、`AppTopTabs` 4、`UiTextButton` 2          | 46 處正式 shared component selector 改成 nearest-boundary recipe；`AppTopTabs` 4 處先改成 scoped transition recipe，Phase 2 原子移除 |
| Renderer entries                    | `src/main.js`、`src/performer-main.js` 都全域載入 `tokens.css`；兩個 HTML entry 都只有裸 `#app`                                                      | Vue mount 前把 `#app` 登記為 renderer root；Phase 0 仍選 v1，之後由 registry 切換                                                    |
| F8 system writers                   | `DemoView.vue`、`InternalToolsView.vue`、`StudioLibraryPrototypeView.vue` 直接寫 `document.documentElement.dataset.uiSystem`                         | 改寫為 registered review／specimen surface，不污染 document root                                                                     |
| F8 specimen markers                 | `DemoActionMenuLayer.vue`、`DemoModalLayer.vue` 把 source marker 寫到 document root，appearance selector 也依賴 root                                 | Marker 與 selector 移到對應 specimen surface root                                                                                    |
| Isolated review apps                | `prototypes/ui-component-lab` 與 `prototypes/studio-library-workspace` 以 document root 啟用 v2；component lab 另載入 `base.css`                     | 納入 Phase 0 review infrastructure，同樣使用 registered demo surface root                                                            |
| Metadata writers                    | `useTheme.js`、`useUiDensity.js` 與 `performer-main.js` 投影 root metadata；v2 另有 root motion selectors                                            | 保留 metadata authority，新增 ancestor-to-surface contract；motion selector只能表達跨系統共同 behavior                               |
| Viewport substrate                  | `base.css` 的 `body` 消費 canvas、text、font tokens及 `--ui-color-scheme`；Electron main／Performer 有 native background，main 另有 titlebar palette | 依 Renderer viewport ownership 分責；native palette跟隨各 renderer atomic cutover                                                    |

這份 inventory 是 Phase 0 的固定輸入。任何新發現的 root-bound system selector、root system writer、renderer entry 或 portal target，都必須先加入 inventory 與測試，不能直接在 migration slice 中順手處理。

### Shared component coexistence

遷移期共用 `Ui*` 可以同時服務 v1／v2 caller，但必須是一份正式 component contract，不是「未 scoped 的 v1 base 加 root-bound v2 override」。Phase 0.3 已把六個既有 root-bound component 改為 nearest-boundary `@scope` recipe；共用 semantic mapping 只有在兩套系統刻意相同且各自 token graph 完整時才共用，差異仍由互斥 scoped recipe 表達。

Shared component contract 同時要求：

1. Markup、props、events、keyboard behavior、focus behavior 與 accessibility API 只有一份。
2. 只有不含 visual token 的 invariant anatomy 可以 system-neutral；v1／v2 各自提供完整且互斥的 visual recipe。
3. Recipe 由最近 registered surface boundary 決定；v1 parent 內的 v2 child 與 v2 parent 內的 v1 child 都不得受外層 recipe 滲入。
4. V2 recipe 缺少任何 property 時必須由 no-T1／invalidation gate 失敗，不能退回未 scoped v1 declaration。
5. Recipe 可以同置於 SFC 或拆成 sibling stylesheet；這是 implementation choice，不得改 caller API 或形成兩個 component truth。
6. Nested v1／v2 fixture、theme／density projection 與 shared component states 是 Phase 0 必測項目。

### Teleport／overlay host inventory

Vue Teleport 保留 logical component tree，因此 surface provider 可以用 provide／inject 向 primitive 提供 target host；實際 DOM destination 仍必須是 registry 中與 trigger owner 關聯的 overlay surface。

| Primitive／surface        | Pre-activation target | Registered target owner                |
| ------------------------- | --------------------- | -------------------------------------- |
| `UiTooltipSurface`        | `body`                | Trigger 所屬 surface 的 overlay host   |
| `UiCombobox`              | `body`                | Trigger 所屬 surface 的 overlay host   |
| `UiContextMenu`           | `body`                | Trigger 所屬 surface 的 overlay host   |
| `UiModal`                 | `body`                | Feature owner 或其同 system modal host |
| `UiNotificationHost`      | `body`                | App Shell global overlay host          |
| `UiPopover`               | `body`                | Trigger 所屬 surface 的 overlay host   |
| `DemoCandidateActionMenu` | `body`                | F8 specimen surface host               |
| `DemoCandidateModal`      | `body`                | F8 specimen surface host               |

Host resolver 由 renderer／surface composition 提供，primitive 內部解析，不要求每個 caller 傳 DOM selector。Host 必須在 overlay 開啟前存在，帶有自己的 `data-ui-surface`／`data-ui-system` registry identity，並保留 viewport escape、focus trap／return、dismissal、stack order 與既有 module-level modal ordering。Production primitive 不得在 host 缺失時靜默回退 `body`；測試 harness 如需 fallback，必須顯式註冊。Global shell notification／menu 與 feature modal 可以使用不同 host，但同一 overlay stack 的 z-order 規則只有一份。

## Migration infrastructure

切換 production 前先完成 scoped token entries、surface registry 與兩個機械 gate。V1／V2 各有明確 stylesheet entry 與 selector scope；production 預設仍為 v1，cross-version feature tokens 從 T1 core 抽離，不以 shared file 形成隱性 fallback。

Machine-readable registry 記錄 surface id、system、renderer、parent boundary、entry owner、overlay host 與 migration status，並拒絕 component-level islands 與交錯 nesting。Renderer bootstrap 只從 registry 建立 root boundary，不由 view 任意寫 document dataset。

### Phase 0 implementation order

Phase 0 分成可獨立落地的 bootstrap、無 runtime 行為的 cutover preparation，以及單一 scope-foundation activation。CSS custom property 會穿過 descendant boundary 繼承；現行 root-bound component recipe、`body` Teleport 與 F8 document-root writer 又共同依賴舊 scope。因此 scoped token entry、shared recipe、overlay host、review surface 與 legacy invalidation 不能拆成先後啟用的 production states，否則中間狀態必然是無聲 hybrid 或視覺退化。

以下 slices 依序完成。0.2 只產生 deterministic artifacts、RED fixtures 與 exact cutover map，不加入 runtime compatibility layer；0.3 已把所有 scope-dependent owners 原子啟用。每個已落地 slice 都可獨立 revert，整個 Phase 0 期間 production Main 與 Performer 均保持 v1 外觀。

| Slice | Ownership                                                                                                                                                                                                                                                                                                                                                                                                                  | Exit evidence                                                                                                                                                                                                |
| ----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
|   0.1 | Renderer bootstrap：Main／Performer 的 `#app` registered root、viewport geometry、system-neutral body fallback 與 native substrate inventory                                                                                                                                                                                                                                                                               | Mount 前／後 canvas owner 明確、兩個 renderer 為 `registered-v1`、document root 初始無 `data-ui-system`；實機 dark／light continuity 保留 manual acceptance                                                  |
|   0.2 | Scope cutover preparation：由 canonical audit 產生 legacy manifest／invalidation artifact，先建立 no-T1 isolation、雙向 mixed-boundary、metadata、portal 與 review-surface RED fixtures，並鎖定 feature-token extraction、46 處正式 component selector、`AppTopTabs` 4 處、六個 production Teleport、三個 F8 writer、兩個 specimen marker、兩個 isolated prototype 與 `useVisualReviewMode` rename 的 exact activation set | Artifacts 可重建且 unique counts／pair baseline 一致；fixture 能證明現況未達成 boundary contract；production import、selector、Teleport target、F8 copy 與 feature visual implementation 均未改變            |
|   0.3 | Atomic scope-foundation activation：同一 implementation slice 啟用 v1／v2 scoped entries、metadata projection、feature-token extraction、`base.css` visual rule relocation、50 處 shared recipe、registered overlay hosts、review／prototype surface roots、generated invalidation 與全部 harness；不保留 document-root system selector 或 compatibility alias                                                             | `body` 零 `--ui-*`、50 處不依賴 document root、production Teleport 不落 `body`、F8／labs 只改 registered surface；nested boundary 無 token bleed、v2 缺值明確失敗、CI ratchet／完整 visual regression 全通過 |

0.3 的 activation set 不得再拆成可合併的中間狀態。實作時可以在同一未提交 worktree 先寫測試、resolver 或 generated artifact，但 production selector／import 一旦切換，就必須連同 overlay target、review boundary 與 invalidation 一起完成或整組回滾。

### Legacy manifest ratchet

Checked-in manifest 記錄每一個 T1-only `surface／file／token` pair 與 surface status。CI 規則是：

- 不得新增 pair；baseline 只能減少。
- 標記為 v2 的 surface 必須是零 pair。
- 同一 slice 必須刪除已替換 selector、T1-only declaration、migration alias 與 registry allowlist entry。
- Shared file 若同時服務 v1／v2，必須已是正式跨系統 component contract；否則拆分 owner，不能以 shared 檔案規避 surface gate。
- Hotfix 若暫時必須修改 v1，只能改既有 pair，不得建立新 token 名稱或擴大 consumer 範圍。

Manifest 與 invalidation 名單都由同一 canonical token inventory 產生，不手抄第二份清單。Invalidation 只包含當下尚存的 T1-only names；已正式抽到 feature layer、正式跨系統 shared contract 或 T2 owner 的名稱不得被誤 poison。

正式 generator 是 `scripts/token-v2-migration-inventory.mjs`；checked-in truth 為 `src/styles/token-v1-legacy-manifest.generated.json` 與 `src/styles/token-v1-invalidation.generated.css`。`npm run tokens:v2:check` 只檢查 byte-for-byte reproducibility，`npm run tokens:v2:generate` 才更新 artifacts。Phase 0.3 起兩個 renderer entry 都載入 generated invalidation；後續 surface cutover 必須靠它讓殘留 T1-only reference fail closed。

### No-T1 harness

No-T1 gate 有兩種互補 harness：

1. V2 isolation harness 完全不載入 `tokens.css`，只載入 T2、system-neutral base、該 surface 正式 component styles 與明列的 feature-token files。
2. Mixed-boundary harness 同時載入兩個 scoped entries，以 v1 → v2 及 v2 → v1 fixtures 驗證最近 registered boundary、metadata projection、shared recipes 與 overlay host；這個 harness 不授權 production 建立 v2 → v1 → v2 nesting。

每個準備切換的 surface 必須在 isolation harness 中 mount，並由兩種 harness 共同驗證：

- 所有使用到的 custom properties 均有本地定義，沒有 fallback 到 T1-only name。
- Dark／light、standard／compact、narrow、keyboard、forced-colors、reduced-motion 與 loading／empty／error／disabled 等真實 states。
- Header、toolbar、body 與 internal pane 的 scroll authority 唯一。
- 內容壓力、CJK／Latin metadata、100%／125%／150% Windows scaling 沒有溢位或不可操作區域。
- Renderer bootstrap、native background／titlebar 與 mount 後 canvas 之間沒有異色閃爍、透明縫隙或無 owner 畫面。

## Atomic replacement protocol

### Entry gate

Surface 進入實作前必須同時具備：

- Owner 核准的完整 comp／contract，而不是單一元件截圖。
- 真實資料與必要 states 的 consumer inventory。
- Page mode、scroll owner、portal host 與 responsive boundary 已確定。
- 所需 Candidate 已合併到正式 `Ui*`，或已判定由 feature recipe 擁有。
- T1-only pair、舊 selectors、舊 names 與 runtime state owners 的完整清單。
- 可單獨 mount 的 no-T1 harness 與回滾邊界。

### Cutover slice

一次 slice 必須完成整個 surface：

1. 重組 layout／component ownership並接回原有 composable／IPC state owner。
2. 完成同 surface 的 component、file、token 與 surface id 命名收斂。
3. 將 surface registry 與 root 切到 v2。
4. 刪除該 surface 的舊 selectors、T1-only references、aliases 與重複 Candidate implementation。
5. 讓 legacy manifest 下降到該 surface 零 pair。
6. 通過 no-T1 harness、自動測試、build 與實際 Electron 可見驗收。

禁止只把一部分 token 改名、讓同一 DOM subtree 同時依賴 v1／v2，或先保留舊 CSS「以防萬一」。若驗收失敗，rollback 單位是整個 surface 的 registry switch、stylesheet／import 與 implementation slice；每個 slice 必須能獨立 revert，不以 compatibility alias 修補半套狀態，也不要求另一個未完成 surface 一起回退。

### Exit gate

Surface 只有在以下條件全部成立後才可標記完成：

- Production route 只會 mount 新 owner；舊 component／selector 已刪除或無 consumer。
- T1-only pair、舊名稱與 migration alias 為零，legacy invalidation 與 no-T1 harness 均通過。
- Theme／density／responsive／a11y／state matrix 與實際 Electron scaling 完成。
- Feature visual、資料行為與操作能力無未授權刪除；差異有 owner 明確核准。

## Replacement order

| Order | Atomic surface               | Included ownership                                                                                                                                                     | Explicit child boundary after cutover                                        |
| ----: | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
|     0 | Migration infrastructure     | Renderer viewport bootstrap、scoped entries、shared recipes、overlay hosts、F8／prototype root cleanup、manifest／invalidation、dual harness、feature-token extraction | Production Main／Performer remain v1                                         |
|     1 | Persistent App Shell         | App grid、Titlebar、navigation、Right Dock、PlayerBar、BGM placement、global overlay hosts 與五個 shell gaps                                                           | Folder workflow、Settings／utility content may remain registered v1 children |
|     2 | Folder layout family         | `AppFolderLayout`＋`AppFolderPage`；原子移除 `AppArchiveFrame`＋`AppTopTabs`＋`AppInnerPage` 與 candidate-root override                                                | Feature bodies remain whole registered surfaces                              |
|     3 | Primary feature pages        | Setlist、Performance Session、Import、Lyrics、Output control panel；一次只切一個完整 feature                                                                           | Only later features may remain v1                                            |
|     4 | Utility／specialist surfaces | Settings、Music Analysis、provider evaluation、Diagnostics 與 gated internal workbenches                                                                               | Performer remains separate renderer                                          |
|     5 | Performer renderer           | Performer entry、window chrome、stage 與 feature tokens 整面切換                                                                                                       | None                                                                         |
|     6 | Final deletion               | Root defaults、development catalogue cleanup、T1 stylesheet／scope／payload removal                                                                                    | Public `overlay/` remains independent and unchanged                          |

Studio Library Candidate remains evidence for layout and data density; it is not an extra production destination. Feature photos、stack、notes、template artwork and other approved visual work stay inside their feature surface and are not deleted by shell／page replacement.

### Primary feature order

Phase 3 內依 dependency 與 layout 共用程度執行：

1. Setlist：先證明 `document` mode、row density 與 page-level scroll。
2. Performance Session：統一 domain naming，證明 `workspace` mode 與 Right Dock projection boundary。
3. Import：證明長流程、progress、error 與 `document` mode。
4. Lyrics：切出 feature-token layer，證明多 pane workspace 與 reading state。
5. Output control panel：維持 public Overlay 隔離，證明 preview／Workbench 與 runtime owner 分離。

Library 只有在 production owner、entry 與資料 authority 明確後加入；F8 Studio Library Candidate 不自行產生 migration phase。

## 驗證矩陣

每個 phase 至少包含：

| 類別              | 必須驗證                                                                                            |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| Token isolation   | No-T1 isolation、mixed nested boundary、undefined custom property、legacy pair、bundle payload      |
| Naming            | Stale import／selector／fixture／registry id、duplicate owner、forbidden production term            |
| Theme／density    | Dark、light、standard、compact；document metadata正確投影到每個 registered surface                  |
| Layout            | Wide、narrow、內容壓力、document／workspace scroll boundary                                         |
| Interaction       | Pointer、keyboard、focus return、disabled、loading、empty、error                                    |
| Accessibility     | WCAG AA contrast、forced-colors、reduced-motion、ARIA ownership                                     |
| Runtime           | 原 composable／IPC owner、Teleport host system／lifecycle、renderer bootstrap、獨立 rollback        |
| Desktop           | Mount 前／後 canvas 與 native chrome、Electron visible acceptance、100%／125%／150% Windows scaling |
| Regression        | Focused tests、完整 tests、ESLint、Prettier、Markdownlint、build、`git diff --check`                |
| Visual protection | F8 final board、feature photos、stack、notes、template artwork 與既有操作未被刪改                   |

Offscreen capture 與 DOM／CSS assertion 只能作 supporting evidence，不能取代實際 Electron 可見驗收。

## Final deletion gate

Token v1 can be deleted only when all conditions are machine-verifiable:

- Legacy manifest and every surface allowlist are empty.
- Production entries no longer import or package `tokens.css`.
- No `[data-ui-system='v1']` scope、legacy invalidation entry or migration alias remains.
- No T1 token consumer、舊 component import、舊 selector或雙名稱 wrapper remains.
- No `DemoCandidate*` remains as an implementation truth; F8 uses formal components only.
- Production bundle contains no T1 token payload.
- Main renderer and Performer pass full automated and visible acceptance; public Output remains green under its independent tests.

在此之前，狀態只能寫成「replacement in progress」，不得宣稱「Token v2 production-ready」或「migration complete」。

## 當前狀態與下一步

已完成 Candidate critique、Good／Mixed／Bad 決策、F8 最終板精簡、Folder page anatomy、body modes、material ownership、T1 gap classification、atomic replacement architecture、layer taxonomy、domain vocabulary 與 rename matrix。由真實 consumer 證明的 `UiButton` danger intent 等首批 component adoption 也已完成。

Phase 0 contract audit 另確認並補齊 renderer viewport／native window substrate、6 檔 50 處 root-bound selector、shared component coexistence、6 個 production＋2 個 demo Teleport、三個 F8 system writer、兩個 F8 specimen marker、兩個 isolated prototype 與 `useVisualReviewMode` rename。這些原本會讓 document root 去 token 化後失去 owner，或讓 shared component／portal 繼續形成無聲 hybrid；現在都已進入 Phase 0 的固定 inventory、順序與驗證 gate。

Production replacement 已進入 Phase 3.4。Phase 0.1–0.3 migration infrastructure 已完整啟用：Main／Performer 以同一 immutable registry 在 Vue mount 前登記 full-viewport `#app`；兩個 renderer entry 同時載入 scoped T1／T2 entries 與 generated invalidation。Document root 不持有 visual-system，`body` 不消費 `--ui-*`，canvas／text／font 由 registered surface 承接。

Phase 0.3 已把 6 檔 50 處 root-bound recipe 改為 nearest-boundary `@scope` contract，6 個 production＋2 個 demo Teleport 改由 surface-local overlay host 承接，F8／Internal Tools／isolated prototypes 只登記自己的 v2 surface。`useVisualReviewMode` rename 與 72 個 cross-version feature-token extraction candidates 亦已完成，沒有保留 document-root writer、`body` portal fallback 或 compatibility alias。

Phase 1 已把 Main `app-shell`、global overlay host、Titlebar、Sidebar navigation、Right Dock、PlayerBar、BGM placement 與 Electron main native background／titlebar palette 同批切為 v2。Utility content 仍是有同 system overlay host 的完整 registered-v1 child surface，等待 Phase 4。

Phase 2 已以 `AppFolderLayout`／`AppFolderPage` 完整接手 Folder navigation、material、perimeter 與 document／workspace body mode；舊三件組、candidate-root override、`--ui-archive-*` 與 candidate Folder aliases 已同批刪除。F8 使用相同正式元件，只保留 specimen data／controls／content。

Phase 3.1 已將 Setlist 與 `setlist-overlay` 原子切為 v2，保留一般瀏覽時 `AppFolderPage` 的 `document` mode 與 page-level scroll owner；Header／Table 改用既有正式 v2 weight／radius／motion names，F8 Studio Library selected row 回到已核准的中性文字色 8% surface recipe，沒有 compatibility alias 或 feature anatomy 變更。

Phase 3.2 已將 `performance-session-workspace` 與 local overlay host 原子切為 v2；場次開啟時 Folder page 動態切為 `workspace` mode，由 workspace 內兩個具名 pane 擁有 scroll。四個舊 `Session*` components／tests 已移入 `components/performance-session/` 並改為完整 `PerformanceSession*` domain names，舊檔、舊 CSS selector、compatibility wrapper 與雙 import 路徑皆移除。Shell 內的 `PerformanceSessionPanel` 維持既有 v2 Right Dock projection，不嵌入 workspace editor，也不新增 feature boundary。Feature anatomy、互動與資料 authority 均未變更。

Phase 3.3 已將 Import 與 `import-overlay` 原子切為 v2，維持 `AppFolderPage` 的 `document` mode 與 page-level scroll owner；只有 playlist preview 的 track list 保留 bounded internal scroll。`ImportView`、`ProviderImportPanel`、`ImportCandidateOption` 名稱已符合 page／domain panel／option 結構，因此沒有 cosmetic rename；本機匯入、provider resolution、single／playlist preview、progress、error、retry、completion anatomy 與資料 authority 均未變更。

Phase 3.4 已將 Lyrics 與 `lyrics-overlay` 原子切為 v2，維持 `AppFolderPage` 的 `workspace` mode；Folder page 不建立 document scroll，reader、timing editor 與來源搜尋只在各自 bounded 區域內擁有必要 scroll。13 個 production Lyrics consumers 的 20 個 legacy file-token pairs 已改為正式 radius、typography、motion 與 popover layer names；選歌、來源管理、LRCLIB 搜尋、手動匯入、逐行閱讀／編輯、timing 與 live offset anatomy／authority 均未變更。既有 component names 已清楚表達 domain 與角色，因此沒有 cosmetic rename；`components/lyrics-provider/` 的 Internal Tools review surface 明確留在 Phase 4。Output 是 Folder workflow 最後一個 registered-v1 feature surface。

Canonical generator 現在鎖定 T1 331／T2 407／T1-only 87 unique declarations、37 個 production-consumed legacy names、38 個 files 與 89 個 file-token pairs；Phase 3.4 移除 Lyrics 的 20 pairs，並使 `--ui-line-height-headline` 不再被 production 消費。下一個 atomic implementation slice 依 phase order 是 Output control panel cutover。
