# 開發工具入口

常用命令由根目錄 `package.json` 維護；本頁說明用途與額外手動工具。請在專案根目錄執行，使用 npm。產品現況見[規格](../docs/spec.md)，研究結論見[研究索引](../docs/research/README.md)。

## 常用命令

| 用途           | 入口                                                                                                                                         | 說明                                                                                                          |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 開發與建置     | `npm run dev`、`npm run dev:tools`、`npm run build`                                                                                          | 桌面啟動與 renderer 建置                                                                                      |
| 程式與文件檢查 | `npm run lint`、`npm run lint:md`、`npm run format:check`                                                                                    | 檢查程式、Markdown 與格式                                                                                     |
| 自動測試       | `npm test`、`npm run test:coverage`                                                                                                          | scripts 下的 Vitest 測試由 runtime project 收集；coverage 命令另執行 ratchet                                  |
| 啟動與視窗量測 | `npm run perf:startup`、`npm run test:settings-layout`                                                                                       | 後者先建置，再由 Node launcher 啟動 Electron probe                                                            |
| Output         | `npm run output:baseline`、`npm run output:audit`                                                                                            | 固定資料契約與外觀稽核；操作見[外觀驗收](../docs/operations/output-appearance-acceptance.md)                  |
| 音樂分析       | `npm run analysis:benchmark-real -- <config.json>`                                                                                           | 同一 runner 依 config 處理 M2、BPM 計分及 BPM runtime smoke                                                   |
| 分析計分       | `npm run analysis:evaluate-bpm -- …`、`npm run analysis:evaluate -- …`                                                                       | BPM 與 M2 使用不同參考資料及門檻，見[音樂分析契約](../docs/contracts/music-analysis.md#執行評估)              |
| 歌詞來源評估   | `npm run lyrics:prepare-provider-corpus`、`npm run lyrics:review-provider-corpus`、`npm run lyrics:evaluate-providers`                       | 私有語料準備、人工審核與評估，見[語料契約](../docs/contracts/lyrics-provider-evaluation-corpus.md)            |
| Provider 契約  | `npm run lyrics:contracts -- replay lrclib`                                                                                                  | 亦可回放 `netease`；`record` 會存取外部服務，見[操作手冊](../docs/operations/lyrics-provider-contracts.md)    |
| 歌詞讀音評估   | `npm run lyrics:prepare-reading-corpus`、`npm run lyrics:review-readings`、`npm run lyrics:evaluate-readings`                                | 本機語料、人工審核與計分，見[讀音品質契約](../docs/contracts/lyrics-reading-quality-contract.md)              |
| 授權清單       | `npm run license:inventory`、`npm run license:verify`、`npm run license:write`                                                               | inventory／驗證／重建 notices；`afterPackThirdPartyNotices.cjs` 由 builder 呼叫                               |
| 發行           | `npm run dist:dir`、`npm run dist`、`npm run release:verify-version`、`npm run release:verify-artifacts`、`npm run release:verify-installed` | 操作及可選簽署流程見[發行手冊](../docs/operations/release-runbook.md)                                         |
| 可重建產物清理 | `npm run clean`                                                                                                                              | 清除 dist、coverage、Vite cache 與 release 目錄；先確認沒有仍在使用的封裝或驗證產物。研究資料與模型須另行核對 |

## 手動與研究工具

下列工具保留直接執行方式，不為每支工具增加 npm 別名。帶私有輸入或模型的工具，先閱讀對應契約與程式的參數驗證；不要直接以正式曲庫試跑。

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

新增工具時優先沿用既有領域入口；只有會反覆手動使用的頂層流程才增加 npm 指令。變更檔案位置前，須同時核對 import、子程序路徑、測試收集、CI、source hash 綁定與封裝 allowlist。
