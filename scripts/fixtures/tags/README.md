# Tags 測試音源

`tone.flac` 是本專案以 FFmpeg 自行合成的 997 Hz、0.05 秒單聲道音源，
包含測試曲名、藝人、ReplayGain 與自訂 comment。無使用者音訊或第三方錄音。
固定 fixture 讓 unit tests 不必依賴本機 FFmpeg；FFmpeg 只用於產生與額外解碼比對。

此目錄不在 installer runtime allowlist。正式 writer 不啟動 FFmpeg、不重新編碼音訊。
