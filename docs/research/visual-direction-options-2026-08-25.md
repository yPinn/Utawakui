# Visual Direction Options

- **產品：** Utawakui
- **日期：** 2026-08-25
- **狀態：** Draft — owner selection
- **依據：** Approved Visual System Discovery Brief
- **範圍：** Electron／Vue 主控制台與演出操作 View

## 1. 文件角色

本文件比較 Utawakui 主控制台的三種視覺配比。三者都位於已核准的
「macOS-like tool shell × Spotify-like music workspace」軸線內，不是三種互不
相關的美術風格。

本階段只選擇方向，不核准精確色值、token 或 production CSS。Performer View 與
OBS Overlay 會在控制台 foundation 選定後另行建立呈現方向，不直接套用本文件的
surface 系統。

## 2. 共同底線

三個方向都必須符合：

- Dark-first，同時能建立完整 light theme。
- 系統 UI 字體優先，支援日文、韓文、繁體中文與英文。
- Sidebar、collection、track list 和 persistent player 保留音樂工作區心智模型。
- App chrome 安靜、跨平台可理解，不模仿 macOS-only window controls。
- 不使用 Spotify 綠或 Apple system blue 作為預設品牌答案。
- 不以 glass、gradient、shadow 或 nested cards 製造無必要層級。
- Session、Output、Gate、dependency 和 error 具有不同 semantic state。
- Focus、selection、playing、disabled、processing 和 error 不只靠顏色區分。
- Motion 低成本、短促並支援 reduced motion。
- `1440 × 810 DIP` 是主要比較畫布，`960 × 650` 仍需完成核心操作。

現有 `DESIGN.md` 內的 graphite／teal／paper／coral、cat-card、folder metaphor 與
Color Lisa 參考都仍是 provisional scaffold。除固定產品 icon 外，這些元素需在方向
選定後重新判斷，不自動帶入 foundation。

## 3. Direction A — Quiet Native

**配比：** macOS 70／Spotify 30

### A 核心感受

安靜、克制、接近原生桌面工具。使用者先感受到清楚的視窗與內容層級，再感受到
它是一個音樂工作區。

### A 視覺語言

- App chrome、sidebar 和內容區使用低對比但可辨識的三層 surface。
- 主要依靠 divider、留白和字重建立分區，shadow 極少。
- 圓角偏小至中等；控制外形規整，不大量使用 pill。
- 選取、focus 和主要動作只使用一個低飽和 accent family。
- Light theme 具有非常自然的紙面／原生工具感；dark theme 保持柔和，不使用純黑。

### A 密度與元件節奏

- Track row：舒適，約 52–56px 的視覺節奏。
- 一般控制：34–36px；危險或主要 live action 保留更大分隔區。
- Page spacing 較多，設定與 preparation workflow 特別清楚。
- Player 維持 persistent，但在整體層級中較安靜。

### A 演出操作

- 使用窄而固定的 Session status strip 呈現「準備／演出／待機／異常」。
- 下一步操作明確，但不讓 live dashboard 變成高彩度監控台。
- 「隱藏 OVL」以獨立位置與明確 label 呈現，不靠巨大紅色區塊。

### A 優勢

- 最符合簡潔、沉著和跨明暗主題需求。
- 長時間準備與設定的視覺疲勞最低。
- 對非直播、本機排練和一般錄製使用者最友善。

### A 風險

- 音樂產品辨識度較弱。
- 若對比過度克制，live state 與 selectable row 可能不夠醒目。
- 內容很多時，舒適 row height 會降低同屏資訊量。

## 4. Direction B — Studio Library

**配比：** macOS 55／Spotify 45

### B 核心感受

安靜的製作工具外框中，放入清楚、快速掃描的音樂資料工作區。Preparation 與
live operation 共享一套 shell，但在演出 View 提高狀態層級。

### B 視覺語言

- Titlebar、sidebar、modal、popover 和 setting surface 偏 macOS 式克制。
- Library、playlist、queue、track row 與 player 偏 Spotify 式掃讀與連續操作。
- Surface 以兩個主要層級加一個 raised／floating 層級為主，避免卡片套卡片。
- 中等圓角、清楚 border；shadow 只用於真正浮動的 menu／dialog。
- 一個產品 accent family 負責 focus、selection 和 primary action，但 active session、
  Output visibility、warning 與 danger 各自保有 semantic mapping。

### B 密度與元件節奏

- Track row：平衡，約 48–52px 的視覺節奏。
- 一般控制：32–36px；主要 live action 具有 40–44px 的明確目標。
- Sidebar 保持快速切換，主內容使用穩定欄位和 contextual inspector。
- Persistent player 是全域 anchor，但不遮蔽 Session status。

### B 演出操作

- 專用演出 View 以「目前狀態／下一事件／快速操作」形成明確三段層級。
- 中場待機顯示 private playback 與 public last-performed song 的差異。
- OVL visibility 始終可見；隱藏後保留恢復按鈕與原因／狀態。
- 錯誤使用固定幾何區域，避免臨時訊息推動主要控制位置。

### B 優勢

- Preparation、library management 與 live operation 的平衡最好。
- 延續現有 Spotify／macOS 心智模型，同時能建立 Utawakui 自己的 semantic states。
- Dark／light、Windows／未來 macOS／Linux 都容易維持一致。
- 適合先建立 shared primitives，再逐區遷移現有頁面。

### B 風險

- 需要嚴格控制 surface 和 component token，否則容易回到一般 dashboard。
- 若 accent 使用過多，仍可能變成 Spotify-like skin，而非專業控制台。
- 演出 View 必須額外定義 hierarchy，不能只靠同一套 library layout。

## 5. Direction C — Music Operations

**配比：** macOS 35／Spotify 65

### C 核心感受

以音樂內容與即時操作為主，chrome 退到背景。畫面強調曲目、queue、播放、下一步
與快速狀態辨識，較接近高效率 music operations workspace。

### C 視覺語言

- 深色 surface 對比較強，selected／playing row 更明顯。
- Sidebar、library、queue 和 player 的連續性高，內容比 panel 外框更突出。
- 圓角偏小；大量 row／table 使用對齊、hover 和 selection，而非獨立卡片。
- Accent 使用範圍較 Direction A／B 大，但仍不採 Spotify 綠。
- Light theme 需另行抑制 contrast 和 selection 強度，不能只反轉 dark theme。

### C 密度與元件節奏

- Track row：偏密集，約 44–48px 的視覺節奏。
- 一般控制：30–34px；高風險 live action 仍不得縮小或緊貼。
- 同屏資訊量最高，queue、history 和 upcoming events 可以同時被看見。
- Player 和 Session status 的視覺存在感較強。

### C 演出操作

- 演出 View 接近 operations board，強調 currently performing、next、standby 與
  Output state。
- 即將發生事件和可立即動作比 preparation context 更醒目。
- 適合未來 Twitch request、OBS／stream sync 與背景載入狀態，但不預先顯示尚未
  實作的 integration UI。

### C 優勢

- 對熟練使用者、長 queue 和即時演出最有效率。
- 音樂產品辨識最直接。
- 未來加入 live adapter 狀態時有較高資訊容量。

### C 風險

- 最容易增加誤操作、視覺疲勞和 status competition。
- Light theme 與小尺寸視窗的難度最高。
- 對以準備品質為主、非長時間 live use 的核心工作方式可能過度密集。
- 容易過度接近 Spotify，而削弱專業製作工具的獨立人格。

## 6. 比較

評分為方向適配度，不是完成度；5 代表最符合本輪需求。

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

## 7. 建議

建議選擇 **Direction B — Studio Library** 作為 foundation 主方向。

理由：Utawakui 目前仍以事前準備、品質和細顆粒控制為主，但正在補強 live
feedback。Direction B 能讓準備工作保持 macOS-like 的安靜與清楚，同時讓 library、
queue、player 與演出 View 使用 Spotify-like 的掃讀效率。它也最容易讓 Session、
Gate、Output 和 error 透過 semantic tokens 分開，而不把整個介面變成監控台。

可從其他方向吸收的部分：

- 從 A 保留 modal／settings 的克制、light theme 與低疲勞 surface。
- 從 C 保留演出 View 的 upcoming event、queue 和 Output visibility 強度。
- 不吸收 C 的全面高密度，也不讓 A 的 quiet hierarchy 壓低重要 live state。

## 8. 選定後的第一個驗證物

方向選定後先建立一個 `1440 × 810` 的演出操作 workspace 規格／prototype，至少
同時驗證：

- Dark 與 light theme。
- 準備中、演出中、中場待機與暫停／異常。
- Private standby playback 與 public last-performed song。
- OVL visible、hidden 與恢復入口。
- Feature Gate 需確認、dependency 未就緒與真正 error。
- Sidebar、persistent player、queue／next event 和 contextual inspector。
- `960 × 650` reflow 及 keyboard focus order。

通過此代表性 workspace 後，才建立完整 foundation、token 和 shared primitive
規格；不先把 provisional 色票批次替換到全專案。

## 9. Owner 選擇

請選擇：

- **A — Quiet Native：** 更安靜、舒適、偏 macOS。
- **B — Studio Library：** 準備與 live 最平衡；目前建議。
- **C — Music Operations：** 更密集、即時、偏 Spotify。
- 或指定 A／B／C 的混合比例與必須保留的特徵。
