# 曲目編輯契約

## 目的

曲目編輯使用「立即預覽、單次儲存」模型。歌名、演唱者、本機封面、線上封面候選與移除封面在編輯期間都是草稿；只有使用者按下「儲存」才可改變曲庫。取消或關閉必須放棄整份草稿。

## Authority

| 資料                 | 編輯期間 owner                        | 持久化 owner                  |
| -------------------- | ------------------------------------- | ----------------------------- |
| 歌名與演唱者草稿     | Renderer `useTrackMetadataEditor`     | Main library metadata service |
| 本機封面來源 path    | Main process-memory draft session     | Main library artwork service  |
| 線上候選與驗證 bytes | Main artwork discovery session        | Main library artwork service  |
| 封面預覽 URL         | Renderer temporary `blob:` projection | 不持久化                      |

Renderer 不接收或提交本機 path、remote artwork URL、filename 或任意 IPC channel。本機 picker 由 Main 開啟；Main 以 renderer sender 與 track id 持有短生命週期來源 path，只回傳通過副檔名、檔頭 signature 與 10 MiB 上限檢查的 MIME／bytes 預覽。最終寫入會重新讀取並驗證同一來源，再以已驗證 bytes 原子寫入，避免把偽裝副檔名或檢查後遭替換的內容帶入曲庫。

## Bounded intents

Preload 只暴露下列曲目編輯 intent：

- `chooseTrackArtworkDraft(trackId)`：開啟 Main-owned picker，建立或取代本機封面草稿，不寫入曲庫。
- `discardTrackArtworkDraft(trackId)`：放棄該 renderer／track 的本機 path 草稿。
- `saveTrackEdits(trackId, edits)`：提交 bounded title／artist 與一個 artwork action。

Artwork action exact allowlist：

| Action        | 意義                                                                           |
| ------------- | ------------------------------------------------------------------------------ |
| `keep`        | 保留目前已保存封面                                                             |
| `local-draft` | 使用 Main session 中已驗證的本機選圖                                           |
| `candidate`   | 使用目前 discovery session 的 opaque candidate id；Main 重新檢查 provider gate |
| `clear`       | 移除已保存封面                                                                 |

歌名與演唱者都必須是字串；歌名 trim 後為 1–200 個 UTF-16 code units，演唱者為 0–200。未知 action、失效本機草稿、失效候選、不合法 metadata 或不存在的 track 一律以 bounded reason 拒絕，不推測 fallback，也不暴露 private context。

## Commit and cancellation

封面選擇、候選 radio selection 與移除在 Renderer 立即改變預覽及 dirty state，但不 refresh library，也不發出 mutation。Save 由單一 Main handler執行 artwork action 與 metadata update，成功後只發出一次 library update。

Artwork mutation 前先擷取既有 `thumbnail.<ext>` 與 `artwork.json` 的 Main-private snapshot。後續 metadata 寫入失敗或 candidate apply 失敗時，Main 恢復該 snapshot，不回傳部分成功。成功後清除本機 path 草稿；取消則由 Renderer明示 discard，並撤銷所有 temporary `blob:` URLs。

## UI contract

- 共用曲目選單只有一個「編輯歌曲」入口；Library、Queue、目前播放與 preview consumers 使用同一 editor contract。
- Modal 保留 wide 兩欄與 13rem 封面；一般編輯 content-height，線上搜尋展開時才使用 bounded fixed-height scroll body。
- 封面操作使用一組精簡 `UiIconButton`；本機「選擇圖片／更換圖片」、
  「線上搜尋」與「移除封面」都必須保留完整 accessible label／Tooltip，移除使用 danger intent。
  footer「儲存」仍是唯一 accent primary。
- Save 只在草稿 dirty 且沒有進行中的 picker、搜尋或儲存時可用。Cancel／close 在非寫入狀態下放棄全部草稿。
- 歌名必填錯誤由欄位本身呈現並取得焦點。線上搜尋展開後焦點進入搜尋 heading，收合後回到觸發按鈕；候選 radio list 支援方向鍵、Home、End 與單一 tab stop。

## Verification owners

- `electron/lib/library/trackArtwork.test.js`：預覽 bounds 與 snapshot rollback。
- `electron/main/libraryHandlers.test.js`：Main session、bounded intents、gate recheck、combined commit 與 rollback。
- `electron/preload.test.js`：固定 channels 與 path stripping。
- `src/composables/useTrackMetadataEditor.test.js`：立即預覽、取消零寫入、單次 Save。
- `src/components/library/*.behavior.test.js` 與 `TrackContextActions.behavior.test.js`：Modal anatomy、copy、focus、radio keyboard 與 consumer wiring。
