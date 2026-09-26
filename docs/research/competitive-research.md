# 競品調查：歌回與 OBS 輔助工具

> 研究日期：2026-09-25（第四輪；首次調查為 2026-08-13）。本文是產品與工程判斷用的 dated evidence，不構成法律意見，也不是 Utawakui 現況來源。
>
> Utawakui 的目前狀態以[產品規格](../spec.md)與[文件導覽](../README.md)為準。前三輪完整內容保留在 Git history；本輪只保留仍影響決策的現況、變化與證據限制。

## 1. 範圍與證據規則

本輪延續三個直接競品：Setlista、EliteSand Pro、歌回救星／Singing Stream
Savior。觀察截止時間為 2026-09-25（Asia/Taipei）。

| 產品                             | 最新可驗證版本                                       | 現況來源                                                                                                                                                                     | 相對 2026-09-15     |
| -------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Setlista／セトリスタ 3rd session | `0.23.0`，2026-03-25，仍標示試驗公開                 | [官方 3rd session 手冊](https://nekosogi.org/setlista3)                                                                                                                      | 無版本變化          |
| EliteSand Pro                    | `1.0.6`，2026-09-18 UTC／09-19 台灣時間              | [官方 repository](https://github.com/z22115554/elitesand-pro)、[v1.0.6 release](https://github.com/z22115554/elitesand-pro/releases/tag/v1.0.6)                              | `1.0.4 → 1.0.6`     |
| 歌回救星／Singing Stream Savior  | App `2.1.6.1`、Launcher `1.2.0.8`、runtime `1.0.0.8` | [官方手冊](https://noonisawesome.github.io/Singing-Stream-Savior-Manual/)、[更新倉庫](https://github.com/NoonIsAwesome/Singing-Stream-Savior-Updates)、`updates/stable.json` | `2.1.4.3 → 2.1.6.1` |

證據強度分四層：

1. **已發布**：official release／stable manifest 有可下載資產、版本與 hash。
2. **公開支援**：官方手冊把能力寫成一般使用流程，而非實驗或未來方向。
3. **實驗性／source-verified**：原始碼或發行內容可證明功能存在，但官方仍標示實驗性，或尚未列為一般支援。
4. **未驗證品質**：官方文字能證明產品宣稱，不能證明音質、穩定性、相容性或實際使用者體驗。

比較時不把「repo 裡有檔案」直接等同「使用者已可穩定使用」，也不把 release note 的
「改善」直接等同問題已完全消失。

## 2. 本輪新增變化

### 2.1 Setlista

`0.23.0` 仍是最新版本，3rd session 仍標示試驗公開。Reserve／Now Singing／Set
List、わんコメ時間戳、YouTube 章節複製、Browser Dock／Browser Source 與 skin
生態都沒有新的公開版本變化。

這次重新查證的價值是確認「無變化」：Setlista 仍代表低導入成本、窄場景打磨，而不是
完整播放器或音訊處理工作站。

### 2.2 EliteSand Pro

`1.0.5`（2026-09-16）新增兩項會改變比較矩陣的能力：

- 獨立 BGM 待機清單；開始唱歌時自動淡出／暫停，停止或唱完後依延遲設定恢復。
- 選用的公開點歌頁可設定自訂分享網址；BGM 不進公開點歌目錄。

`1.0.6`（2026-09-18 UTC）強化日文讀音／諧音：以日文發音分析處理助詞、促音、
長音與拗音，支援逐行人工修正並保存 override；同版也修正雙路音訊每曲開頭的短暫
同步偏移。

發行面維持「Ed25519 簽章更新計畫＋artifact hash」的雙層設計，`1.0.6` 同時發布完整
Installer 與從 `1.0.3`／`1.0.4`／`1.0.5` 升級的增量包。Windows Installer 本身仍未做
Authenticode code signing。官方 repository 自 `1.0.3` 起已公開完整 source tree，採
MPL-2.0；上輪「只靠本機 private-source snapshot」的限制已不再成立。

官方 `1.0.6` tag 的 README 標題仍寫 `1.0.4`，因此版本判斷以 release／tag／asset 為準，
不以 README 單一欄位為準。AI 人聲分離仍標示實驗性、預設關閉；Spout2 仍屬 source／
release 可見但非一般支援基線的實驗路徑。

### 2.3 歌回救星

`2.1.4.3` 之後到 `2.1.6.1` 的公開更新主要是可靠性與操作邊界：

- `2.1.5.x` 持續修正 BGM 斷音、伴奏停止延遲、VST3 Profile、UVR 暫存檔、錄音收尾、
  YouTube fallback 與 OBS Timeline 逾時時的時間戳準確性。
- `2.1.6.0` 新增本機診斷資料匯出；ZIP 由使用者主動產生，不自動上傳或寄信。
- `2.1.6.1` 修正進階直播模式的麥克風電平顯示，以及 YouTube 下載／轉檔問題。
- Launcher `1.2.0.8` 新增有限重試、重新連線、驗證式斷點續傳與更清楚的驗證／安裝狀態；
  manifest 仍以 size 與 SHA-256 驗證 package。

Stable manifest 在 2026-09-24 宣告 App `2.1.6.1`、Launcher `1.2.0.8`、runtime pack
`1.0.0.8`，並將 application runtime、UVR-MDX、UVR-HP models 分成獨立 package。

上輪「沒有正式隱私權政策公開頁面」已過時。官方手冊在 2026-09-21 增加
[App Privacy Notice](https://noonisawesome.github.io/Singing-Stream-Savior-Manual/privacy.html)，
說明本機處理、無個人使用分析遙測、外部查詢對象、診斷資料不自動上傳，以及使用者
主動提供資料的處理方式。

現行手冊仍公開支援 OBS 專用音訊外掛、VB-CABLE 備援、VST3／ASIO、Buffer 健檢與
六軌 meter。這些頁面可證明支援流程存在；相容性與實際音質仍未經本輪獨立實機驗證。

## 3. 現況快照

### 3.1 Setlista：低導入成本的單一場景工具

- 純 Browser Dock／Browser Source，不安裝播放器或模型 runtime。
- Reserve／Now Singing／Set List 的演出心智模型清楚。
- 章節時間戳與大量 skin 是核心價值。
- 不處理本機曲庫、歌詞同步、pitch／tempo、人聲分離或 provider acquisition。

對 Utawakui 的參考價值仍是 OBS 導入成本、窄場景操作速度與 skin discovery，而不是
功能覆蓋率。

### 3.2 EliteSand Pro：歌詞覆蓋與直播互動廣度

- 本機／YouTube 匯入、播放器、直播歌單、OBS lyrics、手機控制、Stream Deck 與 Twitch
  點歌整合在同一個 Windows 應用程式。
- 多來源歌詞、逐字格式、日／韓讀音、中文拼音與可編輯日文諧音是目前最清楚的內容覆蓋優勢。
- AI 人聲分離提供 NVIDIA GPU、WebGPU、CPU fallback，但仍是實驗性、預設關閉。
- `1.0.5` 後也具有 BGM 待機 lane，與歌回救星形成重複市場訊號。
- 更新 manifest 的獨立簽章與增量包已進公開發行；Installer 仍未 Authenticode 簽章。

### 3.3 歌回救星：音訊管線與原生 OBS 整合深度

- BGM／伴奏交接、無伴奏演出項目、播放器、歌詞、歌單與 OBS output 是核心工作流。
- UVR 人聲分離、guide vocal、Profile、VST3／ASIO、錄音與 Buffer 健檢形成完整音訊子系統。
- OBS 專用音訊外掛可接收完整 Stream Output；VB-CABLE 是其他應用程式需要同一 mix 時的備援。
- 更新採獨立 Launcher、component package、size／SHA-256 驗證與驗證式續傳。
- 本機診斷匯出與公開隱私聲明補上上輪缺少的 support／privacy 基線。

近幾版大量穩定性修正顯示能力正在實際打磨；這是「功能活躍」的證據，不是「已無問題」
的證據。

## 4. 功能矩陣

| 面向                   | Setlista                | EliteSand Pro                                         | 歌回救星                                  | Utawakui 現況                                                           |
| ---------------------- | ----------------------- | ----------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------- |
| 版本／發布             | `0.23.0`，試驗公開      | `1.0.6`，Installer＋增量包                            | `2.1.6.1`，ZIP＋獨立 Launcher／packages   | Source tree；公開發行驗收持續進行                                       |
| 本機曲庫／播放器       | 無                      | 有                                                    | 有，BGM／伴奏分 lane                      | 已實作                                                                  |
| BGM 自動交接           | 無                      | `1.0.5` 起公開支援                                    | 核心能力，近期仍持續修正                  | 未納入產品範圍                                                          |
| 無伴奏演出項目         | 可用純文字 setlist 表達 | 未見專用資料模型                                      | 有，手動或計時結束                        | 尚待產品決策                                                            |
| OBS setlist            | 核心                    | 有，含 session／chapter                               | 有，多主題                                | 三個固定 slot MVP；session／chapter 已實作                              |
| OBS lyrics             | 無                      | 11 個官方 performance templates；另有 source 分類差異 | 9 個 animated styles，另有 Basic／Classic | 6 個 presentation profiles                                              |
| 歌詞來源               | 無                      | BetterLyrics／Apple／酷狗／QQ／LRCLIB／NetEase 等     | LRCLIB／YouTube captions／local           | LRCLIB／NetEase／Better Lyrics                                          |
| 讀音／跟唱輔助         | 無                      | 日／韓讀音、中文拼音、可編輯日文諧音                  | Basic Lyrics 日／韓 romanization          | 日／韓 reading 與 authored correction                                   |
| Pitch／tempo           | 無                      | SoundTouch／WSOLA，每曲保存                           | SoundTouch＋Signalsmith 系列，每曲保存    | Signalsmith Stretch 即時 preview                                        |
| Vocal separation       | 無                      | GPU／WebGPU／CPU；實驗性                              | UVR MDX／HP；公開支援                     | `quick`／`general`，DirectML→CPU fallback                               |
| 進階直播音訊           | 無                      | 未作為公開產品主軸                                    | VST3／ASIO／Profiles／錄音／Buffer 健檢   | 未納入產品範圍                                                          |
| OBS 狀態／時間戳       | わんコメ時間戳          | session／chapter                                      | OBS WebSocket Timeline                    | 唯讀 OBS WebSocket、session history、chapter export                     |
| 原生畫面輸出           | 無                      | Spout2 實驗路徑                                       | 未見                                      | Spout2 Lyrics sender 實驗路徑                                           |
| 原生 OBS 音訊          | 無                      | 未見                                                  | 公開支援專用音訊外掛                      | 未納入產品範圍                                                          |
| 觀眾點歌／遠端控制     | 無                      | Twitch、公開點歌頁、手機、Stream Deck                 | 未見 Twitch 點歌主軸                      | Chat 點歌非目標；write-capable adapter 尚待需求證據                     |
| Diagnostics／privacy   | 不適用於本機 app        | logs／health checks；公開 privacy 細節有限            | 本機診斷 ZIP＋正式 privacy notice         | Redacted diagnostics＋預覽後回饋；媒體不自動上傳                        |
| 更新完整性             | 不適用                  | Ed25519 manifest＋artifact hash＋增量包               | Component size／SHA-256＋驗證式續傳       | Ed25519 多簽章＋exact artifact binding 已完成；production gate 尚未啟用 |
| Installer code signing | 不適用                  | 未 Authenticode 簽章                                  | 未見受信任 publisher signature 的公開證據 | 接受 unsigned boundary；目前無購買憑證規劃                              |

矩陣只比較公開或可驗證存在的能力，不對音質、穩定性與使用者滿意度排名。模板數字沿用各產品
官方分類；不同產品對 default／basic／performance template 的計數方式不同，不能拿 raw file
count 當作直接品質指標。

## 5. 對 Utawakui 的產品含義

### 5.1 BGM lane 與無伴奏項目已形成重複需求訊號

歌回救星長期以 BGM／伴奏交接為核心；EliteSand Pro `1.0.5` 也加入獨立 BGM 清單、自動
淡出／暫停與延遲恢復。這使 BGM standby 從「單一競品特色」變成兩個完整工作流競品都採用
的模式，值得列入產品決策。

這仍不等於應直接實作。若採用，BGM 必須是獨立 owner，不污染演唱 queue／history／chapter；
交接狀態機需先定義暫停、快速切歌、失敗、使用者手動介入與恢復延遲。無伴奏演出則是另一個
資料模型問題，不應用假媒體檔或特殊 BGM 項目代替。

### 5.2 原生 OBS 音訊仍是高成本候選，不是追趕項目

歌回救星證明「專用 OBS 音訊來源＋一鍵安裝／移除＋虛擬音源備援」可形成完整 UX，
但它也引入 OBS 主行程內 native code、安裝相容性、GPL／SDK 散布與 crash blast radius。
Utawakui 的 Browser Source 與四聲道播放架構目前沒有被證明不足，因此維持 open decision，
不因競品已做就提高為 roadmap 承諾。

### 5.3 內容修正能力比來源數量更值得對標

EliteSand Pro 的優勢不只在 provider 數量；`1.0.6` 把日文發音分析、逐字映射、使用者 override
與來源切換後保存串成一個可修正流程。Utawakui 已有 reading／authoring 邊界，後續比較應看
「錯誤能否被辨識、修正、保存並保有 provenance」，而不是只追求 provider 或模板數量。

### 5.4 Diagnostics 與隱私說明正在成為桌面工具基線

歌回救星新增本機診斷匯出與 privacy notice 後，Utawakui 的 redaction、強制預覽與不自動上傳
仍較具體，但「有本機診斷」「資料留在本機」本身不再是差異化。差異應落在 bounded export、
預覽內容、第三方 endpoint 揭露與可驗證的不自動上傳行為。

### 5.5 更新比較需拆成三個層次

- EliteSand Pro：公開發行已使用獨立 Ed25519 manifest signature、artifact hash 與增量包。
- 歌回救星：公開證據是 componentized package、size／SHA-256、有限重試與驗證式續傳；本輪未找到
  非對稱簽章 manifest 的公開證據。
- Utawakui：Ed25519 多簽章、exact artifact binding 與 package／sign／publish 分權 workflow
  已實作；production key custody、gate activation 與連續版本 acceptance 尚未完成。

因此正確結論不是「兩個競品都有非對稱簽章」，而是兩者的實際更新交付都比 Utawakui 目前的
公開發行驗收更完整；其中只有 EliteSand Pro 可作獨立 manifest signature 的直接對照。

### 5.6 產品邊界維持不變

- 不跟進 Twitch／公開 chat 點歌 automation；EliteSand Pro 的擴張不改變 Utawakui 的非目標。
- 不把 vocal separation 或 native output 描述成獨佔差異化；差異在 recipe、gate、四聲道整合與
  dependency lifecycle。
- Provider acquisition、external lyrics、audio processing、public Output 與 OBS credential 仍維持
  分離 gate，不因競品將它們包成單一 onboarding 而合併。
- 不追 VST3／ASIO／虛擬音訊的全功能工作站範圍；若有實際需求，先借鑑 helper process 與故障隔離，
  不先擴張產品承諾。

## 6. 權利、平台與隱私邊界

競品新增功能不改變素材權利：YouTube acquisition、第三方歌詞、分離 stems、直播混音、錄影／VOD
仍需由使用者確認來源與平台政策。功能存在不等於取得下載、重製、改作、公開演出、公開傳輸或
歌詞展示權利。

本輪只重新查證競品現況，沒有重新審核 YouTube、Twitch、Spotify 或各司法管轄區的政策。Utawakui
的合規立場仍以[法律合規指南](../governance/legal-compliance.md)為準，不在本研究複製政策全文。

歌回救星新增 privacy notice 可證明其公開揭露已改善；它仍是廠商自述，不能代替封包觀察或實機
隱私稽核。EliteSand Pro 與歌回救星的 native／model dependency 也仍受各自授權與散布條件約束。

## 7. Review

本輪已完成：

- 重新讀取 Setlista 官方手冊，確認 `0.23.0` 與試驗公開狀態未變。
- 以 EliteSand Pro 官方 remote refs、GitHub releases、tag source tree 與 assets 確認 `1.0.6`，補入
  BGM lane、公開點歌網址、日文諧音 override、MPL-2.0 公開原始碼與增量更新現況。
- 以歌回救星官方 releases、manual repository 與 stable manifest 確認 App `2.1.6.1`、Launcher
  `1.2.0.8`、runtime `1.0.0.8`；補入 diagnostics 與 privacy notice，移除「沒有正式隱私頁」舊結論。
- 更正「兩個競品都有非對稱簽章 manifest」的過度推論；歌回救星只記錄本輪能公開驗證的
  size／SHA-256 與 package delivery。
- 以目前 Utawakui code／spec 重算矩陣：OBS session／chapter 已實作、pitch 已改用 Signalsmith、
  signed-manifest verifier 已部分實作，不再沿用 2026-09-15 的 source-tree 快照。
- 刪除三輪重複的版本流水帳、逐檔實作清單、單一完成度排名與重複平台政策摘要；保留可影響
  roadmap、產品邊界、ADR 與驗收策略的證據。

限制：

- 未安裝並實機操作三個競品；官方 release／manual 能證明發布與宣稱，不能證明實際品質。
- Setlista 沒有可對照的 desktop artifact；以官方頁面及其 changelog 為準。
- EliteSand Pro `1.0.6` README 的版本字串仍停在 `1.0.4`；本文以 release／tag／asset 為權威。
- 歌回救星 manifest 與 privacy notice 是官方自述；未做 network capture、plugin crash test 或 VST3
  compatibility matrix。
- 平台政策與法律來源未在本輪重新查證，本文不新增法律結論。
