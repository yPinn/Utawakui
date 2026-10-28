# 歌詞波形 backend：預算與取消驗證

2026-10-28，沿[原第 3 項](../product/lyrics-timing-review-detail-2026-10-26.md)的 R15–R17。結論是保留 Main 分塊 FFmpeg＋隔離 worker 作下一步候選；不採用同一 renderer 的完整 Browser decode 作長曲／硬取消主路徑。本輪沒有接正式波形介面、cache 或新的產品 IPC，產品現況只見 [spec](../../spec.md)。

## 方法與分母

[可重現 runner](../../../prototypes/lyrics-waveform/README.md)產生純合成媒體，不讀正式曲庫或私人歌曲；[機器證據](lyrics-waveform-backend-2026-10-28.json)保存 16 個 Main cases、9 個 Browser cases、環境、逐程序記憶體及 gates。Windows x64／Ryzen 7 7700／16 logical CPUs／約 63.2GiB RAM；Node 24.17.0、Electron 43.8.3／Chromium 150.0.7871.250，使用既有系統 Gyan FFmpeg 9.0 full build。沒有安裝或下載依賴；不是 app-managed／封裝版 FFmpeg 的驗收。

Main parent 導出 fixture metadata／content binding，專用 Node worker 以固定第一音軌輸出 interleaved Float32，不 downmix 或改 sample rate。Coarse／detail 都取每個時間桶內所有聲道的 signed extrema，保留反相通道；只回有界摘要，不把 PCM 送給 renderer。摘要跨度以 frames／原 sample rate 計算，不加入歌詞 offset 或 tempo。

Browser 使用隔離且 sandboxed 的 renderer，完整 fetch、`decodeAudioData`，直接掃各聲道並分段讓出 event loop。這個 API 需要完整音檔，參數沒有 abort signal；[Web Audio 1.1](https://www.w3.org/TR/webaudio-1.1/#dom-baseaudiocontext-decodeaudiodata)與 [MDN 完整資料限制](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData)是本輪核對依據。FFmpeg 的固定選軌與 raw Float32 分別依[選軌文件](https://ffmpeg.org/ffmpeg.html#Stream-selection)與 [raw PCM muxer](https://ffmpeg.org/ffmpeg-formats.html#Raw-PCM-muxers)；raw 格式本身不攜帶時間 metadata，須由 Main 自行掌握。

## 暫定 gate

只作這個 prototype 的工程預算，不宣告正式格式／支援上限：input ≤1GiB、1800 秒、≤8 channels、8k–192kHz；單一 producer、同 key 最多 8 consumers，其他 key 不排隊。每 chunk ≤256KiB，coarse 4096 桶為 32KiB、detail 8192 桶為 64KiB，兩摘要工作集 96KiB；單摘要 payload ≤64KiB。

Main 觀測記憶體合計預算 256MiB、producer deadline 30 秒、明確取消到關閉 ≤1000ms、host event-loop max ≤50ms。Browser admission 先算 encoded bytes＋完整 Float32 PCM 的兩倍＋64MiB reserve；超過 256MiB 不開始讀取／解碼。30 分鐘 48kHz stereo 的一份 Float32 PCM 為 659.18MiB，完整保留兩份連同輸入約 1420.26MiB，因而拒絕。

## 正常解碼

時間為 producer 啟動到 stdio／worker 關閉；不含 fixture metadata／content hash 前置。Browser 時間含 fetch、decode 與摘要。記憶體欄為 host RSS 增量＋worker／decoder 各自觀測峰值之和。

| 合成來源       | 時長 | sample rate／聲道 | Main ms | Main 觀測 MiB | Browser ms |
| -------------- | ---- | ----------------- | ------- | ------------- | ---------- |
| PCM16 WAV mono | 15s  | 16kHz／1          | 104.26  | 75.50         | 59.50      |
| PCM16 WAV 反相 | 30s  | 44.1kHz／2        | 130.77  | 90.15         | 127.40     |
| MP3            | 30s  | 44.1kHz／2        | 117.28  | 90.16         | 153.20     |
| AAC／M4A       | 30s  | 48kHz／2          | 117.59  | 94.82         | 153.50     |
| Opus／Ogg      | 30s  | 48kHz／2          | 119.98  | 92.67         | 161.60     |
| FLAC 反相      | 120s | 48kHz／2          | 166.33  | 104.49        | 568.20     |
| FLAC 反相長曲  | 30m  | 48kHz／2          | 1108.41 | 111.69        | 預算拒絕   |
| FLAC 正負聲道  | 15s  | 96kHz／4          | 129.10  | 94.46         | 未測       |
| FLAC 正負聲道  | 5s   | 192kHz／8         | 131.31  | 99.11         | 108.80     |

30 分鐘 repeat-read 為 1119.21ms／113.05MiB，沒有清 OS cache，也沒有宣稱這是產品持久 cache 命中。最大 host event-loop 延遲 25.62ms；實際最大 PCM chunk 64KiB，單摘要 64KiB、工作集 96KiB。正負通道的非零峰值保留，沒有平均相消。正常分母及預算 gates 全通過。

Browser 的 120 秒個案 renderer 觀測峰值約 221.19MiB；即使最終摘要很小，完整 PCM／副本仍佔主要成本。長曲只驗 admission 拒絕，沒有冒險配置約 1.4GiB 來證明原本可預見的超預算。

## 取消與錯誤

明確取消及來源失效在第一批真 PCM 到達後觸發；parent 不只丟棄 Promise，還等 producer／worker stdio 關閉，並以 OS PID 消失檢查沒有殘留。取消只對這次自己建立的程序；500ms 未回應才停止該 worker 程序樹，沒有 image-wide kill。

| 情境              | 結果          | 關閉量測             | 安裝次數 |
| ----------------- | ------------- | -------------------- | -------- |
| 明確取消          | CANCELLED     | cancel→close 10.34ms | 0        |
| 來源 generation   | STALE         | cancel→close 10.73ms | 0        |
| 5ms 測試 deadline | DEADLINE      | 總計 62.36ms         | 0        |
| 虛報 1s 長度上限  | PCM_DURATION  | 總計 92.63ms         | 0        |
| worker 被終止     | WORKER_FAILED | 總計 86.04ms         | 0        |
| 損壞媒體          | DECODE_FAILED | 總計 88.74ms         | 0        |

全部確認 decoder 已消失、worker 已關閉且沒有安裝。Lane 回歸另驗同 key 去重、只取消一位 consumer 不停止其他人、最後一位取消停止 producer、busy／consumer 上限、過期晚成功及超 payload 不安裝。

Browser 在 decode 開始後立即呼叫 `AudioContext.close()`，decode 仍於取消後 97ms fulfilled；沒有宣稱 decoder 已停止，也不產生可安裝結果。因此取消 fetch、關 context 或忽略晚回，都不足以達成本提案的實體 producer 取消要求。

初次試跑包含觀測器未初始化的缺測、Windows PowerShell 5.1 JSON array 差異與短 worker 的終態競態，不列通過。終態競態以紅燈回歸固定：`exit` 可能早於 stdio／IPC 排空，改等 `close` 再結算；[Node child process 文件](https://nodejs.org/docs/latest-v24.x/api/child_process.html#event-close)同樣區分此邊界。最終採用機器證據才是本報告分母。

## 採用邊界與後續 gate

以下是本次隔離實驗的採用決策；後續 Main 接入、cache 與介面驗收集中在[波形契約](../../contracts/lyrics-waveform.md)，不回改本報告量測分母。

Main 分塊 producer 通過本合成分母的預算／取消 gate，適合作下一步候選。正式接入須重用既有 FFmpeg gate／scheduler 與原媒體 proof，固定 producer／解析度 identity、generation commit fence、有界 cache／清理與 UI intent；不從 renderer 收路徑、decoder 參數或完整 PCM。

本輪沒有 cache 生產實作、共享播放負載、真實長曲／容器尾段、封裝 decoder 或長時間壓力驗收。20ms OS 工作集取樣可能漏掉短峰；各程序峰值相加也不是精確同時峰值，不能當硬 RSS 限制或所有 codec 的記憶體上界證明。上述正式整合與真實分母尚未通過前，不開放通用 Browser fallback、不新增波形承諾，也不將振幅當人聲活動或對時正確性證據。
