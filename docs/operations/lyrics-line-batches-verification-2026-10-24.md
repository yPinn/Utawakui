# 歌詞逐行批次驗證 — 2026-10-24

本輪將 Output 容量排版改為每條橫行／直欄依序成為獨立 active batch，並修正相同文字不同來源範圍的動畫身分。來源文件、行索引、文字、原起訖、原生 T2 與既有模型時間證據均不改寫；沒有接入模型或重新分析歌曲。

## 行為與修正

- 明確原始換行不因整塊可容納而合回同批。空白分隔符保留在連續來源範圍，短和聲括號可容納時優先一起移往下一批；超長內容保留 grapheme fallback。
- 共用 fit 每批量測一行／一欄；Kinetic、Ornate 與 Manga 消費此結果，避免模板再拆多欄。Live Stage 的 Literal／Balanced 不先把來源換行及空白 flatten；明確保存的 Broadcast Compact 仍沿原策略。
- 每批以來源身分及範圍識別。相同文字新批次重設進場／填色，同批 tick 不重播。T1 填色使用標明衍生依據的頁面進度，只在播放時連續推進；粗／細時間不重估。跳轉及 reduced-motion 直接呈現，取消尚未結束的 caption 入場。
- KTV 保留 active／preview 雙 lane，下一批或下一來源的首行先以相同字型容量限制；預覽不代表另一個 active batch。Live Stage 的 caption 入場與 title-card 時窗獨立。
- 同來源尺寸／字型失效時保留完整已呈現批次，避免先重畫未拆整句而重設動畫。時鐘、最短停留及 unfit 邊界維持；時間不足不以刪詞、縮字或假時間通過。

## 可見尺寸檢查

使用隔離 userData、本機 Output Server、正式 overlay route 與可見 Electron BrowserWindow；每個 content viewport 均為 1920×1080，device scale factor 為 1。沒有載入使用者媒體或曲庫。

| 正式模板        | 合成案例 | 觀測批次畫面 |
| --------------- | -------: | -----------: |
| Karaoke Stack   |       11 |           68 |
| Kinetic Pop     |       11 |           73 |
| Ornate Vertical |       11 |          108 |
| Live Stage      |       11 |          107 |
| Manga Frame     |       11 |          144 |
| 合計            |       55 |          500 |

每個模板含繁中、簡中、英文、日文、韓文長句／多句合塊、無標點、雙空白／tab、原始換行、對唱、括號和聲、製作字樣實唱負例、重複句、emoji／組合字元，以及既有 T1+／T2 合成時間案例。所有來源範圍連續重組相等；確認輪未發現可見字框越界或被祖先容器裁切，Manga／Ornate／Kinetic 未多拆 active 欄／行。這是工程合成診斷，沒有母語盲審或語意正確率宣稱。

第一輪有效截圖另發現 Manga 的日文二次拆欄與 KTV 的舊 fit CSS 隱藏預覽，集中修正後確認。初輪的結構化報告保留文字與字框證據；同名 PNG 為確認輪版本。最早一次 fixture 未同步 lyrics.document 及 activeLineId，誤載舊文字；該輪標為無效，保留失敗報告，不計入通過數。

五模板另以正式 DOM、實際 GSAP／WAAPI 執行相同文字的兩批對照：每個新批次建立一個相應 timeline／填色或 caption 入場；同批 tick 不增建，reduced-motion 與 seek 不重播。舊 Focus 相容路徑由回歸測試涵蓋，不列為已登錄模板或可見矩陣項目。

## 自動檢查與證據

- 36 個測試檔、456 項回歸通過，包含 shared presentation、overlay lyrics、本機 Performer fit 與 packaging dependency closure。
- Output Server 24 項測試通過。沙箱初次 localhost EACCES 的失敗另存，改在可連線的權限範圍重跑，沒有更改產品網路設定。
- 六個核心排版／呈現模組的 focused coverage：lines 95.05%、statements 93.11%、branches 83.43%。不代表全專案覆蓋率。
- 相關 ESLint、格式、Markdown 與 build 通過；build 仍有大型 chunk 提示，未調整打包策略。
- 可見矩陣執行前後的來源 hash 一致。確認輪後另以回歸測試補驗空白加組合字元的邊界、同來源預覽文字快取失效，以及 seek／reduced-motion 取消既有 caption 入場；沒有追加視覺調整輪。
- 測試視窗與 server 自行關閉，於相同啟動權限確認無本次隔離目錄所屬 Electron 程序殘留。不終止其他視窗或程序，不建立提交。

本機原始證據位於 ignored 的 `tasks/lyrics-layout-batches-20261024/`：失敗／通過 logs、fixture、兩個有效矩陣報告、截圖、coverage 與 SHA 基線。這些 scratch 檔不作產品狀態來源；現行行為由[文字處理契約](../contracts/lyrics-text-processing.md)、[時間契約](../contracts/lyrics-timing-contract.md)及[Output runtime](../contracts/output-runtime.md)持有。

## 限制

沒有驗證 OBS 原生擷取、透明合成或實體顯示延遲。字框幾何與可見 Electron 截圖不能替代 OBS 人工驗收。矩陣使用預設正式尺寸與所列字型設定，不宣稱任意極端字級／小畫布都可容納；既有 unfit／untimed 仍明確保留。Ruby 的保留與單欄由單元契約覆蓋，這批可見長句矩陣不額外聲稱完整讀音外擴驗收。容量斷點仍是規則估計，沒有語意拆句或聲學停頓辨識。

## 可讀行長與混語分句後續修正

使用者的實際截圖指出，前述容量／不裁字驗證不足以證明分句合理：KTV 先按每個空白拆出 `…sing`／`it`／`with`／`me`，而寬畫布仍會接受過長橫行。另有兩個整合漏接：一行 current 不投影有界 preview；`currentSourceRange` 只在存在 fine evidence 時才提供，讓一般 KTV 片段被整個原句的 fit 再次覆蓋。

後續修正讓 shared KTV／Output 使用同一組中日文分句空白與 Latin run 界線，保留 fitting Latin 短語；加入橫行 18em 可讀上限及兩行餘量平衡；所有 KTV 層級提供來源範圍，一行也投影有界 preview。原文與 canonical 起訖不變，T1 不因範圍投影而被標成模型時間。日文短依附詞、聲部與括號和聲保留，不接模型。

這次從正式文件通道與 state selector 經 KTV、fit、renderer 跑可見 1920×1080 route，逐次前進所有批次 deadline，不在第一個 fit page 結束就停止。active 來源文字須實際存在於可見 ink；KTV active／preview 分別核對行長、來源範圍與字框。確認結果如下：

| 模板            | 案例 | 批次畫面 |
| --------------- | ---: | -------: |
| Karaoke Stack   |   12 |       54 |
| Kinetic Pop     |   12 |       53 |
| Ornate Vertical |   12 |       73 |
| Live Stage      |   12 |       74 |
| Manga Frame     |   12 |       92 |
| 合計            |   60 |      346 |

每個模板包含原截圖的日文空白、中文長句／空白、中文黏接或空白後的完整英文短語，以及繁簡中／英／韓、日文依附、聲部／和聲與既有 T1+／T2。確認輪全部通過、來源 hash 前後一致。初輪保留了五個聲部案例的 unfit 報告及 PNG，修正標記附著與全層級來源範圍後通過；兩輪檔名分開，沒有覆寫失敗截圖。

實際 KTV 順序包括：`其實我沒有一句歌詞` → `誰能夠做到能完全領會`；`想看見天上璀璨星光` → 完整的 `sing it with me`；日文按來源三段空白依序顯示。更長 Latin 句若自身超過容量仍可按字詞安全候選分批，沒有承諾任意英文長句永不拆。初輪與確認輪同為 reduced-motion 幾何／文字診斷；動畫生命週期另由既有回歸覆蓋，不冒稱新增 OBS 或實體延遲驗收。

本次 92 個測試檔、1260 項相關回歸通過，包含整條來源 → KTV → fit 與三時間層級的 source-range 斷言；修正了前輪尚期待隱藏 KTV companion 的過期 CSS 契約測試。相關 ESLint、Prettier、Markdown、build 與 packaging closure 驗證仍依各 log 記錄。原始資料位於 ignored 的 `tasks/lyrics-phrase-readability-20261024/`。本輪自有 Electron 視窗及伺服器已關閉，沒有建立提交。

## 正常動畫換批的黑閃修正

使用者後續回報換行時先黑再出現。此次以五個模板的正式 1920×1080 可見 Electron route、正常 GSAP／WAAPI 動畫與持續播放合成歌詞重現。來源包括黏接的 `sing it with me`、中文空白分句與括號和聲，涵蓋同來源句內分批及跨來源句交接。先前 reduced-motion 字框診斷不作這個動態問題已通過的證據。

基線中，Ornate Vertical 有 4 個低於 0.05 有效文字透明度的 rAF 樣本，Manga Frame 有 6 個；畫面取樣分別有 1／4 張沒有亮度大於 65 的像素，實際 PNG 可見近黑交接。根因是舊批次先淡出到零，新批次才從零開始淡入。其餘三模板在本次樣本未重現黑閃，不因此更改它們的動畫。

修正後直排的新舊行同時開始進退場；漫畫立即提交新批次，舊泡泡移入單一、無 id 且 aria-hidden 的短暫退場層，同時淡出／淡入，不改原始文字或時間。退場層不參與新批次的泡泡數／讀音結構；完成、快速換批、跳播、reduced-motion、換模板與 dispose 均清理，過期 callback 不得覆蓋新批次。真正沒有歌詞的區間仍照原可見性退出。

第一輪修正檢查與最後確認均未重現低透明度或近黑交接。最後確認共 10559 個 rAF DOM 樣本、701 次實際畫面像素取樣，五模板均為零低透明度／近黑樣本；完成後無退場層殘留，id 唯一且來源程式 hash 前後一致。這是本機合成工程取樣，不代表未取樣影格或 OBS／硬體擷取均已驗證。

92 個測試檔、1264 項相關回歸通過，包含重複文字的新批次、交接中更新、快速打斷、過期完成、跳播、reduced-motion 及 cleanup；相關 ESLint／Prettier、Markdown 與 build 通過，仍保留既有大型 chunk 提示。基線、修正檢查與確認報告／PNG 各自保留在 ignored 的 `tasks/lyrics-handoff-20261024/`，未覆蓋失敗。自有視窗及 server 已退出，不建立提交。

## 製作署名與純和聲提示補正

使用者再提供混音工程、混音助理、人聲製作和錄音、母帶工程及吉他署名仍被顯示的截圖，並要求隱藏純 `（和聲）` 提示。共用標註 v3 補齊完整雙語職稱及有界的 `@ 工作室` 姓名格式；原來的逐行還原 owner 同時管理整行製作資訊與行內提示，UI 明示兩者的差別。

純 `（和聲）`／`(和声)`／`[Backing Vocals]`／`（ハモリ）`／`(코러스)` 等明確標記預設只從 Output 隱藏；混在唱詞中只排除標記。`（啊啊）`、`(oh oh)`、`（一起唱）`、`（啊啊和聲）`、對白、具名聲部、引文與包含實唱的 `(和聲：啊啊)` 保留，並可逐行或全部還原。來源文件、校時及讀音檔不寫入；T2／T1+ 保留片段時間，fine 只重映射文字座標，含被移除提示的 reading 片段取消不再對應的 ruby，不捏造新的讀音或時間。

合成 UI 在閱讀／編輯兩頁、亮色 1280／暗色 960 共四組完成七個預設選用項、分別還原母帶署名與行內提示、恢復全部、切來源回預設及 Popover 邊界檢查。本機歌詞仍保留五種署名、提示與括號唱詞。最後將該 owner 產生的唯讀投影交給獨立可見 Electron 正式 Output route，五模板共七個批次確認沒有製作署名或提示，逐批重組完整保留 `一起唱（啊啊）`；KTV 原角色投影與其他模板的聲部文字規則維持。畫面驗證使用 reduced-motion，不重複宣稱本輪新增正常動畫、OBS 或硬體驗收。

保留的前輪失敗包含：測試銷毀最後視窗後提前退出、0.3 秒合成行無法容納漫畫多批、誤要求漫畫首批包含完整句子，以及混合 UI／Output 測試程序的擷取／初始化失敗。最後改用三秒合成來源行並遍歷所有批次，以獨立 Output 測試程序完成；沒有為了測試而修改產品停留門檻或使用者時間。

收尾檢視另重現 Main 會拒收「原 inferred 結束後的製作／提示行被移除」的合法文件。補上真正的 `parseOutputStreamEnvelope` 回歸後，Output 契約允許保留的有限 inferred end 早於下一個可見的有時間行，尾端信用行全被排除時也可保留；缺少有限 end、跨過下一個有時間行仍拒絕，未放寬來源時間或段落編輯。原有紅測試保留。完整重啟隔離 Electron 後，五模板的投影先經 Main 契約驗證，再完成上述全部七批檢查；這與單純 server 接受合成快照分開記錄。

最終 95 檔、1363 項相關回歸通過，含實際 publisher 發布／還原、T2 純提示 segment 排除後 active id、T1+ fine 座標與所有保留時間、reading、Main schema、projection 與來源保真。相關 ESLint、Prettier、Markdown、build 及 packaging closure 通過；原大型 chunk 提示維持。原始 logs、失敗報告、四組 UI 結果及五模板批次 PNG 位於 ignored 的 `tasks/lyrics-cast-followup-20261024/`，未建立提交。

## 聲部與歌手前綴的共用投影

Output 文字標註 v4 將明確男／女／合唱及曲目藝人可確認的姓名前綴隱藏，正文另附有界 `vocalParts`。來源文字、校時及讀音檔保留；同塊多聲部、獨立標記後續承接、逐行還原及保留 T2／T1+ 原片段／fine 時間均有測試。無藝人證據的姓名形前綴保留為預設不勾選候選，不將冒號、引文或括號唱詞直接刪除。

可見 Electron 的正式 Main parser → split document → state → fit → renderer 路徑完成五模板 × 十二組案例，共六十組、一百三十二個逐批畫面。案例涵蓋繁簡中、英、日、韓、男／女／合唱切換、已知歌手、獨立標記、字面 `[oh oh]`、未知姓名、逐行還原、T2 與 T1+。KTV 驗當批角色；漫畫另完成十二組、二十九批的實際氣泡文字／畫面邊界檢查。使用減少動態效果診斷文字與幾何，本輪不新增正常動畫或 OBS／硬體驗收主張。

保留初輪失敗：探針未跨原生片段空隙、GPU 擷取失敗、漫畫字面括號被舊 speaker 附著規則阻擋，以及探針誤用 aria-hidden／要求行尾空白畫出。產品修正為共用層明示字面前綴後模板不再另猜，保留空陣列角色 metadata；漫畫的 `[oh oh]` 可獨立完整成批。其他探針問題分別修正，未修改來源時間、停留門檻或縮小字級來通過。

最後的契約檢視也補齊最大來源 documentId 的有界衍生 ID，避免加入版本後綴超過 Main 上限。文字／角色改變會取得不同衍生身分，還原時保留內部角色，不再由 KTV 或漫畫二次隱藏標記。測試、畫面及各失敗報告保留於 ignored 的 `tasks/lyrics-vocal-labels/`，不建立提交。

本輪最終九十五個測試檔、一千四百項相關回歸通過，包含 packaging dependency closure；ESLint、Prettier、二百零一份 Markdown、production build 與 diff check 通過，保留既有大型 chunk 提示。隔離驗證程序已退出，不更動其他執行中的程式。

## 預覽預先分批、連續列位與句間黑閃補正

2026-10-25 使用者指出 `Oh, you ask 秋招?` 仍被逗號拆批、長句的容量批次沒有接續雙列位置，以及下一句到播放才重新分行。回歸先重現純英文保護漏掉混語，以及預覽二十字、播放首批八字的差異；再以同一量測批次序列供 KTV 的 active／preview／count-in 選取。批次依來源範圍識別，列位按實際批次連續交替；來源時間、聲部、讀音與合法細填色範圍保留。切換 active 行不清掉既有幾何，尺寸／字型／來源變更仍失效。

使用者後續回報黑閃復發，持續播放重現另一個原因：連續句間隔大於既有六百毫秒完成保留時，整個雙列會先清空。原生 T2 一秒句間隔在修正前取得二千一百一十八個 rAF 樣本，其中一百九十二個空白；一百三十四次實際畫面擷取有十次全黑。改為在既有五秒重新進場門檻內，靜態保留已完成文字到下一原始起點；進度不延長、實唱時間不改，長休止與尾段規則保留。同一案例修正後二千一百二十二個 rAF、一百四十二次像素取樣均無空白／全黑。舊測試原先明確要求六百毫秒後隱藏，本輪依使用者要求修正該行為契約，並補 T1／T2／T1+ 回歸。

正式 Main parser → 可見 1920×1080 路由完成五模板、九十五組、一百一十七批，包含繁簡中／英／日／韓的短標點句；KTV 另四組十九批、一千三百三十個 rAF 驗預覽轉 active、兩／三容量批次跨來源續列與冷跳播一致。五模板正常持續播放共一萬零五百六十九個 rAF、七百次實際像素取樣，零空白／全黑；停止播放收斂後無退場層殘留或重複 id。這些是本機合成工程樣本，不代表 OBS 或硬體驗收。

一百零六檔、一千六百零一項相關回歸，另二十四項實際 loopback server 測試通過；ESLint、Prettier、Markdown、build 與封裝／架構契約通過，保留原大 chunk 提示。失敗基線、黑圖、簡中混語新增漏判、GPU 擷取重試與探針未等待退場收斂的修正均保存在 ignored 的 `tasks/ktv-preview-20261025/`。專屬程序已退出；沒有新增模型、改來源或額外提交。新 `ktvDisplayFit.mjs` 只有 Browser Source 本地幾何快取，已加入精確 HTTP 白名單及封裝檢查，使用中的程式需完整重啟才能載入新路由。

階段提交另從已提交基線重建獨立來源樹，只套用本輪分句、預覽、列位、黑閃與精確和聲回歸；未依賴其他未提交邏輯。該來源樹的一百零四檔、一千五百八十四項相關測試及二十四項 Output loopback 測試通過，ESLint、Prettier、build、封裝與架構檢查亦通過。純 `(和聲)`／`（和聲）` 及簡體版本沿用既有共用預設，新增 owner 回歸固定整行／行內隱藏、正文保留、原始時間與逐行還原。
