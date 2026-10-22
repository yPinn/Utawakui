# 歌詞本地與 Output 時鐘配對修正 — 2026-10-22

本輪修正本地起點提示的採樣等待，以及 Output 舊媒體位置配上新發布時間的問題。T1+ 保留分段起點整塊即亮；沒有啟用掃字、增加模型或改寫 timing／sidecar。

後續的 Output p95／首字長幀排查與修正見[長尾延遲報告](lyrics-output-tail-fix-2026-10-22.md)。本報告保留當時基準與結果，後續重複案例不覆寫原單次觀測。

## 修正範圍

`usePlayer.samplePlaybackClock()` 同步唯讀取得 HTMLAudioElement 的位置、實際倍率、phase、track／continuity 與配對時間。實作位於 `src/utils/playbackClockSample.js`，仍由原 player owner 綁定唯一 audio element，不推算或回寫 transport state。

`useLyrics` 透過內部 `useLyricsClock` 建立 T1／T2／已套用 T1+ 邊界索引，在到點或原有媒體／控制事件時重新讀取實際位置。晚到 callback 直接選當前位置，早到重排；暫停、緩衝、seek、結束、來源與 offset 改變會取消或重排。控制寫入先經 Vue 批次完成，避免倍率 intent 先變、audio 倍率尚未更新時讀到舊值。播放熱路徑不量測版面，也不逐幀更新全域 Vue state。

Output publisher 完成內容傳送後，先重查 continuity 與三種內容文件 identity，再採樣並重建動態資料、references 與 `generatedAt`。文件已變更時跳過舊 state 並排入最新投影；同一 continuity 的文件換版保持既有 epoch handshake，不能向已見 epoch 誤送 `full`。被拒的狀態則先換 epoch，再重新檢查／採樣，即使重試時文件又變更，後續最新投影仍能完成新的 full handshake。手動演出項目保留原本的虛擬位置與倍率。

## 固定案例與判讀

沿用[修正前研究](../research/lyrics-alignment/lyrics-fine-timing-clock-2026-10-22.md)的自製 24 秒靜音 PCM、相同文字與已知 500ms 起點、pause／resume／seek／1.25×／+200ms offset 順序。隔離可見 Electron 使用真 HTMLAudioElement、usePlayer、實驗分段 owner、LyricsDocumentPanel、publisher、Projection Hub／Server 與正式 Focus scheduler／DOM；Library／queue／session／reading 等資料 owner 及起點是合成。

本地 harness 將正式 `useLyricsClock` 接入實驗分段 owner；完整 `useLyrics`、使用者曲庫與 feature gates 的 App 整合不在本次可見量測內，另由 focused owner 測試覆蓋。這不是自然歌聲或完整使用者環境的人工接受。

以 rAF 配對實際媒體時間與牆鐘，跨 renderer 參照使用相鄰真實採樣內插。穩態排除控制後首 350ms 與暫停；控制後首 200ms 另報。正值表示落後、負值表示提早，媒體毫秒與按倍率換算的牆鐘毫秒分開。幀數與觀測起點次數會隨 OS 排程及控制切換位置變動，沒有強制讓分母相等；完整分布、共同起點對照及未配對原因皆保留。

這是固定案例的 before／after 工程量測，並非獨立歌曲統計或自然歌聲準確率。一般 Output 外推原本已貼近媒體時間，不能以改善控制事件錨點宣稱每個 Output 畫面都更快。首次長幀仍列入最大值；沒有量聲卡、喇叭、實體螢幕或 OBS。

## 同案例結果

以下為全部穩態起點觀測，單位為牆鐘毫秒。最終版本 85／85 envelopes 接受，79 份 state、0 拒絕；七份 runtime source hash 在執行前後一致，兩視窗可見，沒有 renderer errors 或測試 Electron 殘留。

| 主提示 DOM   | 次數前→後 | p50 前→後   | p95 前→後    | 最大前→後    |
| ------------ | --------- | ----------- | ------------ | ------------ |
| 本地歌詞     | 33→35     | 131.22→4.00 | 267.01→15.36 | 274.05→25.17 |
| Output Focus | 34→35     | 3.80→4.78   | 12.16→25.17  | 137.37→55.72 |

以 surface、phase、已知起點與同 phase 的重播次序配對，本地共同 31 次：牆鐘 p50 121.32→4.00ms、p95 267.01→15.36ms、最大 274.05→25.17ms。僅修前 2 次是 seek／offset 後的起點：修後及時出現而落在相同 350ms 排除窗；僅修後 4 次是修前慢採樣跨過 phase 結束，沒有同 phase 觀測。Output 共同 34 次，牆鐘 p50 3.80→4.00ms、p95 12.16→25.17ms、最大 137.37→55.72ms；僅修後 1 次在 resume 結尾。這個共同子集也不支持 Output 顯示 p95 全面改善。

Output 修前首字有 138.10ms rAF 長幀，最終版本仍有 56.10ms 首字長幀；都保留在最大值。不能把該次最大值下降歸因於採樣修正已解決首次容量／字型或其他繪製工作。本地 `player.state.currentTime` 的原有事件採樣間距沒有改快，改善來自顯示 owner 在邊界重讀 audio。

發布錨點以媒體毫秒比較，79→79 次：signed 範圍由 −0.437～229.021ms 變成 −0.479～0.488ms，p95 14.215→0.443ms。倍率切換第一份發布落後 131.565→0.187ms，offset 第一份 227.965→−0.375ms。這證明同次位置／時間配對改善控制事件發布，並不等於所有 DOM 或硬體延遲均小於 1ms。

控制後首 200ms 原始窗另存：rate 重建位置仍有 −17.539～1.211ms 範圍；中間 run 也觀察到 fresh 錨點僅 +0.256ms，但原生 currentTime 相對新倍率外推仍有約 −29.437ms 過渡，與 Output 提早值相符。這支持原生媒體過渡因素，並非瀏覽器內部因果追蹤。最終 seek 的一筆舊 Output frame timestamp 恰與 control 相同，跨 renderer 的不連續配對算出 −6825ms；新媒體第一個本地 sample 在 +0.7ms，下一 Output +4.2ms 已是正確位置。此筆原始值保留，不能解讀為 6825ms 顯示延遲或已證實停留一整幀。rAF、跨 renderer 內插與 Date 毫秒精度限制仍在。

可攜的[聚合數據與證據 hash](../research/lyrics-alignment/data/lyrics-clock-fix-2026-10-22.json)同時保留全體、共同子集、未配對原因、各 phase 分母及控制窗；沒有以新的分母替換原始結果。

## 驗證紀錄

失敗測試先重現沒有 timeupdate 的起點、舊位置搭新發布時間、文件 await 中切歌／換版及倍率同步 watcher 競態。另以實際 Projection Hub 驗證同 epoch 文件換版不會誤送 full，並涵蓋拒絕重試、手動演出、pause／buffering／seek、early／late callback 與取消。

最終完整回歸 1001 files、9490 tests 通過、1 skipped；focused coverage 6 files／183 tests 通過，本輪五個 runtime 檔 statements 95.43%、branches 88.74%、functions 98%、lines 97.76%。本地 boundary clock 為 100% statements／95% branches；採樣 helper 100%。ESLint 與 production build 通過；build 仍提示大 chunk。新 shared runtime／HTTP routes／封裝資產皆未增加，未另做 installer 或硬體／OBS 驗收。獨立 code review 對最後產品修正 APPROVE。

全庫 Markdown 177 files、owned 檔案 Prettier、`git diff --check` 通過；可攜數據的 evidence hash 與最終 runtime source hash 再檢查相符。

可重跑 harness 與逐幀 raw 留在 ignored `tasks/lyrics-clock-fix-20261022/`；修正前 `tasks/lyrics-fine-clock-20261022/clock/` 的 13 份來源／證據 hash 保持不變。中間 run 保留：一次格式化造成 source bytes 漂移、一次同 epoch full 被拒，都未冒充最終驗收。未 commit。
