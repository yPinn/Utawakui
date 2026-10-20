# Output 共用 host 生命週期

F2，2026-10-20。三個 Browser Source route 共用頁面生命週期；模板欄位與設定來源仍依 [F1 顯示契約](output-appearance-baseline.md)。
本次不改 CSS、藝術配方、預覽樣本、付款或 gate；F3 預覽一致性尚未執行。

## Ownership

| 模組                          | 責任                                                                                                          | 不持有                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| overlay/shared/lifecycle.mjs  | 每頁單一 host；pagehide、visibility、native reduced motion、字型通知；啟動／清理與 inactive 期間最新 snapshot | 播放時鐘、identity／revision 接受規則、動畫配方或模板設定 schema |
| overlay/shared/runtime.mjs    | 唯一 WebSocket、重連／退避、split documents、boot／epoch／revision 收斂、延遲快照及 trace frames              | DOM、模板 timeline、使用者圖片／字型存取                         |
| overlay/shared/appearance.mjs | 既有設定投影；FontFaceSet ready／loadingdone／loadingerror 通知                                               | 字型檔下載、列舉本機字型、字型 store 或新的字型選單              |
| 各 route 的 boot adapter      | 將 host callback 交給原有 scheduler／藝術 controller；必要量測及清理                                          | 新的全域播放器或共用萬用 timeline                                |

`createOverlayHost()` 建立 connection，但在 `start()` 才接訂閱／連線。重複 start 無作用；dispose 為冪等，已清理 host 不可再 start，需要新頁面／新實例。
pagehide 移除 host 的 visibility／motion／font／pagehide 訂閱，執行 route cleanup，再停止 connection；即使 route cleanup 拋錯，仍須停止 connection。
Connection 不因換模板而重建。新增 lifecycle 模組由 exact static route 提供，沿既有 overlay 封裝 glob 交付，測試與 F1 fixtures 不進封裝。

## 可見性、斷線與恢復

正式輸出只有在頁面可見、transport 已連線且收到該連線的新 snapshot 後才 active。
WebSocket open 只表示 transport 可用，不據此恢復前一次連線的舊內容／timeline。斷線清除 host 暫存；runtime 仍負責 identity 與 revision，而非 host 自行判斷哪個 boot 較新。
隱藏時停止必要的 scheduler／量測／controller 工作，收到更新只保留最後 snapshot；恢復可見後只交付最新 snapshot，不逐一補播隱藏期間換曲。
Source unavailable／syncing 的空態仍由 runtime 產生並照常投影，不借 preview sample 填補正式空態。

初次呈現沿原有動態路徑。曾呈現後的恢復以 `recovering` 標記交給 adapter：

- Lyrics 保留既有 boundary scheduler；清除舊動畫並以恢復當下 canonical 時間靜態收斂一次，再正常消費後續 frame，不重建播放權威。
- Art Card 在原 controller 的 `update` 增加 settle 選項，取消舊換封套 timeline，先提交最新 frame；原有正常進場／換曲／播放旋轉 recipe 不變。
- Setlist current 同樣用 settle 跳過舊切歌；history resume 的 reset 選項依最新幾何重建分頁，不接著播放舊 reveal。原有分頁停留、移動與 reduced-motion fade 參數不變。
- Setlist 量測在 inactive 時取消 rAF，ResizeObserver 通知不再排新 rAF；恢復清掉舊 reveal intent，重新量測；dispose disconnect observer，之後 schedule 不再作用。

Preview 保留原有明確 sample fallback 與離線可見語意；可見性仍由 host 管理。不改 F3 才處理的 Gallery／Workbench 資料一致性。

## Reduced motion 與字型 fallback

Host 使用 native `matchMedia('(prefers-reduced-motion: reduce)')` 取得初始值並監聽 change；支援舊 addListener／removeListener 對稱清理。
這條通知不依賴 GSAP 存在。route 把偏好交給既有 renderer／controller 的 reduced-motion 分支，不另造 CSS 或變更動畫參數。

字型觀察不等待 ready 才畫首幀，也不呼叫 FontFaceSet.load 或讀字型 bytes。
ready resolve／loadingdone 只通知必要 refresh／量測；ready reject／loadingerror 走既有 CSS fallback，缺 FontFaceSet 也能繼續使用。
inactive 時延後量測通知；dispose 後忽略遲到 Promise，移除事件 listener。通知不改 track、position、document identity 或設定值，也不保證 fallback 字型與原字型字形相同。

Live Stage 的本機字型描述與控制台權限沿 F1；OBS 未安裝相同字型仍靠原有 family fallback。字型檔／自由圖片匯入沒有因 F2 而新增。

## Connection 清理與競態

只接受目前 socket 的 open／message／close；斷線與 stop 移除該 socket listener，已排隊舊 callback 也不能觸發新重連或舊 snapshot。
延遲 snapshot timer 取消後，即使 callback 已進事件佇列也不交付；重連 timer 同樣驗證目前 token。stop 清理 snapshot／reconnect timers、split cache、socket 與啟用中的 startup trace rAF。
既有 V3 content-before-state、display delay、boot／epoch 與 source readiness 語意保持不變，未新增外網連線或接受任意 route。

## 驗收邊界

相鄰 tests 驗證重複 start／dispose、訂閱與 observer／timer 清理、native motion 初始／切換、遲到字型、舊 socket 與取消 timer、恢復 latest-only 及 controller settle。
F1 固定基線維持不漂移；純測試不能替代可見畫面。當輪 Electron 畫面、環境與限制見[八模板驗收清單](../operations/output-appearance-acceptance.md)，真實 OBS 與長時間效能仍屬後續階段。
