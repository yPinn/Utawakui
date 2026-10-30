# 現有八模板完成度與架構責任盤點

本文件保留當輪盤點證據；共用架構、預覽一致性與驗收基礎的分階段工作，統一維護於[現行計畫](../governance/appearance-sets-plan.md#實作階段與依賴順序)。

日期：2026-10-20。範圍：目前工作目錄中的八個正式 Gallery 模板，對照[外觀 set 標準草案](../governance/appearance-sets-plan.md)。
本輪只讀程式、測試、契約與既有證據，查看八張縮圖並執行既有測試；不修改產品程式、圖片、gate、schema 或付費權限。

結論：八個模板都有實作基礎，但沒有任何一個能據此認定通過完整 set 交付標準。
應先處理真實預覽／素材來源、共同驗收情境與責任邊界，再打磨 default 與一個代表性 set；遠端 pack 與付款不是開始改善視覺品質的前置工作。
目前工作樹包含其他未提交修改，因此此盤點是本輪 checkout 快照，不等同已發布 v0.4.0，也不歸因修改來自誰。

## 證據與完成度的讀法

本報告不用完成百分比，避免把測試數、檔案數或有動畫當成作品完成度。

| 標記     | 意義                                                   |
| -------- | ------------------------------------------------------ |
| 已有基礎 | 可在目前程式／測試找到實作，仍須通過相應可見驗收       |
| 確定缺口 | 現有程式／資產與標準明確不符，或契約明示尚未交付       |
| 待決定   | 產品範圍或可調整性尚未明定，不直接當作 bug             |
| 待驗證   | 沒有覆蓋本模板／版本／情境的實機證據；不等同已證實失敗 |

本輪兩組測試去重後共 73 份檔案、757 項通過，包含 Overlay、shared presentation、appearance／capture／registry、Gallery／Workbench 元件與預覽。
它們多為純函式、DOM mocks 或 source／CSS 契約，不能單獨證明 OBS 可讀性、alpha、實際字型載入、GPU 負載或長時間穩定性。
模板身份、capture、外觀欄位、timing capabilities、縮圖尺寸／大小／SHA-256 與測試統計保存在[快照 JSON](../governance/data/appearance-template-audit-2026-10-20.json)。

未啟動使用者 App／OBS、未連線外部素材服務、未進行新一輪動態視覺或實機驗收；所有相關結論保留待驗證。
本輪確認的是原始碼與靜態交付缺口，不是八模板的最終美術評分。

## 共同完成度概況

| 標準面向       | 現有證據                                                                                                       | 完成度缺口與責任                                                                                               |
| -------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 狀態與時鐘     | shared presentation、Output split content/state、boot／epoch／revision、connection 與 reconnect 已有實作與測試 | 保留現有權威；補八模板相同情境的可見驗收。屬共用 host／projection，不由 set 自訂連線或播放器                   |
| 外觀設定       | schema v5、template-specific keys、值域驗證、CSS layers、local font sanitization 已有                          | 基本可調整能力在各模板不一致；需明列哪些是安全限制、哪些可共用擴充。不是把所有欄位無條件開給全部模板           |
| 排版與語言     | 各家有換行、分句、直書、ruby、source mapping、clamp／ellipsis 等基礎                                           | 缺按模板固定的語言／字長／缺字與畫布驗收表；不能因一個模板測到日文就宣布八個都支援所有語言                     |
| 時間能力       | Lyrics capability registry 明列 T1、T2 與 scheduler 差異                                                       | 華綴直書不消費 T2 是現有範圍；其他模板也有不同映射，不能統稱精準逐字。T0／缺同步資料的行為須個別驗收與明示     |
| 生命週期／動態 | reduced motion、seek discontinuity、動畫清理、disconnect suspend 已有不同實作                                  | 共用生命週期契約與一致情境待補，不把不同模板動畫強行合成同一 timeline                                          |
| Preview／展示  | Gallery 靜態圖、lazy mockup、Workbench 真實路由、共享部分純 presentation 已有                                  | 四張縮圖不是模板實際呈現；mockup 仍有獨立 DOM／CSS 與固定場景，未具備八模板輸出一致性證據                      |
| 資產／附文     | 五個 bundled fonts 已有 SOURCE／license 與字型契約測試；GSAP／其他附文既有清單可追溯                           | 不把授權盤點全部重做；按 set 建立引用閉包，特別補四張非模板縮圖的來源／替換與示範內容依據                      |
| Set 交付       | 固定三 slot、八 template ids 與 placeholder styleSetIds                                                        | 沒有正式逐 set 內容／版本清單或 remote pack activation；作品 identity 與交付 schema 仍在規劃，不是已有付費 set |
| 效能與實機     | 已有啟動／first-frame 調查與 baseline；測試有清理與降級                                                        | 不能代替八模板個別 OBS／冷載／壓力／長時間紀錄；H3 契約也保留未定預算與矩陣                                    |

主要來源：[模板 registry](../../shared/outputTemplateValues.json)、[外觀 schema](../../shared/outputAppearance.mjs)、[歌詞能力表](../../shared/presentation/lyricsTemplateCapabilities.mjs)、[共用 connection](../../overlay/shared/runtime.mjs)、[pack contract](../contracts/overlay-pack.md)、[Output hardening](../contracts/output-runtime.md)。

## 八模板逐項盤點

表中的優先順序是工程與驗收順序，不是付費級距或美術品質排名；八個目前都不是可售 set。

| 模板／畫布                          | 已有基礎與可保留內容                                                                                                                                                 | 具體缺口／待驗證                                                                                                                                                                                                    | 建議處理順序                                                                                |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 黑幕歌單 queue-board；480×810       | 目前曲目／已唱投影、兩行 title、history overflow 分頁、同曲 identity、fade／reduced motion、hidden suspend／cleanup 有測試；沒有把待唱列混進已唱                     | Gallery mockup 使用另一套連續捲動 CSS，真實 runtime 是停留分頁與淡出重置，缺一致性判準；長 sourceName、長 artist、空 history、追加與重排、字型載入後重測須可見驗收。只支援 large 是現行設計，不是缺少 small 的 bug  | 第一批 default；先把相同資料與狀態的 preview／runtime 結果固定，再檢查密度與長清單節奏      |
| 經典伴唱 karaoke-stack；1920×1080   | 雙 lane、倒數、T1 估算掃色、可信 T2 source-mapped phrases、空白／標點與 lane 替換測試；jf open-huninn SOURCE／OFL 既有                                               | 靜態縮圖是貓咪麥克風圖，不展示模板；可調項僅 palette／lookAmount／fontScale，位置／基本對比調整需範圍決策；混合 CJK／拉丁長句、無時間／無 BPM、極短 T2、seek／換曲、亮背景描邊與 alpha 待實機驗收                   | 第一批 default；其 timing／lane 是 App 模板能力，藍框／角色色／字型搭配才是 set 表現        |
| 霓彩跳字 kinetic-pop；1920×1080     | 三材料在一模板、三個 depth／rim／fill track、weighted phrases／T2 source mapping、可中斷換句、reduced motion、active-only will-change；motion 純函式與兩字型來源已有 | Gallery 固定 candy-rim 樣本，不能證明三材料、輪替、跨句與極端長詞的真實結果；多層字數成本、陰影／描邊在背景上的可讀性、已顯示後字型換入須量測；三材料不是三個獨立 set                                               | default 通過後的代表性壓力樣本；在同一模板內驗證資料與視覺參數分離，不先增新材料            |
| 華綴直書 ornate-vertical；1920×1080 | Han／kana／grapheme 分組、可靠邊界拆成至多兩欄、固定右側 anchor、受限 X／Y、兩種字型、typed reveal 與 seek／中斷處理有測試；不消費 T2                                | 明定日文優先與其他語言長文的可用邊界；最大內容、兩欄高度、實際 fallback 字寬／字高、不同背景的明朝細節與墨層可讀性待驗證。T2 不消費不用為追求功能表而補成掃色                                                       | 第二批；可作參數／字型／anchor 較清楚的宣告式 set 樣本，再確認與 canonical preview 的差異   |
| 漫畫對白 manga-frame；1920×1080     | App-owned SVG 框型、literal text、日文 ruby atomic groups、分欄／標點、T2 bubbles、seek 回退、序列進場與 cleanup 有測試；GenEi Antique 來源／OFL 既有                | 靜態縮圖是漫畫畫面，不是目前程式輸出；應替換或建立可交付依據。各框型、旁白／括號、極長 ruby／拉丁／韓文、文字對比與框內安全區待驗證；版面規則與裝飾 path 現在同在 contract，分工需澄清                              | 較後；先固定直書與文字 fit／ruby 契約，再打磨框型及分鏡節奏，不把 framing 創作抽成全域 host |
| 舞台轉播 live-stage；1920×1080      | broadcast-compact／balanced／literal、T1 分頁／T2 source-mapped pages、title-card 時窗、literal rendering、動態清理、local font 選取與對比選項已有                   | 靜態縮圖是帶攝影署名的人物舞台照，來源與散布依據未在本輪找到。實際 HTML／mockup 固定 U／UTAWAKUI／UW；要明定這是作品標識或未來可替換品牌欄位。三種文字策略、長 credit／雙行、首次載入／中途加入的卡片行為待可見驗收 | 第二批；先確定品牌／可調範圍與字型 fallback，再作完整舞台情境；不以攝影圖當作品展示         |
| 星染黑膠 art-card；480×270          | 黑膠／封套／唱臂由程式圖形組成、封面安全路由／預載／fallback、封面色彩與文字色調分析、交換中斷、seek 不重啟旋轉、靜態降級與 cleanup 有測試                           | 靜態縮圖是室內星空唱盤插畫，不是 runtime；畫面來源／權利不能由 README 的自有宣告推定。兩個 sleeve 及 palette cache、動態遮罩成本、極端封面／無封面與 small 字級可讀性待實測；名稱／實際雙區構圖／呈現範圍須一致     | 第一批 default 中的高成本個案；先用真實輸出固定最低可讀基線，之後打磨機械與星染材質         |
| 封面播放卡 cover-player；480×540    | 與 art-card 共用 artwork frame／loader／palette／fallback，runtime 顯示真實 progress／時間並以 transform 更新；目前封面與單行文字有界                                | mockup 固定 0:23／-3:27 與示意 transport，沒有證明 pause／seek／duration=0 等等價；runtime 單行 ellipsis 的長 title／artist 保留量須決策與驗收；圖片錯誤、比例與對比、換模板後殘留狀態待實機測                      | 第一批 default 後的低額外成本對照案例；先驗證 artwork 家族共用能力，再做作品化構圖          |

各模板都還需要作品描述、宣告範圍、來源閉包、版本與相容性紀錄、失敗回退及實機驗收；表中只列各自特有的差異，不重複當成八組架構重寫。
focus-line、now-next 等名稱仍出現在相容／能力或測試中，但不在八個 active Gallery registry，本輪不擴列為新商品。

## 已確認的縮圖交付缺口

Gallery registry 以檔名直接打包引用以下資產，並非只存在研究資料夾。八張均已本輪查看。

| 模板          | 現有圖像／尺寸                                                      | 判斷                                                                                                                           |
| ------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| karaoke-stack | 貓咪與麥克風圖，1199×887                                            | 沒有展示實際雙 lane 模板；不是 README 要求的 1280×720。來源／可交付依據待補，不能直接宣告侵權或推定自有                        |
| live-stage    | 帶 NUNA V／copyright 字樣的舞台人物照，2048×1365，333646 bytes      | 非模板截圖，非 1280×720；超過 README 的建議 200 KB，大小建議本身不是硬錯誤。須釐清來源或換成真實模板展示，不移除署名來偽裝自有 |
| manga-frame   | 漫畫畫面，750×422                                                   | 非程式 SVG＋歌詞實際輸出；來源與散布依據待核，不能把作品風格參考當已交付 set                                                   |
| art-card      | 星空室內唱盤插畫，1194×669                                          | 與 runtime 實際封套／唱盤構圖不同；未見該圖逐項來源證據，不因看起來像插畫推定其生成方式或權利                                  |
| 其餘四張      | queue-board、kinetic-pop、ornate-vertical、cover-player 均 1280×720 | 圖像與模板呈現相符，README 有程式生成描述；仍未記錄與目前 runtime commit／參數的同步關係，不能作完整視覺驗收                   |

來源：[縮圖規格](../../src/assets/output-template-thumbnails/README.md)、[實際打包 registry](../../src/utils/outputTemplateThumbnails.js)、[尺寸與 hash 快照](../governance/data/appearance-template-audit-2026-10-20.json)。
縮圖可用性／檔名單元測試會通過，不代表內容準確或素材權利已確認；後續驗收需加入人工內容核對與來源紀錄。

## 哪些責任放哪一層

不將所有東西直接搬到 shared，也不因只被一個模板使用就把可執行程式塞進外觀包。
「App-owned 模板家族」是必要的中間層：可以只有一個消費者，仍由免費 App 交付與測試。

| 責任                                                                                                                  | 歸屬                                       | 現況／下一步                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| state／clock／queue／lyrics 權威、source identity、取消與重連、schema／值域、安全路由、透明畫布與強制限制             | 共用 host／projection                      | 已有大部分，保留既有 ownership；不讓每個 set 複製 WebSocket 或取得檔案／URL                                               |
| 可見性／斷線／pagehide 的停止與恢復、reduced-motion 通知、font readiness／fallback、失敗呈現                          | 共用 host 契約＋各模板 adapter             | 路由已有各自實作，不是從零開發；先統一狀態矩陣與清理要求，再決定哪些 helper 真正可合併。字型 readiness 不等於一律阻塞首幀 |
| 相同 canonical 情境、playback／lyrics projections、尺寸／安全區語意、來源映射、預覽對照規則                           | 共用純函式與驗收基礎                       | 部分在 shared/presentation；補 canonical fixtures 與 parity 證據。Gallery 可以保留輕量 mockup，不必全面重寫成 iframe      |
| KTV lane／segment mask、漫畫框內 fit／ruby、直書分組、Kinetic 的可執行揭露算法、Live Stage 分頁／卡片、黑膠交換／旋轉 | App-owned template／family                 | 控制幾何、時間與行為的程式留在 App；不是 set 任意執行的 script。共通數學／資料語意可以抽取，藝術特有流程不強行泛化        |
| Artwork loader／圖片錯誤／色彩取樣／metadata／進度格式                                                                | Now Playing 家族；共通需求成立再向上提升   | art-card／cover-player 已共用 artworkLayout；將 loader／palette 與黑膠材質生成責任分清，但不先為八模板做萬用 artwork host |
| 自有色彩／材質／構圖預設、字型角色與已驗證資產、框型裝飾、受限動畫 recipe 參數                                        | 個別 Official Style Set／Presentation Pack | 選擇受信任的 App recipe 或資產；path／token 值必須符合 contract，不能含 arbitrary CSS／JS／shader 或自己發網路請求        |
| 品牌的可用欄位／安全文字規則                                                                                          | 共用或模板家族 schema                      | 是否提供個人品牌是待決事項；若提供，安全欄位屬 App，U／UW 等實際 logo／字樣屬 set 資產或預設，不應污染 track／lyrics 狀態 |
| 作品名稱、作者、內容範圍、引用與 license、版本／相容性、驗收結果、展示截圖                                            | 個別 set 紀錄，採共用格式                  | 現在缺作品級交付；先建紀錄與樣本，不需先做遠端商城                                                                        |
| 購買／贈送／活動來源與使用權復原                                                                                      | 獨立 entitlement／交付邊界，後續工作       | 不加入 set 渲染或 feature gate；本輪不設計資料庫、帳號、點數、付款或廣告                                                  |

界線範例：Kinetic 三層字形的 DOM／timeline 是 App recipe，配色與在值域內的材料參數是 set；漫畫安全的直書／ruby 版面是 App family，具體框型美術與預設組合是 set；黑膠轉動／交換狀態機是 App family，星染材質與字體搭配是 set。
目前 repo 的檔案位置不等同最終內容歸屬；shared/presentation 內有藝術特有函式也不表示每個模板都應採相同風格。

## 依影響排序的缺口清單

本輪沒有確認會阻斷現有播放的 P0。以下 P1 表示在作品交付或對外展示前須處理，P2 表示需收斂的架構／產品範圍；不把所有待驗證項當成已發生的 runtime 故障。

| 編號／優先         | 問題與位置                                                                                     | 影響                                                                      | 改善方向與退出條件                                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| G01／P1 確定缺口   | 四張非模板縮圖；src/assets/output-template-thumbnails/                                         | Gallery 與商品預覽不能代表實際輸出，且來源閉包不足                        | 用有適用權利的 canonical scene 生成真實展示並記錄來源／版本；八張逐項人工核對，研究參考圖不隨商品混入。對應 impeccable harden／clarify |
| G02／P1 確定缺口   | 固定 template registry／placeholder styleSetIds，pack contract 明示仍規劃                      | 有模板 ID 不等於有可交付作品與版本                                        | 每個樣本先有明列範圍、來源、相容性與驗收紀錄；先不實作遠端 updater／支付。對應 impeccable shape                                        |
| G03／P1 確定缺口   | Gallery previews 與 route runtime 的獨立 DOM／CSS／固定資料                                    | 畫面、分頁、材料及狀態展示會各自演進，source-string 測試不足以證明 parity | 共用 canonical scenarios，定義允許的縮略差異；同資料／尺寸下對照真實輸出，動態有自己的比較規則。對應 impeccable audit／harden          |
| G04／P1 待驗證     | 八模板 OBS／多語／亮暗背景／alpha／字型與長時間矩陣                                            | 未能證明 set 在宣告環境可用；不可宣傳完成                                 | 每個模板保留版本化結果，過程引用既有 manual-acceptance；不借用 source smoke 或別模板結果。對應 impeccable audit                        |
| G05／P1 待驗證     | 各模板效能預算與實測不足，H3 仍保留未定 rows                                                   | 多層字形／SVG／遮罩在真實 OBS 的成本沒有比較依據                          | 先定測法與代表硬體／場景，再定預算；不填臆測的 FPS／延遲或沿用初始化調查作商品保證。對應 impeccable optimize                           |
| G06／P2 待決定     | shared/outputAppearance.mjs 的 template-specific keys、Live Stage 固定品牌                     | set 標準的基本調整與具體藝術約束尚未逐項對照                              | 宣告最低免費可調項及每模板合理限制；新欄位保留 main 驗證，不把藝術差異都抽成全域任意 CSS。對應 impeccable shape／clarify               |
| G07／P2 確定缺口   | docs/operations/manual-acceptance.md 仍引用 Now／Next、Simple Black B 等非 active Gallery 名稱 | 後續可能驗錯模板或漏測八個實際項目                                        | 建立 registry 對應的驗收附表；相容名稱另註，不將舊 checklist 勾選當全部通過。對應 impeccable clarify                                   |
| G08／P2 結構性改善 | lyrics.mjs、setlist.mjs、now-playing.mjs 的 lifecycle／font readiness／motion adapter          | 不同入口需重複證明資源釋放與狀態回復；尚未證明有具體漏清理 bug            | 先列共同事件契約／測例，保留藝術 controller；達成共同行為後再最小抽取，避免提前做萬用引擎。對應 impeccable harden                      |

完成上述必要工作後，才以 impeccable polish 作最後一輪個別作品修整；本輪不執行修改命令，也不把沒有視覺量測的項目給出 WCAG 違規或完成百分比判決。

## 建議改善順序與每階段退出條件

| 階段                    | 工作與模板順序                                                                                         | 退出條件                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| 1：證據與定義           | 處理 G01；八模板的用途／語言／timing／尺寸／可調項紀錄；修正驗收索引                                   | 縮圖能代表作品且有來源，八模板都有一致格式的範圍表；先不擴新樣式                                        |
| 2：共用驗收與 host 契約 | Canonical scenarios、preview parity、lifecycle／fallback／font 狀態、效能測法                          | 相同輸入可重現地比較 Gallery／Workbench／runtime；每條測試知道驗證哪個層次，不要求先完成遠端 pack       |
| 3：免費 default 基線    | queue-board → karaoke-stack → art-card；cover-player 作 artwork 家族對照                               | 三種用途都能在宣告尺寸、缺資料與實機狀態下完成驗收；art-card 成本高可分次處理，但不得把免費基線故意做差 |
| 4：代表性額外 set       | 先 kinetic-pop 驗證多層材料／motion 的壓力與參數邊界，再 ornate-vertical；其後 live-stage、manga-frame | 每次只把一個明示範圍的作品推到標準，包括來源、真實展示與 OBS 結果；單用途可成立，不追求湊齊多包         |
| 5：交付與取得機制       | 作品 identity／版本、相容性、原包修復策略、離線保存與復原；後續才談取得                                | 作品已達標再決定最小交付方案；付款／點數／廣告不列視覺改善工作的前置條件                                |

這個順序以覆蓋共用能力、保護 default 與控制實作成本為依據，不表示 kinetic-pop 比其他樣式美觀或最適合市場。
若使用者先選定某個藝術方向，可以調整第 4 階段順序；共用驗收與來源標準不因順序改變而略過。

## 技術掃描與證據限制

Impeccable detector 對 overlay、shared/presentation、src/components/output 產生 40 筆提示：對比 6、字型 28、gradient text 1、動態圖片無 src 2、裝飾條紋 1、radius 1、layout transition 1。
逐類核對後，34 筆不能當作產品缺陷：包含測試 assertion 字串被掃到、Overlay 專用字型被拿控制台 typography 判斷、藝術材料／機械紋理、隱藏後由驗證路由載入的圖片，以及測試明確禁止的 width transition。
其餘 6 筆白字／白底對比提示沒有還原透明 OBS 背景、描邊與各模板狀態，列入待量測，不直接宣告 WCAG AA 失敗。
這些提示沒有發現 G01 的圖片內容失配，顯示不能用靜態 detector 代替資產人工核對。

| 技術查核面向 | 本輪可以支持的結論                                           | 尚不能給的結論                                                                                |
| ------------ | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| 可及性       | 語義文字、aria-hidden 視覺層、reduced motion 等已有測試      | 未量測真實背景／輸出，不給 AA 通過或數字分數                                                  |
| 效能         | 去重、動畫中斷／清理、局部 will-change、啟動量測已有         | 未作八模板 OBS 壓力／長時間測量，不給 FPS／效能完成分數                                       |
| 主題與責任   | `--ovl-*` 與 `--ui-*` 分界及 appearance schema 已有          | 不因 Overlay 有自己的藝術色彩／字型就判定 token 漂移                                          |
| 尺寸適配     | Registry 有每模板指定 capture；部分 fit／clamp／分欄測試已有 | 透明 Browser Source 不是手機操作頁；固定 capture 不等於 responsive 缺陷，超出宣告尺寸仍待驗證 |
| 實作完整性   | 共有契約與測試基礎可延續；確認預覽／交付與素材缺口           | 不計算容易誤導的總分或假定視覺成品已完成                                                      |

本輪保留的既有工作值得維持：main-owned 安全與狀態邊界、canonical 純 presentation、精確／估計 timing 區分、動畫中斷、無 GSAP 靜態降級、字型來源／附文與懶載入預覽。
後續改善應補齊標準並收斂重複責任，而非先推翻現有 runtime 或一口氣重做八種藝術方向。
