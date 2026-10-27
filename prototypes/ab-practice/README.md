# A–B 共用 owner 的隔離驗證

沿[原第 2 項](../../docs/research/product/ab-practice-detail-2026-10-26.md)，驗證邊界見[契約](../../docs/contracts/player-ab-practice.md)。量測使用 App 已初始化的同一練習 owner、真 Main／preload 與原 player／DSP／BGM；fixture 是隔離曲庫的合成靜音 WAV。`runtime.mjs` 只重匯出正式 factory，正式 renderer 不 import prototypes。歌詞頁入口同樣消費該 owner。

## 重現

使用根專案 npm 安裝；第一個終端啟動固定 localhost Vite：

```powershell
npx vite --host localhost
```

另一終端在專案根目錄執行。暫時移除 agent 環境的 Electron Node 模式，結束後恢復：

```powershell
$probeElectronMode = $env:ELECTRON_RUN_AS_NODE
try {
  Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
  & .\node_modules\electron\dist\electron.exe prototypes/ab-practice/capture.cjs
} finally {
  if ($null -ne $probeElectronMode) {
    $env:ELECTRON_RUN_AS_NODE = $probeElectronMode
  }
}
```

完成後停止自己啟動的 Vite。Probe 只建立 `tasks/ab-practice-prototype/profile-*` 隔離 userData／曲庫，正常完成自行退出；最長 200 秒。預設跑中段、等待及 EOF 矩陣；另設 `UTAWAKUI_AB_GATE=source` 驗真實來源刷新，`UTAWAKUI_AB_GATE=ui` 驗歌詞頁入口。結果分別寫 `results-eof.json`／`results-source.json`／`results-ui.json`，逐筆數據與截圖在同一 ignored 目錄，不觸及正式曲庫。來源／UI gate 不產生排程量測時，數值與門檻結果為 null。單元／整合回歸：

```powershell
npx vitest run scripts/ab-practice-prototype.test.mjs src/composables/player/usePlayerMediaBoundary.test.js src/composables/usePlayer.test.js src/bgm/handoffCoordinator.test.js src/bgm/sessionController.test.js --maxWorkers=2
```

UI gate 驗「片段練習」icon 入口、標記右側清除／Play-Pause／進階設定順序、開始直接播放與暫停保留標記、單行狀態、進階起終點左右同行、`mm:ss` 標記、預設每輪 2 秒實際休息、播放中清除仍繼續、Escape 返回焦點，以及亮暗窄寬布局。排程矩陣仍逐案例明示設為 0 秒，避免將前一案例的等待偏好混入分母。

## 固定分母與接受邊界

2026-10-27 Owner 接受候選參數供原型驗證：500ms、等待 0／1／2／4 秒，隱藏／最小化暫停。B 超出 p95≤100ms／max≤250ms；A 落點 p95≤80ms／max≤150ms。

| 分母    | 內容                                                                                                      |
| ------- | --------------------------------------------------------------------------------------------------------- |
| Fixture | 短曲 10s／44.1kHz／雙聲道；長曲 60s／48kHz／四聲道，PCM16 WAV 靜音。                                      |
| 中段    | A=1s、B=1.5s；兩個來源各用 0.5／1／1.5 倍速，每格至少兩輪。                                               |
| EOF     | 相同兩來源及三種速度，搭配 sequence／repeat-one／repeat-list；B=duration 或 duration−0.2s，每格至少兩輪。 |
| 等待    | 0 秒走同一 seeked 確認；1／2／4 秒完成完整等待，另驗 Pause／明確 Play。                                   |
| 身份    | 每輪 playbackRevision 保持，final-ended consumer 不收到練習返回。                                         |
| 記錄    | 每筆 B 超出、A 落點、seek 耗時、gap elapsed／early、playing startup；JSON 含 gate 結果與 errors。         |

此分母不含其他容器、真實音樂、負載／睡眠、長循環或正式 OBS 聽感。兩輪／格是前置可行性資料，不能當充分統計或正式最低區間保證。History／Output 另以原 player 與實際 Main persistence 驗三模式各 22 輪：seek 與等待不造累計進度，達十秒真正進度至多一次紀錄，投影沿原生 A／paused 與 discontinuity。

最初中段可見 Electron probe：B 超出 15 筆，p95／max 33.655ms；A 落點 21 筆，p95／max 0ms，兩項原型 gate 通過。1／2／4 秒實際等待約 1002.1／2014.8／4011.1ms，均無提前開始；Pause／明確 Play 通過，練習返回的 final-ended 次數 0，renderer errors 空，程序 exit 0。這組為歷史中段證據；最新擴充分母及原始量測以各 gate 的 JSON 為準。

Probe 從已載入的 resource URL 取得 App 正在使用的 module instance，保留 Vite HMR query identity，並斷言可見 PlayerBar 曲名及播放按鈕與 probe 一致；不能直接用無 query 動態匯入另一份 module-scope player。修正此入口前的試跑不列驗收證據。結果只適用各次固定分母，後續執行會更新，不把單次小樣本推成正式品質承諾。
