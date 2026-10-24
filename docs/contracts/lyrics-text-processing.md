# 歌詞文字預處理與模板邊界

本契約區分來源解析、共用文字標註、可還原的 Output 製作資訊／提示標記過濾，以及模板進階呈現。時間層級沿用[時間契約](lyrics-timing-contract.md)；外部查詢沿用[來源契約](lyrics-sources.md)。不包含模型推論或新的多聲部時間編輯器。

## 來源保真

- `shared/lrcParsing.mjs` 只消耗行首連續且有效的 LRC 時間標籤；正文中的 `[02:00]`、speaker 與段落標記保留。秒數限於 0–59，無效標籤不當作時間。
- Enhanced LRC 只消耗合法行內時間標籤，字面的 `<3`、`<forever>` 保留。字詞片段拼接必須等於行文字；不因長句而改寫 canonical 行或時間。
- LF、CRLF、CR、U+2028、U+2029 正規化為來源換行，移除開頭 BOM；不作 NFKC、繁簡轉換或盲刪零寬／組合字元。
- VTT 只去除已知字幕 markup 與時間標記；具名 `<v Name>` 保留為 `[Name]`，未知 angle text 保留。
- YouTube CC 僅清理已知 square noise cue 與音符裝飾，不因全大寫、括號、短時間重複、時間重疊或共用前綴而刪詞。只折疊文字及起訖完全相同的相鄰重送；rolling 字幕可能保留重複內容，資訊不足時保真優先。
- 手動 VTT、LRC、LRCLIB、NetEase 不沿用 CC 的 noise 清理。各 provider 仍先解析結構資訊；YRC JSON metadata 與 TTML primary／auxiliary lane 規則不變，完整原始 provider artifact 保留。本輪沒有新增 TTML 背景聲部渲染或跨來源拼接。

新 fallback 文件使用 `lyrics-source-v3`，讓解析行為改變後的 document／line identity 與舊快取分離。已驗證、來源 SHA 相符的 v2 timing sidecar 仍是權威，原 document／line／segment ids、文字及人工／provider 時間保持可讀、可編輯；不因 parser 改版而重解析或自動覆寫。v1、未知 profile 與 SHA 不符仍按既有 stale／unsupported 規則拒用，不刪原檔。

## 共用標註與安全斷點

`shared/presentation/lyricsTextProcessing.mjs` 產生版本化、保真的文字標註，包含製作資訊候選與括號／引號範圍。範圍是對輸入字串的 UTF-16 offsets，文字變體需重新分析自身輸入，不直接套用可能變長的原文 offsets。

繁簡中、英、日、韓的作詞／作曲／編曲、Producer／製作人、錄音／混音／母帶等已知職務可標為 `credit-candidate`，接受冒號、複合職務及雙語欄名，例如 `製作人/編曲 Producer: HARIKIRI`。整行必須是已知欄名加非空值，不用任意冒號、括號或日期猜測製作資訊；多行合塊不整塊視為信用欄位。

工程職稱另涵蓋 Mixing Engineer／Assistant、Mastering Engineer、Recording Engineer／Assistant、Vocal Production & Recording、部分中日韓樂器職務及 Guitar／Bass／Drums／Piano 等欄名。例如 `混音助理 Mixing Assistant: Grove Miki @ Jamroom`、`人聲製作和錄音 Vocal Production & Recording: HARIKIRI @ Jamroom`、`母帶 Mastering Engineer: Craig J Williams` 與 `吉他 Guitar: Iki Zhou`。署名可附一個有界的 `@`／`＠` 工作室後綴；不查外部人名或把任意正文當成演職員表。

文字標註 v4 提供 `defaultHidden`：署名符合保守字形規則的單行欄位，預設從 Output 隱藏。Latin 署名須大寫開頭的姓名／handle；Han、Katakana、Hangul 署名另要求製作／錄音／混音等職務，不把短中文作詞正文直接當成人名。疑似句子、額外冒號、演唱字樣或無法判定的署名只列候選、預設保留。這是可還原的格式判斷，不聲稱已確認實際人名或理解歌詞；漏判保留給逐行確認。

實唱合唱／和聲、引號內的製作字樣與無明確前綴的文字保留為 lyric。演唱／Vocal／和聲前綴不作製作資訊候選。全域標點清理尚未啟用：問號、英文撇號、歌名書名號與引用保留；不把所有逗號、句點或括號一併剝除。

v4 另以 `outputLabelRanges` 標註括號、方括號或【】內完全符合已知提示詞的來源範圍，例如 `（和聲）`／`(和声)`／`[Backing Vocals]`／`（ハモリ）`／`(코러스)`。這些範圍預設只從 Output 隱藏；純提示整行可排除，與唱詞混在同一行則只去掉標記。例如 `[女]（和聲）一起唱（啊啊）` 保留 `一起唱（啊啊）`，女聲角色另存。`（啊啊）`、`(oh oh)`、`（一起唱）`、`（啊啊和聲）`、帶唱詞的 `(和聲：啊啊)`、引文內的提示字樣及不完整配對不自動刪除。這不是任意括號刪除或語意判斷。

明確聲部標記同樣只從 Output 移除，例如 `[男]`／`[女]`、`【男声】`、`合唱：`、`[Male]`／`[Both]`、`[男性]`／`[女性]`／`[全員]`、`[남자]`／`[여자]`／`[합창]`。同一來源塊可交替聲部；獨立標記的角色沿用到下一段，直到下一個明確角色。原始標記、唱詞與所有時間仍在 canonical 文件。

歌手名前綴以目前曲目 artist 名單確認，支援該名單內的 `[Name]`／`Name:`／`Name：`；多位藝人可依既有分隔符比對。例如曲目藝人有 Rapeter 時，`Rapeter: Yo, yo check1212.` 只隱藏姓名與冒號。未有藝人證據的姓名形前綴列為預設不勾選的候選，不能因所有冒號或所有括號而自動刪詞。未知括號唱詞、引文、普通冒號與工程欄名不當作已確認歌手。

衍生 Output line 的可選 `vocalParts` 保存互不重疊的 UTF-16 `from`／`to`、原標記 `label` 及 `male`／`female`／`group`／`solo` 角色。它只描述正文角色，不新增時間；空陣列表示已由共用層判定保留字面前綴，模板不得再自行抽取姓名。逐行還原時，原標記可見且角色仍保留。Main 驗證範圍、順序、數量、角色與欄位白名單；Browser Source 重組及分頁／預覽切片保留並重設角色座標。聲部變更是共用批次界線，KTV 使用該批角色；其他模板保留各自視覺，不直接印角色標籤。

配對涵蓋 `()`、`（）`、`[]`、`【】`、`{}`、`「」`、`『』`、`“”`、`‘’`、`《》`、`〈〉`、ASCII 雙引號。詞內 apostrophe 不當作引號。語意 units、混語候選與容量排版沿用同一配對／禁則：自然候選避開配對內部，禁止頁首閉括號／尾隨標點及頁尾開括號。超長引文可保真地在字形邊界分頁，無法容納時回報 unfit，不漏字或捏造時間。

## 逐行確認與輸出投影

`useLyrics` 組合 `lyrics/useLyricsTextProcessing.js`，持有本次來源的 session overrides。隱藏集合由明確欄位／提示預設加逐行 override 推導；「顯示 → 共用文字處理」在閱讀及編輯頁共用同一 owner，區分「隱藏整行」與「隱藏提示標記」，逐行顯示完整候選，取消勾選可還原，也可恢復全部原文輸出。只有合法 candidate lineId 可套用；時鐘或僅時間刷新不清除還原選擇。切換 track／source 或原文版本變更立即回到預設過濾，不寫來源、timing、reading、offset 或設定檔。

Output publisher 先按原文件驗證讀音，再以 stable lineId 過濾隱藏行及其 reading projection。衍生文件依選擇後文字與角色取得不同的 `~text-v4` documentId，依可見行重新計算顯示 tier。去除行內提示只重映射文字座標：保留的 T2／T1+ segment id、起訖及 fine unit id／時間原值不變，完全屬於提示的片段排除；細時間的 UTF-16 offsets 依保留字元重映射，不插值、不借時間。未受影響的 reading 片段保留，跨提示的片段取消其不再對應的 ruby，舊整行 romaji 不帶入改變後的文字；原 reading 文件仍不變。

若前一句原 end 為空而依下一個來源起點作顯示結束，且該起點所屬行被隱藏，僅在衍生 Output 文件以 `endInferred` 明示原有結束邊界，不能把前一句延長到後面的可見行；canonical end 與來源檔仍不變。恢復時還原所有原文字與時間；若仍需傳遞聲部或字面前綴資訊，維持衍生 documentId。文件與 state 仍走既有 v3 revision／epoch 協定，隱藏行／片段的 active id 不得出現在 state。

本機閱讀、來源編輯及逐字校時維持原始行索引；這項選擇只影響所有 Output 模板。原文／繁中依舊是獨立文字變體，不屬模板設定。不啟動 provider 查詢、模型或任意外部腳本。

## 模板進階顯示

共用文字處理不決定氣泡、直排、角色色或動畫。這些仍由五個已登錄模板的 profiles 與 capabilities 決定；舊 Focus 僅保留相容路徑。字型／色彩／位置／材料由 appearance registry 決定。

Output 的尺寸量測與保真來源範圍由共用容量 planner 持有；每條分行／直欄依序成為一個批次，明確原始換行不合回同批。空白與分隔符保留在原文範圍，不產生空白批次。模板消費批次，保留各自的氣泡、字層、角色提示與動畫；相同文字但來源範圍不同仍為新批次，單純進度 tick 不重播入場。這是顯示排版，不代表辨識到演唱停頓或語意句界；時間不足維持 unfit，不刪詞或改寫來源時間。詳見[容量與時間契約](lyrics-timing-contract.md)。

只有目前支援 presentation policy 的 Live Stage 顯示「模板進階顯示」控制。未指定或無效值預設為 Balanced，保留重複實唱詞、語助詞與括號和聲；Literal 同樣可選。既有明確保存的 Broadcast Compact 不改寫，它仍可省略重複詞、語助詞與部分標點；進階區明示此效果。它不是全域 parser 或製作資訊清理器。

## 驗證邊界

相鄰測試涵蓋多語正文、時間形文字、具名聲部、括號和聲、相鄰／同時重複、原文範圍、讀音／時間守恆、選擇失效、恢復與 Output 發布。
容量的純函式案例只驗禁則與文字守恆；實際可讀性仍需可見 Electron／OBS、字型／ruby／動畫外擴與尺寸驗收。模型在規則基線之後另行評估，本契約不聲稱已有語意模型或新增聲學時間證據。
