# 歌詞對齊：本機研究試用手冊

App 設定頁的「歌詞分段提示（實驗性）」集中管理研究環境與自動分析，環境管理及片段研究工具預設收合；下文保留開發者 CLI 與私有案例聽查流程。兩者都不是正式歌詞模型啟用。模型取捨及未決項見[研究結論](../research/lyrics-alignment-summary.md)，當輪證據見[實測報告](../research/lyrics-hfa-small-listening-trial-2026-10-19.md)。正式gate與預設下載維持不變。

## 實驗性自動產生、手動套用

此功能預設關閉。先依下節手動下載研究環境，再啟用音訊處理功能，並在同一「歌詞分段提示（實驗性）」區塊在「伴奏完成後分析歌詞」開啟「自動分析」。不會自動下載模型，也不掃描舊伴奏。

新伴奏成功後接續分析中／日／英整句歌詞，採曲庫偏好來源，沒有偏好則選支援語言來源；沒有支援來源或環境缺少／損壞會顯示跳過。重新啟動後，第一項分析會先驗證已安裝環境的實際載入。分析排程與伴奏獨立，取消／失敗保留伴奏，可在本章查看狀態、取消或重試。

來源語言未知時，會依歌詞正文保守辨識中文／日文／英文，不依歌名或歌手猜測。純漢字短句、混合或不足的證據保留未知；重試列可在「本次分析語言」選自動辨識、中文、日文或英文，再按「重試分析」。手動選擇只作用於本次工作，不修改來源語言、偏好來源或校時。任務保留選擇供再次重試，新的伴奏仍使用自動辨識。跳過原因分開提示缺少歌詞、語言未知／不支援、缺少整句時間，以及已有逐字時間；完整 T2 直接沿用，不重做分析。

在歌詞頁開啟「顯示 → 管理來源 → 可用歌詞」，下方「詞塊分析（實驗性）」只操作目前選用來源。選擇「本次分析語言」，按「分析詞塊／重新分析」；等待或分析中可按「取消分析」。視窗顯示準備、對齊及內容查核的實際進度；準備時不估算百分比，其他階段顯示已完成／總音訊片段數。詳細說明預設收合。不需要重做伴奏；切換來源仍用原有來源選單，分析前與發布前會核對選用來源，變更時不會誤分析另一份歌詞。缺少環境或未啟用時依提示至設定準備，不會自行開啟或下載。

完成後在同一視窗按「套用詞塊」，才在本機歌詞與支援詞塊的 Output 模板顯示模型起點；按「停用詞塊」立即還原，歌詞頁既有快捷也使用同一套用狀態。T1 代表來源整句時間、T1+ 代表可用的模型估計並另示未套用／使用中及成功句數；來源 T2 代表來源本身提供片段時間，可能只有部分句子具備。T1+ 不改寫來源成 T2，也不代表人工時間驗收通過。來源 T2 優先，不支援或拒絕的句子沿用 T1。來源、歌詞更新及重新啟動後須重新套用。假名讀音顯示維持原版面；Self-View 維持原路徑。Output 啟用時，同一套用／停用會同步至 Browser Source：沿用現有 T2 詞塊／分句樣式，不新增顯示模式。T1+ 只在起音高亮，不產生連續填色或唱完時間；來源 T2 保留原有精確時間顯示，其他句子回退 T1。切來源、改校時或停用同步還原，取消／失敗不影響原歌詞與伴奏。原本不消費 T2 的模板（如直排）維持原顯示。此操作不會自行啟動 Output。

分析已使用儲存的來源 offset 定位音訊，不須歸零或再手動偏移模型結果。offset 變更會立即解除套用，舊估計失效並提示「校時已變更，請重新分析」，重啟後讀取也會保留此原因；儲存校時中或儲存失敗時不允許開始分析。固定前奏差宜先校時再分析；不同版本、刪節或累積漂移不能只靠 offset 修正，目前沒有自動伸縮時間軸。

英文沿用已安裝的 HubertFA 英文字典與 small，不新增模型下載；以單字分段、縮寫只在內容比對時展開。內容證據不足或字典外詞會回退 T1；疑似漏詞僅警示，套用前請確認，模型不補寫歌詞。新驗證配方需要重新分析舊估計。英文及本輪構造案例的範圍見[英文實測](../research/lyrics-english-validation-2026-10-20.md)。

估計另存於曲目 `lyrics/experimental-estimates/`，不覆寫原歌詞、來源偏好、offset 或人工逐字資料。整曲以有界視窗處理，輸入仍為原混音；這項流程驗證不代表任意曲長、語言或時間精度已驗收。人工時間驗收後置，正式 catalog gate、預設下載與權重授權未決項維持原狀。

## App 內試用

混語長句可在同一「可用歌詞」視窗展開「長句分段預覽（實驗性）」，最多列出目前來源的 20 句候選。這是文字規則提出的兩段，不代表模型已理解語意；短外語插詞、引號內文或不足的邊界證據不強制拆開。來源 T2 或已手動套用的 T1+ 必須能在所選斷點精確提供起點，兩段才會跟隨既有播放時鐘切換。缺少時間時僅列文字候選，保留整句，不按字數均分時間。

Kinetic Pop 是第一個使用此分段時間的 Output 模板；切換來源、停用 T1+ 或變更 offset 後沿用既有來源／估計失效機制。其他模板保持各自的分行方式。此功能沒有新增模型或下載，亦未新增混語 HubertFA 推論或放寬 20 秒單句模型上限；混語 T1 仍可能回退。文字分段品質及人工時間驗收都待確認。分母與限制見[混語長句實測](../research/lyrics-mixed-phrases-2026-10-21.md)。

1. 到「設定 → 歌詞分段提示（實驗性）」，直接查看環境狀態。單純讀取狀態不會下載或載入模型；手動研究預覽不需要啟用音訊處理功能。
2. 先在上方準備 App 管理的 FFmpeg，再按「下載工具」。下載固定官方版本 HubertFA＋Whisper.cpp small、獨立 Python 及兩個套件；不使用 Provider Python、Qwen、Torch 或 GPU。
3. 等待下載、SHA／完整安裝樹檢查與兩個模型實際載入。重新啟動 App 後須按「檢查工具」，狀態讀取不會自動下載或載入。
4. 展開預設收合的「片段預覽（進階）」，選曲庫歌曲、中文／日文／英文及開始句，按「產生預覽」。採曲庫偏好歌詞來源，未設定則採指定語言來源；須有曲長與時間歌詞，每次最多約 30 秒／10 句。選擇改變、曲庫更新或收合工具即清除舊預覽；收合不取消進行中的工作，外層仍可取消。
5. 「從本句播放」使用既有播放器。預覽標明原生 T2、研究詞塊或 T1 回退；small 內容矛盾收起研究詞塊，疑似漏詞僅提示，不補字、不改時間。不寫正式 sidecar、來源偏好、offset 或 Output。

環境存於 App userData 的 `lyrics-research/installed`，與正式 capability 的 activation 分開。下載約 0.779 GB、安裝約 0.997 GB；另重用約 0.222 GB 的固定 FFmpeg 與 App Node 依賴，預留至少 4 GB 可用空間給下載、修復與曲目副本，不是峰值 RAM 保證。此版須符合研究 manifest 的固定 FFmpeg；任意系統版本不宣稱通過。

「取消」在外層保留，等待下載／owned workers／暫存清理後才結束；失敗不交付完成預覽，原歌詞照常使用。「工具管理與詳細說明」預設收合，內有重新驗證、重新下載修復與移除；需要修復時也會在主要動作直接顯示。替代環境載入通過後才交換；移除只清理此功能自己的安裝與殘留暫存。HubertFA 權重／字典使用與分發證據仍未解決，不宣稱開源或非商用即可使用；正式 gate 與預設下載不變。人工時間驗收後置，未填的人工起音維持 pending，不以模型預覽填答。

## 執行前提

- 在repo根目錄執行，使用既有npm環境與受驗證的模型／FFmpeg。Provider Python不共用。
- 下列路徑記錄2026-10-19這台工作區；換環境須提供自己的絕對路徑及固定資產config。Git checkout不附歌曲、權重、private config或人工標註。
- 本批19列聽查包綁定固定16案與原收據，不能換歌後沿用既有答案或hash；新音訊可另外使用trial。
- 服務只綁127.0.0.1，需保持終端執行。以下port可改；不要把本機URL當永久部署。本機瀏覽器已驗證中日案例播放、比較面板與草稿匯出／載入；歌詞內容及起音仍由本人聽判。

## 直接聽查

啟動服務後可開啟 [聽查頁](http://127.0.0.1:18744/)。來源在 `.tmp/lyrics-new-eval/listening-v2/`，原15案後附4個漏詞對照，共19列。音訊依SHA去重複製；不需載入任何模型即可聽查。若服務已結束，在 repo 根目錄執行：

```powershell
node scripts/research/lyricsFreshEvaluation/listeningPage.cjs serve E:\Utawakui\.tmp\lyrics-new-eval\listening-v2 18744
```

先按「播放此句」或「播放前後文」，獨立填內容及起音。秒數使用整段音訊時鐘；不確定的起音留空。再展開四候選比較，最後由本人勾選完成。播放、模型結果與代理條件都不會自動變成人工判斷；這是風險定向抽查，不稱盲測。

左欄由上到下的前15列就是原優先案例；最後4列為漏詞對照。可依序完成，不必先執行模型：

| 案例                              | 優先檢查                                                     |
| --------------------------------- | ------------------------------------------------------------ |
| r-019、r-032、r-048               | 整句合成靜音；比較HubertFA原詞塊與加small後的回退            |
| r-040                             | 中文正常句是否被small誤拒；繁簡與時間窗影響                  |
| r-037、r-042、r-006、r-028、r-004 | 日文早／晚起音、缺詞界與長尾；獨立聽判，provider時間只作對照 |
| r-047                             | 日文重複片語及缺詞界，注意同句不同occurrence                 |
| r-045                             | 長尾改善的對照案例                                           |
| r-052                             | 混合文字／英文的既有不支援回退，不當成ASR誤拒                |
| r-033、r-010、r-005               | 正規化後仍應擋住的錯配對照                                   |
| r-012、r-025、r-021、r-014        | 額外漏詞對照；警示不等於補字或確認完整                       |

「備份草稿」保留未完成內容與起音；「匯出人工標記」只輸出明確完成的判斷，未完成列保持 pending。兩種檔案均可用頁面上的載入功能恢復；JSON 匯出不會覆寫原53列 labels。審查者代號是本人填寫，沒有獨立身分驗證。

人工標記匯出後，以新 receipt 接收，不能拿草稿格式充當人工結果：

```powershell
node scripts/research/lyricsFreshEvaluation/listeningReview.cjs E:\Utawakui\.tmp\lyrics-new-eval E:\Utawakui\.tmp\lyrics-new-eval\listening-v2 <匯出的labels絕對路徑> <全新receipt絕對路徑>
```

匯入驗證語料、sample／UTF-16切點、毫秒範圍／順序、模型收據、頁面及音訊SHA；只評本頁19列且明確完成、非 uncertain 的標記。內容錯配接受、相符句被內容檢查拒絕、漏詞警示與人工時間誤差分開。正常誤拒的分母是該模型原本有詞塊且人工內容相符的句；人工已標但候選缺界仍列 missing。不將其推廣為歌曲母體的錯誤率。

## 本機試用及下載

`trial.cjs`只跑原HubertFA和Whisper small；不用Qwen、Torch或GPU。本機已從本輪固定下載資產手動準備全新的隔離環境，通過資產驗證與4案實推論：中文／日文正常、中文靜音、中文漏詞。v1 在推論前明確限制 WAV、`main.vtt`、中日案例，輸出必須是全新絕對目錄。原音訊只讀，生成檔在隔離副本；沒有 App 設定／IPC／activation 寫入。

```powershell
node scripts/research/lyricsFreshEvaluation/trial.cjs verify .tmp/hfa-trial-environment-20261019/hfa-runtime.json .tmp/hfa-trial-environment-20261019/small-config.json
node scripts/research/lyricsFreshEvaluation/trial.cjs run .tmp/hfa-trial-environment-20261019/hfa-runtime.json .tmp/hfa-trial-environment-20261019/small-config.json tasks/lyrics-hfa-small-trial-cases.json .tmp/lyrics-new-eval/references.json E:\Utawakui\.tmp\my-hfa-small-trial
```

`verify` 只表示固定資產通過檢查，會標記尚未載入驗證；`run` 才實際載入兩模型、保留 raw ASR 並產生 `preview.json`。預覽包含原T1和獨立模型詞塊，不是產品可自動套用的 sidecar。缺少內容證據為未知，不偽裝已確認。取消使用 Ctrl+C；取消／載入失敗不會建立完成的 preview，也不覆寫原歌詞。已完成的研究副本可保留診斷，下一次改用全新目錄。

需要另準備資產時，可主動執行以下下載命令；固定清單在 [trial-assets.json](../../scripts/research/lyricsFreshEvaluation/trial-assets.json)，全部直接指向既有官方固定版本，不使用latest、鏡像或任意輸入URL。

```powershell
node scripts/research/lyricsFreshEvaluation/trial.cjs download E:\Utawakui\.tmp\my-hfa-small-downloads
```

9個檔案合計778,532,833 bytes（約0.779GB）：CPython embed、兩個wheel、原HubertFA archive、兩個固定source檔及source LICENSE、Whisper.cpp CPU binary archive與small權重。本輪已實際重新下載全部檔案並核對大小／SHA。下載逐塊限量／SHA驗證，取消或錯誤不發布該檔案；全部下載成功的receipt仍明確標記「尚未安裝」。

本輪手動組裝的模型、獨立Python、兩個套件、vendor與source license合計997,022,752 bytes（約0.997GB），另重用既有222,248,960 bytes的FFmpeg及repo Node依賴。保留下載與解壓後資產約需1.776GB，研究音訊、副本、raw結果與暫存另計；這不是峰值磁碟／RAM承諾，也不是全新機器的一鍵安裝驗收。

其他機器須依 [HubertFA環境說明](../../scripts/research/lyricsAcoustic/README.md#local-assets)準備隔離 runtime／wheel 目錄，並依固定manifest核對模型、vendor與FFmpeg。small使用CPU `whisper-cli.exe`、同版本DLL及`ggml-small.bin`；另建專用raw目錄，以既有候選工具的`snapshot`產生本機asset manifest。程式不依賴本機Qwen資產；上方新config只含small，舊config即使含其他候選，trial也只讀small分支。下載完成不等於可執行環境，此流程不是新的自動安裝器，也不寫Provider Python。

## 本輪流程驗證

兩模型各自的推論中取消與載入失敗均已實測：原歌詞、既有估計SHA不變，owned worker退出、jobs清空。下載串流收到官方資料後取消，也沒有成品或partial。修正研究CLI的SIGINT listener生命週期，讓相依套件不會在清理前重新送出中斷；實際coordinator的SIGINT檢查確認取消後沒有完成preview，也不啟動下一模型。這是同處理器的程式化驗證，沒有宣稱已人工操作所有終端的Ctrl+C。

本機HTTP十份去重音訊的HEAD／206 Range／416及拒絕寫入已驗證；瀏覽器可播放、展開比較、匯出並載入未完成草稿。原53列人工資料仍全部pending，不能據此回報真人誤接受／誤拒率。先前間歇worker失敗的歷史紀錄保留；單輪成功不表示已排除所有環境穩定性問題。

## 重建本批聽查包

保留原始資料，依序使用全新絕對輸出目錄：

```powershell
node scripts/research/lyricsFreshEvaluation/completenessReplay.cjs <原研究根目錄> <全新replay目錄>
node scripts/research/lyricsFreshEvaluation/listeningPage.cjs build <原研究根目錄> <全新聽查目錄> <replay目錄/results.json>
```

命令參數及原始案例格式見[工具說明](../../scripts/research/lyricsFreshEvaluation/README.md)。人工pending、下載完成與資產驗證都不可替代實際品質或環境載入驗收。
