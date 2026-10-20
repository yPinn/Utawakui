# Overlay Pack 規劃

狀態：規劃，尚未實作。展開 [ADR 0011](../adr/0011-overlay-instances-and-presentation-pack-delivery.md)。目前只有三個固定 slot 與內建模板（見 [Output 外觀](output-appearance.md)）；沒有遠端 Presentation Pack、User Variant 匯入、字型檔或圖片匯入。

## 物件

| 物件                       | 責任                                     | 信任與交付         |
| -------------------------- | ---------------------------------------- | ------------------ |
| Output Instance            | 穩定的 OBS endpoint 與所選外觀           | 使用者設定         |
| Template                   | 版面、動態 recipe、renderer、設定 schema | 簽署的 App runtime |
| Official Presentation Pack | Style Sets、參數、資產、預覽、授權       | 驗證過的內容更新   |
| Official Style Set         | 相容模板的具名預設值                     | 在官方 pack 內     |
| User Variant               | 對 Style Set 的 allowlisted 覆寫 diff    | 本機或分享資料     |

Template id 不編入 instance、category 或 style id。Overlay host 是共用基礎設施，不連 OBS、VTube Studio 等外部服務；那些屬於 main 的 adapters（[ADR 0013](../adr/0013-external-integration-planes.md)）。

## 可調與鎖定

模板由 App 內建的可重用元件組成（曲目資訊、佇列視窗、歌詞行與進度 mask、文字擬合、裝飾層、單一動畫 host、可選的單一 GPU canvas）。Pack 只能參數化與裝飾，不能取代實作。

- **鎖定**：狀態綁定、DOM 結構、renderer、時序、安全、可及性下限、效能上限。
- **安全外觀**：配色角色、字體角色、大小、字重、對齊、背景、密度、允許的裝飾。
- **有界動態**：開關、強度、時長、stagger、粒子密度、裁切與版面變體，限模板宣告的範圍；兩端點都在所有相容模板測過才開放。
- **資產選擇**：只有相容且驗證過的 asset id，不接受路徑或 URL。

解析順序：模板 fallback → Style Set → User Variant → 強制的可及性與效能限制。Pack 值由 host 轉為驗證過的 custom property，不能注入 stylesheet 或任意 property。

## Pack 與 Variant

- Pack manifest 含 `schemaVersion`、`packId`、`packVersion`、`minAppVersion`、`contractVersion`、`capabilities`、`styleSets` 與 content-addressed `assets`（各帶 sha256、size、mediaType、licenseId、redistributable）。各種版本彼此獨立，啟用前解析相容性；未知必要能力或版本 fail closed。
- Manifest 不得含 script、inline CSS、HTML、shader、遠端 URL、安裝 hook 或 migration code。
- User Variant 只存 diff（`base` 指向 pack／styleSet 與 `follow-compatible` 或 `pinned` 策略，加上 `overrides`）。值限有界數字、布林、enum、驗證過的顏色、字型 id 與 asset id；不支援的 id 在 render 時忽略但保留在儲存中。
- 分享：`.utawakui-style` 為單一 Variant 的 JSON；`UTS1.<base64url>.<checksum>` 是同 schema 的簡短編碼，checksum 只防抄錯，不是簽章。Variant 不能嵌入二進位資產，可再散布資產須用 `.utawakui-pack`。本機字型改用宣告的 fallback。
- 未來 `overlays.json` v3 保存具名 instances 與 variants，endpoint 為 `/overlay/slot/<instanceId>`；現有三個 route 成為預設 instance 的 alias。需要兩個同時顯示的曲目版面時新增 instance，而不是恢復模板專屬 route。

## 安裝與啟用

Main 是唯一的下載、驗證、解壓與安裝權威；renderer 只能請求安裝或選擇已驗證 id。

1. 以內建 root of trust 驗證 TUF metadata（到期、rollback／freeze、target 名稱、長度、digest）。
2. 下載到唯一的 staging 目錄，限制大小與時間。
3. 以深度、屬性數、字串長度上限解析 JSON，驗證 schema 版本與 App 相容性。
4. 逐一檢查資產的 media type、副檔名、magic bytes、長度、digest，並在格式限制下解碼。
5. 驗證授權與再散布 metadata。
6. 移入不可變的 `packs/<packId>/<packVersion>`，在安全時機以原子方式切換 active pointer。

任一步失敗即 fail closed，部分內容永不提供，可疑內容移入 quarantine。執行中的 instance 釘住一個版本；背景下載不改變現場，啟用要等沒有 client、使用者確認或下次 session。保留前一個良好版本與內建 fallback；離線時依序嘗試 active、前一版、內建。User Variant 與 pack 目錄分開。

ZIP 匯入須拒絕：絕對或磁碟路徑、`..`、替代分隔字元、NUL、正規化後撞名、symlink／hard link／裝置檔、巢狀壓縮、加密或不支援的壓縮法、過量的項目數／大小／壓縮比／深度、重複 id。每個項目寫入前檢查最終路徑。

## 資產政策

- **圖片**：只允許明列的點陣格式；限制 bytes、像素、frame 數與動畫長度；啟用前先解碼；不把內嵌 profile 當路徑或指令。
- **SVG**：淨化為保守子集，拒絕 script、事件、外部參照、動畫元素、`foreignObject`、HTML 與遠端字型；限制複雜度；CSP 不取代淨化。
- **字型**：只收 App 支援的格式並驗證 table；需 asset id、family／style、授權與再散布旗標。本機字型經 main picker 複製到以 digest 定址的受管 store，不保留原路徑；只在本機使用，使用者確認再散布權利後才可進入分享 pack。
- **GLB／glTF**：優先單一 GLB；拒絕外部 URI 與不支援的擴充；限制節點、頂點、材質、貼圖、動畫與 GPU 記憶體；需要 DOM／SVG 或靜態 fallback。
- **Lottie／Rive**：runtime 隨 App 提供；拒絕 script 與外部依賴；與歌曲同步的播放由 host 時鐘驅動。
- **禁止**：shader、WebAssembly、JavaScript、HTML、CSS、native module、瀏覽器擴充與安裝 hook。未來的簽署 code pack 需要另外的威脅模型與 ADR。

數值上限是 validation、Workbench 與 runtime 共用的常數，須先有代表性的 OBS 量測才固定；需涵蓋 pack 與保留版本總量、資產數與解碼記憶體、每 instance 一個 GPU canvas、DPR／FPS／繪製量，以及所有作用中 Browser Source 的總成本。隱藏或斷線的 instance 暫停非必要工作；WebGL 遺失時走確定的 fallback，不無限重載。

Pack store 不經 `utawakui-media:` 曝露；WebSocket 維持唯讀。

## 回饋與權利

- 外觀回饋可帶有界的 HTTPS 參考 URL、時間範圍與說明，App 不抓取其 metadata 或媒體；拒絕含 credential、非 HTTPS、本機主機、IP literal 與類檔案路徑。不自動附帶歌詞、曲庫 metadata、路徑、字型清單、截圖或 OBS URL。
- Pack 資產需有所有權或再散布許可；不重製未授權的 MV 美術、logo、字型或模型，也不暗示合作關係。社群提案須經審核、授權檢查、資產驗證、相容測試與簽署發布才成為官方內容。

## 第一版非目標

遠端可執行的 JS／CSS／HTML／shader pack、開放市集、自動匯入受版權保護的影像素材、曲中切換 pack、任意本機檔案參照、逐曲編舞編輯、完整的 App 內社群回饋服務。
