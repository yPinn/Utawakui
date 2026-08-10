# Utawakui 產品規格

## 1. 定位

給直播主/VTuber 用的 OBS 疊加工具。核心差異化:**用 Spotify / YT Music 歌單快速匯入曲目**,搭配本機播放、變調變速與 OBS 歌詞/歌單疊加。不做音樂庫管理,不做多人協作,不做觀眾點歌互動,不做即時串流播放整合。

## 2. 核心決策

| 議題             | 決策                                                                                                                                                                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 音訊來源         | Spotify/YT Music 僅作歌單匯入(讀取曲目清單/metadata),實際播放音訊由 yt-dlp 下載 YouTube 內容,本機播放。官方串流管道無法取得可處理的原始音訊(DRM),即時系統音訊擷取方案風險過高已捨棄                                                                           |
| YouTube 音源解析 | 優先透過 YT Music 目錄解析對應的「Topic 頻道」官方音源影片 ID 交給 yt-dlp,而非文字模糊搜尋,降低歌詞時間對不準機率                                                                                                                                             |
| Pitch/Tempo      | 本機檔案 + 分階段處理:試聽/調整階段即時 DSP,確定 Key 後背景預先渲染快取,實際演出時只播放快取檔,直播當下不跑即時運算                                                                                                                                           |
| 帳號門檻         | Spotify 走官方 Web API 讀取歌單(免費帳號可用,不需 Premium);YT Music 走非官方管道讀取(不需付費,但無官方授權保證,需獨立列管風險)                                                                                                                                |
| 歌詞比對         | 優先用曲目 ID/duration 過濾候選,找不到才退回曲名+歌手模糊搜尋;保留手動 reset offset 安全網                                                                                                                                                                    |
| 資料模型         | 連續自動儲存為底 + 具名 preset 快照為選用附加層(歌單+主題+顯示設定可另存成具名組合、可切換)                                                                                                                                                                   |
| Overlay          | 純 HTML/CSS/JS,無框架,OBS Browser Source                                                                                                                                                                                                                      |
| 控制面板前端     | 原定純 HTML/CSS/JS 起步、視 CRUD 複雜度評估是否導框架——實作時複雜度提前出現,已評估並改採 Vite + Vue 3。刻意不用 vue-router/Pinia:分頁固定 4 個、Electron 視窗無網址列無深連結需求,單一共享 composable 就撐得住目前規模,兩者都是「真的需要再導入」而非預先鎖定 |
| 技術棧           | Electron(Node.js)。生態/套件擴展性優先於資源占用;pitch/tempo 已由快取機制移出直播當下即時路徑,原生語言的效能優勢不再是必要條件;JS 生態的高擴展性、npm 套件量,以及未來若需局部效能優化仍可用 native addon(N-API)下沉,是決定性因素                              |

## 3. 功能規格

### 核心採納(MVP 下限)

- 獨立播放/暫停/停止/音量/進度控制
- Per-track pitch/tempo 記憶 + reset
- 待播/已唱佇列
- 多來源歌詞搜尋(曲目 ID 優先,duration 過濾,模糊搜尋退路)
- 手動歌詞偏移校正
- 獨立可移動「歌詞視窗」(主播自看用,非 OBS 疊加)
- JP/KR 羅馬拼音、簡繁轉換
- OBS Browser Source 疊加,多主題可選,支援拖曳建立來源與複製 URL 兩種方式
- 歌詞/歌單為獨立來源,可各自縮放裁切定位
- 深度雙向即時同步(狀態變更即時推播疊加層)
- OBS WebSocket 讀取實際開台時間,用於精準時間戳/YouTube 章節匯出
- 崩潰復原快照(待播/已唱進度)
- 緊急隱藏(只隱藏自家疊加元素)
- 直播中系統對話框靜音
- 狀態版本管理/損壞備份/自動遷移

### 值得評估追加(排入 MVP 之後)

- BGM↔伴奏自動交接
- 無伴奏演出項目
- 練習模式(點擊歌詞跳轉伴奏至對應時間點)
- 工作區大小模式(完整/精簡/迷你)
- PIN 保護 + 讀寫權限分級
- 首次使用導覽
- 逐行時間軸編輯器

### 明確排除

- Twitch 點歌/觀眾互動
- Stream Deck HTTP API(延後至有明確需求)
- 多人共演/跨網路協作
- OBS 原生 Plugin(犧牲跨串流軟體通用性,僅列為 Phase 3+ 選用進階整合方向)

## 4. 技術架構

```text
Overlay(純 HTML/CSS/JS)→ OBS Browser Source 讀取,與殼技術棧解耦
串流平台 API 用戶端 → Spotify Web API(讀取歌單)/ YT Music 目錄解析,OAuth 走系統瀏覽器彈出+本機回呼監聽
音源下載 → yt-dlp 外部程序
Pitch/Tempo DSP → AudioWorklet(比照 Elitesand Pro 已驗證方案),分階段即時處理+預渲染快取
Overlay 伺服器 + 狀態廣播 → 本機 HTTP/WebSocket,單一權威狀態源
控制面板 UI → Electron 渲染程序,Vite + Vue 3(無 vue-router/Pinia,固定分頁 + 單一共享 composable)
```

殼:Electron(`electron/main.js`,`contextIsolation`/`sandbox`/`nodeIntegration:false`)。已超出最小骨架:自訂 `utawakui-media:` protocol 供本機音訊與縮圖資產播放/顯示(音訊含 HTTP Range/206 支援,供 seek 使用)、yt-dlp 下載管線與背景 metadata/info/thumbnail 回填、`config.json`/`library.json` 持久化。曲庫根目錄下的新下載採 `tracks/<trackId>/audio.<ext>`、`thumbnail.<ext>`、`info.json`、`stems.wav` 的結構化儲存。

## 5. 競品比較

|                  | Utawakui                            | Elitesand Pro                | 歌回救星                    |
| ---------------- | ----------------------------------- | ---------------------------- | --------------------------- |
| 技術棧           | Node.js + Electron                  | Node.js + Electron           | Qt6(C++)+ QtWebEngine       |
| 音訊來源         | Spotify/YT Music 匯入 → yt-dlp 下載 | 手動貼 YouTube 連結/本機檔案 | 手動選本機檔案/YouTube 伴奏 |
| 串流平台歌單匯入 | 有(差異化賣點)                      | 無                           | 無                          |
| Pitch/Tempo      | 有(分階段:即時試聽+快取播放)        | 有(AudioWorklet 即時)        | 有(per-track 記憶)          |
| BGM↔伴奏自動交接 | 評估中                              | 無                           | 有(對方核心賣點)            |
| 資料模型         | 連續自動儲存 + 具名 preset          | 連續自動儲存                 | 專案檔(.bgmsproj)           |
| Twitch 點歌      | 無(明確排除)                        | 有                           | 無                          |

## 6. 路線圖

- **Phase 0**:Electron 骨架(已完成)→ 控制面板 UI 殼 + yt-dlp 下載管線 + 本機播放(已完成:Vite+Vue 3 四分頁殼、下載/metadata 回填、本機音訊播放與 seek、去人聲/導唱混音)→ 本機伺服器 + overlay 路由 → Spotify/YT Music OAuth 流程 → pitch/tempo 分階段處理(即時試聽+預渲染快取)原型驗證
- **Phase 1(MVP)**:第 3 節「核心採納」全項
- **Phase 2**:「值得評估追加」項目依實際回饋排序導入
- **Phase 3**:程式碼簽章投資評估、YT Music 官方 API 監控與降級方案、OBS Plugin 選用進階整合評估

## 7. 開放問題

1. YT Music 非官方存取的降級/因應計畫(端點失效時如何處理)
2. 具名 preset 快照的 UX 細節(數量上限、匯出/分享格式)
3. 試聽即時運算+演出前快取的快取管理策略(容量上限、清除時機)
4. 未簽章安裝包的因應方式(是否投資程式碼簽章)
5. BGM↔伴奏自動交接是否納入 MVP,或確認留待 Phase 2
