# Focus 填色複本陰影候選撤回

已依使用者核准試做「只取消 Focus 填色複本的重複陰影」。兩來源結果不穩定，依事前門檻撤回；產品 CSS 已按本輪原始 SHA 精確恢復。沒有保留產品開關、暖機等待或新增排程，不 commit／push，本輪在此收斂。

## 唯一候選與範圍

候選僅新增 Focus scoped `fine-ink::after { text-shadow: none; }`。底字陰影、底字與複本描邊、clip-path 連續填色、粗分段 onset 提示、文字與所有時間資料不變。KTV 與其他模板不符合此 selector；本地螢光筆修復也未變更。

十六個實際冷暖 cycle 的 computed style 都確認：底字仍保留原本兩層陰影，底字／複本描邊均為 1.12px，填色複本仍存在。只有候選的複本陰影為 none，基線仍繼承陰影。靜態 review APPROVE 不等於性能 gate 通過。

## 固定對照與事前門檻

使用《找》同一音訊、LRCLIB／NetEase 兩份既有來源與已儲存分析，沒有重新分析、改來源／offset 或接入 BPM。每來源兩對交錯 A/B，共八個新 Electron 程序、十六個冷暖 cycle，依序 LRCLIB A/B、NetEase B/A、LRCLIB B/A、NetEase A/B；A 為基線，B 為候選。沒有追加追跑快值。

實跑 player／lyrics owner／clock／publisher／hub／正式 Focus 和 KTV，本地使用前輪正確註冊 v2 的真 Page／Panel bundle，其他 owner 仍隔離。Focus 900×540，啟動時置前；原音訊自然 1x 播放 65–72 秒，同程序再暖重播。Chrome trace 與內部 stage trace 都關閉；保留 rAF、樣式／幾何探針開銷，並非完全無探針或完整正式 profile 的性能驗收。OS／GPU driver cache 未清除，不能當首次安裝情境。

事前門檻為四個配對的冷啟首秒最大 raw rAF 間隔各改善至少 10%；冷／暖 p95 回退不得超過 0.5ms，暖播最大值回退不得超過既有約 4.3ms 的一個觀測畫格。任何不符／缺測就撤回。這是保守的候選保留門檻，不是統計普適保證。

首秒是 65–66 秒，後續自然窗是 >66–72 秒，跨界間隔另列。raw rAF 使用未篩原始連續點；媒體／cue 對照才另外以小於 25ms anchor 配對。p95 定義為排序後 floor(n×0.95) 的零起算項。rAF 間隔不能當 physical presentation、首字顯示延遲或 OBS FPS。

## 保留全部結果

下列均為首個媒體秒內的 Focus 最大 raw rAF 間隔，單位 ms；每列各一次冷／暖，方向為基線→候選，並非執行先後順序。

| 配對      | 冷啟最大間隔 | 暖播最大間隔 | 判定                  |
| --------- | ------------ | ------------ | --------------------- |
| LRCLIB 1  | 26.4→29.0    | 4.4→4.5      | 冷啟回退，撤回        |
| NetEase 1 | 54.2→44.2    | 5.4→4.5      | 冷 p95 4.5→5.1 超門檻 |
| LRCLIB 2  | 31.0→26.0    | 4.3→4.6      | 此對符合門檻          |
| NetEase 2 | 38.2→51.8    | 4.4→4.7      | 冷啟回退，撤回        |

兩個冷啟最大值改善、兩個回退；兩個來源內的方向都不一致，整體未通過門檻。暖播首秒 p95 均約 4.3ms，但這不構成冷啟優化成功。完整三個 surface 的每次冷暖分母、首秒／自然／跨界及全窗 p50／p95／max、每窗最慢值與所有失敗保留在[資料 JSON](data/lyrics-focus-copy-shadow-2026-10-23.json)及 ignored raw。

沒有選取最好的一次留下，也不將本輪數字與前輪全陰影移除、trace-on 或未註冊 v2 本地的 cohort 混算。只取消重複陰影，沒有證實能穩定減少目前冷啟尾值；本輪沒有新增 GPU trace，因此不把 rAF 回退歸因到特定 shader、GPU 純執行時間或排程事件。

## 外觀與顯示保留

另用凍結 A/B 副本跑兩來源可見 Electron，於同一 65.7 秒暫停位置保留透明 Focus／KTV PNG，並以控制明／暗底確認部分填色、描邊與陰影。原合成板下半暗底被視窗高度裁切，保留初版；唯一確認輪只重用原透明 PNG，以原圖尺寸單張顯示，八張皆完整可見，沒有重播或增加效能樣本。已檢視兩來源原圖／合成圖，底字效果與分段提示保留；並非 OBS、物理螢幕或人工聽辨接受。

八個實際效能 run 的本地全文差異為 0，所有發布被接受。Focus 26,841 個 raw／26,832 個配對樣本；有效觀測沒有橫縱溢出、隱藏有效列或超過 20% 的大幅進度退回，20,456 個部分填色及 16,631 個向前未滿進度觀測。KTV 底線為 0，原模板樣式保持。

本地 observer 沒有垂直／hidden 欄位，故這兩項列 unscored，不能把缺欄位當已驗證 0。Focus／本地只評分唯一文字的 post-onset 可見性，已評分部分無 missing，各有十六個未評分事件；early timing 仍 unknown。KTV phrase／page cue 身分不足，八十個事件未評分，不把 missing=0 宣稱 KTV 起點完整通過。已知停頓、模型 end／句尾與讀音跨組等前輪限制不在本輪修復範圍。

## 收斂與驗證

最初八個啟動因隔離 runtime 漏帶 package.json，於 mediaProtocol 間接 require userAgent 時全部在播放前退出。失敗保留且不算媒體樣本；補上靜態 metadata 後，先確認第一組實際冷暖完成才接續七組，批次也改為失敗即停止。這是測試器修正，未進產品；沒有改 baseline、抹去慢值或重跑已完成的媒體樣本。

候選已撤回，後續維持原陰影、描邊、即時分段提示與連續填色。這不表示冷啟 raster／shader 尾值已修復；它仍是未解的首次使用成本，本輪不再擴大 GPU、快取或模板改造。

撤回後六份聚焦測試、179 tests 通過；ESLint、201 份 Markdown、build 通過，build 保留既有大 chunk 警告。格式與最終唯讀 review 通過。機械 detector 在已精確還原的 CSS 上列出五個既有字型未宣告於 DESIGN 的警告，本輪未新增字型或修理此文件差異。沒有重跑不相關完整 suite 或 installer 打包。

七份使用者歌詞／sidecar／音訊與 717 份凍結 runtime／本地 bundle SHA 不變；產品 CSS 等於本輪原始 SHA，失敗候選保留於隔離快照。二十一個本輪 Electron parent（八個啟動前失敗、八個效能、四個可見、一次純合成確認）及含本輪 profile 的子程序全部退出。2,557 份 baseline 無其他非 owned 變更；原先 dirty 工作保留，HEAD 未變、index 空。原始資料、失敗、撤回與程序收據在 ignored `tasks/lyrics-focus-copy-shadow-20261023/`。
