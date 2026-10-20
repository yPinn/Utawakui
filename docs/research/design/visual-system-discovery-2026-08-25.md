# Visual System Discovery Brief

- **產品：** Utawakui
- **日期：** 2026-08-25
- **狀態：** Approved by owner — 2026-08-25
- **範圍：** Electron／Vue 控制台、演出操作體驗、Performer View、OBS Overlay

## 1. 文件角色

本文件整理視覺系統重建前的產品訪談與現況調查。它是有日期的 discovery
證據，不是目前 production UI 的實作規格，也不直接取代根目錄的
`DESIGN.md`。

核准後，穩定的設計規則才會寫入 `DESIGN.md`；涉及產品範圍或 runtime
boundary 的決策，則分別回寫 `docs/spec.md`、ADR 或 contract。本文件不作為
功能已實作的證明。

## 2. 重建目標

從產品情境重新建立 Utawakui 的視覺與互動基礎，依序完成：

1. 產品與操作情境定義。
2. 視覺方向比較與選擇。
3. Foundation：色彩、字體、間距、形狀、層級、動態與響應規則。
4. Primitive → semantic → component 三層 token。
5. 基礎共用元件與明確狀態。
6. 主控制台各功能區分階段遷移。
7. Performer View 與 Overlay 各自依責任建立呈現規則。

現有配色、視覺樣式與大量 component-local CSS 是功能先行時期的產物，可作為
行為和覆蓋範圍證據，不視為新系統必須延續的美術方向。

## 3. 已固定與可重新設計的邊界

### 3.1 本階段固定

- 產品名稱 `Utawakui`。
- 現有產品 icon／mark；本階段不重新設計，也不要求新配色呼應它。
- Electron／Vue 控制台與 `overlay/` 維持兩套獨立 CSS 與 token namespace。
- 控制台維持一致的跨平台 app shell；Windows 是目前主要交付平台。
- Sidebar 的主要資訊架構可保留，允許調整層級、尺寸與互動細節。
- 視覺方向持續以 macOS 與 Spotify 為共同參考軸，不另行提出與此定位無關的
  美術風格。
- 暗色為預設主題，至少同時提供亮色主題，並記住使用者選擇。
- 主題由產品提供，不開放任意自訂配色。
- 主控制台目標預設 bounds 為 `1440 × 810 DIP`，即外框 16:9。

### 3.2 可重新設計

- 品牌與功能配色。
- 中性色階、背景／surface／border／文字對比。
- 字體階層、字重與多語文字適配細節。
- 間距、控制密度、圓角、邊框、陰影與 elevation。
- 互動狀態、回饋節奏與 motion。
- 主工作區，尤其右側主要視覺與演出操作畫面。
- Light／dark 的具體色值與 component mapping。
- Overlay 的各 presentation pack 視覺；它不需要強制帶入品牌色。

## 4. 產品與使用者定位

Utawakui 是 local-first 的歌唱、錄製與串流工作流控制台。它不是一般音樂
播放器，也不是公開串流平台的替代品。

### 4.1 主要使用者

- 串流與錄製內容的創作者。
- 以唱歌內容為主要情境的操作者。
- VTuber 是重要的初期受眾，但 UI 不應只適用於 VTuber 身分。
- 未來可能與 OBS、VTube Studio、Twitch 或 YouTube 接合，但目前設計不得假設
  這些帳號或 adapter 一定存在。

### 4.2 工作方式

- 使用者多半先準備曲目、歌詞、音訊與 Output，再開始錄製或串流。
- 產品以準備品質、可控性與細顆粒設定優先，接受用較多準備時間換取成果品質。
- 演出當下仍需要非常清楚且快速的狀態回饋、恢復路徑與低誤操作風險。
- 使用者可只在本機排練或錄製，不一定進入公開串流狀態。

## 5. 期望的產品人格

控制台應呈現：

- **簡潔：** 首要功能容易找到，畫面不以裝飾競爭注意力。
- **直觀：** 分類、標籤和狀態接近操作者的工作語言。
- **專業：** 像可靠的製作工具，而非玩具或促銷型娛樂頁面。
- **沉著：** 正常工作狀態不製造警報感；真正錯誤才提高視覺強度。
- **精準：** 高風險或即時操作有清楚邊界、足夠間隔和明確結果。

macOS 與 Spotify 是後續所有視覺提案的共同參考軸，而非兩個互斥方案：

| 來源    | 主要借鑑                                                                          | 不直接複製                                                          |
| ------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| macOS   | 安靜的 app chrome、清楚的 surface 層級、接近原生工具的控制節奏、舒適而精準的間距  | macOS-only window controls、過量 translucency、無法跨平台理解的操作 |
| Spotify | 音樂資料密度、sidebar／collection 心智模型、可掃讀 track row、persistent playback | Spotify 品牌綠、逐像素版面、消費型音樂服務的推薦與促銷模式          |

合成原則是「macOS-like tool shell × Spotify-like music workspace」。後續方向可以
比較兩者的配比、surface 層級和密度，但不能偏離為無關的 dashboard、gaming、
cyberpunk 或高度裝飾性風格。

## 6. 操作密度與資訊層級

主控制台採中等偏密集的桌面工具密度，但不能用擁擠換取功能數量。

優先順序如下：

1. 當前 Session、演出階段、播放與公開 Output 狀態。
2. 即將發生的事件與可立即執行的主要操作。
3. 可恢復的錯誤、阻塞原因與安全動作。
4. 曲目、歌詞、音訊和 Output 的細節設定。
5. 診斷、依賴與低頻管理功能。

需要避免：

- 多個同等醒目的主要按鈕。
- 只靠顏色區分 Session、Gate、dependency 與 error。
- 即時操作和不可逆操作緊貼排列。
- 將所有細顆粒設定同時攤在主要演出畫面。
- 以大量 nested cards 取代真正的資訊階層。

## 7. Surface 責任分工

| Surface        | 主要責任                                     | 視覺優先                         | 不應承擔                            |
| -------------- | -------------------------------------------- | -------------------------------- | ----------------------------------- |
| 主控制台       | 準備、管理、設定、狀態與恢復                 | 操作者清晰度、效能、跨平台一致性 | 為 OBS 畫面犧牲操作可讀性           |
| 演出操作 View  | Session 期間的狀態、下一步與低風險快速操作   | 即時辨識、穩定幾何、降低誤觸     | 展開全部低頻設定                    |
| Performer View | 演唱者讀取歌詞、提示和必要狀態               | 遠距可讀、寬而淺、低干擾         | 成為第二個完整控制台                |
| OBS Overlay    | 對觀眾公開呈現曲目、歌詞、setlist 與 artwork | 呈現效果、透明合成與多種組合     | 直接使用控制台 token 或擁有產品狀態 |

控制台與 Overlay 可以共享產品語氣、狀態名稱和純 presentation projection，
但不共享 CSS token namespace。Overlay 的 template／appearance 需要容納不同節目
風格，因此品牌元素可弱化或完全不出現。

## 8. Live Session 模型

### 8.1 Session 權威

- Session 由使用者明確開始與結束。
- 未來 OBS／Twitch／YouTube adapter 可以偵測外部狀態並建議開始 Session。
- 外部偵測不得靜默建立、結束或改寫 Session。
- 本機使用、排練、錄製和串流都可建立 Session。

### 8.2 主要生命週期

```text
未開始 → 準備中 → 演出中 ⇄ 中場待機 → 結束／檢視
                         ↘ 暫停／異常處理 ↗
```

「暫停／異常處理」是事件與恢復狀態，不等同正常中場。Session 狀態也不應只由
audio element 的 play／pause 推導；播放仍由現有 player ownership 管理。

### 8.3 Session 記錄

Session 未來應能保存：

- 開始、結束與階段切換時間。
- 正式演出的歌曲順序與歷史。
- 中場、暫停、恢復與重要錯誤事件。
- 相對於錄製／串流起點的同步 anchor；若 adapter 可用，可另保存外部時間參考。
- 後續歌單整理、Session 匯出與剪輯定位需要的穩定資料。

Session export schema、平台對時方式與 clip 格式屬後續產品／資料設計，不在本輪
視覺系統內假定已實作。

### 8.4 待機與公開投影

- 中場可以播放待機音樂。
- 待機音樂只屬於操作者／播放面，不成為公開的 now-playing 曲目。
- OVL 保留上一首正式演出歌曲，直到下一首正式開始。
- 不應以「目前 audio element 播放的檔案」直接等同公開演出曲目。

### 8.5 緊急 Output 動作

「隱藏 OVL」是演出畫面的專用緊急動作：

- 必須能快速找到並立即得到結果回饋。
- 只抑制公開 Overlay rendering。
- 不停止播放、不清除 queue、不結束 Session。
- 不破壞錯誤診斷或恢復所需狀態。
- 隱藏後必須持續顯示目前公開狀態與明確的恢復入口。

## 9. Feature Gate UX

### 9.1 用詞

- `Feature Gate` 保留為內部架構名稱。
- 產品分類使用「本機核心／選用工作流程」。
- UI 狀態優先使用「需確認／已啟用」。
- 集中確認畫面使用「使用範圍確認」等中性、事實型描述。
- 不使用 premium、加值、合法、已授權或「系統替使用者判定權利」的暗示。

### 9.2 確認與 enforcement

- Provider、Lyrics、Audio processing、Public output 保持獨立 feature gate。
- 每個 feature 在 Settings 集中確認一次，依 `noticeVersion` 管理重新確認。
- 功能入口可以顯示 lock／需確認狀態並導回 Settings，但不在每個頁面重複確認。
- Main process 對每個 gated operation 重新檢查；renderer notice 不是 trust boundary。
- 封鎖最小的風險 action／block；安全的瀏覽、狀態、停止和恢復操作應保持可用。

### 9.3 視覺語意

下列狀態必須彼此不同，且不能只靠顏色：

- 尚未確認使用範圍。
- 已確認但 dependency 尚未就緒。
- 已就緒但目前未使用。
- 正在處理或公開輸出。
- 可恢復錯誤。
- 需要立即處理的演出錯誤。

## 10. Theme、平台與無障礙底線

### 10.1 Theme

- Dark-first，但 dark 與 light 都必須在 foundation 階段完成 semantic mapping。
- 記住使用者偏好；初始 frame 不應先閃爍錯誤主題。
- Theme 交換以 semantic token 為主，不在 component 內散落 raw color。
- Session、Gate、Output 與 error state 不綁死單一品牌色。

### 10.2 跨平台

- Windows 是目前主要驗證平台。
- 設計不得依賴 Windows-only 的視覺慣例才能理解。
- 未來 macOS／Linux 支援以一致 app shell 為主，只在必要的 window chrome、快捷鍵
  或 OS integration 上調整。
- 控制台優先使用系統字體與低成本效果；Overlay 可為呈現需求採用自己的字體資產。

### 10.3 無障礙

- 一般文字與互動狀態以 WCAG AA 對比為最低目標。
- 保留可見 keyboard focus，不以 hover 作為唯一入口。
- 動態需支援 reduced motion；狀態變化不依賴動畫才可理解。
- 顏色之外需搭配文字、icon、形狀或位置語意。
- 日文、韓文、繁體中文與英文 metadata 必須進行文字適配驗證。
- `rem` 用於可縮放的文字與主要尺寸；1px border、media query 與 Electron API
  literal 可保留 `px`。

## 11. Viewport 與響應基準

尺寸以 Electron DIP／CSS pixel 理解，不等同顯示器實體像素。

| 等級     | Bounds／viewport   | 用途                                             |
| -------- | ------------------ | ------------------------------------------------ |
| 最小支援 | `960 × 650`        | 確保核心操作可完成，不保證同時展開所有輔助 panel |
| 預設目標 | `1440 × 810`       | 主控制台外框 16:9，作為主要設計基準              |
| 寬版驗證 | `1600 × 900`       | 驗證寬主工作區、演出 View 與多欄資訊             |
| 大型驗證 | `1920 × 1080` 以上 | 驗證空間分配，不允許元件無限制放大               |

視窗規則：

- `1440 × 810` 是外框 target；扣除 38px titlebar 後，不強迫內容區保持 16:9。
- 初次開啟需將 target bounds 限制在目前 display work area 內。
- 保存並恢復使用者調整後的有效 bounds；螢幕移除或縮放改變時重新 fit。
- `1600 × 900` 是寬版驗證值，不是所有 FHD 實體螢幕的固定預設。
- 現有 `900px`／`680px` breakpoint 可作遷移證據，但需在新 layout prototype 中
  重新驗證，不直接視為最終 token。
- Responsive behavior 以 reflow、收合與優先順序完成，不靠縮小所有文字。

Performer View 與 OVL 使用自己的尺寸 contract。OBS Output 的 1920 × 1080 reference
canvas 和 widget tier 不應反過來決定主控制台視窗尺寸。

## 12. Design Token 交接條件

新系統採三層 token，控制台與 Overlay 分開建立：

```text
Primitive：原始色階、space、type、radius、shadow、duration
    ↓
Semantic：surface、text、action、focus、session、output、gate、status
    ↓
Component：button、input、row、sidebar、player、dialog、notice 等
```

規則：

- Light／dark 主要覆寫 semantic mapping，不複製整套 component CSS。
- Component token 只在共用元件確實需要穩定契約時建立，不為每個局部值造 token。
- Semantic 名稱描述用途，不描述當下色值，例如 `status-critical` 而非 `red-strong`。
- Session、Output visibility、Gate consent、dependency readiness 和 error 必須有不同
  semantic contract。
- Overlay 使用 `--ovl-*` 或其後續 namespace；控制台使用 `--ui-*` 或經核准的新
  namespace，兩者不交叉引用。
- 後續 migration 先建立 mapping 和基礎元件，不進行全專案機械式一次替換。

## 13. 本輪非目標

- 不選定最終配色、字體、圓角或 shadow。
- 不重新設計產品 icon。
- 不修改 production CSS 或 Vue component。
- 不合併控制台與 Overlay token。
- 不在視覺工作中順便實作 OBS／Twitch／YouTube／VTube Studio adapter。
- 不先假定 Session、export 或時間同步的資料結構已完成。
- 不以目前 provisional UI 當成必須微調保留的視覺基準。

## 14. 核准後的工作順序

1. 在 macOS-like tool shell × Spotify-like music workspace 的共同軸線內，提出
   2–3 個視覺方向；比較兩者配比、層級、密度和跨主題能力。
2. 選定方向並建立 dark／light foundation，不先做完整頁面。
3. 定義 primitive、semantic 與必要的 component tokens。
4. 建立／修正基礎共用元件及其狀態矩陣。
5. 先用一個代表性的控制台 workspace 驗證 layout、theme 與 live-state hierarchy。
6. 分階段遷移其他控制台功能，保留 playback／state ownership。
7. 另行建立 Performer View 與 Overlay 的 presentation foundation。
8. 經鍵盤、對比、縮放、視窗尺寸、Electron 與 OBS 可視驗收後完成遷移。

## 15. Owner 核准檢查

請確認本 Brief 是否正確表達：

- 產品以串流／錄製的歌唱工作流與 VTuber 重要受眾為主，但不綁定單一身分。
- 控制台追求簡潔、直觀、專業、沉著與精準。
- 所有視覺方向都維持 macOS 與 Spotify 參考軸，但不直接複製其品牌皮膚。
- 名稱和產品 icon 固定，其餘視覺 foundation 可重做。
- 控制台與 Overlay 共享原則但不共享 CSS token。
- Session 明確開始；待機音樂不公開，OVL 保留上一首正式歌曲。
- 緊急「隱藏 OVL」不停止播放或結束 Session。
- Feature Gate 集中在 Settings 逐 feature 確認，並封鎖最小風險邊界。
- Dark-first、提供 light、官方主題、跨平台一致 app shell。
- 主控制台使用 `1440 × 810 DIP` 外框作為 16:9 預設目標。
- 核准本 Brief 不等於核准任何色票或視覺方向。
