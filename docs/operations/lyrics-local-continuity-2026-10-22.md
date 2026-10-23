# 本地 starts-only 歌詞連續掃字（2026-10-22）

本輪承接[前輪 KTV／本地填色](lyrics-ktv-local-fill-2026-10-22.md)。使用者確認本地仍並存兩種呈現，原因是有 fine 時使用細填色器，整句 starts-only 則保留粗分段與整句底色。分析結果不保存 CSS 樣式，既有檔案不需要因為這個顯示分流而重新分析。

## 本地修正與資料邊界

本地有效細時間、部分細時間與已套用的 starts-only 結果現在共用文字基底及填色器。清單／歌詞紙保留版面、讀音與捲動方式，移除整句底色切換；分段起點仍即時底線提示。沒有可用時間的行維持同基底與靜態底線，不把它偽裝成可掃字的分析結果。

`prepareLocalLyricsPaintFrame` 是本地專用 projection。合法模型 fine 仍沿既有區間和補間規則，已知停頓原樣保留。整句沒有 fine 時，先驗 coarse 版本、文字完整重建、grapheme 安全邊界、有序合法時間與既有容量上限，再以原 coarse 起點到下一個起點／既有行框建立 `display-estimate`。未知句尾不估尾段；衝突或無正區間維持靜態提示，不新增模型或猜唱字終點。

只有起點不能辨識段內換氣。這個估計表示顯示進度，不能當作聲學準確度改善；有 fine 的兩個區間之間若沒有待填文字，仍保持已填狀態直到下一起點，不強行填滿停頓。極短區間受畫格限制，沒有以最短動畫時間拖延原起點或終點。

`useExperimentalLyrics` 僅在本地 frame 提供 `paintTiming` 和原播放器的採樣時鐘。暫停／跳轉／速率或校時更新依現有 owner 取消舊動畫、直接定位，沒有逐幀 IPC、額外時鐘或追趕平滑。`fineTiming` 仍只代表原 fine；`estimatedStarts`、`estimatedFineTiming`、來源 T1／T2、publisher、sidecar 與能力統計都不加入估計。

Output 未接入本地 starts-only fallback，各模板外觀及既有時間行為維持。KTV 保留角色色／描邊／雙列，沒有底線。用同份《找》兩種資料、播放／暫停、兩種速率與三個取樣位置，共 1,536 組 Focus／KTV 投影逐值前後相等。

## 同份《找》的驗證方式

Baseline 是本輪開始的完整 dirty 工作樹快照，包含前輪尚未 commit 的歌詞變更及其他原有工作；不以 HEAD 取代它。After 只套用本輪的本地修改，保留其他 UI／佇列／offset 研究。

第一組使用實際保存的 32 句／29 ready／157 coarse／216 fine 原結果。第二組從同一份主程序已載入的合法結果建立記憶體副本，只移除 optional fine；文字、coarse 範圍／起點及來源時鐘保持一致。這是 renderer starts-only 相容性案例，沒有偽稱新的模型結果、重算 estimate ID、回寫來源，或宣稱它是另一份實際舊 schema 檔的 main-loader 驗收。

可見隔離 Electron 使用真 HTMLAudioElement／usePlayer／歌詞 owner／Panel／publisher→Hub→server→正式 Output。靜音 PCM 只作媒體時鐘代理，原 12–24 秒窗跑 pause／resume／seek／rate，offset 0、Output displayDelay 0。功能診斷另取實際 unsupported 行，等畫面捲動就位後核對靜態 cue；這項額外跳轉不納入正式效能批。

原結果的本地清單、starts-only 的清單／歌詞紙與修改前對照保留可見 PNG 與逐幀裁切。正式冷暖交錯批不開逐幀 computed-style 採樣；slow values、負值與未配對值保留。延遲是 coarse DOM active 相對相鄰原生媒體樣本 crossing 的觀測，與首個非零細填色分開；不是聲音真值、首字 paint 或硬體／OBS 呈現。

原結果功能重播在已知 16.200–17.100 秒停頓窗，本地 217／Output 216 個樣本各只有一個填色狀態；已知 fine 停頓沒有被估計填滿。Starts-only 副本缺少這項證據，該窗持續估計進度，不能把未知換氣說成已保留。修改前 starts-only 沒有細填色中間值；最終本地首字在同一觀測窗有 401 個不同中間值，暫停穩定窗內作用中填色保持一個狀態。Unsupported 行在畫面就位後為 0 fine cells、background none、underline，沒有整句底色；初版中途捲動畫面與尚未補靜態 cue 的功能收據也保留並分階段標記。

## 冷暖對照與未完成觀測

正式批共有 13 次嘗試、12 次完整觀測；每個資料／版本各 2 cold、1 warm。原結果 after 的第二次 cold 在視窗失效後得到 `Object has been destroyed`，未能收回 renderer 觀測；55 次 main 發布仍全部接受。沒有足夠事件判定關閉／失效原因，也無法重建該次可能的慢值，故單列 incomplete，不填零。以新 ID 單次補測後完成剩餘配對，原失敗報告未覆蓋。

完整 12 次的 1,045 次發布均接受，加未完成次共 1,100 次接受、0 reject。所有完整流程可比較的 crossing 配對成功。完整原值、負值、失敗分母及各模板／run 對應見[配對資料](data/lyrics-local-continuity-2026-10-22.json)。下表單位 ms；冷首字兩值依大小排列，並非同欄逐 run 配對。冷組含 Focus／KTV 各一次，暖組只有 KTV；cold 每組 36、warm 每組 18 個 crossing，p95 僅作小樣本描述。

| 本地資料／狀態   | 修改前首字    | 修改後首字    | 全 coarse p95 前→後 | 全 coarse max 前→後 |
| ---------------- | ------------- | ------------- | ------------------- | ------------------- |
| 原結果 cold      | 6.994／9.444  | 7.245／9.669  | 9.713→13.005        | 12.774→13.556       |
| 原結果 warm      | 14.199        | 5.956         | 14.904→12.627       | 14.904→12.627       |
| Starts-only cold | 5.969／10.301 | 6.834／10.229 | 13.511→10.981       | 14.207→12.529       |
| Starts-only warm | 10.525        | 5.385         | 12.534→12.497       | 12.534→12.497       |

| Output 資料／狀態 | 修改前首字     | 修改後首字     | 全 coarse p95 前→後 | 全 coarse max 前→後 |
| ----------------- | -------------- | -------------- | ------------------- | ------------------- |
| 原結果 cold       | 16.544／17.494 | 13.645／17.669 | 16.544→16.805       | 17.494→17.669       |
| 原結果 warm       | 2.000          | 1.656          | 11.521→14.839       | 11.521→14.839       |
| Starts-only cold  | 11.169／17.801 | 3.934／14.729  | 17.801→12.249       | 18.207→14.729       |
| Starts-only warm  | 10.725         | 5.285          | 12.634→12.602       | 12.634→12.602       |

Starts-only 本地 p95 在這批完整樣本下降，原 fine 結果的本地 cold p95／max 仍回退，Output warm 也有慢值回退，不能宣稱延遲普遍改善。未新增等待機制不等於所有觀測成本為零；這批沒有新增同次 stage trace，不猜同步工作／排程／畫格各自的因果。

## 收尾時的來源選擇變更

原 A/B 使用的歌詞文字與分析 sidecar SHA 仍與前輪相同。收尾檢查發現來源 manifest 已不同：目前偏好改為另一份 LRCLIB 歌詞，而非本批固定的原來源。本輪沒有對正式 manifest／來源／分析檔寫入，也沒有把偏好改回；沒有本輪開始的獨立 manifest 收據，不能據此斷言改變的精確時間或操作者。

新偏好來源另作真 Electron／main-loader／owner 唯讀核對：36 句、28 ready、153 coarse、225 合法 fine，原文／繁體與 publisher 完整保留 fine，load／prepare 均 ready，讀取前後 SHA 一致。它沒有替換進原 A/B 或冒充已做過可見重播；正式 session 是否已套用也未觀察。依既有契約，切換來源會解除套用，應在目前來源明確套用其既有分析，不需要為這次外觀修正重跑模型。

## 驗證狀態與限制

完整測試 1,005 檔、9,587 通過、1 skipped；lint／build 通過。新增 projection／owner 的聚焦 coverage：lines 98.01%、branches 90.59%，不代表全庫 coverage。回歸涵蓋 starts-only、已知 fine 停頓、未知尾界、Unicode、未套用、發布隔離與靜態 cue；獨立程式覆核通過。

既有模型人工時間品質、自然歌聲、非零 Output 延遲與實際 OBS／硬體仍待驗收。前輪冷啟動慢值回退與 KTV 次列長句裁切沒有在本輪宣稱解決；時間／資料正確與畫格成本分開記錄。未 commit／push，未重新分析／下載或修改正式 profile、sidecar、offset。
