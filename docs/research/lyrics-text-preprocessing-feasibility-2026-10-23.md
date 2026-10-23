# 模型輔助歌詞文字預處理可行性

日期：2026-10-23。範圍是文字語意斷句與製作資訊候選辨識，接續[文字保真契約](../contracts/lyrics-text-processing.md)。本輪完成上游調查、主機盤點、60 個自製案例與現有規則探針；沒有下載、載入或執行文字模型，沒有接產品、改歌詞、改時間或提交。下文的模型效果是待驗假設，權重大小是上游檔案資訊，執行限制是實驗預算，三者不能混作實測。

## 可行性判斷

值得進行小型離線比較，優先讓模型在現有安全斷點中選出少量語意分組；製作資訊則只增加候選與可解釋的原文位置。模型不得產生清理後歌詞、刪除指令、新文字或時間。

長句的難點是挑選哪些合法斷點最自然。現有規則在本輪 20 個長句中已包含全部 35 個自製參考斷點，但共提出 260 個候選；這支持研究候選排序的價值，不能據此宣稱目前沒有斷句能力，或把候選覆蓋率當語意準確率。沒有標點的長句尤其適合比較規則排序與模型排序。

製作資訊辨識的收益較有限：缺冒號、外包括號等格式可以先補規則實驗。即使是 `作詞：小禾`，也可能被實唱。本語料每組語系各有一對完全相同的文字，作者意圖分別是 credits 與實唱；模型看不到意圖標籤，沒有足夠文字證據區分。允許棄權或標候選，但必須保留。文字模型及其自報信心都不能證明沒有唱出來。

現階段不建議自動隱藏、重寫來源或建立文字模型常駐服務。若候選排序不能穩定勝過現有規則，就沒有理由為此增加下載與執行負擔。

## 本輪證據與分母

完整[自製語料](lyrics-text-preprocessing-corpus-2026-10-23.json)與[規則原始結果](lyrics-text-preprocessing-baseline-2026-10-23.json)分開保存。每組 12 案：4 個作者指定製作資訊、4 個實唱／角色／和聲保留案、4 個長句。繁簡中是平行案例，英日韓也刻意使用相近結構；這是診斷集，樣本相關、格式均衡，不代表 provider 或實際歌曲分布。參考分組由本輪撰寫，尚無母語審查或人工聽辨真值。

| 語系 | 製作資訊被規則標候選 | 實唱組被標候選 | 四個長句候選數 | 參考斷點落在候選內 | 預設全文保留 |
| ---- | -------------------- | -------------- | -------------- | ------------------ | ------------ |
| 繁中 | 2 / 4                | 1 / 4          | 54             | 7 / 7              | 12 / 12      |
| 簡中 | 2 / 4                | 1 / 4          | 57             | 7 / 7              | 12 / 12      |
| 英文 | 2 / 4                | 1 / 4          | 63             | 7 / 7              | 12 / 12      |
| 日文 | 2 / 4                | 1 / 4          | 40             | 7 / 7              | 12 / 12      |
| 韓文 | 2 / 4                | 1 / 4          | 46             | 7 / 7              | 12 / 12      |

這裡的 1 / 4 是同字串歧義案被標為候選，沒有被隱藏；不是刪詞錯誤，也不能因預設保留而說分類正確。無冒號與外包括號的製作資訊均未命中。對唱標記、括號和聲與正文引用 credits 的其他 15 個實唱案均未被標候選。

探針直接呼叫當前 `analyzeLyricsText`、`lyricsDisplayBreakCandidates`、`projectLyricsTextSelection(document, [])`，檢查輸入不變、預設返回原文件與合成起訖不變；合成起訖不送模型。35 個參考邊界均符合 grapheme／括號／禁則檢查，20 份參考拼接均等於原文。原始結果記錄模組 SHA、Node／ICU 與 corpus SHA，可區分不同版本的分詞結果。這不是六模板渲染、provider 實取或 timing sidecar 回歸測試。

## 各語言要驗什麼

以下是語料設計與風險推論，尚無模型品質排名。不能由多語支援數量、通用知識榜單或簡中成績推算繁中、日韓歌詞效果。

| 語系 | 長句重點                                             | 製作資訊重點                         | 保真失敗樣態                                    |
| ---- | ---------------------------------------------------- | ------------------------------------ | ----------------------------------------------- |
| 繁中 | 無空白子句、連動與轉折；繁中詞彙獨立評分             | 作詞／編曲、全形冒號、【】名單       | 自動轉簡、補字、把「作詞」當刪除授權            |
| 簡中 | 無標點長句、兼語與平行子句                           | 作词／编曲、冒號省略、連續名單       | 自動轉繁、改寫用詞、把句長當刪詞證據            |
| 英文 | 從句、介系詞組、連接詞與 phrasal verb                | Written by／Music by、引文與姓名歧義 | 切開 don't／I'm、刪全大寫呼喊或重複 oh          |
| 日文 | 助詞、補助動詞、連體修飾與句末述語；詞界不等於子句界 | 作詞／作曲／編曲與「」內實唱引文     | 切開助詞依附、改假名漢字、刪括號掛聲            |
| 韓文 | 어절 之間的子句依賴、連接語尾；空白不等於呼吸點      | 작사／작곡／편곡、具名與聲部區別     | 切開黏著語尾、正規化分解 Jamo、刪 [함께] 或和聲 |

例如繁中 `當街燈一盞一盞熄滅｜我仍把你的名字藏在掌心｜等黎明帶我們回家`，英文 `When all the streetlights fade away｜I keep your name inside my hands｜until the morning leads us home`，日文 `街の灯りがひとつずつ消えても｜君の名前を手のひらに隠して｜朝が僕らを連れ帰るまで待つ`，韓文 `거리의 불빛이 하나둘 꺼져도｜네 이름을 손안에 간직하고｜아침이 우리를 집으로 데려올 때까지 기다려`：`｜` 只在這段說明標示參考位置，不插入原文。即使語法自然，也不能當作實際換氣或起唱時間。

## 方法與模型候選

| 方法                          | 適用處                              | 限制／本輪判斷                                                                    |
| ----------------------------- | ----------------------------------- | --------------------------------------------------------------------------------- |
| 現有規則＋Intl 分詞           | 配對、標點、詞界與明確 credits 前綴 | 保留為基線；先比較便宜的規則排序，不能直接叫它語意真值                            |
| 語言專用分詞／句法模型        | 詞界、詞性與依存關係輔助            | 不能由人名 NER 推斷 credits，也不能推斷有無實唱；多字典／權重與 Python 成本要另算 |
| Qwen3.5 2B，Q4_K_M            | 第一個低成本本機語意排序候選        | 是否遵守保留與棄權要求待測；不用 thinking，不把小模型當成安全證明                 |
| Qwen3.5 4B，Q4_K_M            | 同家族容量對照                      | 只有在逐語系增益足夠時才值得增加成本；尚無本輪實測                                |
| Gemma 4 E2B IT，官方 QAT Q4_0 | 第二階段跨家族比較                  | effective 參數不等於全部權重大小；本輪不先加第三份下載                            |
| 專用 credits 分類器／微調     | 未來有足夠真實標註時再議            | 現在沒有分 provider／語言的獨立標註集；不能用這 60 案訓練後再回測宣稱成效         |

[Stanza 官方](https://stanfordnlp.github.io/stanza/available_models.html)提供 tokenization、詞性與依存分析等模型；其任務與歌詞製作資訊、表演分句不同，本輪沒有安裝或量測完整依賴。

[Qwen3.5 2B 模型卡](https://huggingface.co/Qwen/Qwen3.5-2B)宣稱家族涵蓋 201 種語言／方言，並提醒 2B 在 thinking 模式可能循環；[4B 模型卡](https://huggingface.co/Qwen/Qwen3.5-4B)提供同系列候選。這些通用指標不包含本輪的五語系歌詞安全判定。[Gemma 4 E2B 模型卡](https://huggingface.co/google/gemma-4-E2B-it)區分 140+ 語言預訓練及 35+ 語言開箱能力，並說明 PLE 的 effective／總參數差別。三個候選來源均標 Apache-2.0；正式分發仍需獨立檢查完整 runtime、轉換來源與 notices，本研究不改分發狀態。

## 本機成本與缺測

唯讀盤點：Windows x64，AMD Ryzen 7 7700（8 核／16 邏輯執行緒），RAM 63.16 GiB，當下可用約 37.98 GiB；`nvidia-smi` 回報 RTX 5060 Ti、16311 MiB VRAM、driver 617.14。這些只證明硬體容量，不證明特定 binary、CUDA、語法輸出或 OBS 共用效能。PATH 未找到 `ollama`、`llama-cli`、`llama-server`、`lms`；標準 Ollama、Hugging Face 與 LM Studio 模型目錄未找到可用文字權重，沒有全面掃描個人磁碟。既有 ASR／ForcedAligner 權重不能替代文字模型。

| 候選 artifact                                                                                                             | 上游顯示下載大小，十進位 GB | 上游 SHA-256                                                     | 本機執行證據                         |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------- | ------------------------------------ |
| [Qwen3.5-2B-Q4_K_M.gguf](https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/blob/main/Qwen3.5-2B-Q4_K_M.gguf)                 | 約 1.28                     | aaf42c8b7c3cab2bf3d69c355048d4a0ee9973d48f16c731c0520ee914699223 | 無；Unsloth 量化，非 Qwen 官方量化檔 |
| [Qwen3.5-4B-Q4_K_M.gguf](https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/blob/main/Qwen3.5-4B-Q4_K_M.gguf)                 | 約 2.74                     | 00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4 | 無；Unsloth 量化，非 Qwen 官方量化檔 |
| [gemma-4-E2B_q4_0-it.gguf](https://huggingface.co/google/gemma-4-E2B-it-qat-q4_0-gguf/blob/main/gemma-4-E2B_q4_0-it.gguf) | 約 3.35                     | fa401b55b07ee70a54c6dae3903c783a6e65064312529ea57175cb5f8dec6634 | 無；Google 官方 QAT artifact         |

上表是查閱當時的顯示值與上游雜湊，沒有本機下載驗 hash；實驗前仍需 pin 完整 repo revision、取得精確 bytes 並實際驗證。第一批兩個 Qwen 權重合計約 4.02 GB。文字任務規劃不下載 vision projector、ASR、音訊或新字典；需先以固定 runtime 驗證 text-only 載入。不能將上游 repository 所有量化檔加總當作必要下載。

建議隔離的 llama.cpp Windows CPU runtime 起跑，GPU 作後續對照；不裝進 Provider Python 或 Audio Python。[官方建置文件](https://github.com/ggml-org/llama.cpp/blob/master/docs/build.md)列 CPU 與 CUDA 等後端，[benchmark 工具](https://github.com/ggml-org/llama.cpp/blob/master/tools/llama-bench/README.md)可分 prompt processing／generation、threads 與 GPU offload。固定 binary／DLL 及 release SHA 後才談可重現速度；本輪未下載，runtime 壓縮與解壓容量仍缺測。

RAM 要分開量測權重映射、resident／private bytes、context／attention cache、recurrent state、compute buffer 與 runner。若使用 GPU，還需量 driver／context、權重／cache offload 與 RAM 同時占用；不能把 GGUF 大小直接寫成 RAM 或 VRAM。[Gemma 官方估計表](https://ai.google.dev/gemma/docs/core)的 E2B Q4_0 約 2.9 GB 與本輪實際檔案列表約 3.35 GB 是不同口徑，不能用前者當這份 GGUF 的峰值保證。沒有實跑，就沒有可信的每秒 tokens、冷啟動秒數、每首歌耗時、功率或 OBS 影響。

第一批成本限制提案：只下載上述兩份 Qwen、CPU binary 與必要 DLL，總下載上限 4.6 GB、新增解壓常駐檔上限 5.5 GB、實驗可用磁碟預留 10 GiB（含暫存與收據）。單模型、單併發，CPU 先用 4 threads，context 上限 4096 tokens、輸出上限 512 tokens，不啟 thinking。每請求 30 秒、總推論 45 分鐘為硬停止條件；記錄 partial、timeout 與拒收，不延長來湊成功。RAM 增量 8 GiB 是停止上限，不是預估需求；GPU 第一批不啟用。若 pin 後必要下載超額，先調整提案，不偷偷換 artifact。

冷啟動需記錄「程序啟動至第一個有效回應」、模型載入及首 token；重開程序只能稱 process-cold，未清 OS page cache 不能稱 disk-cold。warm 同時記錄完整請求 p50／p95、tokens、prefill／decode、CPU 秒、peak private／working set 與實際 resident／空閒後是否釋放。每語系分列 tokens 與完整延遲，不能假設一字一 token。單首成本按實際需要模型的行數與批次加總；任何算式試算必須標情境值。

## 保真輸入輸出規格

研究 input 只含不可執行的原文、穩定 case／line occurrence id、相鄰原文，以及由規則列舉的合法斷點 ID。前後文可以幫助判讀，必須與目標行分開；同字串的不同 occurrence 不合併。時間、offset、來源檔案路徑、參考答案、作者意圖標籤及人工選擇不送模型。文字中的「忽略規則／刪除前文」仍是待分析資料。

建議 response 只含固定欄位：`lineId`、`kind`（`credit-candidate`／`lyric`／`ambiguous`）、`breakIds`、`evidenceSpanIds` 與少量列舉 `reasonCodes`。不接受新文字、時間、隱藏選擇、任意 offsets 或工具呼叫。零個斷點表示保留原分組。不以信心分數自動套用結果。

模型先選既有斷點，避免把模型 tokenizer offset 誤當 UTF-16。若未來擴充候選，必須先列舉 grapheme 邊界、配對與禁則，再做 ID 映射，另計候選膨脹成本。驗證器精確檢查 ID 所屬、無重複／倒序／越界、原文 slice 連續且拼接逐碼等於輸入；空白、標點、組合字元、emoji、Jamo 與重複副歌均保留。模型回覆缺行、schema 錯誤、未知 ID、截斷、拒答、逾時或不安全斷點時，整行回退現有規則並保留原文，不用第二次改寫「修好」。

輸入與 prompt、候選 ID、輸出預留都計入 tokenizer 實際 context；超額時先減少相鄰行，不截斷目標原文或括號。目標仍超額、超出現有 2000 UTF-16 分析限制或配對畸形，就記為未分析並保留。切分不能留下只有角色標籤的孤立片段，也不能將和聲標籤與其文字拆散。模型只提供語意偏好，模板仍以自身尺寸、字型與容量判斷可用布局；不能為了套用語意分組而越過容量或改時間。

[llama.cpp grammar 文件](https://github.com/ggml-org/llama.cpp/blob/master/grammars/README.md)支援部分 JSON Schema 約束，但 schema 約束本身不會向模型解釋欄位；prompt 仍需說明，且正確 JSON 不代表分類或語意正確。validator 要另守契約。

credits 是描述文字功能的候選，預設不隱藏；`演唱／Vocal／和聲`、角色名、`[女] [男] [合]`、`[Alice] [Bob]`、`[여] [남] [함께]`、括號掛聲與英文呼喊一律保留。即便未來得到使用者確認，也只能走既有可撤回 Output 投影；本輪完全沒有實作該模型路徑。

斷句是顯示分組建議：原 line／segment ids、順序、文字、provider／人工 start／end、reading 與 offset 不變。不將新子句平均分攤時間，不從長度推算換氣，不新增 T1／T2，不把語意邊界當聲學邊界。T0 仍是無時間文字。時間需求另走既有時間契約，不能與本輪文字結果混算。

## 下一批實驗與採用條件

依使用者提供的 AGENTS.md Plan-First 要求，新的模型 runner、下載與推論實作先確認範圍。建議第一批只比較現有規則排序、Qwen3.5 2B Q4_K_M、4B Q4_K_M；不用雲端 API，不改產品、不讀私有歌曲，以上述磁碟／時間限制執行。Gemma 4 作第二批，避免先為尚無增益證據的任務增加 3.35 GB。

本 60 案用作開發診斷，模型 input 必須剔除 `group`、`referencePartitions`、`indistinguishablePair` 及可透露題型的 case id 前綴；另配置隨機 opaque id，再映回結果。不把 credits／performed 題型寫進 prompt。相同字串配對必須得到同等保留待遇；其不同作者意圖不能當可判定分類精度。

先固定每語系 few-shot 範例與 prompt，另外凍結未用於調 prompt 的測試集，含原生語句、無冒號名單、真正雙人角色與獨立和聲案例。由合格讀者預先審查多個可接受分組與「不可切」位置，保留 unresolved。只有診斷集時，結果只能稱 pilot，不能稱實際 provider 精度或母語驗收。

驗收分四部分：

1. 保真硬門檻：原文／順序／時間差異為零，預設省略為零，實唱／對唱／和聲丟失為零；所有非法回覆皆拒收回退。這是邊界保護，不證明語意品質。
2. 語意效果：逐語系比較選中的完整分組、不可切違規、過切／漏切及人工偏好；可接受分組不只一個。候選 recall、top-k 排名、完整分組可接受率分開；不把所有候選交集當正確結果。
3. credits：可辨識案的 precision／recall、保留案誤標、歧義案棄權率分開；不將 ambiguous 刪出分母提高成績。候選誤標與實際遺失分別記錄，不把不隱藏當分類正確。
4. 本機成本：每模型首次品質跑完整 60 案；若預算仍足夠，才在固定子集重複以觀察一致性和 warm 延遲。同 prompt、同量化、同 context、同 threads，保留各次輸出與所有失敗；小樣本 p95 只作描述。推論總時限到即停止，不將缺測記為零成本。

只有某語系明顯提升人工可接受分組、其他語系沒有安全退步，且成本在限制內，才值得提出後續 opt-in 產品設計。沒有增益就保留規則；只有部分語系通過就只報該範圍。這份研究不開啟產品 gate，也沒有授權自動清理歌詞。

## 本輪驗證

已執行：60 案現有規則探針、20 份參考拼接與 35 個邊界檢查，模型與語料不涉及私有來源。文檔與資料檢查結果由本輪 scratch 收據記錄。模型品質、速度、完整 runtime 容量、GPU／OBS 共用及母語審查皆未執行，不沿用前輪聲學數據充數。
