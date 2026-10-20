# Folder 頁面物件

Playlist／album／artist 的 Folder 頁可放照片與便條。資料 owner 是 `electron/lib/library/folderPageObjects.js`，儲存格式見[架構圖](../architecture.md)；全部曲目、本機檔案與 workspace mode 沒有頁面物件。

## 資料

- `folder-page-assets.json` v4 以單一 `objects[]` 保存 key、`type`（`photo`／`note`）、`source`（`user` 可刪除；`derived` 只存位置）、頁面 identity、placement、Pin、rotation、同頁 layer order、依類型驗證的 payload 與時間。`pdf`／`embed` 保留給後續，目前拒絕。
- 圖片存於 `folder-page-assets/<assetId>/`，不保存原始路徑或遠端 URL；只接受 main 驗證過的 JPEG／PNG／WebP。
- 每頁最多 12 個使用者物件，衍生物件不計；刪除 collection 時一併清理。

## 新增與編輯

- 唯一入口是紙張下方 Folder 底材右上角的 `Plus` icon，開啟共用選單選照片或便條。它屬於 Folder 背景，不繪製 dock surface，不新增列或高度；物件可覆蓋它，外層 Scrollbar 仍在最上層。Collection action rail 不承接頁面物件。
- 便條只在編輯視窗建立：標題選填（最多 80 字）、內文選填，按「儲存」且至少一項非空才建立。再次編輯只從右鍵選單進入，避免重疊時誤點。
- 右鍵或鍵盤選單鍵依類型提供：照片「展開／編輯照片文字／固定／移除」，便條「閱讀（截斷時）／編輯／固定／刪除」，衍生摘要只能固定。刪除一律經共用確認視窗。

## 位置與移動

- 照片、便條與衍生摘要共用一個 Folder-wide drag／Pin／stacking owner；短按或 Enter／Space 展開，拖曳不誤觸。
- 所有物件都保存 paper／side／bottom 的 region-local placement，放開或鍵盤移動後立即貼齊；Pin 只鎖定移動。Side 空間不足時只在 render 時投影到底部，變寬即回原位；resize 不保存。
- 版面變更以單一批次寫入；各頁獨立保存，切頁與重啟都還原。
- 新使用者物件由 main 放在 bottom region 的 4×3 格點，加 ±0.04 normalized jitter，並隨機向左或右傾斜 0.75°–4°；重開與 render 不重新隨機。同次新增的物件由最上層往右下錯開一個最小可抓取尺寸。衍生摘要未保存時固定在 bottom 最底層。

## 便條

- 薄紙：一律半透明，依 key 的穩定 hash 取四種顆粒偏移之一，不畫摺痕。
- 紙材為藍紫、粉紅、鵝黃、牛皮紙、橫線紙，在編輯視窗左側色票選擇或以右下按鈕輪換；新便條隨機一種。舊便條缺紙材時依 key 補定並寫回；衍生摘要固定為 Folder 色薄棉紙。
- 紙上最高為與寬度相同的正方形，標題完整、內文底部淡出加「…」。只有被截斷的便條可點擊、Enter 或右鍵「閱讀便條」，以信紙比例的同材質紙張分頁閱讀，←／→、PageUp／PageDown 翻頁並顯示頁碼；按鈕為關閉、編輯、刪除。

## 照片

- 建立時依顯示方向（含 JPEG EXIF）歸到最接近的 4:3、3:4、1:1、16:9、9:16 並保存；舊照片首次讀取時補量並寫回。
- 尺寸依實體相紙換算（一般 4×6 吋、archival 3R、拍立得依 instax mini／SQUARE／WIDE），紙上 0.5 倍、展開 1.25 倍（受畫面與原圖像素限制）。
- 相框建立時隨機並保存：一般相紙、深色細框加黑白濾鏡的 archival，或下緣較寬的拍立得（僅 1:1、3:4、4:3）；展開沿用同一相框。
- 「編輯照片文字」有兩段選填：拍立得下緣短文字（最多 16 字）與說明便條（標題 80 字、內文 2000 字）。說明紙在紙上只從相框右下角露出一角；展開時排在照片與按鈕之間、上緣對齊，過長時內部捲動。說明紙色以照片右下小色票輪換，首次隨機；清空欄位即移除。
- 約三分之一使用者物件帶文具（照片為膠帶、便條為撕邊），衍生藝人卡固定別迴紋針；參數由 key 決定，隨物件移動、不可點擊。

## 展開檢視

- 縮圖與 Preview 共用 `UiPhotoFrame` 的 mat、border、paper surface、shadow 與 vintage filter；縮圖 cover crop，Preview 以 contain 完整顯示。
- 展開層不畫 dialog shell 或內容 scrollport；圖片在 `72dvw × 70dvh` 內完整縮小、不裁切、小圖不放大。
- 關閉與移除是影像外側、上緣對齊的垂直 `UiIconButton` rail，順序 close→remove，移除用 `danger` intent。只有 backdrop 本身的點擊會收合；展開／收合使用既有 motion tokens，reduced motion 直接呈現終態。移除確認沿用共用 Modal stack。
