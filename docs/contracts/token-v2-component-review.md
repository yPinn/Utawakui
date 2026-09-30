# Token v2 元件檢查契約

Status: F8 original component review complete; Scrollbar, the first live
shared-infra baseline and the formal action baseline adopted for scoped Token v2
use; F7 Studio Library View candidate active in development only. None of these
checkpoints authorizes production-wide token adoption.

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

## 顯示文案邊界

使用者可見文案的透明採必要揭露，不等於展示背景實作。產品標本與輔助技術宣告只說明狀態、影響與可採取行動；`runtime`、`sidecar`、`adapter`、`host`、`parent`、`token` 等實作名詞只可留在明確的開發審查註記、診斷或文件。來源、網路、儲存位置與處理方式只有在會影響使用者選擇、隱私期待或復原方式時才揭露。

F8 的 Candidate／Current、ARIA、尺寸與元件責任屬 owner 檢查所需資訊，必須與產品訊息分層呈現；型錄不能讓工程註記看起來像正式產品文案。產品訊息與 live-region 內容使用同一套使用者語言，並維持可獨立翻譯的完整句子。

## 2026-09-29 階段快照

| 範圍                  | 已確認／已建立                                                                                                                                                                                                                                         | 仍屬候選或現行缺口                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| 系統預設色            | 中性低干擾 surface，以 Indigo 負責主題、選取、current 與 focus；內容類型／格式／來源預設維持 Neutral                                                                                                                                                   | production-wide semantic mapping 尚未採用                                                                       |
| Folder 色             | Folder 可使用 Mosby Files 式高彩度強對比，與系統預設色分責                                                                                                                                                                                             | F8 目前只有參考色票；正式 folder palette 與元件映射未定                                                         |
| 狀態色                | Mildliner 作色相來源而非螢光筆材質；主要訊號用原色強度，soft 只作選用背景                                                                                                                                                                              | Live 與 Danger 可同色但維持不同 token、形狀及標籤語法                                                           |
| 字體與文字            | Electron 使用 Windows 原生字型堆疊；Display／Emphasis 暫定 28／700；長標題維持單行截斷                                                                                                                                                                 | Display 日後只有在具體強調情境出現時才重新評估                                                                  |
| 單位                  | 字體、spacing、radius、元件幾何及 CSS breakpoint 用 rem；hairline／focus／drag 用 CSS px；Electron window 用 DIP；raster／canvas backing 用 physical px                                                                                                | 不得把 16px root 下的 CSS px 等值寫成 DIP                                                                       |
| 核心尺寸              | 一般操作 hard floor 32、Primary transport 44、緊急 48 CSS px；windowed／restored 使用 Compact，maximize／fullscreen 使用 Standard                                                                                                                      | 既有 Candidate alias 仍名為 `control-height-live`；Icon Button 不將它解讀為所有 Live action 的通則              |
| Icon Button           | active `sm` 已移除；`md` 32px、`lg` 44px，glyph 維持 16 unit；context-neutral primitive 與 parent-owned recipes 已分區並完成 owner 可視確認；正式 `UiIconButton` 已在 Token v2 scope 採用完整 Accent／Overlay hover／pressed，並保留 active scope 幾何 | Emergency 48px variant 未映射；Primary transport／artwork overlay／titlebar 仍由 caller recipe 擁有             |
| Text Action           | 預設如一般文字無底線，hover／focus-visible 顯示底線；維持 caller typography、intrinsic width、`click.stop` 與 `UiMarqueeText` overflow；正式 `UiTextButton` 已在 Token v2 scope 採用 disabled 50% 與 non-selectable action chrome                      | 高列數 production surface 仍應明確選用 static ellipsis，避免逐列 observer／motion 成本                          |
| Field shell           | Candidate Standard 36px／Compact 32px；現行 30px；寬度由 parent 擁有，`min-width: 0`、無 component max；readonly quiet surface 已完成跨家族候選檢查                                                                                                    | Candidate label／disabled select-none 與 readonly surface 尚未採用到正式 Field                                  |
| Search Box            | Candidate 已定左右各 32px slot、16-unit glyph、兩側各 4px text gap、自訂 Clear、可清除互動及完整狀態標本                                                                                                                                               | active 仍是 30px、缺整體 hover／disabled surface、Clear hit token，且 native cancel ownership 未正式落地        |
| Text Field            | Candidate／Current 的尺寸、寬度、單行 anatomy、內容及七種狀態已檢查；readonly 採平面 quiet surface、完整文字對比與可選取／複製                                                                                                                         | active light placeholder 對比 4.23:1；readonly Candidate production adoption 待後續                             |
| Textarea              | rows、hard floor、soft wrap、native overflow、vertical resize、內容與七種狀態已檢查；readonly 與 Text Field 共用 quiet surface 語法                                                                                                                    | active hard floor 60px；readonly Candidate production adoption 待後續                                           |
| Validation feedback   | 上游 issue → form controller → localized `invalid + error` → UiField；required pristine 不報錯，blur／submit 後顯示，修正後移除；Error 取代 Hint                                                                                                       | `auto` 是現行預設；父層 `reserved` 只是一行空間候選；未新增 Zod、正式 prop、token 或產品表單流程                |
| Select                | Candidate 36／32px、project-owned indicator、12px end inset、closed-lane ellipsis 與 overflow-only 完整值提示已完成 owner 視覺檢查                                                                                                                     | native popup 尺寸／option rendering 仍由 Chromium／Windows 擁有；production adoption 待後續                     |
| Checkbox              | Candidate／Current、36／32px full-row target、16px indicator、多行首行對齊、Boolean／mixed、validation 與 ARIA 已完成 owner 視覺檢查                                                                                                                   | Candidate custom indicator、整列 disabled 與 `indeterminate` public contract 的 production adoption 待後續      |
| Range                 | Candidate／Current、36／32px full-track target、6px Candidate track／fill、16px thumb、等距 stops、validation 與 ARIA 已完成 owner 視覺檢查                                                                                                            | Candidate custom track／thumb／optional ticks、窄幅 value output reflow 與 production adoption 待後續           |
| Button                | 36／32／30px、Primary／Secondary／Ghost hierarchy、Field 同列、單行 overflow、狀態與 native／ARIA 已完成 owner 視覺檢查；正式 `UiButton` 已在 Token v2 scope 採用 Secondary、pressed 與 label truncation，active scope 保持既有尺寸／色彩              | 仍保留 icon-only compatibility branch；新用法一律使用 `UiIconButton`，待既有 consumers 稽核後再移除             |
| Tabs                  | Candidate／Current 36／32／30px、Panel／Bar、內容 overflow、狀態、automatic keyboard activation 與真實 tabpanel 關係已完成 owner 可視確認                                                                                                              | 現行只管理 tab list、panel wiring 由 caller 擁有；Candidate 與 compound API 的 production adoption 待後續       |
| Chip                  | Candidate Standard 24px／Compact 20px、靜態 badge／label 邊界、內容、8 semantic tones、recipes 與 ARIA ownership 已完成 owner 可視確認                                                                                                                 | Current 約 21.5px 且無邊界；`background`／`color` escape hatch 與 Candidate production adoption 待後續          |
| Status Icon           | Candidate Standard 24px／Compact 20px、16-unit glyph、狀態／裝飾 ARIA 邊界、8 semantic tones、motion 與 recipes 已完成 owner 可視確認                                                                                                                  | Current 固定 24px；`text`／`highlight` compatibility tones 與 Candidate production adoption 待後續              |
| Hint／supporting text | Candidate／Current、Field／Notice 邊界、14px caption、內容換行、7 tones、layout／ARIA ownership 已完成 owner checkpoint                                                                                                                                | `UiHint` 仍是 compatibility wrapper；是否保留 Vue primitive 待 migration 比較 utility／owner recipe             |
| Inline notice         | Candidate／Current、compound anatomy、Hint／Field／Modal／fixed host 邊界、密度、內容、tone、action、delivery 與 ARIA ownership 已完成 owner checkpoint                                                                                                | Candidate 與 demo-only fixed notification recipe 的 production API／adoption 未改                               |
| Progress              | Candidate／Current、8px track、2px Candidate radius、determinate／indeterminate、內容、motion 與 ARIA ownership 已完成 owner checkpoint                                                                                                                | Candidate production adoption 尚待後續；正式元件／consumer 未改                                                 |
| Marquee Text          | Candidate／Current、單行 overflow、user-controlled reveal、RTL、reduced motion、selection 與 parent recipes 已完成 owner checkpoint                                                                                                                    | Candidate production adoption 尚待後續；正式元件／consumer 未改                                                 |
| Track Thumb           | Candidate／Current、單曲方形封面、四圖預設 fallback、尺寸、裁切、內容、ARIA 與 compatibility contract 已完成 owner checkpoint                                                                                                                          | Candidate production adoption 尚待後續；正式元件／consumer 未改                                                 |
| Collage Thumb         | Candidate／Current、square output geometry、center cover crop、集合封面 precedence、0–5 首拼貼、圖片回退、實際尺寸、overlay 與 ARIA 已完成 owner checkpoint                                                                                            | 未來 crop selector 另案；Candidate production adoption 尚待後續，正式元件／consumer 未改                        |
| Track Row             | Candidate／Current、曲目識別 anatomy、component reuse、listitem／sibling action、狀態、內容、consumer recipes 與 ARIA 已完成 owner checkpoint                                                                                                          | Queue 已採用正式 Standard 52／40px row；其餘 Candidate production adoption 尚待後續                             |
| Action Menu           | Candidate／Current、trigger-neutral ownership、精簡 icon／label／submenu lanes、menu keyboard、碰撞、內容與 ARIA 已完成 owner checkpoint                                                                                                               | 正式 `UiContextMenu`／consumer／active tokens 未改；production adoption 待後續                                  |
| Modal                 | Candidate／Current、中性尺寸、fixed header／footer、body-only scroll、內容壓力、背景層級、focus／dismissal 與 ARIA 已完成 owner checkpoint                                                                                                             | 正式 `UiModal`／consumer／active tokens 未改；Current focus／top-layer／整面捲動差距留待 production migration   |
| Scrollbar appearance  | `UiScrollRegion` 已採用；vertical／horizontal／both-axis、12px overlay hit lane、6px visual thumb、32–72px proportional thumb、no-overflow geometry、native scroll projection／drag、collapsed visibility 與 forced-colors 已建立                      | production scroll owners 已依 body／list 範圍遷移；全域 hidden scrollbar 規則已移除                             |
| F7 View               | Studio Library／Controlled Dossier 已接入真實 Library／Playlist／Player／Queue 投影；Candidate／Current 單一 live panel、playlist workspace 與 queue metadata 分責、local search／sort／reorder、單擊選取與雙擊播放已建立                              | 仍待完整 owner visible acceptance；local order 不持久化，不代表正式 Setlist 或任何 Candidate component adoption |

只有 Icon Button hard-floor 修正屬於這個 checkpoint 的正式 active 變更。
其餘 Candidate 標本仍由 development-only F8 與 `tokens-v2.css` 隔離；
production bundle 不含 F8 標本或 candidate token payload。

F8 已將 Foundation 至 UiModal 的 30 個 comparison section 統一為
Candidate／Current 對照；所有 component group 都已完成 owner checkpoint。
這只收束 development component review。F7 已由 owner 另行啟動為
development-only View checkpoint，但仍不啟動 production adoption。共用比較層
明確分離 Token v2 surface 與 active-token 快照，窄內容使用 container reflow，
不改動 production component。

Scrollbar 是 30-section checkpoint 完成後由 owner 另行要求加入的瀏覽器外觀
契約。追加標本已完成可視核准並提升為正式 primitive；原 30 個 comparison
section 的完成狀態與數量不因此重寫，其餘 Token v2 候選也不因此取得採用授權。

## 已採用階段：Scrollbar appearance 與 Scroll Region

1. Owner 可視檢查修正了第一版 CSS-only 判定：custom native scrollbar 即使不使用 stable gutter，在 Windows／Chromium overflow 出現時仍可能縮小 scrollport，因此不能滿足「thumb 懸浮且不擠壓內容」。正式解法是 shared `UiScrollRegion`，不是全域 pseudo-element paint。
2. Component 局部隱藏 native chrome，但 native overflow viewport 仍是 wheel、keyboard、touch 與 scroll position authority。Component 只量測 `client*`／`scroll*`、投影 absolute rail／thumb，並把 pointer drag 回寫 `scrollTop`／`scrollLeft`；caller 宣告 axis 並擁有內容、overscroll 與 external-scroll dismissal。
3. Hit lane 固定 `0.75rem`／12 CSS px，3px inline inset 讓可見 thumb 維持 6 CSS px；thumb 依 viewport／content 比例計算並 clamp 在 `2rem`／32 CSS px 至 `4.5rem`／72 CSS px，rail 由邊緣內縮 4 CSS px。長內容以完整 travel 表達位置，不讓接近整條 rail 的長 thumb 形成邊框感。Standard／Compact 不 remap 幾何。
4. Default 使用 `text-subtle`，hover 使用 `text-muted`，drag active 使用 `text`；全部是 neutral roles。`border-strong` 在深色 raised surface 上只有 2.82:1，因此不作 default thumb。Scrollbar 不使用 Accent、current、success、warning、live 或 danger，避免把位置控制誤讀成選取或狀態訊號。
5. Track transparent；rail absolutely overlay 在 scrollport 內，不參與內容寬高計算。該軸沒有 overflow 時 rail／thumb 不顯示且不預留 lane；`scrollbar-gutter: stable` 只可能是另類 native consumer 的明確例外，不屬於 overlay default。
6. Header、Tabs、Toolbar、table heading 留在 Scroll Region 外；只有實際移動的 body／list 擁有 rail。Modal、Popover、Queue、PlayerBar Panel、Settings、資料表、Analysis、Lyrics、Provider、Output 與 F8 catalogue 均依此拆分，避免 rail 從固定標題旁穿過。
7. Playlist Sidebar 的完整展開選單在 overflow 時自動顯示 chrome；折疊精簡選單以 `scrollbarVisibility="hidden"` 只隱藏 rail／thumb，仍保留 wheel／keyboard 的 native scroll authority。這是 feature-owned interaction shape，不由寬度或 geometry 猜測。
8. 標本同時呈現 vertical、horizontal 與 both-axis，實際 native viewports 可取得 keyboard focus；另以「未溢位／已溢位」並列證明相同內容寬度，再以靜態 anatomy 並列 Default／Hover／Active。Current 與 Token v2 現在共用正式 behavior，由各自 semantic tokens 決定 paint。
9. forced-colors 使用系統 `Canvas`／`CanvasText`，overlay rail 對 accessibility tree 隱藏，但 focusable native viewport 與可見 thumb 保留 overflow affordance。`base.css` 的全域 hidden scrollbar 規則已移除；native chrome suppression 只存在於 `UiScrollRegion` viewport。
10. `109ichiki.com` 的 custom fixed／absolute scrollbar 只作「overlay 可避免 layout occupation」的實作證據，不是唯一視覺答案。Utawakui 沒有照搬其 20px lane、8px outlined thumb、全頁 fixed placement 或品牌語彙，而是沿用本產品 geometry、neutral states、local region 與 forced-colors contract。

## F7 View checkpoint

Studio Library／Controlled Dossier 保持 View-level Candidate，不是第二套元件庫，
也不是正式 Setlist migration。F7 驗證資訊架構、layout、density、folder material、
真實資料投影與已審查元件的組合；F8 仍是 30 個 Foundation／component contract
的唯一權威。這個 phase 名稱不改動目前鍵盤 F7 對應的 Lyrics Provider Review。

目前 F7 邊界如下：

1. Candidate 與 Current 是互斥的 live panel。Candidate 使用 Studio Library，Current 使用正式 Setlist View；不重複掛載兩份資料流，也不因完整 View 看似可用就宣稱 production adoption。
2. 中央 Controlled Dossier 是 selected playlist／album workspace，擁有集合 header、search、sort、local order draft 與完整 track table；右側 Context Inspector 只投影 current queue、currently playing track 與歌曲資訊，不重複集合摘要。
3. Track table 的 pointer 單擊／Space 只選取，pointer 雙擊／Enter 才由 View 呼叫既有 queue／player owner。Selected 使用中性 playlist surface、具形狀的 inset indicator 與 `aria-pressed`；Current 使用播放 glyph、accent title 與 `aria-current`，兩者可同時存在。
4. Playlist 在 custom order 且沒有 search／sort 時直接以專用 handle 支援 pointer drag 與 ArrowUp／ArrowDown reorder；search／sort 時 handle 明確 disabled，source-backed album 不提供 handle。順序只存在 Candidate local draft，變更後才顯示還原，不接 `usePlaylists` persistence 或 IPC。
5. F7 feature table 的 title／artist 是 full-row CTA chrome，因此 select-none；這是 caller-owned exception，不反向改寫通用 `UiTrackRow` 的 selectable user metadata contract。Search input、說明、診斷與其他使用者資料仍依各 component owner 保持可選取。
6. `App.vue` 的 `.shell__main` 擁有 primary／context split 與 reflow；寬版 Candidate 在 context 存在時先保留 `17.5rem` bay，collapsed rail 與展開 Inspector 都貼齊 shell 右側，上下各保留 `1rem`，展開不推動 dossier；`70rem` 以下仍改為靠右 temporary overlay、不得保留空白 metadata column。`AppArchiveFrame` 只擁有 tabs 與 primary workspace，`AppInnerPage` 擁有 workspace inset／page scroll，`AppTopTabs` 擁有 global navigation／folder silhouette，Sidebar 與 PlayerBar 各自保留寬度、resize、navigation 與 playback ownership。Sidebar 與 Inspector 的 resize axis 都支援雙擊在摺疊／上次展開寬度間切換；F7 不以 View CSS 穿透重畫這些 internals。
7. F7 只組合正式 `Ui*` 與 feature components，不搬入 `DemoCandidate*`。尚未 adoption 的 native Modal、Action Menu keyboard／ARIA、fallback、active token 與 consumer gaps 繼續留在 migration backlog。

## Shared component inventory and roadmap

`src/components/ui/` 目前有 39 個 shared Vue components。`UiTrackRow`、
`UiContextMenu` 與 `UiModal` 雖有 compound anatomy，但播放、選取、menu action、
確認流程與資料結果由 caller 擁有，因此仍屬無應用邏輯的 shared infra。

| 分類       | 現有 shared infra                                                                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 版面       | `UiPageHeader`、`UiSeparator`、`UiStack`、`UiSurface`、`UiScrollRegion`                                                                              |
| 表單／輸入 | `UiField`、`UiSearchBox`、`UiTextField`、`UiTextarea`、`UiSelect`、`UiCheckbox`、`UiRange`、`UiColorField`、`UiRadioGroup`、`UiSwitch`、`UiCombobox` |
| 操作       | `UiButton`、`UiIconButton`、`UiTextButton`、`UiKbd`                                                                                                  |
| 導覽／選擇 | `UiTabs`、`UiSegmentedControl`、`UiDisclosure`、`UiBreadcrumb`                                                                                       |
| 狀態／回饋 | `UiChip`、`UiStatusIcon`、`UiHint`、`UiNotice`、`UiProgress`、`UiSkeleton`、`UiNotificationHost`                                                     |
| 內容       | `UiMarqueeText`、`UiTrackThumb`、`UiCollageThumb`、`UiTrackRow`                                                                                      |
| 浮層       | `UiContextMenu`（`UiActionMenu` 仍是待 adoption 的候選名稱）、`UiModal`、`UiTooltip`、`UiPopover`                                                    |

2026-09-14 owner 核准第一批 shared infra：`UiSeparator`、
`UiSegmentedControl` 與 `UiColorField` 已建立底層契約與 focused tests，
並登錄 development catalogue；三個新 section 保持 pending review，未計入原本
30／30 F8 owner checkpoints，也未修改任何現有 production consumer。元件存在不等於
任一 View、Output appearance 或 active Token v2 adoption；實際 migration 仍要逐個取得
owner gate。

2026-09-30 owner 啟動 controlled production migration。`UiSeparator`、
`UiStack`、`UiSurface` 與 `UiSegmentedControl` 已完成 active／Token v2
token parity、public value boundary 與現有 consumer 驗證，從 expanded F8
catalogue 的 pending section 升為 reviewed；`UiColorField` 仍維持 pending。
這使 expanded catalogue 成為 35／46 reviewed、11 pending，但不改寫原始
30／30 checkpoint 的歷史，也不代表 production root 已啟用 Token v2 palette。

真實 consumer 證據維持最小：`UiSeparator` 用於 Title Bar；`UiStack` 用於
Analysis、Diagnostics 與 Lyrics Provider Review；`UiSurface` 用於 Analysis、
Inner Page 與 Right Dock；`UiSegmentedControl` 用於 OBS session export。
這些 primitive 只共用 geometry／material／semantics，feature state、padding、
scroll、mode persistence 與資料 ownership 仍留在 caller。零 production consumer
的其餘 infra 仍按未來頁面需求逐項審查，不為追求型錄數字而機械 adoption。

同日的 page-action baseline 將「owner review complete」與「production component
migrated」拆成兩條真值。`UiButton`、`UiIconButton`、`UiTextButton` 已吸收
核准的 Candidate contract；候選 wrapper 移除，F8 改以同一正式元件分別置於
Token v2／active token scope 做回歸。新版幾何、pressed、selection 與 disabled
補強由 `data-ui-system="v2"` 啟用，因此不會暗中改動尚未進入 pilot 的既有頁面；
active tokens 只補齊共用元件所需且具 WCAG AA 驗證的 accent pressed 與
theme-independent overlay scrim states。expanded catalogue 的 review 數仍是
35／46；正式遷移另由八個 adopted section 記錄，不再以 review badge 代替。

| 第一批 infra         | 契約                                                                                                                                                                                                                                                     |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UiSeparator`        | Horizontal／vertical、decorative／semantic，原生 attrs fallthrough；只使用既有 border／color tokens，不擁有間距、內容或互動，Action Menu 內部 separator 不上提。                                                                                         |
| `UiSegmentedControl` | Caller 提供 items 與 controlled value；primitive 擁有 radiogroup／radio、disabled skip、roving tabindex、Arrow／Home／End、RTL 與 focus，不知道 filter／mode／persistence。                                                                              |
| `UiColorField`       | 組合 `UiField`、native color picker、可編輯六位 hex draft、驗證、described-by 與 update／commit 分責；文字 control 依 `#RRGGBB` 七字元格式使用 compact component measure，整組最多 100% available width；無效草稿不更新 caller，也不改變上一個有效色票。 |

2026-09-14 owner 進一步核准將其餘候選先建立為 development-only shared
infra；未出現第二個 production consumer 的風險改由 pending review 與 adoption
gate 承接，不再以此阻止元件檔案存在。第二批七項同樣未修改 production consumer、
未計入原本 30／30 F8 checkpoints，也不代表 active Token v2 adoption：

| 第二批 infra         | 契約                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UiKbd`              | 只呈現 caller 提供的 shortcut 文字與 keycap chrome；不註冊 command、不推導平台、不知道 F5–F9、Escape 或方向鍵實際行為。                                                                                                                                                                                                                                              |
| `UiSkeleton`         | 提供 text／block／circle placeholder、有限 line count 與 uniform／staggered pattern；caller 明確提供 loading accessible name並擁有 fetch lifecycle、真實內容 layout與何時卸載。                                                                                                                                                                                      |
| `UiDisclosure`       | 以 native `details`／`summary` 擁有 open semantics、keyboard、focus與 reduced-motion indicator；summary是單一trigger，不嵌套 `UiIconButton`，body內容與資料由caller擁有。                                                                                                                                                                                            |
| `UiRadioGroup`       | 以 native `fieldset`／`legend`／radio保留form與Arrow semantics；caller提供name、items與controlled value，primitive只emit typed selection，不複製Segmented Control的button anatomy。                                                                                                                                                                                  |
| `UiTooltip`          | Trigger仍是caller-owned control，透過scoped `triggerProps`建立`aria-describedby`；只顯示無互動描述，hover延遲、focus立即顯示、touch hover忽略、Escape關閉，並以共用geometry helper處理viewport collision。                                                                                                                                                           |
| `UiPopover`          | Controlled、non-modal anchored panel；擁有Teleport、logical placement、RTL／viewport clamp、outside pointer／Escape／external scroll dismissal、Escape focus return，以及optional header／body／footer的compact interactive-panel anatomy；footer actions靠inline-end。Caller仍擁有各區內容，不帶Notice status／tone、menu semantics、focus trap或background inert。 |
| `UiNotificationHost` | Caller控制items與identity；host擁有bottom-end bounded queue、避開persistent PlayerBar的block-end offset、bounded enter／leave／move motion、transient／progress／persistent lifecycle、hover／focus／document-hidden pause、manual close與touch／pen swipe，並組合`UiNotice`／`UiIconButton`；不從tone推導lifecycle或announcement。                                  |

`UiTooltip`與`UiPopover`共用`floatingPosition.js`的token length解析、logical
alignment、RTL與viewport clamp；現行`UiContextMenu`仍保持production truth，等其
另案migration時才評估是否採用同一helper，第二批不順帶重寫Action Menu契約。

2026-09-14 owner 再核准第三批 development-only shared infra：`UiSwitch`、
`UiBreadcrumb`與`UiCombobox`沒有現行 production 對應物可比較，因此不走 F8
Candidate／Current 對照流程，直接以 production `tokens.css`／`tokens-v2.css`
雙邊 token 建立底層契約與 focused tests。同樣未修改任何現有 production
consumer、未計入原本 30／30 F8 owner checkpoints，也不代表 active Token v2
adoption；元件存在不等於任一 View 已採用：

| 第三批 infra   | 契約                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UiSwitch`     | 骨架比照 `UiCheckbox`：組合 `UiField`（inline）、native `input[type=checkbox][role=switch]`，維持 Space 鍵切換、label 關聯與原生 `disabled`／`required`；track／thumb 是純裝飾層，尺寸 token 全部是 `--ui-space-*` 別名，不新造魔術數字。即時生效的布林設定用途，不取代表單提交語意的 `UiCheckbox`。                                                                                                                                                                                                                                                                                                                                                                                                 |
| `UiBreadcrumb` | Caller 提供 `items`（含 `id`／`label`／可選 `href`／`disabled`），陣列最後一項自動視為目前位置，渲染為不可互動的 `aria-current="page"`；其餘項目依是否提供 `href` 渲染 native `a` 或 `button`，導覽或 `select` intent 由 caller 擁有。尺寸與互動比照 `UiTextButton`（文字本身是次要目的地），不套用 `UiButton` 的 `--ui-control-height` 區塊 floor。中段省略號收合刻意不做——沒有既有 composable 可重用，超出寬度時與 `UiTabs`／`UiSegmentedControl` 一致改用 native 水平捲動，留待真的有 consumer 需要再補。                                                                                                                                                                                         |
| `UiCombobox`   | 本專案第一個 `aria-activedescendant`／`role="listbox"` pattern；焦點全程留在 native text input，清單只用 pointer 或 `aria-activedescendant` 互動，不搬真實 DOM focus。範圍刻意收斂：只做「既有清單打字過濾＋選一個值」，不支援自由輸入新值、不做非同步搜尋。骨架比照 `UiSelect`（組合 `UiField`、`defineExpose({ focus })`）；下拉定位重用 `floatingPosition.js` 的 `anchoredFloatingPosition`，寬度對齊與可視高度收窄寫在元件內部，不改動共用 helper；單開協調重用既有 `useContextMenuGate`，與 ContextMenu／ActionMenu 共用同一個全域浮層閘門；清單選項高度重用 `--ui-menu-item-height`，與 `UiContextMenu` 同一個 token。失焦或 Escape 時若目前輸入文字未對應到已選值，還原成上次已提交的 label。 |

外觀自訂的應用邏輯屬 feature composition，而不是 infra：

- Appearance Customization Panel 組合欄位控制，連接 `shared/outputAppearance.mjs` 的 field registry、group／order、defaults、boundaries 與 persistence。
- Palette Selector 組合 swatch／選單並連接既有 `paletteId` 與 template compatibility；「選預設 palette」與「輸入任意 hex」是不同 feature intent。
- Copy action 等正式 consumer 出現後，才在對應 feature folder 包裝既有 `useClipboardFeedback`；不新增通用 infra Copy Button。

明確不新增 Spinner（`UiStatusIcon spinning` 已涵蓋）、Badge（`UiChip` 已涵蓋）、
通用 Table 或 Empty-state layout（維持 feature-owned）。

### 各階段共同前提

以下各「已完成階段」章節都遵循同一前提，不在各節重複陳述：

1. F8 只在前一個元件完成 owner 可視確認、owner 明確指示後，才建立下一個元件的
   標本並完成本階段 owner checkpoint；這一律不代表 production adoption，也不
   擴大到尚未核准的其他 primitive、compound component 或 View。
2. 各節編號清單的第 1 項固定遵循同一結構：Candidate 與 Current 分區，Current
   使用 active token 快照，且不繼承 Candidate 的色彩、尺寸或狀態樣式——除非該
   節另有說明。

以下各節只記錄相對於這個前提的例外，以及該元件獨有的檢查範圍與結論。

## 已完成階段：Text Action（現行 UiTextButton）Candidate／Current 檢查

Foundation 與 Input family 已完成階段性 checkpoint `0261df5`。`UiButton` 與
`UiIconButton` 已完成 owner 可視確認；依 owner 指示只向下進入 Actions 的
Text Action 標本，並已完成本階段 owner 可視確認：

1. Primitive 是「顯示文字本身就是次要目的地」的 Text Action，不是一般 Secondary Button；native `button` 只承接 action 語意，獨立 32px action 使用 `UiButton`。
2. 字型、字級、行高、字重與文字色由 caller 繼承；寬度維持 `fit-content`、`max-width: 100%`、`min-width: 0`，不新增 density、size、full-width 或 appearance API。Candidate 只擁有互動時的底線 affordance。
3. 內容只接受 `text: String／Number`；visible text 是預設 accessible name，optional `ariaLabel` 只在需要補充目的地語意時覆寫。
4. 短字維持靜態，溢位由現行 `UiMarqueeText` 擁有 marquee 與 native title；reduced motion 回到單行 ellipsis。不把啟動條件、速度或模式上提為 `UiTextButton` prop。
5. Candidate Default 無底線，hover／focus-visible 顯示一般底線，focus 另保留 2 CSS px inset ring；pressed 沿用 hover，disabled 維持無底線並降至 50%，所有狀態不位移。
6. Current 誠實保留 default 無底線、hover／focus-visible 才顯示底線，以及無 authored pressed／disabled appearance 的現況。
7. Native boundary 維持單一 `button[type="button"]`、native attrs fallthrough 與 `click.stop`；navigation intent、URL 與 row-level action 均由 parent 擁有。
8. Parent-owned recipes 獨立陳列 Track row sibling destination、Queue section 靜態 prefix＋interactive destination、Playlist table title cell；row geometry、available width、z-index 與導覽不是 primitive prop。
9. 不新增 icon、button variant、size、full-width、appearance、active、loading、readonly、permission 或 `href`；不提供 reveal／dotted／dashed，也不修改 active tokens、正式 `UiTextButton` 或 `UiMarqueeText`。本階段已完成 owner 可視確認；production adoption 仍待後續 gate。

2026-09-27 production adoption note：Right Dock Queue 的長清單效能需求形成了先前型錄階段尚未存在的 bounded use case。正式 `UiTextButton` 因此保留 marquee 預設，另接受 `overflow="ellipsis"`，讓高列數 caller 跳過逐列 `ResizeObserver`／motion；此選項只改 overflow recipe，不建立 appearance、速度或動畫時機變體。Candidate 仍維持原已審查契約。

## 已完成階段：UiTabs Candidate／Current 檢查

Text Action 已完成 owner 可視確認；依 owner 指示只向下進入 Navigation 的
`UiTabs`。F8 已建立標本並完成 owner 可視確認：

1. 保留現行 30px 與青綠 selected tile，不繼承 Candidate 的 Indigo、36／32px 或狀態補強。
2. `UiTabs` 只用於一組 tabs 控制一組互斥且相關的 tabpanels。全域 navigation、資料 filter 與 mode switch 不因外觀相似而使用 Tabs；未來 segmented control 另案處理。
3. Candidate target 依 density 為 Standard 36px／Compact 32px，Current 為 30px。Panel 使用 intrinsic width＋`max-width: 100%`；Bar 使用 parent available width；元件不建立固定 component max。
4. Tab 維持單行與 `min-width: 0`。單一長標籤靜態 ellipsis，多 tabs 超出 group 時使用 overlay horizontal Scroll Region，不使用 marquee；短 CJK、長 CJK／Latin、多語、number、disabled 與 non-interactive `after` metadata 皆已覆蓋。
5. Panel 使用 neutral shell＋tonal selected tile；Bar 使用平面底線與 2 CSS px selected indicator。兩者只是 presentation variant，仍須控制真實 tabpanels。
6. Candidate 已覆蓋 default、hover、pressed、focus-visible、selected、selected-hover、disabled；focus 使用 2 CSS px inset ring，所有狀態不改變 target 幾何。Current 缺少 authored pressed，維持現況可見。
7. 維持水平 automatic activation：ArrowLeft／ArrowRight 循環、Home／End 跳轉並略過 disabled；每組只有一個 roving tab stop，方向鍵移動時同步切換即時 panel。
8. 現行 `UiTabs` 只管理 tab list；caller 仍須擁有 panel 內容、顯示狀態、唯一 ids 及 `aria-controls` ↔ `aria-labelledby` 關係。F8 每一組標本皆已接上真實 panel，以明示這項風險。
9. 不新增 vertical、manual activation、closeable、route／`href`、async panel、icon、segmented 或 feature-specific prop；型錄 checkpoint 當時不修改正式 `UiTabs`、active tokens 或既有 feature duplicates。

2026-09-27 production adoption note：Right Dock Queue／最近播放提供了第一個真實 Bar
consumer。正式 `UiTabs` 的 Bar 只採用已審查的平面文字＋2 CSS px selected indicator，保留
30px active target、automatic activation 與 caller-owned panels；沒有帶入 Candidate 色彩、
36／32px density 或 compound panel API。Queue header 的 sticky background／blur／shadow
新增 active 與 Token v2 同名 semantic aliases，深淺色各自映射；這些是 Right Dock chrome
token，不是 Tabs anatomy。最近播放仍經 `QueueTrackButton` 重用正式 `UiTrackRow`。

## 已完成階段：UiChip Candidate／Current 檢查

Tabs 已完成 owner 可視確認；依 owner 指示只向下進入 Feedback 的
`UiChip`。F8 已建立本階段標本並完成 owner 可視確認：

1. 保留現行 content-driven 約 21.5px、無邊界 soft fill 與青綠／珊瑚等 active 色，不繼承 Candidate box、border 或 Indigo／Mildliner semantic mapping。
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
`UiStatusIcon`。F8 已建立標本並完成 owner 可視確認：

1. 保留現行 24px neutral circle、語意前景及 `text`／`highlight` compatibility tones，不繼承 Candidate 的 tone-specific surface、border 或 Compact size。
2. 名稱保留 `UiStatusIcon`，不改叫 Badge 或泛化為 Status Indicator。現行 public API 必須提供 icon，責任是附著在其他內容旁的純圖示狀態；帶可見短文字／數量的 badge 仍使用 `UiChip`，互動目標使用相符的 native control。
3. Candidate 依 density 為 Standard 24px／Compact 20px，Current 為 24px；glyph 固定使用 project-owned 16 unit。這是 inline information box，不套用 36／32px action target floor，也不擁有 row 尺寸或 spacing。
4. Owned anatomy 只有 stable circle container 與 glyph。Candidate 使用 tone-specific soft supporting surface、細邊界與至少 3:1 的 graphical contrast；語意仍由 glyph shape、placement 與 concise label 共同提供，不能只靠色彩。
5. Candidate 使用 `muted`、`accent`、`info`、`success`、`warning`、`danger`、`current`、`gated` 八個 tone。內容類型、格式與來源預設使用 Neutral；`current` 統一使用 Accent／Indigo family；`live` 與 `danger` 保留獨立紅色 token、形狀與文案。Current 另誠實呈現 `text` 與 `highlight`；production migration 前將未掃描且不需立即處理的 availability 狀態映射到 `muted`，實際處理映射到 `info`，失敗才使用 `danger`，不先破壞現行 lyrics consumer。
6. `gated` 表示進入外部來源、衍生內容或公開輸出流程前需使用者確認；Candidate 文案使用「需確認」，不暗示付費、權限不足、法律核准或安全判定。
7. `spinning` 只旋轉 glyph，container 不變形；同時尊重 root `data-ui-motion="reduced"` 與 `prefers-reduced-motion`。它只表示正在處理，不建立 progress value 或 loading controller。
8. 圖示獨立承擔狀態時，以 required `label` 建立 `role="img"`、`aria-label` 與現行 native title；相鄰可見文字已完整重複狀態時使用 `decorative`，移除 role／name 並設 `aria-hidden="true"`。
9. 動態更新若需要宣告，由知道 update timing 與完整句子的 parent 擁有 `role="status"`／`aria-live`；row trail、selection、adjacent visible status 與 live region 都是 parent-owned recipes，不轉成 primitive props。
10. 不新增 action、focus、disabled、tooltip、size 或 live-region prop；Candidate 的 Standard／Compact 只存在 development wrapper。正式 `UiStatusIcon`、active tokens 與 5 個 production consumer／13 個使用點保持不變。

## 已完成階段：UiHint Candidate／Current 檢查

`UiStatusIcon` 已完成 owner 可視確認；owner 已核定 naming／responsibility
gate 並要求只開始 `UiHint`。F8 建立標本後完成本階段 checkpoint：

1. 保留現行 14px caption、七個 tone 與 `padded`／`center` compatibility，不繼承 Candidate 的長識別字 wrapping 或 Token v2 色彩。
2. `UiHint` 保留為 production compatibility name；F8 以 Standalone supporting text 描述可重用的文字角色，不預先把 Vue component 當成最終 ownership。Field 附屬的 hint／error、id、`aria-describedby` 與 validation announcement 仍由 `UiField` 擁有；具 icon、title、message 或 action 的結構化訊息仍由 `UiNotice` 擁有。
3. 現行 21 個 production consumer／41 個使用點橫跨 Setlist、Import、Lyrics、Queue、Analysis 與 Settings，只證明 supporting-text presentation 有跨 feature 共用需求，不能單獨證明未來仍需要 Vue primitive。Production migration 前必須比較 shared typography／utility 或 owner recipe；不新增 `UiSupportingText` primitive。Candidate wrapper 與 recipes 只存在 `src/components/demo/`，單一 feature 或只為型錄存在的抽象應回到其 owner infra。
4. Candidate 與 Current 都使用 Caption 14 CSS px／1.4；Standard／Compact 不改文字度量，也不建立 control height、min-height、固定寬度或 component max。Density 只影響 parent-owned surrounding layout。
5. Supporting-text presentation 的 anatomy 只有 native paragraph 與 visible default slot；不擁有 icon、action、title pair、surface、empty-state composition 或 placement。Candidate wrapper 寬度維持 block flow、`min-width: 0` 與 `max-width: 100%`。
6. Candidate 對短 CJK、長 CJK／Latin、多語與無 authored breakpoint 的長識別字使用自然換行及 `overflow-wrap: anywhere`。Current 誠實保留現行 wrapping；bounded inspection frame 承接其內部水平 overflow，不讓整個 F8 page 溢出。
7. 保留 `muted`、`text`、`info`、`success`、`warning`、`danger`、`gated` 七個 compatibility tone。內容類型、格式與來源預設使用 Neutral；狀態色只加速掃描，visible copy 必須完整說明處理中、已完成、需注意、失敗或需確認。`gated` 不表示付費、權限、法律或安全判定。
8. Padding、alignment、available width 與 empty-state placement 由 parent recipe 擁有；`padded`／`center` 只列為 Current layout compatibility，不提升為 Candidate 的新語意 API，也不新增 Reserved support-row prop。
9. 靜態內容維持 native paragraph，無預設 role。只有知道 update timing 與完整句子的 caller 才加入 `role="status"`／`aria-live`；tone 不自動推導 `status` 或 `alert`。`lang`、`dir`、ARIA 與 data attrs 維持 native root fallthrough。
10. 不修改正式 `UiHint`、`UiField`、active tokens 或 production consumers；不新增 feature-specific、validation、permission、icon、action、size 或 live-region prop。F8 只委派 `DemoFeedback` 的 hints section，Notice／Progress 保持原樣待後續 gate。

Owner 在後續 UiNotice 檢查時補充 Hint 文案定位：Zod／validator issue 先由 form owner 轉成 localized `invalid + error`，由 `UiField` 擁有欄位關聯、顯示與 announcement；`UiHint` 不接收 schema、issue shape 或 validation timing。UiHint 不使用固定「類型：描述」前綴；一般 supporting text 直接說明資訊，Current compatibility tone 的句子則以「正在／已／尚未／無法」等可翻譯語法自行表達狀態。顏色只輔助掃描；需要固定標題、圖示或操作時改用 `UiNotice`。

2026-09-12 renderer 實測：Candidate 深／淺 surface 分別為
`#2d2f35`／`#fbfaf7`，Current 為 `#30383e`／`#ffffff`；Candidate
七種 tone 的最低對比為深色 5.69:1、淺色 5.78:1。Current 忠實保留
active truth：深色 `danger` 為 3.78:1，淺色 `info`／`success`／
`warning`／`danger` 分別為 4.04:1／3.31:1／3.33:1／4.41:1，列為
production adoption 前的既有差距，不回寫本階段 active tokens。288px bounded
frame 中，Candidate 長識別字在 frame 內換行；Current 以 frame-local
horizontal overflow 承接，兩者都沒有造成 F8 page-level horizontal overflow。

## 已完成階段：UiNotice Candidate／Current 檢查

`UiHint` 已完成 owner checkpoint；依 owner 指示只向下進入 Feedback 的
`UiNotice`。F8 建立標本並依後續回饋完成 Hint／Notice 分責、fixed notification
尺寸與 lifecycle、action／close／swipe 及錯誤紀錄邊界，完成本階段 checkpoint：

1. 保留現行 `muted`／`info`／`success`／`warning`／`danger`、12／8px inset、30px action 與 tone-derived implicit role，不繼承 Candidate tone surface、36／32px action floor、container reflow 或 caller-owned announcement。
2. 名稱保留 `UiNotice`，型錄角色描述為 Inline notice／結構化內嵌通知；不新增 `UiAlert`、`UiCallout`、Toast 或 Banner primitive。Decorative glyph、title／message 與 optional action 組成的 compound anatomy 是 shared ownership 的主要依據。Candidate compound 重用已審查的 `DemoCandidateStatusIcon`，後者封裝正式 `UiStatusIcon` 的 icon box、tone surface 與 decorative ARIA；不得在 compound 內另畫未封裝的 SVG lane。現行 35 個 production Vue consumer／49 個使用點橫跨 shell、Import、Lyrics、Analysis、Output、Playback、Playlists、Performer 與 Settings，只作共用需求佐證。Consumer count 不能單獨證明 component ownership；單一 feature 或只為型錄存在的 recipe 應回到其 owner infra。
3. `UiNotice` 擁有 decorative status glyph、至少一個 title／message body 與 optional contextual action 的 reading unit。Field hint／error association 屬於 `UiField`；獨立 supporting copy 目前由 production `UiHint` compatibility wrapper 承接，最終 presentation ownership 待 utility／owner recipe 比較；protected focus／interruption 屬於 Modal；fixed notification 的 position、size、viewport cap、queue、dismissal 與 lifecycle 屬於獨立 host。
4. Candidate Standard 使用 12px inset／36px action floor，Compact 使用 8px inset／32px action floor；Current 對應 12／8px inset但 action 都維持 30px。Candidate Notice 固定使用 Compact 20px box／16-unit glyph，與 14px 首行置中對齊；圖示與文字 lane 使用 8px token gap，Standard／Compact 不因相同文字層級任意切換 icon box。Inline notice content 維持 `min-inline-size: 0`／`max-inline-size: 100%`，不設定 fixed min／max width；development-only fixed notification host recipe 使用 desktop floor 20rem／320 CSS px、preferred 22rem／352 CSS px、maximum 26rem／416 CSS px，host desired size 預設為 preferred 並 clamp 在 floor／maximum 之間，最後受 viewport 兩側各 1rem safe inset cap。這些是 host／layout 值，不是 `UiNotice` props。
5. Title 與 message 至少存在其一，兩者皆空時不產生 notice DOM。Title 以 14px semibold label 呈現，message 以 14px caption 呈現；Candidate 對長 CJK／Latin、多語與無 authored breakpoint 的識別字使用自然換行與 `overflow-wrap: anywhere`，窄容器將 action 移至 body 下方。Current 缺口由 frame-local overflow 誠實承接。
6. Candidate 使用 `neutral`、`info`、`success`、`warning`、`danger` 五個 tone；Current 的 `muted` 映射為 Candidate Neutral。內容類型、格式與來源預設使用 Neutral；只有真實狀態使用 semantic tone。色彩只加速掃描，visible title／message 與 info／check／alert／x glyph shape 必須完整傳達語意。
7. Candidate 的 soft supporting surface 維持低強度、subtle border 與無 shadow 的 flat inline notice，不把一般回饋畫成 alarm card。Warning 可表達使用者仍需確認的下一步，但不建立付費、權限、法律、安全或 feature gate 語意。
8. Action 使用既有 Button hierarchy 的 contextual Secondary action，以 neutral raised surface 與 subtle border 提供足夠 affordance；Candidate 依 density 保留 36／32px hard floor，Current 誠實呈現 30px。Action 缺席時不保留空列；寬於 26rem 可與 body 同列，26rem 以下移到 body 下方並靠 inline-end，避免把正文壓成碎行。Notice 只 emit `action` intent；retry、navigation 與 loading／disabled 由整合 parent 擁有，inline placement 由 local parent 擁有，fixed placement／queue／dismissal／lifecycle 由 notification host 擁有；不新增 feature-specific 或 width props。
9. Candidate 靜態 notice 不預設 role；只有知道 update timing 與完整句子的 caller 才加入 `role="status"`／`aria-live="polite"`，真正需立即中斷的失敗才使用 `role="alert"`。Tone 不自動推導 announcement urgency；icon 為 decorative。Current 仍自動把 danger 設為 alert、其餘 tone 設為 status，列為 production truth 與後續 migration audit，不在 F8 直接改正式 component。
10. Current 保留 `notice` structured-error adapter、direct prop precedence、native root attrs fallthrough、空內容 omission 與 action event。Candidate 不吸收 adapter mapping、product validation、permission、provider、lyrics、track 或其他 feature state；正式 `UiNotice`、`appErrors`、active tokens 與 consumers 都不修改。
11. `transient`／`progress`／`persistent` 由 fixed notification host 明確指定，不由 tone 推導。Transient 只用於無操作的簡短結果，預設 6 秒後自動關閉，pointer hover、內部 keyboard focus 與 document hidden 期間暫停倒數；progress 維持同一 identity 原位更新，完成後可替換為 transient；含 action、warning／danger 或唯一復原資訊的 persistent notice 不自動消失。
12. Fixed host 位於 bottom-end，inline-end 保留 1rem safe inset，block-end 以 PlayerBar 高度再加 1rem safe inset，與既有 shell notice recipe 對齊；不可使用 raw viewport top-end 遮住 Windows titlebar／window controls，也不可貼 raw bottom-end 蓋住 persistent PlayerBar。Close 使用已審查 Candidate Icon Button、32px hit target、transparent Ghost、project-owned 16-unit X 與「關閉通知」accessible label；可操作範圍與視覺重量分開，在每個 notification 的 top-end 預留獨立空間，不擠入 Notice 的 content／action lane。Dismissible transient notification 另可用 touch／pen 向左或向右滑動 72 CSS px 關閉，保留 `touch-action: pan-y` 的垂直捲動；mouse drag、inline notice、progress 與 persistent 不套用手勢，close button 也不得被手勢取代。Fixed host surface 使用 `-webkit-user-select: none`／`user-select: none` 避免 swipe 或 close 時誤選短訊息；這是 host interaction policy，不得擴到獨立 Inline Notice、診斷紀錄或 production `UiNotice`。Action 不隱含 dismiss；close 只有在狀態仍可由其他位置取得或不會移除唯一復原資訊時出現。通知出現不搶焦點，也不以全域 Escape 清除。
13. Host 以同一個 `TransitionGroup` 保存 bottom-end shelf：通知出現時由下方 1rem 向上淡入，關閉時向 PlayerBar 方向淡出，queue 其餘項目以 move transition 補位。動畫只改變 transform／opacity；enter 與 move 使用 feedback duration，leave 使用較短的 fast duration，不以 bounce、spring、blur 或 layout property 製造干擾。`appear` 只套用於實際通知，不搶焦點、不改變 timer／dismiss emit 或 identity；touch／pen swipe 的 inline-axis transform 與進出動畫的 block-axis transform 分開組合。Root `data-ui-motion="reduced"` 與 `prefers-reduced-motion` 都移除 transition，內容、位置、dismiss control 與 announcement semantics 保持不變。
14. 錯誤沿用既有 `useAppDiagnostics` 的 bounded public record 與 Diagnostics Workbench／設定頁錯誤紀錄，不建立第二個 error primitive 或尚不存在的上傳回報服務。Notice 只顯示安全的 title／message；唯一 action 優先提供立即復原的「重試」，沒有更直接的處理方式且安全紀錄確實存在時才使用「查看錯誤紀錄」。Path、stderr、raw payload、error code 與 correlation id 不得進入可見 Notice。

2026-09-12 renderer 實測：Candidate 深／淺 comparison surface 分別為
`#2d2f35`／`#fbfaf7`，Current 為 `#30383e`／`#ffffff`。Candidate
title／message 的最低對比為深色 8.32:1、淺色 10.70:1，status glyph
最低為 4.95:1／5.15:1，Secondary action 文字為 11.85:1／14.03:1；鍵盤移入 action
時保留 2 CSS px focus ring。Current 誠實保留 active truth：深色 info／
success／warning message 為 4.21:1／4.21:1／4.24:1；淺色四個
semantic message 為 3.81–3.99:1，success／warning glyph 為 2.75:1／
2.76:1，danger notice action 為 3.81:1，列為 production adoption 前的
既有差距。320px bounded frame 中，Candidate 長識別字在 notice 內換行，
Current 由 frame-local horizontal overflow 承接；兩者都沒有造成 F8 page-level
horizontal overflow。Candidate Standard／Compact action 實測為 36／32px，
Current 皆為 30px；static／polite／urgent 的 role、live-region ownership、
decorative glyph、native language attrs 與 parent-owned action announcement
皆與標本契約一致，renderer console 無 error。

本次 fixed notification boundary 修訂後，16px root 的可見 renderer 量測確認
Candidate／Current host custom properties 都是 20rem floor、22rem desired／preferred、
26rem maximum 與 1rem safe inset；預設 host／notice 實際寬度皆為 352 CSS px，
內容側 inset 為 16 CSS px（含 viewport border 的 rect 差為 17px）。352px
Candidate persistent sample 的 action 位於 body 下方並保持 8px gap；transient
sample 高 69.59 CSS px，close hit target 為 32×32 CSS px、transparent background，
icon 與 title 首行中心差為 0。Candidate inline 靜態標本沒有隱含 role／live region，
fixed host 則依 delivery event 明確使用 polite／urgent；Current 如實保留 production
`role="status"`。Transient 實測 6 秒後消失且可用 close 提前關閉；progress 經過
6.2 秒仍保留，persistent action 不會隱含 dismiss。深／淺 comparison surface
與 page-level no-overflow 結果維持不變。Host 以 container query 而非 viewport
media query 重排，20／22／26rem clamp、touch／pen 72 CSS px swipe 與 viewport
cap 只存在 F8 recipe，不進 production component。

## 補充決定：Candidate 文字選取邊界

Owner 在 UiProgress 階段回查已審查元件的文字選取行為；selection ownership 不由 tone 或 semantic color 推導，也不等同「所有 UI 文字皆不可選取」。Candidate 只在文字本身是操作標籤或短暫介面狀態時明確套用 `-webkit-user-select: none`／`user-select: none`：Button caption／loading label、Text Action、Tabs label、Checkbox／Field control label、Range label／value、系統產生的短 Chip，以及 Progress 的 label／value copy lane 為不可選取的介面狀態。Icon Button 與 Status Icon 沒有可見文字，不建立空泛的 selection rule。

使用者輸入與可能需要引用、搜尋或回報的內容仍可選取：Text Field／Search／Textarea value、Readonly value、Hint／Error、Inline Notice、診斷內容，以及 Progress 外部的 milestone／terminal result 完整句子。Hint／Error、Inline Notice、Readonly 與診斷內容維持可選取；Notice action 只透過已審查 Candidate Button 繼承 action caption 的不可選取行為，不得把規則提升到 Notice root。Fixed notification host 因 touch／pen swipe 防誤選而整體不可選取，是既有且窄限於 host interaction 的例外。

此矩陣只補強 development-only Candidate 的明確檢查契約；Current 繼續呈現 active truth，不因 Candidate CSS 被污染，也不代表 production adoption。未新增全域 utility、元件 prop 或底層 primitive。

2026-09-12 Chromium 實測：深色與淺色 Compact root 下，Candidate Button、Text Action、Tabs、Chip、Checkbox label、Range label／value 與 Progress copy 的 computed `user-select` 均為 `none`；Hint、Inline Notice、Field support 與 Progress result 為 `auto`，Readonly input 為 `text`。Current Button、Tabs、Chip 與 Progress 保留 `auto`。雙擊 Hint 會產生可見選取高亮，雙擊 Progress label 不會；淺色頁面 `clientWidth`／`scrollWidth` 同為 1280 CSS px，console 無 warning／error。

## 已完成階段：UiProgress Candidate／Current 檢查

`UiNotice` 已完成 owner checkpoint；依 owner 指示只向下進入 Feedback 的
`UiProgress`。F8 已建立標本並完成本階段 checkpoint：

1. 保留現行 8px pill track、Accent fill、單行 ellipsis label 與 indeterminate `aria-busy`，不繼承 Candidate 2px radius、Info fill、自然換行或 authored motion。
2. 名稱保留 `UiProgress`；`UiProgress` 是有標籤的原子進度指示器。它只擁有 visible label、optional visible／accessible value text 與 native `<progress>` track；task start／pause／cancel／retry、完成／錯誤訊息、notification queue、timer、close 與 feature lifecycle 均由流程 owner 負責，不新增 Task Progress、Loader 或 Spinner primitive。
3. 正式 `UiProgress` 目前沒有 production consumer；Analysis 與 Lyrics Provider 的既有 progress presentation 仍各由 feature 擁有，本階段不機械替換。這不否定 shared primitive 的資格：一致的 native progress semantics、label／value 關係與 indeterminate presentation 可跨 feature 共用；feature-only lifecycle recipe 與只服務型錄的 wrapper 留在各自 owner infra。
4. Token v2 與 active token 都把 `--ui-progress-track-size` 映射到 `--ui-space-2`，因此 Candidate Standard／Compact 與 Current 都是 8 CSS px。Compact 沒有已核定的獨立 track remap，本階段不憑外觀偏好新增 4px 值；密度差異由 parent-owned surrounding layout 承接。Candidate 依 DESIGN 的 progress fill 規則使用 `--ui-radius-xs`／2 CSS px，Current 誠實保留 pill radius。
5. 寬度維持 block available width、`min-inline-size: 0` 與 `max-inline-size: 100%`，不建立 component min／max width 或 fixed-notification 尺寸。Candidate copy lane 使用 label 加 optional value；label 可自然換行並以 `overflow-wrap: anywhere` 承接長 CJK／Latin、多語與無斷點檔名，value 使用 tabular numerals 且不與 label 重疊。Current 保留單行 ellipsis label 作 migration truth。
6. Determinate 覆蓋 0、partial、complete 與非 100 total；`value`／`max` 保留 native relative progress semantics，`valueText` 只在 caller 有可讀替代內容時同時呈現並提供 `aria-valuetext`。Progress 不自行推導百分比、stage label 或 terminal result；complete 仍使用 neutral activity fill，另以可見完整句子說明結果。
7. Indeterminate 省略 native `value`，也隱藏可能過期的 visible／accessible value text，不以 0% 假裝未知進度。Candidate 只在 track 內移動一段 Info fill；root `data-ui-motion="reduced"` 與 `prefers-reduced-motion` 都回到仍可辨識的靜態中段，不以移除 track 作 reduced-motion fallback。Current 無 authored indeterminate motion，照實保留。
8. Candidate 使用 `--ui-color-info` 表達 loading／processing 的 neutral activity，不新增 tone prop，也不因 0／complete／error 自動切換 success／warning／danger。顏色只輔助掃描；visible label／value 與獨立 result message 必須完整說明工作及結果。
9. Native `<progress>` 以 required `label` 取得 accessible name；determinate 由 native value／max 提供數值，不手寫 `aria-valuenow`，indeterminate 省略 value。region `aria-busy` 與 milestone announcement 由流程 owner 負責：busy 放在實際更新的區域，頻繁 value tick 不逐次建立 live announcement，重要階段或 terminal result 才由 owner 以完整、可翻譯的句子宣告。Candidate primitive 不自行設定 `role="status"`、`aria-live` 或 `aria-busy`；Current 的 indeterminate `aria-busy` 留作 production compatibility audit。
10. Candidate／Current 都保留 native root attrs fallthrough 的現行 public boundary。Candidate 的 label／value copy lane 是不可選取的介面狀態；流程 owner 另行呈現的 milestone／terminal result 完整句子仍可選取。Current 保留 active truth，不因 Candidate selection rule 改變；Candidate primitive 也不套用 fixed notification host 的 root-level selection policy。不新增 task status、tone、size、width、close、cancel、retry、validation、permission、provider 或 feature-specific prop；正式 `UiProgress`、active tokens 與 production consumers 都不修改。

## 已完成階段：UiMarqueeText Candidate／Current 檢查

`UiProgress` 已完成 owner checkpoint；依 owner 指示只向下進入 Content 的
`UiMarqueeText`。F8 已完成本階段 owner checkpoint：

1. 保留現行 overflow 後自動 infinite alternate motion、LTR travel、所有長短文字都設定 native title，以及 hover／focus 無 pause 的 active truth，不繼承 Candidate 的 interaction-only single reveal、overflow-only title 或 RTL travel。
2. 名稱保留 `UiMarqueeText`，因為它準確描述既有單行溢位後平移的行為；不只為較泛化命名新增 `UiOverflowText`。`UiMarqueeText` 只擁有單行溢位量測與可控的內容移動；paragraph wrapping、button copy、status announcement 與持續更新不是它的用途。
3. 既有 6 個 production direct consumer／7 個使用點涵蓋 track row、text action、queue、playlist、player bar 與 setlist table；shared ownership 來自一致的 ResizeObserver／font readiness／requestAnimationFrame cleanup、overflow threshold、travel geometry 與 reduced-motion lifecycle，不只來自 consumer count。Feature-only width／typography／interaction recipe 留在所在功能。
4. Public contract 維持 `text: String／Number` 與 native root attrs fallthrough；不新增 speed、duration、density、tone、lines、active、paused、tooltip 或 live-region prop。Candidate 預設 `dir="auto"`，caller 明確提供的 `dir`／`lang`／data attrs 仍套用到 native root。
5. 元件維持 block flow、`min-inline-size: 0` 與 `max-inline-size: 100%`，不建立固定 min／max width、高度或字級。Standard／Compact 只改變 parent-owned surrounding inset；所在畫面負責 available width、font、line-height、color、baseline 與相鄰間距。
6. 只有超過可用寬度 1 CSS px 的單行內容進入 overflow state。Candidate 短文字保持靜態且不重複 native title；overflow 才以 title 補回完整值。長 CJK／Latin、多語、無斷點檔名與 RTL 都留在 bounded frame；RTL travel 使用相反方向，不讓整個 F8 page 水平溢出。
7. Candidate 不在背景自動循環。Fine pointer 指向 overflow text 或 keyboard focus 位於明確的 interactive owner 時，才以 0.2s delay 進行一次 one-way reveal；移動時間依 travel distance 計算並限制在 1.8–5 秒。到達末端後停留，離開／失焦後回到開頭，再次進入／聚焦會重新播放，不把第二次 hover 解讀為 pause toggle。型錄另以 11rem 寬的明確預覽列說明觸發方式，避免靜態第一眼被誤認為沒有動畫。Pointer 按住文字時暫停現有動畫，放開後續播，以免移動干擾選取；touch／pen 與 standalone keyboard text 維持靜態 ellipsis，不為非互動文字新增 tab stop。
8. Overflow 靜止時只淡出尚有內容的末端邊緣，移動中淡出兩側，到達末端後改淡出起始邊緣；LTR／RTL 對調方向，fade 只提示可見內容邊界，不承載語意。Root `data-ui-motion="reduced"` 與 `prefers-reduced-motion` 都強制停止 motion 與 mask，保留靜態 ellipsis 與 overflow-only full-value fallback。Motion 不是狀態、進度或唯一資訊來源，也不建立顏色語意。
9. 可見完整文字保留原生 reading content；Marquee 不自行設定 `role`、`aria-label`、`aria-live` 或 tabindex。操作語意、focus target 與 dynamic announcement 由知道目的與更新時機的 owner 負責；focus owner 只作 parent recipe，不提升為 Marquee prop。
10. Standalone Marquee 內容保持可選取，讓使用者複製曲目名或檔名；若文字位於 Button／Text Action 等操作 chrome，select-none 仍由互動 owner 套用。正式 `UiMarqueeText`、active tokens 與 consumers 都不修改；本階段已完成 owner 可視確認，production adoption 仍待後續 gate。

## 已完成階段：UiTrackThumb Candidate／Current 檢查

`UiMarqueeText` 已完成 owner checkpoint；依 owner 指示只向下進入 Content 的
`UiTrackThumb`。F8 已完成本階段 owner checkpoint：

1. Current 使用正式 `UiTrackThumb`，誠實保留 missing image 的曲名首字、載入失敗後的 broken-image 狀態及非裝飾模式未補 image role 的現況，不繼承 Candidate 的預設圖池、failure fallback、ARIA 補強或 surface。
2. 名稱保留 `UiTrackThumb`。`UiTrackThumb` 表示單一曲目的方形封面或 identity fallback，只擁有媒體裁切、缺圖呈現與 thumbnail 內容邊界；collection collage、track metadata、row selection、播放／導覽與 action 都由 `UiCollageThumb`、`UiTrackRow` 或 feature owner 負責。
3. Production 使用涵蓋 track row、player bar、metadata modal、import candidate、studio library、setlist 與 queue；Queue 已透過 `UiTrackRow` 間接使用 TrackThumb。共用 primitive 的理由是相同的 square geometry、cover crop、fallback、radius 及 decorative boundary，不把 consumer 各自的 spacing、selection、status 或 navigation 上提成 props。
4. Public contract 維持 optional `track`、required caller-owned `size`、optional `radius`／`background`／`color`／`fontSize`／`uppercase`／`decorative`、native root attrs fallthrough，以及 default／overlay slots。`color`、`uppercase`、default slot 與 overlay slot 目前沒有 production consumer，但先保留 compatibility，留待 adoption gate 以 migration evidence 判斷，不在標本階段刪除或擴張。
5. Current consumer 快照收斂為 32／40／48／64px：import candidate 在 56px 選擇列使用 32px；track row 與 queue 都在 52px 最小列高使用 40px；bottom-left PlayerBar 在 80px 高度中使用專屬 48px；metadata editor 使用 64px preview。Candidate 收斂為密集選擇 36px、標準曲目列 40px、播放操作 48px、封面檢查 64px；其中播放操作指 PlayerBar，48px 不再作 queue／player 共用尺寸。尺寸仍由 caller／layout recipe 指定，primitive 不建立 min／max、density、recipe 或 responsive prop；4px radius 與 `object-fit: cover` 維持所有尺寸及來源比例的一致裁切語法。
6. 四張同系列方形圖是歌曲沒有可用封面時的預設 fallback 圖池，不是一般歌曲封面範例；素材以 PNG alpha 移除圓外白底，只保留中間圓形內容，使同一圖能落在深／淺 surface。Candidate 依 track identity 做 deterministic mapping，使同一首歌在 render、theme、density 與視覺回歸中維持同一張，同時讓不同歌曲分散使用四圖；不在 render／SSR 呼叫 `Math.random()`。Current 不接入此圖池。另以寬圖及複雜方圖作有效 `thumbnailUrl`，讓 Candidate／Current 共用來源驗證 center cover crop。
7. 內容矩陣包含正常封面、缺少 URL、圖片解碼失敗、空標題、長 CJK、Latin、多語與無斷點字串。Candidate 的 fallback ladder 為有效 custom cover → stable default artwork → track initial／`?`；missing URL 直接顯示預設圖，custom cover 失敗後切到預設圖，只有預設圖本身也失敗才顯示首字。這是視覺韌性，不新增 remote retry、provider、loading、validation、fallback prop 或 feature-specific prop；Current 保留 missing initial 與 failed broken-image active truth。
8. Thumbnail 本身不是操作按鈕，不新增 tabindex、hover action 或 gesture。圖片與 fallback identity 都是不可選取的介面識別，`img` 明確設為 non-draggable；row 或 button owner 仍負責整體 pointer／keyboard target、focus 與 select-none 範圍。
9. 預設 `decorative` 維持 `aria-hidden="true"`；Candidate 在 `decorative="false"` 時補足 image semantics，accessible name 仍由 caller 以 `aria-label` 或其他 native attrs 提供。元件不自行從曲名推導可朗讀名稱，也不建立 live region、status、tooltip 或重複 announcement。
10. Candidate 只存在 development-only F8；正式 `UiTrackThumb`、active tokens、production consumers 與圖片資料流程都不修改。本階段已完成 owner 可視確認；下一個可處理的元件只有 `UiCollageThumb`，但本次總結與提交不開始該元件，也不進入 `UiTrackRow`、Overlay 或 F7 View。

## 已完成階段：UiCollageThumb Candidate／Current 檢查

`UiTrackThumb` 已完成 owner checkpoint；依 owner 指示只向下進入 Content 的
`UiCollageThumb`。F8 已建立本階段 Candidate／Current 標本並完成 owner
可視確認：

1. Current 使用正式 `UiCollageThumb` 與 active-token 快照，保留零首顯示四個空格 glyph、custom／member 壞圖位置、第二與第三格連圖片一起降低 opacity 的現行真值，不繼承 Candidate 的 empty state、failure fallback 或 neutral cell surface。
2. 名稱保留 `UiCollageThumb`。`UiCollageThumb` 表示一個集合的封面位置與 optional 2×2 collage，負責 custom collection cover、single member representation、ordered member collage 與 empty collection。Candidate CollageThumb 與 Candidate TrackThumb 共用一個只負責 custom → default → initial 的 internal track artwork content layer，以及同一個 track-identity fallback artwork resolver；不互相 import 完整 public component，`UiTrackThumb` 的 size、attrs／ARIA、default／overlay slots、track metadata、row selection、播放與導覽仍由各自 owner 負責。
3. 既有 5 個 production direct consumer 為 Studio Library dossier header／context inspector、Setlist playlist header／sidebar row／details modal；SetlistView、playlist actions 與 Studio Library presentation 另負責 ordered track projection。共用元件來自一致的 collection precedence、square geometry、first-four slicing 與 overlay plane，不把 consumer layout 或 product type 提升成 props。
4. Public contract 維持 optional `coverUrl`／`tracks`／`canCollage`、required numeric caller-owned `size`、optional `radius`／`background`／`color`／`uppercase`／`decorative`、native root attrs fallthrough 與 overlay slot；不新增 collection id、playlist type、context、responsive、density、retry 或 feature-specific prop。
5. Current consumer 尺寸為 40／88／120／136／280px，分別對應 Sidebar、Dossier、Details modal、Setlist header 與 Context inspector。Sidebar collection row 與標準 Track Row 共用 52px row／40px artwork 節奏，但保留各自的 collection／track identity component。每個 `size` 都同時決定 width／height；來源圖片比例不改變 square output geometry，寬圖、直圖與方圖都以 `object-fit: cover` 置中裁進正方形，不拉伸也不保留 letterbox。外框、member cell 與 empty glyph 分屬三層 size ownership：caller／layout 決定外部 square；Candidate 的兩個等寬 columns 與兩個等高 rows 決定 member cell，使每個 2×2 member cell 都是外框邊長的一半；共用 no-identity glyph 依 identity box 用 `clamp(1rem, 33%, 2rem)` 保持 16–32px optical cap。Current 缺少 explicit rows，保留為 active implementation 差異。Standard／Compact 只改周邊 layout density；窄幅容器與 280px preview 的 overflow 責任留在 caller，Candidate 不建立 min／max 或 collection size token。
6. 未來的封面焦點／裁切區域選擇器屬獨立編輯流程，用來決定正方形輸出要保留來源圖片的哪一部分；它不是 `UiCollageThumb` 的內部互動，也不在本階段新增 `object-position`、crop coordinates、responsive crop 或 selector prop。持久化資料與 renderer consumption 必須等真實編輯流程另案決定。
7. Candidate precedence 為 active custom collection cover → 既有 member representation；`canCollage=false` 使用第一首完整圖片，缺圖／壞圖使用既有的 stable default artwork，沒有成員顯示單一 empty state。`canCollage=true` 時，一首使用 full-size artwork；二至四首才進入 2×2，依收到順序只取前四首，不足四首保留 quiet vacant cells，4+ 忽略後續。零首集合與無 track 共用 no-identity placeholder，只顯示一個有上限的 Music glyph；vacant member cell 不重複 glyph，避免把不存在的成員畫成假 identity。
8. 每個 occupied cell 的圖片缺少或載入失敗時，與 `UiTrackThumb` Candidate 共用同一個 internal track artwork content layer，並共用同一個 track-identity fallback artwork resolver，從 owner 提供的四張預設封面穩定選圖；不複製 pool，也不把 `UiTrackThumb` component、props、slots、root size 或操作語意合併進來。只有 bundled fallback asset 本身也失敗時才以 track initial 作 terminal safety。重複 URL 依 authored positions 保留，不去重、不跳找後續不同圖片、不重排。
9. Candidate 明確區分三種狀態：no-identity 是整個 TrackThumb／CollageThumb 沒有任何曲目，missing artwork 是已有 track identity 但 custom image 缺少或失敗，vacant slot 是 2×2 中不存在的成員。候選 checkerboard 只改 neutral backing，不降低實際 artwork opacity；圖片、initial、no-identity glyph 與 quiet vacant cell 不只靠顏色辨識。圖片與 artwork chrome 維持 select-none、`draggable=false`；周邊集合名稱與使用者資料文字保持可選取。
10. 預設 decorative artwork 維持 `aria-hidden="true"`。獨立表意時由 caller 同時提供 `role="img"` 與 accessible name；含 overlay control 時只解除 `aria-hidden`，不自動建立 image role，避免吞掉 interactive descendant，按鈕自行擁有 label、focus、hit target、state 與事件。元件不從 track title 推導 collection name，也不建立 live region／status。
11. Playlist Sidebar 目前先 `slice(0, 4)` 再過濾 ghost ids，其他 projection 則先過濾再交由元件切片；此差異記為 production migration audit，本標本不修正。Candidate 只存在 development-only F8，正式元件、active tokens、consumers 與資料投影均不修改；本階段已完成 Collage Thumb owner checkpoint。

## 已完成階段：UiTrackRow Candidate／Current 檢查

`UiCollageThumb` 已完成 owner checkpoint；依 owner 指示只向下進入 Content 的
`UiTrackRow`。F8 已建立本階段 Candidate／Current 標本並完成 checkpoint：

1. Current 使用正式 `UiTrackRow` 與正式 `UiCheckbox`、`UiChip`、`UiStatusIcon`、`UiIconButton`，並以 active-token 快照保留現行 52px row／40px artwork、青綠 selected surface、珊瑚 current title 與 root button-role 行為，不繼承 Candidate 的 compact geometry、artwork action 或互動修正。
2. `UiTrackRow` 只擁有一列 track identity anatomy：optional lead lane、固定方形 TrackThumb、`min-width: 0` 的 title／artist stack、optional bounded status／Badge trail，以及存在時固定最右的 tabular duration，另有 selected／current／interaction surface。Playlist sorting、drag reorder、來源／index 欄位、selection state、status derivation、playback、album navigation、context menu 與 destructive action都由 caller 擁有。
3. Candidate 必須實際組合已審查的 development-only TrackThumb 與 Marquee Text，以及 consumer recipe 所需的 Checkbox、Chip 與 Status Icon；一般 Candidate Track Row 的曲名不是 Text Action，current cue也不因Status Icon已審查就強制組合圓形wrapper。Current recipe只使用正式`Ui*`元件，保留正式Text Action與Icon Button的現行操作真值。Row不重畫可見子控制、不跨Candidate／Current layer混用，也不把`UiTrackThumb`的fallback pool、crop、overlay slot、ARIA或操作契約上提為Row prop。
4. Interactive Candidate 保留 native `<li>`／listitem，由一個具 caller-provided accessible name 的 stretched sibling native button 承擔整列 primary playback action；optional artwork destination、lead control 與 trail action維持同層 sibling target。Primary button 使用 explicit `activate` event，原生提供 Enter／Space、focus 與 disabled；它不投影 Checkbox 的 selection，也不使用 `aria-pressed`，不以 root `role="button"` 包住真實 buttons。Artwork action 只在 destination 存在時渲染，使用 generic `artworkClickable`／`artworkAriaLabel`／`artworkClick` contract，不把 Album 或 navigation feature命名帶進 primitive。
5. `selected` 與 `current` 是可同時存在的兩個 caller-owned 狀態，並參考成熟音樂清單的狀態分責而不複製品牌色或 index 欄：Selected 使用中性文字色 8% surface、不再疊加常駐 outline；可操作 recipe 由 checked Checkbox 提供明確形狀與 selection action，整列播放按鈕不把該狀態誤宣告為 pressed。Current只強調accent title並由root投影`aria-current`，不在title後固定插入glyph、圓形Status Icon或額外間距。若table本來有index lane，caller可用等化器取代序號；若compact artwork row需要尾端播放glyph，也由該caller組合。這些context cue不進generic Row anatomy。
6. Standard 使用 52px min row／40px TrackThumb；Compact 使用 44px／36px。Row inline-size填滿 caller並保證`min-width: 0`／`max-width: 100%`，不建立固定min／max width；52／44px是block-size floor，不設會裁掉字體縮放或caller slot的hard `max-height`。Candidate 不新增`size`、density、responsive、playlist type、provider、lyrics、analysis或feature-specific prop；Current不受F8 density切換污染，維持active-token 52／40px truth。
7. Title 使用已核准的單行 overflow reveal，artist 使用 static ellipsis，duration 只在 finite positive value 時顯示，並在 Candidate DOM／視覺順序固定排於 status trail之後。Trail只示範最多兩個具一致語意的 Badge，實際數量與優先順序仍由 caller收斂，不能無上限擠壓identity。型錄把長 CJK／Latin／無斷點檔名與多語合併為一列，再以窄 RTL 一列代表另一方向；缺 artist／duration、trail 擠壓與完整排列由 focused tests 承接，row 與 page 不得產生水平 overflow。
8. Stretched primary action、控制與狀態chrome維持select-none；title／artist user metadata在static與interactive row都保持可選取。Interactive metadata、lead與trail lane以明確z-index位於stretched action上層：selection非collapsed時不轉送row action，一般 metadata、非互動 lead／trail內容與空白仍轉送整列播放；Checkbox、artwork destination與尾端控制各自stop propagation，只執行自己的選取、導覽或操作。F8可操作標本不得把事件接到`NOOP`：整列播放、Checkbox、縮圖導覽與Current尾端操作合併以一個可見`aria-live="polite"`結果列回寫，拖選文字不改寫結果。Artwork action的target恰好等於caller提供的36／40px TrackThumb box；沒有destination時渲染普通縮圖，不保留dead button。Square crop、fallback、non-draggable image與select-none仍由TrackThumb擁有；Row不新增圖片重試、fallback selector、crop selector、drag或selection prop。
9. 五個 direct production consumer 為 `ProviderImportPanel`、`LyricsTrackPickerModal`、`MusicAnalysisTrackPicker`、`QueueTrackButton` 與 `StudioLibraryContextInspector`。F8 以一個單欄full-width可操作recipe組合已審查child primitives：Candidate同一列包含Checkbox輔助選取、整列播放、artwork destination、兩個一致的status Badge與最右時長；Current另保留正式title destination與Icon Button，誠實顯示現行垃圾桶仍占用尾端。Checkbox只切換`selected`，不播放；Candidate曲名與一般metadata都屬整列播放範圍，有來源Album且不在Album情境時只有縮圖導覽且不播放。在Album內容列中，縮圖與曲名都不重複導向Album；未來只讓實際Artist文字在destination可用時成為sibling CTA，但不預先新增artist-specific prop。Playlist／collection identity不是單曲Row；需要持續顯示「播放中」等集合狀態時，可由Playlist caller在自己的status slot組合具文字的`UiChip`，不把Playlist status上提為Track Row prop。PlayerBar也是另一個owner，不使用Track Row的stretched action；其長期對應可分為縮圖→Metadata、曲名→Album、Artist→Artist info，而現行Utawakui仍是縮圖切換Studio context inspector、曲名→Album、Artist普通文字，差異只記為後續adoption audit。Candidate的row checkbox沿用`DemoCandidateCheckbox`，視覺label隱藏但保留具體accessible name；Row recipe只為16px indicator保留16px inline optical lane，36／32px native hit target依density完整置中覆蓋該lane，indicator再置中於target。Compact實測visible indicator與Row左緣、artwork皆保持12px視覺距離，完整target仍保留且不與artwork重疊。Current保留正式`UiCheckbox`可見label與intrinsic target作active truth。其餘consumer排列由focused tests與本契約記錄，不在Candidate／Current各自重鋪完整矩陣。標本不修改consumer event、資料投影或產品流程；`QueueTrackButton`仍是 Queue feature adapter，`StudioLibraryContextInspector` 只投影非互動 current／upcoming identity，五欄`SetlistPlaylistTable`則維持獨立owner。
10. 正式 `SetlistView` 已有 caller-owned `UiContextMenu`，但目前選單沒有「刪除曲目」，刪除仍由 row trail 的常駐 Icon Button呼叫既有確認流程；選單開啟也只有 pointer `contextmenu`。Candidate採用「status在時長左側、時長固定最右」的版面方向，但不在本 checkpoint 偽造 context-menu adoption。未來若移除常駐刪除按鈕，caller必須把具明確文字與danger語意的刪除項目接回既有確認流程，並同時提供 ContextMenu key／Shift+F10 或可見且可聚焦的更多操作入口，不能讓滑鼠右鍵成為唯一入口；Row不新增menu items／actions prop。
11. 型錄資訊順序固定為邊界、尺寸、靜態狀態、單一合併可操作範例與內容壓力；靜態狀態不渲染虛假的 action target，只有可操作範例提供控制與結果回饋。Candidate 只存在 development-only F8；名稱先作既有 contract label 保留；是否留在 `components/ui` 或移至 domain-owned shared component，須等更廣泛的 production migration 以真實 ownership evidence 另案決定。
12. Queue 已採用正式 `UiTrackRow` 的 Standard 52／40px recipe，並沿用同一 anatomy、keyboard focus、selected／current 分責與 drag attrs。Queue 的 caller-owned recipe 為單擊選取、雙擊或縮圖播放、Enter 播放／Space 選取、隱藏 duration、曲名與 artist 純文字；只有 section 的已知來源名稱可作 destination。正式元件提供 bounded `overflow`、`thumbLoading`、`thumbDecoding`、artwork action 與 Enter activation 邊界；既有 consumer 的 marquee、eager loading、auto decoding 與互動預設不變，Queue 才明確使用 ellipsis、lazy loading 與 async decoding。Queue scroll boundary 對 tabs、heading、empty cue、row 空白與 actions 套用 `select-none`，再只對 title／artist metadata 恢復 `text`；這個 production adoption 保持在 feature owner，不改寫 `UiTabs`、`UiHint` 或 `UiTrackRow` 的通用 selection policy。這是已由真實 Right Dock consumer 證明的最小 production adoption，不把 Queue selection、playback、reorder 或來源導覽責任上提到 shared row。
13. Right Dock 由 `AppRightDock` boundary 將內部 `UiTrackRow` 映射到固定 52／40px；inline 邊界使用 8px panel perimeter、4px row content inset 與 4px state-surface outset，因此 state paint／section content／artwork 分別位於 Dock edge 的 4／8／12px。這是 shell surface 密度契約，不改寫 generic Compact Row，也不依賴 Sidebar feature token。Playback Metadata 的 current／upcoming identity 使用正式 `UiTrackRow`：current 使用 `current` cue，兩者都使用 ellipsis 並隱藏獨立 duration column，upcoming 將時長合併進 artist metadata line。這些 row 是非互動投影，不繼承 Queue 的選取、播放、拖曳與 menu intent。Collection cover／名稱／description 仍屬 collection summary，不併入 Track Row；description 使用 14px Body line-height 及可換行 prose 規則。

## 已完成階段：UiActionMenu／UiContextMenu Candidate／Current 檢查

`UiTrackRow` 已完成 owner checkpoint；依 owner 指示只向下進入 Overlay group 的
action menu。F8 已建立本階段 Candidate／Current 標本並完成 owner checkpoint：

1. Naming proposal 使用 trigger-neutral 的 `UiActionMenu`；Current 仍標示正式 `UiContextMenu`。元件是跨 Settings、Playlist 與 Setlist 的 shared compound basic unit：擁有 Teleport、menu/item semantics、focus、keyboard、one-level submenu、viewport collision、dismissal 與 single-open coordination；caller 擁有 Ellipsis／row right-click trigger、anchor、產品 action、desired width 與 trigger ARIA。本 checkpoint 不 rename production，也不擴成 Select、Popover、Command Palette 或 recursive tree menu。
2. Public boundary 保留 `open`、viewport `x`／`y`、numeric desired `width`、`alignX`、`emptyText`、items／one-level children、`select(value, item)` 與 controlled `close`。現有 caller 已證明 184／220px root 與 240px submenu；component 不建立 arbitrary hard minimum，只使用 `min-inline-size: 0`、viewport 兩側 8px actual max、20rem／viewport 高度上限與 vertical scroll。Menu item 的 Standard／Compact floor 都是 2rem／32px，沒有 hard max-height，也不新增 density、responsive、playlist type、provider 或 feature prop。
3. Item 保持 internal native `button[role="menuitem"]`，separator 與 submenu 也維持內部 anatomy；真實 consumers 尚未證明 public `UiMenuItem`／`UiMenuSeparator`／checkable menu API 的需求。Visible trigger 重用 `UiIconButton`／`UiButton`，item icon 重用 project icon registry 與 16-unit glyph。Item 不強套高度、字重、focus model 不符的 `UiButton`，也不把 `UiChip`、`UiStatusIcon` 或 `UiMarqueeText` 塞入 dense action row；icon 只輔助可見動作文案，只有 opener 與 submenu chevron 可獨立使用。
4. Candidate 的 generic item anatomy 只包含 optional 1rem leading icon、`minmax(0, 1fr)` visible label 與 optional 1rem submenu chevron；只在實際存在的欄位間保留 8px gap，不建立 status、badge、shortcut 或空白預留欄。同一 menu 內保持既有欄位的垂直對齊。固定動作文案在 184／220px 支援寬度內必須完整顯示，ellipsis 只作 viewport 或字級放大下的防線；使用者命名的 playlist destination 可在 240px submenu 的硬限制下防禦性截斷，若大量或同前綴名稱使辨識失敗，應由 feature-owned searchable picker 承接。Separator 使用 stable entry identity；submenu 位置量真實 parent item rect，不以 item index 乘 row height 估算，因此不會被 separator 或長內容推錯。
5. Candidate 開啟後聚焦第一個 item；disabled 使用可聚焦的 `aria-disabled` 並拒絕執行。Up／Down 循環、Home／End、printable-character typeahead、Right／Enter／Space 開子選單、Left 回父層，RTL 交換左右語意。Escape、Tab／Shift+Tab 與 action selection 都關閉並把 focus 回到 opener；Tab 不攔截原生頁面順序。Outside pointer／right-click、外部 page／ancestor scroll 與 resize 關閉但不搶走新的 focus；root menu 與 submenu 自身的 overflow scroll 保持展開，root 捲動且 submenu 已開啟時依 parent item 新 rect 重新定位。Empty menu root 本身可聚焦並接受 Escape／Tab。
6. Candidate root 與 item chrome 使用 `user-select: none`，避免短暫 action identity 被誤選；menu label 與 icon 都是 control chrome。這項規則不擴到 caller 的使用者資料文字。Menu 使用 raised surface、1px border、6px radius 與 restrained overlay shadow；hover、active submenu 與 focus-visible 分責，danger 保留明確文字，disabled 不只靠顏色表達。
7. F8 同時提供兩種真實 caller trigger：可見 Ellipsis `UiIconButton`，以及可聚焦 row 的 pointer right-click／ContextMenu key／Shift+F10。兩者都只提供 anchor 與開啟 intent；選單不吞入來源 identity 或產品流程。若未來把刪除移入 row action menu，caller仍須接回既有確認流程，並保留鍵盤或可見 opener，不能讓滑鼠右鍵成為唯一入口。
8. 完整展示案例包含純 label、icon、separator、focusable disabled、danger、one-level submenu、empty、精簡 CJK／Latin／Arabic 動作、動態 playlist destination、RTL、root／submenu vertical scroll、外部 scroll dismissal、右下 viewport collision 與可見的 demo-only action結果；Candidate／Current 各自只開一個真實 menu。Candidate 的 submenu 以兩個 surface outer rect 保留 4px inline gap，block-start 先對齊 parent item 再受 8px viewport clamp；LTR 優先向右、RTL 優先向左，偏好側不足時翻面。Current 透過 development-only Teleport marker 套用完整 active-token snapshot，保留現行固定四 lanes、focus 留在 trigger、缺少 menu accessible name／root attrs fallthrough 與既有 keyboard 差距，不被 Candidate token 污染。
9. 2026-09-13 Chromium 實測：深色 Candidate surface 為 `#2d2f35`，Current 為 `#292f35`；淺色 Candidate 為 `#fbfaf7`，Current 為 `#fffdfa`。220px Candidate root 的 item border box 為 210px、grid 為 16／146／16px、兩個 occupied gap 各 8px，五個固定動作皆未截斷、status DOM 為 0、水平 overflow 為 0；同尺寸 Current 的「新增至佇列／已在佇列」仍使用正式 16／82／56／16px 四欄，證明 Candidate 沒有污染 active-token 快照。184px settings root 的 icon／label grid 為 16／134px，兩個固定動作也完整顯示。多語 root 在 scrollbar 存在時使用 16／160px，CJK／Latin／Arabic 三項均未截斷；menu 為 320px／`scrollHeight` 392px，按 End 後 `scrollTop` 74px 且保持展開。240px submenu 在一般 viewport 提供 204px label lane，`Midnight Session／深夜練唱清單` 完整顯示；最窄 240×240 viewport 中，submenu 才 clamp 為 224×224px、label lane 為 188px，該動態名稱防禦性截斷，四側各保留 8px 且 `scrollWidth`／`clientWidth` 同為 212px。空間足夠時 surface gap 為 4px、submenu top 與 parent item offset 為 0；RTL computed direction 為 `rtl`、chevron 水平翻轉、ArrowLeft 開啟且左側 surface gap 為 4px。外部 `.demo-view` 捲動會關閉，menu 內部捲動不關閉；本輪 console 無 warning／error。Action Menu 的 32px item floor 不受 Standard／Compact density 改變，本次可視 runtime 為 Compact，兩種 mapping 另由相同 CSS contract 與 focused test 鎖定。
10. Pointer right-click與Shift+F10都會開啟同一Candidate menu，first item取得focus；Escape回到row，action selection關閉並回到原trigger，`aria-live="polite"`只回報型錄內結果。Current實測仍把focus留在trigger，root無accessible name／id，作為後續production migration gap；F8不修正式元件。
11. Candidate 只存在 development-only F8；正式 `UiContextMenu`、`useContextMenuGate`、production consumers、active tokens、confirm flow與資料投影均未修改。本階段已完成 owner 可視確認；後續 UiModal 另以自己的責任與標本通過 gate，沒有把 menu public contract 帶入 dialog。

## 已完成階段：UiModal Candidate／Current 檢查

`UiActionMenu` 已完成 owner checkpoint；依 owner 指示只向下進入 Overlay group 的
`UiModal`。F8 先脫離現有用途排版建立中性 shell，再以短內容、欄位組合與長篇
說明三種 caller-owned 內容壓力完成本階段 owner checkpoint：

1. Candidate 與 Current 各自保留獨立比較層。Candidate 使用 Token v2 surface 與 component aliases；Current 透過 development-only root marker 使用完整 active-token 快照，保留正式 `UiModal` 的 default／notice／wide、整面捲動與既有 focus truth，不繼承 Candidate 尺寸、背景或欄位層級。
2. 名稱保留 `UiModal`。Primitive 擁有 protected top layer、scrim、shell 幾何、header／body／optional footer、focus、dismissal 與 overflow；caller 擁有標題、內容結構、操作、驗證、提交與實際 size 選擇。不新增 purpose、content case、form、terms、provider、permission 或 feature-specific prop，也不讓展示案例自動決定尺寸。
3. Candidate 尺寸是純幾何的 Small `24rem`／max `35rem`、Medium `32rem`／max `45rem`、Large `48rem`／max `50rem`。實際 inline／block size 再受 viewport 兩側安全邊界限制；Standard 為 24px、Compact 為 16px。Component 使用 `min-inline-size: 0`，不建立內容用途專屬 minimum，也沒有會裁掉字體放大或 caller slots 的 hard block-size。
4. Candidate 使用 fixed header／optional footer 與 body-only vertical scroll；header、footer 與 close 不隨正文捲走，body 禁止一般情境的水平 overflow。Footer 只有 slot 存在時才渲染，inline inset 沿用 24／16px，action-only block inset 為 Standard 12px／Compact 8px；Button 仍保持已核定的 36／32px target floor。Medium 45rem 是一般捲動壓力基準，不是表單或條款 variant。
5. Header title 與 close 使用獨立 lanes；標題可以自然換行，不為 close 預留整條空白 rail。Large shell 的長篇兩欄只屬 F8 caller recipe：container 達 42rem 時使用完整 body width，較窄時回到單欄並保持 DOM 閱讀順序；68ch lead measure 也不進 Modal public contract。
6. Candidate shell 使用單一 `surface-raised`，header／body／footer 維持 transparent，Footer 只用 subtle divider 分區。Raised shell 內的 editable fields 由 Modal context 將既有 Field aliases映射到 `surface` rest／`surface-hover` hover，readonly 回到 `surface-raised`；不新增 raw color、background／surface prop，也不修改正式 Field family。
7. 欄位組合實際重用已審查的 Candidate／Current Button、Checkbox、Hint、Select 與正式 Text Field／Textarea；操作只更新 demo-local 結果。短內容不撐滿最大高度，長篇內容包含 CJK／Latin／日文／韓文、無斷點識別與可選取段落，用來驗證自然換行、閱讀順序及 scroll，而不建立產品流程或用途型 API。
8. Candidate 使用 native `dialog.showModal()` 取得 top-layer 與背景 inert 行為，以 `aria-labelledby` 連結可見標題；開啟時優先聚焦 caller 的 authored `autofocus`，否則聚焦標題。Escape 走 native cancel 並 emit controlled close，Tab 在 dialog 邊界循環，關閉後回到 opener。Scrim pointer 不隱含關閉，避免未確認丟棄 caller draft；close button保留具名 32px target。
9. 每次新開啟會把 body scroll 回到頂端；同一次開啟期間 caller 更新內容不改變閱讀位置。使用者資料與說明文字維持可選取，title／axis label／button 等介面 chrome 不選取；Modal 不吞入 selection、drag、announcement 或 result lifecycle ownership。
10. 2026-09-14 Chromium 實測：Candidate 深／淺 shell 為 `#2d2f35`／`#fbfaf7`，nested editable field 為 `#272928`／`#f3f1ec`；Current shell／field 為深色 `#292f35`／`#344046`、淺色 `#fffdfa`／`#edf2ef`。1280×720 Compact Medium 長文為 `512×688px`，body `clientWidth === scrollWidth === 500px` 且 header／footer 不位移；340×480 時 shell 為 `308×448px`、body仍無水平 overflow。Large 內容可用 734px，雙欄各 355px／gap 24px；窄視窗回到264px單欄。重新開啟回到 `scrollTop 0`，focus、Home／End／Page Up／Page Down 與 Footer有／無均完成實際檢查。
11. Candidate 只存在 development-only F8；正式 `UiModal`、active `tokens.css`、十一個 production consumer及其內容排列均未修改。Current 的非 native top layer、背景 page 未 inert、整個 shell 捲動、header／close 可能離開 viewport與 focus／accessible-name差距只記為後續 migration audit，不在 F8 反向改正式 component。

## 已記錄決定與後續 gate

F8 已完成 Foundation 至 UiModal 的全部 30 個原始 component comparison sections。
2026-09-30 owner 已啟動 controlled production migration：真實 consumer 已證明的
shared subset 可以先 adoption，F8 保留為 regression catalogue；其餘候選仍不得因
標本完整就機械替換。F7 View 維持 development-only checkpoint，完整 visible
acceptance 是 page-level adoption gate，但不再阻擋已有真實 consumer 的低階
token-compatible primitives。

`決定時點` 欄預設值為「Candidate 已核定／已核准；production adoption 待後續」，以
`—` 表示；欄位另有標注時才代表偏離此預設。

| 決定                          | 建議基線                                                                                                                                                                                                                               | 決定時點                                                                |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Select trailing indicator     | Candidate closed control 使用 project-owned ChevronDown 與 12px end inset；Current 保留 native indicator                                                                                                                               | —                                                                       |
| Selected value 過長           | Candidate closed lane 單行 ellipsis；確實溢位時在 hover／focus 顯示同寬靜態完整值提示，不使用 marquee；native popup 寬度仍由 UA 決定                                                                                                   | —                                                                       |
| Select readonly 替代          | 不增加假 readonly prop；不可編輯值用 disabled 或非表單文字，依產品語意選擇                                                                                                                                                             | Select public contract                                                  |
| Field readonly surface        | Candidate 的 Text Field／Textarea 使用較平 quiet surface、一般邊界、完整文字對比、可選取／複製與 focus ring；不加 lock／badge                                                                                                          | —                                                                       |
| Checkbox target／indicator    | Candidate 使用 36／32px full-row target、16px project-owned Check／Minus；多行 label 對齊第一行，native input 保留互動與語意                                                                                                           | —                                                                       |
| Checkbox mixed ownership      | `indeterminate` 是 caller-owned visual／ARIA projection；Boolean selection 後由 controller 清除，不建立 readonly 或 tri-state value                                                                                                    | —                                                                       |
| Range track／thumb ownership  | Candidate 使用 6px project-owned base／fill、16px Chromium thumb pseudo-element、2px canvas rim 與互動 halo／ring；單一 native input 保留所有輸入語意                                                                                  | —                                                                       |
| Range stops                   | 等距吸附維持 native step；3–7 個有意義 stops 可使用軌道內無標籤 ticks，不永久預留 marks row；具名／不規則 marks 延後至具體需求                                                                                                         | —                                                                       |
| Range target／output          | Candidate full-track target 為 36／32px；`valueText` 同時供 output／ARIA，窄幅時完整 reflow 而不壓縮 track                                                                                                                             | —                                                                       |
| Reserved support row          | 維持 layout-owned 候選，不進 `UiField` API；等真實同列表單證明重用需求                                                                                                                                                                 | 第一個產品表單 migration                                                |
| Zod／required controller      | UI 只接收本地化 `invalid + error`；驗證時機與 issue mapping 由產品 form owner 負責                                                                                                                                                     | 實際表單 migration                                                      |
| Standard／Compact activation  | Electron `BrowserWindow` windowed／restored 投影 Compact，maximize／fullscreen 投影 Standard；root 永遠保留明確值，不依 viewport 或 sidebar 猜測                                                                                       | 已核定；目前只有 opt-in Token v2 surface 消費                           |
| Button pressed state          | Candidate Secondary 使用 active surface＋strong border、Accent 使用 `--ui-color-accent-active`；Current 無 authored `:active`，不假造 production style                                                                                 | —                                                                       |
| Button long label             | 一般動作文案優先保持精簡；受限 Candidate 單行 ellipsis、不跑馬燈，full-width 與可用寬度仍由 parent 擁有                                                                                                                                | —                                                                       |
| Field＋Button composition     | 同一 density scope 對齊 36／32／30px control box；外部 row gap 8px、內部 icon／label gap 4px，窄幅由 parent 堆疊與 full width                                                                                                          | —                                                                       |
| Button action hierarchy       | Candidate Primary 使用 Accent；Secondary 使用 neutral raised surface＋subtle border；Ghost 只供 contextual tertiary action                                                                                                             | —                                                                       |
| Button icon-only boundary     | 新用法交給 `UiIconButton`；現行 `UiButton` compatibility branch 暫不在 review 標本中擴張或移除                                                                                                                                         | 後續 production adoption                                                |
| Icon Button target／glyph     | Candidate routine 為 36／32px、Primary transport 44px、glyph 固定 16 unit；Current 維持 32／44px hard floor；Emergency 48px 暫不映射                                                                                                   | —                                                                       |
| Icon Button context mapping   | Primitive 與 recipe 分責；toolbar／transport／artwork／stretch／title-bar 都由 parent 組合既有 size／shape／variant，不新增 context prop                                                                                               | —                                                                       |
| Icon Button pressed states    | Candidate Accent 使用 accent-active，Overlay 使用 theme-independent 55%／68%／78% scrim；Current 缺口維持可見                                                                                                                          | —                                                                       |
| Icon Button title-bar focus   | 36px target 位於 40px title bar 時由 parent 改用 inset focus offset；一般 surface 保留外擴 focus ring                                                                                                                                  | —                                                                       |
| Text Action role              | 現行元件仍為 native `button`，但 Candidate 視覺角色是可點擊文字；獨立動作用 `UiButton`，不以 button variant／size／full-width 擴張 primitive                                                                                           | —                                                                       |
| Text Action affordance        | Candidate Default 無底線，hover／focus-visible 顯示底線，pressed 沿用 hover，disabled 無底線並降至 50%；Current 主行為一致                                                                                                             | —                                                                       |
| Text Action overflow          | Candidate 沿用 `UiMarqueeText` 的 overflow-only marquee／title／reduced-motion ellipsis；production 預設相同，高列數 caller 可明確使用 `overflow="ellipsis"` 跳過逐列 observer／motion，不提供速度或動畫時機控制                       | —                                                                       |
| Text Action recipes           | Track row、section heading、table cell 的 geometry、z-index、navigation 與可用寬度由 parent 擁有，recipe 不轉成 primitive prop                                                                                                         | —                                                                       |
| Tabs usage boundary           | `UiTabs` 只服務相鄰且互斥的 tabpanels；global navigation 維持專用 `nav`，單選 filter／mode switch 留給未來 segmented control                                                                                                           | —                                                                       |
| Tabs Panel／Bar               | Panel 使用 neutral shell＋tonal tile；Bar 使用 flat surface＋2px indicator；兩者只改 presentation，不改 tab／tabpanel 語意                                                                                                             | —                                                                       |
| Tabs size／overflow           | Candidate 36／32px、Current 30px；Panel intrinsic、Bar available width；長項目單行 ellipsis，多項超出以 overlay horizontal Scroll Region 承接                                                                                          | —                                                                       |
| Tabs panel ownership          | 目前 caller 提供 panels、visibility、ids 與雙向 ARIA 關係；production adoption 前再決定是否提升為完整 compound API                                                                                                                     | F8 owner 確認後的 architecture gate                                     |
| Chip role boundary            | `UiChip` 是非互動 system-generated badge／label；filter、dismiss、action、navigation 與 selection 使用其他互動元件                                                                                                                     | —                                                                       |
| Chip size／overflow           | Candidate 24／20px、Current 約 21.5px；intrinsic、max 100%、必要長值由 parent 限寬 ellipsis，group 以 8px gap wrap                                                                                                                     | —                                                                       |
| Chip tone／gated              | 八個 tone 維持文字語意＋色彩輔助；`gated` Candidate 顯示「需確認」，不代表權限、付費、法律或安全判定                                                                                                                                   | —                                                                       |
| Chip custom overrides         | Candidate 優先 semantic tone；現行 `background`／`color` compatibility escape hatch 是否收斂需先稽核既有 surface／selected 用法                                                                                                        | production migration audit                                              |
| Status Icon naming／role      | 保留 `UiStatusIcon` 給純圖示狀態；可見文字 badge 用 `UiChip`，可互動內容用相符 native control                                                                                                                                          | —                                                                       |
| Status Icon size／tone        | Candidate 24／20px、Current 24px、glyph 固定 16 unit；`current` 用 Accent／Indigo，內容分類用 Neutral，Current 額外保留 `text`／`highlight`                                                                                            | —                                                                       |
| Status Icon ARIA／motion      | 獨立意義用 named image，重複文字用 decorative；parent 擁有 live region，spinning 只作用 glyph 並尊重 reduced motion                                                                                                                    | —                                                                       |
| Hint naming／role             | Production 保留 `UiHint` compatibility wrapper；跨 feature 使用只證明 reusable text role，是否保留 Vue primitive 待 utility／owner recipe 比較                                                                                         | Role checkpoint 已核准；component qualification 待 migration            |
| Hint typography／overflow     | Candidate／Current 皆為 14px caption；density 不改文字度量，Candidate 長識別字可 anywhere wrap，Current 保留 active truth                                                                                                              | —                                                                       |
| Hint layout／ARIA             | Parent 擁有 inset、alignment、empty-state placement 與 live region；`padded`／`center` 只作 Current compatibility，tone 不推導 role                                                                                                    | —                                                                       |
| Notice naming／ownership      | 保留 `UiNotice` 作 Inline notice；compound anatomy 支持 shared ownership，consumer count 只佐證需求；Field support、Hint、Modal、fixed host 分責                                                                                       | —                                                                       |
| Notice density／content       | Candidate Standard／Compact 為 12／8px inset 與 36／32px action；14px copy、16-unit glyph、窄幅 reflow 與 multilingual wrapping                                                                                                        | —                                                                       |
| Notice tone／ARIA             | Neutral default＋四個 semantic tones，色彩配合文案／glyph；Candidate announcement caller-owned，Current implicit status／alert 列為 migration audit                                                                                    | —                                                                       |
| Notice action hierarchy       | Candidate 使用 Secondary；>26rem 同列，≤26rem 移至正文下方靠 inline-end，缺席時不保留空列；Current Ghost／viewport query 保留作 active truth                                                                                           | —                                                                       |
| Fixed notification sizing     | Demo-only host 使用 20rem floor／22rem preferred／26rem max、inline 1rem viewport cap與bottom-end PlayerBar-aware offset；position／queue／dismissal／lifecycle 不進 `UiNotice` API                                                    | Candidate recipe 已核准；production adoption 待後續                     |
| Fixed notification lifecycle  | Host 明確管理 transient 6s pauseable timer、progress same-id replacement、persistent retention、32px Ghost close、touch／pen horizontal swipe與bounded enter／leave／move motion；tone 不推導 lifecycle                                | Candidate recipe 已核准；production adoption 待後續                     |
| Notice diagnostics boundary   | 沿用 bounded public error 與既有錯誤紀錄；單一 action 在立即復原與查看紀錄間擇一，不顯示 raw diagnostic context，也不宣稱上傳回報                                                                                                      | 實際產品整合留待 focused migration                                      |
| Text selection ownership      | Candidate 操作／狀態 chrome 明確不可選取；輸入、Readonly、Hint／Error、Inline Notice、診斷及流程結果句保持可選取；Current 保留 active truth                                                                                            | Candidate 補強已完成；production adoption 待後續                        |
| Progress naming／ownership    | 保留 `UiProgress` 作有標籤的原子進度指示器；結果、task controls、region busy、milestone announcement 與 lifecycle 都由流程 owner 負責                                                                                                  | —                                                                       |
| Progress size／content        | Candidate／Current 皆為 8px track；Candidate 使用 2px radius、自然換行 label 與 tabular value，寬度由 parent 擁有                                                                                                                      | —                                                                       |
| Progress state／motion        | Determinate 覆蓋 0／partial／complete／custom max；indeterminate 省略 value 並以 reduced-motion-safe 的 Info segment 表示                                                                                                              | —                                                                       |
| Progress ARIA                 | Native progress 擁有 name／value；Candidate 不自行設定 status／live／busy，Current indeterminate `aria-busy` 留作 compatibility audit                                                                                                  | —                                                                       |
| Marquee naming／ownership     | 保留 `UiMarqueeText` 作單行 overflow motion；量測／travel／reduced motion 歸 primitive，寬度／typography／interaction／announcement 歸 owner                                                                                           | —                                                                       |
| Marquee trigger／motion       | Candidate 以 11rem 預覽列明示觸發，fine-pointer hover／interactive owner focus 後 0.2s single reveal；1.8–5s 移至末端停留，離開重設、再次進入重播                                                                                      | —                                                                       |
| Marquee content／direction    | Overflow-only title、短字靜態、CJK／Latin／multilingual／unbroken／RTL bounded；靜止末端／移動雙側／完成起始側 fade 隨方向對調，Standard／Compact 只改 parent inset                                                                    | —                                                                       |
| Marquee selection／ARIA       | Standalone content 可選取；interactive chrome 由 owner select-none。元件不新增 tab stop、role、label 或 live region                                                                                                                    | —                                                                       |
| Track Thumb naming／ownership | 保留 `UiTrackThumb` 作單曲方形封面或 identity fallback；collection collage、metadata、row interaction 與 navigation 維持由專責 owner 承接                                                                                              | —                                                                       |
| Track Thumb size／crop        | Current 為 32／40／48／64px；Queue 已併入 Standard row 40px，48px 只屬 bottom-left PlayerBar；Candidate 為 dense 36、row 40、playback 48、preview 64px；size 由 caller／layout recipe 擁有，4px radius 與 center cover crop 一致       | —                                                                       |
| Track Thumb fallback／content | 四張同系列圖只作 Candidate 預設 fallback pool；custom → default → initial ladder、missing／failed／empty、長 CJK／Latin／多語／無斷點與兩種 crop source 均納入                                                                         | —                                                                       |
| Track Thumb ARIA／contract    | Decorative 預設維持 aria-hidden；Candidate non-decorative 補 image role、名稱由 caller 提供；attrs、styling props 與兩種 slots 保留 compatibility                                                                                      | —                                                                       |
| Collage Thumb ownership       | 保留集合 artwork resolver＋optional 2×2 collage；兩者只共用 internal track artwork content layer，TrackThumb public contract、row interaction、metadata 與 layout 不進 primitive                                                       | —                                                                       |
| Collage Thumb square crop     | 外部輸出固定 square；所有來源比例目前置中 cover crop、不拉伸／不留白。未來 focal／crop selector 屬獨立封面編輯流程，不預先新增 component prop                                                                                          | Candidate owner correction；編輯資料契約另案                            |
| Collage Thumb order／fallback | custom cover → ordered member representation；零首共用 no-identity、一首 full-size、二至四首 2×2 quiet vacant cells；重複 URL 不去重，member 缺圖／壞圖使用共用預設封面                                                                | Candidate 已核准；Sidebar projection 待 migration audit                 |
| Collage Thumb size／surface   | 40／88／120／136／280px 由 caller 指定，Sidebar 40px 與標準 Track Row 對齊；2×2 cell 由 grid 均分，empty glyph 限 16–32px；checkerboard 只改 neutral backing，不新增 density／responsive／size token                                   | —                                                                       |
| Collage Thumb ARIA／overlay   | Decorative 預設 aria-hidden；standalone caller 傳 image role＋名稱；overlay root 不自動建立 image role，control 自行擁有名稱、focus 與事件                                                                                             | —                                                                       |
| Track Row ownership／action   | Shared track identity layout；caller 擁有播放、選取、entity destination、status derivation、menu與流程，Candidate以sibling controls維持文字選取與整列action分責                                                                        | —                                                                       |
| Action Menu naming／ownership | Candidate提案`UiActionMenu`作trigger-neutral short-action compound；trigger、anchor與產品action歸caller，menu semantics、focus、collision與dismissal歸primitive                                                                        | —                                                                       |
| Action Menu size／keyboard    | 184／220／240px desired，actual受viewport 8px inset與20rem高度限制；item固定32px floor；完整roving、typeahead、submenu、RTL、內外scroll分責、Escape／Tab focus-return                                                                  | —                                                                       |
| Action Menu content／ARIA     | Candidate 僅有 optional icon／visible label／submenu chevron；只在既有欄位間留 gap，固定動作完整顯示，動態目的地僅在硬限制下 ellipsis；disabled 可聚焦但不可執行，root 需 accessible name                                              | Current 差距保留供 migration audit                                      |
| Modal naming／ownership       | 保留`UiModal`作中性protected overlay shell；primitive擁有top layer、scrim、幾何、zones、focus、dismissal與overflow，caller擁有內容、操作與size選擇                                                                                     | —                                                                       |
| Modal size／scroll            | Candidate Small 24／35rem、Medium 32／45rem、Large 48／50rem；Standard／Compact viewport inset 24／16px；fixed header／optional footer、body-only vertical scroll                                                                      | Current整面捲動差距留待migration audit                                  |
| Modal surface／composition    | 單一raised shell＋transparent zones；on-raised Field rest／hover／readonly aliases保持nested controls層級；內容case、Large兩欄與68ch measure皆為caller recipe                                                                          | —                                                                       |
| Modal focus／ARIA             | Native dialog top layer、visible-title`aria-labelledby`、authored autofocus／title fallback、controlled Escape／close、Tab boundary與focus return；scrim不丟棄draft                                                                    | Current非native top layer與背景未inert留待migration audit               |
| Scrollbar ownership           | 正式 `UiScrollRegion`；native viewport 擁有 wheel／keyboard／touch／scroll state，component 擁有 local chrome opt-out、overflow measurement、thumb projection／drag，caller 宣告 axis、visibility 並擁有內容與 feature scroll behavior | Header／Tabs／Toolbar／table heading 必須在 rail 範圍外                 |
| Scrollbar geometry／states    | 12px overlay hit lane／6px visual thumb／32–72px proportional length／4px edge inset；無 overflow 不顯示或預留，Standard／Compact 同尺寸，Neutral default／hover／drag active，transparent track，forced-colors 使用 system colors     | 全域 hidden 已移除；collapsed chrome opt-out 必須 feature-owned         |
| Candidate production adoption | 僅凍結被實際 slice 證明的 token／component subset，不做全專案機械替換                                                                                                                                                                  | 2026-09-30 controlled migration 已啟動；代表頁面通過後才 global cutover |

## 驗證與提交邊界

每個 phase 必須包含實際元件標本、Candidate／Current 真值、深色／淺色、
窄容器、keyboard focus、語意／ARIA、focused tests、完整 tests、lint、
format、build、candidate isolation 與 production bundle isolation。

提交分成兩類：

- active component fix：正式 token／元件／consumer 及其測試；
- development review checkpoint：F8 標本、Candidate mapping、檢查測試與文件。

不要把尚未 owner 核准的 Candidate 值混入 active component fix。
