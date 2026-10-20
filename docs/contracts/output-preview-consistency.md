# Output 預覽資料與一致性

F3，2026-10-20。本契約只整理資料、設定與比較方式，不重新設計模板或更改動畫配方。
共用 host 仍依 [F2 契約](output-host-lifecycle.md)，欄位／本機來源限制依 [F1 契約](output-appearance-baseline.md)。

## 單一場景與時間

`shared/presentation/outputPreviewScene.mjs` 提供小型 app-owned 合成場景 `showcase-t1-v1`；觀測時間固定為 2026-10-20T00:00:00.000Z，paused 5 秒／duration 32 秒，T1 日文自製試驗文與讀音、示範曲目及目前／已唱／待唱項目。
文字不是摘錄歌曲；封面沿用文字 fallback，不複製外部素材或查詢私人媒體。讀音逐行對齊並通過正式 V3 document validator；不因示例而啟用讀音模型。
壓力情境與自製 PNG 仍留在 scripts 的 F1 fixtures，不隨此場景打包。

`createOutputPreviewSnapshot()` 每次回傳獨立資料。`createOutputPreviewScene()` 接收 kind、templateId、settings，以及可選的 snapshot／nowMs，直接呼叫 canonical `selectLyricsOverlayFrame`、`selectSetlistFrame`、`selectArtworkFrame`。
它不重寫 timing 演算法；同 snapshot、clock、template settings 應得到相同 frame。傳入空 snapshot 就得到空 frame，不自動換成示例。
正式 live route 仍用原有真實時鐘；本輪可見比較以 paused 固定播放位置對照，沒有在正式頁植入測試時鐘。
呼叫端仍持有既有 registry／template-kind allowlist 與 capture geometry，不建立另一套可執行模板身份。

| 入口                    | 資料與設定                                                                                                        | 模式界線                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Gallery 動態縮略        | OUTPUT_PREVIEW_SCENE 為共用工廠的 immutable facade；Mockup 依所選模板重新投影同一 snapshot／clock，使用該模板預設 | 不是即時播放器；手動／hover 只是播放縮略動態示意                     |
| Gallery 靜態縮圖        | 原有 bundled 圖片，未重新生成                                                                                     | 只作風格參考，不能聲稱圖片就是此場景的實際 capture                   |
| Workbench               | 正式 Output iframe，讀 main 保存的 slot 與真實 projection                                                         | 不自動塞示範。相同合成 snapshot 可在隔離驗證時經正式 V3 邊界注入比較 |
| 正式 OBS Output         | 正式 route／slot／canonical projection                                                                            | 真實資料或空態；不可因缺內容顯示示範歌名或歌詞                       |
| 明確 preview=1 的獨立頁 | live frame 可見時仍顯示 live；只有空 frame 才使用同一模板／settings 的共用示例                                    | 明確示範模式，不能混入 Workbench 或複製給 OBS 的 URL                 |

舊 `src/constants/outputPreviewSample.json` 及三個 route 自寫 PREVIEW_FRAME 已移除，沒有保留第二份權威樣本。
Vue prop 邊界以 toRaw 解開 immutable snapshot，再交純工廠複製，避免 structuredClone Vue proxy 失敗；父元件以新 snapshot 取代舊資料，不讓 Mockup 修改來源。

## 設定與幾何

所有入口使用既有 appearance normalization、模板預設／值域、Live Stage presentation policy 與 capture registry。Gallery 不讀其他 slot 的自訂值當自己的模板預設，也不新增跨模板主題繼承。
Gallery 的資料 adapter 可接收明確設定做測試；產品介面仍只展示預設外觀。縮略 consumer 沒有完整呈現所有自訂欄位，不以 metadata 已 normalize 宣稱它們已視覺相容；自訂色、字級、位置、對比及本機字型以 Workbench 正式 runtime 為確認依據。
Kinetic 的材質／排列與當前 phrase、Manga 的 reading auto／off、Live Stage 的文字 policy 均消費相同合法語意，沒有寫死另一套選項。

KTV 縮略從 canonical KTV frame 取目前／下一句、lane、role、held 與 count-in 存在性；原有縮略掃色 recipe 保留，不把固定 CSS mask 說成精確 T2。
Cover Player 的靜態進度、elapsed／remaining 改用同一 frame 的時間資料；不再寫死 0:23／-3:27。縮略動態進度依然只是 cue，不推動真正 playback position。
Setlist 顯示同一 sourceName、目前項目與已唱紀錄，待唱項目仍不投影成已唱內容。

Capture 依既有三種 Widget 尺寸或 FHD Lyrics；Gallery 保持既有縮放／letterbox，Workbench 保持正式尺寸，不為統一預覽而新增模板畫布支援。

## 縮略預覽的已知限制

下表為可接受的縮略範圍，不是將正式 runtime 缺口改判為正確。Gallery 同時顯示通用與各模板提示；靜態標示「風格參考圖」，動態標示合成示例。

| 模板            | 縮略限制                                                                                    | 正式驗收依據                                   |
| --------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| queue-board     | 連續 CSS 捲動，不等於 runtime 依列對齊分頁／新紀錄 reveal                                   | Workbench／Output 的真實溢位與分頁             |
| karaoke-stack   | 掃色 mask／動態為示意，未消費完整逐字 progress；已統一內容、lane／role 與 count-in 是否存在 | T0／T1／T2、seek 與雙 lane handoff             |
| kinetic-pop     | 已取同一 clock 的 active phrase／material；縮略循環不是整首 scheduler                       | 正式 phrase source boundaries、交錯進場與換句  |
| ornate-vertical | 兩句對照／固定循環 offset，正式 runtime 仍按來源時間換詞                                    | 直書斷欄、group reveal 與行級回退              |
| live-stage      | 固定時刻的標題卡／caption；未模擬整段 title window 或所有 caption page 時序                 | 正式 title window、policy 分頁與字型 fallback  |
| manga-frame     | 可以同時展示全部 bubble；縮略 reveal 不等於逐框交接／T2                                     | 正式 bubble 時序、ruby 與安全區                |
| art-card        | 文字代封面、簡化唱盤／唱臂與旋轉 cue，非真實播放位置或換封套 timeline                       | 正式 artwork controller／validated media route |
| cover-player    | 文字代封面；靜態時間正確，但動態 progress cue 非時鐘，transport 為示意                      | 正式進度、播放狀態與缺圖 fallback              |

原盤點 G01 的參考圖問題仍保留；F3 不覆寫圖片、不修改藝術 CSS 或 GSAP recipe。需要重畫才能消除的差異移交個別模板／資產階段，不靠改 expected 掩蓋。

## URL、載入與失敗

Workbench iframe URL 先清除輸入 query／hash，再僅加入既有 backdrop／guide／reload 與受控 workbench／開發診斷參數。demo、sample 或任意 template query 不沿用到 Workbench。
OBS drop URL 清除 inspection／demo query 與 hash，只附加 layer-name／layer-width／layer-height。正式 clipboard 仍由既有 main bridge 推導 URL。
共用場景 module 只新增一條 exact static route；不能因此讀取 scripts fixtures、任意檔案或使用者資產。

Gallery 保留 static-first 與 lazy Mockup；250ms hover、觸控／reduced-motion 不自動啟動、手動控制、切模板／卸載取消與載入失敗回報沿既有 ownership。
Workbench／Widget 保留既有 iframe 與尺寸／失敗路徑，不因普通設定更新重建 connection；主動切換檢查背景等既有 URL 操作仍可重新載入。
F3 不以 Gallery 縮略替換正式 iframe，也不將測試資料全集混入封裝。

## 驗證範圍

相鄰測試比較八模板 canonical frame、settings normalization、V3 reading contract、獨立資料、空態、Vue reactive prop、句段／lane／時間與 URL 隔離；F1 與 F2 保持回歸。
可見 Electron 結果、版本與已知差異記錄在[八模板驗收清單](../operations/output-appearance-acceptance.md)。真實 OBS、整首動畫中間幀、透明合成與長時間效能仍屬後續驗證；F3 通過不是作品上架或 F4 capture 工具已完成。
