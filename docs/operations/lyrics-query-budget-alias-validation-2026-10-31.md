# 歌詞查詢預算、跨語別名與背景流量驗證

2026-10-31依已確認的[方案](../research/lyrics-providers/query-budget-alias-provider-refactor-proposal-2026-10-31.md)實作，保留未提交工作樹。現行規則由[來源契約](../contracts/lyrics-sources.md)與[請求契約](../contracts/external-service-request-policy.md)持有，本文件記錄這次證據及限制。

## 原始輸入真實查詢

2026-10-31 13:24（Asia/Taipei），以正式Main acquisition service、四個正式client及新resolver查詢原始`Hana No Uta`／`Aimer`，duration371秒、未知專輯。沒有人工填入日文、預載cache、模擬primary miss、保存歌詞或修改曲庫。

實際10次HTTP，約9730ms：LRCLIB503一次、NetEase200一次而無合格候選、Better Lyrics401一次；Apple US search與同id JP lookup各一次；Kugou原文catalog與自動日文別名catalog各一次、歌詞列表一次、LRC下載兩次。Apple請求起點間隔3108ms，Kugou五次起點間隔均至少1000ms。

取得兩個`花の唄`／`Aimer`、373秒的T1候選，分別63與64個時間行，通過原始身份、完整歌手、版本、四秒時長及LRC標記驗證。Kugou達五次階段額度，回partial並保留兩個選擇；不追加請求湊第三個。這是同錄音組的兩個歌詞候選，不當成兩個已證明不同的錄音版本。沒有完整歌詞內容／音訊同步或原生畫面人工驗收，不以此單例推論多語覆蓋率。

正式離線整合測試另覆蓋相同原始輸入的自動alias→Kugou→所選候選fresh保存，證據snapshot與fingerprint綁定，原始track title保持不變。錯id、歌手、合作署名、版本、duration及native title歧義皆拒絕；cache重啟／到期／損毀與證據過期保存拒絕另有測試。

## 預算與請求分層

- Main擁有操作階段與父預算：初查12HTTP／20秒、更多新增8HTTP／15秒、保存另建3HTTP／12秒。
- 初查primary最多4HTTP／6秒、alias2／6秒、Kugou5／8秒，所有階段同扣原父預算。T0保留但不阻擋同步歌詞備援。
- 擴搜primary最多3HTTP，先LRCLIB1及NetEase2，讓metadata後仍能取得歌詞；Better相同查詢再用cache或剩餘額度。別名最多2，備援保留最低3次請求額度；時間仍受原父deadline限制。
- 共用request policy統一實際扣額、來源佇列、endpoint cache、coalescing與fresh失效；同session多個訂閱者共用一次物理請求只扣父一次。全域最多兩個操作，背景最多一個；各adapter保留自己的固定endpoint、codec與身份驗證。
- Apple只提供有證據的US→JP名稱映射，不提供歌詞；來源節奏3100ms，正cache30天、正常負cache30分鐘、64個identity。未知duration或無法證明唯一身份時不猜別名。
- 整合及背景不啟動503短重試。Kugou必要origin冷卻時，在Apple別名與catalog之前停止備援，省下無法完成的查詢。

## 背景自動取得稽核

觸發點是`importHandlers.js`的音訊匯入完成與`libraryHandlers.js`的metadata backfill完成，都交給同一acquisition service；不是每次播放或展開面板就抓取。先前雖有預設一次一首及同曲五分鐘去重，跨曲沒有起點間隔、待執行佇列也沒有數量界線，因此大量匯入可連續占用來源佇列。移除AMLL不會降低這項流量，因其原本已不在正式查詢registry。

現在背景維持LRCLIB／NetEase、exact-only、完整T2跳過與保存前generation gate，另外限制：

- 預設一次一首、最多32首待執行、不同曲目起點至少30秒；滿載直接skipped，不無界排程。大量待執行歌曲可能等待數分鐘，不影響音訊匯入成功。
- 每曲含fresh保存最多7次實際HTTP／30秒；探索LRCLIB最多2、NetEase最多3，保存另受來源及同一父預算限制。
- 每來源背景起點至少5秒，rolling60秒最多12次物理請求；與手動、保存共用來源冷卻及基礎節奏。達額度即停止，沒有背景延後重試。
- 全域保留一個互動操作空間，仍在佇列的互動優先；已送出的背景請求不搶斷。這是App內控制，不是上游官方配額，也不涵蓋其他程序或同IP流量。

合成四曲批次使用正式LRCLIB／NetEase clients、共享policy、模擬transport與可控時間，包含探索及保存重取：共20次物理請求，每首5次、全部保存；驗證同來源間隔至少5秒、任意觀測rolling60秒不超過12次。另覆蓋同曲single-flight、30秒起點、34首滿載拒絕及互動保留空間。這是流量控制測試，沒有向網站送批次測試。

現有診斷檔只有7筆lyrics相關歷史錯誤，缺少背景請求數摘要，不能倒推過去每分鐘實際頻率。新增整合及背景操作的物理HTTP總數／耗時摘要，不帶title、artist、query、歌詞、URL或credential；Main更新後需完整重啟才會開始記錄。未以缺少429日誌當成從未限流的證據。

## AMLL移除與資料保留

Better改用中立`lyricsFormats/ttml.js`，維持原golden驗證及sax依賴。刪除AMLL barrel／candidate／storage及可執行研究adapter，研究default registry改為LRCLIB／Kugou原生逐行probe；歷史報告及純fixture保留。正式runtime只剩一次性遷移辨識所需的舊識別字。

以刪除前實際舊writer產生的合成fixture驗證：備份原manifest及provider artifact，來源轉manual，原LRC、timing、offset、偏好、讀音及聲部bytes不變；原T2 sidecar仍為current。原始TTML／投稿provenance保留在migration backup，active provider artifact移走。測試包含冪等、發布失敗還原、備份位置不可寫仍可讀本機歌詞、拒絕artifact路徑跳脫。沒有對使用者真實曲庫執行批次遷移。

## 回歸與邊界

最終74組／1132項定向回歸通過，涵蓋四個provider、共用policy／cooldown、Main／renderer acquisition、舊資料遷移、研究CLI及打包依賴。新增session／executor／request policy／resolver／migration五個模組的Istanbul coverage為statements90.12%、branches82.71%、functions93.65%、lines93.73%，原門檻通過。

另補既有library歌詞manifest／timing／讀音／聲部／review store相容性8組／145項，全部通過；兩批合計82組／1277項。合成研究fixture格式化後，相關CLI／runner／review的3組／98項亦重驗通過，不重複計入總數。

Review先重現再修正：more耗盡前階段後只剩兩次備援、more只分一次NetEase而無法hydration、3秒HTTP timeout被3.1秒queue耗盡、供應父budget時忽略獨立取消、alias await後未重查gate、必要download冷卻後仍做metadata。新測試均轉綠，保留失敗收據。舊matching fixture改注入可控scheduler，沒有提高unit timeout；Windows hardlink測試先在sandbox遇EPERM，保留安全測試並用正常檔案連結權限重跑通過。

Renderer production build與獨立Main／preload／worker runtime build通過，Main bundle依賴閉包沒有AMLL模組且包含中立parser與migration；沒有新增runtime依賴。完整ESLint、Markdown、owned-file格式及diff檢查完成。原始查詢與失敗／修正收據位於本機ignored `tasks/lyrics-redesign-implementation/`，不隨安裝包發布；不能用ignored scratch代替以上現行契約。

未操作Owner App／OBS、未安裝新套件、未建立commit。Electron Main與preload不由Vite HMR更新，完整重啟後才載入新流程。
