# R01：衍生四聲道音訊減量研究

建議將單檔四聲道 FLAC、compression level 5 留為新分離結果 opt-in 的優先候選；目前不改產品、不遷移舊結果、不正式採用 codec。Opus 暫不建議作為演唱／排練的主要衍生檔。這是[原 R01](../product/player-practice-planning-2026-10-26.md#6-衍生音訊減量研究方案)的工程證據，涵蓋格式、定位／時序、實際端點與 OBS 驗證；產品分類仍見 [spec](../../spec.md#73-研究候選尚未接受為開發路線)。

## 階段結論與閱讀順序

格式候選已可收斂，音訊可靠性分為 bridge 零段與直接 DSP 音高兩條線；後續先做觀測擾動對照，再做 DSP 最小相位／映射對照。這是原 R01 的研究順序，不是產品啟用或遷移計畫。

| 問題           | 目前結論                                                                           | 證據與未解範圍                                                   |
| -------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 容量與保真     | 三首 FLAC 5 合計省 40.70%，全檔四聲道 PCM 與 WAV 一致                              | 格式／載入見首輪至第四輪；不宣稱 RAM 同比下降或真正磁碟 cold     |
| capture 短零段 | 本機供消批次可超過 bridge FIFO 容量，五個單 bridge 案例完成具體 underrun／零段對齊 | 第七輪；尚非 OS／driver 唯一原因，也不回填所有歷史雙 bridge 身分 |
| 直接 DSP 偏差  | 原版 mono 路徑仍可重現，範圍縮至映射後的相位預測與合成                             | 下節離線補充；未證明唯一缺陷，不改 preset 或放寬原門檻           |
| 證據品質       | 第五／六輪獨立複核未推翻受限結論，R1–R7 的路徑、窗口與保存限制已修正               | 完整內部 PCM 窗口與窗口外收據分開；原 9／16 失敗保留             |

下面各輪保留原分母、反例及失敗，不將案例數累加成品質通過率；當前採用建議只見文末。

## 現行實作核對

- `electron/lib/vocalSeparation.js` 先固定 44.1 kHz stereo 推論，再以 encodeWav 寫 16-bit PCM 四聲道；順序是 accompaniment L/R、guide vocal L/R。每秒 352800 bytes，約 20.19 MiB／分鐘，不計小型 header。
- `electron/lib/library/separationManifest.js` 的 v2 manifest 以 artifactFilename／outputLayout／recipe／profile 持有結果，filename validator 與 resolver 只接受 `.wav`。壓縮檔改副檔名不能直接上線。
- `electron/main/mediaProtocol.js` 沿 library allowlist 與真 206 Range 回應。一般原曲已可服務 FLAC／Ogg Opus；本研究把副本放在隔離 library 的一般 audio asset 路徑測格式，沒有放寬 separation resolver。
- `src/composables/player/usePlayerAudioGraph.js` 以單一 HTML audio、四路 splitter 合成兩組 stereo，沿真 Signalsmith monitor DSP；BGM 也消費同一類 separation 結果，不能用兩個獨立 audio clocks 替代。
- 逐曲設定的 `performanceSettings/media.js` 綁原曲 identity／hash；原音訊 waveform 也使用 originalMedia。後續不能因更換衍生檔就重綁原曲、清掉設定或誤換 waveform 來源。清理／容量計算則經 manifest 的 artifactFilename，格式改動仍須連同保護與回復驗證。

## 素材與方法

使用者允許唯讀取樣目前 Utawakui 曲庫。現有 5 份 general WAV 中，依檔案大小取最小、中位、最大 3 份，匿名為 music-1／2／3：147.557、193.600、242.920 秒，均為 44.1 kHz／16-bit／4ch。不是隨機抽樣，沒有按曲風、原曲容器或獨唱／合唱分層，不能外推整庫。

另有自製 30 秒／44.1 kHz 與 300 秒／48 kHz 四聲道不同頻率訊號，只驗格式、順序與相位，不能當自然音樂品質。原來源不覆寫；研究副本與音訊全部留在 ignored `tasks/r01-20261030`。三份來源 SHA-256 在取樣及量測後比對相同；公開[數據](data/derived-audio-reduction-r01-2026-10-30.json)只留匿名 id、hash 與數值，不含私有路徑、歌曲名稱或音訊。

環境：Windows、Ryzen 7 7700，PATH FFmpeg 9.0 Gyan full build、Node 24.17.0、Electron 43.8.3／Chromium 150.0.7871.250。沒有更新產品 FFmpeg 依賴或下載模型。

- 五種格式 × 五份素材，共 25 案；WAV remux 作對照、FLAC 5／8、有損 Ogg Opus 256／384 kbit/s（四聲道總碼率、mapping_family=255）。沒有降低聲道數、位深或 FLAC sample rate。
- 容量與全檔解碼 PCM 比較各跑一次；自然音樂另各格式重複編碼三次，共 45 jobs，收 wall time、FFmpeg CPU user＋system 與 maxrss。表中編碼時間是三首各三次合併的中位數，包含 process／I/O，RAM 是 encoder process peak，非播放器峰值。
- 隱藏 sandboxed Electron 使用原 media protocol／Range serving；每案新 audio 元素載入三次、播放後 paused seek 五個固定分散位置（13%、77%、33%、91%、6%），再套 Key +2、Key -2＋tempo 1.1、reset 三次。總計 75 次載入、125 次 seek、75 次 monitor DSP applied 確認。未測 capture 裝置，webContents 靜音，沒有人工聽辨。
- 自然音樂三首的 15 次 seek／格式用於下表。首次載入與第二、三次載入分開；編碼與先前讀檔已暖 OS cache，沒有清 OS cache，不能稱真正磁碟 cold start。WAV 第一案也混入程序首次初始化成本，不能直接宣稱 FLAC 首次載入較快。

主要可重現的編碼參數如下（input／output 只指研究副本）；PCM 比對使用 `-f s16le -acodec pcm_s16le -ar <原 sample rate>` 解碼到 pipe。沒有以 `-ac 2` 混音：

```text
ffmpeg -i input.wav -map 0:a:0 -c:a flac -compression_level 5 output.flac
ffmpeg -i input.wav -map 0:a:0 -c:a flac -compression_level 8 output.flac
ffmpeg -i input.wav -map 0:a:0 -c:a libopus -b:a 256k -mapping_family 255 output.opus
ffmpeg -i input.wav -map 0:a:0 -c:a libopus -b:a 384k -mapping_family 255 output.opus
```

## 量測結果

自然音樂合計原 WAV 206062532 bytes（196.52 MiB）；WAV 對照 remux 只多 174 bytes header。

| 候選     | 合計容量 MiB | 剩原容量 | 編碼中位 ms | encoder peak MiB | 重複載入中位 ms | seek 中位／最大 ms |
| -------- | -----------: | -------: | ----------: | ---------------: | --------------: | -----------------: |
| WAV      |       196.52 |  100.00% |         144 |            24.96 |            12.4 |           2.0／3.0 |
| FLAC 5   |       116.53 |   59.30% |         425 |            30.45 |             9.6 |          6.2／51.8 |
| FLAC 8   |       115.84 |   58.95% |         909 |            30.46 |            10.6 |          4.7／17.5 |
| Opus 256 |        18.91 |    9.62% |        2696 |            24.69 |            12.2 |           4.6／8.5 |
| Opus 384 |        28.15 |   14.33% |        2482 |            24.69 |            11.8 |           5.1／9.6 |

FLAC 5 三首各剩 62.53%、49.53%、65.11%，合計省 40.70%。FLAC 8 相對原 WAV 多省約 0.35 個百分點（719448 bytes，約 0.69 MiB），編碼中位時間約 2.14 倍；不值得據此把 8 當預設。各格式編碼 CPU 中位為 WAV 0.063、FLAC 5 0.406、FLAC 8 0.875、Opus 256 2.875、Opus 384 2.578 秒。這些是本機小樣本結果，不能據單次長尾或不同碼率的微小差異推定普遍速度排序。

所有 25 案都可載入、seek、播放並獲得三組真 monitor DSP applied acknowledgement。seek 數字只到 seeked 事件；currentTime 回報貼近目標不代表實際發聲 frame 已精準命中。沒有量測 first audible sample、A–B lap 誤差、冷磁碟最差 seek、長時間 CPU／renderer RAM 或裝置／OBS 時間品質。

## 四聲道與資料保真

FLAC 5／8 的五份素材全檔解碼回原 sample rate、交錯 s16 PCM 後逐 byte 一致，長度也相同，涵蓋所有聲道與全長，不只是檔案能播放。Electron 另解碼 1 份自然音樂及 30 秒測試訊號，共 10 案到 48 kHz AudioBuffer；FLAC 的四聲道 frame 數及各聲道前 16000 frames 與 WAV 對照完全一致。不同頻率測試訊號的對應是 0→0、1→1、2→2、3→3，沒有觀察到交換或相位位移。這些不等同實際裝置長時間 drift 驗收。

Opus 有損，三首逐聲道客觀 SNR 約 18.39–21.84 dB（256）與 21.78–24.76 dB（384），以解碼回 44.1 kHz 與 WAV 作直接比較，含 resampling 差異；不是聽感評分，也未調校其他 mapping／coupling profile，不能推論所有 Opus 設定的品質。測試訊號仍對應四個原聲道，自然音樂高度相關的 L/R 不能用相關係數最大項單獨判定換聲道。music-1 在 Electron 的 Opus AudioBuffer 比 WAV 多 1 frame，HTML duration 普遍多報約 6.5 ms；需另處理 preskip／取整及時間邊界，不解讀為已證實長期 drift。

即使 FLAC 磁碟容量減少，解碼後 Float32 PCM 的理論大小不變；例如 4 分鐘、44.1 kHz、4ch 約 161.5 MiB（不計其他 buffer）。這不代表 streaming 播放器一定整首常駐，也不能宣稱播放器 RAM 同比例減少。

## 其他方案與來源核對

同三首另編兩份 stereo FLAC 5，合計比單檔 4ch FLAC 5 再少 3.31–6.46%。但會引入成對提交、seek／取消／遺失一半及共同 clock 的新問題；不建議為這點空間收益改成兩個 HTML audio owners。ALAC／WavPack 未做本輪播放量測，亦不能從一般原曲格式清單推定可直接成為 separation artifact。

格式標準與本機結果分開：

- [RFC 9639](https://www.rfc-editor.org/rfc/rfc9639.html) 定義 FLAC 的無損多聲道 frame、channel assignment 與可選 seek table。本輪全檔 PCM 驗證支持保真；未加入 seek table 的熱 cache 結果不足以解除冷 seek 門檻。
- [RFC 7845](https://www.rfc-editor.org/rfc/rfc7845.html#section-5.1.1.3) 的 family 255 是無預定聲道語意，並提醒通用播放器不宜直接播放。這個 Electron build 本機成功不構成跨播放器保證；family 1 的 surround 排列也不能未驗就代替兩組 stem 語意。
- [Chromium codec 清單](https://www.chromium.org/audio-video/) 列出 FLAC／Opus；清單只支持選候選，不保證本產品路由。FFmpeg 選項以[官方 encoder 文件](https://github.com/FFmpeg/FFmpeg/blob/master/doc/encoders.texi)及本機輸出核對；沒有拿第三方格式支援表當產品驗收。

## 第二輪：冷啟動、實際 PCM 定位與 capture

沿用同一 Electron／media protocol 與真 usePlayerAudioGraph；工具及新音訊只存 ignored `tasks/r01-adoption-20261030`。Vite 只在送給隔離頁的模組副本加入讀取節點參照，AudioWorklet 旁接觀測 PCM，觀測器輸出為零，沒有改產品檔案或替換 DSP。監聽靜音，capture 使用無聲 sink。以下數據收在同一 JSON 的 adoptionValidation，首輪資料保留。

冷 cache 分層驗證：每次新的 Electron 程序、userData／session，停用 HTTP cache 並先 clearCache；每次由 Robocopy `/J` 建立不同檔案副本，量完才讀 hash，24 份均相同。三份自然音樂及 300 秒訊號 × WAV／FLAC 5 × 三次，共 24 loads、72 次 seek（91%、13%、77%）；第二次反轉格式／素材順序。計時自設定 audio src 到 canplay，不含啟動 Electron／Vite；每檔後兩次 seek 可能已因前次讀取暖化，不能將 72 次全稱磁碟冷 seek。

| 素材／格式        | loads／seek 次數 | canplay 中位／最大 ms | seeked 中位／最大 ms |
| ----------------- | ---------------: | --------------------: | -------------------: |
| 自然音樂 WAV      |            9／27 |          170.7／248.6 |            6.8／89.8 |
| 自然音樂 FLAC 5   |            9／27 |          104.4／233.3 |          22.4／178.1 |
| 300 秒訊號 WAV    |             3／9 |          239.7／341.8 |           7.1／110.2 |
| 300 秒訊號 FLAC 5 |             3／9 |           90.5／100.2 |           11.9／72.2 |

這是「新程序／session、unbuffered copy 準備後首次讀取」，不是已證明的物理磁碟 cold cache。Microsoft 將 [`/J`](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/robocopy) 定義為 unbuffered I/O，[File buffering](https://learn.microsoft.com/en-us/windows/win32/fileio/file-buffering) 說明繞過系統資料 cache 不保證硬體 cache 狀態；本輪也未排除防毒／索引器讀取。未清整機 cache、重開機或施加全機記憶體壓力；只能確認程序／session 冷啟動。小樣本的 FLAC 首載較短、seek 長尾較長，不作普遍速度排序或解除最差負載門檻。

實際定位使用新增 120 秒、48 kHz／s16／四個獨立確定性偽隨機聲道的標記檔，轉成 FLAC 5。五個非整秒位置涵蓋前後跳轉；paused 後排空 220 ms，再 seek、等待 seeked、播放。AudioWorklet 取來源四聲道及真 capture output 兩聲道的首個非零 frame，以前 1024 frames 與對應解碼參照相關比對。兩格式 × 五位置 × 六聲道，共 60 組皆相關係數 1、位置誤差 0 frame，capture 與來源均為 48 kHz，沒有觀察到該窗口內聲道偏移。這支持未變調時數位音訊的定位，不只是 currentTime／seeked 回報；尚未涵蓋 44.1→48 kHz、播放中 seek、A–B 反覆或 DSP 啟用時的首 frame。不同 AudioContext 的 currentFrame 起點不能相減當物理延遲，回報耗時還含 buffer 收集、執行緒傳遞與分析；[Web Audio 規格](https://www.w3.org/TR/webaudio-1.1/) 的 render clock 不是喇叭聲學時間。

Capture 使用原四聲道 splitter → MediaStream bridge → 獨立 capture context → 真 Signalsmith → output；每格式九項情境，共 18 項：伴奏、導唱、Key +2、Key -2＋tempo 1.1、監聽靜音時仍擷取、控制更新取代舊操作、context 暫停失效、重新選擇恢復、取消裝置選擇。伴奏左右主峰為 311／457 Hz，captureVolume 0.5 時幅度約 0.15；導唱關閉時 673／881 Hz 幅度低於 0.00001，開啟後約 0.05。升調主峰 350／513 Hz，降調並變速為 278／408 Hz，與目標差在 2 Hz 內；實際 PCM 支持 DSP 有作用，不將 acknowledgement 當聽感證據。

被取代的控制回覆 cancelled，最新控制 applied；capture context 暫停後 projection invalidated、capture lane failed、裝置清空且 prepare 回 false；重選成功，選擇與取消競態最後沒有殘留 graph、裝置或錯誤。這些是原 graph 的非人工相容性證據。[無聲 sink](https://developer.chrome.com/blog/audiocontext-setsinkid/) 仍處理音訊，但研究直接傳入 `{type: 'none'}`，未覆蓋產品 UI 的實體字串 deviceId、權限、Windows 裝置協商、虛擬線材或 OBS。未量長時間 drift、負載失真或做自然音樂聽辨。

失敗紀錄保留：sandbox 內研究 Electron 首次直接退出，改經允許的隔離程序執行；capture 失效會主動斷線，初版探針重複 disconnect 造成 InvalidAccessError，改成可重複清理後完整重跑；冷啟動第 13 筆因運行中編輯研究啟動器而語法錯誤停滯，只停止該自有程序，保留前 12 筆，固定程式並以全新副本續跑剩餘 12 筆。失敗不列成功分母或格式耗時，未改產品或提高 timeout。

## 第三輪：重採樣、播放中 seek、DSP 定位與持續負載

仍只在隔離研究頁使用真 media protocol／usePlayerAudioGraph／Signalsmith，沒有擴大產品 owner 或 codec allowlist。新增 44.1／48 kHz 四聲道偽隨機 PCM 與 180 秒四聲道獨立幅度時間碼；WAV／FLAC 5 共八份研究資產，四組格式對照另以全檔 s16le PCM hash 證明四聲道、全長完全相同。實際 monitor／capture contexts 都核對為 48 kHz。原始收據與探針保留於 ignored `tasks/r01-position-20261030`；匿名結果接在同一 JSON 的 positionAndLoadValidation。

未變調矩陣為兩 sample rates × 兩格式 × paused／playing seek × 兩位置，共 16 案、96 組聲道窗口。錄製先開始且收到 worklet 確認才送 seek，辨識目標後 10 ms 的 1024-frame 隨機片段。48 kHz 對照 48 組相關係數皆為 1；44.1→48 kHz 的 48 組最低約 0.9502，以 1/32 frame 步距的 cubic 參照相位擬合後最低 0.9949，相位範圍 -0.375～+0.4375 frame。各 lane 聲道定位差均為 0 frame，但插值擬合不是實際解碼 byte equality，也不是重採樣 seek 精度保證。另四案、24 組播放中 seek 首段複測，48 kHz 的前 480／1024 frames 皆相關係數 1；重採樣首 480 frames 最低 0.9325，仍有相位／起始差異，沒有把它寫成首 frame 完全相同。

DSP 會改變波形，因此改用時間碼的 10 ms RMS bins，2 ms 搜尋步距；不能把搜尋步距當成 DSP 或聲學精度。先以八組已知位置／tempo 驗理想模板自洽，誤差在 1 ms 內；這不證明變調後仍有同樣精度。初版 hash 的時間碼曾高相關卻定位到別處，八個探索案例全數拒收，換成 avalanche hash 後重跑。正式矩陣涵蓋上述兩 rates／格式／seek 模式／位置，再加 Key +2／tempo 1、Key -2／tempo 1.1，共 32 案，每案觀測來源、monitor、capture；tempo 由原 HTML audio 處理，Signalsmith 只負責變調。

以 seek 後 1.2 秒起的兩秒穩定窗口估計內容位置，31／32 案取得一致定位；這不是 DSP 首個有效 sample 驗收。這 31 案相對來源的內容延後估計為 monitor 約 118–122 ms、capture 約 129–148 ms，以各 context 自己的 request／render clock 計算，不將不同 context 的絕對 frame 相減當聲學延遲。唯一未解案是 44.1 kHz WAV、播放中 seek 至 94.731 秒、Key -2／tempo 1.1：兩秒窗口最低相關僅約 0.643，選到無關位置，未列為定位通過。

同條件各格式再跑五次，共十案，保存每 lane 原能量包絡，在同一份資料比兩秒／四秒窗口；十案兩種窗口都取得一致定位，最低相關分別約 0.99849／0.99849，未重現異常。原未解案沒有保留包絡，不能回頭證明是定位器、原生 tempo 或播放異常；仍保留失敗，不改列通過，也不據此推論 WAV／FLAC 品質排序。

持續負載使用同一 hidden renderer 並行兩個獨立研究 graph，各自只有一個 HTML audio owner，均使用無聲 sink；是 aggregate 壓力觀測，不是產品同時播放設計或單格式效能比較。兩個 Web Workers 各以名目 12.5 ms busy／37.5 ms wait 加局部 CPU 負載；各跑 60 個十秒等待週期，實際時長含觀測分析。前段 Key +2／tempo 1.1 連續播放並原生循環，後段加 seek／Key 切換。每格式四次循環、五次主動 seek、九個 waiting 事件，沒有 media-error，結束時兩個 contexts 都為 running；waiting 未留事件時間戳，不作逐一原因配對。

| 格式   | 實測秒 | 最大連續全零段 raw／monitor／capture ms | 連續階段末減初內容偏移 raw／monitor／capture ms |
| ------ | -----: | --------------------------------------: | ----------------------------------------------: |
| WAV    |  621.7 |                        10.3／30.0／40.7 |                             -16.4／-18.2／-16.4 |
| FLAC 5 |  623.0 |                        13.0／30.0／51.3 |                             -18.2／-20.0／-18.2 |

六條觀測 lane 的 render frame 計數缺口與數位削波均為 0。全零段仍須保留：monitor／capture 的 ≥5 ms 零段只在起播的一秒窗口，raw 則在循環／seek 附近的一秒窗口；這支持轉場關聯，不證明無縫或沒有 click。固定格線的完整 10 ms 全靜音 bin 在啟播之外為 0，不能用它排除跨格線的短零段。連續階段各 lane 有 11 次高信心位置檢查，末減初仍有上表約 16–20 ms 變化；不宣稱零 drift，也未確定是模板估計、原生 tempo 或 clock 的共同變化。主動 seek 之後不再沿最初起點計 drift。

每十秒取 app.getAppMetrics，共 64 份；同一 renderer 的 CPU API 區間平均中位 3.89%、最大 7.61%，working set 最大 180.93 MiB，private bytes 最大換算 144.94 MiB。第 60 秒 working set／private 約 150.02／113.17 MiB，最後約 157.25／110.75 MiB。單位按 [Electron memory 文件](https://www.electronjs.org/docs/latest/api/structures/memory-info)的 KB 欄位換算，CPU 是[程序指標](https://www.electronjs.org/docs/latest/api/structures/process-metric)的取樣區間平均。數字包含雙 graph、workers、累積觀測資料與回傳成本；同步時間碼分析也造成 renderer timer 最大延後 2138.6 ms，不能當產品 UI 效能、FLAC RAM 節省或無洩漏證據。Render clock 連續亦不是實體音訊 underrun 計數；本輪沒有驗 OBS、裝置 clock、自然音樂聽感或更長場次品質。

## 第四輪：未解案例與轉場時序的因果對照

本機證據把短零段及前輪約 20 ms 共同變化縮到原生循環／tempo 路徑，未指向 FLAC 或 Signalsmith 特有退化；原定位未解案則仍未確診。新收據存於 ignored `tasks/r01-cause-20261030`，同一匿名 JSON 新增 causalInvestigation；前三輪資料與失敗原值完整保留。

以原 180 秒時間碼 PCM 重複四次，製成 720 秒單檔連續對照；兩 rates × WAV／FLAC 共四對，全檔解碼 hash 證明新檔恰為原 PCM 四次接續，沒有另補靜音或變更聲道。七路連續對照涵蓋 tempo 1、1.1、preservesPitch 開／關、格式、原生 loop、DSP 與 48 kHz。仍用真 graph／media protocol 與無聲 sink，所有定位分析移到錄製完成後。原生保留音高的行為也用來源 PCM 頻譜確認：tempo 1.1 開啟時主峰約 996／1499 Hz，關閉時約 1097／1649 Hz；關閉只是研究消融對照，不是產品預設建議。

初版七路／21 觀測 lane 在 360.1 秒牆鐘內只前進約 320.5–321.0 render 秒，雖 contexts 全為 running，仍不列為完整六分鐘時序證據。保留該批後，移除逐 sample 暫存陣列配置，六路只觀測來源、DSP 路保留三 lane，合計降至九 lane。新版約 360.0 牆鐘秒、359.1–359.6 render 秒，通過事先的 <1 秒粗節奏條件；這依然不是 sample 級牆鐘同步或實體即時性保證，也未單獨證明初版是 GC 或背景負載造成。第一個歷史重播另因研究 readback 變數漏取中止，錯誤、source 與 snapshot 均封存，修正後先跑完整八步 smoke，再進正式重播，未改產品或 timeout。

32 個短轉場對照加入精確全零／近零區間的 sample 範圍及 seeking／seeked／waiting 的逐 context frame 投影；偵測下限 16 frames，約 0.33 ms。原生循環會回到 0 秒並發生 seek，與 [HTML media 規範](https://html.spec.whatwg.org/multipage/media.html#playing-the-media-resource)的循環機制一致；標準不構成本產品無縫承諾。

| 路徑                  | 案例 | 起播之外有來源精確零段 | 量到的零段 ms |
| --------------------- | ---: | ---------------------: | ------------: |
| 原生 audio.loop       |   14 |                     14 |    1.54–18.96 |
| 相同 PCM 單檔跨接續點 |   14 |                      0 |             — |
| 明示 playing seek     |    4 |                      1 |         10.21 |

零段在 DSP 前的來源已存在，原生循環附近也觀察到 seeking／waiting／seeked；同 PCM 單檔接續移除這組轉場後未見零段，支持原生 loop／seek 路徑是本輪的行為來源。DSP 開啟可用既有窗口內容蓋過來源零段，不能據下游非零就判定沒有輸入中斷或聽感失真。產品單曲重播由 `usePlayer.js` 設 audio.loop；A–B 的 `usePlayerPracticeRuntime.js` 會 suppressNativeLoop 並走受保護的 player.seek，這裡沒有把兩者視為同一驗收。

以下為連續對照約第 30→330 render 秒的末減初，來源以六秒包絡窗口估計，原生媒體時鐘以每 50 ms 的 currentTime／context 配對讀值計算。快取計算與原兩秒 locator 在理想模板、實際重播窗口均核對一致；六秒多候選窗口另作穩健性對照，沒有改寫舊分數。

| 對照                                  | 來源內容變化 ms | 原生媒體時鐘相對 render 的變化 ms |
| ------------------------------------- | --------------: | --------------------------------: |
| WAV 單檔、tempo 1                     |            約 0 |                             +0.18 |
| WAV 單檔、tempo 1.1、保留音高         |            約 0 |                             +0.00 |
| FLAC 單檔、tempo 1.1、保留音高        |            約 0 |                             +0.00 |
| WAV 單檔、tempo 1.1、不保留音高       |            約 0 |                             +0.38 |
| WAV 原生循環、tempo 1.1、保留音高     |          -14.55 |                            -13.39 |
| WAV 單檔、Key -2／tempo 1.1、保留音高 |           -1.82 |                             -0.01 |
| 48 kHz WAV 單檔、tempo 1.1、保留音高  |            約 0 |                              約 0 |

只有原生循環對照重現同方向的十餘 ms 變化，來源內容與獨立的原生媒體時鐘讀值相符。短轉場各四案的媒體時鐘變化中位，原生 loop 在 tempo 1 為 +6.09 ms、tempo 1.1 且保留音高為 -8.69 ms、tempo 1.1 不保留音高為 +9.85 ms；對應單檔接續均約 0 ms。這進一步支持循環結束／seek 與原生 tempo 保留音高路徑共同影響時序，尚未定位 Chromium 內部演算法或證明自然音樂皆相同；不歸因為一般重採樣或 Signalsmith 的長期 drift。

七路壓力中的 DSP capture lane 另出現約 +78.18 ms render-based 內容變化；配對牆鐘後，capture 與來源的 clock／wall 差異也改變約 +77.03 ms，修正後相對來源的額外變化約 2.97 ms，低於本次 10 ms bin 尺度。這支持該大部分差異是無聲 context 時鐘域的量測效應，沒有證明實體 capture 延遲增加 78 ms。來源 render clock 對牆鐘本身亦有數百 ms 變化，不能將這批虛擬 sink 的 frame 數直接當裝置時鐘或聲學延遲。

原八步歷史以兩格式各重播三輪，共 48 案，全數取得一致定位，最低相關約 0.981；每案保存完整包絡與 checkpoint，六個疑點步驟另保存四聲道各 168000 frames 原 PCM，重算 RMS 與 worklet bins 一致。自然重播未重現原低信心案，但有一案來源內容延後約 612 ms 才到，說明固定時間窗不能無條件視為已穩定。

再以既有 mediaProtocol 的 Range response 依賴，在隔離工廠對合成單檔 seek 至 600 秒注入 0／1500／2500 ms 讀取延遲，兩格式共六案；四個延遲案都確認實際延後了遠端 byte-range 回應，原 bytes／206 headers 不變。固定「錄製後 1.2 秒起的兩秒窗」在延遲案最低相關約 0.62–0.69，會選到無關位置；同一份記錄改取 seeked 後 0.5 秒起的三秒窗口，18 組 lane 相關均高於 0.985。這複現定位器失效機制，並驗證事件錨定窗口能恢復辨識；不代表舊 94.731 秒案例實際發生過相同讀取延遲。原案因未留包絡仍列未解，不升格通過；低信心位置也不解讀為播放器真的播到該處。

## 第五輪：Windows 實際端點與隔離 OBS

本輪先唯讀核對 Windows 裝置、既有 Utawakui 設定與 OBS 路由。預設輸出是 Voicemeeter Input，另有 AUX、USB 無線耳機及螢幕輸出；Utawakui 保存的是 origin/profile 綁定的裝置 id，本輪沒有把新研究 profile 的 id 直接對應回原選擇。既有 OBS 32.2.2 為 48 kHz stereo、AAC 錄製，場景含麥克風與監聽，Utawakui 也連到它；沒有拿該場景做錄製或觸發既有場次。

採用[官方 portable 模式](https://obsproject.com/kb/portable-mode)與[啟動參數](https://obsproject.com/kb/launch-parameters)，複製現有 OBS 二進位至 ignored 研究目錄，核對 executable SHA 相同；不同設定目錄、認證與連接埠，不帶既有帳號／場景。隔離場景只含黑色畫面與 WASAPI process output capture，依 OBS 實際回傳的 priority 選「視窗標題必須相符」，限定專用 Electron 程序，不擷取桌面或麥克風、不開直播。錄製以 ffprobe 確認為 48 kHz、雙聲道 PCM s16le；不是把既有 AAC 設定冒稱無損。私有裝置 id、來源／錄製路徑、OBS 設定與原始錄音只留本機 tasks。

沿原 mediaProtocol 與 usePlayerAudioGraph 工廠，四聲道來源仍先拆 accompaniment L/R、guide L/R，再由真 capture DSP／輸出增益送至實際字串 sink。monitor 跟隨預設裝置但保持靜音；capture 分別選 Voicemeeter AUX 和耳機，不再用 none sink，也沒有以 webContents 靜音遮掉 OS 輸出。這證明端點協商及 Windows 程序錄製路徑，沒有證明耳機 DAC／無線傳輸／聲學輸出或 Voicemeeter B1／B2 混音正確。這是隔離 graph 工廠的格式驗收，不代替完整 player／queue／場次 owner 驗收。

| 自動案例                                 | 數量 | 已確認與限制                                                                                                                                |
| ---------------------------------------- | ---: | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 路由／導唱／Key／tempo                   |   16 | 兩 sink × WAV／FLAC × 伴奏、導唱、Key +2、Key -2／tempo 1.1；均錄成 PCM、controls applied、capture running，但不是全部品質通過              |
| 44.1→48 kHz、播放中 seek／原生 loop、DSP |    4 | 事件及穩定三秒包絡保留；相關 0.9806–0.9988，原值見 JSON，不把它當首 frame 精度或聲學 latency                                                |
| 自然音樂短片                             |    2 | 同一 music-1／Key -2／tempo 1.1、每格式 12 秒；同增益六秒 A／B 經使用者回報未聽出異常，並確認 Turtle Beach 有發聲；只限本次短片聽辨         |
| 耳機短音重播＋來源／capture 探針         |    6 | WAV／FLAC 各三次、每次八秒；OBS 有零段 5／6 案，capture output 有零段 4／6 案；DSP 前四聲道共同精確零段為 0／6，伴奏子集合另由第六輪核對    |
| 同耳機端點對照                           |    6 | monitor 保持靜音但改至 capture 的同一端點；仍重現短零段，並未解決                                                                           |
| 耳機自然音樂＋DSP＋OBS 負載              |    2 | 每格式請求等待 120 秒，含逐次查詢實際播放約 126 秒、錄音約 128 秒；逐十秒保存媒體時間、兩 context 狀態、錄製狀態與 OBS 統計，不外推完整場次 |

首組 16 個短音錄製中，5 案在起播外出現至少 16 samples 的雙聲道精確零段，範圍 10.00–31.33 ms；不是原生 loop／seek 案，WAV 與 FLAC 都有。首組無錄製前探針，不能把零段指派給 codec、耳機、Windows 或 OBS 的單一環節；錄音與失敗判斷保留。六次補錄則同時留 DSP 前四聲道、capture output 雙聲道的逐秒能量與精確零段，用來界定後續缺口，沒有把 running／frame counter 當無 underrun。自然音樂錄音兩格式各見數百個精確零段，最長約 73–75 ms；同批 source／capture 浮點探針未見精確零段，PCM16 的量化與輸出增益可將極低訊號變成零，不能把這些數量直接計成 dropout。來源浮點重採樣亦有超過 ±1 的樣本計數，並不等於訊號已截斷；錄音峰值約 0.102／0.107，未達滿刻度。JSON 的 clipped 欄位是閾值樣本數，不是失真診斷。

補錄六案中，來源四聲道均無相同精確零段；capture output 有 4／6 案的 10 ms 零段，OBS 錄音有 5／6 案。各自排除起尾的窗口不同，數量不能直接當一對一遺失；原始包絡／事件與錄音均保留。再以兩格式各三次，僅於研究工廠把靜音 monitor 也指定至同一耳機端點：6／6 案 capture output 與 OBS 都重現 10 ms 零段，來源仍無；每案 capture 穩定區有 11 段、OBS 有 12 段，約每 640 ms 出現。同端點對照沒有解決，不能把「不同端點時鐘」當唯一根因，也不提出改產品監聽路由當修補。證據已將至少一種短零段界定在來源之後、OBS 之前的 capture 路徑，且關閉 DSP、沒有 seek／loop 仍會出現；精確的 MediaStream bridge／Chromium／driver 原因仍未定位。

兩個自然音樂負載各收 12 個檢查點，兩 context 均 running、錄製 active；OBS render／output skip 計數均為 0，capture 浮點輸出與錄音未達滿刻度。這不證明無音訊 underrun、無失真或零 drift；統計包含探針成本，沒有接受為產品效能預算。

另以一秒 Hann 窗、0.1 Hz 搜尋、預設 ±0.4 Hz 檢查目標音高與左右分離；16 案中 9 案未滿足整組窄門檻。八個 DSP 案均含其中：Key +2 約 349.9／513.0 Hz，Key -2／tempo 1.1 約 278.2／407.6 Hz；相對理想值有約 0.6–1.2 Hz 偏差，不能改門檻後當全過。相同模式的 WAV／FLAC 頻率接近，不支持 FLAC 特有錯路由；也沒有證明 DSP 音高精度或聽感達標。另一個未通過的 WAV 耳機伴奏案同窗含短零段，頻譜偏移保留，不單憑窄窗推定裝置 clock drift。

工具失敗獨立保留：沙箱內啟動未留執行記錄；原生 launch 依 basename 開回既有 OBS、缺 cwd 的副本啟動顯示 locale error；查詢錯用 window_match_priority；首次 FirstRun=false 啟動仍收到 StartRecord 成功回覆卻未錄製，StopRecord 失敗且沒有檔案；重啟至 FirstRun=true 後恢復，支持首次設定路徑影響，但隱藏精靈未直接觀察，並未確診唯一根因。更正後每案確認 outputActive 並實際解碼，沒有拿 RPC 成功代替錄製成功。既有 OBS 只在閒置時關回本輪開始的未執行狀態。

使用者於 2026-10-30 回報兩段 A／B 未聽出異常，且先前測試聲確實由 Turtle Beach 發出。這補上本次短片的主觀聽辨與耳機發聲確認；不是盲測或聲學量測，也沒有否定自動量到的短零段與音高窄窗失敗。

仍缺：更廣自然音樂與轉場聽辨、聲學量測、原本選用裝置的精確路由、Voicemeeter B1／B2 與原 OBS 混音／AAC、裝置中斷與重選、更長實際場次及時鐘／失真根因。需要麥克風或混音錄製的案例另待確認實際來源後處理；目前沒有錄入其他程式或麥克風。

## 第六輪：capture bridge 與音高偏差分流

本輪沒有啟動 OBS 或操作既有 App；沿真 graph 工廠，在伴奏雙聲道 bridge 前、capture 的 MediaStreamSource 後、mix、output 各放觀測點，探針後另接零增益以免發聲。補 4 個 smoke、24 個矩陣、8 個 trace／DSP 診斷及 2 個真 factory trace，共 38 案；每 lane 留三秒原 Float32，合計 131 個雙聲道窗口；完整內部精確零段逐樣本重算與 worklet 記錄一致。4 個窗口含左邊界截斷零段，未驗證其完整起點；窗口外統計依 worklet 收據，並非全程原 PCM 複算。探針原始碼、執行快照、PCM 與 trace 留本機，公開數據只留匿名值／SHA。既有 JSON roots、失敗判斷與使用者短片聽辨回覆相同，第六輪保存 PCM 的 SHA 核對相符。這不代表全部歷史現場可精確重播：部分早期工具失敗缺完整 runtime log，第五輪錄音 summary 缺錄製時 SHA，第六輪亦未凍結全部分析程式版本；目前未發現資料遭竄改。

### 10 ms 零段

原始四聲道 PCM 的前 20 秒，同時檢查 accompaniment L/R 與全部聲道，均沒有至少 16 frames 的共同精確零段，在本次受測來源與保存窗口排除「導唱仍非零而掩蓋伴奏空白」的觀測盲點；不能回填第五輪各段未保存的伴奏 PCM。真 factory 的 bridge 前伴奏同樣沒有對應零段；出現時已在 post-bridge MediaStreamSource，dry mix／output 的共同 frame 範圍一致，不需 Key、tempo 或 OBS 才發生。

本節「無零段」只指有資料期間，雙聲道共同精確為零、至少 16 frames，且完整段落嚴格位於各自 origin 後兩秒至 end 前一秒的穩定區內，未命中此判準；48 kHz 的 16 frames 約 0.333 ms，並非 10 ms 門檻。這不涵蓋單聲道失效、非零填補、重複／缺失內容、click 或無資料；探針遇無 input 直接返回，gaps 為 0 也不證明完整 coverage。

| 不開 trace 的對照                                                  | 穩定區觀察                                                                                    |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| factory、monitor／capture 同耳機端點                               | WAV／FLAC 的 bridge 後各 3／9 段，前方皆 0；以 10 ms 為主，WAV 含 20 ms，並非每輪固定相同數量 |
| factory、monitor none／capture 耳機                                | WAV／FLAC 的 bridge 後各 7／8 段，前方皆 0；最長約 10.02 ms                                   |
| factory、預設 monitor／capture 耳機，或兩端 none                   | 此批兩格式皆未重現；不以未重現抹去前輪／同端點失敗                                            |
| 最小 oscillator 跨 context、同耳機端點                             | bridge 後 15 段 10 ms，前方 0；不依賴 codec、HTML audio 或 DSP                                |
| 同一 context 的 bridge、直接 oscillator，或跨 context 的 none sink | 此批穩定區未重現；不代表可移除產品獨立目的地或以 none sink 驗收硬體                           |

trace 只限自有 main／renderer 的 mediastream 類別。第一組最小跨 context trace 兩案各記 16 次 underrun，但全在前 1.6 秒內，排除前兩秒後沒有重現零段；這個反例保留，不能直接拿來證明穩定期根因。另補真 factory：WAV／FLAC 穩定區 bridge 後各 8／10 段，前方皆 0；同次 trace 總計 56／62 次 underrun，其中首次 ProvideInput 兩秒後仍有 20／24 次，皆缺 480 frames。factory 有兩條 bridge，且 trace／PCM 原點與起尾範圍不同，不將次數直接一對一對齊。

[匹配 Chromium 150.0.7871.250 的來源](https://github.com/chromium/chromium/blob/150.0.7871.250/third_party/blink/renderer/modules/mediastream/webaudio_media_stream_audio_sink.cc)中，WebAudioMediaStreamAudioSink 在 FIFO 不足時會將該次 audio bus 清零，並記錄本輪實際看到的 ProvideInput underrun 事件。同案晚期 underrun 與來源支持 FIFO 缺料是其中一種造零機制；第六輪尚未逐段對齊，兩個 trace 物件亦未映射至伴奏／導唱，尚未確診 producer／consumer 為何失配，不能只歸因不同硬體時鐘、driver、CPU 或單一 C++ 分支上游原因。trace 也可能改變排程；未做無探針長場次、聲學延遲或逐段絕對時鐘對齊。

### 音高窄窗

舊 16 段錄音保留原一秒／±0.4 Hz 失敗結果，另取 0.25／1／2／3 秒共 80 窗，以補零 FFT 峰值及同一 PCM 的另一種 band-phase slope 估計交叉檢查。80 個重疊窗口來自 16 段錄音，不是 80 次獨立實驗；兩法均有頻帶與訊號前提，補零也沒有延長觀測。原 PCM 與不經 DSP 的 oscillator 校準約為 311／457 Hz；Key +2 左聲道偏差在二至三秒窗仍約 +0.76 Hz，不能只歸咎一秒窗口。

| 不經 bridge 的直接 DSP 對照              | 左／右 FFT 誤差 Hz（相對理想倍率）                   |
| ---------------------------------------- | ---------------------------------------------------- |
| 預設、Key +2、單音 stereo 311／457 Hz    | +0.759／+0.045                                       |
| 預設、Key -2、單音 stereo 311／457 Hz    | +1.180／+1.314                                       |
| 左聲道另加 997 Hz                        | 左側偏差仍約 +0.759／+1.180，不能歸因該額外音        |
| Key +2，tonalityHz 改 0／左右皆改 311 Hz | 左側仍約 +0.759／+0.753，未消除                      |
| 僅診斷用 240 ms block，Key +2／-2        | +0.587／+0.156；+0.185／-0.022，並非全部恢復原窄門檻 |

這組不經 HTML media、codec、bridge 或 OBS 的對照，將至少一部分偏差縮至現行 Signalsmith 1.3.2 預設處理路徑；長窗 FFT 與 phase slope 對乾淨直接輸入相符，但仍未定位到 WASM 內部唯一演算法原因。[官方 Web Audio 介面](https://github.com/Signalsmith-Audio/signalsmith-stretch/blob/main/web/release/README.md)提供 block／tonality 設定；本輪只在隔離工廠作控制，沒有改產品 preset、接受更長 latency 或提出 240 ms 修補。

factory 的 tempo 1.1 在 DSP 前已量到約 311.066／456.148 Hz，兩格式相近；下游另有 bridge 中斷與側帶，部分 FFT 峰與 phase slope 判斷不一致，不能把每個下游峰值都當唯一基頻，或把整體偏差全算給 DSP。獨立複核的時間域過零回歸支持乾淨單音直接 DSP 偏差；雙音、側帶或中斷時估計器仍可能失效，不能視為無前提音準真值。±0.4 Hz 在不同頻率代表不同 cents，是本研究原診斷門檻，並未成為產品音準／聽感 gate；使用者先前未聽出短片異常的回覆保持原範圍。

本輪將受測零段定位到跨 context bridge 路徑；同案晚期 underrun 與對應原始碼支持 FIFO 缺料是其中一種造零機制，尚未逐段對齊或確診上游失配原因。乾淨輸入的部分音高偏差縮至直接 DSP；兩者分開保留未解項，不歸因為 FLAC 特有問題，也沒有把反例或診斷參數升格成產品修復。

上述 4／6、5／6 與 WAV 3 段／FLAC 9 段等僅描述本機固定順序、各自窗口，不估計故障率或證明格式品質等效。兩格式共同重現只支持「未見 FLAC 特有原因」；第五輪程序錄音與第六輪靜音工廠也不能拼成正常使用者完整路由驗收。

## 第七輪：實際 FIFO 供給／消費排程

本輪把供消機制縮到可驗證的容量界線：在本機耳機路徑，bridge FIFO 可容納 2400 frames，但有些消費批次在沒有新供給插入時會連要六包、共 2880 frames。即使起始 FIFO 全滿，仍必然缺一包；這組條件下不只是「有看到 underrun，但原因不明」。原生回呼為何成批，仍未定位到 driver／OS／Chromium service 的唯一上游原因。這是最小 Web Audio 工廠的診斷，沒有修改產品 graph 或將診斷設定當修復。

2 個初始 smoke、2 個乾淨 smoke、19 個排程矩陣、2 個靜音／極低增益、3 個端點及 2 個不掛 worklet 的 trace，共 30 案。28 案各留 source／dest 三秒 Float32，合計 56 個雙聲道窗口、112 個 channel SHA；完整內部精確零段逐樣本重算與探針一致，4 個窗口另含左邊界截斷段，未驗證完整起點；窗口外仍依探針收據，source 穩定區皆無對應零段。最後兩案刻意不建立 AudioWorkletNode，只留 trace，不聲稱有 PCM 驗證。全程沒有操作既有 App、錄製 OBS／Mic、遷移音訊或變更系統音量。

### 容量與批次

以實際 FIFO free-space counter 加上 ProvideInput 2 的讀取前庫存反推，interactive 消費端為 2400 frames，playback hint 消費端為 4800 frames，與[匹配版本容量公式](https://github.com/chromium/chromium/blob/150.0.7871.250/third_party/blink/renderer/modules/mediastream/webaudio_media_stream_audio_sink.cc)一致。480-frame 媒體包與 128-frame render quantum 不同；例如 19 次 render 拉取（2432 frames）會在部分狀態觸發六次 480-frame input 讀取。

原生耳機路徑雖每次 Render 回呼帶 480 frames，trace 顯示常以四至五次回呼集中到達，批次間隔約 40–50 ms，並非每 10 ms 均勻交付。當六包消費期間沒有 OnData 插入，最多五包的 bridge FIFO 不夠；同一 context 的控制則會在消費期間穿插供給，不能套用相同缺料界線。依批次初始庫存與讀取次數計算的缺料數，在本批 3844 個「無供給插入」區段均與 trace 一致；代表性條件改用 0.5／1／2 ms 分群亦保留結果。這是條件式供消帳務核對，不是任意裝置或未來場次的品質保證。

| 單 bridge 排程控制                        | 兩輪 dest PCM 零段數 | 觀察                                                                                         |
| ----------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------- |
| interactive，先供給／先消費；另錯開 40 ms | 每案 11–12           | 改啟動順序與要求的相位間隔沒有消除穩定期問題；實際 resume 時刻另存，未將要求值當精確硬體相位 |
| 僅供給端 playback hint                    | 22／22               | 供給批次更大，但消費端容量仍 2400；full 與 underrun 都增加                                   |
| 僅消費端 playback hint                    | 1／2                 | 容量增至 4800，問題減少但未一致消失；另一次關 trace 控制為 0，反例保留                       |
| 兩端 playback hint                        | 0／0                 | 只表示本次十秒控制未重現，不接受為產品 latency 設定或修補                                    |
| 同一 context                              | 0／0                 | 供消可穿插；產品仍需獨立 monitor／capture 目的地，不能據此合併                               |

另三案關 trace 時，baseline／僅供給 playback／僅消費 playback 的 PCM 零段為 11／22／0。trace 用共同 performance 標記排除起頭兩秒與結尾一秒，PCM 各自依 context frame 排除，因此部分計數差一或合併成較長零段，不能直接當事件遺失。零段結束的 port 通知也可能晚到下一批，約 40 ms 的通知差不能解讀成聲學延遲。

### 端點與觀測器控制

靜音與兩端極低增益（.01）控制都重現八段，沒有因輸出非零而消失。AUX→AUX 沒有穩定期 full／underrun，AUX→耳機為 8／8，耳機→AUX 為 12／13；後者 PCM 為 12 段，範圍不同且可能合併，不硬配成一段一次。source 仍無相同零段。AUX 路徑大多逐次交付，耳機角色的原生 AudioOutputDevice Render 已有四／五次一批；[AudioDestination 來源](https://github.com/chromium/chromium/blob/150.0.7871.250/third_party/blink/renderer/platform/audio/audio_destination.cc)與 trace 的 Render／RequestRender 分層，讓「全是 AudioWorklet 排隊才發生」缺乏支持，但仍不確診哪層造成上游批次。

這裡的原生回呼指 Chromium AudioOutputDevice／AudioDestination trace，並非直接量到 WASAPI／driver 回呼。delay_timestamp 會在同一批內重複，無法唯一配對的個別原生／worklet 回呼保留為未配對；只在候選 thread 唯一時比較 thread 層級分群，沒有捏造逐回呼延遲。兩案不掛任何 AudioWorkletNode，trace 中 SetWorkletTaskRunner 為 0；耳機仍有 8 次 full／8 次 underrun，AUX 為 0／0，支持此供消問題不依賴探針啟用雙執行緒。這兩案沒有 PCM 零段數或新人工聽辨結論。

### 收據與範圍

逐欄重核前輪十個 FIFO-full 欄位，與原 trace 全部一致；真 factory 原本即為 26／32。本輪曾口頭判成大小寫漏計，該說法撤回，舊 JSON 沒有更正或覆寫。初次 Vite 掃描無關 fixture 的警告、連接埠防護擋下過早啟動、以及大型 trace 匯出等待 325082 ms 都保留；匯出最後完整保存，準備停止時防護發現進度已前進，未執行 Stop-Process。

這輪支持「本機原生回呼批次與 bridge FIFO 預算不匹配」作為已重現的供消原因；未將其外推為所有端點、driver 或長期 drift 的單一根因。所有 latencyHint／同 context／低增益只用於隔離研究，不改產品；直接 DSP 偏差仍沿前輪未解範圍，不在這輪混合歸因。FLAC 5 維持候選，正式 gate 不動。

### 獨立複核後的單事件對齊

先離線使用既有第七輪的兩個靜音／低增益與三個端點案例，沒有重跑矩陣或新增發聲。每案只建立一條可辨識的 oscillator bridge，沒有導唱 bridge，故不把身分回填至第六輪的兩個未標名 factory 物件。

以暫停 context 的 frame 0 為原點，按順序累計每次外層 ProvideInput 的 128 frames，再加內層 delay (frames)，預測清零包在消費 context 的位置；沒有用零段反向擬合 offset。匹配版本的 [AudioPullFifo](https://github.com/chromium/chromium/blob/150.0.7871.250/media/base/audio_pull_fifo.cc) 以已寫入的 write_pos 回呼，[AudioConverter](https://github.com/chromium/chromium/blob/150.0.7871.250/media/base/audio_converter.cc) 在同為 48 kHz、無 resampler 的本案傳遞此偏移。每個 underrun 依同 pid／tid 的完整父事件唯一歸屬；每案外層總 frames 與 context 終點相等。共同 performance 標記的檢查點與已完成拉取計數相同，或落後一個 128-frame quantum；快照先於標記且兩執行緒並行，不將此差視為精確 wall-clock latency。

五案共 114 次 underrun，合併相鄰清零包後的 62 段與各案 worklet 完整零段起尾完全一致，包含啟動期。保存三秒 PCM 內的 24 段完整事件另逐樣本核對：左右皆精確零，前後相鄰樣本恢復非零。例：靜音案例消費 frame 117600–118080，預測與原 PCM 均為同一個 480-frame 零段；不是只比零段數量或 port 通知到達時間。這在這五個單 bridge 工廠案例完成具體 underrun → 零段對齊，仍不宣稱第六輪每段歷史零段皆已確診。

本次亦重算第七輪 56 個 PCM 窗口邊界：4 個消費端窗口左邊界截到零段（兩個 448、兩個 384 frames），未驗證完整起點；完整內部段一致的原結論保留。其餘窗口外仍依 worklet 收據。舊未保存 PCM／包絡的定位案例維持未解。下一個缺口是相同情境交錯 trace 開／關與探針有／無的觀測擾動對照；本次離線對齊沒有補成這項驗收，也沒有診斷原生回呼批次的唯一上游原因。

## 離線補充：DSP 與 FIFO 分流成果

本節收斂並行研究的最新結果，不覆寫前六輪數值。工具、原 PCM／heap／trace、失敗與完整執行收據留本機，匿名摘要與 SHA 收於同份研究 JSON 的 parallelResearchConsolidation；本機工具不作產品依賴或狀態來源。

### 原版 DSP 相位與映射

Signalsmith Stretch 1.3.2 原發行 module SHA 與第六輪快照相符。來源鏈補正：發行 commit 的 CMake 指定 Linear 0.1.2，解析至 fa5dbc0abfbd161e9a9cc10a7b418fa9dfc83a45；這補上依賴 pin，仍非完整 Web build 可重現證明。同一未修改 WASM 的 48 kHz、120／30 ms 配置直接讀得 FFT 6144、3072 bands，頻率座標為 (b+0.5)×48000／6144；唯讀 heap 探查與無探查輸出逐 byte 一致。

block 與 interval 各自影響結果且有交互作用；240／30 ms 在本批 ±2 達原診斷門檻，不接受為產品修補。mono 311 Hz、+2 仍偏高約 0.75347 Hz，另一側 457 Hz 只增加約 0.00577 Hz；交換聲道後偏差跟頻率走，四個初相位結果接近。這些對照不支持聲道耦合或初相位是必要條件。

固定 mono、120／30 ms、+2 的三案：輸入 308.59375／311／316.40625 Hz，三秒穩定窗口輸出誤差約 +0.875684／+0.753465／+0.247433 Hz。兩個輸入 bin 中心案的 peak／anchor 已接近正確，仍有偏移；原狀態相位更新重算與保存值最大差約 1.57e-7 rad，最終相位與外部估頻一致。故單以輸入 off-bin 或峰重心估錯不足以解釋，優先查映射後的複數相位預測與頻率方向合成；尚無分支消融，不指定單行 bug 或修復方式。

下一個最小對照是保持原 WASM／設定，輸入 347.65625／2^(2／12)，約 309.726507478 Hz，使理想輸出位於 bin 44 中心，保存同樣 peak／map／phase 及 probe／control。純音診斷不代替自然音樂、起播／轉場或聽感 gate。

### FIFO 帳務與原生接入前置

獨立離線分析把第六輪十份 trace 中的七條 sink bridge 分開，依 counter mutation timestamp 重建供消帳，七條均閉合，容量皆為 2400 frames。factory 規律批次會在無成功供給插入時要求 6×480 frames，超過滿載容量；另有少量 underrun 後 4–31 µs 才寫入的交錯事件，兩類分開，不將全部缺料只歸給平均 CPU、mutex 或不同硬體 clock。B0／B1 只標示 trace 內物件順序，不視為伴奏／導唱標籤。

固定事件序列的反事實模型可精確重現原帳務；增加模型容量可移除規律主體，卻不保證全部交錯缺料消失，不能據此提出擴 FIFO 修補。離線工具已涵蓋 ring／FIFO／單時計、manifest／asset SHA／PCM／跨來源對時、scheduler／ready 重播與跨 run 收據；合併 46 項測試通過，只代表工具鏈及合成資料契約，不代表原生實驗完成或歷史根因已證明。

目前沒有固定版本 native writer／ETL exporter、真 dispatch／availability 與完整時鐘誤差來源。先完成接入及 smoke 資格再跑原生矩陣；本輪不安裝／編譯診斷 runtime，不把離線摘要旗標或 render 進度差當硬體 clock drift。先用既有隔離 Electron 工廠補同情境 trace／probe 交錯對照，避免直接擴成全面原生實驗。

## 採用建議與下一個決策門檻

研究建議：優先單檔四聲道 FLAC 5，保留 WAV 回退；暫不採 Opus 作主要衍生音訊，也不拆成兩個播放 clock。這是後續實作候選的選擇建議，還沒有正式 codec 決策或產品啟用。

若後續另獲實作授權，先只考慮新結果 opt-in；驗證 manifest／副檔名 allowlist、media MIME／Range、分離 worker／封裝、BGM／播放／Queue 保護及清理後，再以實際發聲位置、冷 cache／長曲 seek、capture／OBS／負載品質訂准入門檻。原曲與原曲綁定保留。已有結果的遷移不在本輪：必須另設 staging、容量預算、驗證、原子 manifest 切換、取消與失敗回復，不能覆寫正在播放的檔案或把批次轉檔當安全遷移。

本輪沒有修改產品程式、gate、現有音訊或產品設定；只更新研究文件與匿名數據，隔離工具／音訊不隨專案分發。已補程序冷啟動、重採樣／playing seek、DSP 穩定窗口、實際輸出端點與隔離 OBS 錄製；這些案例不能合併成全部驗收通過。

未結案項目分開保留：原未留樣本的單一定位案、原生 loop／seek 來源零段與時序變化、這次 DSP 關閉亦重現的 capture 零段及音高窄窗檢查。聲學量測／混音、更廣自然音樂與轉場聽辨、首 frame 精度、真正磁碟 cold、更長場次與更廣曲目仍待驗；遷移另需失敗復原設計。FLAC 5 維持候選，沒有升格成正式採用。
