# 平台播放清單匯入

匯入面板的「匯入播放清單」以 Spotify 唯讀連結與已連接的 YouTube 帳號清單為主要入口，讀取來源曲目並按原始順序建立本機清單。來源平台清單全程唯讀。

## 操作與資料

- **Spotify 連結。** 貼上完整的播放清單網址並在 Spotify 官方頁面完成 Authorization Code with PKCE。開發環境需設定 `UTAWAKUI_SPOTIFY_CLIENT_ID`，在 Spotify 應用程式設定登記 `http://127.0.0.1/oauth/callback` 以使用動態埠，並將測試帳號納入許可名單。要求 `playlist-read-private` 讀取清單與 `user-read-private` 顯示帳號資料。這兩項權限皆唯讀。Main 於該次查詢中保留 access token，讀取名稱及至多十頁（每頁五十項），查完即釋放。項目讀取限清單擁有者或協作者。四零三等存取失敗有明確提示，公開發行受平台配額限制。[Spotify PKCE](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow) · [回呼網址](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri) · [播放清單端點](https://developer.spotify.com/documentation/web-api/reference/get-playlists-items)
- **YouTube 帳號。** 與[場次影片配對](performance-session-preparation.md#平台影片配對)共用 `youtube.readonly`，只讀已連接頻道的自有清單。清單與項目各最多十頁，每頁五十項。讀取二十秒後不再發出下一頁請求。此入口配對已有本機曲目。從分享連結匯入 YouTube 來源仍走[既有來源解析與批次預覽](import-task-session.md)。
- **備用檔案匯入。** 從視窗右上角的「更多匯入方式」選擇「從檔案匯入」，以原生檔案選擇器讀取單一 UTF-8 CSV 或 Spotify 帳戶資料的播放清單 JSON。CSV 欄位需有 Title／Artist，Album／ISRC 選填。每檔上限 8 MiB，最多 250 個清單，每個清單最多前 5,000 項。平台帳戶資料 ZIP 取得方式見[Spotify 說明](https://support.spotify.com/tw/article/data-rights-and-privacy-settings/)。

## Spotify 與檔案的本機匯入

「帳號與登入授權」可以直接綁定 Spotify。Main 用作業系統安全儲存加密保存更新權杖、顯示名稱、頭像網址與綁定時間。匯入播放清單時會優先使用綁定的帳號，也可選「這次使用其他 Spotify 帳號」開啟逐次授權。逐次授權的帳號資料留在程序記憶體，退出後消失。若 Spotify 拒絕更新權杖，Main 移除本機綁定並顯示重新綁定提示。解除綁定移除本機憑證與帳號資料。遠端存取權可在 Spotify 帳號頁面撤銷。[Spotify 個人資料](https://developer.spotify.com/documentation/web-api/reference/get-current-users-profile)

- Main 按列配對本機曲庫。同一 YouTube 影片 ID、或符合標題與錄音識別證據的唯一候選可預選。來源曲序、重複項、待確認版本及無可用項目均保留在預覽。同一 `trackId` 與其他本機播放清單一致，保存時採首次出現的順序去重。
- 需要音源的項目由使用者逐首要求搜尋。Main 以來源已讀取的曲目資料呼叫既有來源搜尋，確認後才交給既有下載批次。是否可下載依實際音源與現有匯入權限判定。[Spotify API 內容限制](https://developer.spotify.com/documentation/web-api/reference/get-track) · [YouTube API 開發者政策](https://developers.google.com/youtube/terms/developer-policies/)
- Main 持有預覽、允許的候選及已確認的批次。Renderer 傳入識別、清單名稱及每列選擇。關閉、改選來源或十五分鐘到期釋放預覽。已接受工作沿用批次的取消與重試，由 Main 重查本機曲庫範圍與檔案存在，再以來源原序保存。本機清單首次建立後，補下載的曲目按原索引放回。使用者已修改清單成員或曲序時，既有編排優先。
- 介面不要求使用者建立 YouTube Music 副本。Spotify 讀取只呼叫官方端點，檔案匯入和本機曲目配對可離線完成。

## 推進順序與驗收

1. YouTube 使用相同測試授權逐一核對公開、不公開及私人清單、YouTube Music 自建清單，以及較早場次的回放分頁。以不同頻道、失效項目、撤銷及限流確認 UI 狀態。公開發行前完成 Google 驗證、資料用途審查及配額驗證。
2. 驗 Spotify 來源擁有者、協作者與無權限帳號，用測試清單確認曲目讀取、來源配對、缺曲、部分失敗及本機曲序。另驗 Windows 的取消選檔、取消授權及曲庫切換。
3. Twitch 依[場次契約](performance-session-preparation.md#自動查詢後續驗證)先驗公開桌面裝置碼授權、最小權限及權杖續期，再擴充頻道的回放選片。時間校正沿用場次已有的匯出預覽。
4. Apple Music 先驗 Windows 上的 MusicKit 授權與開發者權杖的交付方式。Twitch 或 YouTube Bot 的發布行為與聊天權限另作產品決策。
