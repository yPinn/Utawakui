# 歌詞對時確認：行為提案

2026-10-26 提案；2026-10-28 沿既有保存路徑接續 source session／CAS／offset barrier 與人工確認收據，行為邊界見[保存與確認契約](../../contracts/lyrics-timing-review.md)，功能現況只見 [spec](../../spec.md)。R01–R18 仍為完整分層驗收；收據通過不等於句級擴充或波形已交付。共用前置見[規劃入口](player-practice-planning-2026-10-26.md#共用前置)。沿既有 editor 聽辨／修正，記錄對當前來源的人工檢查，不把波形、模型或播放完成當作正確性證明。

## 範圍與確認含義

| 來源／呈現                  | 提案能力                                                 |
| --------------------------- | -------------------------------------------------------- |
| T0                          | 可看原文／波形，不可標對時已確認；點波形不自動建立 T1。  |
| T1                          | 檢查句級時間；明示推定終點，缺合法範圍不開分段編輯。     |
| 原生 T2，含 partial         | 沿 editor 校正，確認不改 granularity／coverage。         |
| T1+／估計                   | 獨立參考，先切回 canonical 來源才可確認，不藉此升格 T2。 |
| 壞檔／未知 schema／讀取失敗 | 不覆寫或用空文件補可確認版本，也不當單純未確認。         |

確認範圍為「此來源 revision 的全部已計時內容」。混合未計時行須顯示 coverage，標示只對計時部分適用；只檢查一段可存修改，不稱完成整份。逐句勾選／局部確認另議；不以聽過秒數、模型信心或 ended 自動打勾，也不強制全曲播放通關。

純本機編輯／確認不需網路、帳號或外部歌詞 gate。decoder 若需選配工具，另明示並沿原生命週期，不暗裝 FFmpeg／模型。沒有新增 ASR、自動校時、翻譯、錄音／監聽；讀音、繁簡、分頁與外觀不重寫 canonical 原文。

## 座標與驗聽

```text
歌詞位置 ms = 媒體位置 ms + offset ms
波形標記位置 = canonical 時間 ms - offset ms
拖回 timing 草稿 = 波形媒體位置 ms + offset ms
```

沿現行正負號：句首 12,000ms、offset +500ms，標記在媒體 11,500ms；拖到媒體 12,000ms，草稿為 12,500ms。Canonical 毫秒與 UI 秒明確換算，不依顯示小數回寫、不雙加 offset 或乘 tempo。

點波形定位與「從這裡播放」分開；paused 不自動播，hover 不發 intent。不是當前曲目時，定位不隱式 setQueue／playTrack，明確改播後才走同一 transport／BGM。場次持有／pending 時不暗中中止 occurrence；現有 playFromLine 的 seek 並播放不可掛到所有手勢。

cursor 只跟同 scope／媒體的實際 player clock，播放另一首就顯示未連結。波形基於原音訊；驗聽若使用已有伴奏／導唱，要明示且有等價時間座標，不自動換路由／比例或準備分離。A–B 是可選整合，不是確認前置。

offset 後越過 0／duration 要明示，不 clamp 再保存；明確跳最近可播處只作預覽，不能假裝原標記已可完整驗聽或已確認。

## 單一草稿與句級操作

現有 editor 已有句內 tap／nudge／undo／保存／取消，未具備完整句級拖曳。擴充同一 owner／Main mutation，保留 document／line／segment ids、原文與未改行；草稿僅作者預覽，不發布到 Performer／Output。

| 操作               | 提案規則                                                                             |
| ------------------ | ------------------------------------------------------------------------------------ |
| 整句平移           | start、已知 end、既有 segments 加同一 delta，不伸縮詞長。                            |
| 改句首／尾         | 只改端點；不能裁 segment、跨非法邊界或自動壓縮詞時間，不合法就拒絕。                 |
| 句內邊界           | 沿現有 setBoundary／tap／nudge，不按文字寬度平均造時間。                             |
| 推定句尾改明確終點 | 改成 authored timing，不留 endInferred；補終點本身不建立 T2。                        |
| 改下一句句首       | 同草稿更新相依 inferred end，仍符合 nextStart；相依 segment 違規則拒絕，不偷偷移除。 |
| Undo／取消         | 僅未保存 timing，不撤銷已提交 timing 或自動保存 offset。                             |

沿 canonical validator 的 line-start 單調性、segment 父層／不重疊、文字拼接與上限；不同唱詞行可合法重疊，重複文字／角色不按版面合併。延伸範圍的相依變更要可預覽／undo，沒有規則就停用該操作。

offset 現在即時投影並自動嘗試保存，保留此語意。區分預覽值與 Main 已存值；確認前等所有在途保存收斂，失敗重試或明確回已存值。若要改成整份 transactional draft，須另決策並同步現場控制。

換曲／來源／離開遇草稿，採一致的保存／捨棄／留在原處政策；收波形不清草稿。晚回只能更新相符 baseline，不清較新草稿、錯誤或 isSaving，含 finally 分支。

## Receipt 與分段保存

Main 導出 scope／track／原媒體及等價證據、source fingerprint／documentId、canonical 文字與 timing revision、已存 offset、確認範圍／coverage、receipt revision 與時間戳。Renderer 只送 source session／expected revision／intent，不自填可信度或私有證據。

目前 source fingerprint 防原文變更，並非完整 timing CAS；同原文仍可有不同時間修訂，需新 revision／snapshot 契約。只保存每來源有界的當前 receipt／失效資訊，與原文、timing、waveform 分開，不建無限審核歷史。

| 命令／結果               | 語意                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------- |
| 保存時間                 | CAS 提交草稿，回 Main 已存文件／revision，不自動確認。                                                        |
| 確認來源                 | 沒有未存 timing／offset，fresh-read 後確認當前 snapshot。                                                     |
| 保存並確認               | 先存必要 timing、等待／處理 offset，再 fresh-read；上下文／edit generation 未變才寫 receipt，不是假跨檔交易。 |
| 撤銷確認                 | 只讓 receipt 無效，保留歌詞／時間／offset／波形。                                                             |
| timing 保存失敗          | 留草稿，不進確認。                                                                                            |
| timing 已存、offset 失敗 | 保留時間，處理 offset 後重讀再確認。                                                                          |
| 兩者已存、確認失敗       | 明示時間已保存／確認未保存，只重試確認，不盲重送舊文件。                                                      |
| 回應遺失／逾時           | 先重讀是否已提交；換庫／刪除防線沿共用規則。                                                                  |

確認中出現新編輯／offset／外部更新即停止確認，保留部分成功。未確認、過期、不適用、讀取失敗分開；來源 session／CAS／sidecar 格式、損壞處理需 focused contract 固定。

## 失效矩陣

| 變動                                        | Receipt 規則                                                                                                   |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| canonical 原文／timing／offset 實質保存變更 | 新 revision 過期；改回數值不自動復活已撤銷／過期確認，純 no-op 不造版本。                                      |
| A→B→A 來源切換                              | 各自查 receipt，未變 A 可讀回；不將 A 借給 B 或因切換抹掉 A。                                                  |
| 媒體替換／無法驗證                          | 待重確認，不只比 id／檔名／URL。                                                                               |
| FLAC tag 回寫                               | Main fresh-verify [等價收據](../../contracts/audio-tag-writeback.md)後才依相容規則遷移 binding，否則保守失效。 |
| label／封面／artist／讀音／繁簡／分頁／外觀 | 未改 canonical timing 則保留，不背書裝置或 OBS 同步。                                                          |
| Key／tempo／導唱／分離更新                  | 原始座標未變則保留，不代表延遲校準。                                                                           |
| T1+ 切換／重算                              | base receipt 不變，估計視圖不借其可信標示。                                                                    |
| waveform 清理／再生                         | 原媒體／timing 未變則保留，cache 不是確認身份。                                                                |

沿現行 normalizer 相容政策保留權威 v2／v3 文件；不能軟體升級就重算合法已存時間或補人工確認。

## 有界波形

waveform 綁原始媒體 revision／producer 版本／解析度，不綁歌詞文字或 offset；多來源共用、時間編輯不重解碼、清 cache 不刪 receipt。可評估粗摘要加細 tile，只接有界可見範圍／解析度，回峰值摘要與 opaque identity，不透過 IPC 傳完整 PCM／任意 decoder 參數。

多聲道不能直接平均成相消的假靜音；固定摘要策略並標為原音訊振幅，不能稱主唱活動。粗摘要只供顯示，不作細時間吸附或正確性判定。

原候選採粗摘要加細 tile；預算、分母與測量限制集中於下列實驗報告，正式 cache 格式與精度仍待接入契約固定。

| Backend 候選   | 需驗證                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------- |
| Browser decode | codec、完整 PCM／副本峰值、長曲取消與 UI 阻塞；不能只限壓縮檔 bytes 或最終摘要。超預算明確不生成。 |
| Main 派生      | 固定 decoder、分塊記憶體、deadline／輸出上限／真正取消；若用 FFmpeg 沿原 gate，不隱式準備。        |

2026-10-28 的[隔離預算與取消實驗](../engineering/lyrics-waveform-backend-2026-10-28.md)保留 Main 分塊 FFmpeg＋隔離 worker 作候選；Browser 完整 decode 不作長曲／硬取消主路徑。正式 backend／cache／介面仍未接入，不新增套件或 decoder 準備流程。明確開波形才啟動，同來源去重、取消停止 producer、不在啟動／掃庫全庫生成。來源 generation 提交前重驗，過期不安裝；cache 壞、codec 不支援、容量不足不拖垮原 timing editor。正式排程／共享播放負荷、封裝 decoder、真實長曲與容量仍待後續 gate。

## 待執行驗收

| ID  | 情境與必要結果                                                                           |
| --- | ---------------------------------------------------------------------------------------- |
| R01 | T0／T1／partial T2／T1+／混合行範圍正確，不偽造 T2／完整性。                             |
| R02 | 正負 offset、倍速、ms／s 的標記／seek／tap／保存一致。                                   |
| R03 | 越界明示，不 clamp 回寫或確認未驗聽內容。                                                |
| R04 | 同／不同曲、paused／playing、場次／BGM 無 hover 播放、暗換 Queue／中止場次或第二 clock。 |
| R05 | 平移、句首／尾、segment 保文字／ids，完整驗證，不裁片段／均分造時間。                    |
| R06 | inferred end、相鄰句、合法重疊／重複行相依正確，不刪／併。                               |
| R07 | undo／取消只影響草稿，不假回滾已存 offset。                                              |
| R08 | 同原文的另一次 timing／offset 保存使舊 CAS／確認失效。                                   |
| R09 | 保存中改稿、A→B→A／同 id 換庫，晚成功／失敗／finally 不蓋新狀態。                        |
| R10 | 三階段失敗／逾時保部分成功，可重讀／重試，不假確認。                                     |
| R11 | 來源切換／label 改名各 receipt 隔離，未變 A 可恢復。                                     |
| R12 | 媒體／tag 等價或未知／缺檔依 fresh evidence 處理。                                       |
| R13 | 讀音／外觀／tempo／分離／T1+ 依矩陣，原生／估計可信標示不混。                            |
| R14 | 未確認／過期／不適用／壞檔／撤銷可辨，不清 bytes／時間或自動補確認。                     |
| R15 | 長曲／codec／rate／聲道／冷暖／縮放記全峰值、取消、耗時與失敗，不因相消假靜音。          |
| R16 | cache 共用／清理、過期 producer／超 payload 有界，保歌詞／receipt，不傳完整 PCM。        |
| R17 | 收波形／離開／刪來源／cleanup 可取消清理，不復活或阻塞既有 editor。                      |
| R18 | 真實音訊與可見 editor／Performer／Output 標記一致、草稿不發布，不當裝置校準。            |

## 實作前決策與證據

先定 source session／revision／offset barrier／receipt；資料語意可先於波形驗。再比較 backend 的預算與取消，擴充同一 editor 的句級相依，最後按既有視覺節奏與真實音訊驗收，不重建整頁。

當輪依據：[editor](../../../src/composables/useLyricsTimingEditor.js)、[source owner](../../../src/composables/lyrics/useLyricsSourceDocuments.js)、[Main validator](../../../electron/lib/library/lyricsTiming.js)、[timing 契約](../../contracts/lyrics-timing-contract.md)、[T1+ 契約](../../contracts/lyrics-acoustic-estimate-contract.md)。7 份既有測試72 passed：系統 TEMP 首次7 fail／65 pass（rename EPERM），工作區 TEMP／TMP 同組重驗全過，未改程式。原 T01–T09 留[初始證據](player-practice-planning-2026-10-26.json)，不是新增驗收結果。

## 保存與收據驗證（2026-10-28）

依原順序的本輪驗證只涵蓋保存／確認，不把下列結果當整份 R01–R18 通過；功能現況仍只見 spec。

- R01／R08／R11／R14 的資料子集：Main 推導 T0／T1／混合計時與逐字 coverage；同原文 timing CAS、來源隔離、no-op、timing／offset A→B→A、重啟後撤銷／過期不復活，壞檔／未知 schema 保留原 bytes。
- R09／R10：草稿起始 session 複製成 plain bridge intent；同來源刷新保留 canonical 身份與 offset FIFO／失敗預覽。Timing→offset 屏障→fresh-read→receipt 分段執行，測試部分成功、回應遺失後重讀、A→B→A 晚成功／失敗／finally，以及已送出確認 token 的取消。
- R12／R17 的程式子集：原媒體替換／觀察到缺失會過期；receipt 目錄轉向拒寫、來源刪除清理、scope／deadline／token 取消後不落盤。FLAC 等價遷移重用既有 fresh alias verifier，收據層以注入證據驗證；真實 FLAC 回寫端到端驗收仍待執行。
- 可見 Electron 使用 production renderer 與全新 Main／preload、隔離 profile／合成 WAV：確認→撤銷→再確認→offset 過期→一般儲存→儲存並確認，逐字邊界由 1500→1600→1700ms，T2／2 行與其中 1 行逐字 coverage 保留。播放穩定後 play／pause 呼叫維持 2／0、renderer errors 為空；亮 960／暗 1280、更多選單與 popover 的 Escape 焦點返回通過。
- 入口僅在編輯歌詞第二級頁面，演唱頁沿既有編輯入口。真實聽辨、Performer／Output 的人工畫面一致性、句級相依與波形記憶體／取消仍依 R02–R07／R15–R18 後續驗，不宣稱裝置或 OBS 校準。
