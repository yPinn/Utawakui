# R02 Mic 輸入原型首輪驗證

日期：2026-10-30（Asia/Taipei）。本輪先建立單一輸入與本機電平基礎，再驗實際 Electron 權限和清理。產品現況見 [spec](../../spec.md#73-研究候選尚未接受為開發路線)，行為見[研究契約](../../contracts/microphone-level-research.md)；原型與短暫開啟裝置不代表完整聲學品質通過。

## 方法與隔離

使用 Electron 43.8.3／Chromium 150.0.7871.250 的獨立可見 BrowserWindow、profile 與 Vite 連接埠，載入實際 Workbench、專案 preload、可信 IPC wrapper、Main permission handlers 及輸入 runtime。沒有操作既有 App／OBS，沒有改 Voicemeeter 路由、系統音量或曲庫。

合成測試使用 Chromium fake capture 讀取本機產生的 440Hz、振幅 0.25、48kHz 單聲道 PCM16 WAV。它是測試素材，非使用者錄音；裝置實際回報可不同於檔案格式。輸入沒有連到揚聲器或錄音器。

使用者另明確允許 VM Out B1 或直接麥克風。原生列舉取得 3 個具體輸入後，以實際名稱明選 `Vm Out B1`，再另開新測試選實體麥克風；不是 runtime 自動替換。兩次各以 100ms 目標間隔讀取 100 筆已計算的 meter 快照，約 10 秒，只保存數值摘要，不保存原始 Mic PCM。裝置 id／完整標籤、profile 與操作收據只留本機 ignored scratch。

## 當輪觀察

| 情境       | 證據與結果                                                                                            | 限制                                                                                                                           |
| ---------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 初始與列舉 | 初始選擇為空、輸入呼叫為 0；明確讀取可列出 3 個實際輸入，仍為 0 次 getUserMedia。                     | 列舉不是收音證據。                                                                                                             |
| 未授權請求 | 未持 lease 的 audio 請求回 NotAllowedError；原生回呼有 audio／video 拒絕。                            | 混合請求／其他 frame 另由定向測試覆蓋。                                                                                        |
| 合成訊號   | running meter 約 −15.09 dBFS，與振幅 0.25 正弦的 RMS 約 −15.05 dBFS 相近；相對強度有反應。            | 窗口／平滑影響瞬時讀值，不當校準或誤差上限。                                                                                   |
| 停止與晚回 | 停止後 meter 為 −100／0、tracks 全 ended；延後回傳的 native getUserMedia 在停止及卸載後也全部 ended。 | 不是 USB 熱插拔或長場次證據。                                                                                                  |
| VM Out B1  | 100 筆快照的最低／最高皆為 −100 dBFS 數值底限；停止後 tracks 全 ended。                               | 未取得有聲輸入，不能判斷 bus 路由、噪聲或訊號品質。                                                                            |
| 直接麥克風 | 另一個明選 session 的 100 筆最低／最高亦皆為 −100 dBFS；停止後 tracks 全 ended。                      | 未安排同步發聲或確認硬體電平，不對底限原因下結論。                                                                             |
| 可見介面   | 深淺色 idle／running 與 650px 窄窗擷取經獨立審查，元件範圍 SHIP。                                     | 非完整 App 導航、實體鍵盤或螢幕閱讀器驗收；root scrollWidth 大於 clientWidth，尚未區分裝飾 overhang 與內容，不宣稱幾何零溢出。 |

## 工程驗證

13 個相關測試檔、126 項通過；另 4 個 packaging／runtime 測試檔、42 項通過。覆蓋執行的 24 項是相關測試的子集，不再加總。四個核心檔案的 statements／branches／functions／lines 為 93.58%／86.18%／90.74%／97.59%，不是整庫覆蓋率。

Production build、完整 ESLint、本切片 Prettier、Markdown（最終 240 檔）、diff whitespace 與一次 UI detector 通過。正式 renderer 產物搜尋未包含原型 route／標題／研究 bridge；編譯 preload 測試確認正式 API 沒有 begin／end。初輪完整 lint 曾因並行 R01 crash fixture／recovery test 的 15 個錯誤失敗，未更改那些檔案；並行工作更新後重跑通過。Release inventory 的新表格需繞過既有 `release-*` Prettier ignore 才能完成對齊，保留表格內容。

工具失敗保留本機：沙箱內 Electron 原生啟動失敗，改用授權的沙箱外獨立視窗；Playwright Electron 啟動不適用目前 Node inspector fuse，改由自有 Main 驅動。首次 capturePage 回 UnknownVizError，第二次取得可見視窗圖像。早期 harness 的 token root／theme 與非同步完成判斷修正後才採用收據，不改產品 timeout、不關閉 sandbox。

## 接續條件

### 19:03–19:04 B1 訊號重試

使用者確認目前有輸入訊號並要求重試。沿相同指定 B1 與實際原型重建 session，不更動 VM／OBS 路由、不錄音；列舉當時有 4 個具體輸入。Main access 模組已由並行工作更名為 `microphoneResearchAccess.js`，本機 harness 隨現行名稱載入，未改產品分析實作。

- 19:03 首次重試：100 筆電平摘要仍皆為 −100 dBFS 底限，停止後 tracks 全 ended。
- 19:03 獨立對照：相同 stream 另接一個 Analyser → 固定零增益 → destination，只有本機數值摘要。原型 92／100 筆高於 −99 dBFS，最高 −14.56 dBFS；對照亦為 92／100、最高 −13.65 dBFS。兩個窗口非同步取樣，不用其差值估算精度。對照 context 關閉，輸入停止後 tracks 全 ended。
- 19:04 依使用者再次要求，移除額外對照，只跑原型：99／100 筆高於 −99 dBFS，最高 −49.29 dBFS、最低 −100 dBFS；停止後 meter 回 −100／0，tracks 全 ended。

這證明本輪原型能取得 B1 的非底限訊號，不能把先前底限確診為圖接線或 VM 錯誤；各輪沒有固定發聲內容／音量，數值不可直接當同條件比較、噪聲評估或演唱品質。私有收據分別保留為本機 `vm-b1-signal-retry-1903.json`、`vm-b1-pull-control-1903.json`、`vm-b1-prototype-only-1904.json`，不覆寫初始 B1／直接 Mic 觀察。

### 尚未完成的品質矩陣

後續仍需固定所選 bus／Mic 的來源與實際電平，再安排安靜、正常說話與輕強唱窗口。初始底限與後續有聲摘要都不足以估算噪聲、coverage 或輸入延遲；不以改門檻或自動換裝置掩蓋。

其後固定伴奏單獨播放、播放加發聲與 OBS 同時使用的矩陣，量測串音誤觸、平滑取捨、畫面延遲分布、CPU／RAM 與播放中斷。R02 完整品質、Output transport 與 R03 音準仍保留前置；本輪沒有錄音、人聲監聽、音準模型或評分實作。
