# 現有 CPU 逐句分流：方法與驗證

日期：2026-10-21。第一階段逐句分流已完成；第二階段句內混語有界研究亦已完成，使用者決定不接入產品。採用決策與未做項目只在[研究結論](lyrics-alignment-summary.md)維護，混語數據及配方見[8 案研究結案](lyrics-mixed-cpu-bounded-2026-10-21.md)，操作見[試用手冊](../../operations/lyrics-alignment-research.md)。本頁保留逐句方法、原始技術依據及當輪驗證，撤下已執行方案的未來式清單。

## 逐句方法與界線

Main 在來源與 offset 快照後，依原 lineId／occurrence 建立中／日／英或未知的行計畫。來源 metadata 與手選只作主要語言提示；可辨識的其他語言句不被整曲標籤強制改讀。沒有全曲語言的來源，只要有可分流的單語句即可執行；明示不支援的來源語言保持拒絕。Latin 或 CMU 可查到不等於英文，未知、句內混語及不足證據保留 T1，來源 T2 逐句優先。

同一聲學窗只跑一次 CPU HubertFA 前端；各行沿用原中文拼音、日文 kuromoji 或英文 CMU prepare／解碼及原文切點。中日 small 呼叫依窗／語言去重，英文保留逐句前後各 500 ms 盲轉寫；不提供預期歌詞、不降低內容或靜音門檻。進度按實際聲學窗與內容工作計數，不估整曲百分比或 ETA。

估計封套 v4 綁定逐行計畫、主要提示、輸入與新配方。舊封套仍可解析，舊配方需重新分析而不刪檔；取消／失敗保留舊有效估計、原歌詞及已完成伴奏，發布前重查來源與行計畫。offset 改動解除套用，重新分析後仍須手動套用。

沿用最多 30 秒聲學窗、20 秒單句、1,000 行來源、30 分鐘音訊及 512 音素狀態等預算。沒有新增模型、套件、環境或 GPU backend，亦不修改 Output 時鐘、正式 gate 與預設下載。可靠混語句內時間、語意斷句、VAD／換氣、聲部與超長單句均未交付。

## 初始技術查核與研究停止條件

最初只讀程式及既有資產，未載入權重；其後音訊研究分開記錄，不能把靜態條件當準確率。既有 vocab、中文／日文／CMU 字典逐 byte／SHA 符合 manifest；字典條目各 615／179／133,805，vocab 有 zh／ja／en 名稱各 63／38／42，名稱數不是互斥類別數或品質指標。

HubertFA 聲學前端共用 144 維音素 logits，decoder 接受完整音素序列及 occurrence 映射；原 prepare 每次只接受一種語言。small auto 每次選一個主要語言，不提供逐詞語言真值。單純將混語送進英文 normalizer 會丟掉 CJK，合成反例曾因此得到 compatibility 1／supported；產品 lexical 限制先擋住此路徑，不能把它報成實際誤接受。

固定上游依據為[HubertFA decoder](https://github.com/wolfgitpr/HubertFA/blob/521281fe52dcedb8f970ca200dc4f00fc2869b08/tools/decoder.py#L27-L49)、[whisper.cpp auto](https://github.com/ggml-org/whisper.cpp/blob/306c88f4d1286aec1bf96e544632897886af5501/src/whisper.cpp#L6255-L6268)與[CLI](https://github.com/ggml-org/whisper.cpp/blob/306c88f4d1286aec1bf96e544632897886af5501/examples/cli/cli.cpp#L265-L270)。原始查核留在 ignored tasks/lyrics-mixed-cpu-feasibility-20261021。

第二階段依此只研究日英／中英聯合音素及分語言、保留順序的盲內容證據；不均分音訊、不內插缺界、不反覆換語言挑結果。原上限 12 案，實際固定 8 案；既有單語與跨主要語言控制沿用第一階段，不重跑。正常 0／4 取得雙語支持後，依原停止條件維持 T1，未將 adapter 接入產品。完整方法、分母、耗時與限制只保留在上述日期報告。

## 第一階段實作與驗證紀錄

Main 建立每個 occurrence 的路由計畫，來源／人工提示只協助主要語言；有明確英文句法的至少四詞短句可作英文候選，仍須既有 CMU prepare、逐句前後各 500 ms 盲轉寫及原 timed content 支持要求才產生 T1+。既有整份正文辨識規則與內容／靜音數值門檻沒有降低；Latin 或查得到發音本身不等於英文。句內混語、不支援文字及不足證據保留 T1。

同窗沿用一次 CPU HFA 前端，依行語言準備／解碼／保留原文切點；中日內容呼叫依窗／語言去重，英文逐句查核。取消會在各語言內容工作間再次檢查，停止後續查核；v4 封套綁定完整行計畫、提示與新配方身分，舊配方需重算而不刪檔。沒有新增 runtime、權重、字典或套件，也未修改 vendor decoder、CPU backend、正式 gate 或預設開關。

聚焦測試涵蓋跨句分流、單一聲學窗共用、英文弱證據、混語拒絕、來源 T2、負 offset 裁切、內容／聲學取消、失敗保留、路由變更與舊封套。現有內容規則模組保持原 bytes；測試使用合成文字，私人來源與可見測試素材只留 ignored 本機目錄。完整工作區回歸與可見功能證據另記於本機驗證收據，人工時間仍 pending。

當輪混合工作區為 982 個測試檔、9,267 項通過、1 項既有略過；coverage S89.48／B82.49／F92.14／L91.72，原 domain／file ratchets 全過。這是當前含並行修改的工作區結果，不是先前歌詞獨立提交快照的分母。78 項聚焦測試、ESLint、變更檔格式、172 份 Markdown 與 production build 通過；build 保留既有 large-chunk warning。

可見 Electron 使用獨立 profile、既有英文錄音與日文來源標籤，建立一個三行隔離 fixture：英文正常行、構造混語 T1 行、人工原生 T2 控制行。一次完整分析取得 7 個英文詞塊，其餘兩行分別維持 T1／來源 T2；另一次重新分析在實際 CPU small 執行中取消，前次估計 bytes 保持，owned workers 退出。非零 offset 變更解除套用、舊估計回傳 `offset-changed`；發現舊取消訊息遮蔽提示後，以先失敗後通過的回歸測試修正優先順序，並完整重啟 App 確認失效提示與 T2 保留，不重跑模型。

原始音訊／歌詞、使用者設定與原安裝完整性前後核對一致；測試 App／已取消 small 程序已退出。啟動腳本的 ready 時序、單曲自動選取定位等失敗亦保留，沒有藉此改產品。此為第一階段功能驗證，不是自然日英混唱整曲品質、OBS 或人工時間驗收。原始資料、截圖、完整測試及失敗日誌位於 ignored `tasks/lyrics-line-routing-20261021/`，私人證據未加入 Git；該次實作驗證時未 commit／push。
