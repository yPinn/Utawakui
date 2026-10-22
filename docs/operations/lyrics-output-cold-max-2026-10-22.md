# Output 冷啟動首字與舊分組結果排查（2026-10-22）

本輪承接[細填色首字成本驗證](lyrics-output-fine-cost-2026-10-22.md)中完整控制案例的 cold 最大值回退。使用者另確認，目前「一個詞塊一個詞塊跳亮」沿用先前儲存的分析結果；資料能力和畫面排程分開驗證。

## 舊結果與詞塊內填色

舊 schema 1／前一 method 的分組結果只有文字範圍與 `startMs`。相容讀取會保留原分段起點，模型提示的 `endMs` 仍為 null；沒有 `estimatedFineTiming` 時，本地 document reader 與 Output Focus 都沿原提示，不會自行產生詞塊內填色。

因此，缺少細單位的合法終點確實會造成這個降級。整句結束時間不能代替每詞終點，也不以相鄰詞起點偽造唱完時間。這次沒有讀取使用者指定的實際 sidecar，結論是已確認的舊格式路徑，加上使用者確認沿用舊資料；不能據此宣稱每份既有檔案都缺少終點。

可見隔離案例使用相同文字、粗分段範圍與起點，分別提供 starts-only 和明確標示為合成的合法細起訖。相同五字詞塊中途，本地／Focus 的細版皆為前兩字填滿、第三字部分填色、後兩字基色；Output 進度為 100／100／58.57／0／0%，實際 pseudo 裁切與 PNG 一致。舊版沒有細 cells。這證實現有塊內連續填色路徑可用，並非只有單字案例能動；合成 350 ms 終點不是自然歌聲的真實詞邊界。

既有重新分析流程可為支援的中日資料保留模型起訖與來源範圍；仍須通過映射／行框／範圍驗證。英文、未支援的混語、非法或跨範圍單位維持降級。這輪沒有執行模型、下載、遷移或回寫使用者 sidecar；其他 Output 模板也沒有新增細填色。

## 同次執行事件鏈

原先 18.628 ms 的歷史極值沒有同次 trace，無法事後精確還原該次 task。新 trace 使用相同完整案例找可重現成本，不將新 run 的 stage 回填為歷史極值的直接原因，也不刪除舊 cohort。

診斷事件以 cycle、trigger、generation、delivery、revision、pass 與 timer ID 串接。Timer 保留 armed absolute deadline、callback、取消與過期事件；正式 commit 起訖另有有界數值 timeline marks，和 Chrome trace 對照。所有 trace 預設關閉，不加入播放等待或逐幀 IPC。

首次完整 cold 診斷由新 receive 觸發；前一個 timer 已取消、沒有 callback，不能把這次 commit 當作該 timer 遲到。追加兩次由 timer 觸發，callback 分別晚 1／3 ms。三次都保留完整 pause／resume／seek／rate／offset 流程，Chrome 只在啟動至原生媒體約 1.6 秒採樣，產品 trace 繼續完整流程。

三次修正前 fit 為 10.0／11.3／10.7 ms、皆 21 probes；prepare 為 10.5／11.8／11.0 ms，正式 commit 為 1.6／2.0／1.6 ms，commit 完成至下一 rAF 觀測為 0.2／1.8／0.1 ms。Chrome 中首次主要 Layout 為 3.854／3.814／4.038 ms。同步排版工作可重現，不能將整段首字晚到歸因為畫格等待；帶 trace 的數字也不代替正式無 trace 分布。

首次省 prefix 的三次候選 trace 原樣保留：probes 降至 1，但 fit 為 12.4／9.1／10.1 ms、prepare 為 12.8／9.6／10.7 ms，未形成一致總耗時改善。Layout 次數 22→2，移除的是次要小量測；主 Layout 仍約 3.5–6.1 ms，內部 shape 佔明顯部分。字型 DecodeFont 發生在首次 fit 之前，fit 內沒有 DecodeFont，不能歸因於當時正在等下載／解碼。

因此另增加預設關閉的 fit phase 摘要，拆樣式讀取、root／target 尺寸、probe 建立、wrapped 量測與 row／page planner；root／target／首次 wrapped 的單調時鐘起點一併保留。Page planner 包含 wrapped／rows，整體 fit 又包含其他階段，不相加。

補取的一次完整 phase trace 直接確認 root 尺寸讀取 3.6 ms；Chrome 主 Layout 3.539 ms 始於 root 讀取後 0.009 ms。Target 讀取為 0、probe 建立 0.4、wrapped 0.1、page planner 2.1 ms。這不支持把 canvas 初始化當主要阻塞，也不需要盲改字型載入；完整頁已可容納時，planner 仍建立拆分候選，則是另一段可避免工作。

最終三次 full cold trace 的入口也為 update／timer／timer，fit 8.2／10.2／7.2 ms、prepare 8.6／10.7／7.7 ms、commit 1.5／1.3／1.8 ms、probes 皆 1。Root 讀取 3.2／4.6／3.1 ms、page planner 1.0／0.9／1.1 ms，其中 wrapped 為 0.6／0.4／0.6 ms。主 flush 仍在，沒有用移動起點將它隱藏。

這三次帶 trace 首字晚到 15.126／16.192／17.104 ms，commit→observer 0.1／0.2／3.2 ms；修正前首字為 14.952／19.643／13.888 ms。因此不能單看診斷批宣稱首字普遍更快，正式結果使用下一節的獨立無 trace 交錯批次。初版較慢 trace、單次 phase trace 和最終 trace 均保留，不用快例替換。

Prepare 包含 fit，fit 包含量測 render 與瀏覽器 layout；這些時間不能加總。Commit 完成到下一 observer 是可觀察性等待，空白至 active 的兩個 rAF bracket 則包含更多未知工作，不能互換。Chrome 中同 renderer／frame、細文字 class 的 Paint 只能列為候選，尚無首字 unit-to-layer 對應，真正首字 paint 與硬體／OBS 呈現仍未知。

跨程序 main send 記錄在 native send 呼叫前，觀察用 WebSocket 時間則是 JS listener 執行時刻，兩者之差包含傳輸與派發排隊，沒有拆成單獨 wire time。正式 receive 按 delivery 關聯，再以 epoch／revision 配對來源發布與 main 接受，避免 revision 重用錯配。

## 修正範圍

Focus 自行換行，並不使用逐行文字切片。完整頁面經實際 wrapped DOM 嚴格證明高度不超過可用行數、水平不溢出後，省略逐行 prefix probes，仍使用共用頁面／時間 planner。每個接受頁保留自己的多行 metadata；單頁兩／三行仍會啟用 fit 並隱藏下一句。第四行不能直接通過，仍沿原分頁與最短停留規則。

共用 planner 先驗整句容量，通過時建立原來相同的單頁物件，省掉不需要的候選／grapheme 搜尋，之後完整執行原時間判斷。未通過才沿原拆分。T0 未定時間、T1 版面估計、T1+ 模型起點與原生 T2 優先順序不變，短停留與 rate 邏輯也不直接略過。

真 fine DOM 邊界驗證另發現既有容量低估：Times New Roman 的 `AV` 重複案例，純文字 probe 判定三行，48 個實際細填色盒卻排四行；修正前 snapshot 也能重現。當時仍 contained 於整個畫布，不誇稱已經超出畫面，但已違反三行預算。

Focus probe 因此按目前行的 coarse／fine 範圍重現影響換行的盒結構：只有完整可對映的細單位拆成與正式畫面相同的 grapheme inline-block，其餘保留文字；不建立動畫或偽時間。Planner 為容量 callback 傳入可選來源範圍，候選與多行 metadata 都按該範圍對應，不能用文字搜尋猜重複片語的位置。跨 coarse／page 的部分單位沿原降級，第四行不允許被純文字結果重新接受。

換行、tab、頭尾空白、未通過嚴格 proof 的候選、其他模板與沒有新 metadata 的注入量測，維持原 row planner。快取及 resize／字型／設定失效沿原規則；沒有建立未來歌詞 DOM、整首預排、等待字型、提前起點或補播動畫。分段起點提示與有效時間內的連續填色仍在同一次正式 render。

## 同案例驗證

正式完整交錯 16 次皆正常結束，1,364／1,364 次 envelopes 接受。以下為本輪新 cohort，沒有沿用上一輪數字代簽。

主要 baseline 為這輪凍結的既有可見 fine 版本，候選亦啟用相同 fine 資料；舊 starts-only 僅另作功能診斷。Visible Electron 內使用真 HTMLAudioElement／播放器／歌詞 owner／publisher→Hub→server→正式 Focus，PCM、26 個粗起點、每單位 350 ms 細時間與 150 ms gap 相同，完整跑 pause／resume／seek／rate／歌詞 offset 控制。Output displayDelay 固定為零，不能由這批推論非零值。

兩份 snapshot 各 2,497 檔；產品來源差異只有 `overlay/lyrics/lyrics.mjs`、`overlay/lyrics/lyricsFit.mjs` 與 `shared/presentation/lyricsDisplayLayout.mjs`，沒有混入其他 UI／佇列改動。最終 runtime 與功能／phase 診斷版的 runtime hash 相同。

Cold 為新程序、profile 和 Output document，並非清空 OS／磁碟／字型全域快取；warm 在同一視窗先播放再重設。每版 cold 5、warm 3，AB／BA 交錯，性能不開 trace，也不執行幾何／computed pseudo 觀測；功能與 trace 批次獨立。重負載測試／build 與可見性能互斥。

首字及共同起點使用 signed wall ms，正為晚、負為早。中位數採標準兩中值平均，另保留 nearest-rank p50／p95；cold n=5／warm n=3 的 p95 等於本批 max，不是人口尾部分位估計。每個 phase 的首次 activation 先去除 re-entry，再套原控制排除窗；未配對、控制窗與所有慢值另列，不跨 seek／rate／offset 插值舊連續時鐘。

| Output 首字（ms） | n／版 | 中位數 before → after | p95／最大值 before → after |
| ----------------- | ----- | --------------------- | -------------------------- |
| Cold              | 5     | 15.960 → 13.258       | 26.783 → 15.014            |
| Warm              | 3     | 9.110 → 7.431         | 10.117 → 9.283             |

Cold 首字 raw，按 run 順序保留：before 為 14.192／14.278／20.469／26.783／15.960 ms；after 為 13.258／9.210／14.526／11.341／15.014 ms。本批中位減少約 2.70 ms，最大值減少約 11.77 ms；樣本仍小，不能保證每次或所有設備都改善。

| 共同首次 activation（wall ms） | 配對 n | p50 before → after | p95 before → after | 最大值 before → after |
| ------------------------------ | ------ | ------------------ | ------------------ | --------------------- |
| Local cold                     | 166    | 6.814 → 8.224      | 15.580 → 15.643    | 19.590 → 21.970       |
| Output cold                    | 169    | 4.541 → 4.345      | 15.854 → 14.526    | 26.783 → 17.224       |
| Local warm                     | 101    | 8.477 → 4.827      | 16.375 → 16.000    | 25.814 → 200.473      |
| Output warm                    | 104    | 5.154 → 3.537      | 14.320 → 10.939    | 17.535 → 20.970       |

Output 整體共同起點 p95 下降，但 warm 最大值回退 3.44 ms，原值保留；local cold 中位與最大值也較慢，不能將這輪結論寫成兩端所有起點皆改善。

Local 200.473 ms 為 after／warm-2 的 `rate:6000` 真首次 activation，rate 1.25、歌詞 offset 0，並非 re-entry 或誤配 200 ms offset。本地 rAF 樣本有 202.8 ms 空窗；恢復時原生媒體已約 6235 ms，歌詞時鐘仍約 5984 ms，下一個觀測才見對應文字。Output 約早 201.7 ms 已顯示相同字，同窗最大採樣 gap 約 29.2 ms；原正式 run 沒有 trace，無法認定 GC、OS、JavaScript task 或 paint 為原因。

Warm Output 20.970 ms 位於 after／warm-3 的 `offset:10000`，offset 200、rate 1.25，同時 local 相同起點約 21.250 ms，兩端 observer 都有約 20.5 ms gap。這是保留的慢觀測，不由兩個 rAF 端點推論 commit 或硬體呈現。

另以 before／after 各一次完整 warm Chrome 有限診斷，不混入正式 16 次分布。實際 debugger trace 只涵蓋 Output，沒有 local PID／本地 UserTiming 事件；harness 原本 intended「all-renderer」標籤不成立，分析明確更正 actual scope。兩份 trace 約 65.4／53.9 MB，保留原檔，不能據此聲稱本地沒有 GC／長 task，也不能解釋原無 trace 的 200 ms。依有限診斷範圍停止追加 run；若後續追查本地，須先用隔離 Electron 全程序 contentTracing 驗實際 renderer 覆蓋，再對同控制窗採樣。

這兩次新增診斷的 local `rate:6000` 觀測為 6.882／0.653 ms，全窗最大 local gap 為 39.5／12.6 ms，沒有重現 200 ms；這只描述新增 run，不排除原問題。額外 168／168 envelopes 接受，獨立於正式 1,364 筆分母。

共同首次 activation 共 540 筆，完整穩態 first before 549／after 551，20 個未配對另保留；phase 端點與控制排除窗的差異不以刪掉慢值處理。原 all-transition legacy rows、負值與重進入資料同樣保存。

## 程式與功能驗證

Trace、整頁快速接受與 fine 結構量測均先新增失敗回歸，再驗證修正；包含停用 trace 不採樣 phase clock、時間白名單、單頁多行與下一句、第四行拒絕、重複文字來源位置、跨 coarse／page 單位、T0／T1／T1+／原生 T2、rate、短停留與未定 end。產品差分經獨立審查通過。

最終完整測試 1,005 檔、9,570 passed／1 skipped，ESLint 與 production build 通過，既有大 chunk 提示保留。較早一批有四個 Windows rename EPERM；獨立重測與短工作區 TEMP 後通過，原失敗日誌保留。其間一個新增測試錯把 geometry 讀取次數當契約，已修正為核所有讀取皆無跨 coarse 細盒，再以完整測試通過，沒有放鬆產品容量斷言。

有效 fine 容量六個案例皆通過：CJK 恰三行、四行分頁、窄寬邊界、中英混語、Latin kerning 與 ligature。AV 修正後第一頁來源 0–45 為三行、44 個合法細 cells；第二頁 45–48 一行、沒有完整細單位。跨頁單位 44–48 兩側都保持原文字，不補時間。各頁來源無缺漏／重疊，文字完整、矩形 contained、下一句隱藏，cell 數量／ID／paint fractions 亦依完整單位核對。

早期容量 fixture 少了新增第二行的估計，owner 正確拒絕為 stale、實際 fine cells 為零；這批保留為 harness 失敗，不能當作 fine 通過。有效新 fixture 與正式性能案例分開，原性能單行資料不受影響。

控制診斷另驗真 pseudo clip 有連續中間值、同 DOM node 持續，pause 凍結且無 running 動畫，gap 完成保持，seek／rate 立即重定位；AX 首字只讀一次、基底文字完整。這些功能採樣不混入性能分布，原生 T2 沿程式回歸，沒有冒稱新增自然歌聲或實體 OBS 驗收。

Root 另直接檢查 starts-only／fine 同詞塊、CJK 三行容量、AV 修正前四行與最終三行首頁／一行末頁 PNG。最終 source snapshot、功能／phase snapshot 與 live 三個修改 runtime 的 hash 一致；268 項 evidence 的 bytes／SHA 經獨立核對，16 次性能 run 皆 visible、唯一 Audio owner、來源穩定且無錯誤，fixture 粗起點／細時間／文字／控制值逐值一致。專屬 Electron 程序已全部退出。

## 結果與剩餘界線

本輪縮減已重現的重複量測與單頁候選工作，修正真細填色盒的容量低估；Output cold 首字在本批交錯比較改善。分段起點即時提示、有效模型時間內連續填色、既有 deadline／hold／播放器時鐘保持，沒有平滑等待、提前起點、補播或新 offset。

主 root layout／字形工作仍存在，local 部分分布及最大值沒有全面改善；原 local 200 ms 長空窗仍未定位。舊分組結果仍需取得合法細起訖才有細填色，這輪沒有執行新模型、下載、改寫使用者 sidecar／canonical 時間或建立 commit。自然歌聲人工時間真值、實體 OBS／硬體像素呈現、installer 與全庫 coverage ratchet 均未另驗。

完整 signed raw、matched／unmatched／legacy／控制窗、所有慢值、診斷與功能結果、來源 manifest 和相對 evidence hashes 見[可攜資料](../research/lyrics-alignment/data/lyrics-output-cold-max-2026-10-22.json)。原 frozen portable SHA256 為 `b436514e27a796151dd427bd28e5d4b9faefd74572de3b18eea6a673e3947914`；持久 JSON 經格式化後與原資料逐值相同，SHA256 為 `04ead95437587cf3fa70c706f9f4dd145b20135d8e0cff84087361ba519d9cdc`，未含私人絕對路徑。產品、harness、量測方法及資料均經獨立審查通過。
