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

## 下一步的驗證清單

- [ ] 固定 viewport 重新慢速走過入口到 footer，逐節錄下穩定狀態與進出場。
- [ ] 補齊 POWER UP 的起點、終點、章名行為及素材出現時機。
- [ ] 補齊 before／after 的狀態順序、播放條件、遮罩幅度與回捲反應。
- [ ] 測試 Wonder 圖帶是否持續移動、可否拖曳／點擊，避免把拼貼誤當輪播。
- [ ] 逐一測試局部機關與 hover，不靠 class 名稱推斷動作。
- [ ] 在手機 viewport 重新記錄骨架，確認橫向段落是保留、縮放、重排或替換。
- [ ] 以不帶品牌素材的線框結構確認布局與動態，再討論 Utawakui 內容映射。

## Review

已完成原站桌面骨架、布局責任、主要捲動機制及媒體／動畫的第一輪拆解。這不是逐像素複刻、完整手機規格或原站程式碼還原；未確認的行為保持待驗證，不以先前自訂分鏡補空缺。
