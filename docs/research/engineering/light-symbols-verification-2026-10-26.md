# 第一批私有符號轉換的正式打包驗證

日期：2026-10-26。決策見 [ADR 0031](../../adr/0031-scoped-release-private-symbols.md)，前期範圍見[候選評估](light-obfuscation-assessment-2026-10-26.md)。
本輪在正式 Main build 接入兩個已核准模組，沒有啟用第二批。量測明細與原始樣本彙整見[機器紀錄](light-symbols-verification-2026-10-26.json)。

## 實作與交付邊界

- 只轉換 `electron/lib/importRecordingPolicy.js` 與 `electron/lib/artwork/releasePolicy.js` 的私有 binding，包含 16 個非匯出具名 helper。
- 公開十個函式的匯出 key、`.name`、`.length`、資料欄位、規則權重及控制流程保留。固定模組／匯出 allowlist，未知 export、反射或 timer／eval 等未審查形態使 build 失敗。
- 使用目前既有工具鏈的 Rolldown 1.2.15，改為明訂 exact devDependency；npm lock 只增加 root 的直接建置依賴一行，沒有新增第三方套件版本或 runtime dependency。
- 不加入字串表／解碼器、控制流變形、dead code、反除錯、自我防護、定時檢查、source map 或交付的符號映射。開發來源不改。
- 正式 build 預設處理 Main，afterPack 檢查真正 ASAR 的公開函式與具辨識力的私有名稱 sentinel。兩個目標都必須進入 Main，出現在其他入口時 build 直接拒絕。

同來源 baseline 與 candidate 的整個 ASAR 逐檔 hash 比較，只有 `runtime/main.cjs` 改變：1,209,295 → 1,209,151 bytes，少 144 bytes。
這是小幅去語意化，不把檔案變小當作安全強度量測；其他未處理模組仍可有同名 helper，公開函式與常數也仍可閱讀。
其他五入口、renderer dist 與所有 ASAR 中的 vendor／研究資源逐 byte 相同，原有三個 app-owned unpacked bundle 界線不變。

首次比較曾使用新增 devDependency 前的基線，造成 separation bundle 也多一筆 package metadata。
已以相同來源與 lock 重建 baseline，只在隔離測試的 beforePack 停用 symbols pass；candidate 沿用正式 hook。
該差異不作為音訊變更，也不以舊基線數據混進本輪量測。

## 功能與原生音訊

原生測試使用相同 Electron 43.8.3 driver，載入各產物真正的 Main、preload、renderer、media protocol 與 worker，使用獨立 profile 和 48 kHz 合成音檔。
驗證播放、暫停／恢復、seek 至九秒、下一首、切換演出待唱 dock、UI 選 BGM、播放與 cut、直播擷取 master 50% 及日本語／韓語 worker。
沒有操作使用者正式曲庫或連線 OBS；硬體輸出靜音。

播放時另外在 Main 執行錄音評分與十二筆封面排序負載，跨批次 yield，並記錄規則耗時、Main event-loop delay、renderer frame 與播放時間前進。
測試橋接只在記憶體的兩個函式宣告後加觀測引用，使用實際 bundle 內的函式；沒有把這個橋接或測試入口寫入正式產物。
測試全程的 Main CPU 數值保留在 JSON；它混合了初始化、系統觀測與背景工作，波動較大，不能拿一次差值推論符號轉換成本。

原曲監聽與擷取 sample peak 均為 0.062501907；BGM 監聽為 0.031250954、擷取為 0.015625477；cut 後為零。
兩包各四輪共八次均通過，啟動前 AudioContext 為零，播放時間在規則負載期間持續前進，沒有記錄 media／preload／renderer 錯誤。
每批負載是二十四次錄音評分與十二筆封面排序；各輪 batch p95 的基線範圍 1.068–2.018 ms，候選為 0.994–1.243 ms。
Main event-loop p95 的基線範圍 16.777–17.170 ms，候選為 16.941–17.105 ms；這不是音訊 buffer latency。
額外比較兩包內函式的完整輸出 SHA-256 相同：`c429f701f9ac652e34c7fb48f954cc60abf1dd3f1c64b4f6b84ecba5fde3e90d`。
八次日韓 worker 的文件輸出 hash 也相同。

另外以 0.4 秒雙聲道 PCM 與合成 ONNX Identity，使用真實 CPU ORT、FFmpeg 9、FFT 及 worker writer，兩包交錯各三次。
六次均完成 loading／decoding／separating／writing，44.1 kHz 四聲道 WAV 皆為 141,164 bytes 且逐 byte 相同，SHA-256 為 `7bd5909270ebd039e0a46c5481527091da2c79c49e3fceb9060ca7a3b70964a3`。
這些是 PCM sample peak，並非 LUFS、true peak、OBS 實收或長時間 dropout 證明。
Renderer 與音訊 worker byte identity 是額外相容證據；真實音訊裝置、OBS、DirectML／真模型仍有各自驗收範圍。

## 啟動效能與回退判定

以兩個實際 packaged executable 交錯啟動，每輪各十次新 profile、十次暖 profile，prime 不計入。
沒有同時跑 tests／build／其他 native 工作。新 profile 不代表 OS cache flush。
第一輪冷啟動 p50 477.110 → 501.691 ms，暖 p50 540.896 → 554.906 ms；暖 p95 581.574 → 655.385 ms。
冷 p50 與暖 p95 觸及回退門檻，因此保留全部樣本並進行一次獨立重測，不宣稱首輪通過。

啟動的回退門檻為可重複增加超過 `max(基線 5%, 20 ms)`，working set 為 `max(基線 5%, 16 MiB)`；可感知卡頓或新增錯誤即回退，不以門檻允許播放退步。
重測與最終判定記於下方驗收結果及 JSON，不能將首次波動樣本刪去後只報較好的結果。

| 情境                       | 基線 p50   | 候選 p50   | 基線 p95   | 候選 p95   |
| -------------------------- | ---------- | ---------- | ---------- | ---------- |
| 獨立重測冷啟動（各 10 次） | 583.671 ms | 578.397 ms | 969.945 ms | 643.750 ms |
| 獨立重測暖啟動（各 10 次） | 565.476 ms | 591.057 ms | 645.766 ms | 626.124 ms |
| 合併兩輪冷啟動（各 20 次） | 563.146 ms | 558.217 ms | 633.642 ms | 638.985 ms |
| 合併兩輪暖啟動（各 20 次） | 559.452 ms | 572.069 ms | 605.069 ms | 626.124 ms |

第二輪未重現第一輪的 cold p50／warm p95 超門檻；第一輪和第二輪的 warm p50 分別慢 14.010／25.581 ms，均在各自 5% 門檻內。
合併後 warm p50 慢 12.617 ms（約 2.3%），不是零開銷；cold p50 快 4.929 ms。
合併 warm working set p50 739,764 → 739,916 KiB，cold 為 740,776 → 742,072 KiB；相差約 0.15／1.27 MiB。
本機桌面存在量測波動，第二輪基線有 969.945 ms 的 cold outlier；數值完整保留，不外推成跨硬體效能保證。
依預先門檻、獨立重測與播放負載結果，本輪沒有發現需回退的可重複退步。

## 第二批評估

第二批仍未納入 allowlist，也未轉換其 bundle 內容。
`lyricsProviders/recordingPolicy.js` 僅有三個私有 helper，額外收益有限，且影響各 provider 的 exact／strong／related 與自動儲存判定。
`lyricsProviders/candidates.js` 有十一個私有 helper，但涵蓋多來源分組、排序、時間軸 evidence 與自動挑選，回歸面更大。
第一批本輪驗收通過後，已完成第二批的範圍評估；若後續實作，仍須另做獨立試驗，不得直接整個 `lyricsProviders/` 或依賴閉包一起處理。
後續測試須覆蓋同錄音不同版本、逐字／逐行能力、部分失敗、空／重複候選及背景自動保存；不動 rate-limit scheduler、retry、cancel 與 timeline 計算。
以本輪收益與風險判斷，建議先保留第一批，第二批只有在確實需要減少這些私有語意名稱時才另行實作。

## 驗收結果

第一批通過本輪有界驗收。最終完整測試 1,127 檔、11,374 項通過、1 項原有 skipped；建置工具重新命名與格式化後已重跑。
focused coverage 為 statements 91.89%、branches 91.39%、functions 97.22%、lines 93.86%。
Windows dir 打包、afterPack notices／runtime／symbols、正式 executable 的 probe CLI 拒絕路徑與最終 runtime hash 核對通過。
完整 lint、Markdown、format 與來源 diff 檢查結果見 JSON。

原始／候選產物保留在 ignored 的 `tasks/light-symbols-baseline/`、`tasks/light-symbols-candidate/`；原本 `release/` 未覆寫。
沒有新建 NSIS installer、簽署、發布或 commit，也未啟用第二批。
