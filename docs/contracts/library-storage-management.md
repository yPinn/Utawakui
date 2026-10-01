# 曲庫空間管理契約

本契約定義 Settings 容量摘要、去人聲上限與安全清理邊界。歌曲檔是曲庫的權威資料，
不是可自動淘汰的快取。

## 容量分類

- Main 依實際檔案大小掃描目前 library root，不信任 renderer 傳入的 path 或匯入時紀錄的
  預估大小。
- 結構化 `audio.<ext>` 與 legacy root audio 計入「歌曲」。
- `tracks/<trackId>/separations/*.wav` 中的分離音訊計入「去人聲」。
- 其他 sidecar、manifest、封面、歌詞、分析與未知檔案計入「其他」。未知檔案不得進入
  自動刪除候選。
- Settings 關閉狀態只顯示「曲庫空間」、曲庫已使用容量與所在磁碟可用容量。分類、政策與
  清理操作只出現在同一個 disclosure 內。

## 政策

- `libraryStorage` machine config 只保存 `autoManageSeparation` 與
  `separationLimitBytes`。Renderer 只能提交完整的 allowlisted policy，不提交路徑、recipe、
  model 或刪除目標。
- 自動管理預設關閉；預設上限為 25 GiB。可選上限為 10、25、50、100 GiB 或不限量。
- 上限只套用去人聲音訊，不是整個曲庫的硬上限。歌曲、歌詞、封面、分析與未知檔案不會
  因此被刪除。
- 磁碟安全空間為 volume capacity 的 5%，最少 10 GiB、最多 50 GiB。即使上限設為不限量，
  啟用自動管理後仍會維持這條安全線。
- 超過上限時清理到上限的 85%，避免每新增一個結果就重複淘汰。

## 候選與順序

- 只有 separation manifest 中存在且對應實體檔案的結果能成為候選；移除結果必須同步原子
  更新 manifest。若移除 selected result，改選仍存在且完成時間最新的結果；沒有結果則清空
  selection。
- 非 selected recipe 先於 selected recipe 清除。相同層級依 main-private 完整
  `lastPlayedAt` 由舊到新排序；從未播放的曲目以 separation completion time 排序。
- Main 將目前播放、播放 Queue 與處理中 track ids 組成保護集合。保護曲目不得自動或手動
  清理。
- 可用候選不足時停止，不跨過歌曲本體或其他資料，並回報仍需釋放的容量。

## IPC 與失敗邊界

- `library-storage:get`、`library-storage:set-policy` 與 `library-storage:cleanup` 是唯一 renderer
  邊界。回應只含 policy、分類容量與清理筆數／釋放容量，不公開被刪除的 track ids、路徑或
  recipe ids。
- Separation 完成、provider download 或本機匯入成功後會執行已啟用的 policy；清理失敗只
  記錄 main diagnostics，不得把已完成的分離、下載或匯入改成失敗。
- Settings 手動清理使用同一套候選與保護規則，操作前明示「歌曲保留」。
