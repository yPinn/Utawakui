# 八模板 Output 驗收清單

更新日期：2026-10-21。F1–F5 本機範圍與 Live Stage 補驗已有紀錄；真實 OBS、完整耐久與人工作品驗收仍待完成。以下為重跑方法、驗收範圍與當輪證據，不代表八模板全矩陣通過。
設定值域、default／opt／advanced、模板不變條件與本機來源以[顯示契約](../contracts/output-appearance-baseline.md)為準；後續階段見[現行計畫](../governance/appearance-sets-plan.md)。

## 重跑 F1 基線

執行 `npm run output:baseline`；預期 `ok: true`、`templates: 8`、`scenarios: 32`、`issues: []`。
執行 `npm exec -- vitest run scripts/outputAppearanceBaseline.test.mjs` 檢查固定資料、跨入口設定與純投影契約。
在 Windows 受限環境遇到既有檔案 rename 的 EPERM，依既有測試慣例把 TEMP／TMP 指到工作區內獨立 tasks 目錄重跑；不要改正式存檔語意來消除環境錯誤。

工具與 [fixtures](../../scripts/fixtures/output/README.md) 不讀真實曲庫、不列舉私人字型／圖片，不啟動 OBS 或驅動 UI。
`createAcceptanceMatrix()` 提供八模板 × 32 case 的機器清單，applicability 與 evidence 分開記錄。
projection-only 不是畫面已通過；runtime-pending／manual-pending 也不是測試失敗，代表尚未執行該層驗收。

## 模板適用矩陣

以下為人工驗收索引。完整案例的可見畫面與真實 OBS 仍待逐項驗收；F2 局部結果見末節。不適用須寫原因，不可當成通過數。

| 模板            | 宣告 capture | 歌詞 T0／T1／T2 | 封面故障 | 已安裝字型拒絕 | 預設之外的重點                                    |
| --------------- | ------------ | --------------- | -------- | -------------- | ------------------------------------------------- |
| queue-board     | 480×810      | 不適用          | 不適用   | 不適用         | 字型／字重、surface、密度；current／played 與分頁 |
| karaoke-stack   | 1920×1080    | 適用            | 不適用   | 不適用         | 共用 Look／字級；雙 lane 與 timing 不可由外觀改寫 |
| kinetic-pop     | 1920×1080    | 適用            | 不適用   | 不適用         | material／cycle、arrangement；三層順序固定        |
| ornate-vertical | 1920×1080    | T2 按行級回退   | 不適用   | 不適用         | 六位 Hex、兩種字型、右側 anchor／有界 offset      |
| live-stage      | 1920×1080    | 適用            | 不適用   | 適用           | 本機字型描述、contrast、獨立文字 policy           |
| manga-frame     | 1920×1080    | 適用            | 不適用   | 不適用         | 字型／字重、reading auto／off；ruby／框內安全區   |
| art-card        | 480×270      | 不適用          | 適用     | 不適用         | 字型／字重、封套與播放位置                        |
| cover-player    | 480×540      | 不適用          | 適用     | 不適用         | 字重、surface、封面與進度                         |

字型缺失／延遲與 reduced motion 在八模板皆須按其實際字型／動態驗收；不能因不支援本機字型選單就略過 bundled font 失敗。
語言案例是中／日／韓／英壓力輸入，不因資料存在就承諾該模板已通過所有語言排版。

## 共用情境與通過條件

完整 case id 與輸入以 [scenarios.json](../../scripts/fixtures/output/scenarios.json)為準；下面的群組共 32 cases。

| Cases                                                                                   | 數量 | 應驗結果                                                        | F1 證據層次          |
| --------------------------------------------------------------------------------------- | ---- | --------------------------------------------------------------- | -------------------- |
| playing-t1、empty、missing-duration                                                     | 3    | 正常呈現／清空，不殘留前曲；無 duration 不產生假進度            | 純投影；畫面待驗     |
| missing-artwork、image-error                                                            | 2    | 合法 artwork route 缺圖／解碼失敗有 fallback，不改讀任意路徑    | 資產／畫面待驗       |
| missing-reading、playing-t0、playing-t2                                                 | 3    | 缺 reading 不編造；T0／T1／可信 T2 按模板能力回退               | 純投影；畫面待驗     |
| paused、seek-forward、seek-backward、track-change、natural-end                          | 5    | 跟隨播放器 authority、前後 seek 收斂、換曲清舊內容              | 純投影；動態銜接待驗 |
| rapid-track-changes、source-unavailable、source-syncing、source-ready、source-reconnect | 5    | 最後曲目收斂；新 boot／epoch 不接受過期內容；斷線不顯示示範歌名 | runtime-pending      |
| reduced-motion-initial、reduced-motion-toggle                                           | 2    | 初始／切換均可讀，保留靜態 fallback，不重播舊 beat              | manual-pending       |
| font-denied、font-missing、font-delayed                                                 | 3    | 拒絕列舉不阻斷；缺字型有 fallback；延遲到達不重設時序           | manual-pending       |
| capture-declared                                                                        | 1    | 宣告尺寸內安全區／透明 alpha；不推定任意畫布支援                | manual-pending       |
| language-zh-Hant／ja／ko／en 各 short／long                                             | 8    | 檢查斷行、裁切、標點與缺字，記錄模板限制                        | 純投影；排版待驗     |

## 設定與來源驗收

- [ ] 每模板用空設定起始，實際值符合固定 fields 的 default；保存／重載不變。
- [ ] common Look／字級與模板 opt 在所列選項內生效；超限數字 clamp、非法值回預設，不擴大 consumer。
- [ ] Ornate advanced 色碼／offset 不超值域；未公開的 alignment／contentWidth／自由位置不是隱藏解鎖。
- [ ] 切模板依既有 carry 規則；最近／常用色票不自動改其他模板，不宣稱獨立每 set 的設定檔。
- [ ] Live Stage 僅明確操作後列舉已安裝字型；拒絕權限可繼續使用，Overlay／iframe 不能列舉。
- [ ] 選字型只保存描述，不傳字型檔；OBS 缺同一字型仍可讀且記錄 fallback 差異。
- [ ] 封面只用曲庫受管圖片與 track id；appearance 不接受任意檔案路徑／URL 成為圖片來源。
- [ ] 一般背景／logo 圖片匯入、字型檔匯入、共享使用者素材均維持未交付；不把未存在功能標為已驗。
- [ ] Workbench guide／backdrop／sample 不進正式 OBS URL；控制台與 Overlay 不共享不相容的視覺 tokens。

上述勾選保留給後續實際驗收；F1 的跨入口函式測試不能替代 UI 操作／權限提示／真實 OBS 字型結果。

## 結果記錄與停止條件

後續 dated record 至少保存 source commit／dirty 與必要檔案 hash、App／Electron／OBS／Windows 版本、模板、實際 settings、capture、scenario／時間點、資產／motion／背景、結果及 evidence 路徑。
結果分通過、失敗、未測、不適用，證據分純函式、DOM、capture、可見 Electron、真實 OBS。
F4 的隔離 capture 驅動器與重跑操作見下節；工具結果不會自動勾選本清單的人工驗收。

F1 可結束的條件是固定基線不漂移、情境可重現、跨入口設定與來源邊界檢查通過、適用性與未測項可查。
F1 本輪至基線停止；後續 F2 已驗範圍如下，F3 preview、模板藝術、付款與遠端 pack 仍未交付。

## F2 局部驗證紀錄

2026-10-20，source HEAD a0a5374da94447b7ceffaf95db22a8162963aa2b 加本輪未提交修改。模組與影像 hash、環境及測試統計見[版本化結果](../governance/data/appearance-host-f2-validation-2026-10-20.json)；完整日誌／PNG 留在本機 tasks，不取代 Gallery 縮圖。
Electron 43.7.8／Chromium 150.0.7871.250，可見 sandboxed BrowserWindow 經正式 Output HTTP／V3 WebSocket、F1 合成資料與測試 adapter 驗證，未讀私人曲庫／字型檔。此隔離 harness 不進產品或正式 preview。

| 已驗項          | 範圍／結果                                                                                                                    | 限制                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 修改前後畫面    | 八模板各 baseline／F2，共 16 張；全部 changedPixels 0                                                                         | 固定 paused 5 秒、T1、初始 reduced motion；不代表所有 normal-motion 中間幀已逐像素比較 |
| 宣告畫布        | 三個 Widget 按原尺寸、zoom 1；五個 FHD 為 1920×1080 CSS viewport、zoom 0.75、1440×810 capture                                 | 為完整顯示於桌面而縮放；不把實體 PNG 尺寸冒充 FHD 原生像素                             |
| 隱藏／恢復      | 八模板在真實 win.hide／show 間接收兩次換曲，恢復最新 c，不補播 b                                                              | 只有合成情境，非長時間壓力                                                             |
| 重連與 identity | 八模板 server 重啟於相同 port，新 boot／epoch 與 revision 0 均收斂到 d                                                        | 完整 backoff、split ordering、source readiness 另有既有 runtime／server tests          |
| Reduced motion  | 八模板初始 reduce 與執行中 no-preference 切換，無 JS 錯誤                                                                     | 無 GSAP 的動態偏好與靜態 controller 由單元測試補驗                                     |
| 字型 fallback   | Live Stage 選不存在的本機 family，原有 system-ui／sans-serif fallback 保持可讀                                                | FontFaceSet reject／error／遲到與 dispose 後通知由單元測試驗；未要求或匯入字型檔       |
| 清理            | 八模板 pagehide 後 server clients 為 0；host 重複清理／font／motion 訂閱、observer／rAF 與舊 socket／取消 timer 由 tests 補驗 | 測試程序已退出；未作 60 分鐘資源基準                                                   |

本輪相關 80 份／872 項 tests、F1 八模板／32 情境基線、ESLint、Markdown、格式、build 與封裝依賴檢查通過。Shared host／appearance／runtime coverage S95.01／B86.62／F94.28／L98.67；host 行覆蓋 100%。
真實 OBS、透明 alpha 合成、全語言／全狀態排版、完整畫面／效能矩陣仍維持未測；上方完整 checklist 不因本節而全部打勾。F2 當輪至此停止，後續 F3 見下節。

## F3 局部驗證紀錄

2026-10-20，HEAD 加當輪未提交修改，精確來源 hash、版本及統計見[版本化結果](../governance/data/appearance-preview-f3-validation-2026-10-20.json)。原始 JSON 與 33 張 PNG 留在本機 tasks/output-f3-browser-20261020；未覆寫作品圖片。
Electron 43.7.8／Chromium 150.0.7871.250，隔離 Gallery 元件頁與正式 Output HTTP／V3 server；只使用共用自製場景。此測試入口與 dev server 不進產品。

| 已驗項           | 結果                                                                                                                        | 限制                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Gallery 投影     | 八模板 scenario id／固定 frame time／canonical frame 均與純工廠一致；元件有可見 bounds                                      | 縮略 CSS／幾何仍可簡化，不做 Gallery 與正式 runtime 的像素等同宣稱           |
| 三種 runtime     | 八模板各明確 demo fallback、Workbench live、正式 Output live，共 24 張；每模板 Workbench–Output 與 demo–Output 像素差均 0   | 固定 paused 5 秒／T1／reduce；只對照同一合法預設與來源，不代表所有動態中間幀 |
| 尺寸與縮放       | Widget CSS／capture 原尺寸、zoom 1；FHD CSS 1920×1080、zoom 0.75／capture 1440×810                                          | 先固定 zoom 再重新載入，避免測試啟動幾何誤差；不是原生 FHD PNG               |
| 設定與空態       | 八模板正式頁切到 large／cool 設定生效；source unavailable 清空且沒有示範                                                    | 完整值域與特有設定由 F1／F3 tests 補驗；未擴大模板能力                       |
| Gallery 限制標示 | 參考圖／合成動態、預設外觀與各模板省略範圍可讀，不裁成單行                                                                  | G01 參考圖片仍未替換；正式結果到工作臺確認                                   |
| 載入與 URL       | 單元／元件測試驗 pending hover／import 遇 reduced motion、切模板／卸載取消；Workbench／OBS drop 去除 demo／inspection flags | 既有載入失敗提示保留，不宣稱已測盡網路故障或全部資產失敗組合                 |

84 份／923 項 tests、F1 八模板／32 情境結構基線、ESLint、格式、Markdown、build 與封裝依賴檢查通過。共用 scene／preview adapter／限制 metadata coverage S100／B94.91／F100／L100。
Kinetic 在可見驗證發現的固定第一句問題已改用當前 canonical phrase；Art Card 啟動縮放差異由測試視窗固定 zoom 後重新載入排除，沒有改藝術 CSS／配方或把非零像素當通過。
真實 OBS、alpha 合成與長時間效能仍未驗。F3 當輪到此停止；後續 F4 見下節，完整縮略限制見[一致性契約](../contracts/output-preview-consistency.md)。

## F4 隔離 capture 重跑

在 repository 根目錄完成 `npm ci` 後，於可開啟桌面視窗的 Windows 環境執行：

```powershell
npm run output:baseline
npm run output:audit -- --list
npm run output:audit
npm run output:audit -- --template art-card,cover-player --scenario empty,missing-artwork
```

預設八模板皆用 F3 `showcase-t1-v1`、paused 5 秒、預設外觀、reduced motion。
`--template` 與 `--scenario` 只接受 registry／F1 cases／F3 showcase 的 id，以逗號分隔；`--list` 不啟動 Electron。
不接受輸出目錄、URL、HTML、曲庫或任意素材路徑。未識別／重複參數或情境直接失敗。
每次產生新的 `tasks/output-appearance-audit-*` 目錄，故不會把上一次成功 PNG 誤認為本輪結果。

工具使用獨立新 profile、sandboxed 可見 BrowserWindow、正式 Output HTTP／唯讀 V3 WebSocket，沒有 preload／控制台 IPC 或真實播放器；V2 snapshot 與 V3 streams 均先通過正式 parser。
所有權限請求拒絕，網路限制於本輪 loopback server；不下載模型、字型或圖片，不讀私人曲庫、OBS 設定／密碼。
F1 的 `synthetic-cover` 是要求環境提示，本版不注入封面 bytes，`assets.injectedArtwork` 如實為 none；缺封面觀察可產生，解碼故障不可冒充已測。

每份 report 分開保存下列證據：

| 欄位                             | 意義                                                                                                                        |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| source                           | HEAD、dirty 與 runtime／fixtures／工具／fonts／縮圖／lockfile 的 SHA-256；執行前後不一致則整輪失敗                          |
| versions                         | App、Electron、Chromium、Node、Windows；OBS 固定未測，沒有以 Electron 版本代填                                              |
| cases                            | 模板、scenario／nowMs、原始播放意圖及 capture snapshot、預期 frame、normalized settings 與 server 實際傳送 slot             |
| observed                         | CSS viewport、devicePixelRatio、root 設定、reduced motion、可見／空態、fonts readiness、images 解碼觀察及 JavaScript errors |
| capture                          | 本輪 PNG 相對路徑、實際尺寸、PNG hash 與 pixel hash；CSS 畫布與 PNG 尺寸分開                                                |
| matrix                           | 沿用 F1 八模板 × 32 情境適用矩陣；未執行的矩陣項保持未測，不能把一張 showcase 當全矩陣通過                                  |
| captureStatus／visualReview／obs | 工具結構檢查／人工作品查核／真實 OBS 分層；各自為 passed、failed、not-tested、not-applicable，取消另記整輪 cancelled        |

`captureStatus: passed` 只表示本輪視窗可見、資料與尺寸／motion／正式模式檢查成功並產生影像。人工可讀性、藝術排版、素材權利及 alpha 合成仍須在本清單逐項驗收。
Widget 為原生尺寸／zoom 1；歌詞為 CSS 1920×1080、zoom 0.75、PNG 1440×810。視窗底色 #202020，不能把截圖當透明 OBS 合成或原生 FHD PNG。
F1 playing／seeking 在固定 position 改成 paused 以產生靜態觀察，原始意圖另存；正式 runtime 的時鐘沒有被替換。不因此聲稱播放動畫、seek 過程或時間序列已通過。

font-denied／missing／delayed、image-error 及帶 steps 的重連／快速換曲／motion-toggle，這版尚無刺激驅動，明列 `not-tested`；不適用模板仍用 F1 判定 `not-applicable`。
source-unavailable／syncing 可觀察初始清空，不能替代「已有內容後斷線」或新 boot／epoch 重連測試。無 duration、語言、T0／T1／T2 也是固定時點觀察。
fonts 的 loaded／error 不表示每個字形已正確顯示；沒有本機字型檔匯入、權限 UI 或故障注入的通過宣稱。

`Ctrl+C`／SIGTERM 要求合作取消，保存已完成案例，剩餘列未測；整輪 deadline 180 秒，給 5 秒清理後才終止本輪精確 PID 的 process tree。不得全域 taskkill Electron。
失敗／取消有非零 exit code；只有未測的選項回報 `not-tested`，exit 0 代表工具完成而非驗收通過。log 上限 1 MiB；profile 在程序退出後刪除，report／PNG／request 保留。無法啟動桌面、逾時、缺資產或來源漂移都須保留失敗，不降級成靜態 mockup。

重跑時使用相同參數與來源，核對 case id、設定、字型、CSS／PNG 幾何及 `pixelSha256`；不同環境的抗鋸齒／字型不應直接當產品回歸。
原始 PNG／log 留 ignored tasks 或另存驗收 artifact；持久紀錄只存版本化摘要、hash 與 evidence 路徑。縮圖替換另依[來源規範](../../src/assets/output-template-thumbnails/README.md)及人工核對，不自動覆寫既有圖或原始 audit。

## F4 當輪驗證紀錄

2026-10-20；版本、117 份來源 hash、實際設定與 40 張 PNG 的 hash／路徑見[版本化證據](../governance/data/appearance-tooling-f4-validation-2026-10-20.json)。使用 Electron 43.7.8／Chromium 150.0.7871.250／Windows 10.0.26300，各次新 profile、正式 Output route，沒有將示範發布到真實 App。

| 驗證            | 結果                                                                                                                               | 邊界                                                                            |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 同場景重跑      | 八模板各兩次，共 16 張；八組 pixel hash 相同                                                                                       | 固定 paused／reduce，只驗同環境可重現性                                         |
| 代表矩陣        | empty／playing-t2／missing-artwork／source-unavailable 與未驅動刺激，共 56 項：23 capture passed、18 not-tested、15 not-applicable | 無 T2 消費能力按 F1 回退，不擴大能力；不是完整 F1／藝術驗收                     |
| 合作取消        | 第一張後送 cancel marker，保留 1 張，其餘 7 項未測；exit 1、profile 清理通過                                                       | process signals／逾時／spawn failure／缺資產另有注入測試；未宣稱人工按過 Ctrl+C |
| 回歸／邊界      | 88 份、955 項 tests 通過；F1 八模板／32 情境無 drift；工具／provenance 的 HTTP 404 及封裝排除通過                                  | 本輪無 shipping runtime／依賴搬移，未重建 installer                             |
| 新工具 coverage | 純 helper／CLI 合計 S90.32／B89.11／F97.67／L90.90                                                                                 | Electron driver 由實跑驗證，未納入該 instrumentation 分母                       |

ESLint、交付檔格式、170 份 Markdown、build 與 diff 空白檢查通過；build 保留既有大 chunk 提示。執行後 117 份來源 hash 均一致，F4 Electron 程序已退出；原模板藝術／動態 recipe、八張縮圖 bytes 與付款流程未改。
人工作品與真實 OBS／alpha／完整正常動畫／效能維持未測；這是 F4 當輪範圍；後續 F5 結果見下節。

## F5 本機整合與基準

2026-10-20 開始、2026-10-21 收尾。結果與逐圖 hashes 見[版本化紀錄](../governance/data/appearance-integration-f5-validation-2026-10-20.json)。八模板可見 Electron 整合通過，55 PNG；以正式 Output server、F3 自撰合成情境、隔離記憶體 partitions 與 sandbox 視窗執行。無真實播放器／音訊／私人曲庫／OBS 操作，沒有新增 runtime route 或服務。

```powershell
node scripts/output-performance-probe.mjs --mode integration
node scripts/output-performance-probe.mjs --mode baseline --template art-card
node scripts/output-performance-probe.mjs --mode baseline --template queue-board,karaoke-stack,art-card
node scripts/output-performance-probe.mjs --mode soak
```

soak 預設 5 分鐘；需要耐久樣本時另行安排並明確傳入 --minutes 60。integration 最多 10 分鐘 deadline；baseline 全模板依序約 8 分鐘，指定單模板約一分鐘。取消時向工具印出的 tasks/output-appearance-audit-f5-* 目錄寫入 cancel 檔；只清除自己的 profile，保留 report、runtime-inputs、tool-source、PNG、JSONL 與 bounded logs。

本輪八模板依序基準／default 三窗並用完成 36 段，四狀態為 playing、paused、empty、rapid。單窗各 10 秒、並用各 30 秒，每 5 秒取樣；單窗後段僅一筆，不能作 percentile 或效能預算。當輪另完成五模板 fresh-process 基準；Live Stage fresh 重試 observation timeout（root hidden／dataset 空），原 failed 與 failureObservation 保留。該缺口已由下節釐清並補驗；其餘 fresh 項目未測。沒有改模板掩蓋工具或產品問題。

原 60 分鐘樣本在使用者修正耗時後取消：最後觀測 19.62 分鐘／236 筆，所有樣本 clients=3，queued／dropped／replaced／disconnected=0。原 report 維持 cancelled，partial-summary 由 JSONL 另行推導，完整 60 分鐘列未測。排除暖機不代表已達穩態，不據此宣稱沒有記憶體漏洩。

CPU 是 Electron 各 process percentCPUUsage 相加；working set／private bytes 為 KiB，GPU-process working set 是該程序 RAM，VRAM／GPU utilization／FPS 未量測。lyrics CSS 1920×1080、zoom 0.75，capture 1440×810；widget zoom 1。背景 occlusion throttling 明確停用，效能只代表此 harness。firstObservedMs 包含首次載入與 reload，不當作 cold first frame；冷暖啟動以既有 startup trace 為準。

每次凍結實際 Output 靜態依賴、字型與合成 fixtures，記錄 SHA256；其他並行 Performer 修改不納入 Output closure。各 run 有獨立工具快照，不能假定所有 run 工具 bytes 相同。整合含 Electron alpha、三種背景、seek／換曲／斷線重連、motion toggle、GSAP／font／image 失敗；這些自動斷言及截圖仍需人工評讀，不能視為整個 F1 32 情境全矩陣通過。

需要使用者配合的真實 OBS 項目：

- [ ] 記錄 OBS／CEF／Windows／GPU／driver 與場景尺寸；三 default 並用及其餘模板依正式尺寸建立 Browser Source。
- [ ] 在透明、淺色、深色、複雜背景核對文字邊緣／alpha／陰影與字型 fallback；檢查正常 motion 中間幀及 reduced motion。
- [ ] 用真正 App 播放／暫停、前後 seek、換曲、來源中斷恢復；測 hide/show、refresh cache、場景切換與 App 完整重啟後重連。
- [ ] 記錄 OBS 自身 CPU／RAM、rendering lag／dropped frames 與錄影結果；另安排真實演出長度的觀測，不能用 Electron 19.62 分鐘代替。
- [ ] 安裝版 smoke、大曲庫／慢磁碟與私人字型／圖片選取流程另驗；本輪只有 frozen unpacked executable，沒有 installer 安裝驗證。

先完成上述紀錄再決定個別 set 修飾；不在本階段修改模板藝術、正常動態、付款或贊助 gate。

## F5 Live Stage 逾時釐清（2026-10-21）

兩份失敗來源在 shared/presentation/state.mjs 新增 lyricsPhraseBreaks.mjs 匯入時，HTTP allowlist 尚未配套，請求回404，歌詞入口未boot，故 dataset 空、root hidden。成功舊來源尚未使用該import。這是並行編輯中取到不完整共享模組圖，不是 Live Stage 專屬效能或動畫問題；不同source不能直接作模板快取對照。

當前正式 route 已存在，本輪只修驗收工具：實際 require frozen server，開窗前檢查所選 kind 的 HTTP static ESM graph，失敗時記錄 route／HTTP／content-type；保留15秒觀察期限，不增加盲重試。重播成功舊圖25 modules通過、兩份失敗舊圖各26 modules且同一路徑404、完整來源26 modules通過。新driver重播舊失敗來源在747ms以明確preflight failure結束，未開模板視窗；原failed紀錄保持不變。

新來源獨立程序完成 playing／paused／empty／rapid 各約10秒；queued／dropped／replaced／disconnected全為0、errors空、normal motion保持。截圖已檢視；7檔174項測試、helper coverage S96.85／B91.54／F100／L97.24、focused lint／format、build及包裝排除回歸通過。只補此載入與短基準缺口，不擴大為OBS／作品／耐久驗收。

[版本化證據](../governance/data/appearance-live-stage-f5-followup-2026-10-21.json)保存來源／report hashes、模組圖、四段資源與截圖路徑；原始檔在 tasks/output-f5-live-stage-*、tasks/output-appearance-audit-f5-bxPUwH 與 tasks/output-appearance-audit-f5-jg9Ciw。沒有改正式模板外觀／動畫或付款。

## 分類提交前核對（2026-10-21）

只含本對話交付內容的獨立 index 快照通過91檔996項相關測試、八模板／32情境基線、focused lint／格式、文件連結、167份Markdown與build；不依賴其他未提交的混語、提詞器、BGM或研究功能。接上已完成的並行提交後，再驗93檔1019項測試、171份Markdown、lint／格式／連結與build皆通過。設定核對與範圍見[提交前驗證紀錄](../governance/data/appearance-commit-validation-2026-10-21.json)。這輪沒有重跑完整可見／OBS／耐久測量，歷史圖像及封裝資料仍依各自來源hash解讀。
