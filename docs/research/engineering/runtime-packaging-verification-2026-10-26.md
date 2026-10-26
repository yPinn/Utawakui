# 正式 runtime 打包與 unpack 界線驗證

日期：2026-10-26。實作決策見 [ADR 0030](../../adr/0030-release-runtime-bundles.md)，交付位置見 [release inventory](../../operations/release-inventory.md)。
數值與實測界線見[機器摘要](runtime-packaging-verification-2026-10-26.json)。來源包含本輪未提交修正；不是原本 `release/` 舊產物的重新命名。

## 交付結果

| 項目                                 | 原始包          | 候選包               |
| ------------------------------------ | --------------- | -------------------- |
| 原始 Electron JS 模組                | 299             | 0                    |
| 自有正式 runtime bundle              | 0               | 6                    |
| unpacked 自有 Electron／runtime 檔案 | 211             | 3                    |
| renderer 輸出                        | 既有 Vite build | 與原始包逐 byte 相同 |
| runtime source map                   | 無              | 無                   |

六個入口是 Main dispatcher、兩個 sandbox preload、日韓讀音 worker、ONNX 分離 worker、獨立 Node probe。
只有兩支 worker 與 probe 放在 `app.asar.unpacked/runtime/`。原始 `electron/` 目錄及 Main 使用的兩支 `src/utils/` 不再分別交付。
第三方 Node wrappers、字典及 native binaries 仍保留必要的實體路徑；不能將自有檔案減量理解成所有 vendor unpacked 檔案也只剩三個。

`npm run build:runtime` 可獨立檢查輸出；electron-builder beforePack 每次都會從目前來源重建。
開發仍使用 `electron/entry.js`，正式包的 main 欄位指向 `runtime/main.cjs`。
Vite 使用獨立 Node/CJS 設定，保持 lazy require、函式／類別名稱，不做 tree shaking，也不改 renderer、DSP 或 Web Audio 演算法。

## 修正及回歸證據

- 先寫 build／入口 mapping 測試，確認缺少實作時失敗，再實作 compiler transform 與固定入口映射。
- CJS/ESM fixture 在搬動產物後仍維持執行順序及相對資源位置。
- 兩支 preload 在只有 `electron` require 的 sandbox 模擬中載入；實際 Electron smoke 另載入真正的包內 preloads。
- afterPack 檢查實際 ASAR、Main/preload 的 packed 狀態、worker/probe 的實體檔案及依賴解析。曾抓到 `onnxruntime-common` 會回頭使用開發環境；已明列 ONNX wrappers、common CJS、kissfft 與 kuromoji 依賴，禁止解析到 artifact 外。
- Windows 的 Vite module ID 使用 `/`，而本機 path 使用 `\`；原本 probe 的特殊 `__filename` mapping 因直接比較字串而漏套。先觀察回歸失敗，再正規化 ID。測試刪除原始 probe 後，編譯產物仍能真正啟動自己。
- 讀音封裝評估工具同時支援新 bundle 與舊來源碼格式，保留歷史版本基線比較能力。
- 打包測試核對 352 個實際輸入 module IDs，未包含 `.test` 或 fixtures，也未帶入研究 CLI、私有 corpus／設定。

## 原生功能與效能

同一台 Windows 電腦、Electron 43.8.3，使用合成資料與隔離 profile。
完整程式的啟動量測直接使用各自的 packaged executable；原生 UI smoke 由相同版本 Electron driver 載入各包的 Main、preload、renderer，沒有使用 CDP 或改產品的除錯限制。
測試用額外 preload 只負責觀測音訊；硬體輸出靜音，不連接 OBS。

| 啟動指標               | 原始包 p50 | 候選包 p50 |
| ---------------------- | ---------- | ---------- |
| 新 profile 可互動      | 516.196 ms | 494.091 ms |
| 已暖 profile 可互動    | 537.062 ms | 468.885 ms |
| 暖 profile working set | 745896 KiB | 734212 KiB |

每種情境三次，warm prime 排除；cold 指新 profile，不代表清空 OS 檔案快取或重開機。
這是小樣本同機比較，未見明顯啟動／記憶體負擔增加，不作跨硬體效能保證。

兩包皆完成原曲播放、暫停／恢復、seek 至九秒、下一首、切換演出待唱、UI 選 BGM、播放及立即停止。
啟動時沒有建立 AudioContext；開始播放後兩包的 sample rate、base latency 及訊號 peak 相同。
原曲監聽與擷取 peak 都為約 0.062502；BGM 監聽為 0.031251、擷取為 0.015625，符合 BGM 音量 25% 與 capture master 50%；cut 後歸零。
這是 PCM sample peak，不是 LUFS、true peak、OBS 收音或長時間無 dropout 證明。
兩包的日本語／韓語 worker 產生相同結果；單次 worker 耗時僅留作觀察，不作效能結論。

另外以合成 ONNX Identity 模型、0.4 秒合成雙聲道 PCM，使用真實 CPU ORT、已安裝 FFmpeg、FFT 與四聲道 WAV writer，原始／候選交錯各跑三次。
六次皆走完 loading、decoding、separating、writing，輸出皆為 44.1 kHz／四聲道，141164 bytes，SHA-256 一致：
`7bd5909270ebd039e0a46c5481527091da2c79c49e3fceb9060ca7a3b70964a3`。
這驗證分離管線相容性與輸出一致，不代表已驗收真實 UVR 模型品質、DirectML 或 Audio Python 模型。

## 檢查與限制

最終自動測試、coverage、lint、Markdown、format 與 build 結果記錄在機器摘要。
已執行 Windows `--dir` 打包、afterPack notice／runtime boundary 驗證與原生 smoke；沒有建新 NSIS installer、簽署、發布或更新正式安裝。
原始基線與最後候選分別保留在 ignored 的 `tasks/release-runtime-raw/`、`tasks/release-runtime-final/`。

Python workers、固定研究子程序、Browser Source 程式與共用公開呈現模組仍可讀。
本輪只降低自有 Main/worker 原始模組及檔案結構暴露，不提供防解包、程式保密或防竄改保證，也未加入重混淆、bytecode 或反除錯。
未操作正式曲庫、設定、OBS；未提交 commit。
