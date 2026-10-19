# 逐字歌詞音訊對齊研究與環境配置評估

本文保留當輪研究與分母；目前跨批次選型及未決項集中在[研究結論](lyrics-alignment-summary.md)。

本次研究的決策建議、最新容量與實作順序，集中於[研究收斂與實作評估](lyrics-acoustic-segmentation-implementation-assessment-2026-10-19.md)。本文保留前期方法研究，實量與任務邊界以後續報告為準。

研究日期：2026-10-18。適用於 Utawakui 的 Windows x64 本機歌曲準備流程。

建議以「已確認歌詞＋音訊強制對齊」作為主要方向，重用現有人聲分離結果，將節拍作為可關閉的輔助證據。先比較通用多語對齊與歌唱專用音素對齊，再決定產品預設。CPU 也能產生真正的字詞時間；較大 GPU 的主要價值是縮短等待、容納更好的分離與多次推論，不能直接換算成更高準確率。

此前期階段完成程式閱讀、上游資料查證與實驗設計。使用者後續授權的下載、CPU 實測、分離／節拍消融、負向行為與實際容量，見[第一輪實測報告](lyrics-alignment-pilot-2026-10-18.md)。下文保留研究時的現行實作、上游實驗、工程推估與建議驗收門檻；其中環境預算不是實量，不應取代後續量測。

產品採漸進提供模型環境，因此實際選配與容量判斷以第 12 節的現行環境增量為主。硬體分級只作執行條件參考，不能替代完整下載與安裝成本。

最新實量見[中日韓第二輪實測與漸進環境選型](lyrics-alignment-cjk-evaluation-2026-10-18.md)：含完整候選 lock、現行 installer 布局／probe、中文 CTC 字首與字尾差異，以及活動／重複／段落檢查。該輪容量與品質結論優先於本文初期預算。

## 1 問題定義

使用者所說的「逐字」至少包含四個不同問題，不能用同一個準確率回答。

| 問題             | 輸入與輸出                                      | 主要方法                                 |
| ---------------- | ----------------------------------------------- | ---------------------------------------- |
| 聽出歌詞         | 音訊 → 文字                                     | 歌唱 ASR／automatic lyrics transcription |
| 找到整句位置     | 文字＋音訊 → 每句起訖                           | 粗對齊、文字錨點、序列搜尋               |
| 找到字詞起訖     | 正確文字＋音訊 → word／character／phoneme spans | Forced alignment，強制對齊               |
| 決定字幕如何分組 | 文字與既有時間 → 顯示詞塊、換行、掃色           | 語言與 presentation policy               |

產品最先需要的是第三項。已有可靠歌詞時，再跑完整 ASR 不一定有幫助，反而增加錯字與省略重複句的風險。ASR 可用於缺文字、找粗略錨點、檢查音訊與歌詞是否同版本；不應自動改寫使用者選定的歌詞。

時間也要區分「子音開始」「母音／音節起音」「聲音結束」及「字幕掃色結束」。歌手可能先發子音、再在拍點唱出母音；殘響會晚於實際發聲結束。音素真值與 KTV 視覺驗收應分開，避免用全域 offset 掩蓋定義不同。

## 2 現行系統實作

以下依研究當下工作樹核對，既有未提交工作保持原狀。

| 範圍          | 現行行為                                                                                                             | 對新方案的影響                                               |
| ------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 時間模型      | T0 無時間、T1 整句、T2 句內片段；T3 字素／音節仍保留                                                                 | T2 是片段容器，名稱不保證每一字都有獨立時間                  |
| 外部來源      | LRCLIB、NetEase、Better Lyrics；通過驗證的來源可提供 T2                                                              | 已有正確 T2 優先保留，不必全部重算                           |
| T1 掃色       | 依可見字素權重分配句長；CJK 多按字素、空白分詞的文字按字數權重                                                       | 沒有聽音訊；拖音、休止、連唱容易失準                         |
| 手動編輯      | 沿用既有 segments、相符 reading spans，否則按空白建議切分；tap、nudge、undo                                          | Reading 切詞不是演唱時間證據；目前不是自動對齊               |
| 分離          | `quick` 為 KARA2、`general` 為 Inst HQ4，ONNX MDX；優先 DirectML，失敗回 CPU                                         | 可重用已完成的人聲，但須驗證提取結果對對齊的效果             |
| 音軌          | 44.1 kHz 四聲道 WAV：伴奏 L/R、人聲 L/R；人聲由現行 instrumental-primary 路徑推導                                    | 沒有獨立鼓軌；不是已分離的 drums／bass／other 四種 stems     |
| 節拍分析      | Beat This! `small0`，`beat-this-small0-cpu-v3`；來源為曲目的原始音訊                                                 | 可重用 M1 beat／downbeat，但目前不推斷字詞邊界               |
| 模型執行      | Audio Python host、generation lease、heavy-job scheduler 已有；capability 白名單目前是 Refined 與 structure-analysis | 加 lyrics-alignment 仍需新增契約與 lifecycle，不能視為已支援 |
| 播放與 Output | Renderer 保持時間權威，Output 消費投影；Music Analysis 與 lyrics timing 分開                                         | 音訊分析應在歌曲準備階段產生候選，再經驗證保存               |

程式與契約入口：

- [Lyrics timing contract](../contracts/lyrics-timing-contract.md) 與 [ADR 0010](../adr/0010-lyrics-timing-granularity-and-output-content-split.md)。
- [T1 估算投影](../../shared/presentation/state.mjs)、[文字權重](../../shared/presentation/lyricsTimingUnits.mjs)。
- [編輯器切分](../../src/utils/lyricsTiming.js)、[手動時間編輯](../../src/composables/useLyricsTimingEditor.js)。
- [分離 recipes](../../electron/lib/audioProcessing/recipes.js)、[四聲道產生](../../electron/lib/vocalSeparation.js)。
- [分析來源](../../electron/lib/library/musicStructure.js)、[分析 job](../../electron/lib/audioProcessing/structureAnalysisJob.js)、[Python worker](../../resources/audio-processing/structure_analysis_worker.py)。
- [Audio Python host](../../electron/lib/audioProcessing/audioPythonRuntimeHost.js)、[現有 Python lock](../../resources/audio-processing/analysis-beat-this-py314-lock.json)。

目前 normalizer／sidecar validator 能證明結構、文字串接與時間順序合法，無法證明歌聲真的在該時間唱出該字。來源的「逐字同步」與模型的品質判定必須分開。

## 3 常見方法與適用範圍

### 純文字分配與音量切分

等分／按字長分配便宜、無模型依賴，但沒有聲學證據，只適合顯示 fallback。音量、頻譜通量、onset、VAD 可找休止與候選起音，無法單獨判斷是哪一個字；同一個母音可以拖很久，兩個字也可能無停頓連唱。

一般 speech VAD 對氣聲、假音、長母音與和聲不一定可靠。建議先作邊界提示與排除純伴奏的證據，不將「未判定為 speech」直接當成必須刪除的片段。保留裁切前後文，避免切掉句首子音或句尾拖音。

### Whisper 類 ASR 時間與 attention 對齊

ASR 可以同時提供文字和粗時間；attention／DTW 可進一步產生字詞候選。[whisper-timestamped](https://github.com/linto-ai/whisper-timestamped) 採用 cross-attention 的 DTW，並提供 confidence。這類方案可作 baseline，但文字識別與時間精度必須分別評量，較大 ASR 不等於更精準的字詞時鐘。

[stable-ts](https://github.com/jianfch/stable-ts) 有對齊與 refinement 功能，但上游已在 2026-05-30 archive。適合比較既有方法，新增長期產品依賴的優先度較低。

### 已知文字的 CTC 強制對齊

聲學模型對每個時間 frame 輸出 token 分數，再以受文字順序約束的動態規劃尋找路徑。[WhisperX](https://github.com/m-bain/whisperX) 的 wav2vec2 alignment 是常見基準，已有文字及粗時間時可直接測 alignment 階段，省掉 Whisper transcription。它需要適當的語言模型；上游列出字典外文字及重疊人聲等限制。對齊失敗時的補值／插值不能算作模型量測成功。

[NeMo Forced Aligner](https://docs.nvidia.com/nemo-framework/user-guide/latest/nemotoolkit/tools/nemo_forced_aligner.html) 也接受給定文字，使用 CTC 或 hybrid 模型的 CTC 路徑，能輸出 token／word／segment。它適合長音訊與另一組 baseline；相對於 Utawakui 的桌面功能，完整 NeMo stack 的依賴成本需要另外衡量。

[MMS_FA](https://docs.pytorch.org/audio/stable/generated/torchaudio.pipelines.MMS_FA.html) 是多語研究基準，但其權重列為 CC-BY-NC 4.0，不能因 TorchAudio 程式可使用就當成已清除產品授權門檻。[多語教學](https://docs.pytorch.org/audio/stable/tutorials/forced_alignment_for_multilingual_data_tutorial.html) 還要求文字 normalization／romanization，且標示舊 API deprecated／移除計畫；應驗證實際套件 API，不將舊範例直接裝入現有 Python lock。

### 傳統音素強制對齊與歌唱專用對齊

[Montreal Forced Aligner](https://montreal-forced-aligner.readthedocs.io/en/v3.3.4/user_guide/workflows/alignment.html) 使用發音字典與聲學模型，能適應或訓練模型，是值得保留的對照。模型若主要學語音，對歌唱長母音、極端音高與變形發音的效果仍須測試。

[SOFA](https://github.com/qiuqiao/SOFA) 明確針對歌唱，透過 G2P／字典將文字轉成音素，再找音素邊界，提供 confidence 及 ONNX 匯出。它值得列為中文歌唱候選；跨語效果取決於各語言的 checkpoint、phone inventory 與字典。程式 MIT 不代表所有社群權重均已有相同授權。

### 新的多語時間預測模型

[Qwen3-ASR 官方專案](https://github.com/QwenLM/Qwen3-ASR) 把 ASR 與 ForcedAligner 分開。ASR 的歌曲支援不能直接當成 aligner 已通過歌唱驗收；aligner 支援中、日、韓、英等 11 語及最長 300 秒輸入，可用已知文字獨立對齊。

[技術報告第 3 節](https://arxiv.org/html/2601.21337v1#S3) 的時間分類以 80 ms 格點表示。因此可作多語候選與粗細兩階段中的第一階段，不能承諾原生 10–20 ms 邊界；更大 GPU 也不會改變固定 checkpoint 的這項解析度。[原生 Transformers model card](https://huggingface.co/Qwen/Qwen3-ForcedAligner-0.6B-hf) 列出 Apache-2.0 與約 0.9B 總參數；不能把名稱的 0.6B 直接當成整體記憶體需求。

### 歌唱的聯合建模與雲端服務

[Joint Pitch Detection](https://arxiv.org/abs/2202.01646) 研究顯示，利用歌唱音高及邊界訊息可以改善歌詞對齊，包含降低跨行錯誤。這支持後續加入旋律訊號的方向，但音高變化不能被解讀為每字切點。

[STARS](https://aclanthology.org/2025.findings-acl.781/) 聯合處理音素、音符與演唱技巧，適合研究精細歌唱分析的上限；完整標註框架不宜直接當成第一版桌面必裝功能。

[ElevenLabs Forced Alignment](https://elevenlabs.io/docs/overview/capabilities/forced-alignment) 與其 [API](https://elevenlabs.io/docs/api-reference/forced-alignment/create/) 可接受音訊及文字並回傳字元／詞時間。可以作自願的雲端對照，但官方介面能力不等於對目標歌庫的歌唱品質證據；上傳、網路、計費與資料處理條件也使它不適合作為 local-first 預設。

## 4 人聲加鼓點的構想如何落地

可行的組合是「文字與發音決定對齊內容，人聲提供主要時間證據，節拍提供弱約束」。鼓聲 onset、音樂拍點與歌唱音節 onset 是三種訊號，不能互換。

例如 120 BPM 的一拍是 500 ms。把字首硬吸附到最近四分音符，僅量化本身就可能移動 250 ms；八分或十六分細分能縮小距離，卻仍無法處理 swing、搶拍、拖拍與 rubato。鼓組 fill 也可能有很多瞬態，完全沒有對應的新歌詞。

各訊號較合理的用途如下。

| 訊號                 | 可協助的判斷                   | 不足以單獨決定                           |
| -------------------- | ------------------------------ | ---------------------------------------- |
| Vocal activity／能量 | 歌唱句落在哪裡、句內休止       | 每個字的身分與連唱切點                   |
| 音素／字元 posterior | 給定文字中每個單位的位置       | 歌詞漏字、錯版本時的正確替代內容         |
| Beat／downbeat       | 節奏位置、可能的細分與離群提示 | 所有字都應落拍、每拍有一字               |
| Drum onset           | 打擊樂瞬態、節奏密集度         | 一個瞬態就是一個音節                     |
| F0／note onset       | 拖音、旋律轉折、候選邊界       | 換音必須換字；一字可以多音，多字也可同音 |
| 既有 T1              | 搜尋範圍、重複副歌的順序錨點   | 該句起訖一定準確，或句尾一定唱到下一句   |

建議流程：

```text
已確認原文歌詞 ── 發音候選與原文映射 ──────────┐
                                             │
原始錄音 ── 原曲或既有 guide vocal ── 聲學對齊 ─┤
                                             ├─ 候選比較與低信心標記
原曲 ── 既有 Beat This! ── 拍點與可信度 ────────┤
                                             │
局部人聲 ── onset／必要時 F0 ── 邊界提示 ───────┘
                 ↓
可試聽的候選時間 → 人工修正／接受 → 驗證後的 T2
```

這是提案，不是已實作 pipeline。第一版重用現有 M1 即可；先比較原曲、quick 人聲、general 人聲，不需要為每首多跑 drums separation。[ISMIR 2025 的 source-separated conditions 研究](https://ismir2025program.ismir.net/lbd_412.html) 直接比較不同分離方法，指出分離方法會造成顯著差異；因此「人聲分離必定更準」也須保留為待測假設。

節拍若加入解碼，建議只在聲學證據接近、節拍可信、局部節奏穩定時作候選排序。聲學邊界明確時保留原結果；不清楚時標示待確認，不為了整齊強行量化。一般 GPU 能否改善字詞時間，應看這項消融實驗，而不是節拍圖看起來是否規則。

## 5 語言與歌唱內容的差異

| 類型             | 首要難題                                             | 處理方向                                                     |
| ---------------- | ---------------------------------------------------- | ------------------------------------------------------------ |
| 國語／繁中       | 多音字、輕聲、兒化、簡繁與異體字                     | 原文不變，建立可逆的發音／模型文字映射；字時間與詞時間分開   |
| 日文             | 漢字與實際唱法不是一對一；促音、長音、連音、特殊讀法 | 漢字詞 → kana／mora／phoneme → 時間，再映回可顯示詞塊        |
| 韓文             | 空白詞與 Hangul 音節不同；連音、緊音、收音改變       | 模型所需的實際發音序列與原始 Hangul spans 並存               |
| 英文             | 多音節、縮讀、連讀、詞尾子音                         | 先 word，再評估音節／phone 是否對動畫有價值                  |
| 中英／日英混唱   | 語言在句內切換                                       | 比較單一多語模型與分語言片段；切換處列為高風險               |
| Rap／高速連唱    | 短字與密集起音                                       | 較細 frame 模型、足夠上下文；不按鼓點逐字硬切                |
| 長拖音／轉音     | 一字多音、子音短而母音長                             | 分開起音與延續，不將每次 F0 變化當成新字                     |
| 合唱／主唱與和聲 | 同時有不同音節與不同句子                             | 先限定單一主唱時間 lane；不能靠現有 vocals stem 保證主唱分離 |
| Live／翻唱／剪輯 | 歌詞與錄音版本不同、重複或省略句                     | 先確認版本與段落順序，錯版應拒絕整首套用                     |
| 哼唱／ad-lib     | 來源歌詞可能沒有這段文字                             | 保留無對應區間，不能讓 aligner 把不存在的字塞入              |

例如日文「今日」的顯示字元有兩個，唱法「きょう」不能靠等分就推出每個漢字時間。先保留可解釋的詞塊時間，比虛構每漢字邊界更可靠。現有 kuromoji／reading 可提供發音候選，但詞典讀音仍須允許歌手唱法或使用者校正。

## 6 不同環境配置可達到的程度

下表是工程配置建議。RAM 指整機容量，VRAM 指獨立顯示記憶體；需要為 Windows、Electron、OBS 與解碼 buffer 留出空間。沒有指定 GPU 型號、功耗、模型、音訊與 batch 時，不應給出固定每首秒數。

| 配置級別           | 候選環境                      | 可行流程                                                                     | 可期待的成果與限制                                                         |
| ------------------ | ----------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 最輕量             | 約 8 GB RAM、無新增模型       | 匯入來源 T2、既有 T1、人工 tap／nudge                                        | 正確來源 T2 仍可很好；只有 T1 時仍是估算，沒有新增聲學精度                 |
| CPU 基線           | 現代 4–8 核心、16 GB RAM、SSD | 已知歌詞、短窗 CTC／SOFA 候選，單工；ASR 僅在需要時跑 small INT8             | 能做真正對齊；等待可能較長，困難片段需修正，不必退回均分                   |
| CPU 品質           | 8 核心以上、32 GB RAM         | 較大 aligner、原曲／人聲比較、少量局部重跑                                   | 可用與 GPU 相同的模型追求相近品質；時間與記憶體比互動性更受限制            |
| AMD／Intel 或 iGPU | 16–32 GB RAM、受支援 GPU      | 現有 DirectML 分離＋CPU aligner；另研究 ONNX 或 whisper.cpp Vulkan／OpenVINO | 分離加速已是現有能力；新 aligner GPU 加速不能直接繼承，先以 CPU 可用為基線 |
| 入門 CUDA          | 16–32 GB RAM、4–6 GB VRAM     | 短窗、batch 1、ASR／aligner／分離依序載入；適用時使用量化                    | 有機會大幅縮短等待；特定模型能否容納仍需量測，不承諾模型全常駐             |
| 主流 CUDA          | 32 GB RAM、8–12 GB VRAM       | 較大 ASR、獨立對齊器、較好分離候選與低信心重跑                               | 最適合完整歌曲準備與人工互動比較；仍需處理日文映射與重疊人聲               |
| 高階 CUDA          | 32–64 GB RAM、16–24 GB VRAM   | 多候選、歌唱專用模型、F0 輔助、更多批次；依 gate 研究 fine-tune              | 提升覆蓋率與吞吐的空間較大，不能保證全曲免修或每字 20 ms                   |
| 遠端 GPU／雲端     | 本機可只做解碼與編輯          | 上傳明確選定音訊，遠端對齊後回傳候選                                         | 可讓輕量電腦用較重模型；增加傳輸、費用、版本與資料處理依賴                 |

同一模型、同一輸入、相同精度與切窗策略下，CPU 與 GPU 應以近似相同品質為目標；需要實測數值差異。真正提高成果的通常是歌詞正確性、模型與語言匹配、較好的輸入、重跑和人工修正，而非 VRAM 容量本身。

### 可引用的速度與容量證據

[faster-whisper 上游 benchmark](https://github.com/SYSTRAN/faster-whisper#benchmark) 以 13 分鐘音訊測 ASR：i7-12700K／8 threads 的 small INT8 為 1 分 42 秒、RAM 1477 MB；RTX 3070 Ti 8 GB 的 large-v2 FP16 為 1 分 03 秒、VRAM 4525 MB。後者 batch 8 為 17 秒、6090 MB。這些是上游特定版本與輸入的 ASR 結果，沒有包含分離、歌唱對齊、下載、冷啟動或 OBS 競爭，不能等比例當成 Utawakui 的每首耗時。

本專案既有 [Beat This! CPU spike](audio-python-beat-this-m1-spike-2026-08-24.md) 的真實歌曲單次 small0 測量約 5.15–12.55 秒、peak working set 約 452–500 MB。它只證明既有節拍分析的執行成本，不代表字詞對齊的效能或準確率。

Qwen 原生模型卡約 0.9B 參數，單純按每參數 2／4 bytes 算，權重約為 1.8／3.6 GB 十進位容量。這只是權重下限，另有 activation、音訊、attention、runtime、載入暫存；不能據此宣稱 2 GB VRAM 可跑完整流程。4 分鐘的現有 44.1 kHz 四聲道 16-bit PCM 約 84.7 MB，解碼與模型特徵也會另占空間。

### Windows 部署成本

[CTranslate2 的預建 GPU backend](https://opennmt.net/CTranslate2/hardware_support.html) 以 NVIDIA 為支援路徑；不能把 AMD 的 DirectML 分離成功視為 faster-whisper GPU 成功。[whisper.cpp](https://github.com/ggml-org/whisper.cpp#vulkan-gpu-support) 提供跨廠牌 Vulkan 的研究替代路徑，但其 ASR 加速不會自動替其他 aligner 加速。

現有分析 lock 是 CPython 3.14.7／PyTorch 2.11.0 CPU。Qwen 官方提供的 Python 3.12 環境示例、SOFA 的舊 Python 指南及各語言模型依賴，均須重新解析 wheel graph、驗證相容性，不直接混裝到該 lock。CPU 與 CUDA 最好分別準備與探測；精度格式也應按裝置能力選擇，不能將 CUDA 的 BF16 範例原封套到所有 CPU／GPU。

[vLLM 官方安裝文件](https://docs.vllm.ai/en/stable/getting_started/installation/gpu/) 說明不原生支援 Windows。第一個本機候選應測 Transformers／CTC 或明確可封裝的 runner；不為了一個歌曲準備功能先要求使用者安裝 WSL 或 Linux server。

## 7 精度證據與可設定的產品門檻

不同論文的 mean、median、word onset、phone onset、起訖總誤差不是同一個指標，以下不能排成跨資料集的總排名。

| 證據                                                                                                                                | 結果                                                                                         | 能支持與不能支持的結論                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [ICASSP 2023 多語對齊](https://arxiv.org/abs/2306.07744)                                                                            | 標準 Jamendo 的平均絕對誤差低於 0.2 秒                                                       | 說明歌唱專用方法有實用價值；不是中日韓逐字的保證                                                  |
| [Qwen3 技術報告 Table 9](https://arxiv.org/html/2601.21337v1#S4.SS6)                                                                | Human-Labeled Raw 的 AAS 為 27.8 ms                                                          | 指標與語音資料均不同；不代表歌曲字首 median、P95 或原生 20 ms 解析度                              |
| [2026 作者發布的歌唱對齊 benchmark](https://github.com/gillosae/phoneme-conditional-singing-analysis/blob/main/benchmark/README.md) | NUS-48E 的 47 首、25,157 phones，blend onset median 22.8 ms、50 ms 內 74.6%、100 ms 內 90.5% | 展示乾淨歌唱及正確 phone 序列下的潛力；作者自行發布結果，非本機重現，也不能移植成商業混音全曲表現 |
| [ISMIR 2025 分離條件比較](https://ismir2025program.ismir.net/lbd_412.html)                                                          | 不同分離方法造成顯著效果差異                                                                 | 支持必須比較原曲與不同 vocals，不支持固定一種分離總是更好                                         |

22.8 ms 的 median 仍同時只有 74.6% 在 50 ms 內，說明「平均看起來很準」不足以保證整首字幕。產品更需要失敗區間、覆蓋率、尾端誤差及修正成本。

建議品質等級如下，數字是待實驗驗證的 release gate 草案，不是現有成果或特定硬體的預測。

| 等級          | 建議驗收條件                                                           | 適用情境                 |
| ------------- | ---------------------------------------------------------------------- | ------------------------ |
| 句級輔助      | 句首 90% 在 ±300 ms；錯段落須辨識並拒絕                                | 先找句位、人工校正       |
| 字詞草稿      | 有效覆蓋率至少 95%；字詞起點 90% 在 ±200 ms                            | 比均分實用，保留人工校正 |
| 一般 KTV 候選 | 有效覆蓋率至少 98%；字詞起點 90% 在 ±100 ms；大於 500 ms 的錯誤少於 1% | 自動預覽後檢查低信心區間 |
| 精修候選      | 除上述條件，另檢查 offset／拖音、每語言分項與 P95；經人工聽看驗收      | 錄製與精細動畫           |

字詞草稿與 KTV 的比例須以所有應對齊單位作分母，不能把失敗字刪掉後再計算好看的命中率。50 ms 命中率另外列出，先不把「全曲每字 50 ms」當成第一版承諾。

## 8 建議的最小實驗

### 語料與標註

先建立 48 首的目標語料：中、日、韓、英各 12 首，每首標註 90 秒代表區間，另保留整首作漂移測試。至少包含乾淨獨唱、密集伴奏、長拖音、Rap、合唱、混語、重複副歌與 Live／剪輯錯版；每種難例均可跨語言出現。目標至少 6,000 個可明確定義的字詞／音節單位。

按歌曲與歌手分開 development 12、validation 12、held-out test 24；同曲的 mixed、quick、general、live／studio 版本不跨 split。先鎖測試集再選模型與 threshold。

由兩位標註者對部分重疊區間獨立標註，量測分歧並裁決；無法明確定義的邊界保留 ambiguity flag。獨立記錄聲學 onset／offset 與 KTV 視覺偏好，不讓顯示提前量污染聲學 ground truth。

公開資料可補充 [GTSinger](https://github.com/AaronZ345/GTSinger) 的 word／phone 標註與 [目前維護的 JamendoLyrics](https://huggingface.co/datasets/jamendolyrics/jamendolyrics) 混音資料，但不能取代本產品的中日韓歌庫。[舊 Jamendo repository](https://github.com/f90/jamendolyrics) 已標示 deprecated，語料版本要釘選。資料取得、評估用途與重分發分別記錄條件，不將受限音訊打包進產品 fixtures。

### 原曲與人聲的消融比較

第一階段先固定正確文字、同一對齊器與同一裁切位置：

| 組別 | 輸入                            | 要回答的問題                           |
| ---- | ------------------------------- | -------------------------------------- |
| A    | 現有 T1 文字權重                | 自動對齊相對現況到底改善多少           |
| B    | 原始混音＋aligner               | 沒有人聲分離也能否達標                 |
| C    | quick vocals＋相同 aligner      | 已有快速分離能改善或破壞哪些字         |
| D    | general vocals＋相同 aligner    | 聽感較好的分離是否也改善邊界           |
| E    | 最佳 B／C／D＋原曲 beat 弱約束  | 節拍本身帶來多少增益與回歸             |
| F    | 最佳版本＋人聲 onset；必要時 F0 | 比拍點更直接的聲學 refinement 是否有效 |

只有 E 在獨立測試集穩定改善，才投入鼓軌方案：比較相同分離模型的 mixed／instrumental／drums beat 證據，再檢查 alignment 結果。增加 drum model 同時帶來的分離差異必須控制，不把不同模型或裁切造成的改善全歸給鼓點。

第二階段比較 WhisperX／語言 CTC、Qwen ForcedAligner 與語言條件足夠的 SOFA，使用第一階段確認的輸入政策。分開測已知完整文字、只有 T1、只有 T0 與完全無文字；ASR 字錯率與時間命中率各自報告。

第三階段才測模型組合與較重分離。保留各模型原始候選，不直接平均不同版本或不同演唱者的時間；先對同一文本單位建立對應，再檢查聲學支持與模型分歧。

### 必須報告的指標

- 字詞 onset 與 offset 的 median、mean、P90、P95，及 ±50／100／200 ms 命中率。
- 有效覆蓋率、失敗整句／整曲比例、錯配副歌、超過 500 ms 的災難錯誤。
- 零長、重疊、倒序、越過父句、文字遺失；補值比例與模型實測邊界分開。
- 低信心提示的 precision／recall，以及錯誤卻被高信心接受的比例。
- 每語言、每難例、mix／quick／general 分項，不只一個總平均。
- 無文字時的 WER／CER；已知歌詞時的內容保真與版本拒絕能力。
- Decode、separation、model load、alignment、refinement 各階段耗時；cold／warm 分開。
- RTF＝處理秒數／歌曲秒數、peak RSS、peak VRAM、磁碟與下載量、batch 與 thread 設定。
- 每首需人工修幾個位置、修正分鐘數，以及播放／OBS 並行是否受影響。

每個配置至少重複 3 次，報告中位數與範圍。CPU、DirectML、CUDA、精度格式、短窗長度與 overlap 分開記錄；不能拿不同模型的結果只標成 CPU 對 GPU。

## 9 接入現有架構需要的契約

這些是後續實作的必要設計項目，研究階段不變更現行 ADR 或 spec 狀態。

1. 增設獨立 lyrics-alignment capability，依既有 gate、generation、scheduler 與 cancellation 流程管理；不共用 Provider Python，也不偷偷啟用 Refined。
2. Main 只接受 track id、lyrics source identity 與有限產品 intent，自行解析檔案、模型與 runner。CPU baseline 與 GPU profile 分別 probe。
3. 分離檔案由 Main 提取 guide-vocal L/R。驗證時間零點、樣本長度、重取樣、裁切 offset 及 encoder delay，不能 trim 掉靜音卻忘記加回原曲時間。
4. 建立獨立候選／provenance 文件：audio hash、lyrics hash、normalizer、模型與 checkpoint hash、runtime profile、stem recipe／hash、切窗及實際採用的 beat identity。現行 T2 的 source fingerprint 不足以描述這些依賴。
5. 保存原文與模型文字／phone 到原文 span 的映射，包含標點、空白、簡繁、數字讀法與日文多對一。回傳時間不得直接覆蓋來源文字。
6. 保留模型原始分數、可觀察的分歧／coverage、校準後品質及 user-reviewed 狀態。不同模型的 confidence 不直接當同一機率，beat confidence 也不是字詞 confidence。
7. 使用者可預覽、逐句重跑、修正、接受或復原。已有人工修正與正確 T2 預設保護；採用以 source revision 做 stale check，避免長 job 覆蓋後來編輯。
8. Canonical T2 只收通過現行資料驗證的結果；未確認部分保留 T1／partial，不以均分補滿後宣稱完整逐字。
9. 現有手動 editor 要求相鄰片段連續；聲學輸出可能存在真實休止。接入時需定義 gap 的編輯與顯示政策，不能悄悄把前字拖到後字開始。現行 canonical 可容納非重疊 gap，但完整聲學休止操作尚非該 editor 的現有契約。
10. 現有 validator 允許相等起訖值；模型品質 gate 應把無法解釋的零長 lexical span 列為待修或拒絕，不能將 schema 合法等同可用。雙主唱同時不同歌詞則需要另行定義 lane，不能塞進單行不可重疊 segments。
11. 更換音訊、歌詞、模型或分離 profile 後，候選的失效與已接受人工結果的保護要分開。既有 reading 依 stable ids 保持；重切造成 id 改變時回報未保留的參照。
12. Renderer／HTML audio 仍是播放時間權威。Output 只消費已驗證 canonical 投影，不在 Browser Source 執行 ML，也不在播放途中反覆移動字詞邊界。

重分析宜在演出準備時進行，限制重型 job 併行，並為 OBS 留資源；若重型 CUDA runner 尚未通過直播並行測試，先提供明確的手動準備流程。

## 10 候選優先順序與產品階段

| 順位 | 工作                                               | 選擇理由與停止條件                                |
| ---- | -------------------------------------------------- | ------------------------------------------------- |
| 1    | 目標語料、標註、目前 T1 baseline                   | 先建立可以回答準不準的量尺                        |
| 2    | 已知歌詞＋CPU 可跑的對齊；比較原曲／quick／general | 最大化重用，先確認人聲分離是否值得                |
| 3    | 比較多語 Qwen 與語言 CTC／SOFA                     | 同時看整曲穩定度、邊界細度、語言與可封裝性        |
| 4    | 候選預覽、低信心定位、局部重跑、人工保護           | 將模型錯誤轉為可處理的少量修正                    |
| 5    | Beat 弱約束消融                                    | 未改善 held-out 品質就維持停用，不增加 drums 成本 |
| 6    | CUDA 品質包、F0／較重分離、必要的歌唱微調          | 只為仍有明確瓶頸的難例投入                        |
| 7    | 自願雲端對照                                       | 有明確需求才加入上傳與服務依賴                    |

第一個產品 slice 建議限定「已有歌詞、單一主唱、產生可修正草稿」，優先把 T1 升成可靠 T2。由零聽寫整首、多主唱同時對齊、所有日文漢字獨立邊界可分後續能力，不應綁在同一個功能承諾。

暫不根據本輪選定單一勝出模型。優先研究 Qwen 是因多語覆蓋與較清楚的權重條件；保留 SOFA／CTC 是因歌唱適配與較細邊界的可能性。最後應由目標語料及 Windows 封裝結果決定。

## 11 已完成驗證與仍待量測的項目

本輪重新執行現有 lyricsTiming sidecar、timing editor、timing units、split helpers 與 recipes 測試，共 5 files／41 tests 通過。第一次執行因 sandbox Temp 的原子 rename 遭 EPERM；把測試 Temp 放進 workspace 後同組全數通過，未修改 production 或 tests。

本輪沒有新增模型推論、GPU 效能或人工音訊標註結果。因此配置表、品質 gates、節拍權重及模型優先順序都必須由第 8 節實驗落實。無法以現有 Beat This! 的快速執行證明新的對齊速度，也無法以 speech benchmark 證明歌曲精度。

當前機器的 CPU／RAM／GPU inventory 未取得：sandbox 中 CIM 查詢不可用。配置分級並未假設這台機器屬於其中哪一級。

## 12 依現有產品環境規劃漸進模型選配

補充日期：2026-10-18。容量統一使用十進位 MB／GB；1 GB＝1,000,000,000 bytes。以下不含已安裝的 Electron app、共用 FFmpeg、Provider 環境、歌曲與每曲分離結果，因它們不是新逐字模型包的增量。權重與套件中繼資料已查核，沒有下載權重、wheel 或啟動新推論。

### 已交付的兩種執行基礎

| 基礎         | 目前已有的內容                                                                                     | 已核對容量                                                               | 可重用範圍                                                                   |
| ------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| ONNX 分離    | App 內的 `onnxruntime-node`／DirectML、Main worker、FFmpeg decode                                  | quick KARA2 52.79 MB；general Inst HQ4 59.07 MB，兩者合計 111.86 MB 權重 | 可重用原曲與 guide vocals；能執行其他相容 ONNX graph，不代表已有對齊前後處理 |
| 選配節拍分析 | CPython 3.14.7、Torch 2.11.0 CPU、TorchAudio 2.11.0、NumPy 2.5.2 等 16 packages、Beat This! small0 | 完整下載 159,368,729 bytes；UI 安裝估計 557,000,000 bytes                | 是新增 Torch 對齊器最合理的環境基準，不必重新假設使用者要裝整套不同 Python   |

第二列的下載拆分：Python archive 12.67 MB、environment wheels 138.24 MB、small0 8.45 MB。557 MB 是現行程式的安裝估計，不是本輪重新安裝量測。來源為 [固定 capability catalog](../../electron/lib/audioProcessing/structureAnalysisCapability.js)、[runtime manifest](../../resources/audio-processing/audio-python-runtime-3.14.7.json)、[environment lock](../../resources/audio-processing/analysis-beat-this-py314-lock.json) 與模型 manifests。

`final0` 的 manifest 是 81.06 MB。若保留 small0 再加 final0，新增是 81.06 MB；若完成切換並移除 small0，淨增是 72.61 MB。現行 Settings 的安裝 catalog 固定 small0，不能因 final0 manifest 存在就宣稱使用者已能選它。它只改善節拍分析的候選能力，不新增歌詞對齊能力。

### 能共用環境不代表目前已會去重

[ADR 0014](../adr/0014-audio-python-runtime-family.md) 容許 runtime family、聯合環境與模型分離管理。但 [目前 installer](../../electron/lib/audioProcessing/audioPythonArtifactPreparation.js) 為每個 lock 將所有 wheels 解到獨立 site-packages，沒有跨 lock 的 package hardlink 或 wheel artifact cache。因此：

- 相同 exact Python runtime artifact 可以由 Audio Python capabilities 共用；Provider Python 仍是不同 family。
- 新增獨立 alignment environment 時，Torch／NumPy 等會有另一份磁碟副本，下載也不能直接扣掉已安裝 packages。
- 若建立經完整解析及驗證的「節拍＋對齊」聯合 lock，兩個 capability 可映到同一環境，切換及回收後才消除磁碟重複；準備新 lock 時仍會重下載其完整 package graph。
- 現行 `combined-ml` 與 capability／model role 白名單尚未定義 lyrics alignment 和 tokenizer 檔案。這仍需契約及 worker 擴充，不能直接只新增模型 JSON 就啟用。

現有 557 MB 可作一份 CPU stack 的粗略參照，但不應把它全部當成 Torch：其中也包括 Python、其他 packages 和 small0。精確去重須由新 lock 的實際安裝結果計算。

### 優先可研究的模型選項與檔案增量

以下採單一推論格式及必要的 config／tokenizer 檔，不下載同一模型的 PyTorch、Flax、TensorFlow 重複格式，也不下載 optimizer／訓練狀態。每個候選仍待完整 lock、離線 import、實際推論與封裝驗證，並非現行可用功能。

| 模型選項                    | 所需檔案量       | 相對現有環境的需要                                                  | 產品取捨                                               |
| --------------------------- | ---------------- | ------------------------------------------------------------------- | ------------------------------------------------------ |
| 英文 CTC base               | 377.61 MB        | CPU Torch 可作候選基礎，新增 Transformers 等依賴與 alignment worker | 較小的單語入口，但不解決中日韓                         |
| 中文 XLSR CTC               | 1,276.34 MB      | 相同 CPU 家族，需對齊實作與完整新 lock                              | 可按語言選配                                           |
| 日文 XLSR CTC               | 1,271.56 MB      | 同上，另驗證日文文字與讀音策略                                      | 不因已有 kuromoji 就等於已完成音訊對齊                 |
| 韓文 XLSR CTC               | 1,266.77 MB      | 同上                                                                | 四語各裝一個模型的成本會累積                           |
| Qwen3 ForcedAligner 0.6B hf | 1,847.23 MB      | Transformers 原生 runner、tokenizer、日韓前處理與完整新 lock        | 一套聲學權重涵蓋 11 語，較符合多語產品的共用方向       |
| Qwen3 ASR 0.6B hf           | 額外 1,576.36 MB | 可研究與 aligner 共用同一 CPU package graph                         | 沒有歌詞時才需要；不應綁在「已有歌詞的自動對齊」下載中 |
| Qwen3 ASR 1.7B hf           | 額外 4,087.63 MB | 相同家族的較大權重，重新驗證載入及執行條件                          | 作較高級聽寫候選，不能當成更精細時間解析度升級         |

模型來源：[英文 base](https://huggingface.co/facebook/wav2vec2-base-960h/tree/main)、[中文](https://huggingface.co/jonatasgrosman/wav2vec2-large-xlsr-53-chinese-zh-cn/tree/main)、[日文](https://huggingface.co/jonatasgrosman/wav2vec2-large-xlsr-53-japanese/tree/main)、[韓文](https://huggingface.co/kresnik/wav2vec2-large-xlsr-korean/tree/main)、[Qwen aligner](https://huggingface.co/Qwen/Qwen3-ForcedAligner-0.6B-hf/tree/main)、[小型 ASR](https://huggingface.co/Qwen/Qwen3-ASR-0.6B-hf/tree/main)、[大型 ASR](https://huggingface.co/Qwen/Qwen3-ASR-1.7B-hf/tree/main)。CTC 語言選擇對照 [WhisperX 當前 default mapping](https://raw.githubusercontent.com/m-bain/whisperX/main/whisperx/alignment.py)。大小按上游 API 的 file size 加總，版本 SHA 保存於本輪 scratch metadata。

中日韓英四套 CTC 的上述檔案合計 4.192 GB；Qwen aligner 為 1.847 GB，少約 2.345 GB。這只比較磁碟／下載成本，不能據此宣稱 Qwen 的歌唱邊界品質較好。若只服務英文或單一中文，按語言安裝 CTC 仍可能較省。

### 現有 Python 3.14 的候選相容性

本輪查到的 Transformers 5.20.1 為 pure Python wheel；tokenizers 0.23.3、safetensors 0.8.0 有 Windows ABI3 wheel，可作 CPython 3.14 候選。[Transformers 原生 Qwen processor](https://raw.githubusercontent.com/huggingface/transformers/main/src/transformers/models/qwen3_asr/processing_qwen3_asr.py) 的日文分詞需要 nagisa，韓文需要 soynlp，不能只列一個 Transformers wheel 當完整多語環境。

目前 [nagisa 0.3.0](https://pypi.org/project/nagisa/0.3.0/) 與 [DyNet38 2.2](https://pypi.org/project/dyNET38/2.2/) 已有 CPython 3.14 Windows wheel，分別約 21.78 MB 與 1.34 MB。soynlp 本身約 0.42 MB，但其 SciPy／scikit-learn 依賴也要計入；本輪查到相應 cp314 wheels 約 37.36 MB／8.38 MB。這表示沒有足夠理由先要求另裝 Python 3.12；但 wheel 存在仍不是完整解析或 import 通過，NumPy 2.5、DLL 與 offline policy 都要實測。

建議研究原生 Transformers runner，先不帶完整 WhisperX／pyannote／diarization 或 vLLM。已有歌詞不需要 ASR；音訊用 app-owned FFmpeg 產生固定 ndarray，也可減少讓通用框架再負責媒體解碼的依賴。不確定能否排除的 audio frontend packages 必須留在完整 lock，不能為了省容量漏掉必要依賴。

### 整體容量的規劃試算

完整 alignment environment 尚未解析，以下為清楚標示假設的產品容量預算：

- 基線 B：既有節拍 CPU pack 安裝估計 0.557 GB。
- 新增 CPU packages 的解壓後預算 E：0.2–0.6 GB；候選 wheel 下載預算 0.1–0.2 GB。這是規劃範圍，並非量測值或完整 resolver 加總。
- A：aligner 檔案 1.847 GB；S：小型 ASR 1.576 GB；L：大型 ASR 4.088 GB。
- 假設使用已驗證的聯合 CPU lock，完成切換並回收舊環境；保留 Beat This! small0。沒有假設 tokenizer 或模型 tensor 的跨模型去重。

| 漸進能力          | 安裝後包含哪些內容                 | 安裝總量預算  | 相對目前已裝 B 的淨增量 |
| ----------------- | ---------------------------------- | ------------- | ----------------------- |
| 既有節拍分析      | B                                  | 0.557 GB      | 0                       |
| 多語歌詞自動對齊  | B＋E＋A                            | 約 2.6–3.0 GB | 約 2.0–2.4 GB           |
| 再加小型自動聽寫  | B＋E＋A＋S                         | 約 4.2–4.6 GB | 約 3.6–4.0 GB           |
| 改用大型自動聽寫  | B＋E＋A＋L，移除 S                 | 約 6.7–7.1 GB | 約 6.1–6.5 GB           |
| 小大型 ASR 都保留 | B＋E＋A＋S＋L                      | 約 8.3–8.7 GB | 約 7.7–8.1 GB           |
| 四語 CTC 作替代   | B＋E＋四語 CTC；E 暫沿同一預算口徑 | 約 4.9–5.4 GB | 約 4.4–4.8 GB           |

表中總量不代表啟動 app 時全部載入 RAM。四語 CTC 的實際 E 可能不同，表格只是用相同預算比較權重選擇。若保留舊節拍環境、另外建獨立 CPU environment，需再加上重複的 CPU packages；不能沿用「聯合 lock 已回收」總量。首次切換時，舊環境和 staging 同時存在，也會高於最終安裝總量。

按現行安裝器從已裝節拍包升級，需新下載完整 environment wheels，約 0.138 GB＋0.1–0.2 GB 預算，再加 A＝約 2.09–2.19 GB。從空白安裝完整節拍＋對齊包約 2.11–2.21 GB。這兩個數字仍取決於 E 的假設，不能作最終 UI 精確 bytes。

之後若 ASR 和 aligner 確實共用相同 lock，新增小型 ASR 的主要下載及安裝增量就是 1.576 GB，大型則為 4.088 GB。從 S 換 L 時須下載完整 L，成功切換並移除 S 後的模型磁碟淨增才是 2.511 GB；不可把淨增當成下載量。

### SOFA 和 ONNX 輕量路徑的實際限制

SOFA 有機會提供較小的歌唱專用選配，但不能算成「現有 ONNX＋下載 checkpoint 即可」。[現行上游 requirements](https://raw.githubusercontent.com/qiuqiao/SOFA/main/requirements.txt) 包含 NumPy 約 1.24、einops 0.6.1、舊 librosa／pandas／matplotlib，與本專案 Python 3.14／NumPy 2.5.2／einops 0.8.2 不能原樣共用。

它的 [ONNX 推論入口](https://github.com/qiuqiao/SOFA/blob/main/onnx_infer.py) 仍匯入 TorchAudio、Numba、G2P 和後處理。若要做到不增加 Python，必須把對應前後處理及解碼能力接到目前 Node worker，並驗證 ONNX graph；那是另一個實作方案。

本輪只讀 release metadata 得到 [英文 tgm_en_v100 checkpoint](https://github.com/spicytigermeat/SOFA-Models/releases/tag/v1.0.0_en) 約 406.08 MB、[日文 akm_ja_v001 ZIP](https://github.com/ariikamusic/SOFA_Models/releases/tag/akm_ja_v001) 約 377.87 MB。ZIP、訓練 checkpoint 與 inference ONNX 的大小不是同一口徑；尚不能提供可承諾的完整 SOFA pack 容量。先通過相容性、權重條件及匯出品質，再決定是否值得作更輕量的語言選配。

### GPU 加速是獨立環境增量

目前 DirectML 能加速的是現有 ONNX 分離；Torch 2.11.0 CPU wheel 不能因機器有 GPU 就執行 CUDA 對齊。GPU pack 應獨立準備、探測及允許移除，模型檔案則可在能力驗證通過後共用。

只對 [官方 cu128 index](https://download.pytorch.org/whl/cu128/torch/) 與 [cu130 index](https://download.pytorch.org/whl/cu130/torch/) 所列 2.11.0／cp314／Windows x64 wheel 發 HEAD，中繼資料回報：

| Torch wheel | 單一檔案下載大小 | 相對既有 CPU Torch wheel 的差額 |
| ----------- | ---------------- | ------------------------------- |
| 現有 CPU    | 114.55 MB        | 基線                            |
| CUDA 12.8   | 2,770.97 MB      | 約多 2,656.42 MB                |
| CUDA 13.0   | 1,922.37 MB      | 約多 1,807.81 MB                |

CUDA 表格還不是完整環境：需核對 TorchAudio、其他 DLL／package、driver 相容性與解壓後容量，也不能因 cu130 較小就直接選它。以保留 CPU baseline 的獨立 GPU pack 計算，增加的是完整 GPU 環境，不是上表替換 CPU wheel 的差額。GPU 解壓後磁碟、執行 peak 尚未量測，不填造一個完整總量。

### 載入與安裝峰值必須獨立計算

磁碟上保留多個模型，不要求播放或 app 啟動時一起載入。建議按 job 依序載入分離、ASR、aligner，完成後卸載／結束 worker；heavy-job scheduler 可重用，但跨進程釋放與取消仍需驗證。

| 模型          | 目前權重檔案    | 若轉成 FP32 的粗略權重容量 | 尚未包含                                                      |
| ------------- | --------------- | -------------------------- | ------------------------------------------------------------- |
| Qwen aligner  | 約 1.84 GB BF16 | 約 3.67 GB                 | Activations、audio features、Torch、日韓 tokenizer 與載入暫存 |
| 小型 Qwen ASR | 約 1.56 GB BF16 | 約 3.13 GB                 | 同上，另有解碼狀態                                            |
| 大型 Qwen ASR | 約 4.08 GB BF16 | 約 8.15 GB                 | 同上                                                          |

CPU 實際採 FP32／BF16 要按 operator 及裝置驗證。這些只是 tensor 容量下限，不能作整機 RAM 最低需求；順序執行時模型部分看最大同時存活集合，不把磁碟上的 A＋S＋L 全部相加當成必要 RAM。

更早需要處理的是安裝器：[downloadBuffer](../../electron/lib/featureDependencies/download.js) 先累積 chunks，最後 `Buffer.concat`，model preparation 再驗 hash 與原子寫入。1.84 GB 權重在 concat 瞬間可能同時保有 chunks 和整塊 buffer，光資料就約 3.67 GB；4.08 GB 權重可達約 8.15 GB，還未含 app 與其他配置。這是依目前程式推導的配置量，不是 RSS 實測。推出 GB 級模型／CUDA pack 前，應先改成受限串流下載、增量 hash 與磁碟 staging，否則「磁碟裝得下」仍可能在安裝期間耗盡 RAM。

模型更新時保留舊檔和 staging，因此更新一個 1.85 GB 模型需額外容納新版本約 1.85 GB；若另留下載 cache 還要再算。不可一律宣稱更新只需要最終淨增空間。

### 建議的漸進提供順序

1. 沿用現有 ONNX 分離與 Beat This! CPU pack；先研究可共用 Python 3.14／Torch CPU 的聯合 lock。
2. 第一個新能力提供「已有歌詞的多語自動對齊」：只裝 aligner，約 1.85 GB 模型資料，加必要 package 增量。Qwen 與 CTC 的品質比較仍以第 8 節為準。
3. 使用者需要從零聽寫才增加小型 ASR，額外約 1.58 GB；較大型約 4.09 GB 作獨立品質選配。
4. NVIDIA 加速再提供完整 CUDA pack；CPU 能力與模型結果保留。不要為了對齊或節拍先強制下載數 GB CUDA。
5. SOFA／ONNX 作輕量歌唱專用路徑研究，通過相容及權重條件後才給固定容量與產品選項。

產品顯示仍以能力／品質意圖為主，環境與原始模型身份放詳細資訊。第一個關鍵不是提供更多同級模型，而是讓「只對齊」「需要聽寫」「需要 GPU」各自只下載它真正需要的環境與權重。
