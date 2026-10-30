# 波形 backend 預算與取消實驗

沿[原第 3 項](../../docs/archive/lyrics-timing-review-detail-2026-10-26.md)的 R15–R17，比較完整 Browser decode 與受控 FFmpeg 分塊 producer；[結果與限制](../../docs/research/engineering/lyrics-waveform-backend-2026-10-28.md)。這是隔離實驗，不由正式 Main／preload／renderer import，不新增 npm 或 app runtime 依賴。

## 重現

需要根專案 npm 安裝及已安裝的 FFmpeg／ffprobe；不下載或準備工具，不掃正式曲庫。在專案根目錄：

```powershell
$waveFfmpeg = (Get-Command ffmpeg -ErrorAction Stop).Source
$waveFfprobe = (Get-Command ffprobe -ErrorAction Stop).Source
node prototypes/lyrics-waveform/benchmark.mjs $waveFfmpeg $waveFfprobe
npx vitest run scripts/lyrics-waveform-prototype.test.mjs --maxWorkers=1
```

Runner 只在 `tasks/waveform-backend-*` 產生合成 fixtures、獨立 Browser profile、原始 `results.json`／`main.json`／`browser.json` 與私有失敗 log。結果是否通過看 `gates`，不是只看 decoder 是否 exit 0；Main 候選 gate 或 Browser probe 完整性失敗會令 runner 非零退出。Browser 因預算拒絕長曲是必要測項，不是 fixture 遺漏。

Node runner 啟動 Electron 時只對該子程序移除 `ELECTRON_RUN_AS_NODE`。所有子程序 `shell:false`／hidden，取消只處理此次 fork／spawn 回傳的 PID；不以 image name 殺其他 Electron／FFmpeg。FFmpeg worker 收到取消後等 producer 與 stdio 關閉；500ms 後仍無回應才終止該 worker 的程序樹。以 `close` 接收排空 IPC 的終態，另查 OS PID 已消失，不把 `exit` 或取消回應當充分證據。

## 實驗邊界

固定分母、暫定預算、數值與採用限制只維護於[驗證報告](../../docs/research/engineering/lyrics-waveform-backend-2026-10-28.md)及其機器證據；可執行參數見 `policy.mjs`。這裡只記重現與工具 ownership，不另列產品支援上限。

`policy.mjs`／`peaks.mjs` re-export 正式 `shared/waveform/` 的預算與跨聲道 min／max 核心，不平均成相消的假靜音；`lane.mjs` 驗去重／consumer 取消／generation 安裝屏障。`producer.mjs`／`decode-worker.cjs` 與 `memory.ps1` 只供這個 Node 實驗；`capture.cjs`／`browser.mjs` 是獨立 sandboxed Chromium 量測面。

正式 gate／scheduler、原媒體 proof、cache／清理與封裝驗證集中在[波形契約](../../docs/contracts/lyrics-waveform.md)；本 runner 不是正式服務入口。
