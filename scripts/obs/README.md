# 魚眼攝影機濾鏡

這個 OBS 腳本會對整個合成畫面穿插鏡頭推拉、水平錯位與 RGB 色差，或彩色顆粒和掃描線。自動模式在效果之間間隔約 2.4–5.5 秒，每次持續約 0.33–0.72 秒。濾鏡以 OBS 畫面計時。

1. 將 `fisheye-camera.lua` 和 `fisheye-camera.effect` 放在同一資料夾。開發版位於 `scripts/obs/`，安裝版位於 `resources/obs/`。
2. 在 OBS 開啟 **工具 → 指令碼**，按 **＋** 加入 `fisheye-camera.lua`。
3. 將攝影機、背景和已套用魚眼鏡筒的字幕來源放進同一個 OBS 場景。
4. 對該場景按右鍵，開啟 **濾鏡 → 效果濾鏡 → ＋ → Utawakui Fisheye Camera**。

`Effect` 預設為 `Live`，開啟 `Automatic bursts` 時會自動穿插。可切換 `Zoom`、`Glitch` 或 `Grain` 單獨檢查。`Intensity (%)` 預設 75，調為 0 或停用濾鏡即可回到原場景。套在場景上時，貓眼外的暗部也會呈現監視器雜訊。

在 Utawakui 啟用 OBS 整合後，開啟「畫面輸出 → 字幕 → 工作臺 → 攝影機特效」，按「綁定目前場景」。場景須有一個已啟用的魚眼濾鏡，使用 `Live` 與大於 0 的強度。頁籤能切換自動穿插，也能在關閉自動穿插時單獨觸發。手動效果會取代當下的自動效果，播完後重新計算下一次自動穿插。Glitch 約 0.33 秒，推拉約 0.64 秒，雜訊約 0.72 秒。先前已加過指令碼時，請在 OBS 的指令碼視窗重新載入。

使用 OBS 內建的 Lua 指令碼功能。參見 [OBS Scripting Guide](https://obsproject.com/kb/scripting-guide)。
