# 酷狗受控備援接入驗證（2026-10-31）

本輪由owner授權把原生LRC接入正式手動整合查詢，未commit。行為與安全邊界見[來源契約](../contracts/lyrics-sources.md#kugou受控備援)及[外部請求契約](../contracts/external-service-request-policy.md)。背景自動探索／保存仍只包含LRCLIB及NetEase。

## 驗證範圍

主要來源完成且無可用非related候選才啟動備援；來源故障允許備援，取消、過期意圖或主要來源已有可用歌詞時不發酷狗請求。固定三端點共用實際HTTP預算、持續限流、冷卻、request合併及探索快取；保存另fresh重取三階段並驗fingerprint。約三候選是目標，不能突破五次首次／八次擴搜的來源預算。完整credit／版本／時長與LRC標記拒收錯配，沒有默默移除合作歌手的保存路徑。

回歸包含：多候選與完全相同內容去重、跨語別名、複合credit、未知／缺少guest與錯feat、Live及多語版本、duration、非法URL／id／query／body／UTF-8、共享1000ms起點、Retry-After冷卻不扣attempt、三端點實際預算、取消／deadline、先成功後失敗保留、擴搜追加、fresh內容變更重新預覽、舊hydration不能覆寫新預覽、保存世代隔離、原子交易還原、manifest provenance、離線重讀／來源標示／刪除及打包閉包。正式解析尚未處理LRC內建offset，非零offset保守拒絕。

## 線上核對

2026-10-31 05:36:59～05:37:10（Asia/Taipei）以正式`createKugouClient`／provider／service執行兩首只讀核對。主要來源的「正常零結果」是注入條件，沒有重測LRCLIB／NetEase／Better當時狀態，因此不是整體首次成功率或真實主要來源失敗的baseline。

- Closer to You (feat. Major Lazer)／정국 (Jung Kook), Major Lazer／171秒：取得Jung Kook、Major Lazer的170秒T1候選，58時間行；共五次實際HTTP，來源達預算後保留partial。
- Hana No Uta (花の唄)／Aimer／371秒：取得花の唄／Aimer的373秒T1候選，63與64時間行；共五次實際HTTP，來源達預算後保留partial。輸入已提供原文別名，不表示能從未知羅馬字自動翻譯。

共十次HTTP均200，跨route起點約一秒以上；無登入、不保存歌詞或原始body。收據只保留端點origin、時間、status與有界metadata／行數。此批執行後追加完全相同內容去重回歸與實作，沒有重送線上批次；收據中的候選數不能當作去重後數量。HTTP成功與metadata通過不代表完整內容、播放同步或服務長期穩定，未逐首播放驗收。

## 本機驗證

相關單元、Main／IPC、Renderer行為、既有三來源、研究負例與打包closure測試通過。定向Istanbul覆蓋正式`electron/lib/kugou/*.js`，沿用原門檻，詳細結果記錄於本次ignored tasks收據；沒有降低validator或coverage門檻。Main bundle closure確認六個正式模組可發布，研究探針、語料及相鄰測試不出包。ESLint、Markdown、定向格式與build檢查完成；build保留既有chunk-size warning。

本輪沒有操作Owner的既有Electron／OBS，也未做原生視窗或installer人工驗收。Main變更必須完整重啟開發程式才會載入；Vite HMR不重載Main。CLI與元件測試不冒充桌面播放驗收。

## 原畫面未命中的補充核對

Owner於本輪收尾提供Hana No Uta／Aimer仍零結果的畫面。現有本機診斷在05:41:40及05:41:42分別記錄Better Lyrics的`invalid-ttml`及LRCLIB真實網路503；當時正常miss沒有摘要，無法倒推該次Kugou已執行或Main載入狀態。不得以別名挑戰命中宣稱原畫面已救回。

05:45:53以同一純羅馬字title／artist及371秒公開參考值，使用正式Kugou client／provider再次只讀核對：一個catalog HTTP 200、零候選、invalidRecordCount 0，沒有歌詞查找或下載。這與前輪無原文別名control一致；不是限流，也不代表加入備援就能自動翻譯。帶花の唄的條件另外計算，不能替代原字串的失敗。

補強後正式runtime logger接收既有固定搜尋metric，將正常miss也記為debug摘要：只含固定provider操作、status、候選數、duration及cache／discovery分類，不寫曲名、query、body或credential。Renderer只有在providerStatuses證明Kugou已正常完成且沒有可用候選時，才顯示備援未命中與原文／已知別名建議；沒有執行證據時不顯示。這些新摘要不能回填已發生的查詢。原字串的跨語別名解析仍未解決，不能列為本輪成功救回。
