# NetEase 歌詞取得契約

狀態：已實作的實驗性產品來源。
建立日期：2026-08-29。

## 產品邊界

NetEase 是 `lyrics-flow` 保護下的候選來源，與 LRCLIB 並列於歌詞來源管理 UI。
使用者可用可編輯的曲名與歌手搜尋、檢視候選的錄音版本與同步能力，再明確保存一筆來源。
Provider import 與 provider metadata backfill 也可在背景自動探索 NetEase，但只允許 shared
comparator 判定為 `exact` 的候選自動保存；錯誤版本的 T2 不得壓過 exact T1，Better Lyrics
仍維持 manual-only。當高度符合結果為空時，「擴大搜尋」保留並
去重原本候選，再合併移除歌手限制、清理曲名邊界標點的 recovery query；候選仍沿用相同的
錄音版本與時長 gate，因此結果集不會比原搜尋縮小。

一般搜尋會使用 shared query plan 產生的最多三組 structured title／artist variants，包含
bounded cross-script title aliases。候選 identity scoring 會把繁／簡中文標題與歌手視為等價，
但不改寫下載內容、保存 metadata 或 provenance。

2026-08-29 的 owner 決定略過原本的 Sentinel／30 日資格觀測，直接進行實驗性接入。
這取代產品進入條件，不改寫 2026-08-28 隔離式穩定性報告，也不代表對上游可用率或曲庫
覆蓋率作出保證。

## 網路與信任邊界

Main 使用內建 `fetch`，只向固定 HTTPS origin `https://interface.music.163.com` 發出 POST：

- `/api/cloudsearch/pc`：bounded metadata search；
- `/api/song/lyric/v1`：取得指定 candidate id 的 YRC／LRC。

請求拒絕 redirects，不帶 cookie、credential 或使用者提供的 URL。曲名與歌手各限 256 字元、
拒絕 control characters；回應 body 有固定 byte 上限，候選與文字行／segment 數量亦有上限。
所有外部操作在 main 再檢查 `lyrics-flow`。Renderer 只傳 allowlisted provider id、track id、
bounded query、candidate id 與 preview fingerprint。

Discovery／hydration cache 依 bounded track／query identity 隔離，最多保留 32 組。不同曲目
的 manual 或 background search 不得清空另一曲目已授權的候選；保存仍需以同一 identity 找到
先前 candidate，並重新取得歌詞驗證 fingerprint。

## 候選與逐字能力

搜尋結果會先用 title、artist、album、duration、alias、translated title 與 recording-version
marker 過濾及排序；明顯版本不符或時長差距過大的資料不發出歌詞請求。通過的 metadata 依序
最多三筆一批取得歌詞，累積三筆可用候選即停止；遇到沒有歌詞或無法解析的結果會繼續下一批，
直到達標或 metadata exhausted。取得後逐筆標示：

- T2「逐字同步」：每一個非 metadata YRC line 都可完整解析；parent line 與所有 segment 的
  start、duration、bounds、順序、文字及總量全部有效。只要任一行或 segment 無效，整筆 YRC
  不得宣稱 T2。
- T1「逐行同步」：沒有可驗證的完整 YRC，但 LRC 有有效時間標記。
- T0「純文字歌詞」：只有非空白文字，不推論任何時間。

Live proof 於 2026-08-29 使用四語 smoke：4／4 requests、4／4 matches；其中中文與英文候選
取得完整 validated T2，日文與韓文候選只有 T1。這只證明逐字資料確實存在且不是由本機推估，
不代表每首歌曲都有 YRC。

2026-09-01 的三筆 anonymous endpoint regression smoke 則是 3／3 top records 有 LRC、0／3
有 YRC；production candidate smoke 得到四筆 T1、零筆 T2。這不推翻歷史樣本，但證明 YRC
availability 已改變或高度不穩定。產品必須保留 truthful T1 fallback，不得把此來源描述為
穩定逐字來源，也不得為提高命中率而放寬完整 YRC validator。

## 保存與 provenance

保存前 main 會重新取得 candidate，並以 SHA-256 fingerprint 比對預覽內容。內容變更時回傳
bounded candidate summary 要求再次確認；缺少 search cache 的保存請求視為 stale。Automatic
保存會在此 refetch 後、同步 persistence 前再次驗證曲目 generation、實際音訊與完整 T2 狀態；
被刪除曲目的舊工作不得建立新目錄。保存後：

- `lyrics/netease-<id>[-n].lrc` 保存 T0／T1 compatibility source；
- 完整 T2 另保存 canonical timing sidecar；
- `lyrics/providers/netease-<id>.json` 保存 bounded provider artifact、hash、retrieval time 與
  `netease-direct-http-v1` profile；
- `lyrics/lyrics.json` 只保存 scalar source metadata 與 provider provenance，不保存 URL 或
  absolute path。

寫入採 snapshot／rollback；刪除來源時一併刪除其 provider artifact。網易失效只影響這個
可選來源，不阻擋本機匯入、既有歌詞或應用程式啟動。
