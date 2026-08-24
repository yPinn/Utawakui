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

完整 Python site-packages 約 645 MB；packaged `win-unpacked` 已成功使用其中的
worker 與固定 checkpoint 完成合成音訊及 I AM 的 smoke。

## 已守住的邊界

- Worker 只讀固定 PCM WAV 與單一已驗證 checkpoint。
- 音訊由 app 的固定 FFmpeg decode 路徑準備，worker 不使用 `torchaudio.load`。
- Python 層阻擋 socket、HTTP、cache helper 與 child process。
- Worker 輸出仍經 main-owned sidecar validator 與 atomic publication。
- Beat This! 失敗不會破壞播放、Lyrics 或 M0 presentation fallback。

OS 層的網路隔離尚未驗證；Python policy 不是完整 sandbox。產品 activation 仍須在
此 gate 關閉後才可啟用。

## 下一個 phase

1. 加入人工標註的 beat/downbeat fixtures，定義容許誤差與回歸門檻。
2. 完成 runtime/model install、activation、repair、removal 與 generation lease。
3. 驗證 OS-level offline、授權 notices、磁碟空間與失敗復原。
4. 在相同固定歌曲上比較 app-owned CBM/librosa 的 M2 section boundary；不得臆造
   verse/chorus semantic role。

## 主要來源

- [Beat This! repository](https://github.com/CPJKU/beat_this)
- [Beat This! 1.1.0 on PyPI](https://pypi.org/project/beat-this/)
- [Python 3.14.7](https://www.python.org/downloads/release/python-3147/)
- [TorchAudio documentation](https://docs.pytorch.org/audio/stable/)
