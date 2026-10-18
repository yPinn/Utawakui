# 歌詞對齊第一輪實測與漸進模型選型

目前收斂建議見[研究收斂與實作評估](lyrics-acoustic-segmentation-implementation-assessment-2026-10-19.md)；本輪結果仍保留原始任務與樣本條件。

日期：2026-10-18。[前期研究與現行環境分析](lyrics-audio-alignment-evaluation-2026-10-18.md)的執行追蹤。

後續中日韓獨立標註／外部參考實測、活動與段落檢查、中文 CTC 比較及真正產品安裝布局容量，見[第二輪實測與環境選型](lyrics-alignment-cjk-evaluation-2026-10-18.md)。第一輪數字保留為當時證據，最新選配判斷以第二輪為準。

本輪已下載並執行 Qwen3 ForcedAligner 0.6B 與英文 wav2vec2 base CTC，實跑現有 quick／general 分離和 Beat This! small0，並檢查靜音、截斷、錯序、重複文字與既有段落分析。結論是保留兩個對齊候選，優先補品質檢查與粗定位；目前證據不足以指定正式預設，也沒有理由為這項功能先增加大型 ASR 或 CUDA 環境。

## 1 實驗範圍與可信度

公開資料來自 [JamendoLyrics](https://huggingface.co/datasets/jamendolyrics/jamendolyrics)，選取 5 首，使用其獨立人工字詞時間，不把模型輸出當真值。共 8 個片段、296 個參考字詞；其中英文 3 首、6 片段、227 字詞可直接比較兩個模型，德文與法文各 1 片段只測 Qwen。每段 22.40–23.71 秒。

片段起點與文字選取使用資料集的既有句級標註，保留約 1 秒前導與 0.75 秒尾端，屬於已知粗位置、正確文字的理想條件。沒有驗證從整首音訊自動找到句子，也沒有測從零聽寫。這是探索性 pilot，不能把同首歌內的 227 字詞視為 227 個獨立歌曲樣本，亦不能外推為中日韓整體準確率。

另用本機日／中／韓歌曲作 5 個結構 smoke case：日、中各有原曲與既有人聲，韓文只有原曲。這些沒有獨立逐字真值，只能確認可執行、文字保留、零長及越界；私有音訊與歌詞未外傳。

公開曲目與資料集所記授權類型如下。資料集程式授權與逐首音訊授權分開處理，完整 metadata／LICENSE 保存在研究工作區。

| 語言 | 曲目與作者                                                                                                 | 資料集記載 |
| ---- | ---------------------------------------------------------------------------------------------------------- | ---------- |
| en   | [Bad Side — Rxbyn](https://www.jamendo.com/track/1556580/bad-side)                                         | BY         |
| en   | [Feel (Stripped) — Cortez](https://www.jamendo.com/track/1481500/feel-stripped)                            | BY         |
| en   | [Is It Right — Lower Loveday](https://www.jamendo.com/track/1559614/is-it-right)                           | BY-SA      |
| de   | [Freifliegen — durch.dick.und.duenn](https://www.jamendo.com/track/34276/freifliegen/lyrics)               | CC BY-SA   |
| fr   | [Christmas avec toi — imfreshyourepretty](https://www.jamendo.com/track/1173749/christmas-avec-toi/lyrics) | CC BY      |

## 2 環境、模型與執行方式

本機 Windows 11、16 logical processors、實體 RAM 67.82 GB。雖有 RTX 5060 Ti 16 GB，本輪所有新增對齊與分離推論都在 CPU 執行，沒有量測 CUDA 效能。對齊使用 Torch 6 threads、FP32、eval／inference mode，從固定本地檔案載入。

研究 venv 為 Python 3.14.0、Torch 2.11.0+cpu、NumPy 2.5.2、Transformers 5.20.1，並實際安裝 nagisa 0.3.0、dyNET38 2.2、soynlp 0.0.493。其他固定依賴保存在 environment freeze。這證明此組合可在 Python 3.14 上執行，尚不等於產品 Python 3.14.7／既有 PyPI Torch wheel／immutable lock 已通過整合；兩者 Python patch version 和 Torch artifact 不同。

| 候選                                                                                   | 固定 Hugging Face revision                 | 上游必要檔案大小，不含研究 manifest |
| -------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------- |
| [Qwen3 ForcedAligner 0.6B hf](https://huggingface.co/Qwen/Qwen3-ForcedAligner-0.6B-hf) | `c07281df297b9905d24a508279258cccf987a064` | 1,847,225,867 bytes                 |
| [facebook/wav2vec2-base-960h](https://huggingface.co/facebook/wav2vec2-base-960h)      | `22aad52d435eb6dbaf354bdad9b0da84ce7d6156` | 377,610,353 bytes                   |

兩者都只取一種權重格式及必要 config／tokenizer，權重下載以串流落盤，核對上游大小與 SHA-256。沒有整包下載重複格式，也沒有下載 Qwen ASR、中日韓各自的 XLSR 或 CUDA Torch。

Qwen 使用 Transformers 原生 forced alignment processor／model／decode，時間格為 80 ms。英文基準使用相同已知文字與 wav2vec2 logits，執行帶 blank／重複 token 規則的 CTC Viterbi；不是完整 WhisperX pipeline，也沒有事後以真值調全域 offset。CTC frame time 以輸入時間長度／輸出 frames 映射，尚未做前端中心偏移校正，因此不能把此基準的全部誤差歸因於聲學權重。

FFmpeg 把原曲解碼成 16 kHz mono 供對齊。分離測試另從原始 MP3 解碼為 44.1 kHz stereo，再走產品既有 separateTrack CPU 路徑；四通道輸出的 guide-vocal L/R 混成 mono、轉 16 kHz。早期 mono-upsample 探針另存，未納入本報告的分離結果。

Beat This! 實驗直接使用已安裝的 Python 3.14.7 runtime、現有環境、small0 權重與未修改的產品 worker，minimal postprocessor、50 fps；輸入同片段的原始音訊。輸出只寫入研究工作區，不變更 activation 或曲庫 sidecar。

## 3 原曲對齊結果

所有門檻命中率以全部參考字詞為分母。缺失或零長結果不會因為被排除於誤差中位數而提高命中率。「有效區間覆蓋」只表示存在有限且 end > start 的時間區間，不代表唱對了、也不代表音訊上真的有此字詞。中位數與 P95 僅計有效區間，需搭配覆蓋一起看。

| 英文 227 字詞，同一組輸入  | Qwen aligner | 英文 CTC |
| -------------------------- | ------------ | -------- |
| 有效區間覆蓋               | 93.4%        | 100%     |
| 起音誤差 ≤100 ms           | 70.9%        | 58.6%    |
| 起音誤差 ≤200 ms           | 82.8%        | 82.8%    |
| 起音誤差 >500 ms           | 6.2%         | 8.8%     |
| 有效區間起音誤差中位數     | 44.2 ms      | 70.7 ms  |
| 有效區間起音誤差 P95       | 619.0 ms     | 787.6 ms |
| 6 段推論合計，不含首次載入 | 12.12 s      | 6.78 s   |
| 首次模型載入               | 2.46 s       | 0.39 s   |
| 本程序取樣 peak RSS        | 4.83 GB      | 1.38 GB  |

6 段音訊合計 141.32 秒。這些是本機短片段、單輪測量，不是整首歌曲或低規格機器的 SLA；模型外的 FFmpeg、分離、下載及 app 記憶體另計。RSS 每 50 ms 取樣，涵蓋模型載入與推論，並非 OS 所記錄的絕對最高峰值。

逐片段 Qwen／CTC 的 100 ms 命中率分別為：

| Case        | 參考字詞 | Qwen  | CTC   |
| ----------- | -------- | ----- | ----- |
| public-00-0 | 40       | 77.5% | 77.5% |
| public-00-1 | 44       | 75.0% | 54.5% |
| public-01-0 | 34       | 61.8% | 29.4% |
| public-01-1 | 40       | 85.0% | 77.5% |
| public-02-0 | 34       | 64.7% | 50.0% |
| public-02-1 | 35       | 57.1% | 57.1% |

Qwen 比此 CTC 基準更接近精細掃色需求，但仍有 15/227 零長字詞，兩者都沒有通過前期提出的 90% within 100 ms 研究門檻。保留 CTC 作速度／容量基準，不能因其覆蓋 100% 就宣稱其品質更好。

德文單片段 Qwen 的 100 ms 命中率 63.6%、有效覆蓋 95.5%。法文單片段有效覆蓋僅 23.4%、100 ms 命中率 6.4%，屬嚴重失敗，分離亦未修復。尚未完成聽校與版本／發音逐項歸因，不能據此宣稱所有法文不支援或把失敗單獨歸咎資料集；必須保留這個反例。

## 4 分離值得共用，但較大的分離模型沒有穩定勝出

從原曲挑選兩個英文片段，共 75 字詞，對照原曲、quick 人聲、general 人聲。這是局部配對比較，不能與上一節全體 227 字詞混用分母。

| 同一組 75 字詞 | Qwen ≤100 ms | Qwen ≤200 ms | CTC ≤100 ms | CTC ≤200 ms |
| -------------- | ------------ | ------------ | ----------- | ----------- |
| 原曲           | 68.0%        | 77.3%        | 68.0%       | 84.0%       |
| quick 人聲     | 76.0%        | 85.3%        | 70.7%       | 90.7%       |
| general 人聲   | 77.3%        | 85.3%        | 65.3%       | 88.0%       |

Qwen 的 >500 ms 字詞由 8.0% 降為兩種人聲各 1.3%，顯示分離有共用價值。不過 CTC 在這組 general 上的 100 ms 命中率反而低於原曲。三個公開片段的 quick 分離約 7.86–8.63 秒，general 約 18.76–19.94 秒；包含該研究呼叫的載入、輸出及 guide 提取，不是純 kernel 時間。

產品策略應先重用已有分離；未有分離時優先比較 quick 與原曲。不要因 general 耗時較高就假設時間更準，也不要為對齊一律強制重做高品質分離。較合理的後續方向是以聲學一致性挑選原曲／人聲候選，只重跑低信心窗；本輪沒有用真值選每個字的較佳結果來製造 ensemble 成績。

## 5 人聲與節拍應如何配合

對同一組英文 227 字詞，以現有 Beat This! small0 輸出的拍點建立 beat／半拍／四分之一拍格線，將 Qwen 有效 span 整體移到最近格線，保留原 duration。這只隔離起音吸附的影響，沒有宣稱整個 span 是可發布結果。另測只允許移動 40 ms 的四分之一拍吸附；閾值事先固定，未依真值調參。

| 方法                       | 起音 ≤100 ms | 起音 ≤200 ms |
| -------------------------- | ------------ | ------------ |
| 原始 Qwen                  | 70.9%        | 82.8%        |
| 強制貼最近 beat            | 27.8%        | 57.7%        |
| 強制貼最近半拍             | 49.3%        | 79.7%        |
| 強制貼最近四分之一拍       | 63.4%        | 82.4%        |
| 四分之一拍、最多移動 40 ms | 68.3%        | 82.8%        |

本輪未找到自動吸附的改善證據，即使 bounded snap 也沒有提高命中率。短片段 beat 自身可能有偏差；本實驗沒有 beat 真值，不能分解成拍點偵測誤差與歌詞離拍各占多少，也不代表所有音樂先驗方法無效。

可保留的方向是把節拍用於候選句界／段落界、長空白檢查和粗定位先驗，最終字詞邊界交給聲學對齊。不應沿每拍均分歌詞。現有分離只有 accompaniment／guide vocals，沒有鼓 stem；本輪也未測真正四軌鼓分離，所以「vocal＋獨立鼓 stem」仍是未驗證的額外方案，不能把此次 beat 對照說成鼓分離已驗證。

## 6 錯誤行為與需要補的檢查

以下負向測試用同一個 40 字詞英文片段，除前綴靜音可調整真值評分，其餘刻意不給準確度，檢查模型是否會錯誤地產生貌似正常的結構。

| 輸入情況                   | Qwen 行為                           | CTC 行為                | 工程判斷                                               |
| -------------------------- | ----------------------------------- | ----------------------- | ------------------------------------------------------ |
| 前加 2 秒靜音、保留原文    | 40 units，3 零長；100 ms 命中 75.0% | 40 有效區間；命中 75.0% | 需要絕對時間映射；增減上下文仍會改變部分邊界           |
| 全靜音配正常歌詞           | 40 units，38 零長                   | 40 非零且未越界         | 格式與完整覆蓋不能證明音訊吻合；先拒絕無訊號輸入       |
| 音訊只保留前半，文字完整   | 18 零長、17 越界，兩者可重疊        | 40 非零且未越界         | 需缺音／缺段檢查；不能靠 clamp 把越界變正常            |
| 歌詞字序反轉               | 15 零長                             | 40 非零且未越界         | 需序列／聲學一致性，文字保留不是辨識成功               |
| 歌詞重複兩遍，音訊只有一遍 | 80 units，35 零長、33 越界          | 80 非零且未越界         | 不能用整首文字硬壓進任意窗；需重複句與 occurrence 檢查 |

本機 CJK smoke：日文原曲／guide 各 25 個模型 units，皆無零長、無越界；中文各 36 units，原曲 5 零長、guide 3 零長；韓文 16 units，無零長／越界。文字正規化後均保留。這些 units 是模型詞塊，不是人工逐字真值，也不能把 0 零長寫成日韓準確率 100%。

英文真值中 duration ≥600 ms 的 56 個字詞，Qwen 有效 54 個、100 ms 起音命中 64.3%，有效字詞的結尾誤差中位數 229.5 ms；CTC 有效 56 個、起音命中 58.9%，結尾誤差中位數 217.9 ms。這是長字詞診斷，未獨立標註拖音／轉音，不能把字詞時長直接當 melisma 真值。它已足以說明起音看似準確時，掃色結尾仍可能偏差；不得用等分時長補零長。

優先補強如下，前三項比新增另一個 GB 模型更值得先做：

1. 輸入與時間軸：檢查採樣率、絕對 crop offset、原曲／guide 相同時長、缺段、版本差與前後靜音。不要刪除靜音後忘記還原非線性時間映射。
2. 聲學有效性：先拒絕全靜音，再比較 guide 的 vocal activity、alignment posterior／blank、持續時長及跨窗一致性。只有 energy 不能區分氣音、殘響、和聲與主唱；不能當成已完成的 singing VAD。
3. 文本與序列：保留原文及讀音映射，區分缺字、贅字、混語和相同副歌的不同 occurrence；在重疊窗用前後文與序列單調性挑選，不自動改歌詞來迎合模型。
4. 結果與回退：零長、越界、異常壓縮、模型分歧標成待校正，不夾回範圍後當成功；局部保留 T1／人工校正。T2 只發布通過的真實 spans，不以 80 ms grid 或字數插值冒充高精度音素。

## 7 可以順便共用的分析，以及段落能力的界線

| 分析                                       | 可重用資產／容量                           | 本輪證據與適用程度                                                 |
| ------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------ |
| 歌詞空白、重複文本、時間異常               | 既有歌詞與 metadata；不增加聲學權重        | 可作候選與檢查；歌詞沒寫不等於沒有唱聲                             |
| 聲音能量、onset envelope、guide 候選活動區 | FFmpeg PCM、已有 guide；不增加大型權重     | 全靜音反例證明檢查必要；本輪未完成 singing activity 的獨立標註評估 |
| BPM、beat、downbeat、粗句界先驗            | 現有 small0；本輪零新增權重                | 已跑 6 段；硬吸附不改善字詞，仍可保留結構候選用途                  |
| 前奏／間奏／尾奏候選                       | guide 活動＋歌詞空白＋音樂變化             | 應標「候選休息區」；背景和聲、ad-lib 與分離殘留需排除，尚無準確率  |
| Verse／chorus／bridge 語意標籤             | 現有 M2 研究模型，或另一套模型             | 需人工真值；Qwen aligner 的輸出不提供這些分類                      |
| 重複音樂段落、調性／音高／旋律             | chroma／self-similarity 或額外 pitch model | 有助版本／段落研究，但未在本輪量測，不作已提供能力                 |

既有 M2 兩張專輯 27 首研究輸出均完成，20 首至少有 confidence <0.5 的段落，22 首在首／尾有小於 2 秒的 fragment；這是模型自身的品質訊號，沒有獨立段落標註，因此不是錯誤率。21 首最後 end 與 duration 有差，但最多只有 7 ms，屬尾端四捨五入，不列為嚴重切段失敗。原先 decoder sweep 的固定窗／邊緣守則只能當候選消融，尚不能挑出最準 decoder。

應分開驗收「邊界位置」與「語意標籤」。先允許 unknown 與低信心退回；用人工 boundary F1@0.5 s／3 s、over／under-segmentation 和 label confusion 評估。這些粗段落可幫助對齊搜尋範圍，但不能直接決定每個字的開始與結束。

另外查核了 [SongFormer 官方模型](https://huggingface.co/ASLP-lab/SongFormer)與[載入實作](https://huggingface.co/ASLP-lab/SongFormer/blob/main/modeling_songformer.py)。其完整 HF 路徑建立 MuQ、MusicFM 與結構 head，`model.safetensors` 單檔 2,755,035,132 bytes；約 104 MB 的獨立 head 不是完整可執行包。此 revision 為 `a75880ed1b7375ac71860ec6c4fc9c899cf99515`，整 repo 約 2.965 GB 包含重複 head 格式。只有讀 metadata／source，未下載權重或執行；依賴、權重條件和 Python 3.14 相容性未完成，不能因已有 Torch 或 aligner 就說段落分析免費附送。

## 8 實際容量與選型決定

以下全部採十進位 GB，1 GB＝1,000,000,000 bytes。磁碟、下載與執行 RAM 分開，不把它們相加成同一個「容量」。

| 實際量測項目                  | Bytes／GB                 | 限制                                                           |
| ----------------------------- | ------------------------- | -------------------------------------------------------------- |
| 本機既有 Audio Python runtime | 24,647,944 B              | 已解壓檔案總和                                                 |
| 本機既有節拍 environment      | 529,626,901 B             | 目前 installed graph                                           |
| 本機既有 small0 models 目錄   | 8,451,978 B               | 含少量 metadata                                                |
| 既有三項合計                  | 562,726,823 B／0.563 GB   | 與前期 UI 0.557 GB estimate 不同口徑，這裡是本機實量           |
| 新研究 venv                   | 1,235,629,698 B／1.236 GB | 含 pip／研究工具／pyc，未含全域 Python base；不是最小產品 lock |
| Qwen 必要模型檔               | 1.847 GB                  | 上游檔案合計；研究 manifest 約另 1 KB                          |
| 英文 CTC 必要模型檔           | 0.378 GB                  | 與 Qwen 分別保留，未假設權重可去重                             |
| 本輪兩模型目錄合計            | 2,224,838,557 B／2.225 GB | 含研究 manifest                                                |

只保留此研究 venv＋Qwen 模型即約 3.083 GB，venv＋CTC 約 1.613 GB；同一 venv 保留兩模型約 3.460 GB。這些是已跑通 prototype 的檔案占用，不是完整產品功能包：Python base 來自全域安裝，Beat This! 另外使用既有產品環境，語料／PCM／研究輸出另計。

若把等大的 prototype 作第二個獨立環境並保留現有 pack，Qwen 路徑新增檔案約 3.083 GB，兩者帳面總和約 3.646 GB，還需計入該產品部署真正新增的 runtime／adapter 檔案。不能將 venv 的 1.236 GB 全視為相對既有 0.563 GB 的共用淨增量。正式聯合 lock 尚未產生，因此前期 2.6–3.0 GB 聯合安裝預算仍是估計，這輪實測不能將其升格為承諾；應用實際 wheel graph、解壓與 GC 後結果取代。

研究 pip cache 約 0.291 GB，不等於可重現安裝所需的完整下載量，也沒有計入上述部署大小。本輪沒有再下載任何 GB 級 CUDA 或 ASR。CPU Qwen peak RSS 約 4.83 GB，建議以記憶體可用量決定能否排入工作，不能只按磁碟權重 1.85 GB 判斷 RAM。

| 選項                       | 本輪決定                            | 原因                                                          |
| -------------------------- | ----------------------------------- | ------------------------------------------------------------- |
| Qwen 多語 aligner 1.847 GB | 保留主要研究候選，尚未產品啟用      | 英文細時間優於此 CTC 基準；CJK 跑通，但仍缺逐字真值與零長修正 |
| 英文 CTC 0.378 GB          | 保留輕量基準／可能的英文選配        | CPU 較快、RSS 較低；格式覆蓋不能驗證正確，品質未勝出          |
| quick／general             | 重用既有資產；先評 quick 與原曲雙路 | 已有局部改善證據；general 沒有穩定占優且耗時更多              |
| 四語各裝 CTC 約 4.192 GB   | 暫不增加下載                        | 尚未證明品質收益足以抵多語 aligner 之外的容量                 |
| 小／大型 ASR 與 CUDA pack  | 不因已有歌詞的對齊強制安裝          | 這輪未驗證新增收益；CPU 已能跑短窗，需求與成本分開            |
| 新段落模型如 SongFormer    | 維持額外研究能力                    | 單完整權重約 2.755 GB，需段落真值與完整環境驗證               |

GB 模型進產品前仍需修正目前 downloadBuffer 的整檔累積與 Buffer.concat 路徑，改成串流／增量 hash／staging，驗證取消、更新暫存與卸載。研究腳本的串流下載成功不代表既有產品安裝器已支援此容量。

下一輪應先補中文、日文、韓文的獨立逐字真值，以及整曲的版本／重複段落粗定位；以原曲／quick／general 相同樣本比較，固定門檻後再做 held-out 驗證。低信心局部重跑與 acoustic score 必須先能辨識本輪負向案例，再考慮 ensemble 或量化模型。段落則獨立完成標註與邊界／語意驗收，無須阻擋已有歌詞的局部對齊研究。

## 9 驗證與產出

研究腳本與原始 JSON 位於 ignored `tasks/lyrics-alignment-pilot-2026-10-18/`，包含固定版本與 hash manifest、freeze、public corpus metadata、cases、兩模型 baseline、原曲／分離比較、CJK smoke、行為負向測試、beat ablation、long-word 與既有 M2 audit。此目錄不是隨 repository 發布的資料集或部署包。

評分／時間映射／CTC 重複 token／無路徑／非有限值／bounded snap 共 9 個 focused tests 通過；新增 snap 先驗證 RED，再補實作 GREEN。模型執行結果與跨檔彙總以原始 JSON 核對，不從人工抄寫的百分比回推。

驗證完成：129 份 Markdown lint 無問題、兩份研究文件 Prettier check 通過、5 個研究 Python 腳本 AST 與 Node 分離腳本語法檢查通過。未修改產品程式，因此本輪未重跑完整 app build／packaging，也不將先前測試當作新功能整合成功。

本輪只新增研究文件與 ignored 工具，沒有啟用產品能力、變更曲庫 sidecar、改 production runner 或提交 commit。段落準確率、CJK 精度、完整產品 lock／安裝容量與 GPU 效能均明確保留為未通過項目。
