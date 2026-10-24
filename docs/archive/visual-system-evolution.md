# 視覺系統選型與遷移沿革

本文件收斂 2026-08-25／28 的需求訪談、方向比較、視覺 foundation 與元件 foundation。保留選型理由、參考及當時的候選量測；退役的 prototype 指令、舊元件數量與「尚未 production adoption」待辦已由後續遷移取代。現行規則由 [DESIGN](../../DESIGN.md)、[元件檢查契約](../contracts/token-v2-component-review.md)及[架構圖](../architecture.md)持有；完成順序見[Token 替換紀錄](token-v2-replacement.md)。

## 文件來源與取代關係

原始四份 Markdown 可從基準 `73715795` 依下列路徑取得（`git show <commit>:<path>`）。這些是歷史依據，不再作為目前 CSS、版型或工作順序的指令。

| 原始文件                                                      | 收斂內容                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------------------- |
| `docs/research/design/visual-system-discovery-2026-08-25.md`  | 操作情境、固定 shell 責任、產品邊界與驗收需求                       |
| `docs/research/design/visual-direction-options-2026-08-25.md` | A／B／C 比較及 08-28 選定 B 的原因                                  |
| `docs/research/design/visual-system-foundation-2026-08-28.md` | Clear Pastel、Architectural Slate、Folder 材質與 Controlled Dossier |
| `docs/research/design/ui-component-foundation-2026-08-28.md`  | Primitive／compound／feature 責任及先元件、後 View 的驗收界線       |

## 需求與 Surface 責任

最初重建以事前準備、品質及細顆粒控制為主，同時補強演出中的即時辨識。目標人格為安靜、精準、可信賴的音樂工作區；提升同屏資訊量時，仍須保留錯誤恢復、鍵盤焦點與演出動作的穩定幾何。既有功能行為是回歸依據，舊配色和 component-local CSS 並非必須延續的美術。

- Sidebar 保持播放清單／導覽責任，底部 PlayerBar 保持持續播放控制；Folder 填滿主工作區。頁面自己的標題、搜尋與主要操作屬於 Folder 內容。
- 主控制台負責準備與操作；演出工作區強調目前狀態、下一事件和低風險動作；Performer 著重遠距閱讀；OBS Overlay 擁有獨立公開呈現及 tokens。
- Session、Gate、dependency 與 operational error 分開表達；狀態須有文字、形狀或圖示，顏色不單獨承擔語意。
- 深／淺主題、視窗縮小、缺字與多語內容、鍵盤、reduced motion 均是驗收條件。當時的未來 Session／Output 構想不構成功能已交付或新增產品範圍的授權。

## 三方向比較與選定

A Quiet Native 強調低疲勞與 settings／modal 克制，風險是壓低 live state；B Studio Library 平衡準備品質、曲庫掃讀與演出狀態；C Music Operations 強調高資訊密度，風險是誤觸、視覺疲勞與接近現成播放器皮膚。

以下保留當時方向適配度評分；5 是需求符合度，不是完成度或實機品質量測。

| 評估面向           | A Quiet Native | B Studio Library | C Music Operations |
| ------------------ | -------------: | ---------------: | -----------------: |
| 準備與設定清晰度   |              5 |                5 |                  3 |
| Live 狀態辨識      |              4 |                5 |                  5 |
| 同屏資訊容量       |              3 |                4 |                  5 |
| 降低誤操作         |              5 |                5 |                  3 |
| Dark／light 對等   |              5 |                5 |                  3 |
| 跨平台一致性       |              4 |                5 |                  4 |
| 延續音樂工作區心智 |              3 |                5 |                  5 |
| 漸進式遷移適合度   |              4 |                5 |                  4 |

2026-08-28 選定 B — Studio Library，參考配比為 macOS 55／Spotify 45。吸收 A 的低疲勞 surface、克制 settings／modal 與自然 light theme；吸收 C 對 upcoming event、queue 和 Output visibility 的辨識強度。沒有採用 A 的過度安靜層級或 C 的全面高密度。

## 色彩與材質選擇

下列保留原 foundation 的選型與候選數值，包含數學對比檢查的限制。候選色號、幾何與尚待驗證的說法均屬當時快照；目前 token 值與已採用狀態查 DESIGN 及正式來源。

### Status Color Direction

Use a restrained **Clear Pastel** posture derived from Zebra Mildliner color
families. The reference is inspirational rather than a claim that these are
official Zebra digital values.

The owner selected Clear Pastel over the softer baseline because its semantic
colors are easier to distinguish while retaining a light, marker-like character.
Color changes must not implicitly change indicator geometry, glow, coverage, or
component styling.

The conventional semantic baseline uses five hue families and six roles:

| Hue family | Semantic role | Product interpretation                                                       |
| ---------- | ------------- | ---------------------------------------------------------------------------- |
| Gray       | Neutral       | Idle, stopped, inactive, or not started.                                     |
| Blue       | Information   | Informational state, preparation, loading, or progress.                      |
| Green      | Success       | Ready, healthy, available, or completed.                                     |
| Amber      | Warning       | Attention or recoverable action required.                                    |
| Red        | Live          | Explicit public／performance state with persistent text or icon.             |
| Red        | Danger        | Failure, emergency, or destructive action with distinct component treatment. |

Confirmation and Feature Gate do not receive a unique purple status family.
Normal confirmation uses the future theme accent; warning is used only when the
user must address a blocking or degraded condition. Output maps its actual state
to the semantic roles rather than owning a permanent color.

### Candidate Signal Values

These values reproduce the approved comparison image. They are candidates for
the eventual primitive palette, not accepted production tokens. Final mapping
requires representative in-app screenshots, dark／light contrast verification,
color-vision simulation, and checks that labels, icons, placement, or shape carry
the same meaning without color.

| Role        | Dark candidate | Light candidate |
| ----------- | -------------- | --------------- |
| Neutral     | `#B2B8BF`      | `#BEC5CC`       |
| Information | `#7EC9ED`      | `#86D7FD`       |
| Success     | `#95CF96`      | `#9FDDA0`       |
| Warning     | `#EBC669`      | `#F7D37B`       |
| Live        | `#F79494`      | `#FFA9A8`       |
| Danger      | `#F79494`      | `#FFA9A8`       |

Comparison artifact:
[Soft Mildliner／Clear Pastel comparison](../research/design/mildliner-status-colorize-comparison.png).

### Remaining Color Work

#### Composition And Folder Material Direction

The owner selected a `60／30／10` visual-weight reference and identified
[Mosby's Files](https://www.awwwards.com/sites/mosbys-files) as the source of the
current folder-tab concept. Apply the ratio across a representative screen, not
inside every component:

- **60% neutral system structure:** canvas, chrome, ordinary surfaces, text, and
  negative space.
- **30% folder material layer:** collection, playlist, import-group, lyrics-source,
  or archive-like object surfaces.
- **10% primary accent:** selected tabs, primary actions, focus, and current-item
  cues.

Folder materials may use a small fixed palette, but they are not additional
interactive accents and must not reuse Clear Pastel status colors as decoration.
Translate Mosby's high-chroma stacked folders into restrained indigo, plum, and
olive material families; reserve red and amber for Live／Danger and Warning.

#### Architectural Slate Direction

The owner selected **Architectural Slate** from the dark-first comparison. Its
relationship is adapted from Color Lisa's
[Rhythm of a Russian Dance](https://colorlisa.com/) palette for Theo van
Doesburg: `#BD748F`, `#3D578E`, `#BFAB68`, `#DAD7D0`, and `#272928`.

This selection approves the relationship, not a direct copy of every source
swatch into production:

- Graphite owns application canvas, chrome, and neutral surfaces.
- Light indigo `#8296D0` is the one interactive accent candidate.
- Deeper indigo `#3D578E` is the primary folder material and is not another
  action accent.
- Plum `#694D64` and olive `#69634E` are subordinate folder materials only.
- Warm neutral `#DAD7D0` is paper or document material, not the global dark-theme
  foreground.
- Clear Pastel remains the only semantic status palette.

The current dark semantic candidates are:

| Role              | Candidate | Intended use                                            |
| ----------------- | --------- | ------------------------------------------------------- |
| Canvas            | `#191A1E` | Window background and deepest workspace plane.          |
| Surface           | `#272928` | Sidebar, stable panels, and ordinary containers.        |
| Raised surface    | `#2D2F35` | Menus, popovers, and floating controls.                 |
| Hover surface     | `#3C3E46` | Neutral pointer hover.                                  |
| Active surface    | `#50535B` | Neutral pressed or active state.                        |
| Selected soft     | `#293A5B` | Indigo-tinted selection without a filled accent action. |
| Foreground        | `#F3F1EC` | Primary text and icons.                                 |
| Muted foreground  | `#A7A9AF` | Secondary text with body-text contrast.                 |
| Decorative border | `#3C3E46` | Low-pressure grouping and separators.                   |
| Control boundary  | `#70737B` | Boundaries that must reach 3:1 against `Surface`.       |
| Accent            | `#8296D0` | Primary action, focus anchor, and selected emphasis.    |
| Accent hover      | `#A5B3D8` | Hover for accent-filled controls.                       |
| Accent contrast   | `#191A1E` | Text and icons on the accent fill.                      |

The light theme remaps the same primitives instead of inverting the dark theme:

| Role              | Candidate | Intended use                                          |
| ----------------- | --------- | ----------------------------------------------------- |
| Canvas            | `#E8E4DD` | Warm outer workspace plane.                           |
| Surface           | `#F3F1EC` | Sidebar, stable panels, and ordinary containers.      |
| Raised surface    | `#FBFAF7` | Menus, popovers, and floating controls.               |
| Hover surface     | `#E2E2E4` | Neutral pointer hover.                                |
| Active surface    | `#C7C8CC` | Neutral pressed or active state.                      |
| Selected soft     | `#E0E5F3` | Pale indigo selection without a filled accent action. |
| Foreground        | `#272928` | Primary text and icons.                               |
| Muted foreground  | `#50535B` | Secondary text with body-text contrast.               |
| Decorative border | `#C7C8CC` | Low-pressure grouping and separators.                 |
| Control boundary  | `#85888F` | Boundaries that must reach 3:1 against `Surface`.     |
| Accent            | `#3D578E` | Primary action, focus anchor, and selected emphasis.  |
| Accent hover      | `#334873` | Hover for accent-filled controls.                     |
| Accent contrast   | `#F3F1EC` | Text and icons on the accent fill.                    |

Light folder materials use `#A5B3D8`, `#E3BCCF`, and `#DED39F`; paper uses
`#FBFAF7`. This retains the folder relationship without carrying the dark
theme's visual weight into a light workspace.

Each theme also exposes its matching native control scheme through the semantic
`--ui-color-scheme` token (`dark` or `light`). The prototype applies that token
to the document root so scrollbars, form controls, and other Chromium-owned
surfaces do not retain dark chrome in the official light theme.

Initial contrast checks pass the intended WCAG thresholds:

| Pair                      | Dark      | Light     | Threshold            |
| ------------------------- | --------- | --------- | -------------------- |
| Foreground／Canvas        | `15.40:1` | `11.56:1` | AA body text         |
| Muted foreground／Surface | `6.23:1`  | `6.82:1`  | AA body text         |
| Accent／Surface           | `5.04:1`  | `6.30:1`  | AA body text         |
| Accent contrast／Accent   | `5.98:1`  | `6.30:1`  | AA body text         |
| Status contrast／fill min | `7.96:1`  | `8.01:1`  | AA body text         |
| Control boundary／Surface | `3.09:1`  | `3.14:1`  | Non-text UI boundary |

These are mathematical pair checks, not complete accessibility acceptance.
Representative component states, opacity, adjacent colors, color-vision
simulation, and real Electron rendering still require validation.

Clear Pastel light values are intentionally pale. They must not be used as
standalone colored body text or a fine icon on a light surface. Use a bounded
indicator or fill with `status-contrast`, a contrasting outline, a stable label
or icon, and consistent placement. Color remains supportive rather than the only
carrier of meaning.

Folder component tokens should reference semantic material roles rather than raw
palette colors:

- `folder-primary` → deep indigo;
- `folder-secondary` → plum;
- `folder-tertiary` → olive;
- `folder-paper` → warm neutral paper;
- selected, focused, and actionable states remain separate accent／focus roles.

Do not use folder variants to communicate status, feature level, ownership,
legality, or readiness. Product-category assignment remains undecided until the
information architecture and representative components are reviewed.

Review artifact:
[Architectural Slate dark token map](../research/design/architectural-slate-dark-token-map.png).

Theme-pair artifact:
[Architectural Slate dark／light comparison](../research/design/architectural-slate-theme-pair.png).
The comparison preserves the implemented shell grid: full-width title bar,
playlist／navigation sidebar beside the main workspace, and a full-width
persistent player bar below both columns. It is a palette and styling study, not
a shell-layout proposal.

## Folder 構圖與材質

The owner selected **Controlled Dossier／受控檔案冊** as the folder-interior
direction after reviewing Mosby's Files' I. M. Pei case page. It carries the
reference's archive character into an operational product surface without
copying its editorial collage behavior.

The stable anatomy is:

1. Integrated folder tabs define the active workspace category.
2. The folder frame fills the primary workspace column rather than sitting inside
   another page card. An optional shell-level Context Inspector may sit beside it.
3. A bounded internal header owns the page title, readiness／visibility context,
   and primary actions.
4. A paper plane owns the structured list, table, editor, or grid appropriate to
   the active category.
5. Stable contextual facts belong to the optional Context Inspector, not a fixed
   column inside every dossier page.
6. Note and preview modules stay in normal document flow and communicate real
   information; they do not overlap controls or become decoration.

Use medium physicality: tabs, shallow layers, material color, and a restrained
paper boundary are enough. Do not use random rotation, scrapbook overlap,
physical props, large yellow fields, or decorative right-edge navigation in the
control panel. Repeated music rows keep Spotify-like scan efficiency even when
their parent collection uses the dossier metaphor.

Theme behavior is semantic rather than literal inversion. The light theme can use
the warm-white paper candidate as the full content plane. The dark theme uses a
neutral dark dossier plane and reserves warm paper for smaller document-like
modules; a large bright sheet would undermine low-light live operation.

Folder colors remain object material. Selection, focus, status, and actions keep
their independent semantic roles, so changing a folder hue cannot silently change
interaction meaning.

### 當時核定的材質與幾何

The reviewed anatomy is accepted with a lighter material perimeter. This is a
scale correction, not a new folder direction:

- Keep the dark folder perimeter at approximately `0.1875rem` to `0.25rem`
  (`3px` to `4px` at the default root) rather than the `8px` comparison band.
  Other persistent boundaries use the future one-pixel hairline token.
- Keep the light perimeter and shadow approximately 10% to 15% quieter than the
  comparison. Light paper remains a local document material, not the application
  canvas.
- Inactive tabs retain material identity but reduce their visible color weight;
  selection, focus, status, and action emphasis remain separate.
- The Context Inspector is conditional and contains stable contextual facts only.
  The current wide Candidate reserves a `17.5rem` context bay before expansion;
  its Inspector opens at that width and can be reduced to `14rem` inside the bay.
  The collapsed desktop rail is approximately `2.5rem` and remains pinned to the
  shell's right edge as the explicit expand control. The whole rail uses the shared
  icon-button hover／pressed／focus contract; there is no smaller nested hit target.
  The reserved remainder deliberately stays quiet between the dossier and the
  right-edge rail when collapsed, so opening the Inspector does not reflow the
  dossier. Its resize axis can also be double-clicked to toggle between the
  collapsed rail and the last expanded width.
- Transient Session／Output readiness stays in the bounded header instead of the
  Inspector. The Inspector owns a separate scroll region above PlayerBar, preserves
  its session open state across page changes, and never opens automatically because
  a collection changed.
- When the active workspace provides this context plane, the current-song artwork
  in PlayerBar and the Inspector's own header／rail icon are symmetric toggle
  affordances over the same session state. Either entry point expands or collapses
  the Inspector; pages without a context consumer keep PlayerBar artwork decorative
  instead of exposing a dead control.
- At the `960 × 650` target the Inspector becomes a temporary right-side panel when
  explicitly open; when closed its full-height edge rail overlays the context edge
  without reserving a persistent metadata column. Both states use the shell main's
  `0.75rem` top／bottom inset. The shell main and Inspector currently enter that
  projection at the same authored `70rem` breakpoint. A behavior contract keeps
  both literals synchronized; do not disguise the media condition as a CSS token
  that cannot be consumed there.
- Use one neutral in-flow note module with a hairline boundary and restrained
  material tint. Folder plum／olive must not become competing information or
  warning fills; real warning content uses the semantic warning family.
- Dark examples use the dark Clear Pastel candidates. The current comparison's
  light-theme status dots are reference-artifact drift, not a token decision.

## 元件責任與驗收順序

早期 UI foundation 將 responsibility 分為 foundation、atomic primitive、compound pattern、feature composition。共用元件只擁有原生互動、可及性、幾何或穩定的組合契約；產品資料、播放、頁面模式與 persistence 由 feature owner 持有。重複出現兩次的布局不自動升為 primitive，token scope 也不是複製元件的理由。

Field shell 協調 label、hint、invalid／error 與 native control，而不接入資料 schema；Tabs／menu／modal 各自只擁有已宣告的 keyboard 與 focus 邊界。Context Inspector 的擴縮、scroll 與窄版幾何屬 shell，內容欄位及來源狀態由 feature 組合；早期 Context block 提案沒有凍結通用 metadata schema。這些界線後續已由 DESIGN 與元件契約具體化，本文件不維護另一份 props、字級、尺寸或 active adoption 清單。

## 階段驗收與遷移

最初先準備 dark／light、1440×810 與 960×650 的代表性 workspace，再審 foundation 與元件。2026-09-07 owner 插入 F8 的逐項 Foundation／component review，之後才回到 F7 View；prototype 存在或自動測試通過不等於可見接受。

早期 `tokens-v2.css`、與 active token 並存、Setlist Current／Studio Library Candidate、暫存 local reorder 及比較決策板，都服務當時隔離驗證。production-wide 替換完成後，正式 entry 只保留 `src/styles/tokens.css`，已採用的 page candidate／決策板也已移除。當時的「下一步 Select」「不可遷移 production」「建立平行 token entry」不再是現行待辦；完整 phase、失敗與刪除條件保留於 Token 替換紀錄。

現行 catalogue 保留元件回歸與尚未採用的單一標本。新的 View 或 shared API 仍須以實際 consumer 與各自的可見驗收決定；此歷史不授權復活已移除的 shell、Current 快照或候選資料流。

## 歷史參考圖

原比較圖保留，不作為目前畫面或全狀態可及性已通過的證明：

- [Controlled Dossier dark／light folder interior](../research/design/architectural-slate-folder-interior.png)。
