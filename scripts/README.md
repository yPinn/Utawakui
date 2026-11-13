# 開發工具入口

請在專案根目錄使用 npm。`npm run` 可列出全部入口。常用動作使用短名，例如 `dev`、`check`、`package`；同類操作以冒號分組，例如 `test:watch`、`package:unpacked`、`release:verify-installed`。多字名稱用連字號。

## 日常開發

- `npm run dev` 啟動桌面開發環境。`npm run dev:tools` 同時開啟 Chromium DevTools，`npm run dev:pseudo` 以假語系檢查翻譯版面。
- `npm run check` 依序檢查程式碼、Markdown 與格式。也可單跑 `npm run lint`、`npm run lint:md` 或 `npm run format:check`。需要套用修正時用 `npm run lint:fix` 或 `npm run format`。
- `npm test` 執行自動測試。`npm run test:watch` 持續監看變更，`npm run test:coverage` 加上覆蓋率門檻。
- `npm run build` 建置 renderer。`npm start` 建置後啟動桌面程式。
- `npm run clean` 清除可重建的建置、覆蓋率、Vite 快取與封裝產物。執行前先確認沒有仍在使用的封裝或驗證產物。

## 封裝、CI 與發版

- `npm run electron:install` 準備鎖定版本的 Electron 執行檔。`npm run build:runtime` 可獨立重建正式 runtime，封裝時也會自動重建。
- `npm run package` 產生未簽署的 Windows 安裝與更新檔。`npm run package:unpacked` 只產生可直接啟動的目錄。`npm run package:signing` 啟用選用的 Authenticode 簽署設定。三個入口都只產出本機檔案。
- `npm run release:verify-version`、`npm run release:verify-artifacts`、`npm run release:verify-installed` 分別檢查版號、發版產物及實際安裝。參數與流程見[發行手冊](../docs/operations/release-runbook.md)。
- `npm run lint:commit` 檢查最近一筆 commit。CI 的提交範圍與 `audit:prod`、`audit:all`、`audit:runtime` 執行條件見 [CI 手冊](../docs/operations/ci-usage.md)。
- `npm run license:inventory` 產生依賴清單。`npm run license:verify` 驗證第三方聲明，`npm run license:write` 重建聲明。

## 專項驗證與評估

- `npm run perf:startup` 量測啟動效能。`npm run test:settings-layout` 先建置，再透過 Electron 驗證設定視窗版面。
- `npm run output:verify` 唯讀檢查 Output 固定基線。`npm run output:audit` 執行外觀稽核，參數見[外觀驗收](../docs/operations/output-appearance-acceptance.md)。
- `npm run i18n:update-baseline` 更新介面字串檢查基線。
- `npm run analysis:benchmark -- <config.json>` 依設定檔執行 M2、BPM 計分或 BPM runtime smoke。單獨計分見[音樂分析契約](../docs/contracts/music-analysis.md#執行評估)。
- `npm run lyrics:contracts -- replay lrclib` 回放 Provider 契約。亦可回放 `netease`，`record` 會存取外部服務。操作見 [Provider 契約手冊](../docs/operations/lyrics-provider-contracts.md)。
- 私有歌詞語料的準備、審核與計分由各工具直接執行。參數及範例見[來源語料契約](../docs/contracts/lyrics-provider-evaluation-corpus.md#candidate-preparation)與[讀音品質契約](../docs/contracts/lyrics-reading-quality-contract.md#cli-and-artifacts)。

## 手動與研究工具

- [音訊／MV 時間對照探針](research/mediaAlignment/README.md)：本機同錄音的離線配對與既有歌詞時間搬移，使用既有 NumPy／FFmpeg；不寫曲庫，不由正式 App 載入。

Windows 快捷鍵 helper 可用 `node scripts/build-keyboard-shortcut-helper.mjs` 單獨重建；正式 beforePack 會在 runtime bundle 後自動執行。需 Windows x64 Framework compiler，產物進 ignored `.build/`；不在產品啟動時編譯或下載。固定資源與驗證見[全域快捷鍵契約](../docs/contracts/global-keyboard-shortcuts.md#windows-helper-與實體資源)。

下列工具保留直接執行方式，不為每支工具增加 npm 別名。帶私有輸入或模型的工具，先閱讀對應契約與程式的參數驗證；不要直接以正式曲庫試跑。

- [歌詞波形 backend](../prototypes/lyrics-waveform/README.md)：Node runner 使用已安裝的 FFmpeg／ffprobe 生成合成 fixtures，比較隔離 worker 與 Browser decode；實驗結果見連結報告。正式 worker／取消／封裝回歸由 `lyrics-waveform-main.test.mjs` 固定，ownership 見[波形契約](../docs/contracts/lyrics-waveform.md)。
- [NetEase Phase A 隔離評估](lyrics-provider-netease-cli.mjs)：歷史驗證與 Sentinel 工具，直接使用 `node scripts/lyrics-provider-netease-cli.mjs <command>`；固定子命令見程式的 usage，隔離條件見[歷史契約](../docs/archive/netease-isolated-technical-validation.md)。不屬於現行產品取得流程。

- [Output 短時效能 probe](output-performance-probe.mjs)：入口與參數見[外觀驗收手冊](../docs/operations/output-appearance-acceptance.md)。`output-performance-driver.cjs` 是受控子程序。
- [Artist photo 評估 CLI](artist-photo-provider-evaluation-cli.mjs)：接受 `<corpus.json> <observations.json> <reviews.json> <report.json> [--synthetic]`；人工審核與漂移門檻見[來源評估](../docs/research/metadata/artist-photo-sources-2026-10-05.md)。
- [Provider 語料換版](lyrics-provider-corpus-switch.mjs)：對 `.benchmarks/lyrics-provider/` 的候選與審核資料換版並保留前版；是會寫入資料的維護工具。現行 v3 以上替換與舊 v2→v3 遷移都有測試，不是一般評估入口。
- [封裝讀音評估](lyrics-reading-packaged-evaluation.cjs)：使用獨立於一般本機評估的封裝入口，見[讀音品質契約](../docs/contracts/lyrics-reading-quality-contract.md)。
- [ONNX 分離基線工具](audio-processing-benchmark.mjs)：重現[分離基線研究](../docs/research/audio/audio-processing-baseline-2026-08-22.md)，不是音樂結構／BPM runner。
- [BPM 正規化研究](music_analysis_bpm_normalization.py)：保留診斷擷取與未採用的半／倍速候選，見[研究決策](../docs/research/audio/music-analysis-bpm-normalization-2026-08-28.md)。不由產品 worker 載入，不代表產品會自動修正 BPM。其純 Python 測試可用 `python -B scripts/music_analysis_bpm_normalization.test.py` 執行。
- [Beat This! 封裝 smoke](beat-this-packaged-smoke.py) 與[結構分析封裝 smoke](structure-analysis-packaged-smoke.py)：分別驗證 M1／M2 環境及推論，參數用各檔的 `--help` 查詢；需要自行準備封裝、環境和模型，並會寫入指定輸出目錄。通過 smoke 不等於品質或授權門檻通過。
- [Audio Separator wheel patch](audio-separator-roformer-wheel-patch.mjs)：固定版本的研究 metadata patch，見[CPU lock 研究](../docs/research/audio/audio-python-separation-cpu-spike-2026-08-23.md)。
- [語言字集生成器](generate-content-language-charsets.mjs)：更新 OpenCC 依賴後重新產生 renderer 字集；相應 freshness 測試位於 `src/utils/contentLanguageCharSets.test.js`。
- [診斷檢視器](diagnostics-viewer.html)：獨立靜態頁，使用方式見[診斷手冊](../docs/operations/diagnostics-rollout.md)。
- [Windows 封裝驗證](verify-unsigned-windows-package.ps1)：由 CI／release workflows 與 installed acceptance 呼叫，不是多餘的本機入口。

## 目錄與邊界

- `lib/` 放讀音語料／評估的內部模組；根目錄 `*-cli.mjs` 多為命令入口，其同名前綴模組提供可測試邏輯。
- `fixtures/` 放合成測試與固定契約資料，不是暫存輸出。Provider cassette 以 provider 名稱組合路徑動態載入；不能只憑全文搜尋無命中刪除。
- `research/` 分別保留[聲學基線](research/lyricsAcoustic/README.md)、[候選對照](research/lyricsAlignmentCandidates/README.md)與[新曲／聽查工具](research/lyricsFreshEvaluation/README.md)。其中部分模組已被產品共用；實際發行名單以 `electron-builder.yml` 為準，見[封裝 inventory](../docs/operations/release-inventory.md)。不要整個移動或刪除 research 目錄。
- `lyrics-provider-netease-runtime/` 是獨立評估用 npm manifest／lock 與 opt-in 安全測試；本機 `node_modules/` 是該測試的依賴。受管理的評估 generation 則位於 `.benchmarks/lyrics-provider/netease-runtime/`，兩者用途不同。
- `*.test.mjs` 由 `vite.config.js` 收集；`*.test.py`／`*_test.py` 與 NetEase 的 `dependency-security.test.cjs` 需要各自的 Python／Node test runner，不能以「npm test 沒收集」判定棄用。獨立 NetEase 測試的準備與執行命令寫在該檔開頭。
- `outputAppearanceAudit.mjs`／`outputPerformanceProbe.mjs` 是共用實作，帶連字號的對應檔案是 CLI；Settings 的 `.mjs`／`.cjs` 則分別執行於 Node／Electron。這些不是重複副本。

新增工具時優先沿用既有領域入口。會反覆手動使用或由 CI 共用的流程才增加 npm 指令。變更檔案位置前，須同時核對 import、子程序路徑、測試收集、CI、source hash 綁定與封裝 allowlist。
