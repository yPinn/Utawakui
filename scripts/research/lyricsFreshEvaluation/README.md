# 新歌詞對齊研究與人工抽查

僅供開發者在私有、可使用的本機音訊上實測；不接入產品下載、設定、IPC 或 gate。研究音訊、歌詞與人工填寫檔保留在 ignored 目錄，不隨程式或報告分發。

## 固定比較

先建立只讀 inventory（音訊路徑、source、normalizer canonical），排除前輪 track，再以 `prepare.cjs` 選中日各兩首、零 offset、至少三句完整 T1。日文優先有外部 provider 細時間，之後按 track id 排；中文沒有細時間不捏造。音訊 SHA 去重，inventory 歌詞 SHA 必須與目前來源一致；來源在解碼前後都驗證。相同 30 秒片段做四種條件：正常、同歌後續不同片語替換、輸入漏一詞、整句精確靜音。替換是合成 mismatch，不能推論已驗證自然 live／cover；靜音不等於把混音中的人聲單獨移除。

原有 `lyricsAlignmentCandidates/evaluate.cjs` 分別跑 Qwen 與 small，再由 `compare.cjs` 只套 small 內容矛盾檢查。沿用既存門檻：至少四個有效 ASR 字元，最高 LCS 內容相容率不超過 0.2 才拒絕整句；缺失／未知轉錄保留研究估計，不改任何 Qwen 時間。未定時 ASR 文字保留為歧義，不當成可拒絕的有效字元。無 VAD、base、新權重與自動下載。額外 ASR 文字只警示，不改歌詞或硬拒絕。

```powershell
node scripts/research/lyricsFreshEvaluation/prepare.cjs <inventory.json> <candidate-config.json> <全新絕對研究目錄>
node scripts/research/lyricsAlignmentCandidates/evaluate.cjs <config.json> qwen <cases.json> <references.json> <frozen目錄> <qwen輸出目錄>
node scripts/research/lyricsAlignmentCandidates/evaluate.cjs <config.json> small <cases.json> <references.json> <frozen目錄> <small輸出目錄>
node scripts/research/lyricsFreshEvaluation/compare.cjs <絕對研究目錄>
node scripts/research/lyricsFreshEvaluation/review.cjs export <絕對研究目錄>
node scripts/research/lyricsFreshEvaluation/review.cjs import <絕對研究目錄> <labels.json> <全新絕對receipt.json>
node scripts/research/lyricsFreshEvaluation/summarize.cjs <絕對研究目錄> <summary.json>
```

`prepare` 的研究根目錄不得已有 cases.json；候選輸出目錄須不存在。small raw evidence 寫在既有候選 asset root 內的專用新目錄，受原 adapter 路徑限制保護。模型、候選 runtime 和共享來源綁定執行時不可修改；本目錄不是候選推論依賴，可在推論時整理人工抽查流程。

## 判讀與人工驗收

自動報告分開列 constructed target 的輸出／回退、正常句保留、外部 provider 細時間一致性、固定分母的缺界與長尾。外部歌詞 provider 不是人工真值，合成案例不是自然版本分布；同曲衍生不能當獨立歌曲。漏掉輸入詞不表示剩餘詞塊全部錯誤；內容完整性另記。

`human-review/README.md` 是可播放的盲查入口，`labels.json` 全部預設 pending；先聽內容並獨立標起音，再看 A／B TSV。A／B 依列盲排；揭盲表留在包外且 rows SHA 與 manifest 綁定。匯出核對原結果、canonical、sidecar、來源與音訊，複製後重驗音訊 SHA；匯入再驗音訊、結果、揭盲表、sampleId、UTF-16 索引和時間。沒有人工資料不回報 0% 誤接受／誤拒；只列待審與分母 0。

人工誤接受是「未唱文字／唱詞不同卻輸出詞塊」；誤拒是「人工內容相符、原 Qwen 已輸出，small 檢查後回退」。漏字另外看 completeness 警示。時間只使用人工獨立填寫的 onset，未標和 uncertain 排除，已標但候選缺界列 missing；不以候選的輸出分母美化準確率。

## 失敗診斷與低成本消融

```powershell
node scripts/research/lyricsFreshEvaluation/diagnoseQwen.cjs <原研究絕對目錄> <全新capture絕對目錄>
node scripts/research/lyricsFreshEvaluation/lowCostReplay.cjs <原研究絕對目錄> <capture絕對目錄> <全新replay絕對目錄>
node scripts/research/lyricsFreshEvaluation/cropLeading.cjs <原研究絕對目錄> <全新crop絕對目錄>
```

Capture 使用未改的候選 RPC 保存原始 span，四首正常片段須重現原 chunks。Replay 另外使用既有 `tasks/acoustic-phase2-*.json` 及 `.tmp/lyrics-alt/runs/` 的舊22＋7案；這是既有私有研究布局，不是產品安裝依賴。核對輸入／參考／結果 bytes、原始映射、sidecar、音訊、窗口與模型；OpenCC 實際 bundle 和 validator 也納入研究 closure。新舊結果與原53列人審資料均不改寫。

`script-fold` 只用既有 OpenCC 做繁簡比較；`neighbor-rescue` 以精確±1.5s、有時間的強文字支持退回 unknown，不改時間；`advisory` 只作取捨控制。`span-interpolation` 是模型詞內插值，不能宣稱量到新起音；`disagreement-fallback` 比較整句退回均分的損失。`captured-exact` 重建原映射作控制。這些純後處理不建立可冒充正式來源的 sidecar。

Crop 是另有 method 的實推論對照：僅移除第一段可處理文字起點前2s以前的PCM，再把裁切offset加回一次；不看細參考、不改canonical或評分母。優先人審的 `PRIORITY.md` 是風險定向抽查，仍須真人聽判，不能當隨機盲測。

## HubertFA＋small 本機試用與聽查

此入口限本機研究，不改正式gate或預設下載。[本輪報告與操作](../../../docs/research/lyrics-hfa-small-listening-trial-2026-10-19.md)記錄15優先＋4漏詞案例、下載範圍及未驗證項目。

```powershell
node scripts/research/lyricsFreshEvaluation/completenessReplay.cjs <原研究絕對目錄> <全新replay絕對目錄>
node scripts/research/lyricsFreshEvaluation/listeningPage.cjs build <原研究絕對目錄> <全新聽查絕對目錄> <replay結果.json>
node scripts/research/lyricsFreshEvaluation/listeningPage.cjs serve <聽查絕對目錄> 18744
node scripts/research/lyricsFreshEvaluation/listeningReview.cjs <原研究絕對目錄> <聽查絕對目錄> <人工labels.json> <全新receipt.json>
node scripts/research/lyricsFreshEvaluation/trial.cjs verify <HubertFA-runtime.json> <small-config.json>
node scripts/research/lyricsFreshEvaluation/trial.cjs run <HubertFA-runtime.json> <small-config.json> <cases.json> <references.json或-> <全新trial絕對目錄>
node scripts/research/lyricsFreshEvaluation/trial.cjs download <全新下載絕對目錄>
```

聽查頁使用原53列labels格式；草稿備份另有明確格式，可保留尚未勾完成的判斷／起音，不當成人工成果。人工匯入只驗收所選案例，不覆寫原labels。播放／候選比較不會自動標成已審。

Trial v1先限制WAV／main.vtt／中日；使用原worker，另外由可取消coordinator直接管理owned jobs。每次輸入、模型、環境、內容比較程式有身分檢查，兩模型中任一步失敗或取消均無完成preview。`verify`不冒稱模型已載入，`download`不冒稱環境已安裝。下載器釘住9個固定artifact並做串流SHA／大小檢查，未解析安裝或寫入App activation；既有Node依賴與FFmpeg須另外準備。
