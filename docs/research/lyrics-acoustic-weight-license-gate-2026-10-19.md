# 歌詞聲學模型：權重使用與分發 gate

本文保留當輪研究與分母；目前跨批次選型及未決項集中在[研究結論](lyrics-alignment-summary.md)。

日期：2026-10-19。接續[手動環境生命週期](lyrics-acoustic-lifecycle-2026-10-19.md)，本輪核對上游原始授權、release、模型卡與檔案 metadata，評估 HubertFA 能否成為手動選配及可替代方案。沒有下載模型、安裝候選環境、聯絡上游或改動正式 gate。固定 revision、大小、來源 SHA 與查核範圍見[證據紀錄](data/lyrics-acoustic-weight-license-gate-2026-10-19.json)。

## 判定

HubertFA v0.0.7 暫不列為正式手動選配。維持 `productUse: blocked`／`weights-evidence-pending`，不加入預設下載。這是目前產品所需權重證據不足的判定，不是認定上游禁止使用或侵權。

其程式庫有 Apache-2.0，官方也發布模型資產，兩者都是正面證據；但本輪查到的 release 說明、模型 archive 與分享說明，仍未明確將使用／再分發條款綁到我們採用的 checkpoint。將下載改成手動，或讓使用者直接從上游取得，不能補足這個缺口。根據目前證據，不宜由產品宣告它可供一般或營利演唱工作流使用。

建議保留 HubertFA 為既有研究對照，先評估兩條授權證據較清楚的替代路線：Qwen3 ForcedAligner 適合既有文字的強制對齊；Whisper.cpp 適合作為較小、可避開 Python 大環境的對照。MFA 中日模型為額外傳統對照。這些候選的公開授權足以繼續規劃研究，但本輪沒有正式採用、宣稱最佳精度或通過所有發行條件。

本文是針對可取得文件的產品採用判讀；不等於完整法律意見，也不把模型授權當作歌曲、歌詞或公開播出的權利來源。

## 證據層級與操作差異

證據需分成五層：程式庫、確切權重、基底／轉換來源、字典與 tokenizer 等附帶資產，以及最終執行環境。程式碼上的授權不能直接代替不在同一授權聲明範圍內的權重；同樣地，不能因訓練資料某項條款，就不經判讀地將它轉寫成最終權重的授權。模型發布者對 checkpoint 的明確聲明是重要證據，仍不保證所有第三方權利都已被全面查清。

| 操作                               | 對 HubertFA v0.0.7 的目前判定 | 尚需的證據                                                            |
| ---------------------------------- | ----------------------------- | --------------------------------------------------------------------- |
| 在 Utawakui 正式選項中進行本機推論 | 不開放                        | 確切權重可供預定使用情境的授權，涵蓋是否可用於營利／商業工作流。      |
| 使用者按準備，直接向官方下載       | 不開放                        | 即使我們不代管 bytes，仍需使用與產品整合依據；下載管道不是授權。      |
| 我們維護下載鏡像或重新打包環境     | 不開放                        | 明確重製／再分發、附帶字典及必要 notices。                            |
| 與 installer 或離線選配包一起交付  | 不開放                        | 同上，並完成完整 payload／license inventory；本輪也沒有預設下載決策。 |
| 轉成其他 ONNX、量化或微調後交付    | 不開放                        | 修改／衍生與再分發條款、基底來源、轉換配方與雙端檔案身分。            |

公開可下載、GitHub 有 release、使用者勾選同意或軟體本身免費，都不是這幾項證據的替代品。尚未確認商用範圍時，不把「手動選配」包裝成通用使用許可。沒有新增讓使用者自行選 arbitrary model／URL 的繞過入口。

## HubertFA 的確切查核

固定對象是 [v0.0.7 release](https://github.com/wolfgitpr/HubertFA/releases/tag/v0.0.7)、程式 revision `521281fe52dcedb8f970ca200dc4f00fc2869b08`，不是其他人訓練的 HubertFA checkpoint。

| 項目            | 查核結果                                                                                                                                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 官方資產        | `1218_hfa_model_new_dict.zip`，asset id `334436583`，256,589,553 bytes。                                                                                                                                        |
| archive SHA-256 | `48bd6dbcc293e47cc6cbcc556baf575e3d91d61d0ac88ddeccd6098f8f346fa2`；既有本機檔案與目前官方 release digest 一致。                                                                                                |
| 核心權重        | `model.onnx`，415,220,874 bytes，SHA-256 `4722c13e1d5c1d740ec69c9121f5ec37a88d534aba7637bafb480208be170183`。                                                                                                   |
| 程式授權        | [該 revision 的 LICENSE](https://github.com/wolfgitpr/HubertFA/blob/521281fe52dcedb8f970ca200dc4f00fc2869b08/LICENSE) 為 Apache-2.0；最新 main `b3f086966946255a05b0ccb69c865c8e3e806e0a` 的 LICENSE 與之相同。 |
| release 內容    | 指定字典、歌唱用途與資料貢獻者，沒有找到對這份權重明訂使用／修改／商用／再分發的條款。用途說明與貢獻者名單不當作授權書。                                                                                        |
| archive 內容    | 實際 7 個檔案：config、3 份字典、ONNX、VERSION、vocab；沒有 LICENSE、NOTICE 或模型卡。產品 materializer 只保留目前釘選的 6 檔，未採用英文字典，但中日字典的授權／來源仍需一起確認。                             |
| 分享說明        | [Discussion #2](https://github.com/wolfgitpr/HubertFA/discussions/2) 要求版本、語言、字典與用法等 metadata；本輪未找到補足權重授權的聲明。                                                                      |
| 其他公開查核    | 讀取目前 README、全部可取得的 13 項 issue／PR 列表及限定 repository 的授權關鍵字搜尋；未找到補充。這不是「全網不存在授權」的斷言。                                                                              |

基底線索：固定版 [force_alignment config](https://github.com/wolfgitpr/HubertFA/blob/521281fe52dcedb8f970ca200dc4f00fc2869b08/configs/force_alignment.yaml) 指向 `dependencies/chinese-hubert-base`，README 也列入 Chinese HuBERT 參考。[Tencent 官方模型庫](https://huggingface.co/TencentGameMate/chinese-hubert-base) 在 revision `fce0375452b1dd6c080ac3248d423d4d037bc831` 標示 MIT。這降低了某一可能基底的疑慮，但 release 沒有提供足以將 checkpoint 綁到該基底 revision／轉換流程的完整 provenance；基底的 MIT 也不會自行授權後續訓練成果與字典。

因此，把根目錄 Apache-2.0 一律解讀為 release 權重必然已授權，或反過來認定它必然只授權 code，都比目前證據走得更遠。本產品的採用條件選擇要求明確、可留存且綁定 artifact 的聲明。既有私有研究執行紀錄只代表技術測試，不因本文而取得新的研究／商用／分發許可。

## 可解除證據缺口的上游答覆

最有效的補充是由有權授權者，在官方 release／模型庫發布可追溯、適用於上述確切 archive 與 checkpoint 的條款。可以是明確將 Apache-2.0／MIT 等套用到權重與附帶檔案，也可以是範圍足夠的獨立書面授權；不需要硬性要求特定授權名稱。

至少釐清：本機推論與商業用途、使用者官方直下載、原樣再分發／鏡像／離線包、修改／量化／轉換／微調、字典與其他資產、需要保留的 notices，以及基底模型來源及其義務。對資料權利保留合理說明，但不要求公開受保護的訓練音訊。

以下是可供日後使用的詢問草稿；本輪沒有發送 issue、討論、郵件或任何對外訊息。

> 我們正在評估將 HubertFA v0.0.7 用於本機 Windows 歌詞對齊工具的手動選配。想確認 `1218_hfa_model_new_dict.zip`（SHA-256 `48bd6dbcc293e47cc6cbcc556baf575e3d91d61d0ac88ddeccd6098f8f346fa2`）中的 ONNX 權重、config、vocab 與字典，是否適用 repository 的 Apache-2.0，或另有權重授權？預定使用包含可能營利的演唱工作流。也希望分別確認使用者直接從官方下載、本工具原樣鏡像／離線交付、ONNX 轉換或量化後交付的許可與 notices。若不同檔案有不同條款，能否在 release 中列明，並提供基底 checkpoint／授權及衍生來源說明？我們會保留所需作者、授權及修改標示，不會宣稱對歌曲或歌詞本身有授權。

收到答覆後仍需檢查答覆者權限、檔案範圍、條款一致性及必要 notices，再由產品接受該特定版本；不直接將自由文字回覆變成程式自動開 gate。

## 替代模型與環境增量

以下 GB 採十進位。大小來自固定 revision 的官方檔案 metadata，除了既有 HubertFA archive 外，本輪沒有下載權重驗證內容；LFS SHA 是上游宣告值。檔案大小不是完整環境、峰值磁碟、RAM 或 GPU 成本。

| 方案                          | 權重授權證據                                                                                                                                                                                                                                                                                    | 已查到的檔案量                                                                                                                | 中日歌詞情境與本輪判定                                                                                                                                                               |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Qwen3 ForcedAligner 0.6B      | [Qwen 官方模型庫](https://huggingface.co/Qwen/Qwen3-ForcedAligner-0.6B/tree/c7cbfc2048c462b0d63a45797104fc9db3ad62b7) 的模型卡明列 Apache-2.0；官方執行程式也為 Apache-2.0。                                                                                                                    | `model.safetensors` 1,835,544,544 bytes；該 revision 全部 10 檔 1,840,072,459 bytes，約 1.840 GB。                            | 輸入既有文字直接對齊，明列中文、日文、韓文等 11 語言。功能最貼題，但獨立 aligner 的音訊類型標為 Speech；歌曲品質待測，不能沿用同系列 ASR 的 singing 宣稱。                           |
| Whisper + Whisper.cpp         | [OpenAI](https://github.com/openai/whisper/blob/86098128c0b4f24f0e2aa2994de830614b474227/README.md#license) 明確涵蓋 code 與 model weights 的 MIT；[GGML 轉換模型庫](https://huggingface.co/ggerganov/whisper.cpp/tree/5359861c739e955e79d9a303bcbc70fb988958b1) 與 native runtime 亦標示 MIT。 | 多語 base 147,951,465 bytes、small 487,601,967 bytes；q5_1 分別 59,707,625、190,085,487 bytes。每次選一個版本，不加總為必備。 | 小容量／Windows native 對照，可免新增 Python ML 環境。一般 CLI 是辨識後時間，不是保證逐一對齊指定原文的 API；詞時間仍有實驗性，需 teacher-forced／attention adapter 或嚴格文字配對。 |
| MFA Mandarin／Japanese v3.0.0 | [普通話模型](https://github.com/MontrealCorpusTools/mfa-models/releases/tag/acoustic-mandarin_mfa-v3.0.0)、[日文模型](https://github.com/MontrealCorpusTools/mfa-models/releases/tag/acoustic-japanese_mfa-v3.0.0) 明列 CC BY 4.0；tool 為 MIT。指定的中日字典也有獨立 CC BY 4.0。              | 兩個 acoustic archive 為 92,103,335 與 92,191,596 bytes；日文字典 21,264,022，中國／台灣字典分別 4,076,905／808,117 bytes。   | 可做給定原文的傳統對齊基線。模型較小，但完整 Kaldi／MFA 環境、tokenizer、相依授權及 Windows 實體落盤未封鎖／量測；低噪朗讀訓練不等於歌唱適用。                                       |
| XLSR-53 CTC 中文／日文微調    | 作者的[中文](https://huggingface.co/jonatasgrosman/wav2vec2-large-xlsr-53-chinese-zh-cn)、[日文](https://huggingface.co/jonatasgrosman/wav2vec2-large-xlsr-53-japanese) 模型庫與 [base](https://huggingface.co/facebook/wav2vec2-large-xlsr-53) 都標示 Apache-2.0，且有微調來源說明。           | 中文 `pytorch_model.bin` 1,276,296,151 bytes；日文 1,271,531,927 bytes，合計 2,547,828,078 bytes，另加 configs／vocab。       | CTC logits 可規劃接 trellis／Viterbi；未下載、轉 ONNX 或測歌。兩份不同 fine-tune 不能當一份共享權重，列為較後的技術備選。                                                            |

Qwen 的 code revision 為 `7c6daf77a2421100f5fb066495372c00129d39ff`。[官方 wrapper](https://github.com/QwenLM/Qwen3-ASR/blob/7c6daf77a2421100f5fb066495372c00129d39ff/qwen_asr/inference/qwen3_forced_aligner.py) 有獨立 `align(audio, text, language)`，不需要為已有歌詞再加下載另一份 ASR 模型；原始 span 與 occurrence 仍需由我們映射驗證。中文、日文、韓文的分詞路徑不同，不能單靠模型回傳字串覆寫 canonical 原文。

[qwen-asr 的 pyproject](https://github.com/QwenLM/Qwen3-ASR/blob/7c6daf77a2421100f5fb066495372c00129d39ff/pyproject.toml) 另有 transformers、accelerate、nagisa、soynlp 及 Web UI 等相依，實際程式也需 Torch。現有 CPython 3.14.7 + NumPy／pypinyin 環境不能直接視為已相容或可原地增補；官方建議獨立 Python 3.12 環境。下一步需鎖住最小執行閉包、檢查 Windows wheel／native 相依與附帶模型授權，再量測完整容量。不能由「0.6B」推算成僅需 1.2 GB，也不能把未測的 GPU 範例當成本機 CPU 保證。

Whisper.cpp 可另做固定 native worker，CPU 路徑不需 Torch／CUDA；但要計入 exe／DLL、版本／hash、MIT notices 及取消回收。若要對齊指定歌詞，需核對 [Whisper attention／DTW 實作](https://github.com/openai/whisper/blob/86098128c0b4f24f0e2aa2994de830614b474227/whisper/timing.py) 與 native adapter，而不是把提示文字當強制文字。量化只先作容量候選，不能假設保留詞界精度。

MFA 要各自選定字典：`mandarin_mfa` 是 acoustic id，v3 中國／台灣字典為 `mandarin_china_mfa`／`mandarin_taiwan_mfa`，並不是不存在的通用 v3 字典名稱。採用台灣字典時，兩 acoustic archives 加中日字典共 206,367,070 bytes；採中國字典則 209,635,858 bytes。這只是部分 payload，不能將約 0.206／0.210 GB 當完整可安裝環境。

MIT 要保留著作權與許可聲明；Apache-2.0 要依[條款](https://www.apache.org/licenses/LICENSE-2.0)提供授權、保留適用 notices，並標示修改等；CC BY 4.0 要依[條款](https://creativecommons.org/licenses/by/4.0/)提供署名、授權連結與修改說明等，且不能任意附加限制。以上只是本輪相關義務摘要，正式交付仍以完整條款及各檔案附帶 notices 為準。使用者按準備時也需要能看到適用資訊；不只在開發文件註記。

## 排除與保留項目

- [Torchaudio MMS_FA](https://docs.pytorch.org/audio/stable/generated/torchaudio.pipelines.MMS_FA.html) 官方明列 CC-BY-NC 4.0；即使函式庫是其他寬鬆授權，不能把權重當無非商用限制。通用產品選配暫不列入，除非另獲足夠授權。
- [Silasimo/HubertFA-GTSinger](https://huggingface.co/Silasimo/HubertFA-GTSinger) 明確為 CC-BY-NC-SA 4.0，且該卡標示 English；不作為本專案一般中日選配。這是另一 checkpoint 的條款，不回推到 wolfgitpr v0.0.7。
- [SOFA](https://github.com/qiuqiao/SOFA) 雖有 MIT 程式庫及歌唱對齊能力，仍需逐一選定分享 checkpoint／字典並確認條款，不能憑 code license 當作本輪已完成的明確權重替代。
- [WhisperX](https://github.com/m-bain/whisperX) 是對齊工作流程，不是一份統一權重授權；其採用的每語言 CTC／VAD／其他模型需各自核對。使用 Whisper 並不會讓所有附帶模型自動成為 MIT。

## 建議的後續順序與通過條件

1. 保留 HubertFA gate；若決定詢問上游，可使用上方草稿，待使用者另行授權才發送。
2. 以 Qwen3 ForcedAligner 做功能對題的短窗口研究，僅單獨 aligner；另以 Whisper.cpp 多語 base／small 做容量對照。若優先限制下載量，先測未量化 base，再用 small 與 q5_1 配對檢查容量／品質；不宣告哪個已最佳。
3. MFA 作低權重容量的傳統對照；CTC 大模型排在後面，避免在未有精度證據前下載兩份 GB 級權重。這輪只有授權與 metadata 評估，以上均尚未開始下載或推論。
4. 沿用凍結的中日歌曲與全部要求切點分母，保留原文、重複句 occurrence、T1 錨點與人工 T2 優先；比較原曲／vocal、錯歌／伴奏、靜音／低音量、缺字／OOV、快唱／長音。韓文是另列能力驗證，不能由語言清單推定精度。
5. 同時量測完整 lock 的下載／落盤／staging／修復峰值、CPU RAM／耗時、載入失敗／取消／移除與歌詞回退。GB 級方案只有在同分母效果與資源成本值得時，才規劃正式手動選配。

正式 release 至少要同時完成：確切 artifact 的使用與分發證據、依賴／附帶資產 notices、Windows 受管環境驗證、歌唱品質與錯內容政策、失敗取消回退及產品接受。授權有明文只是其中一項；手動選配通過也不自動等於加入 Basic 或預設下載。

目前 catalog、probe 與 model id 綁定 HubertFA，替代不是只改 URL。之後需要各自的固定 profile／probe／method identity，既有估計會依方法身分失效並回退。這輪不改這些實作，也不改 ADR 的已接受狀態。

## 驗證範圍

原始上游小型文字／API snapshot 留在 ignored 本機研究目錄；durable JSON 保存查核 URL、revision、取得時間、內容 SHA、狀態與模型檔 metadata。失敗的通用 Mandarin v3 字典查詢 404 也保留，再以官方連結找到 China／Taiwan 正確版本；不把 404 當成未授權的證明。

本輪只增加研究文件與 docs 索引，沒有更動 catalog、worker、loader、Settings 或預設下載。以先前 lifecycle 紀錄中的 catalog SHA 及核心 source hashes 比對，確認 gate 與實作未變；另執行 catalog／封裝資源 focused 回歸、Markdown、格式、相對連結與 diff 檢查。未重跑歌曲品質或全庫測試，不沿用前輪測試數字冒稱本輪完成。
