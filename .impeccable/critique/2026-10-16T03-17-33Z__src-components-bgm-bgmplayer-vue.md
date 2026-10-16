---
target: BGM 組件排版、狀態資訊精簡、入口整合與按鈕重複性
total_score: 22
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 3
target_identity: "file:E:\\Utawakui\\src\\components\\bgm\\BgmPlayer.vue"
target_fingerprint: 'sha256:d230c9d61872017f12c245d74bd7119b88bb928e5ec1e45007d0d6923f510631'
target_path: "E:\\Utawakui\\src\\components\\bgm\\BgmPlayer.vue"
timestamp: 2026-10-16T03-17-33Z
slug: src-components-bgm-bgmplayer-vue
---

Method: dual-agent (A: `/root/bgm_design_assessment` · B: `/root/bgm_detector_assessment`)

## Design Health Score

| #         | Heuristic                       |     Score | Key Issue                                                        |
| --------- | ------------------------------- | --------: | ---------------------------------------------------------------- |
| 1         | Visibility of System Status     |         3 | 狀態投影完整，但不同 lane 可能只顯示同一個「暫停」。             |
| 2         | Match System / Real World       |         2 | Talk、Mute、Cut 的圖示與詞彙不夠自明。                           |
| 3         | User Control and Freedom        |         3 | 控制完整，但關閉面板後 audible BGM 失去可見控制脈絡。            |
| 4         | Consistency and Standards       |         3 | primitives 一致；header chevron 的位置像整體收合，實際卻是換曲。 |
| 5         | Error Prevention                |         3 | 狀態機保護扎實；三種「變安靜」操作相鄰，仍可能誤判。             |
| 6         | Recognition Rather Than Recall  |         2 | Talk／Mute／Cut 主要靠 tooltip 才能分清。                        |
| 7         | Flexibility and Efficiency      |         2 | 基本鍵盤支援存在，常用 BGM intent 與換曲入口仍不夠直接。         |
| 8         | Aesthetic and Minimalist Design |         2 | 多個 chip、四個 icon button、兩條 range 缺乏充分分組。           |
| 9         | Error Recovery                  |         1 | 可見只寫「失敗」，原因與下一步不在畫面上。                       |
| 10        | Help and Documentation          |         1 | tooltip 有名稱，沒有解釋三種音訊抑制層級。                       |
| **Total** |                                 | **22/40** | **Acceptable；底層契約強，視覺語意需要收斂。**                   |

## Design Specificity Verdict

狀態模型是 Utawakui 專屬：OBS session、演唱／BGM lane、Talk attenuation、曲後回復與立即 Cut 都符合歌回現場；但外觀仍像通用 MiniPlayer。產品特異性藏在 state machine，沒有轉化成一眼可辨識的操作語言。

Assessment A 的未錨定判讀與 Assessment B 的 source evidence 一致。Deterministic scan 對 `src/components/bgm` 回報 0 findings；這表示沒有機械式樣式違規，不代表 IA 沒問題。這次問題集中在跨元件狀態投影、命名與操作層級。

沒有可靠的 live browser overlay：當時沒有可達 localhost／Electron surface，也無法在靜態 Vite 頁面重建相同的 library、OBS、handoff 與 audio state。因此採使用者附圖作視覺真相，再以 Vue template、CSS、state machine 與 focused tests 驗證。

## Overall Impression

畫面安靜、穩定、沒有真正的 hit-area overlap；但在最需要快速反應的那一秒，操作者仍得靠 tooltip 或記憶分辨暫時降音、持久靜音與立即停止。最大的改善機會是把狀態合成一條 operational sentence，並把正常控制、音量控制與事故控制分層。

## What's Working

1. 安全能力沒有被偷工減料：Mute、Talk、Cut 雖然結果相似，實際副作用與恢復規則不同，保留三者合理。
2. 幾何穩定：四顆按鈕加 volume 是明確 grid；截圖中的黑色方塊只是 tooltip，不是額外按鈕，也沒有 click target 疊在一起。
3. 可存取基礎完整：原生 range、focus、accessible labels、aria-live、disabled state 與固定 slot 都已有契約。

## Priority Issues

### [P1] 「緊急靜音」與 Mute 的語意衝突

- **Why it matters**：兩者瞬間聽感都像靜音，但 Mute 讓時間軸繼續；Cut 會立即停 deck、取消 restore。現場誤判會改變後續播放狀態。
- **Fix**：保留 Cut，但改名「立即停止 BGM」或「緊急停止」，使用 shared danger intent；不要再用「靜音」。與 Talk／Mute 拉開語意群組間距，不藏進 menu、不加確認。
- **Suggested command**：`$impeccable clarify` ＋ `$impeccable layout`

### [P1] 狀態被拆成 OBS、phase、restore 三個同權 chip

- **Why it matters**：操作者必須自行拼成現在誰在播、之後會不會回復、OBS 是否可信；hidden restore slot 平時仍固定吃掉 4rem，直接擠壓曲名。
- **Fix**：OBS 保留在 header 但降為 session context；把 phase＋restore 合成一個固定寬 operational status，例如「演唱中 · 曲後回復」「BGM 暫停」「演唱暫停 · 可播 BGM」。
- **Suggested command**：`$impeccable distill`

### [P1] 面板關閉後，正在發聲的 BGM 失去可見入口狀態

- **Why it matters**：titlebar active 目前只等於 `bgmPlayerOpen`，不等於 audible。BGM 可以繼續發聲，但全域入口看不出正在播放、淡出或失敗。
- **Fix**：Titlebar BGM 入口同時投影 disclosure 與 audible／error indicator；面板關閉時仍可一眼看見 BGM 正在出聲並重新開啟。Cut 是否升到 shell 級入口需另做明確安全決策。
- **Suggested command**：`$impeccable harden`

### [P2] 換曲入口放在 header chevron，定位像整張卡片收合

- **Why it matters**：使用者會把 chevron 解讀成 compact／close，而不是更換 BGM。
- **Fix**：把「更換」入口併入 artwork＋曲名的 current-source 區；header 只保留拖曳、Pin 與真正的 hide／compact 控制。Titlebar BGM icon 維持唯一全域開關。
- **Suggested command**：`$impeccable clarify`

### [P2] 可見錯誤只有「失敗」

- **Why it matters**：螢幕閱讀器能讀到完整錯誤，視覺操作者反而不知道原因與下一步。
- **Fix**：在 transport 下方顯示一行 bounded public error 與重試／重新選擇／檢查音訊輸出的下一步；chip 只保留警示摘要。
- **Suggested command**：`$impeccable harden`

## Persona Red Flags

### Alex／熟練操作者

- Talk／Mute／Cut 必須靠 hover 才能精確分辨。
- 換曲需要開啟面板後再找 header chevron，入口不貼近 current source。
- 面板關閉後缺少明確 audible indicator。

### Sam／鍵盤與輔具使用者

- focus、range、accessible label 基礎良好。
- Talk／Mute toggle state 的控制語意仍需完整投影。
- 視覺與輔具取得的錯誤資訊不對等。

### Mika／歌回現場操作者

- Talk 與真正的緊急停止外觀權重太接近。
- 「暫停」沒有說明是演唱 lane 還是 BGM lane。
- `OBS 未確認` 描述技術狀態，卻沒回答目前 BGM 是否正在本機出聲。

## Minor Observations

- 5rem artwork 在 18–20rem 卡片裡偏大；合併 status 後可再評估是否降至 4rem，但不是第一優先。
- Tooltip 會短暫遮住 progress／artwork，但不擋點擊；應改善 shared placement，不寫 BGM-local magic offset。
- OBS chip 與 phase chip 都用 pill anatomy，卻代表不同層級。
- `track-paused` 與 `manual-hold` 可見文字都叫「暫停」，應改成「演唱暫停」與「BGM 暫停」。

## Questions to Consider

- 如果最糟的一秒只允許找到一個控制，Emergency Cut 為什麼看起來像 volume 旁的小方框？
- `OBS 未確認` 出現時，操作者能做什麼？如果沒有立即動作，它是否值得占據 header 的第二高權重？
- BGM 正在發聲但播放器關閉時，整個 shell 的「唯一真相」應該在哪裡？
- 更換歌曲是否應該就是點擊目前的封面／曲名，而不是另一個不具名 chevron？
