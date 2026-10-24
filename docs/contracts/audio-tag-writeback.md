# 音檔標籤回寫

## 範圍與入口

設定「曲庫資訊 → 校對 → 曲目資訊 → 同步音檔資訊」提供獨立的檔案預覽與確認。
先儲存 App 校對，再選要同步的欄位；檔案同步失敗不撤銷 App 資料。
目前逐首確認，同時只執行一筆檔案任務，不提供整庫一鍵覆寫。
一般曲目列、關聯按鈕與專輯共用縮圖的外觀調整不屬於此流程。

| 格式／資料                         | 第一批能力                                                 | 驗證邊界                                                                                                                                                  |
| ---------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native FLAC 文字 comments          | 曲名、演唱者、專輯、專輯藝人、日期、曲號／總數、碟號／總數 | 僅受管理的 `tracks/<id>/audio.flac`；最多 256 MiB；metadata chain 最多 128 blocks、16 MiB；拒絕 leading ID3、多個 comment block、損壞結構及無法往返的欄位 |
| FLAC 封面與其他 blocks             | 原樣保留                                                   | 不提供封面替換；STREAMINFO、APPLICATION、SEEKTABLE、CUESHEET、PICTURE 等非 comment blocks 不重新序列化                                                    |
| MP3、M4A                           | App 校對可用，檔案回寫未開放                               | 基本試寫與 PCM 比對不等於特殊 frames、atoms、gapless 與所有未知 metadata 已通過                                                                           |
| Ogg／Opus、WAVE／BWF、AAC、WebM 等 | App 校對可用，檔案回寫未開放                               | 不因可播放或可匯入而開放寫入，也不為回寫轉檔                                                                                                              |

`tags/flac.js` 依 native FLAC block／Vorbis comment 格式，只改選定文字欄位。
保留原 vendor、未選 comments 的順序與 UTF-8 bytes，音訊 suffix 及 STREAMINFO 必須完全一致。
日期不補月／日，專輯藝人處理 `ALBUM ARTIST` 別名；總數處理 TOTALTRACKS／TOTALDISCS。
packed 曲號／總數及碟號／總數按語意保留未選值；總數單獨縮小到小於未選曲號時拒絕寫入。
正式 `music-metadata` reader 必須重讀出每個選定值，且未選的九個支援欄位語意相同，才產生可提交預覽。
其他 alias 導致讀值不符時拒絕安裝，不刪來源 ID 或未知 comments 來強行通過。

曾在隔離環境評估 TagLib-Wasm 2.4.0／TagLib 2.3.2 的三格式基本試寫。
正式版本採較窄的 FLAC comment-only adapter，未加入該套件或 WASM，也未新增 runtime dependency。
格式依據為 [FLAC RFC 9639](https://www.rfc-editor.org/rfc/rfc9639.html)；實際放行仍以程式與 fixtures 的 bytes／reader 驗證為準。

## 欄位與主要發行

Main 從已保存的 App metadata 取得曲名及演唱者，不接受 Renderer 自填路徑、hash 或原生 tag map。
專輯相關欄位必須明選目前有效的發行及位置，不自動採第一張作品。
來源位置必須仍對應完整 slot identity，原 binding 必須符合目前音檔。
來源使用已確認的 flat position；不推測多碟分組。碟號只採已校對的 App 值。
主要發行與位置記在回寫收據，之後補來源或合併不自動改寫音檔。

預覽有效十分鐘，Main 最多保留四份，保存精確欄位、值、文件 fingerprint、epoch 與音訊證據。
確認時重驗整個 snapshot；外部編輯、換庫、刪除或檔案替換會使其失效。
回寫只處理 App 管理的副本，拒絕 symlink／junction／hardlink；不碰原始匯入路徑。

## 整檔雜湊與引用

`audio-content-sha256` 仍是整檔 SHA-256，不改成音訊 essence 卻沿用原名稱。
`tag-writebacks.json` v1 記錄 before／after hash、`STREAMINFO + frame suffix` 的 SHA-256、
欄位清單、主要發行、時間及備份 ID。沒有絕對路徑，也不成為另一套發行權威。

只有仍等於 verified beforeHash 的 works profile、active／pending release bindings 才遷移到新 hash。
null、未確認或 stale binding 不補綁。若任何 stale accepted binding 恰等於目標 afterHash，
整筆操作拒絕，避免歷史 tags 回寫或還原使它意外變有效。
merge 的歷史收據不追溯改寫；trackId、目錄與 queue 身分不改變。

`library.json` 的 contentHash 更新。再次匯入原先未改 tags 的檔案時，只有目前原音檔、
收據鏈及每份對應備份的實際 hash／essence 都符合，才視為原 track 的 dedup alias。
在 import admission lane 再驗證一次；不把不同 trackId 自動合併。

musicStructure 與 lyrics acoustic sidecar 保留產生時的原 hash／provenance。
既有 owner 的 fresh-hash 檢查使它們失效待重建，不把舊分析偽裝成重新產生。
歌詞文字 hash、模型 hash、來源 manifest 及已產出的伴奏 bytes 不改寫。

## 等待、提交與恢復

Player pending start、HTML audio event 狀態、BGM 實際 loaded／requested source 及 play intent、
開啟中的曲目預覽，經固定 bounded activity intent 提供占用資訊。
Main 另外檢查 heavy-job scheduler。使用中的音源先等待，十分鐘後失效，不強停播放或處理。
準備與等待階段可取消；取消或 CAS 失敗清理本次未提交 stage，保留音檔與 App 校對值。
單筆以外的同時提交回 busy，可保留預覽重試。

`tags/transaction.js` 非同步建立同卷原檔備份與 staging，flush 完成後才進 shared library lane。
短提交重驗 fresh hash、stamp、文件、epoch 與占用，再寫 durable journal：
prepared → media-installed → references-committed → 完成移除 journal。
跨音檔與 JSON 不宣稱單一原子替換；Windows sharing failure 保留 journal 與備份。

`library-tags-journal.json` 只允許 Main 派生的受管理 FLAC、UUID 備份目錄，以及
`library.json`／`playlists.json`／`works.json`／`tag-writebacks.json`。
啟動與換庫先恢復；設定外層「恢復未完成操作」同樣先恢復 tags，再恢復 reconciliation JSON。
所有相關 writer 遇任一未完成 journal 拒寫。恢復前先檢查整組資料仍是已知 before 或 after；
外部修改時保留現檔與證據，不覆蓋新資料。

還原需符合目前 afterHash，重新驗證備份與 essence，並經同一媒體交易遷移有效引用。
還原不撤回 App 的人工校對。最近歷史優先保留目前可還原的收據，避免被還原紀錄擠出入口。
新寫入最多 100 個備份資料夾、2 GiB；還原另保留到 200 個資料夾、4 GiB。
ledger 最多 200 筆，JSON 每份 16 MiB、整份 journal 32 MiB；實際剩餘空間也必須足夠。
第一批不自動刪除已完成的備份，達上限拒絕新寫入；備份管理及更多格式須另外完成驗證後擴充。

## 驗證

相鄰測試涵蓋原音訊與非 comment blocks、未知 tags、多值、日期精度、別名與 packed totals、
missing artist、stale 變 fresh、原檔重匯防重、CAS／epoch、stage 與提交 lane 分離、
雙提交、占用等待／取消、journal 各中斷點、外部衝突及保留還原額度。
`scripts/fixtures/tags/tone.flac` 是自行合成的 997 Hz 短音源，不是使用者歌曲或封裝資產。
可見 Electron 使用隔離 profile、正式 Main／preload 與 production renderer；
此證據不表示正常曲庫已合併、回寫或達成所有格式的真歌矩陣。
