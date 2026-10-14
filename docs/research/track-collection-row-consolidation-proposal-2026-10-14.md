# Track Collection Row／Grid 收束提案

- 日期：2026-10-14
- 狀態：Owner 已核准 F8-first 方向；semantic-column candidate 待可見驗收，不授權 production component 變更
- 模式：Operate
- 範圍：Library 全部曲目、本機檔案、播放清單、專輯與藝人頁的曲目列表

## 1. 文件角色

本文件定義 Track Collection Row 的候選收束方向。它回答的是「哪些內容、互動與狀態必須共用，哪些差異應由集合性質明確推導」，不是目前 production contract。

Owner 已確認文字方向，development-only F8 component specimen 也已建立；依後續metadata／local usage重評估，候選欄位已拆成release、release year、membership與usage四個單位。Artist refinement已先在F8採用source album＋歌曲發行年份；F8 可見驗收通過後，才另行開始 production adoption。提案、候選與正式採用三個階段不得合併。

## 2. 工作與成功條件

Library 使用者在全部曲目、本機檔案、播放清單、專輯與藝人頁之間切換時，應該立即認得同一套曲目列操作：看懂曲目身分、選取、播放、前往相關集合、開啟操作選單，以及在允許時調整順序。集合不同只改變有產品意義的內容，不改變基本操作語法。

提案成功需要同時滿足：

- 五個集合情境共用固定 row anatomy、selection／current／focus狀態與responsive priority；drag是profile capability，不是全域row行為。
- Album／Artist／Playlist 的差異由 named collection profile 推導，不由 template 內散落的 `variant` 判斷或 caller CSS 修補。
- Library 繼續擁有搜尋、排序、selection、playback、menu、reorder 與資料投影；共用元件只 emit intent。
- `UiTrackRow` 保留 compact list／dock／modal 的 flex contract；對齊欄位不硬塞進它。
- 不建立沒有第二個 production consumer 證據的 generic `UiGridTable` 或 ARIA grid。

## 3. 現況證據

Production 目前只有 `TrackTable.vue` 擁有 column-grid track list，直接 consumer 是 `LibraryBrowseContent.vue`。同一 consumer 依狀態投影五個情境，但規則分散在以下位置：

- `TrackTable` 的 `variant` 同時控制 reorder column、artwork、artist line 與預設 accessible label。
- Caller 另外控制 context label、entry 的 `addedAt` 實際語意、sorting、drag capability、title destination 與 action menu。
- `library` variant 同時代表全部曲目與本機檔案，無法從 component contract 看出兩者是不同產品情境。
- `addedAt` 欄位在 Library／Artist 實際承載 `importedAt`，名稱與內容語意不一致。
- Artist 與 Album 的內容差異已存在，但仍以「隱藏某一塊」呈現，沒有完整的 collection profile。

既有 foundation 已明確決定：track table 保留 number／identity／context／duration 等對齊欄位，不強迫進入 `UiTrackRow` 的 flex-row contract。`UiTrackRow`、`UiTrackThumb`、`UiTextButton`、`UiMarqueeText` 與 `TrackArtistCredits` 已提供可重用的 primitive／identity vocabulary，因此本提案不建立平行的 V2 元件庫。

Import collection review、Queue、Separation、Lyrics picker、Diagnostics 與 editor workbench 沒有相同的 header／sort／column priority／reorder 契約，不屬於 Track Collection Table family。

## 4. 候選方向

### 4.1 一個行為家族，兩個 layout owner

Track Collection Table 與 `UiTrackRow` 共用以下語言：

- Track identity：artwork、title、artist credits、duration 與 bounded overflow。
- Row state：default、hover、focus-visible、selected、current，以及 selected＋current。
- Row intent：select、activate、navigate、open actions。
- Nested action：title、artist、artwork或trail control不應誤觸row action。

兩者不共用同一個 root layout：

- `UiTrackRow` 繼續擁有 compact flex anatomy、lead／trail slots 與 modal／dock／queue 用法。
- `TrackTable` 繼續擁有 sticky header、aligned columns、sorting controls、column priority 與 ledger row geometry。

這是 contract 收束，不是 DOM 收束。共享 primitive、tokens、intent naming 與測試矩陣即可證明一致，不用為了程式碼重用破壞兩種不同的 layout semantics。

### 4.2 Canonical anatomy

Track Collection Row 的視覺與 DOM 順序固定如下：

| 順序 | Role         | 內容                                                                                     | Ownership                          |
| ---- | ------------ | ---------------------------------------------------------------------------------------- | ---------------------------------- |
| 1    | Ordinal      | Collection 1-based ordinal；Album可改用來源disc／track ordinal；hover／focus改為播放控制 | Track Collection profile＋row      |
| 2    | Identity     | Optional artwork、title、optional artist credits                                         | Track Collection row               |
| 3    | Release      | Source album；只表示曲目所屬發行內容                                                     | Collection profile                 |
| 4    | Release year | 歌曲canonical release year；缺漏顯示unavailable，不以provider upload date代填            | Collection profile＋metadata owner |
| 5    | Membership   | Added date；只表示曲目加入目前使用者集合的時間                                           | Collection profile                 |
| 6    | Usage        | Utawakui qualified play count；不使用provider global view snapshot                       | Collection profile＋usage owner    |
| 7    | Duration     | Right-aligned tabular duration                                                           | Track Collection row               |
| 8    | Actions      | 固定尾端欄寬；`…`只在row hover／focus-within顯示                                         | Track Collection row＋caller       |

Selected 只表示目前操作對象；Current 只表示 HTML audio authority 投影的播放曲目。兩者可以同時存在，且不得以同一種色塊或 icon 混為一個狀態。

### 4.3 Collection profiles

下表是提案的完整 profile，而不是任意 boolean 組合。`Library all` 與 `Library local` 即使初版視覺相同，也保留不同 kind，避免未來再以隱含 caller 條件區分。

| Collection kind | Artwork | Artist line | Ordinal            | Semantic columns         | Title destination | Reorder behavior                       | Membership action               |
| --------------- | ------- | ----------- | ------------------ | ------------------------ | ----------------- | -------------------------------------- | ------------------------------- |
| Library all     | 顯示    | 顯示        | Collection         | Release／Album           | Album（可解析時） | 無                                     | Delete local track              |
| Library local   | 顯示    | 顯示        | Collection         | Release／Album           | Album（可解析時） | 無                                     | Delete local track              |
| Playlist        | 顯示    | 顯示        | Collection         | Release＋Membership date | Album（可解析時） | 整列；僅custom order時可拖曳／鍵盤移動 | Remove from playlist            |
| Album           | 隱藏    | 顯示        | Source disc／track | Local usage              | 無                | 無                                     | 無membership destructive action |
| Artist          | 顯示    | 隱藏        | Collection         | Release＋Release year    | Album（可解析時） | 無                                     | 無membership destructive action |

Album 與 Artist 的semantic columns是本提案刻意提出的nature adjustment：

- Album 已由 dossier artwork／title 表達集合身分，每列再顯示同一種membership date沒有清楚的album語意；改用來源disc／track ordinal與本機有效播放次數。
- Artist 頁已隱藏重複 artist line；保留每首曲目的source album與歌曲發行年份。無法解析album／release year時使用一致的unavailable placeholder，不偽造destination，也不以`upload_date`代替發行年份。Local usage保留作可選排序／後續統計，不佔Artist預設欄。
- Library all／local的`importedAt`保留作provenance與未來排序依據，但退出一般row預設欄。
- Title 前往 Album 的現有行為第一階段保留。是否將 Artist 頁的 Album destination 從 title 移到release cell，屬於後續獨立決策，不在收束重構中偷改。

### 4.4 Interaction contract

| Input                            | Intent                         | 條件                                            |
| -------------------------------- | ------------------------------ | ----------------------------------------------- |
| Pointer click／Space             | Select row                     | 所有collection kinds                            |
| Pointer double click／Enter      | Activate／play track           | 所有collection kinds                            |
| Title action                     | Navigate to source Album       | Destination可解析，且目前不是該Album            |
| Artist credit action             | Navigate to Artist             | Canonical credit可一一配對，且Artist line有顯示 |
| Trailing menu／context menu key  | Open the same row actions      | 所有collection kinds                            |
| Pointer drag／ArrowUp／ArrowDown | Reorder playlist membership    | Editable playlist、custom order、無search／sort |
| Nested action                    | Execute only the nested intent | 不選取、不播放、不開始reorder                   |

Right click、可見 menu trigger、Context Menu key／Shift+F10 必須收斂到同一個 action owner。滑鼠右鍵不得成為唯一入口。

Artist與Album是資訊型衍生集合，永遠不是drag source或drop target。Profile必須顯式宣告`dragBehavior: none`並阻斷drag／drop intent emission；Playlist則由整列作為唯一drag source，不建立專用handle或額外grid lane。

### 4.5 State contract

F8 specimen 與 production tests 必須涵蓋：

| State                 | 必須證明的結果                                                        |
| --------------------- | --------------------------------------------------------------------- |
| Default／hover        | Row geometry不移動；hover不覆蓋Current cue                            |
| Focus-visible         | 可見focus ring；不依賴color-only                                      |
| Selected              | 使用shared quiet selection surface與`aria-pressed`                    |
| Current               | 使用current title cue與`aria-current`；不自動等同selected             |
| Selected＋current     | 兩種訊息同時保留                                                      |
| Reorder unavailable   | Playlist row不可拖曳；row action不宣告方向鍵調整順序                  |
| Dragging              | 僅可reorder的Playlist row降opacity，identity與drop位置仍可辨識        |
| Drop before／after    | 僅Playlist使用同一個accent indicator，不改row高度                     |
| Long／missing content | 長CJK、Latin、無斷點文字、缺artist／duration均無水平overflow或row跳動 |

Loading、empty、error 仍由 `LibraryBrowseContent` 的集合層處理，不新增假資料列或 skeleton row contract。

### 4.6 Responsive contract

Responsive 依 container 寬度決定，不依 Electron window 或 Sidebar flag推導：

| Tier    | 保留內容                                                     |
| ------- | ------------------------------------------------------------ |
| Wide    | 全部profile columns                                          |
| Medium  | 先移除Membership／Usage／Release year；保留Release與Duration |
| Narrow  | 再移除Release；保留Ordinal、Identity、Duration、Actions      |
| Minimum | 最後移除Duration；保留Ordinal、Identity、Actions             |

Membership／Usage／Release year先於Release隱藏，Duration最後才隱藏；Ordinal、Identity與Actions永遠保留。Profile未選用的semantic role不建立空欄。Playlist的reorder capability不參與column structure，因此搜尋／排序切換不會讓整張表水平跳動。

F8候選以34rem／28rem／23rem作比較基線，並提供Wide／Medium／Narrow／Minimum四個可見寬度；最終值必須以實際Folder content width、長CJK／Latin與125%縮放驗證，數值本身不是component API。

`compact` density 繼續視為已測但未提供產品入口的latent capability。提案可在F8展示，不因此新增Library切換控制。

## 5. Component boundary

建議的最小production邊界如下：

| Boundary                      | Owns                                                                 | Does not own                                                  |
| ----------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------- |
| `LibraryBrowseContent`        | Data source、filter、sort、selection、playback、menu、reorder intent | Row DOM、column CSS、state paint                              |
| Collection profile resolver   | Named kind對應columns、identity visibility、semantic roles與labels   | Reactive product state、IPC、playlist mutation                |
| `TrackTable`                  | Header、column descriptor、sticky／responsive layout、list semantics | Library data derivation、menu items、playback                 |
| Internal Track Collection row | Canonical cell order、row states、keyboard／pointer intent emission  | Sorting、navigation transition、persistence                   |
| Existing shared primitives    | Thumb、text action、overflow、artist credits、icon button            | Collection profile或table column layout                       |
| `UiTrackRow`                  | Compact flex row anatomy與compound row interaction                   | Table header、ordinal、semantic columns、sorting、row reorder |

對外保留 `TrackTable` 名稱即可；目前沒有第二個相同domain的table需要用 `TrackCollectionTable` 重新命名。內部row可使用feature名稱，但不升格成 `Ui*` primitive。

建議將現行 `variant` 改成語意較完整的 `collectionKind`，允許值為：

- `library-all`
- `library-local`
- `playlist`
- `album`
- `artist`

Runtime capability 與profile分離：`collectionKind="playlist"`宣告row具備reorder capability，`reorderEnabled`只決定整列目前是否可拖曳及接受方向鍵調整。Reorder不建立column，因此搜尋或排序不會改變column structure。

Entry projection把`releaseText`、`releaseYearText`、`membershipText`與`usageText`分開；table只接收已界定的presentation values，不猜`addedAt`是import date、membership date或album。`releaseYearText`只接受canonical歌曲發行年份，缺漏保持空值。Usage value由app-owned qualified playback提供，provider `view_count`不進此projection。

## 6. 不採用的替代方案

### 6.1 把 TrackTable 全部改成 UiTrackRow

不採用。`UiTrackRow`是flex row，沒有header、aligned context column、sorting或responsive column priority。加入index、date、drag、sort相關slots會讓primitive吸收Library domain，並破壞既有Queue／Modal／Dock consumer。

### 6.2 建立 generic UiGridTable／UiDataGrid

不採用。專案沒有第二個production consumer具備相同header、selection、activation、sorting與reorder契約。Generic data grid還會引入cell focus、方向鍵navigation、column semantics與更大的accessibility contract，沒有當前產品證據。

### 6.3 只整理 CSS class

不採用。CSS去重無法解決 `variant`、`contextLabel`、`addedAt`、`jumpableTrackIds`與runtime capabilities分散造成的非法組合，也無法建立可驗證的collection profile。

## 7. Proposal specimen

文字方向確認後，F8只建立component-level specimen，不重建完整Library頁或接入真實playlist state machine。最小內容包括：

1. Profile switch：Library all、Library local、Playlist、Album、Artist。
2. State strip：default、selected、current、selected＋current、reorder disabled，以及只在Playlist啟用的dragging與drop target。
3. Content pressure：長CJK、長Latin、無斷點檔名、多artist、缺artist、缺duration、無album destination、缺release year、跨disc ordinal與零播放次數。
4. Width strip：Wide、Medium、Narrow、Minimum，以及125% type scale。
5. Intent log：select、activate、title／artist navigation、menu與keyboard reorder都回寫可見結果，不接production owner。

F8 candidate通過後，正式採用只保留最小元件回歸標本；不得長期保存第二份Library產品頁。

## 8. Production adoption sequence

1. Owner確認本文件的profile、nature adjustments與component boundary。
2. 建立development-only F8 specimen並完成可見驗收。
3. 先寫profile、column sequence、state、keyboard／pointer與responsive contract tests。
4. 抽出internal row與profile resolver，保持Library state／intent authority不變。
5. 逐一遷移Library all、local、playlist、album、artist；每一種kind都對照現行行為與已核准的nature adjustment。
6. 跑focused regression、完整lint／format／build與可見Electron驗收。
7. 移除候選中已被production承接的完整組合，只留下formal component specimen。

## 9. Acceptance criteria

- 五個collection kinds在相同輸入下使用同一cell order、row height、interaction vocabulary與state contract。
- Album不出現空artwork slot；Artist不重複artist line且顯示source album＋release year；Playlist搜尋／排序停用整列reorder時不造成column shift。
- Artist／Album不會送出drag／drop intent；只有具reorder capability且runtime條件成立的Playlist可調整順序。
- Membership／Usage／Release year、Release與Duration依priority依序消失，header和body永遠使用同一column descriptor。
- 單擊／Space與雙擊／Enter維持select／activate分離；nested actions不觸發row action。
- Selected與Current可同時投影，focus-visible、menu keyboard entry與reorder keyboard entry可辨識且可操作。
- 長內容、缺欄位、125%縮放與narrow width沒有水平overflow或row height跳動。
- Import review、Queue、Separation、Lyrics、Diagnostics與editor recipes沒有被迫遷移或取得table-domain API。
- 沒有新增generic `UiGridTable`、平行V2 component或page-local token／deep override。

## 10. Confirmed owner directions

1. 採用「同一行為家族、`TrackTable`與`UiTrackRow`各自保留layout owner」的邊界。
2. Album row不顯示membership date；改用來源disc／track ordinal與local usage。
3. Artist row顯示source album與歌曲發行年份，不顯示local usage或import date；缺年份不得由provider upload date代填。
4. 第一階段保留既有title→Album destination，不把navigation位置與收束重構混在一起。
5. 先完成最小F8 component specimen與visible acceptance，再修改production Library。
6. Local play count與source metadata是兩條資料線；`info.json`只補強來源欄位正確性，provider view count不是應用內統計。
7. Artist與Album是資訊型集合，不允許drag；Playlist reorder仍由custom order、search與sort狀態共同gate。
