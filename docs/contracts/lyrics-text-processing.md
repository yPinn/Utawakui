# 歌詞文字預處理與模板邊界

本契約區分來源解析、共用文字標註、使用者確認的輸出省略，以及模板進階呈現。時間層級沿用[時間契約](lyrics-timing-contract.md)；外部查詢沿用[來源契約](lyrics-sources.md)。不包含模型推論或新的多聲部時間編輯器。

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

繁簡中、英、日、韓的明確作詞／作曲／編曲前綴只標為 `credit-candidate`。它們也可能是實唱歌詞，因此不自動省略。`[女]`、具名聲部、合唱、括號和聲、引號內的製作字樣與無明確前綴的文字保留為 lyric。演唱／Vocal／和聲前綴不作本輪製作資訊候選。

配對涵蓋 `()`、`（）`、`[]`、`【】`、`{}`、`「」`、`『』`、`“”`、`‘’`、`《》`、`〈〉`、ASCII 雙引號。詞內 apostrophe 不當作引號。語意 units、混語候選與容量排版沿用同一配對／禁則：自然候選避開配對內部，禁止頁首閉括號／尾隨標點及頁尾開括號。超長引文可保真地在字形邊界分頁，無法容納時回報 unfit，不漏字或捏造時間。

## 逐行確認與輸出投影

`useLyrics` 組合 `lyrics/useLyricsTextProcessing.js`，持有本次來源的 session 選擇。預設選取為空；「共用文字處理」逐行顯示完整候選，只有使用者勾選的合法 candidate lineId 可隱藏，並可恢復全部原文輸出。切換 track／source 或原文版本變更立即重設，不寫來源、timing、reading、offset 或設定檔。

Output publisher 先按原文件驗證讀音，再以 stable lineId 過濾確認的行及其 reading projection。衍生文件獲得不同 documentId，保留其他行的文字、ids、segments、細時間與原起訖，依可見行重新計算顯示 tier。恢復時發布原 documentId。文件與 state 仍走既有 v3 revision／epoch 協定，隱藏行的 active id 不得出現在 state；不能將被隱藏行的時間接到上一句。

本機閱讀、來源編輯及逐字校時維持原始行索引；這項選擇只影響所有 Output 模板。原文／繁中依舊是獨立文字變體，不屬模板設定。不啟動 provider 查詢、模型或任意外部腳本。

## 模板進階顯示

共用文字處理不決定氣泡、直排、角色色或動畫。這些仍由六個模板 profiles 與 capabilities 決定；字型／色彩／位置／材料由 appearance registry 決定。

只有目前支援 presentation policy 的 Live Stage 顯示「模板進階顯示」控制。未指定或無效值預設為 Balanced，保留重複實唱詞、語助詞與括號和聲；Literal 同樣可選。既有明確保存的 Broadcast Compact 不改寫，它仍可省略重複詞、語助詞與部分標點；進階區明示此效果。它不是全域 parser 或製作資訊清理器。

## 驗證邊界

相鄰測試涵蓋多語正文、時間形文字、具名聲部、括號和聲、相鄰／同時重複、原文範圍、讀音／時間守恆、選擇失效、恢復與 Output 發布。
容量的純函式案例只驗禁則與文字守恆；實際可讀性仍需可見 Electron／OBS、字型／ruby／動畫外擴與尺寸驗收。模型在規則基線之後另行評估，本契約不聲稱已有語意模型或新增聲學時間證據。
