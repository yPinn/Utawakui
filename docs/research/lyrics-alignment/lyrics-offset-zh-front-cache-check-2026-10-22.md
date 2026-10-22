# 《雪 Distance》前段兩句：離線快取重判

日期：2026-10-22。依[固定六句計畫](lyrics-offset-zh-six-line-plan-2026-10-22.md)只檢查 W0 的 O1／O2。結果為一支持、一不足，前段無法共同提供足夠的 offset 證據，已停止，不啟動中後段推論。原始細節與來源綁定保留在 ignored 研究目錄；[摘要資料](data/lyrics-offset-zh-front-cache-check-2026-10-22.json)不含私人路徑、歌詞或模型起音。

## 身分與配方核對

原錄音／歌詞／manifest SHA 與選句快照相符，來源仍為純 T1、offset 0 ms。W0 原音訊區間仍是 16.180–46.180 秒；兩行的原文、完整來源 lineId 與裁片 occurrence 對應相符，來源起訖等於裁片時間加回 16,180 ms。來源 offset 沒有重複加入。

固定 small raw JSON 的原始 SHA、音訊／來源／offset sidecar 與 canonical 均相符。本輪固定使用計畫指定的 raw，沒有切換至 GPU 對照或其他轉錄。以現行 `partialTokenStarts` 正確讀取 raw bytes，保留 68 個 span、缺時計 token 為 0；這只確認可重放的時鐘資料，不代表內容或時間準確。

HubertFA 原始 index 0 首詞存在，prepared words 與兩行文字範圍相符，原 decoder begin／end 保持行框前後 350 ms。歷史提交中的 job、前處理、protocol、G2P／decoder SHA 與細時間研究記錄相符；原模型配方 digest 可重建。觀測 decoder 與原 decoder 的差異只增加原有 end／phones 序列化，原研究保存五次 stock／觀測起點相等收據。本輪沒有重新解碼來重做這項比較。

既有 CPU 模型／字典／vendor／runtime／FFmpeg 完整性與 Python environment lock 核對通過；small 兩份既有資產清單相同，選定環境的 39 個資產檔案逐一 SHA 通過。Node／ICU 與原配方相符。以上都是檔案與固定程式查核，沒有載入模型、啟動 Python／Whisper／FFmpeg 或更改環境。

因此這些快取可沿固定歷史聲學配方與原音訊時計作離線研究；不宣稱目前並行修改中的產品 decoder／job 已與它等價，也不把原 ASR 整套 method 與本次嚴格內容重判視為同一配方。新原生執行效果仍未測。

## 固定內容重判

使用計畫指定的現行 `assessCompleteness`、script-fold 與 500 ms 內容範圍，維持既定支持門檻，不啟用鄰句救援、不放寬或改詞。對完整原音訊時計與原裁片時計各作一次對應檢查，兩者判定逐值相同；這是同份證據的時計等價檢查，不是額外兩次獨立試驗。

| 目標          | 來源 T1 起點 | 來源／轉錄匹配字元 | 比對覆蓋 | evidenceState | offset 錨點處置                    |
| ------------- | ------------ | ------------------ | -------- | ------------- | ---------------------------------- |
| O1，原第 1 行 | 18.180 秒    | 10／14             | 71.4%    | insufficient  | 不提供正面支持                     |
| O2，原第 2 行 | 23.020 秒    | 11／11             | 100%     | supported     | 只保留單點內容支持，不產生整曲候選 |

這是內容比對覆蓋，不是歌詞正確率、人工時間準確率或模型對齊誤差。O1 未達既定 80% 支持門檻；其 `reject: false` 不等於支持，也不是已確認錯版本／歌詞錯誤。O2 達支持條件，仍不代表已人工確認首詞起音。

兩句的插入詞警告均未觸發；這不是已證明沒有漏詞。舊 `state: unknown` 欄位仍保留，當前內容支持判定以 `evidenceState` 區分，不用舊欄位名稱蓋掉新判定。來源文字唯一與有界轉錄可支持 O2 的局部對應；O1 內容不足，不能確認可作 offset 錨點。

## 停止與保留狀態

固定六句維持一筆 supported、一筆 insufficient、四筆未執行，不換句、不換歌、不改門檻，也不以重跑前段挑出可接受結果。W1／W2 沒有執行，沒有單點或整曲 offset 計算／候選，來源與人工值都未寫入。

本輪只有兩個固定內容目標及其時計等價檢查；模型／音訊解碼／新增窗口／下載均為 0，沒有產品或環境修改、commit／push。45 份已讀輸入 SHA 在前後核對一致，既有人工 worksheet 未變，人工驗收維持 pending。原始快取仍可保留作研究，這次停止是證據不足，不是環境不可用或已證明歌詞有錯。
