# osu! 單人／多人行為、回饋與 Utawakui 映射

查核日期：2026-10-26（Asia/Taipei）。Owner 追問前輪是否已研究單人／多人遊玩的行為與產品映射。前輪實際涵蓋本機內容、引導與單人提交資格，沒有完整覆蓋多人及結果回饋；本頁補足這個範圍，接續[本機工作流研究](osu-local-first-interaction-and-capabilities-2026-10-26.md)。研究不代表採用多人服務、評分、錄音或雲端協作。

程式查核沿同一 osu!(lazer) commit [`4e11ab19feb423c905cf98d9b8fa34700a8aeffa`](https://github.com/ppy/osu/commit/4e11ab19feb423c905cf98d9b8fa34700a8aeffa)，並補官方 wiki／維護者公告。未啟動遊戲、加入房間、登入帳號或測試多人連線；以下分開描述來源可見行為與本案設計推論，不保證每個公開客戶端的入口與此 commit 一致。

## 1. 先分清玩法、參與方式與規則設定

Owner 後續收斂（2026-10-26）：新增多人互動僅保存遠期備忘，社交配套與行銷定位討論尚未完成，本輪不進行多人細化。適用範圍包含新增輪唱參與者、來賓選曲、輪替／投票、共同編輯及非同步社交；不影響原有個人手機遙控／提詞器方向。下文保留行為證據與可能映射，投入分類以第 5 節及 spec 為準。

osu!、taiko、catch、mania 是四種不同操作／判定的 rulesets；單人或多人則是參與與協調方式，不是另外兩個 rulesets。[官方 game mode 說明](https://osu.ppy.sh/wiki/en/Game_mode)

同樣地，本案的原曲／伴奏是播放來源，居家練習／演出是使用目的，單人／聚會是參與方式，OBS／本機畫面是呈現出口。這些軸可組合，不能因為參考 osu! 就做成互斥的數個產品模式，或各自建立播放器、曲庫與歌詞 owner。

| 互動類別     | 查核到的行為                                                           | 回饋如何形成                                                           |
| ------------ | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Solo         | 單人使用內容；結果頁可重試、看 replay 與展開統計，線上提交另判斷。     | 完成一次操作，看到可解釋的結果，再決定重試／改條件／換內容。           |
| 房間即時多人 | 房間 host、參與者、選曲佇列、素材可用與各人準備狀態；伺服器協調開局。  | 開始前對齊準備；進行中看狀態／位置；結束後看結果及下一輪。             |
| Playlists    | 房間內保存內容與條件，各人自行選項啟動遊玩、提交結果；房間有時間範圍。 | 在共同清單下各自完成，累積個人進度／成績，不需要同時開始一局。         |
| Quick Play   | 官方頁描述配對、確認加入、小池選曲投票及多輪積分。                     | 降低找房成本，以選曲參與及輪次結果推動下一輪；附帶配對與曲池維運成本。 |
| Ranked Play  | 與 Quick Play 不同的型別；官方維護紀錄包含 rating、duel 與連線處理。   | 競技評等／勝負構成主循環；不是一般歌曲熱度或私人練習進度。             |

上述類別由 [MatchType](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Online/Rooms/MatchType.cs)區分 Playlists、HeadToHead、TeamVersus、Matchmaking 與 RankedPlay；Solo 另有路徑。Quick Play 的詳細人數／輪次僅按[官方 wiki](https://osu.ppy.sh/wiki/en/Gameplay/Quick_play)記錄，不外推 Ranked Play 使用相同規則。2026 年的 Ranked Play 現況另外參照[維護者 changelog](https://osu.ppy.sh/community/forums/topics/2202736)，不把較舊 Quick Play 說明當整個配對系統現況。

stable 的 Multiplayer wiki 仍有 16 人、Tag co-op 等版本特定描述；本輪不將它們視為目前 lazer 的完整功能表。

## 2. 單人：把回饋接回下一個可做的動作

### 2.1 查核到的循環

[ResultsScreen](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Screens/Ranking/ResultsScreen.cs)依 AllowRetry、AllowWatchingReplay 等條件提供重試／replay，統計可展開，並非只有一個分數。前輪的 SoloPlayer 查核也已確認：缺少提交 token 不必阻止單人遊玩。

統計的內容來自規則集。[OsuRuleset](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game.Rulesets.Osu/OsuRuleset.cs)的 CreateStatisticsForScore 包含表現拆解、Timing Distribution／Average Hit Error／Unstable Rate，以及 Accuracy Heatmap。這些由譜面判定與 hit events 支撐，不是僅憑歌曲播放時間推算。

[StatisticsPanel](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Screens/Ranking/Statistics/StatisticsPanel.cs)會檢查是否有 hit events；缺資料時部分統計需要取得／觀看 replay。這提醒本案要讓回饋能力取決於已有證據，不在沒有輸入或參考時顯示假的品質結論。

### 2.2 本案的回饋可以分四層

| 回饋層       | 本案現況與候選                                                                                                                                                                                      | 可以說什麼／不能說什麼                                                                            |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 操作結果     | 已有場次 completed／skipped／aborted、manual 明確完成與本機播放紀錄；沿[場次契約](../../contracts/performance-session-preparation.md)及[播放紀錄](../../contracts/playback-history-and-resume.md)。 | 說明本次操作的結果；自然播放完不證明有人唱完，更不表示唱得好。                                    |
| 自我練習回饋 | 區段重試、逐曲 Key／tempo 與歌詞對時已有研究草案；練習筆記、待練標記、自評屬新增研究候選。                                                                                                          | 不接 Mic 也能降低重新準備的成本；重試／練習不能無條件累加正式演出完成。新筆記不冒稱已有保存欄位。 |
| 聲音量測     | Mic 音準視覺化與電平動畫仍是不同候選。                                                                                                                                                              | 電平可以驅動畫面，不能推論音準／演唱品質。音準對照還需輸入、參考旋律、時間校準與串音處理。        |
| 競技成績     | 分數、accuracy、名次、能力配對尚無相應模型與決策。                                                                                                                                                  | 不能直接借 osu! 指標替歌曲評分，或把播放次數轉成演唱實力。保持低優先。                            |

最有價值的映射是「結果 → 可理解的原因 → 下一個動作」，例如發現副歌還不熟，就回到該區段並沿用這次 Key／tempo。這是區段練習與逐曲偏好的互動推論，不等於已有區段品質偵測；原有[順序規劃](player-practice-planning-2026-10-26.md)及進入條件維持不變。

osu! replay／spectator 路徑處理輸入 frame 與遊戲狀態，本案若要回聽實際歌聲，必須另有音訊錄製能力。現有 OBS history／時間戳不是錄音，也不保證保存 OBS 影片。歌詞／播放事件重建也不能冒充聲音回放。

## 3. 房間多人：準備、控制權與輪次比勝負更適合借鏡

### 3.1 開始前、進行中、結束後各有狀態

- [MultiplayerRoom](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Online/Multiplayer/MultiplayerRoom.cs)持有 Host、Users、Playlist 與 countdowns；CanAddPlaylistItems 依 host／referee／queue mode 判斷，參與不等於取得全部控制權。
- [QueueMode](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Online/Multiplayer/QueueMode.cs)區分 HostOnly、AllPlayers、AllPlayersRoundRobin。這證明房間可以獨立選擇選曲權與佇列政策；未查核整套 server 排序／離房演算法，不能保證任意情況的公平性。
- [MultiplayerRoomUser](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Online/Multiplayer/MultiplayerRoomUser.cs)把 BeatmapAvailability 與使用者 State 分開；[MultiplayerUserState](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Online/Multiplayer/MultiplayerUserState.cs)另區分 Ready、WaitingForLoad、Loaded、ReadyForGameplay、Playing 等。持有內容、讀取完成與本人準備好不是同一件事。
- [MultiplayerPlayer](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Screens/OnlinePlay/Multiplayer/MultiplayerPlayer.cs)設 AllowPause=false、等待伺服器 GameplayStarted、非預設直接跳 intro 而可發投票；遊玩失敗不立即結束整局。結果準備另有等待及 60 秒上限，避免無限卡住。這是特定多人政策，不能直接套到單人練習。

### 3.2 對本機聚會的映射

本案最接近的情境是一台主機播放、多人輪流唱。可以沿現有演出安排研究下一位／下幾首、候選選曲、主持人確認、完成／略過及個別演唱偏好；先把「多人輪流」視為場次需求，沒有理由因此要求每位朋友都持有同一份音訊或登入雲端。

其中有幾個要保護的邊界：

1. 素材 ready 與演唱者「準備好了」分開；不能因為音檔就緒就自動開唱。是否要逐首人工確認仍取決於場景，單人連續播放不必多一關。
2. 選曲、調整順序、開始／停止與改變全局音量是不同權限。手機遙控的既有方向不自動授權來賓共同改佇列；若提供手機選曲，需要另外決策 pairing／撤銷／主持人控制。
3. 演唱者與一次 occurrence 的選擇不應覆寫歌曲 artist／album。相同歌曲可由不同人、不同 Key 重複安排；來賓偏好與機器音訊裝置設定分開。現有場次尚未因此新增來賓身份或 per-person preset。
4. 輪替選曲與投票可作場次內的公平／參與機制，但不直接成為長期歌曲熱度。避免同一人重排、略過或重試污染統計。
5. 不照搬 multiplayer 不可暫停／逾時強制開始。歌唱聚會可能需要等人、喝水與設備調整；由本機操作權威處理開始、暫停與換人較符合現有產品。

上述都是候選行為，不啟動聊天室點歌、網路房間或新的參與者資料模型。同機合唱也不代表 App 已有雙 Mic、分軌錄音、混音或人聲監聽。

## 4. Playlists、配對與觀看的不同映射

### 4.1 Playlists：共同內容可各自完成

[Room](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Online/Rooms/Room.cs)包含房間開放時間與 playlist；[PlaylistItem](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Online/Rooms/PlaylistItem.cs)包含內容、ruleset、required／allowed mods 等條件。[PlaylistsRoomSubScreen](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Screens/OnlinePlay/Playlists/PlaylistsRoomSubScreen.cs)由個人選擇推入 PlaylistsPlayer，離開後重取 leaderboard；沒有採即時房間的 Ready／共同開局路徑。[PlaylistsPlayer](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Screens/OnlinePlay/Playlists/PlaylistsPlayer.cs)驗證對應內容與條件，結果允許 Retry。

因此較適合映射為「一份固定選曲與練習條件，各自練習並保留進度」。單機版本可先研究個人練習清單／目標，不需要榜單或同時上線。分享 metadata 清單、追蹤朋友進度、到期任務、回報結果與多人排名則各有新的資料／服務成本，不把 osu! Playlists 直接等同本案既有本機 playlists。

若未來要做自己與自己比較，應固定錄音版本、區段、速度、Key、歌詞修訂與量測版本；條件不同先明示，沒有量測就只比較明確操作／自評。完成清單或練習次數不等於能力提升。

### 4.2 Quick Play／Ranked Play：借選曲參與，暫不借競技服務

Quick Play 官方頁記錄相近能力配對、有限曲池投票與多輪積分；投票增加被抽中的機率，並非保證最高票必選。這可啟發聚會「給少量可唱候選，讓大家參與選下一首」，但本機候選首先要符合持有／準備條件；不能以 osu! 星等替代音域、語言、熟悉度與歌唱難度。[官方說明](https://osu.ppy.sh/wiki/en/Gameplay/Quick_play)

Ranked Play 維護紀錄另有 rating／邀請 duel、斷線、載入逾時與結果停留時間的修正。這說明競技回饋背後有額外狀態與維運成本；本案不因研究採用能力配對、段位、對戰、懲罰或評分。引用的是有日期的官方維護紀錄，不承諾其每項歷史規則在所有當前 server 仍完全相同。[維護者 changelog](https://osu.ppy.sh/community/forums/topics/2202736)

### 4.3 Replay／Spectator：觀察與控制、資料與聲音分開

[SpectatorClient](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Online/Spectator/SpectatorClient.cs)處理 replay frames 並打包傳送；[FrameDataBundle](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Online/Spectator/FrameDataBundle.cs)保存 frame header／LegacyReplayFrames。這些來源證明這條路徑的遊戲狀態資料，不是 Mic 音訊傳輸或遠端低延遲合唱方案。

Utawakui 的 Performer／Output 已消費主播放器的呈現投影；手機讀詞、主持人控制與觀眾觀看應沿此權威與權限差異研究。公開 Output WebSocket 仍為唯讀，不能因比擬 spectator 就開成控制通道。

遠端同時唱還需要獨立評估輸入、編碼／傳輸、接收緩衝、同步、回音與監聽往返；osu! 的共同開局、輸入重播或延後顯示分數無法證明可接受的人聲延遲。本輪沒有測量，也沒有解決既有 Mic 監聽問題。

## 5. Owner 收斂後的分類與進入條件

以下取代先前將同機輪唱與手機來賓角色排在個人練習之後的建議順序；可借鏡的行為證據保留，不據此列為近期功能。

| 分類               | 內容                                                                                       | 現況與下一步                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| 可返回原規劃細化   | 個人練習的重試、保留當次條件、區段返回與可解釋結果。                                       | 沿逐曲設定、區段練習、歌詞對時確認與快捷操作原順序；仍是研究草案，細化不等於進入實作。                                  |
| 既有方向維持       | 個人手機遙控／提詞器、既有演出安排與呈現投影。                                             | 延續原本的前置與驗收，不把來賓加入、選曲或共同編輯附帶進來。                                                            |
| 個人用途的額外候選 | 練習任務、自評／筆記、個人清單參照匯出入。                                                 | 尚未接受，沒有必要先插入原四項細化；待需求明確後再決定。                                                                |
| 獨立研究           | Mic 音準比較、輸入電平動畫、錄音回聽。                                                     | 三者前置與證據不同；保留研究，沒有因 osu! 而解決輸入、量測或音訊延遲。                                                  |
| 遠期多人／社交備忘 | 新增輪唱參與者、主持人／來賓角色、手機來賓選曲、輪替／投票、共同編輯、分享清單與共同進度。 | 等待社交配套與行銷定位討論，再由 Owner 決定是否細化；本輪只記錄，不安排開發日期或新增資料模型。既有場次能力不因此停用。 |
| 目前不投入         | 段位／MMR、自動配對對戰、遠端即時合唱音訊。                                                | 缺產品需求與評分／音訊／服務證據；一般歡唱與原規劃細化不等待這些項目。                                                  |

架構上可以保留同一份本機曲庫與單一播放器供不同情境使用；近期先聚焦個人播放／練習與已有演出流程。多人場景的操作權與社交設計留待上述條件成立後討論，不能由 osu! 選單直接推導新增產品模式。

## 6. 證據與尚未覆蓋範圍

本輪完成客戶端原始碼與官方文件的行為對照，補上前輪漏列的多人分類及回饋映射。未驗證 server 的整套輪替排序、斷線重連與持久保存；未重建 Ranked Play 完整賽制、反作弊或配對演算法，也未據 enum 宣稱每項入口的公開可用性。Playlists 的非同步判斷由 Room／個人啟動／結果路徑交叉確認，沒有實際建立或參與房間。

Utawakui 部分沿現有規格、場次／播放紀錄契約及先前規劃，沒有新增 schema、產品狀態、控制 API、上傳、Mic 權限或錄音能力。後續細化先回到上述順序與原有 owner，不把本頁變成第二份已承諾 roadmap。
