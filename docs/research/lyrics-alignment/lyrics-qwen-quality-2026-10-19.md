# Qwen3 詞塊估計：人聲活動、內容一致性與長尾回退實測

本文保留當輪研究與分母；目前跨批次選型及未決項集中在[研究結論](lyrics-alignment-summary.md)。

日期：2026-10-19。接續[Qwen3／Whisper.cpp 同曲比較](lyrics-alignment-candidates-2026-10-19.md)。本輪新增私有品質檢查、真實 VAD 推論與原模型證據重播；正式 gate、預設下載、Settings／activation 與 canonical T2 均未更動。

完整可實現路線、環境級距與顧慮另列於[方法比較](lyrics-alignment-methods-comparison-2026-10-19.md)。本輪固定版本、規則、來源 SHA、全部消融、整曲、壓力案例與驗證結果見[durable data](data/lyrics-qwen-quality-2026-10-19.json)。

## 結論與正式手動選配判斷

保守的雙 ASR 矛盾回退，把一個錯歌壓力案例中誤接受的行從 3／7 降到 1／7，但沒有完全攔住。在四組中日確認資料的 420 個可評切點中，原 Qwen 的 242 個 ≤100 ms 切點保留 240 個；誤差 >500 ms 的切點從 37 降到 34，>1,000 ms 從 20 降到 17。

這是有限的選擇性回退收益。沒有校正任何時間，也沒有提升全部切點的成功率；仍有 34 個 >500 ms 切點。兩份 Whisper 模型加 VAD 的完整環境約 3.561 GB，含本輪 FFmpeg 約 3.784 GB，還有額外 ASR 推論成本。改善幅度與殘留誤接受不足以支持現在投入正式手動選配交付。

建議保留 Qwen 為私有研究與可撤回的人工檢視草稿。活動模型以提示使用，內容狀態區分支持、矛盾、未知；未知不提升成可信。現階段維持 Basic 零新增模型、既有 T1／T2 回退，先補新歌、錯版本及人工抽查資料，再決定是否值得正式化。HubertFA 的[權重使用／分發 gate](lyrics-acoustic-weight-license-gate-2026-10-19.md)也未放寬。

## 實驗設計與固定證據

沿用同一批 22 個主案例、7 個壓力案例；主案例包括 18 個短音訊原曲／quick 配對與 4 首整曲。中文確認組為 4 首獨立標註，日文確認組為 4 首外部逐詞參考；PJS 單一樣本另列。沒有新增人工校對或聲稱新盲測，兩首新整曲仍無逐字時間真值。

Qwen 與 Whisper base／small 使用前輪真正推論的固定結果／raw JSON。本輪沒有再讓 ASR 看到歌詞，也沒有重新推論它們。新增的是 Silero 真實聲學推論、後處理、保存與回退驗證。未重新做分離、未加入 BPM／鼓點吸附、未用參考時間移動邊界。

每案沿用原音訊 bytes、原文、canonical T1、offset、窗口／完整 occurrence、`Intl.Segmenter` 要求切點，以及完全相同的評分器。中文每個 variant 為 102／102 要求／可評切點；日文為 148／108。無參考切點與模型拒絕切點不從分母移除。四組合計 420 是配對條件的切點並集，並非 420 份獨立歌曲觀測。

兩個 baseline 重播的 A／D 摘要與前輪 Qwen 逐案完全一致。評分器 SHA 仍為 `3bb816aeecc76690452e08d85a3e29ed316c5980644bf1b42a1ceaf94086dc42`；fine references 僅在推論／品質判斷結束後供評分使用。

新增 [Silero v6.2.3](https://github.com/snakers4/silero-vad/tree/v6.2.3)，固定 revision `5cd7945676eb32225748052e2e6a0580e4686a08`，本機 JIT SHA 為 `e1122837f4154c511485fe0b9c64455f7b929c96fbb8d79fbdb336383ebd3720`。使用既有隔離 Qwen Python／Torch，CPU 1 thread，16 kHz、512 samples（32 ms）一幀，每個窗口 reset state、尾幀補零。沒有安裝額外 distribution、torchaudio 或透過 torch.hub 下載執行程式。[固定版介面](https://github.com/snakers4/silero-vad/blob/5cd7945676eb32225748052e2e6a0580e4686a08/src/silero_vad/utils_vad.py)

這是 speech VAD，輸出不是歌詞正確率。32 ms 幀也不代表 32 ms 的唱詞邊界精度；沒有新的人工活動標註，本輪用其對既有正確切點的保留／誤拒衡量影響。

## 第一輪：活動與內容都作硬篩選

先固定以下規則，再產生這輪結果：活動 posterior ≥0.5、行內至少 10% 有活動、切點前後 256 ms 內需有活動；內容使用 T1 外框前後 500 ms 內的 ASR 文字，至少 50% 的來源字元有唯一單調配對，至少 3 字（短行按本身長度）；時間支持消融另要求 ASR token 起點與 Qwen 相差 ≤600 ms。

NFKC 與日文 kana 轉換只用在比較鍵，沒有改顯示原文、加入繁簡／同音替換或重寫 UTF-16 範圍。無時間 token 的文字仍在配對圖中保留歧義，但不提供時間或正面支持。Whisper token 起點仍是前輪已說明的 ASR timing，包含上游 heuristic；不是歌詞強制對齊真值。

下表是全部可評切點中的 ≤100 ms 比例。純 baseline／activity 的 base、small 重複控制一致，合併呈列；完整十組消融留在資料檔。

| 規則                      | 中文原曲 | 中文 quick | 日文原曲 | 日文 quick | 錯歌有估計行 |
| ------------------------- | -------- | ---------- | -------- | ---------- | ------------ |
| 原 Qwen                   | 56.9%    | 70.6%      | 46.3%    | 57.4%      | 3／7         |
| 活動硬篩選                | 43.1%    | 57.8%      | 1.9%     | 49.1%      | 2／7         |
| base 內容硬篩選           | 33.3%    | 46.1%      | 30.6%    | 33.3%      | 0／7         |
| small 內容硬篩選          | 43.1%    | 50.0%      | 38.0%    | 46.3%      | 0／7         |
| 活動＋base 內容           | 27.5%    | 42.2%      | 0.0%     | 30.6%      | 0／7         |
| 活動＋small 內容          | 35.3%    | 43.1%      | 1.9%     | 40.7%      | 0／7         |
| 上列 base 再要求時間支持  | 8.8%     | 20.6%      | 0.0%     | 25.0%      | 0／7         |
| 上列 small 再要求時間支持 | 16.7%    | 19.6%      | 1.9%     | 25.0%      | 0／7         |

日文原曲的活動篩選只留下 2／108 個可評切點，雖兩個都正確、P90 只有 70 ms，卻刪掉原本 50 個正確切點中的 48 個。這直接說明不能靠保留者精度或較低 P90 宣稱改善。

內容硬篩選能攔這份錯歌，但也把很多唱對、ASR 沒辨對的行拒絕。要求每個切點都有 ASR 時間支持又進一步縮小 coverage。這些 profile 不作正式規則。

## 後續探索：未知保留，較明確的矛盾才回退

看到上述誤拒後，再固定第二組規則。這一輪是探索性修正，沒有宣稱事前註冊、盲測或已校準門檻。初版發現的重複配對與來源綁定問題保留舊輸出；正式比較採修正後重新重播的 final 結果。

- 活動只提供 warning，不單獨清空模型切點。
- 內容矛盾需 ASR 在該行區間內至少有 4 個有時間的字元，且最大 LCS 文字相容性 ≤20%。文字配對有歧義時仍可能完全相容，保留為未知；不能把唯一配對 coverage 低直接當矛盾。
- 單一 base、單一 small 分別作內容矛盾消融；dual 需要兩者同時矛盾才拒絕整行。
- dual 的時間矛盾另需兩者唯一文字 coverage 均 ≥80%、相同完整詞塊都有起點、兩份 ASR 起點相差 ≤300 ms，而且各自都與 Qwen 相差 ≥1,000 ms，才拒絕該內部切點。沒有改成 ASR 的時間，也不平均、clamp 或補新切點。
- 首塊仍用 T1 錨點，拒絕切點交給既有 builder 合併；canonical T2 優先。

這裡的兩份 ASR 是不同大小的 audio-only 推論，與預期歌詞獨立；兩者共享模型家族／訓練偏差，不能當統計上完全獨立的兩張正確票。

| 內容回退版本        | 中文原曲 | 中文 quick | 日文原曲 | 日文 quick | 原本正確切點保留 | 錯歌有估計行 |
| ------------------- | -------- | ---------- | -------- | ---------- | ---------------- | ------------ |
| 提示而不回退        | 56.9%    | 70.6%      | 46.3%    | 57.4%      | 242／242         | 3／7         |
| base 矛盾           | 52.0%    | 61.8%      | 45.4%    | 57.4%      | 227／242         | 1／7         |
| small 矛盾          | 55.9%    | 68.6%      | 45.4%    | 57.4%      | 238／242         | 1／7         |
| dual 矛盾與時間共識 | 55.9%    | 69.6%      | 46.3%    | 57.4%      | 240／242         | 1／7         |

單一 small 已取得多數保守收益；增加 base 的 dual 只多保留這批資料中的 2 個正確切點，不能據此宣稱雙模型值得預設安裝。所有方法只是篩選已有切點，因此固定分母成功率只可能保持或下降；應看保留正確切點與移除錯誤的交換，而非聲稱時間本身更準。

## 長尾、整曲與剩餘錯歌

| 確認組     | coverage：原 Qwen→dual | 正確 ≤100 ms 切點 | >500 ms 切點 | P90：原 Qwen→dual |
| ---------- | ---------------------- | ----------------- | ------------ | ----------------- |
| 中文原曲   | 84.3%→81.4%            | 58→57             | 16→14        | 1,094→971 ms      |
| 中文 quick | 93.1%→88.2%            | 72→71             | 7→6          | 332→318 ms        |
| 日文原曲   | 79.6%→79.6%            | 50→50             | 8→8          | 380→380 ms        |
| 日文 quick | 78.7%→78.7%            | 62→62             | 6→6          | 369→369 ms        |

日文短確認組的長尾沒有因此改善。中文原曲仍有近一秒 P90；不能把 37→34 個大誤差描述為已解決。低時間解析度、Qwen 的窗口內強制路徑、ASR 自身時間誤差與缺少獨立正面證據，仍限制目前方法。

整曲結果也保留：既有中文 ≤100 ms 為 58.5%→58.0%，ready 行 78→77／104；既有日文仍為 40.0%，ready 行 49→48／58，>1,000 ms 切點從 5→4。新中文／日文 ready 仍為 30／37、33／40，沒有 fine references，不給精度數字。PJS 的單一樣本不能外推日文普遍能力。

殘留錯歌行的人聲活動比例約 33%，兩份 ASR 各有 11 個區間內字元，但與預期歌詞仍有 25% 文字相容性，因此按固定 20% 規則保留未知。其餘兩個原本誤接受行被標為矛盾並回退。這是單一錯歌／7 行的壓力樣本，不是整個曲庫的假接受率；沒有針對它事後把門檻調成 25% 來宣稱通過。

其他相同壓力案例中，靜音、低音量、伴奏、目前 adapter 不支援的韓文／混合文字均為零 ready；韓文沒有在本輪被驗證為可對齊。正向 offset 案例在 dual 為 7／7，offset 只換算一次。活動／內容硬 gate 的一些版本則損失 offset 正常行，已保留失敗結果。

## 環境、載入與資源成本

Silero JIT 2,272,526 bytes，加固定 LICENSE 1,075 與介面來源 30,979，共新增 2,304,580 bytes。模型與工具資產使用固定官方來源及 SHA，沒有增加新 Python 套件。與[完整方法比較](lyrics-alignment-methods-comparison-2026-10-19.md)相同，完整聯集如下。

| 組合                      | 不重算共用 FFmpeg | 含本輪 FFmpeg |
| ------------------------- | ----------------- | ------------- |
| 原 Qwen                   | 2.903 GB          | 3.125 GB      |
| Qwen＋Silero              | 2.905 GB          | 3.127 GB      |
| Qwen＋base＋Silero        | 3.074 GB          | 3.296 GB      |
| Qwen＋small＋Silero       | 3.413 GB          | 3.636 GB      |
| Qwen＋base＋small＋Silero | 3.561 GB          | 3.784 GB      |

GB 是十進位 logical bytes，包含既存 Python caches；Whisper 共用的 native DLL 只算一次。未包含 app／OS、歌曲、研究副本、UV／job cache、安裝／修復暫存與 NTFS allocation。單一 ASR 組合是按決策所需的已量測元件推算聯集；本研究 harness 為同時消融會驗證兩份轉錄，尚未製作可單獨啟用的產品 recipe。這不是新 installer 的壓縮下載大小或安裝峰值。現有正式單檔 artifact 512 MiB 上限與 Qwen 權重不相容，本輪未放寬。

新增 VAD 在 22 主案／51 窗口的實際推論合計約 16.18 s；整個品質 job 含各案新載入、解碼、完整性檢查、十組 profile 保存與副本共 103.65 s。新程序載入 2.56–3.14 s、median 2.70 s；worker peak working set 229,429,248 bytes、peak private 234,729,472 bytes。不是整個 Electron／OBS 程序樹峰值，也不是清空 OS cache 後的磁碟冷啟動。

這個 job 時間沒有包含本輪重用的 Qwen 與 ASR 原始推論。產品若尚無轉錄快取，仍需實際付出 Qwen／base／small 推論成本；不能把重播很快當成完整方案延遲。前輪原始 22 案例耗時分別約 445.3／241.3／607.8 s，因執行批次及當時負載不同，不直接加總冒稱這次量過的端到端時間。

序列載入可重用磁碟資產並降低同時 RAM，但尚未完成 managed scheduler／lease／低 RAM、GPU／量化或乾淨機驗收。CPU 64 GB 主機的成功不等於 8／16 GB 裝置或與 OBS 同時分析已通過。

## 完整性、取消與回退

每份 ASR receipt 核對原 sidecar、實際音訊 SHA、來源、canonical、窗口 index／起訖／lineIds、模型 manifest、raw model／language 與 raw SHA，不能拿另一首相同時長的轉錄來當證據。Qwen 的原 estimate 與 sidecar／來源也一致；複製後 context 再比對固定音訊／歌詞／timing／offset，來源中途變更就拒絕發布。

V2 另釘 V1 evidence SHA，重算 Qwen／base／small 三份原 results bytes 的 seed，核對 cached VAD 的完整窗口與 frame budget、ASR raw／spans。單首中有靜音與有聲窗口時逐 index 處理，不能因別窗有轉錄而拒絕合法靜音。初版重播留存，正式報告採修正後 final 重播，不回填歷史分數。

本輪五個真實 VAD 故障／取消案例包括缺模型、載入 request 取消、推論 request 待回應時取消、發布前取消及 200 ms deadline。全部保留舊 sidecar bytes／原來源並清空 owned staging。載入與推論取消另查 Windows 啟動器及 interpreter 程序樹，各觀測 3 個 PID，結束時皆不存在；不只查直接 child。deadline 可在模型開始前到期，不宣稱已完成長時間推論內的超時驗收。

十個硬篩選 profile 與四個 final 保守 profile，各自完成 22 主案＋7 壓力案的 `verifyResults`。每份 22 主案包含 79 個重複 occurrence、686 個前進／倒退時鐘樣本；原文／範圍、T1 停用回退、T2 優先、offset／文字 stale 及 owned workers 結束均通過。研究 sidecar 仍需明確內部 method 才能讀取，預設產品 loader 回退，不會自動啟用。

## 驗證結果與未完成項目

候選 Vitest 9 檔 51 tests 通過；加封裝邊界共 10 檔 58 tests。Python 兩個 suite 共 6 tests 通過。新增兩個純品質 policy 檔的 line／branch coverage 為 96.72%／91.85%；不把研究 CLI／模型推論的所有行都宣稱為相同 unit coverage。真語料重播與故障測試另提供整合證據。JavaScript／Python review 通過，發現的歧義、音訊／receipt 綁定、來源變動與正常 close guard 均補回歸。

本輪全庫 ESLint、Vite build 通過（有既有 chunk size warning）。正常權限全庫 Vitest 為 898 files／8,572 tests 通過，3 files／3 tests 失敗、1 skipped；失敗位於其他並行工作的 Import surface、performance-session deep selector、composable 命名契約，原始日誌保留，沒有改寫那些功能或把全庫標成綠燈。Markdown、格式與相對連結通過；全庫 diff whitespace 檢查當次另被並行 `src/composables/import/useImportExecution.js` 的尾端空行擋住，本輪未修改該檔。

正式 acoustic catalog／probe／loader 等 11 個來源 SHA 與前輪一致，仍為 `productUse: blocked`／`weights-evidence-pending`。研究程式在既有 packaging allowlist 之外，沒有新 IPC、正式 option、預設下載、完整 installer、可見 Electron／OBS 驗收或 commit。

正式化仍缺新的中日獨立人工／盲測、更多錯歌／錯版本／缺詞／伴奏與重複段落、可接受的誤拒預算、內容驗證方法校準、完整下載與 repair／remove 空間峰值，以及低記憶體與 UI 接受。本輪支持縮小研究方向，尚不能宣稱已有可靠的全自動歌詞內容驗證。
