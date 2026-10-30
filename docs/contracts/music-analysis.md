# 音樂分析契約

BPM／節拍（M1）與段落（M2）分析的資料、驗證、投影與品質門檻。執行環境見 [ADR 0014](../adr/0014-audio-python-runtime-family.md)；歌詞時間見[時間契約](lyrics-timing-contract.md)。

## 現況

- 可執行契約 v1（2026-08-24）。數值上限在 `shared/musicStructureContractValues.json`，main 的驗證器是 `electron/lib/musicStructureContract.js`。
- 產品 profile 固定為 Beat This! 1.1.0 `beat-this-small0-cpu-v3`；`final0` 只在 CLI 比較中使用。Settings 提供準備、進度、修復、移除與預設開啟的「匯入後自動分析」，不顯示模型身份或選擇。
- 下載或本機匯入成功後，在 gate 與能力就緒時排入 main 的背景分析；失敗不讓匯入失敗。F5 工作台擁有明確重跑與批次（最多 500 個 track id ＋ force），預設略過 profile 仍受支援的結果，v2 sidecar 會在批次中重算為 v3。
- 尚未公開為正式能力：須通過有標註的準確度、OS 層級離線、授權告知、容量、失敗復原與人工 UI 驗收。

## 訊號邊界

以下各自獨立：source BPM、beat 時間、downbeat 與小節位置、段落區間與 canonical role、confidence 與 provenance、使用者覆寫、播放器 tempo。

- 改播放速度不改寫分析出的 BPM；呈現透過 canonical 播放時鐘與 rate 映射。
- 音樂分析不產生逐字時間，也不會悄悄啟動人聲分離。
- 自動分析是可移除的選用能力，失敗不阻擋歌詞編輯或播放。
- 手動分析、元件準備／修復／移除與批次的非預期失敗由 main 記錄；忙碌、取消、未安裝、曲目不存在與無效請求屬預期狀態，不記錄。批次結束時以一筆摘要記錄失敗數與第一個錯誤。工作台只顯示元件狀態讀取失敗；元件操作失敗由同一份 task 通知附重試呈現。

## 儲存

- Sidecar 為 `tracks/<trackId>/analysis/music-structure.json`，只由 main 讀寫。保存時驗證完整文件、比對 main 推導的音訊 SHA-256，再以暫存檔替換原子寫入。讀取受 byte 上限，只在 sidecar 存在時串流計算 hash；hash 只在曲目或曲庫 revision 變更時重算，不在播放 tick 中執行。
- Renderer 只傳 track id，只收到 M0／M1／M2 公開投影；provenance、原始 bytes 與路徑留在 main。
- 文件含 `source`（sha256、durationMs）、`analyzer`（contractVersion、id、profileId、environmentLock、modelIds、completedAt）、`tempo`（bpm、confidence 或 `null`）、`beats[]`（timeMs、positionInBar、confidence）、`sections[]`（sectionId、startMs、endMs、role、rawLabel、confidence）。Provenance 以文件為單位，不在每個 section 重複。
- 使用者覆寫是另一份 v1 文件（`tempoOverride` 的 bpm／anchorTimeMs／beatsPerBar，與 `sectionOverrides`），永不改寫分析結果，讓分析可重新產生。
- 來源改變或遺失時保留 sidecar 但標為 stale／unavailable，不套用到不同音訊。

## 驗證規則

- 只接受宣告的欄位；路徑、命令、參數、播放 rate 與歌詞時間 fail closed。未知版本 fail closed，舊版 App 不改寫。
- 時間為非負整數毫秒，不超過來源長度加 1,000 ms；beats 與 sections 單調、不重疊。
- BPM 20–400；confidence 0–1，缺值不視為確定。數量、字串長度、文件大小依共用 JSON 上限。
- Role 只能是 `intro`、`verse`、`pre-chorus`、`chorus`、`bridge`、`instrumental`、`outro`、`unknown`；未知 raw label 對應 `unknown`。Raw label 不能成為 CSS class、模板 id 或 selector。
- **M2** 只在段落從 0 開始、完全相鄰、結束於來源長度 1,000 ms 內，且每段都不是 `unknown`、confidence ≥ 0.5 時成立。任一段不合格就整份降為 M1；不補洞、不推論鄰段。Producer 在發布前與 consumer 讀取時套用相同規則。
- 遺失、無效、不支援或 stale 的分析一律回到 M0，驗證器不修復或改寫。

## 分析與執行

- Main 推導來源 fingerprint，經 Audio Python 的固定 FFmpeg decode profile 執行；heavy-job scheduler 預設 ML 並行 1。Worker 只收到 App 推導的路徑與 profile／model id，renderer 不能啟動下載或選擇參數。
- Beat This! v3 以最多四拍的窗取每拍時長中位數推得全域 BPM；beat／downbeat 不變。介面標示 BPM 為估計值、最多一位小數，confidence 標為 beat confidence。不自動做半／倍速修正。
- 批次為 main 持有的記憶體狀態，保留一份有界 snapshot 供 F5 重新掛載；每首走單曲分析服務。公開狀態只有計數、allowlisted 階段與原因、進度與逐曲狀態。
- All-In-One 3.1.0 是完整結構分析的第一候選，已完成 Windows CPU 本機 smoke，但不是發行依賴。套件為 MIT，但 Harmonix checkpoint 標示 CC-BY-NC-SA-4.0、HTDemucs checkpoint 缺少產品使用授權；權利證據衝突或缺失時 fail closed。其內部四軌 Demucs 輸出是中間資料，工作結束即刪，不取代 ADR 0009 的 Refined 路線。
- 每個新增依賴都需要 consumer、量測效益、可替換介面與移除路徑；不因 Python 環境已存在就安裝多個分析器。

## 歌詞與 Output 投影

- Output v3 以 `music-structure.document` 傳送 M1／M2，document id 以音訊 SHA-256 revision 為 key，只含公開 identity、長度、tempo、beat／downbeat 與 canonical 段落。動態 snapshot 只帶可為 null 的 `{ documentId, documentRevision }`，不在每個 tick 重送。遺失、stale、M0 或曲目不符時送 null 並保留原呈現。
- 所有歌詞模板收到相同的 `lyricsRhythm` 投影：連續四拍、每拍 confidence ≥ 0.5、間隔在局部中位數 75%–125% 時才使用實際 beat，提供目前／下一拍、行內拍序、進度、拍長與限制在 0.75–1.35 的 motion scale；單行超過 128 拍時省略行內計數。格線不成立時，有信心的 BPM 只提供 cadence，不提供相位；證據不足則不投影。
- 目前可選模板中只有 `karaoke-stack` 消費 beat phase 與段落；其他模板維持只用時間的 fallback。音樂 wake 不改變歌詞 identity，不重播換行動畫。Reduced motion、`unknown`、低信心與 M0 維持靜態呈現；T2 逐字進度是獨立圖層。
- 播放 rate 改變到下一個 cue 的實際延遲；歌詞 offset 把 beat 映射到歌詞時鐘，兩者都不改寫來源。

## 品質門檻

評估器不讀路徑，資料皆以不透明 case id 表示；私有語料與結果放 ignored 的 `tasks/`，不提交音訊、曲名、藝人、檔名、路徑、URL 或 hash。合成 fixture 只證明評估器行為。門檻只在公開新 benchmark id 並說明理由時才可改，不得看到失敗後放寬。結果為 `insufficient-data`、`fail` 或 `pass`。

### BPM（M1）

- 至少 30 首人工確認的固定速度歌曲，涵蓋 J-pop、K-pop、karaoke 與慢／中／快速度帶；有爭議的節拍層級、rubato、變速放到另外的挑戰語料。
- 先鎖定語料；predictions 須帶由 schema、benchmark id、容差、case id、tags 與參考 BPM 算出的 fingerprint。`completed` 帶 BPM 或 `null` 與診斷用 `beatEvidenceConfidence`（非機率、不參與門檻）；`failed` 帶錯誤碼。
- 容差 4%，分類為 match、half-time、double-time、unrelated；`null` 為 missing，失敗另計。半／倍速算錯誤。

| 門檻              | 初始值 |
| ----------------- | -----: |
| 直接命中率        | ≥ 0.90 |
| 各必要 tag 命中率 | ≥ 0.80 |
| 半／倍速錯誤率    | ≤ 0.05 |
| 無關錯誤率        | ≤ 0.05 |
| 缺值率            | ≤ 0.05 |
| 分析失敗率        | ≤ 0.05 |

30 首只是 pilot；正式 profile 升級須更大的鎖定語料，或 tuning 加未動用的 holdout。2026-08-28 的正規化研究後，owner 核准四拍估計器為 v3 profile。

### 段落（M2）

- 評估預訓練的 All-In-One `harmonix-fold0`，不授權訓練。通過只證明標註語料上的效用，不取代授權、離線、容量與 UI 門檻。
- 至少 30 首，`j-pop`、`k-pop`、`karaoke` 各至少 10 首（可重疊），涵蓋不同編曲、人聲密度、live／錄音室、無人聲前奏、間奏、轉調與縮短副歌。參考分段須從 0 到長度、至少兩段、只用 canonical role（不可用 `unknown`）。
- 邊界 F1 不計頭尾，分 ±500 ms 與 ±3000 ms；role 準確度以時長加權，未覆蓋與 `unknown` 算錯；M2 資格沿用產品規則；指標為逐曲 macro 平均，各必要 tag 另有門檻。失敗推論三項皆計 0。

| 門檻                    | 初始值 |
| ----------------------- | -----: |
| 邊界 macro F1，±500 ms  | ≥ 0.50 |
| 邊界 macro F1，±3000 ms | ≥ 0.75 |
| Role 時長準確度         | ≥ 0.65 |
| 合格 M2 比例            | ≥ 0.60 |
| 各必要 tag role 準確度  | ≥ 0.55 |
| 各必要 tag M2 比例      | ≥ 0.50 |
| BPM 半／倍速錯誤率      | ≤ 0.10 |
| 缺少 BPM 比例           | ≤ 0.05 |
| 分析失敗率              | ≤ 0.05 |

LinkSeg 與 Hybrid-Net 因 checkpoint 權利與 Windows 封裝證據較弱而不採用。只有預訓練結果在確認標註品質後仍明顯失敗，或 checkpoint 權利無法釐清時才考慮訓練。

## 執行評估

範本：[BPM 語料](music-analysis-bpm-benchmark-template.json)、[BPM 計分 run config](music-analysis-bpm-run-config-template.json)、[BPM runtime smoke](music-analysis-bpm-smoke-run-config-template.json)、[M2 語料](music-analysis-m2-benchmark-template.json)。先複製到 ignored 目錄再填寫。

```powershell
npm run analysis:benchmark-real -- tasks/<run-config>.json     # schema v2 計分或 v3 smoke
npm run analysis:evaluate-bpm -- tasks/<corpus>.json tasks/<results>/bpm-predictions.json tasks/<report>.json
npm run analysis:benchmark-real -- tasks/<m2-run>.json          # 可加 --case <id>、--force
npm run analysis:evaluate -- tasks/<m2-real>.json tasks/<m2-report>.json
```

- Run config 把不透明 case id 對應到目前曲庫的 trackId 與毫秒長度；runner 只接受內建的 small0／final0 manifest，逐首解碼暫存 WAV 並刪除，cache 綁定音訊、worker、profile 與模型。BPM 計分不接受 `--case`，因為部分結果無法對上整份語料。比較 `final0` 時只改 `outputRoot`、`modelManifestPath`、`modelPath`，結果分開存放。
- Schema v3 smoke 不含參考 BPM，產出 `evidenceKind: "bpm-runtime-smoke"`，無法通過計分驗證，只量測完成率、缺值與耗時。
- 輸入上限 8 MiB、500 個 case；報告以原子方式寫入且不能覆蓋輸入。
- **人工標註**（F5 →「人工標註」分頁）：main 擁有 run config 選擇器與不透明 session，只讀寫 `<outputRoot>/reference-worklist.json`，此模式不讀 predictions。只可用相符的 M1 beat 結果當非語意時間輔助（±300 ms 吸附 downbeat）。快捷鍵：`B` 插入邊界、`1`–`7` 指定 role、`Shift+1`–`7` 插入並指定下一段、`Alt+←／→` 移動 100 ms、`N` 下一個未完成、`Ctrl／Cmd+S` 保存；閒置時也自動保存，較舊的保存不覆蓋較新的編輯。草稿不發布 sidecar。
- **Benchmark Review**（F5 →「Benchmark」分頁）：唯讀檢視對應曲目、BPM、耗時、M1／M2 結果、段落時間軸與信心；點段落會讓播放器跳到該處。須先完成並保存盲標再切換，不得把模型輸出當參考答案。

## 延後決定

自動逐字／音節對齊與其信心 UX、人工修正 UI、變拍與階層段落、Output v3 cue stream 的長期相容期、是否保留解碼快取、GPU 加速。
