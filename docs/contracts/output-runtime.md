# Output Runtime 契約

Output server、投影傳輸與 Browser Source 頁面生命週期。決策見 [ADR 0012](../adr/0012-state-convergence-and-startup-phases.md)；外觀見 [Output 外觀契約](output-appearance.md)；未來 pack 見 [Overlay pack 規劃](overlay-pack.md)。

## 權威

- Renderer audio element 是播放時間與狀態的權威；Queue 與目前歌詞仍由既有 renderer owner 持有。
- Main 擁有 service lifecycle、投影驗證／快取、Output clients、外部連線與 diagnostics；不從 vendor 事件或持久化快照重建播放狀態。
- 單一 main reconciler 套用持久化的期望狀態；renderer 只送 intent，不跑另一個自動啟動迴圈。

## 投影 envelope

Renderer 的投影帶 `contractVersion`、main 發的 `bootId`、renderer 發的 `sourceEpoch`、`full`／`update` 種類與單調 revision。

- `bootId` 每個 main process 生命週期更換；`sourceEpoch` 在插值連續性失效時更換；revision 依 boot、epoch 與 stream 各自遞增。
- 未知 epoch 的 update 不能初始化狀態；未知 contract version fail closed。Main 在快取或廣播前重新驗證每個投影。
- Payload 只含 canonical id 與 scalar 顯示資料，不含路徑、credential 或 vendor 物件。

## 狀態

- **Service**：`stopped → starting → listening → stopping → stopped`，任一操作可進 `error`。`listening` 只表示 loopback socket 可接受請求。
- **Source**：`unavailable → syncing → ready`，renderer 斷線或 epoch 無法完成時為 `stale`。只有目前 boot 的有效 full 投影能進 `ready`。Renderer 重新載入、結束或崩潰即標為 unavailable，下一個生命週期須重新完成 full handshake。
- **內容**：每個 lyrics document、模板與資產為 `unknown`／`resolving`／`ready`／`fallback`／`error`；fallback 記錄實際版本與原因。
- **Client 觀測**：連線數、最後交付 revision 與時間；不宣稱 client 是 OBS，除非 OBS adapter 獨立證明。

## 啟動順序

- 同步 bootstrap 只做 app name、single-instance、scheme 註冊、最小設定、安全政策與 diagnostics；不列舉曲庫、不探索 provider／model／字型、不檢查更新。
- 建立視窗不等待 Output listener 或曲庫列舉；migration 先比對版本，需要時才讀曲目。
- Renderer 在 App mount 後才開始 hydration，待 player、queue、曲庫、playlist 與目前歌詞就緒後送出一次 full 投影。
- Listener 可在 source ready 前啟動，此時 Browser Source 收到 unavailable 的空投影，不顯示舊內容。
- 更新檢查與 adapter 探索在 shell 可互動後才開始；字型、GSAP 等只在使用中的 surface 需要時載入。

## 傳輸

- 四個 OBS URL 不變。內建 overlay 協商 `utawakui.output.v3` subprotocol；不帶 subprotocol 的 client 與 `/api/v1/state` 保留 snapshot v2；未知 subprotocol 直接拒絕。
- V3 只在 canonical 值改變時送 `lyrics.document`、`queue.document`；動態 `state.snapshot` 帶時鐘、phase、延遲、曲目 scalar 與內容 reference。連線時依序送設定、內容、狀態；引用未知內容的狀態 fail closed。Socket 唯讀，overlay 不能請求內容或傳入命令。
- 每個 client 一個 in-flight send 與有界 pending slot：時鐘修正 latest-wins，新語意狀態取代舊時鐘修正，內容排在使用它的狀態之前。逾時或持續超過 high-water 只斷開該 client。Diagnostics 只記總數與 bytes，不記曲名、歌詞或 payload。
- HTTP：health／state `no-store`；runtime HTML／JS／CSS 用 strong ETag ＋ `no-cache`；封面以 track id 指標重新驗證後轉址到 SHA-256 digest route，該 route 一年 immutable。都不接受檔名或路徑。
- Server 只綁 `127.0.0.1`，exact route allowlist、明確 media type、`nosniff`、restrictive CSP。
- Port 衝突是可觀測錯誤，不自動換 port；Output 失敗不能停止本機播放。

發布時鐘必須配對：`usePlayer.samplePlaybackClock()` 在同一同步區段取得實際 audio position、rate、event phase、track／continuity 與 `sampledAt`。Publisher 先完成內容傳送，再確認當前 continuity 與 lyrics／music-structure／queue 文件 identity 仍等於該次投影；已失效則跳過舊 state，排入最新投影。通過後才重新採樣、重建當前動態資料與內容 references，將該 sample 的時間作為 `generatedAt`。拒絕後的 full retry 也重新檢查及採樣，不能只替舊位置換新時間。手動演出項目保留自己的零位置／倍率投影。Wire schema 與 client 既有外推規則不變，不以這項修正宣稱硬體或 OBS 零延遲。

## 只讀輸出視窗

控制台「畫面輸出」的「開啟輸出視窗」只傳 `lyrics`／`setlist`／`now-playing` intent。Main 每次開啟重查 `public-output-flow`，從正在執行的 loopback server 與已正規化 slot 推導既有 canonical URL、模板內容尺寸與固定視窗名稱；不接受 renderer 提供 URL、路徑、尺寸或標題。尚未啟動服務時不自動啟動。

| 種類   | 固定視窗名稱          | 內容尺寸                               |
| ------ | --------------------- | -------------------------------------- |
| 歌詞   | Utawakui 輸出｜歌詞   | 1920×1080                              |
| 歌單   | Utawakui 輸出｜歌單   | 480×810                                |
| 播放中 | Utawakui 輸出｜播放中 | Art Card 480×270；Cover Player 480×540 |

`electron/main/windows/outputWindow.js` 每種最多保留一窗；重複開啟會 restore／show／focus。名稱不隨頁面 title、曲名或模板變更，slot 更新依既有尺寸契約調整內容；Windows 建窗可能先依 work area 裁小，建立後再明確設定 content size。原生框架只供移動、最小化與關閉，不允許手動 resize／最大化／全螢幕；FHD 加上框架可能超出目前螢幕工作區，OBS 應擷取 client area。

視窗直接使用現有 Output 頁面，不新增 renderer entry、播放器、設定副本或模板。它沒有 preload，使用獨立非持久 session，拒絕 permission、popup、外部 navigation／redirect 與下載，關閉 DevTools／Node／webview，保留 sandbox／context isolation／web security，並靜音。`output-window:open` 只接受目前控制台 main frame；提詞器或 Output 不取得控制能力。錯誤在 main 保存私有原因，IPC 只回 bounded、可重試錯誤。

服務停止／重啟前銷毀所有輸出視窗；主視窗實際關閉與 App 退出也清理。主視窗隱藏至 Tray 不停止輸出。重啟服務後要重新按開啟，不自動彈窗；手動關閉或 renderer failure 後可重試。Browser Source 與 Spout 維持獨立生命週期。

這是原生框架、不透明黑色 substrate 的視窗；模板本身、動畫與透明 CSS 不變，但此交付方式不承諾 OBS alpha。`backgroundThrottling: false` 也不代表最小化後 OBS 一定繼續取樣。Window Capture 的環境相關行為與人工結果統一記錄於[W3 視窗擷取短測](../operations/output-appearance-acceptance.md#w3-視窗擷取短測)，不由視窗設定推定通過。

## Browser Source 頁面生命週期

固定頁面入口為 `/overlay/lyrics`、`/overlay/now-playing` 與 `/overlay/setlist`。Lyrics 的本機檢視直接在同一入口加上有界的 `workbench=1`、`guide=0/1` 與 backdrop 選項，不另包一層 Workbench iframe 頁面。`overlay/assets/streamer-guide.png` 是檢視模式與 renderer 無 runtime fallback 共用的唯一圖片來源；HTTP 僅開放該明列資產，不開放資料夾。

| 模組                          | 責任                                                                      | 不持有                            |
| ----------------------------- | ------------------------------------------------------------------------- | --------------------------------- |
| overlay/shared/lifecycle.mjs  | 每頁單一 host；pagehide、visibility、reduced motion、字型通知；啟動與清理 | 播放時鐘、revision 規則、動畫配方 |
| overlay/shared/runtime.mjs    | 唯一 WebSocket、重連退避、split documents、boot／epoch／revision 收斂     | DOM、模板 timeline、本機資產      |
| overlay/shared/appearance.mjs | 設定投影與 FontFaceSet 通知                                               | 字型下載或列舉                    |
| 各 route boot adapter         | 把 host callback 交給既有 scheduler／controller                           | 新的全域播放器                    |

- `createOverlayHost()` 在 `start()` 才訂閱與連線；重複 start 無作用，dispose 冪等且不可再 start。Pagehide 依序移除訂閱、執行 route cleanup、停止 connection；cleanup 拋錯仍須停止 connection。換模板不重建 connection。
- 頁面可見、transport 已連線且收到該連線的新 snapshot 後才 active；不恢復上一條連線的舊內容。隱藏時停止 scheduler 與量測，只保留最後 snapshot，恢復時只交付最新一份，不補播隱藏期間換曲。
- 曾呈現後的恢復以 `recovering` 交給 adapter：Lyrics 以當下時間靜態收斂一次；Art Card 與 Setlist current 以 settle 跳過舊動畫；Setlist history 依最新幾何重建分頁。
- Reduced motion 用原生 `matchMedia`，不依賴 GSAP。字型不等待 ready 才畫首幀，不讀字型 bytes；載入失敗走 CSS fallback。
- 只接受目前 socket 的事件；已取消的 snapshot／重連 timer 即使已排入佇列也不執行。
- Source unavailable／syncing 的空態照常投影，不借示範資料填補。

## 效能量測

Lyrics scheduler 的下一起點是絕對 deadline。Presentation／fit／DOM commit 的同步耗時須從剩餘等待扣除；準備或 commit 期間跨界時按同 snapshot 的當前時間重投影，不能提交舊時間狀態後再等完整舊 delay。每輪最多兩次同步追趕，仍跨界則讓出執行權到單一立即 task；generation、snapshot identity、stop／suspend 阻止舊 callback 提交或清掉新 timer handle。

Focus 的首次樣式準備只讀取既有 current 容器與樣式。它是設定／字型／活動變更後的可取消工作，不提前寫未來歌詞、不產生可用 fit plan、不等待字型或阻擋播放；正式尺寸量測、長句容量與 unfit 恢復路徑照舊。來源或尺寸失效不允許借用不適用的計畫，T1+ 分段起點仍立即提示。

T1+ 可選 `estimatedFineTiming` sibling 傳送經驗證的模型單位起訖與來源範圍，與原 `estimatedStarts` v1 分開。Main 先保留粗資料的 ID／數量，再驗細資料；不合法或超出剩餘數量的細資料降級為原提示，發布端也避免細資料擠爆文件 bytes。舊 reader 忽略新 sibling。Focus 以分段底線保留即時提示，另用原模型起訖連續填色；不按相鄰起點補唱完時間。填色只更新局部 paint，配合同一投影時鐘與既有 displayDelay hold，沒有逐幀 IPC、量測或平滑等待。字內小格只屬原單位進度的顯示內插，不能當作新逐字時間；原生 T2 與其他模板行為維持。細節見[聲學估計契約](lyrics-acoustic-estimate-contract.md)。

正式歌詞 URL 加 `lyricsTrace=1` 可啟用診斷；`readLyricsPerformanceTrace()` 只回傳當頁記憶體內的數值事件、起始時鐘對照及 dropped 數，最多 4096 筆。事件與欄位有白名單，不含歌詞、檔名、路徑或來源 id，不逐幀寫 console。預設沒有 stage clock／trace 事件成本。這些是 JS 處理時間及 DOM commit 診斷；rAF 觀測、Chromium paint 與實體畫面／OBS 延遲不可混稱。

追蹤以明確 flag 啟用，main、renderer、Output 與 overlay milestone 共用同一時鐘並寫入有界 JSONL。封裝版基線見[啟動效能基準](../operations/startup-performance-baseline.md)；硬體、儲存、曲庫規模、OBS 程序、GPU 記憶體與多實例尚缺代表性證據，因此回歸預算尚未設定。

## 驗證

- 啟動：停用／啟用、listener 與 renderer 先後順序、唯一 full handshake、update-before-full 拒絕、舊 boot／epoch 拒絕、重新載入／崩潰後 unavailable、無無條件曲目列舉。
- 傳輸：慢 client、多 client、重連、延遲變更、內容 revision；不記錄投影內容。
- 頁面：重複 start／dispose、訂閱與 timer 清理、reduced motion、遲到字型、舊 socket、latest-only 恢復。可見結果記錄於 [Output 外觀驗收](../operations/output-appearance-acceptance.md)。
