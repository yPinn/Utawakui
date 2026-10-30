# 新分離結果的受控輸出格式

沿 [R01](../research/audio/derived-audio-reduction-r01-2026-10-30.md)，只處理新分離結果，不轉換或遷移既有音訊。根因研究停在既有結論；格式功能不宣稱修復 capture 零段或 DSP 音高偏差。

## 開放與 intent

正式 composition root 不開放 FLAC，既有 WAV 預設、音訊處理 feature gate 與 quick／general recipe 門檻不變。Main handler 工廠只有明確注入 allowFlacOutput 時接受 flac5；正式拒絕應在排隊前發生，執行時再檢查。Renderer 不新增正式設定或保存入口，不提供 codec 參數、路徑或可執行檔。

本切片不擴充正式 preload 的格式選擇介面；隔離測試直接使用 Main 工廠的有界 intent。

輸出 intent 只有 wav／flac5，省略為 wav。排隊、去重及重試保留格式；相同曲目／recipe 的不同格式不互相吞掉意圖。非 regenerate 請求若已有對應 profile 結果仍略過，不因選 FLAC 就重編碼既有結果。

## 產生、驗證與發布

受控 FLAC job 沿既有重工作排程器及 ONNX worker，在本次獨立 staging 產生原四聲道 44.1 kHz／16-bit WAV：伴奏 L/R，再導唱 L/R。staging manifest 不發布至曲庫。

沿已準備好的 FFmpeg，以固定 FLAC compression level 5 編碼；先檢查 STREAMINFO 的 sample rate、四聲道、16-bit 與總 frames，再完整解碼為原 sample rate／聲道的 s16 PCM，比對 WAV data 的 SHA 與長度。不能只以程序 exit 0、容器簽名或可載入當成功。

編碼或 FLAC 驗證失敗時，使用這次新推論的 WAV 回退，回傳有界 fallbackReason；不是改寫舊 WAV。取消、scope／gate 失效、原 WAV／provenance 無效及 manifest 保存失敗都必須失敗，不得用 WAV 回退掩蓋。

成功候選以 Main 產生的唯一檔名移入 separations；同步重查來源與 gate 後才原子寫 manifest。只有 manifest 成功才回報完成。失敗時嘗試清理本次未發布結果與 staging，舊 manifest、選擇及音檔維持原 bytes；舊結果不自動刪除或改名。清理受阻則保留遺留物並記錄私有 deferred 診斷，不覆蓋原成功或原失敗。取消須等待當前 worker／FFmpeg 結束，再嘗試清理並釋放重工作占用。

encoder／verifier 一產生就由 job 接管 active 與 result，再保存 PID journal。PID journal 保存失敗時取消並等待實際 closed，才回報原保存錯誤；error 事件或 result 已 settled 不能單獨視為程序已退出。取消重複呼叫及已 settled 分支仍須等待 closed。

## 硬中斷後的遺留清理

每次受控工作先在該曲 separations 檢查前次交易，再建立帶 UUID 的 staging 與原子 transaction.json。紀錄包含版本、recipe、原程序 PID、已記錄的編碼／驗證子程序 PID 與階段；候選檔名由交易 UUID 推導，不從 journal 接受路徑。正式 WAV 工作及 App 啟動不新增全曲庫掃描。

只有原程序與所有記錄子程序均可確認不存在，才處理該交易。程序仍存活、PID 已重用、權限使存活狀態不明，或停在 spawn 與 PID 記錄之間的階段，均保留並回報私有 deferred 診斷；不按時間猜測，也不終止 journal 所列程序。

清理拒絕未知內容、symlink／junction、異常候選類型、損壞或未知版本的 manifest／journal。只刪該交易已知檔案，不遞迴刪未知內容；舊無 journal staging 也保留。manifest 已登記的候選（含 Windows 大小寫差異）或已記為 published 的音檔永不刪除，即使中斷落在 manifest 提交與收據更新之間。

manifest 提交是成功權威；提交後 journal 收據更新或 staging 清理失敗不反向報成分離失敗。提交前 journal 保存失敗不得用 WAV 回退掩蓋。這是程序強制終止後的保守復原，不宣稱斷電耐久或能自動清除全部不確定遺留物。

## 讀取與驗收

v2 manifest 接受安全字元的 wav／flac 結果；舊 WAV manifest／alias 不遷移。FLAC 僅能由 manifest 已登記的檔名解析，不能靠副檔名讀取任意檔案或 staging。沿既有 utawakui-media 與 206 Range；player／BGM 繼續從 manifest 投影單一四聲道檔案，不新增音訊 clock 或重綁 originalMedia。

隔離驗收涵蓋正式拒絕、工廠 opt-in、四聲道 PCM、編碼／驗證回退、保存失敗、取消／scope／gate、佇列重試及舊結果零寫入。這些不授予正式開放、完整裝置／OBS 品質或遷移能力。

修正後版本的隔離真模型證據包含一秒自製音訊的 FLAC／WAV 回退、保存／PID journal 失敗與重啟復原，以及[自然音樂／長曲](../research/audio/derived-audio-reduction-r01-2026-10-30.md#自然音樂與長曲整合驗證)的完整 quick／general 產出、同 factory 取消後重新執行、真 usePlayer 靜音播放／seek。完整 PCM 對照保存的 staged WAV；CPU 偏好、Map IPC 註冊、gate／配置／準備路徑注入，不代表正式 main.js／IPC sender／UI、DML、更廣音樂品質或裝置／OBS 驗收，也不保證即時取消。歷史收據只證明當時版本，不以新成功回填舊案例；正常退出後重啟亦不等於新增硬終止或斷電驗收。
