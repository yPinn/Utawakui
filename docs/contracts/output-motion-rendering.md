# Output 動態與渲染契約

決策見 [ADR 0034](../adr/0034-output-motion-rendering-and-animation-handoff.md)。本契約適用於新模板與既有模板的改寫，既有模板依 [GSAP 動畫改寫計畫](../governance/output-gsap-migration-plan.md)逐款收斂。頁面生命週期見 [Output runtime](output-runtime.md)，素材格式與上限見 [Overlay pack 資產政策](overlay-pack.md#資產政策)，動畫師交付見[動畫交付規格](output-animation-handoff.md)。

## 現況

- 已有：GSAP 時間軸；躍動字幕、魚眼鏡筒、幻影怪盜、textured-credits 與開發版電影畫幅的程式按需載入。躍動字幕、幻影怪盜、textured-credits 及電影畫幅另按需載入專屬樣式；魚眼鏡筒沿用共用歌詞樣式。textured-credits 以 PixiJS 繪製多層紋路（`shared/browser/doodleCloudEffect.mjs`），PixiJS 隨模板按需載入。
- 尚未實作：其他共用特效元件；其餘歌詞模板仍隨頁面載入。
- 效能預算尚未固定，須先完成[效能量測](#效能量測)。

## 同時使用上限

歌詞、播放中、歌單三個固定輸出位置各對應一個 OBS Browser Source，這是同時使用的上限。效能以三個來源合計，加上同一台電腦上的工作台預覽計算。同一個輸出網址在 OBS 建立兩個獨立來源會使成本加倍，預算不涵蓋這種用法。

## 渲染分工

這裡的分工是職責，不是[圖層計畫](../governance/output-layer-implementation-plan.md)中由下往上的背景、主內容、前景。

| 職責       | 技術                         | 負責                                     | 不負責             |
| ---------- | ---------------------------- | ---------------------------------------- | ------------------ |
| 時間軸     | GSAP                         | 編排、緩動、巢狀時間軸、依歌曲時間取樣   | 版面、材質、繪製   |
| 文字與版面 | DOM、CSS、SVG                | 字型、讀音、直書、擬合、逐字位移與透明度 | 每幀重繪的效果     |
| 材質       | CSS                          | 靜態底色、紙紋、靜態遮罩                 | 動畫               |
| GPU 特效   | PixiJS + pixi-filters        | 發光、模糊、置換、光掃、粒子、動態遮罩   | 文字排版、自有時鐘 |
| 素材播放   | Lottie、Rive、圖片序列、影片 | 動畫師製作的裝飾動態                     | 歌詞文字           |

- 只在模板需要真正的 3D 時使用 Three.js（可搭配 postprocessing），並取代該位置的 PixiJS。
- 簡單、獨立、不需對齊歌曲的轉場可用 CSS transition 或 Web Animations，前提是不與 GSAP 控制同一屬性。

## 時鐘

- 與歌曲同步的動態只從 host 播放時鐘取樣，不自行累積時間。GSAP 時間軸負責取樣與編排；PixiJS uniform、Lottie 影格、Rive 狀態機、圖片序列影格、Three.js mixer 跟隨時間軸。
- 單純的線性掃字可用 Web Animations，條件是每次重繪都依 host 時鐘重設起點與剩餘時間，例如現有經典字幕。
- 暫停、跳播、變速與減少動態時，時間軸跳到對應時間或直接呈現目標狀態，其他渲染器跟隨同一個取樣值。
- 影片不能逐格精準跳轉，只用於不需對齊歌曲的循環或氛圍；需對時的點陣動態改用圖片序列。
- 隨機效果使用固定種子，同一句在同一播放位置重繪結果相同。

## 每幀可變屬性

| 允許每幀變動                             | 不允許每幀變動，需移到 GPU 特效          |
| ---------------------------------------- | ---------------------------------------- |
| DOM 的 `transform`、`opacity`            | `filter`（blur、drop-shadow 等）         |
| SVG 描線的 `stroke-dashoffset`           | 漸層 `mask`／`mask-image` 的位置或半徑   |
| PixiJS／Three.js 的 uniform 與 transform | `text-shadow` 半徑或顏色                 |
| Lottie、圖片序列的影格                   | 影響排版的屬性（寬高、字級、邊距、行高） |

靜態的 filter、mask、text-shadow 可以保留，只要不在動畫期間改變。

## GPU canvas

- 每個輸出位置最多一個 GPU canvas，同一模板不混用 PixiJS 與 Three.js。
- GPU canvas 依輸出畫布尺寸繪製，不隨 devicePixelRatio 放大。
- 緩慢的氛圍效果可降到 30fps 繪製，歌詞文字與對時動態維持完整幀率。
- 頁面隱藏、斷線或沒有內容時暫停 GPU 繪製；WebGL context 遺失時回到 DOM 呈現，不無限重建。
- 工作台與 Gallery 同時只保留一個即時 GPU 預覽，其他樣張使用靜態畫面。

## 載入與釋放

- 模板模組、特效元件、渲染引擎、shader 與素材依目前模板載入，不在所有頁面預先載入。GSAP 本體由使用它的頁面載入。
- 歌詞頁的按需模板登記於 `overlay/lyrics/templateModules.mjs`，新模板預設加入。套用設定時先載入必要的程式和樣式，再依序載入選用的特效腳本。必要資源失敗時記錄診斷，模板容器保持隱藏；特效腳本失敗時回到文字呈現。載入期間維持原畫面，首次設定前收到的 snapshot 等載入完成再呈現。期間若斷線或隱藏，清空暫存 snapshot，恢復後取 host 最新投影。
- 換模板時釋放舊模板的時間軸、GPU 資源、貼圖與解碼後的影格。
- 素材在首次需要前預先解碼，shader 在載入時預先編譯，避免第一句出現時卡頓。
- 每個新檔案須登記於 Output server 的明列路由，並一併核對封裝清單、授權附文與測試。

## 效能量測

預算以量測固定，不填估計值。

- 基準環境：具備獨立顯示卡的直播電腦、1080p60 OBS 畫布、開啟 OBS 瀏覽器來源硬體加速。記錄 Windows、OBS、App 與顯示卡驅動版本。
- 情境：單一來源與三個來源同時運作；每個情境測播放、暫停、快速換句與換曲，並在工作台開啟時重測一次。
- 指標：OBS 的平均算繪時間、算繪延遲造成的漏幀與編碼延遲；Browser Source 程序的 CPU、GPU 與記憶體；頁面內的幀時間與長任務。需要深入時以遠端除錯開啟 DevTools 查重繪與長任務。
- 預算分配初稿待量測驗證：歌詞最重，可使用 GPU 特效；播放中預設 DOM，GPU 為選用；歌單預設 DOM。
- 結果記入 [Output 外觀驗收](../operations/output-appearance-acceptance.md)。未達預算時撤回該模板改動，保留前一版路徑。
- textured-credits 單來源初測（2026-11-22，Electron 1920×1080，每 1.5 秒換句連續播放，不是 OBS 基準）：1 至 8 層都跟上螢幕更新率，長幀數不變；每多一層約增加每秒 3 ms GPU、2 ms 主執行緒。紋路數量增加三倍沒有可量測的差異。主要成本是每句重建材質，不換句時 Raster 約降為十分之一。因此層數 3–5 依方向可辨識度決定，不受效能限制。

## 驗收

同一播放位置重繪的畫面一致；暫停、跳播、變速、隱藏後恢復、重連、減少動態及換模板後，沒有殘留的動畫或 GPU 資源。其餘行為、畫面與回退條件沿用 [GSAP 改寫計畫的驗收](../governance/output-gsap-migration-plan.md#驗收與回退)。
