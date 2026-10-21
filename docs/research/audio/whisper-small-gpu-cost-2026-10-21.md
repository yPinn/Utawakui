# Whisper small GPU：效果、容量與投入評估

日期：2026-10-21。成本評估已完成，使用者決定目前 CPU 足夠，GPU 採用與後續實測暫緩。沒有下載完整執行包、解壓安裝或新推論，產品與既有環境不變。數據見[公開 metadata](data/whisper-small-gpu-cost-2026-10-21.json)，現行方向見[歌詞研究結論](../lyrics-alignment/lyrics-alignment-summary.md)。

## 結論

不建議為 small 要求所有使用者安裝 CUDA Toolkit、PyTorch 或新 Python 環境。這不是執行預編譯 whisper.cpp 的必然條件；可攜 GPU 程式只需相容驅動及其執行期依賴。但目前官方 CUDA 包本身仍大，不能把「不用整套 Toolkit」等同低成本。

small 占既有四案 CPU 研究批次約 80%、HubertFA DirectML 批次約 87%，但使用者目前接受 CPU 耗時，因此不再推進 GPU 下載、自建 Vulkan、CUDA 實測或 context 重用。原先 Vulkan 優先、CUDA 選配的順序只是未採用候選，不是待執行計畫，也沒有實測速度或品質排名。

本階段維持 CPU，不要求一般使用者安裝 SDK 或 CUDA。以下保留固定版本的容量、相容性與假設情境，供未來有實際效能需求時重新決策，不將未知項當成已完成或永久否定候選。

## 固定版本與現況

沿用現裝 whisper.cpp `v1.9.2`，source commit `306c88f4d1286aec1bf96e544632897886af5501`，small 權重為既有 `ggml-small.bin`，487,601,967 bytes。兩條路徑均不需要新增模型或轉換權重。官方 release 提供 Windows CPU、BLAS 與 CUDA 11.8／12.4 ZIP，沒有 Windows Vulkan 資產；BLAS 包也不是 Vulkan 包。[固定發行資產](https://github.com/ggml-org/whisper.cpp/releases/expanded_assets/v1.9.2)

專案目前沒有可重用的共用 CUDA runtime。現裝研究 binary 只有 CPU backend；既有分離的 ONNX DirectML 不供 whisper.cpp 載入為 CUDA／Vulkan backend。本機沒有 CUDA_PATH 或標準 CUDA Toolkit 目錄，但有 NVIDIA driver 的 nvcuda.dll、Vulkan loader 1.4.341.0 及 x64 VC runtime。這不等於已驗證完整 GPU binary 依賴或 Vulkan 模型可用，也不代表已掃描所有其他應用程式的私人 runtime。

## 使用者下載與落地容量

以下使用十進位 MB／GB，整包全部檔案相加，沒有只計 GPU DLL 或權重。

| 固定版本路徑                 |       完整 ZIP 下載 bytes |        整包解壓檔案 bytes |  同時保留 ZIP＋解壓 bytes |
| ---------------------------- | ------------------------: | ------------------------: | ------------------------: |
| 既有 CPU x64，供對照         |      8,194,445（8.19 MB） |    20,848,640（20.85 MB） |    29,043,085（29.04 MB） |
| CUDA 11.8 x64                |  269,446,789（269.45 MB） |  607,995,392（608.00 MB） |  877,442,181（877.44 MB） |
| CUDA 12.4 x64                |  670,611,449（670.61 MB） | 1,182,142,976（1.182 GB） | 1,852,754,425（1.853 GB） |
| Vulkan，自建同 source commit | 無官方 Windows 成品，未知 |            尚未建置，未知 |                      未知 |

下載量來自 GitHub 官方 release API。解壓量以 HTTP Range 讀取 ZIP 的 22-byte 結尾及精確中央目錄，僅取檔名／長度，共 8,929 bytes；伺服器若非 206 或範圍不符便拒絕。沒有讀取 DLL／EXE payload、下載完整 ZIP 或執行其中程式。CPU 目錄總長度與既有本機完整解壓的 20,848,640 bytes 相同。這是檔案邏輯長度，並非安裝實跑、實體磁碟配置量或完整 archive SHA 驗證。

對已裝好目前研究環境的使用者，上述 GPU 整包就是選配新增量；現有權重再下載為 0 bytes。首次保留下載與 staging 至少需要表中兩者合計，另加 manifest、原環境、更新／回滾 staging、shader／PTX cache 及分析暫存；不把它當完整峰值空間承諾。新的乾淨電腦還要原本 CPU 路徑、FFmpeg、HubertFA 等既有依賴，不能將此表冒充整個歌詞功能容量。驅動或 VC runtime 若缺失，其安裝成本亦另計。

CUDA 12.4 包的 ggml-cuda.dll 約 536.77 MB，另有 cublas64_12.dll 約 100.03 MB、cublasLt64_12.dll 約 473.55 MB；不是幾個小型 wrapper。11.8 的 ggml-cuda.dll 也約 536.35 MB。即使挑掉測試與無關工具，不能未驗證 PE import／延遲載入／模型功能便宣稱可大幅縮小；最小可用閉包仍未知。中央目錄及逐檔大小都保留於 JSON。

## CUDA 與 Vulkan 的投入差異

| 面向           | Vulkan 自建執行包                                                         | CUDA 官方預編譯包                                                          |
| -------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 使用者開發工具 | 不需要 SDK／compiler                                                      | 不應要求整套 CUDA Toolkit／nvcc／Python                                    |
| 執行期         | 相容 Vulkan 驅動／loader、建好的 CLI／backend／CPU fallback 及 VC runtime | 相容 NVIDIA driver、包內對應 CUDA／數學庫／CLI／CPU fallback 及 VC runtime |
| 開發者投入     | 固定編譯器、CMake、Vulkan SDK／SPIR-V 工具，建立自己的可重現產物與 SHA    | 官方包可先驗證；若改新版 CUDA 或裁剪，仍要自行建置／驗證／維護             |
| 跨硬體驗證     | NVIDIA／AMD／Intel 各需證據，不能以跨廠 API 等同全面可用                  | 僅 NVIDIA，仍需顯卡架構／driver／runtime 相容性矩陣                        |
| 已知容量       | 使用者包未知，不能預報成幾 MB                                             | 11.8 約 608 MB；12.4 約 1.182 GB                                           |
| 當前主要成本   | 尚無官方 Windows 成品，需我們承擔建置與發行                               | 明確較大的包，且現成版本對這台新卡仍須相容性實測                           |

固定版 release workflow 由建置機安裝 CUDA 開發元件，然後把 CUDA bin 的 DLL 複製進輸出 ZIP；因此不能將 CI 的 Toolkit 安裝步驟誤當使用者安裝需求。這證明包的設計意圖，不是已驗證所有目標機器都依賴齊全。[固定 workflow](https://github.com/ggml-org/whisper.cpp/blob/306c88f4d1286aec1bf96e544632897886af5501/.github/workflows/release.yml#L294-L478)

Vulkan 在此 source 需要 glslc／SPIR-V headers，shader 在建置階段編入 backend；SDK 是我們的建置成本。本輪容量參考固定為 SDK `1.4.341.1`，LunarG 對 Windows SDK 的空間指引約 1 GB，另外還有 C++／CMake、build tree 與快取，完整開發落地未量測。本機目前沒有確認可用的 Vulkan SDK／完整 C++ build 工具鏈；本輪沒有安裝。[固定 CMake](https://github.com/ggml-org/whisper.cpp/blob/306c88f4d1286aec1bf96e544632897886af5501/ggml/src/ggml-vulkan/CMakeLists.txt)、[LunarG SDK 與 driver 說明](https://vulkan.lunarg.com/doc/view/1.4.341.1/windows/getting_started.html)

RTX 5060 Ti 是另一個需要分開判斷的點：source 將 Blackwell 原生目標列為 CUDA 12.8 起；官方包卻只有 11.8／12.4。較早工具鏈若內含完整可用的 PTX 仍可能在新卡 JIT 執行，不能斷言一定不能跑；也不能僅看 driver 新就宣稱整個 runtime／cuBLAS 已相容。原生新卡候選可另固定 CUDA 12.8 以上重新建置，但其完整包容量、冷 JIT、性能與相容性目前都未知，不在本輪下載或實作。[固定 CUDA CMake](https://github.com/ggml-org/whisper.cpp/blob/306c88f4d1286aec1bf96e544632897886af5501/ggml/src/ggml-cuda/CMakeLists.txt)、[NVIDIA Blackwell 相容性規則](https://docs.nvidia.com/cuda/archive/12.8.0/blackwell-compatibility-guide/index.html)

## 效果與成本是否相稱

既有四案 CPU 研究批次共 47.49 秒，small wall time 為 37.86 秒，其中模型載入約 1.19 秒，主要成本在推論。這個分母是固定片段研究 batch，不是整曲、不是 production SLA，也不是本輪 Vulkan／CUDA 實測。context 重用尚未實測且暫緩，可辨識的載入成本僅約整批 2.5%，不能期待它解決全部瓶頸。

以下是假設「含初始化的 small wall time」真的變快，其他工作完全不變的算術情境；新增 GPU 初始化／傳輸／JIT 成本若不含在該倍數內，必須另加。不是預測任一 backend 的速度。

| 假設 small 整段耗時加速 | 四案整體估算 | 相對 47.49 秒節省 |
| ----------------------- | -----------: | ----------------: |
| 2 倍                    |     28.56 秒 |             39.9% |
| 3 倍                    |     22.25 秒 |             53.2% |
| 5 倍                    |     17.20 秒 |             63.8% |

因此 small GPU 有比單獨 HubertFA 更大的潛在價值；但沒有本機實測，就不能對 Vulkan／CUDA 排速度名次或保證能達到這些情境。GPU 也不自動改善正常句誤拒、漏詞漏檢或詞塊時間；浮點／轉錄差異反而可能影響既有內容門檻，必須比較完整接受／拒絕／警告／T1 回退。

目前不設定新的 GPU 產品容量或速度門檻，也不預先排入建置工作。若未來重啟，應先依實際等待成本決定是否值得投入，再驗證完整交付容量、內容／回退與取消；不能以未來節拍／段落可能共用作為現在必裝 CUDA 的理由。

整體仍需維持盲轉寫、原音訊範圍／offset、取消與來源保留；不能藉加速合併長段後更動英文證據窗、啟用新的 VAD／flash-attention、量化或改模型，否則不是相同配方比較。OBS 競用、GPU 記憶體／冷初始化、短句與長曲成本亦需各自記錄。未來 Audio Python CUDA 環境並不等於此 C++ 執行包可直接共用；Provider Python、Audio Python、歌詞研究生命週期保持獨立。

## 本輪驗證與暫緩範圍

核對 Git 狀態與既有 baseline、固定 tag／commit／release API、ZIP 目錄容量與現有 CPU 解壓量、依賴來源及情境算式；沒有下載完整 GPU archive／模型、建置、安裝或新 GPU 推論。既有 immutable 環境及產品程式不變，沒有 commit／push。

目前結論為維持 CPU，成本研究結案。官方 CUDA 11.8／12.4 包下載、固定 Vulkan 建置及交付容量盤點、GPU 實測、產品整合均未做且暫緩；不再把安裝 SDK、建立新環境或下載實測列為下一個預設動作。
