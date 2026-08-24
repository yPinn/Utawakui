# Beat This! M1 Windows CPU Spike

## 結論

Beat This! 1.1.0 已通過 Utawakui 的第一輪 M1 Windows x64 CPU spike。
`small0` 與 `final0` 都能在完全固定的 CPython 3.14.7、PyTorch 2.11.0 CPU、
TorchAudio 2.11.0 CPU wheel graph 中執行，並由 packaged app 所帶的 worker
讀取本機 checkpoint，產生符合 Music Analysis contract 的 BPM、beat、downbeat
與 bar position。M1 合法地保留空的 `sections`，因此不會阻塞既有 M0 fallback。

目前選定 `small0` 作為暫定產品預設候選：checkpoint 約 8.1 MiB，實測記憶體與
安裝成本均低於 `final0`。這不代表它已通過準確率驗收；固定歌曲目前沒有人工標註
ground truth，下一階段仍需加入有標註的 beat/downbeat fixtures。

## 固定供應鏈

- Runtime：CPython 3.14.7 Windows x64 embeddable package。
- Analyzer：Beat This! 1.1.0。
- Runtime pair：PyTorch 2.11.0+cpu / TorchAudio 2.11.0+cpu。
- Dependency graph：16 個 exact-version Windows wheels，拒絕 sdist。
- Checkpoints：`small0` 與 `final0` 皆以固定 URL、size、SHA-256 描述。
- Product default candidate：`beat-this-small0-cpu-v1`。

所有 runtime、package 與 model 輸入均由 main process 的 manifest、角色集合、
檔名、大小與 SHA-256 驗證。Worker 不接受 renderer 提供的路徑、模型 id 或參數，
也不會在執行時下載 checkpoint。

## Windows CPU 實測

| 輸入                    | 模型   | 經過時間 | Peak working set | 推定 BPM | Beats / Downbeats |
| ----------------------- | ------ | -------: | ---------------: | -------: | ----------------: |
| 36 秒、120 BPM 合成音訊 | small0 |  2.42 秒 |           346 MB |   120.00 |           73 / 72 |
| 36 秒、120 BPM 合成音訊 | final0 |  3.12 秒 |           466 MB |   120.00 |           73 / 58 |
| IVE — I AM              | small0 |  5.15 秒 |           452 MB |   120.00 |          363 / 91 |
| IVE — I AM              | final0 |  6.78 秒 |           607 MB |   120.00 |          364 / 91 |
| tuki. — 晩餐歌          | small0 | 12.55 秒 |           480 MB |   103.45 |          380 / 95 |
| tuki. — 晩餐歌          | final0 |  7.31 秒 |           623 MB |   103.45 |          369 / 92 |
| 河南說唱之神 — 小日子   | small0 |  5.34 秒 |           500 MB |   125.00 |         519 / 131 |
| 河南說唱之神 — 小日子   | final0 |  8.57 秒 |           650 MB |   125.00 |         499 / 129 |

數值來自單次 spike，不是正式效能承諾。晩餐歌的 small0 時間明顯偏離其他樣本，
在做吞吐量結論前必須重複量測。三首真實歌曲也尚無人工標註，因此只能證明讀取、
推論與 sidecar contract 能成立，不能據此宣稱 beat/downbeat 準確率。

先前 benchmark 環境的完整 Python site-packages 約 645 MB；packaged
`win-unpacked` 已成功使用其中的 worker 與固定 checkpoint 完成合成音訊及 I AM
的 smoke。現在 app-owned 直接 wheel 安裝實測總量約 531 MiB，UI 以此提供約略的
安裝空間提示。

## 安裝與 activation 驗證

內部 F10 workbench 已接上真實準備流程。由空白 app-owned root 開始的 Windows
x64 驗證下載 152 MB 固定資源，通過長路徑 wheel 解壓、每個 artifact 的 size 與
SHA-256、CPython 3.14.7 與全部 package exact-version/native import probe，最後
發布 immutable generation。使用剛安裝的環境再次跑 36 秒合成音訊，3.02 秒完成，
得到 120.00 BPM、73 beats，peak working set 約 347 MB；worker 回報 offline 與
no-user-cache policy 均已啟用。

UI 以 capability state 決定主動作：缺少時為「下載並安裝」、損壞時為「修復分析
功能」、就緒後才是「開始分析」。低頻率的模型、下載量、安裝空間與安全說明移到
資訊 modal；移除只處理 analysis capability，不刪歌曲、歌詞或既有 sidecar。
F10 另提供最多 500 首的多選批次分析：main 依序處理、預設略過已有 M1／M2 的
曲目、單首失敗後繼續，並可取消正在檢查或推論的曲目與剩餘佇列。Renderer 只送
track id 清單與 force boolean，不控制路徑、模型、worker 參數或 concurrency。

## 已守住的邊界

- Worker 只讀固定 PCM WAV 與單一已驗證 checkpoint。
- 音訊由 app 的固定 FFmpeg decode 路徑準備，worker 不使用 `torchaudio.load`。
- Python 層阻擋 socket、HTTP、cache helper 與 child process。
- Worker 輸出仍經 main-owned sidecar validator 與 atomic publication。
- Beat This! 失敗不會破壞播放、Lyrics 或 M0 presentation fallback。

OS 層的網路隔離尚未驗證；Python policy 不是完整 sandbox。現有 activation 僅供
feature-gated 內部 workbench 驗證，不代表已通過公開產品 release gate。

## BPM 校準修正

初版 profile 以相鄰 beat 間距的中位數回推 BPM。Beat This! 的輸出位於 50 fps
時間格，單一間距因此會被量化到 20 ms 倍數：I AM 被鎖在 500 ms／120 BPM，
一輪花被鎖在 660 ms／90.909091 BPM。`beat-this-small0-cpu-v2` 改用最多 32 拍
的跨拍視窗中位數；不改變 beat/downbeat 時間，只降低全曲 tempo 的 frame-grid
偏差。

以相同已安裝 runtime、small0 checkpoint 與本機音檔重跑，I AM 為
121.982211 BPM，一輪花為 91.954023 BPM；UI 分別顯示「約 122 BPM」與
「約 92 BPM」。前者 363 beats／91 downbeats，後者 334 beats／110 downbeats，
與修正前完全相同。既有 v1 sidecar 仍可安全使用，但必須重新分析或在批次操作
勾選「重新分析已有結果」，才會寫入 v2 tempo。

## 下一個 phase

1. 加入人工標註的 beat/downbeat fixtures，定義容許誤差與回歸門檻。
2. 驗證 OS-level offline、release 授權 notice、磁碟空間與失敗復原。
3. 完成人工 UI 驗收：安裝進度、ready/analyze、repair/remove、modal、scroll，
   以及批次選取、預設略過、強制重跑、逐曲狀態、失敗續跑與取消。
4. 在相同固定歌曲上比較 app-owned CBM/librosa 的 M2 section boundary；不得臆造
   verse/chorus semantic role。

## 主要來源

- [Beat This! repository](https://github.com/CPJKU/beat_this)
- [Beat This! 1.1.0 on PyPI](https://pypi.org/project/beat-this/)
- [Python 3.14.7](https://www.python.org/downloads/release/python-3147/)
- [TorchAudio documentation](https://docs.pytorch.org/audio/stable/)
