# Nintendo Wonder 參考網站：布局與動態結構拆解

分析日期：2026-10-17。

參考：[超級瑪利歐兄弟 驚奇官方網站](https://www.nintendo.com/tw/switch/aqmxa/)。

本文件只結構化原站，不設計 Utawakui 外觀、文案或章節替換內容。先前的 Utawakui 自訂分鏡不作為本輪依據。

## 證據與範圍

- 以真實網頁捲動、畫面、DOM 層次及 computed styles 為依據。
- 本輪觀察桌面 viewport 1280 × 720；扣除 scrollbar 的主要內容寬度約 1265px。
- 「已確認」代表畫面或 DOM／computed style 直接支持；「待驗證」不作為已還原的行為。
- 未檢查網站 JavaScript 的完整時間線，不推定使用特定動畫套件。
- 未完成手機、聲音開啟路徑、所有物件點擊及 hover、回捲重播規則的驗證。
- 原站部分區塊高度會隨進入狀態或素材就緒改變；下面的尺寸只描述觀察範圍，不是可直接複製的固定座標。

## 頁面骨架

```text
入口覆蓋層：音效 ON／OFF
└─ 首頁主流程
   ├─ 01 mv：主視覺、Logo、發售資訊
   ├─ 02 intro：全寬影片、介紹標語
   ├─ 03 powerup：長捲動區、sticky 舞台、橫向素材群
   ├─ 04 before：一般狀態全屏影片、上下遮罩
   ├─ 05 after：驚奇狀態影片、cut-in、覆疊文案
   ├─ 06 wonder：大標題、角色、異形畫面拼貼
   ├─ 07 feature：多人主單元、雙欄細節、上下分組內容
   ├─ 08 product：盒裝、發售資訊、商品連結與使用條件
   └─ footer：Logo、外部導覽、copyright

跨區元素：音效控制、說話花／機關等局部互動物件
```

首頁 DOM 有八個主要 section；入口與 footer 不在這八個 section 之內。Before／After 是兩個獨立 section，應作一組連續的演出段落理解。

## 布局清單

| 區塊     | 原站 selector       | 布局與層級                                                                            | 觀察尺寸／比例                                              |
| -------- | ------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 入口     | 音效選擇覆蓋層      | 滿視窗背景 → 中央角色群 → 提示 → 垂直兩個選項                                         | 中央單軸構圖，內容不靠左右兩欄                              |
| 主視覺   | `.smbw-top-mv`      | 大幅完整主視覺底圖；Logo 與發售資訊以 absolute 疊上                                   | 約 933px 高；超過單一 viewport，不是剛好 100vh              |
| 介紹     | `.smbw-top-intro`   | 全寬影片背景；介紹標語覆疊其上；下一節波形邊界跨入                                    | 約 776px 高；video 約 1280 × 776                            |
| 能力展示 | `.smbw-top-powerup` | 紅色紋樣底；巨大章名；sticky 顯示窗；寬幅素材畫布；角色／圓形影片／道具／文字各自定位 | 外層約 5082px；sticky 約 1265 × 720；內部畫布約 3096 × 1440 |
| 變化前   | `.smbw-top-before`  | 全屏遊戲影片；文案；sticky mask 容器內的上下遮罩                                      | 外層約 1296px；影片約 1265 × 720                            |
| 變化後   | `.smbw-top-after`   | 文案絕對定位；wrap 內有 cut-in 與 sticky inner；inner 疊背景及物件                    | 外層曾觀察 864px／1296px，不作固定值                        |
| 驚奇展示 | `.smbw-top-wonder`  | 藍色紋樣底；跨幅大字；穿插角色；不同長寬比的畫面拼貼；延伸到視窗邊緣                  | 約 1356px；主要圖帶約 459px 高                              |
| 功能細節 | `.smbw-top-feature` | 場景底圖；頂部角色群；中央約八成寬內容；先大單元，再雙欄，再全寬分組                  | 主容器約 1012px；雙欄各約 489px                             |
| 商品     | `.smbw-top-product` | 商品圖與文字資訊一組；商品入口與服務條件另一組；底部角色列接 footer                   | 約 550px；由展示轉為可掃讀資訊                              |
| 頁尾     | footer 區           | 深色紋樣背景；大 Logo；底部分隔與外部連結                                             | 與商品區有清楚材質／色塊分界                                |

主視覺不是以文字欄與圖片欄構成的一般 hero。能力展示也不是等寬卡片列；它是定位在大畫布上的素材群。

## 共用層級

原站多數章節可拆成以下角色；不是每節都同時具備全部層。

```text
section：提供文流高度、章節重疊與 stacking
├─ background：紋樣／大場景／影片底
├─ section body：relative 定位基準
│  ├─ oversized title：巨大章名
│  ├─ content group：媒體、角色、道具、標語
│  └─ local interactive object：說話花、機關、連結
└─ boundary：波形邊緣、負 margin、跨界素材
```

布局的重要特徵：

- 大型圖像標語與角色素材可超過一般文字內容欄。
- `relative` 區域內大量使用 `absolute`，形成重疊與前後關係。
- 一般資訊區才收進較窄的中央容器。
- 章節並非每段都從前段底邊整齊開始；觀察到多個負 `margin-top`。
- 背景並非全部隨文流一起移動；多個 `.smbw-section-bg-image` 的 computed position 為 `fixed`，外層章節另有顯示邊界。

## 動態分類

| 類型       | 原站中的角色                                 | 觸發／驅動                   | 已確認與限制                                                                                      |
| ---------- | -------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------- |
| 入口狀態   | 音效 ON／OFF 入口                            | 點擊                         | 點 OFF 後離開入口、進入主頁；未測試 ON 的實際聲音                                                 |
| 初次進場   | 主視覺 Logo、發售資訊                        | 進頁及 class 狀態            | 有 `secanm` 容器；兩者 computed transition 含 0.5s；完整先後順序待逐格量測                        |
| 長距離捲動 | POWER UP 素材畫布                            | 垂直 scroll → 水平 translate | sticky top 0；多個 scroll 位置實測 translateX 改變                                                |
| 局部出現   | 角色、標語、細節單元                         | 進入對應區域／狀態           | 觀察到 `secanm`、transform 與 opacity 變化；每個 threshold 及回捲行為待確認                       |
| 媒體播放   | intro、圓形能力片段、before／after、徽章展示 | 影片自己的時間軸＋播放管理   | DOM 有 muted／loop video；不同片段 paused 狀態不同。不能將影片內的動作當成 DOM 動畫               |
| 跨章演出   | before → after                               | 進入章節與演出狀態           | sticky、mask、cut-in、覆疊文案、after 的 `fadeout` class 已確認；精確計時與是否暫鎖 scroll 待確認 |
| 細節區進場 | feature 雙欄                                 | 進入對應區域／狀態           | 初始觀察左右欄 translateX 約 −97.8／+97.8px，transition 含 0.4s                                   |
| 按鈕效果   | `.smbw-rb-btn` 子層                          | 互動／狀態                   | 有 out／over 疊層，computed animation `rrbhover` 0.3s；未確認每個 hover 狀態的完整外觀            |
| 局部機關   | 說話花、磚塊、音符物件                       | 局部互動                     | 物件容器與說話內容存在；點擊結果、聲音及每個機關規則待逐一測試                                    |

目前不能把 Wonder 的拼貼圖帶直接定義為自動 carousel：已看見拼貼與容器結構，但未量測其長時間位移及操作規則。

## 核心機制 A：垂直捲動映射橫向大畫布

```text
powerup section：長文流高度，提供捲動距離
└─ inner：relative
   └─ wrap：sticky; top: 0；一個 viewport 高
      └─ scroll：absolute；顯示內部畫布
         └─ scroll-inner：寬幅素材群；transform translateX 隨 scroll 改變
            ├─ 大型角色
            ├─ 圓形遊戲影片
            ├─ 道具圖與名字
            ├─ 標語／能力名稱
            └─ 磚塊／音符／說話花等裝飾與機關
```

桌面實測：

| scrollY | scroll-inner translateX |
| ------- | ----------------------- |
| 2880px  | 約 −552px               |
| 3600px  | 約 −946px               |
| 5040px  | 約 −1634px              |
| 5760px  | 約 −2026px              |

同時 `wrap` 的 position 為 sticky、top 為 0。這證明垂直捲動在此段驅動水平內容；表中數值是採樣點，不代表已取得精確公式、起終點或 easing。

巨大 POWER UP 標題與畫布有不同容器，重建結構時必須分開處理。章名不能與所有素材直接綁成同一個水平位移群。

## 核心機制 B：Before／After 狀態切換

```text
before
├─ sticky mask
│  ├─ head mask
│  └─ foot mask
├─ 一般狀態文案
└─ 一般狀態遊戲影片

after
├─ 覆疊標語
├─ wrap
│  ├─ cut-in
│  └─ sticky inner
│     ├─ 背景
│     └─ 物件
└─ 驚奇狀態遊戲影片
```

視覺上從正常遊戲畫面進入驚奇畫面，覆疊大字與效果，再接 Wonder 藍色章節。這段需要同時定義章節狀態、媒體播放與疊層退出；不能只用兩張靜態圖淡入淡出概括。

本輪在 before 的某個採樣位置，上下 mask 的幾何高度為 0；因此只確認 mask 結構存在，不能據此宣稱當時已觀察到特定開合幅度。

## 跨章接縫

| 接縫              | 已確認布局                                          | 結構意義                                       |
| ----------------- | --------------------------------------------------- | ---------------------------------------------- |
| intro → powerup   | powerup margin-top 約 −136px、z-index 10            | 下一節帶波形的背景壓入前一節，畫面不是硬切矩形 |
| powerup → before  | before margin-top 約 −77.6px、z-index 11            | 全屏影片段落進入前景，結束長距離能力展示       |
| before → after    | 兩節連續；after 有 sticky inner 與 cut-in           | 用同一種媒體尺度完成狀態對照                   |
| after → wonder    | wonder margin-top 約 −24px；after 出現 fadeout 狀態 | 過場層退出後露出主題章節                       |
| wonder → feature  | feature margin-top 約 −136px                        | 角色群／背景跨章，進入功能細節單元             |
| feature → product | product margin-top 約 −20px                         | 小幅銜接，降低故事展示密度，轉商品資訊         |

負 margin、z-index 與素材邊緣一起構成轉場。它們與「元素滑入」是不同責任，應分開建模。

## 可重建的中性模板單元

以下只命名結構，不代入新品牌內容。

1. **Entry gate**：全屏入口、中心素材、選項、離場狀態。
2. **Layered main visual**：主圖、Logo、次資訊、角落品牌標記。
3. **Full-bleed intro media**：全寬媒體、覆疊標語、底部異形邊界。
4. **Scroll-driven horizontal stage**：scroll spacer、sticky viewport、獨立章名、橫向素材群。
5. **Media transformation pair**：before／after 媒體、mask、cut-in、覆疊文案、退出狀態。
6. **Oversized title montage**：跨幅標題、不同長寬比的畫面、角色疊層。
7. **Feature composition**：中央容器、全寬主單元、雙欄單元、下方全寬分組。
8. **Product close**：商品圖、發售資訊、主要入口、使用條件、頁尾。
9. **Local gimmick**：裝飾、觸發區、反應素材、可選聲音；不應與章節布局綁死。

## 第二輪實測（2026-11-25）

以 Electron 43 的隔離視窗載入原站，桌面 1280 × 720、手機 390 × 844，逐步捲動取樣狀態並截圖；另讀取原站公開的 `top.js` 確認驅動方式。只記錄機制，不複製程式或素材。

### 技術組成

- jQuery 2.2.3 加自寫捲動腳本；沒有 GSAP、ScrollTrigger 或平滑捲動函式庫。
- 進場是「加 class → CSS transition」。主要兩條曲線：0.8s `cubic-bezier(0.34, 1.56, 0.64, 1)`（過衝回彈）與 0.6s `cubic-bezier(0.33, 1, 0.68, 1)`（平滑減速）。
- 一般元素捲入時加 `secanm`，只觸發一次；回捲不移除、不重播。
- 腳本沒有 `matchMedia` 或 `prefers-reduced-motion` 處理（靜態檢查；執行期模擬未完成）。
- 手機判定為 `innerWidth <= 759.98`；影片依 PC／SP 載入不同來源。

### 能力展示：垂直捲動映射橫向

- 目標位移 =（捲動位置限制在 inner 區段內 − 區段起點）× 0.5，上限為畫布寬減視窗寬。
- 畫面不直接套用目標值：`requestAnimationFrame` 每格以 `min(1, 經過秒數 × 10)` 的比例逼近，產生約 0.1 秒的慣性。
- 畫布內物件在橫向進入視窗時才加 `secanm`；圓形影片只在可見時播放。
- 桌面：區段 5082px，位移約 2132px；手機：保留同一機制，區段拉長為 7113px（約 8.4 個螢幕高），畫布 3629px、位移約 3332px。

### Before／After 與轉場閘門

- 捲入 after 半個視窗高時播放 after 影片。
- 捲到 `.smbw-top-wrap` 頂端時，after 背景加 `fadeout`；transition 結束後標記 `comp`，`.smbw-top-wrap` 由 disable 改為 enable，後半頁才放出。
- 實測：停在 9169px 時頁面高度只有 9889px，不到一秒後變成 13897px。轉場期間無法繼續往下捲。
- 轉場單向：完成後回捲不重播。
- 手機走另一分支：after 背景影片播放後以 class 切換，背景改為一般定位。

### Wonder 拼貼

- 圖片沿斜線排列，每列以 16.7 秒的 CSS 線性 transition 往斜上方移動，結束後重置，無限循環。
- 靜置實測約每秒 120px（每 0.5 秒 x −60px、y +6.8px），與頁面捲動無關，屬自動跑馬燈。

### 章節幾何

| 章節    | 桌面高（px） | 桌面 margin-top | 手機高（px） | 手機 margin-top |
| ------- | -----------: | --------------: | -----------: | --------------: |
| mv      |          933 |               0 |          509 |               0 |
| intro   |          776 |               0 |          536 |               0 |
| powerup |         5082 |            −136 |         7113 |           −55.6 |
| before  |         1296 |           −77.6 |         1182 |              −1 |
| after   |          864 |               0 |          760 |               0 |
| wonder  |         1356 |             −24 |          897 |            36.4 |
| feature |         2852 |            −136 |         3079 |           −62.4 |
| product |          550 |             −20 |          897 |             −10 |

### 其他

- 入口 ON／OFF 只決定是否啟用音效：局部機關點擊音，以及依捲動區段淡入淡出的背景音樂。選擇前 `body` 為 `overflow: hidden`。
- Feature 區徽章影片以計時器輪流播放，一次一支。

## 驗證清單

- [x] 入口到 footer 逐節取樣（桌面、手機）。
- [x] POWER UP 的起訖、倍率、慣性與物件觸發。
- [x] Before／After 的觸發點、單向性與轉場閘門；遮罩幅度未量到（取樣時高度皆為 0）。
- [x] Wonder 圖帶為自動斜向跑馬燈。
- [ ] 局部機關與 hover 的逐一行為（低優先，不影響骨架）。
- [x] 手機骨架：保留橫向段落，改用 SP 影片與 after 分支。
- [ ] 減少動態的執行期確認（靜態已確認無處理）。

## Review

已完成原站桌面骨架、布局責任、主要捲動機制及媒體／動畫的第一輪拆解；2026-11-25 第二輪補上手機骨架、橫向倍率與慣性、轉場閘門及拼貼跑馬燈。這不是逐像素複刻、完整手機規格或原站程式碼還原；未確認的行為保持待驗證，不以先前自訂分鏡補空缺。
