# 歌詞掃完、停留與有界句尾修正

本輪保留來源文字、行／粗詞塊起點、所有既有 fine 起訖與空窗，未改 offset、模型時間或套用 gate，未接 BPM。Output 沿用模板樣式，KTV 無底線。資料與限制見[去私有摘要](data/lyrics-tail-hold-2026-10-22.json)。

## 行為與界線

共用 paint plan 分開掃完時間、來源停留上界與換句。完整覆蓋的詞塊在掃完後停止 active cue；文字不因掃完而刪除，下一句仍按原起點切換。KTV 保留既有雙列、預備與停留政策，paint 完成不接管 lane 切換。完成 deadline 只重採原媒體時鐘，無新增等待、全域 ticker 或補播動畫。

只有 inferred line end 的缺時間尾段可用有界局部速度估計：至少兩個可用 fine 觀測，否則至少兩個 coarse 起點區間，取最後五個合格每字時長的中位數；最晚不超過原來源上界。速度的 80–1000 ms 範圍是顯示規劃政策，不是歌聲信心。資料不足維持 unknown／靜態提示。明確句框沿用原政策，既有 fine 不因太短、太長或有洞而被改寫。

跨粗段 fine 保持完整，兩側未覆蓋文字仍可補顯示估計。已知空窗不補平。粗起點若晚於該範圍的 fine 完成，仍保留粗起點即時提示。本地與 Output 使用相同的完成規則；原生 T2 不降級。細節見[時間契約](../contracts/lyrics-timing-contract.md#capacity-aware-display-pages)。

本例 LRCLIB 的兩處缺尾估計結束分別由 85.530 秒縮至 85.229 秒、97.760 秒縮至 97.561 秒，開始時間不動；108 秒附近的晚到 fine 與尾字未改。NetEase 已完整覆蓋的尾段可在 84.478 秒完成後停留到 86.620 秒，另一處完成於 105.690 秒、來源停留界為 110.500 秒。這些是顯示完成與來源上界，不宣稱實際歌唱終點已校正。

## 獨立的 KTV 裁切原因

自然播放重現容量模式固定隱藏實體 next 節點；KTV 輪替至 B 列時，該節點即使有完整文字也變成 `display:none`／零尺寸。修正容量模式改依邏輯有效列顯示，A／B 都能使用同一容量頁。一般雙列、字型、角色色與描邊不改；B 列倒數在容量模式改跟隨第一個 grid row，保留右對齊。

相同 94 秒短探針由白畫面變為完整有效歌詞；另以合成 B 倒數檢查 grid/inset，倒數底部 217.17 px，文字含 padding 的墨區起點約 224.38 px。這是可見 Electron 的獨立 CSS 探針，不混入自然播放時間統計。曾經只改 inset 而未指定 grid row 的失敗探針亦保存。

## 自然播放對照

唯讀使用同錄音與兩來源，原音訊經 production media range protocol、真 HTMLAudioElement／usePlayer／lyrics clock／分析 owner／Panel／publisher／Projection Hub／Output server／正式 Focus 與 KTV。其他曲庫、佇列等 owner 固定為隔離替身。每次先 seek 至 65 秒，再以 1x 連續播放到 115.5 秒；冷啟動與同程序暖重播各一次。順序為 LRCLIB before→after、NetEase after→before，無背景模型推論。monitor 靜音，不包含人工聽辨或歌唱真值。

四個 process、八個 cycle，共 290,683 個可配對觀測。本地每 cycle 七次後續換句均未早於來源起點；全文檢查零差、未見同 cell 在媒體前進時倒退超過 20 個百分點。觀測不等同每個 compositor 畫格或像素的驗證。

下表是粗詞塊起點提示相對原媒體時鐘的診斷 p95，單位 ms；每個本地／Focus cycle 各有 30 或 32 個符合條件的起點。KTV before 有部分起點因有效列被隱藏而缺測，不能把其較小分母的 p95 當成公平性能比較。

| 來源    | 重播 | 本地 before→after | Focus before→after | KTV 有文字但隱藏的合格觀測 before→after |
| ------- | ---- | ----------------- | ------------------ | --------------------------------------- |
| LRCLIB  | 冷   | 10.33→11.73       | 12.50→9.40         | 3806→0                                  |
| LRCLIB  | 暖   | 12.33→11.64       | 14.67→9.45         | 3797→0                                  |
| NetEase | 冷   | 10.33→10.33       | 12.50→10.14        | 3325→0                                  |
| NetEase | 暖   | 11.19→11.48       | 13.40→12.10        | 3309→0                                  |

修正後三面皆無缺測粗提示；KTV 底線觀測為零。本地水平溢出為零，合格 Output 觀測無水平／垂直容器超界；本地未另量垂直容器超界。可見 PNG 亦作局部確認，不能外推所有尺寸、字型或 OBS alpha 合成皆通過。

所有慢值保留。冷窗原始 rAF 最大間隔：LRCLIB 本地 29.70→37.00、Focus 30.90→34.60、KTV 27.10→35.40 ms；NetEase 本地 47.20→45.50、Focus 41.60→58.30、KTV 42.40→44.50 ms。因此不能宣稱所有最大值改善，也不能只憑 rAF 間隔歸因 prepare／commit／paint。本輪未新增等待，但未建立全面無延遲回退的性能 gate。

Output 媒體位置以最近本地同時鐘觀測、1x 連續區間重建，只接受距離小於 25 ms 的配對；不把配對失敗當產品文字錯誤。rAF 間隔直接使用原始觀測，不能先刪掉未配對點再計最大值。p95 使用排序後 `floor(n * .95)` 的索引，未插值。原始採樣成本、缺測與全部極值保存；這是有探針、少量 process 的診斷，不是正式延遲 benchmark。

## 段落與歌聲活動離線結果

本曲既有 `sections` 為空，沒有 M2 間奏區間，段落 ablation 缺測；未啟動新段落模型或接入拍點。唯讀使用已存在的 pinned Silero JIT 與隔離 Torch CPU 環境，對原 mix／既有 guide 的 60–90、90–116 秒共四個窗口推論，不重跑分離、不下載權重。32 ms frame、posterior 0.5、離線候選最短 off 160 ms／尾緣保護 160 ms 固定，不依結果調門檻。

第一輪浮點 PCM 因解碼峰值 1.451 超過 worker 的 [-1,1] 輸入契約而拒收，尚未得到 posterior。保留失敗後，所有離線副本統一固定 0.5 gain 重跑；不寫回原音訊。成功推論四窗口約 1.985／0.734／0.844／0.750 秒，初始化另計約 8.015 秒，均在自然播放量測結束後執行。

原 mix 在 71–74、85–90、91–94、103–106 秒等歌詞窗口的高於閾值比例皆為零；guide 對應為 100%、46.8%、83.9%、83.9%，但 106–110 秒又全部低於閾值。這只能顯示訊號與 mix／guide 的差別，不能以模型區間或 speech posterior 自證哪個尾音正確。

目前不採用 live VAD gate：仍缺獨立歌聲進出標註、弱尾音／拖音／和聲／洩漏／短換氣負例與真句尾錯誤率。cadence 也無法保證避開未記錄的換氣。LRCLIB 長洞、NetEase 長末字與 19–29 ms 極短區間仍留在原資料並標示品質原因，不用平滑掩蓋它們。

既有 adapter 對跨 ruby／page／coarse 的完整細單位仍可能退回靜態基底；本輪只補未覆蓋邊緣，不製造子單位時間，也不宣稱所有跨界細單位已能連續填色。

## 驗證與剩餘限制

聚焦 24 files／322 tests 通過；三核心模組 lines 97.83%、branches 92.75%，不是全庫覆蓋。lint 與 production build 通過，build 保留既有 chunk-size 警告。KTV 長句的 cue deadline 去重並以迴圈取最小值，500 phrase／1,000 字回歸通過，避免新增平方數 boundary 及 spread overflow。

完整 suite 的 sandbox 首跑有 loopback EACCES／暫存 rename EPERM。使用隔離 TEMP 並允許 loopback 後，兩輪分別為 9614 pass／1 fail／1 skip 與 9610 pass／5 fail／1 skip；單一 archive 重跑 12 tests 通過。兩個 worker 的最後追加完整檢查為 9612 pass／3 fail／1 skip，剩餘兩份測試是未修改的 provider runtime 與 lyrics environment 發布目錄 rename EPERM；根因未確定，不能指認特定防毒或歸為產品回歸。完整 suite 尚不可宣稱全綠。未為此改動無關 atomicWrite 或測試預期，所有失敗收據保留。

使用者正式 profile／音訊／兩份來源與 sidecar 不寫回。原時間、已知停頓、文字守恆由聚焦回歸及來源 hash 驗證；正式 OBS 模式及人工歌聲時間接受仍未完成。所有原始、失敗探針與私有資料只留 ignored `tasks/lyrics-tail-implementation-20261022/`；本輪不 commit／push。
