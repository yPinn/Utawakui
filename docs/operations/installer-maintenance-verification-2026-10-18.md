# 安裝精靈與重新安裝驗證

日期：2026-10-18。對象為 Windows x64／NSIS／Utawakui 0.4.0。沿用已驗證的完整 application payload 重建精靈，不另做修復包、不查詢線上版本或自動下載；這份紀錄不代表較早正式版本的 migration 或全機安裝均已實測。

## 行為與文字

安裝器依所選安裝範圍的本機 uninstall registry 版本比較：未登錄版本走一般安裝；同版本顯示「重新安裝」；已安裝較舊版本顯示「更新」；安裝包較舊則在移除檔案前停止。靜默安裝也檢查版本，並先對齊標準 NSIS 的最終安裝範圍；全機替換同時比較當前使用者版本。仍使用同一份完整安裝包，Windows Apps 的原生 Repair 動作沒有啟用。

歡迎、路徑與捷徑文字已精簡，繁中採 Microsoft JhengHei UI、英文採 Segoe UI，保留原生對話框尺寸與控制項。解除安裝的資料選項實際先於歡迎頁，因此移除「下一頁」的錯誤指示；選項頁先說明刪除全部應用程式資料也包含其中的工具、模型與曲庫。三個清理選項皆預設未選取。

重新安裝替換安裝資料夾內的檔案；保留承諾限定於該資料夾以外的設定、曲庫、工具與模型。不宣稱重設設定或修復另行下載的元件。完整授權及署名維持原文與原有交付位置。

## 隔離方法

使用獨立測試 App ID、產品名稱、package name、捷徑及 updater cache；程式與假資料均在 `.tmp/installer-review/`。正式使用者的應用、安裝登錄與曲庫不作測試目標。隔離版本停用執行中的應用檢查、不啟動應用，避免 NSIS fallback 依 electron.exe 名稱處理其他程序。

測試 include 只替換資料／cache 路徑與測試身分，另記錄選項 flags 及版本判斷。跨 HKCU／HKLM 的混合範圍案例，以 INI adapter 提供 HKLM metadata 與模擬的 machine-registration flag；不是實際全機安裝驗收。其他每使用者安裝、登錄、重裝、缺檔還原與預設解除安裝均實際執行 NSIS。

## 已驗證結果

| 案例                   | 證據與結果                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 同版本重裝             | 同一份 0.4.0 installer 可重裝，程式與完整附文 hash 相同                                                                                                |
| 主程式與 ASAR 缺損     | 僅刪隔離副本的 electron.exe／resources/app.asar，重裝補回原 hash                                                                                       |
| 資料保留               | 設定、工具、模型、userData 內曲庫、外部曲庫五個 sentinel 的 SHA-256 均保持相同；這兩種曲庫皆在安裝資料夾外                                             |
| 本機已登錄 0.3.0       | 判為 update，成功；只是 metadata 分支測試，不是舊版 payload migration                                                                                  |
| 本機已登錄 0.5.0       | 0.4.0 installer 以 exit 2 停止，資料保留                                                                                                               |
| 混合範圍               | 模擬 machine 0.5／user 0.3 時阻擋；明確 current-user 模式則比較 user 版本並成功                                                                        |
| 預設解除安裝及再次安裝 | 實際移除程式、保留五個 sentinel，再走 install 分支成功                                                                                                 |
| 解除安裝選項 flags     | deps=0、appData=0、library=256；三者 SF_SELECTED 位元皆為 0                                                                                            |
| 原生繁中重新安裝頁     | 畫面同時顯示已安裝 0.4.0 與安裝包 0.4.0，完整保留說明及「重新安裝」按鈕；原生正黑體文字未截斷                                                          |
| 完成頁                 | 實際互動重裝到達完成頁，繁中標題／說明／完成按鈕完整顯示；保存畫面並按完成退出。此隔離 fixture 關閉 runAfterFinish，沒有驗證正式版完成頁的啟動應用選項 |
| 互動重裝後核對         | 主程式、ASAR、完整附文及五個資料 sentinel 的 hash 仍與原值相同                                                                                         |
| 最終解除安裝及清理     | 再次確認預設解除安裝保留五個 sentinel；測試登錄、捷徑、專用 updater cache、隔離安裝包與 `.tmp/installer-review/` 均已移除，正式產物與 evidence 保留    |

## 產物與附文

正式產物：`release/installer-review/Utawakui-Setup-0.4.0.exe`，168,723,128 bytes；SHA-256 `f4ee334de01b2edb25590de7cf702ba2895637b1d6ae9bc0e47c2b534892b18c`。unsigned Windows verifier 已通過 installer／blockmap／latest.yml、版本及完整 notices 檢查。

實際從 NSIS 解讀兩個交付檔並與 win-unpacked 逐 byte 比對：NOTICES.txt 為 596,262 bytes，SHA-256 `2f13b901b80334afd1f9233d8a9c910af793a10dfdc3813804f219a3f760e299`；manifest.json 為 58,292 bytes，SHA-256 `5e5bc30fbe54c6ae8bbead47c82d9a5cdd47d6640f87056338e6edbb479463e5`。授權集合仍涵蓋 93 個 package entries 與 2 個額外元件，未變更 renderer payload。

本機產物的 `evidence/` 保存 JSON、可重現測試 scripts、fixture 原始碼 hashes 與畫面。相關四個測試檔共 17 項通過；獨立程式碼 review APPROVE。原有服務／模型及 Signalsmith native provenance 的限制仍以[授權補正紀錄](../archive/packaged-notices-repair-2026-10-18.md)為準。
