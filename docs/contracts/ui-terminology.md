# 介面用詞

使用者可見文字的共用用詞。zh-TW 是來源目錄，en-US 依同一規則對應。文案放置與取用方式見
[AGENTS.md](../../AGENTS.md#ui-text-and-locale)；作品、版本與發行的資料語意見
[作品、版本與發行資料](works-versions-and-releases.md)。

新增或修改文案時先查本表。需要本表沒有的詞，或要改變既有用法，先更新本表再改文案。
收斂以全部語系檔與相關文件為範圍，不只改目前功能。

## 曲目與歌曲

| 用詞 | 指的是                                                                                 | 例                                               | en-US |
| ---- | -------------------------------------------------------------------------------------- | ------------------------------------------------ | ----- |
| 曲目 | 曲庫中的一筆資料，及其資訊與編輯；清單、數量、搜尋、選取、刪除、匯入；場次中的演出項目 | 編輯曲目、曲目資訊、全部曲目、3 首曲目、待唱曲目 | track |
| 歌曲 | 歌本身：正在播放或演唱的那首、聲音與影片屬性、歌曲整理中的作品                         | 目前歌曲、歌曲音量、歌曲影片、歌曲整理           | song  |

場次中連結到曲庫的來源寫「曲庫歌曲」，用來和手動新增的演出項目區分。
場次清單以「MV」標示曲名中明確標註為 MV 的來源版本。一般音源省略此標籤。

## 已定案

「帳號與登入授權」（Accounts and sign-in）顯示平台帳號、授權狀態與下載使用的登入方式。

「更多匯入方式」（More import options）收錄播放清單的備用操作，例如「從檔案匯入」（Import from a file）。

「問題排查」（Troubleshooting）提供目前可處理的功能問題與下一步。「支援包」（Support package）是給維護者的診斷匯出。

「直播與錄影」（Streaming and recording）依序放置「音訊擷取」（Audio capture）、「對外輸出」（Public output）與「OBS 連線」（OBS connection）。音訊擷取將應用程式播放聲音送到使用者選擇的裝置，對外輸出提供「瀏覽器來源」（Browser Source），OBS 連線讀取直播與錄影狀態並記錄場次。「瀏覽器來源設定」（Browser Source settings）管理自動啟動、輸出連接埠與畫面延遲。

「管理伴奏工具」（Manage accompaniment tools）集中轉檔工具、分離模型與加速設定。「測試功能」（Test features）收錄仍在驗證的分析與輸出工具。「歌詞時間分析」（Lyrics timing analysis）集中試用工具、自動分析及片段預覽。「BPM 分析」（BPM analysis）同列管理工具與匯入後自動分析。

「常見問題」（Common issues）依使用流程說明症狀、目前狀態與處理方式。「回報與建議」（Feedback and suggestions）開啟回報表單，可附上支援資料。「更多支援選項」（More support options）收錄支援包匯出、嚴重錯誤回報偏好及開發版的錯誤紀錄工具。

「手機預覽」（Phone preview）指桌面手機外框內可操作的手機遙控頁面。

手機遙控的「歌詞版型」（Lyrics layout）指手機提詞方式。「捲動歌詞」（Scrolling lyrics）列出整首歌詞並跟隨當前句。「兩句聚焦」（Two-line focus）顯示當前句與下一句。

手機播放器的「監聽混音」（Monitor mix）用「純伴奏」（Backing only）與「加導唱」（With guide vocal）切換分離音軌的監聽導唱。「播放速度」（Playback speed）以倍率表示。

「同步詳情」（Sync details）說明歌詞來源目前可用的同步精度背後的判定原因。

「原詞與對時」（Lyrics and timing）處理原詞與播放時間。「譯文」（Translations）處理同一來源的其他語言文字。「來源代號」（source code）用於區分選單中的同名歌詞版本。

「重複歌詞入場」（Repeated lyric entrances）控制同一段在 Output 的入場方式。「保留原文」（Keep original）完整顯示反覆唱詞，「入場一次」（Enter once）持續顯示一份文字，「逐次入場」（Re-enter each time）依可用的演唱起點重播入場。

「演唱語言」（Sung languages）是錄音實際演唱的語言，與歌詞文字、譯文及曲風分開，分為中文、日語、韓語、英語、其他語言（Other languages）與無人聲。「無人聲」（No vocals）表示錄音沒有演唱或說唱。演唱語言寫「日語、英語」等「～語」，歌詞文字、讀音與字型沿用「日文、英文」等「～文」。

Output 字型選單採用「模板字型」（Template fonts）指模板提供的字型組合。「本機字型」（Local fonts）指控制台可列舉的已安裝字型。
「隨模板」（Follow template）是使用模板原有排版字型的選項，其字型可能依文字語系或材質改變。

模板庫以「獨立字幕」（Separate subtitle）說明譯文在輸出畫面有自己的顯示位置。
模板庫以「收藏模板」（Favorite template）和「取消收藏」（Remove from favorites）管理個人偏好。收藏置於「已收藏」（Favorites）區，其餘選項列在「其他模板」（Other templates）。
Output 工作臺的「模板」（Templates）分頁提供底片清單，可直接切換目前輸出類別使用的模板。
「模板設定分頁」（Template settings tabs）是工作臺與手機遙控中調整模板的分頁列名稱。
工作臺欄位名稱以繁中四字內為原則。「字幕呈現」（Subtitle display）的「呈現策略」（Presentation policy）選擇字幕精簡或保留原文的方式。「定時回顧」（Timed review）切換票據歌單的歷史頁回顧。「透明度」（Opacity）用於其他輸出的透明、半透明與實底選項。歌單的「背景樣式」（Background style）提供「透明」（Transparent）、「純色」（Solid color）及「模板底色」（Template background）。純色用「背景色」（Background color）選色，以「透明度」（Transparency）表示底圖透出的百分比。
歌詞輸出的「翻譯」（Translation）分頁用「顯示譯文」（Show translation）選擇畫面輸出的譯文，用「譯文字級」（Translation size）調整字幕大小。

「人物組合」（Portrait preset）是幻影怪盜中一組可切換的照片、顯示名稱與底色。
「搜尋名稱」（Search names）依人物組合的顯示名稱篩選清單。
「編輯照片」（Edit photo）在匯入前提供拖曳與縮放取景。「移除背景」（Remove background）在本機辨識原圖主體並提供透明去背預覽。「去背範圍」（Cutout range）可多保留或多移除主體的邊緣。「重設取景」（Reset framing）回到預設構圖。「套用照片」（Apply photo）將預覽中的版本帶回人物組合草稿。
「邊緣銳化」（Edge sharpness）調整透明邊緣的清晰度。「局部修正」（Local retouch）提供「智慧套索擦除」（Smart lasso erase）與「套索還原」（Lasso restore），拖曳圈選後分別擦除區域與補回照片像素。
「構圖輔助」（Composition guides）在照片取景時顯示九宮格與吸附線。

「配色風格」（Color style）分為「基本配色」（Basic）與「底片風格」（Film），模板原色置頂。底片區按品牌與片名的英文字母排序，選項使用「品牌＋片名」，表示參考具名膠片或膠片模擬的自製配色。

「隨機產生『欄位名稱』色碼」（Randomize {label}）為目前顏色欄位產生並套用一個六位 HEX 色碼。

場次封面（session cover）是封存場次的主圖。「更換場次封面」選取本機圖片，「還原場次封面」回到預設顯示。
場次票券的無障礙名稱使用「查看 {場次名稱}」（View {session name}）。

| 用                 | 不用             | 說明                                                       | en-US                              |
| ------------------ | ---------------- | ---------------------------------------------------------- | ---------------------------------- |
| 儲存               | 保存             | 寫入資料的動作。資料沒有被刪除寫「保留」                   | save；kept                         |
| 重設               | 全部清除         | 清除這次輸入，並將編輯中的內容恢復到已儲存狀態             | reset                              |
| 本機               | 本地             | 這台電腦                                                   | on this computer                   |
| ～未完成、無法～   | ～失敗           | 錯誤標題與句子；清單中的狀態標籤與計數可寫「失敗」         | didn't finish；Couldn't            |
| 請再試一次         | 請重試           | 本機操作                                                   | Try again.                         |
| 請稍後再試         |                  | 連線的外部服務（線上搜尋、YouTube 等），或要等目前工作結束 | Try again later.                   |
| 工具、模型；準備   | 元件；安裝       | 需要另外取得的處理程式與模型，與設定頁「工具與模型」一致   | tool、model；prepare               |
| 磁碟空間           | 空間（單獨使用） | 電腦儲存空間；曲庫占用寫「曲庫空間」                       | disk space；library storage        |
| 去人聲上限         |                  | 曲庫空間中去人聲版本的清理門檻                             | Vocal-removed limit                |
| 作品、版本、發行   |                  | 見作品與版本契約                                           | work、version、release             |
| 文字陰影           |                  | Output 正文字形的投影，選項為「標準」和「關閉」            | Text shadow                        |
| 字體排列           |                  | 和風直書的字級排列方式，選項為「等大」和「大小字」         | Text arrangement                   |
| 多欄顯示           |                  | 和風直書可同批顯示，或依歌詞時序一次顯示一欄               | Multiple columns                   |
| 段落強調           |                  | 和風直書在重現歌詞段落套用的局部字色                       | Section highlights                 |
| 魚眼鏡筒           |                  | 畫面輸出的門鏡弧列字幕模板                                 | Fisheye Lens                       |
| 幻影怪盜           |                  | 畫面輸出的拼貼歌詞模板                                     | Phantom Thieves                    |
| 紋理顯字           |                  | 開發版的畫面輸出歌詞模板                                   | Textured Credits                   |
| 選句剪報           |                  | 幻影怪盜中以黑白折角紙帶顯示前後句與當句的構圖             | Choice Stack                       |
| 有頭像             |                  | 顯示人像框的側邊彈卡樣式                                   | With Avatar                        |
| 呈現方式、聊天外形 |                  | 幻影怪盜的構圖選項及聊天變化                               | Presentation, Chat Shape           |
| 畫面角落、彈卡樣式 |                  | 幻影怪盜的位置及側邊彈卡的角色呈現                         | Screen Corner, Dialogue Card Style |
| 點綴字體           |                  | 預告信中局部穿插的字型                                     | Accent Font                        |
| 鏡頭構圖、貼近     |                  | 魚眼鏡圈與歌詞弧列的尺寸和位置，貼近用於人物近景           | Camera framing, Close-up           |
| 鏡框               |                  | 魚眼鏡筒的前景裝飾，樣式為關閉、柔和及標準                 | Lens rim                           |
| 進場動畫、退場動畫 |                  | 字幕顯示與消失時各自使用的動畫                             | Entrance, Exit                     |
| 文字進場           |                  | 和風直書每一欄的文字出現方式                               | Text entrance                      |
| 左右滑入           |                  | 字從左右不同位置短距離滑回各自字位                         | Slide in                           |
| 停留縮放、動態模糊 |                  | 字形停留時的縮放幅度與沿弧快速移動時的拖影                 | Hold scaling, Motion blur          |
| 字幕分段           |                  | 每次顯示整句、短句或有時間標記的來源段落                   | Subtitle breaks                    |
| 唱片高光           |                  | 星空黑膠表面沿溝槽可見的掃光，樣式為關閉、柔和及標準       | Record highlight                   |
| 裝飾               |                  | Output 可選用的視覺物件                                    | Decoration                         |
| 鏡內反光           |                  | 魚眼鏡筒的可選環形反光，樣式為關閉、柔和及標準             | Lens reflection                    |
| 攝影機特效         | 特效             | 作用於輸出畫幅頂層的 Glitch、推拉和雜訊                    | Camera effects                     |
| 自動穿插           |                  | 輸出按隨機間隔顯示短暫特效                                 | Automatic bursts                   |
| 監聽跟隨擷取       |                  | 監聽採用擷取端的導唱開關與比例                             | Monitor follows capture            |
| 伴奏               |                  | 曲目分離後可用於演唱及混入導唱的音訊                       | Accompaniment                      |
| 波形對照           |                  | 本機音源與影片參考音軌在同一時間軸的對照                   | Waveform comparison                |
| 播放片段、停止預覽 |                  | 預覽目前檢視區間的本機音源與影片畫面                       | Play segment, Stop preview         |
| 預覽背景           |                  | 歌詞工作台顯示的同步 MV 或人物參考                         | Preview background                 |
| 白底、黑底         |                  | Output 工作台的固定純色預覽背景                            | White background, Black background |
| 模型佔位           | 佔位             | 歌詞工作台用來檢查人物大小、對位和遮擋的範圍               | Model placement                    |
| 氣泡樣式           | 氣泡             | 分格對白的主歌詞外框                                       | Bubble style                       |
| 尾巴朝向           |                  | 分格對白氣泡的短箭尾或思考圓點所指的方向                   | Tail direction                     |
| 版面               |                  | 輸出模板的排列、定位、構圖與位置微調                       | Layout                             |
| 修飾               |                  | 目前模板專屬的色彩、背景、裝飾與文字效果                   | Styling                            |
| 顯示               |                  | 輸出模板的內容呈現方式與元素顯示設定                       | Display                            |
| 外觀               |                  | 輸出模板的調色、材質顆粒與相關視覺設定                     | Appearance                         |
| 遮罩形狀           |                  | 模型佔位的裁切外形                                         | Mask shape                         |
| 佔位圖片           |                  | 模型佔位內顯示的內建或本機圖片                             | Placement image                    |

「介面元件」指畫面上的元件，不屬於「工具」的範圍。

錯誤通知的標題寫哪個操作沒有完成，內文只寫原因或下一步，不重複標題。en-US 使用縮寫形式
（can't、couldn't、didn't），不用 cannot、could not。

## 人與清單

| 用       | 不用         | 指的是                                       | en-US      |
| -------- | ------------ | -------------------------------------------- | ---------- |
| 藝人     | 演唱者、歌手 | 曲目的演出者，含曲庫、藝人頁、編輯與搜尋欄位 | artist     |
| 音檔     | 音訊檔       | 音訊檔案                                     | audio file |
| 播放清單 |              | 曲庫或音樂平台上由使用者整理的曲目清單       | playlist   |
| 歌單     |              | 場次的演出曲序，以及畫面輸出的曲序版面       | setlist    |

播放清單與歌單是兩個概念：從播放清單建立演出安排後，演出的曲序稱為歌單；場次結束後另存到曲庫的是播放清單。預設名稱「演出歌單」是名稱，不受此限。
