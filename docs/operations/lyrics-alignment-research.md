# 歌詞對齊：本機研究試用手冊

這是開發者手動研究流程，不是App正式選配安裝器。模型取捨及未決項見[研究結論](../research/lyrics-alignment-summary.md)，當輪證據見[實測報告](../research/lyrics-hfa-small-listening-trial-2026-10-19.md)。正式gate與預設下載維持不變。

## 執行前提

- 在repo根目錄執行，使用既有npm環境與受驗證的模型／FFmpeg。Provider Python不共用。
- 下列路徑記錄2026-10-19這台工作區；換環境須提供自己的絕對路徑及固定資產config。Git checkout不附歌曲、權重、private config或人工標註。
- 本批19列聽查包綁定固定16案與原收據，不能換歌後沿用既有答案或hash；新音訊可另外使用trial。
- 服務只綁127.0.0.1，需保持終端執行。以下port可改；不要把本機URL當永久部署。實際畫面／播放仍待人工確認，先前代理開啟因自動審核服務容量不足未執行。

## 直接聽查

啟動服務後可開啟 [聽查頁](http://127.0.0.1:18744/)。來源在 `.tmp/lyrics-new-eval/listening-v2/`，原15案後附4個漏詞對照，共19列。音訊依SHA去重複製；不需載入任何模型即可聽查。若服務已結束，在 repo 根目錄執行：

```powershell
node scripts/research/lyricsFreshEvaluation/listeningPage.cjs serve E:\Utawakui\.tmp\lyrics-new-eval\listening-v2 18744
```

先按「播放此句」或「播放前後文」，獨立填內容及起音。秒數使用整段音訊時鐘；不確定的起音留空。再展開四候選比較，最後由本人勾選完成。播放、模型結果與代理條件都不會自動變成人工判斷；這是風險定向抽查，不稱盲測。

「備份草稿」保留未完成內容與起音；「匯出人工標記」只輸出明確完成的判斷，未完成列保持 pending。兩種檔案均可用頁面上的載入功能恢復；JSON 匯出不會覆寫原53列 labels。審查者代號是本人填寫，沒有獨立身分驗證。

人工標記匯出後，以新 receipt 接收，不能拿草稿格式充當人工結果：

```powershell
node scripts/research/lyricsFreshEvaluation/listeningReview.cjs E:\Utawakui\.tmp\lyrics-new-eval E:\Utawakui\.tmp\lyrics-new-eval\listening-v2 <匯出的labels絕對路徑> <全新receipt絕對路徑>
```

匯入驗證語料、sample／UTF-16切點、毫秒範圍／順序、模型收據、頁面及音訊SHA；只評本頁19列且明確完成、非 uncertain 的標記。內容錯配接受、相符句被內容檢查拒絕、漏詞警示與人工時間誤差分開。正常誤拒的分母是該模型原本有詞塊且人工內容相符的句；人工已標但候選缺界仍列 missing。不將其推廣為歌曲母體的錯誤率。

## 本機試用及下載

新增 `trial.cjs`，只跑原HubertFA和Whisper small；不用Qwen、Torch或GPU。現有本機環境已通過資產驗證與4案實推論：中文／日文正常、中文靜音、中文漏詞。v1 在推論前明確限制 WAV、`main.vtt`、中日案例，輸出必須是全新絕對目錄。原音訊只讀，生成檔在隔離副本；沒有 App 設定／IPC／activation 寫入。

```powershell
node scripts/research/lyricsFreshEvaluation/trial.cjs verify tasks/acoustic-phase2-runtime.json .tmp/lyrics-new-eval/config.json
node scripts/research/lyricsFreshEvaluation/trial.cjs run tasks/acoustic-phase2-runtime.json .tmp/lyrics-new-eval/config.json tasks/lyrics-hfa-small-trial-cases.json .tmp/lyrics-new-eval/references.json E:\Utawakui\.tmp\my-hfa-small-trial
```

`verify` 只表示固定資產通過檢查，會標記尚未載入驗證；`run` 才實際載入兩模型、保留 raw ASR 並產生 `preview.json`。預覽包含原T1和獨立模型詞塊，不是產品可自動套用的 sidecar。缺少內容證據為未知，不偽裝已確認。取消使用 Ctrl+C；取消／載入失敗不會建立完成的 preview，也不覆寫原歌詞。已完成的研究副本可保留診斷，下一次改用全新目錄。

需要另準備資產時，可主動執行以下下載命令；固定清單在 [trial-assets.json](../../scripts/research/lyricsFreshEvaluation/trial-assets.json)，全部直接指向既有官方固定版本，不使用latest、鏡像或任意輸入URL。

```powershell
node scripts/research/lyricsFreshEvaluation/trial.cjs download E:\Utawakui\.tmp\my-hfa-small-downloads
```

9個檔案合計778,532,833 bytes（約0.779GB）：CPython embed、兩個wheel、原HubertFA archive、兩個固定source檔及source LICENSE、Whisper.cpp CPU binary archive與small權重。下載逐塊限量／SHA驗證，取消或錯誤不發布該檔案；全部下載成功的receipt仍明確標記「尚未安裝」。本輪未重新連線下載或驗收全新安裝；既有npm依賴、FFmpeg、解壓空間與研究音訊另計，不將0.779GB冒稱完整安裝或峰值容量。

其他機器須依 [HubertFA環境說明](../../scripts/research/lyricsAcoustic/README.md#local-assets)準備隔離 runtime／wheel 目錄，並依固定manifest核對模型、vendor與FFmpeg。small使用CPU `whisper-cli.exe`、同版本DLL及`ggml-small.bin`；另建專用raw目錄，以既有候選工具的`snapshot`產生本機asset manifest。程式不依賴本機Qwen資產；目前這台的config雖含其他候選，trial只讀small分支。下載完成不等於可執行環境，此流程不是新的自動安裝器，也不寫Provider Python。

## 重建本批聽查包

保留原始資料，依序使用全新絕對輸出目錄：

```powershell
node scripts/research/lyricsFreshEvaluation/completenessReplay.cjs <原研究根目錄> <全新replay目錄>
node scripts/research/lyricsFreshEvaluation/listeningPage.cjs build <原研究根目錄> <全新聽查目錄> <replay目錄/results.json>
```

命令參數及原始案例格式見[工具說明](../../scripts/research/lyricsFreshEvaluation/README.md)。人工pending、下載完成與資產驗證都不可替代實際品質或環境載入驗收。
