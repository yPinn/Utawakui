# 本機音訊／MV 時間對照探針

獨立離線研究工具，不由正式 App 載入，不下載素材，不保存曲庫 sidecar。只依賴既有 Python、NumPy 與 FFmpeg；本輪沒有新增環境或套件。方法與適用限制見[研究紀錄](../../../docs/research/audio/media-alignment-and-lyrics-transfer-2026-11-11.md)。

## 執行

從專案根目錄執行，兩個輸入都必須是本機有音軌的檔案，每個檔案解碼後為 2–300 秒。只有畫面的 MP4 需另外提供同來源參考音訊。

```powershell
python -B scripts/research/mediaAlignment/probe.py --source local-audio.mp3 --target mv-reference.mp4 --output tasks/media-alignment/report.json
```

工具透過固定參數呼叫 FFmpeg，不執行 shell。來源解碼為 4 kHz mono，以 2 秒窗口、0.5 秒步距做 normalized cross-correlation。每窗另查四個子窗與第二候選。至少連續兩個窗口支持同一偏移，且整段偏移範圍不超過 30 ms，才形成候選段；重複、靜音、低分與區間衝突保留未知。候選依雙側時長裁切，保持偏移不變。這是同錄音 baseline，不是 Chroma／DTW 實作，尚不提供速度差校正、已烘焙變調、不同演唱或人聲／伴奏互配。

輸出含來源 SHA-256、參數、單位倍率時間段、雙側未知區、各窗分數、共同區覆蓋及耗時。所有結果均須校對，分數不是成功機率。報告檔必須使用新檔名，不覆寫既有輸入或報告。

## 搬移既有歌詞時間

`--lyrics` 接收 JSON 陣列，每列具有唯一 `lineId`，可帶 `text`、`startMs`、`endMs` 及其他原資料。時間必須已確定對應輸入中的哪一個音源版本與座標。本工具不猜來源、不另外套用文件／人工 offset。

```powershell
python -B scripts/research/mediaAlignment/probe.py --source local-audio.mp3 --target mv-reference.mp4 --lyrics mv-lines.json --lyrics-direction target-to-source --output tasks/media-alignment/lyrics-report.json
```

本機音源是 source、MV 是 target 時，MV 歌詞搬回本機用 `target-to-source`，反向搬移則用 `source-to-target`。完整保留原列資料，只另列候選時間。只有句首時保留句首、句尾為 null；有句尾時整句必須位於同一段可配對區間，跨剪輯或缺口不硬補。相同文字以不同 `lineId` 保留各次出現，譯文也原樣保留。此版只產生句級候選，不會產生 T2、修改字詞時間或從純文字建立時間。

## 驗證與重跑

```powershell
python -B scripts/research/mediaAlignment/probe_test.py
python -B scripts/research/mediaAlignment/evaluate.py --output-dir tasks/media-alignment-new-run
python -m ruff check scripts/research/mediaAlignment
python -m ruff format --check scripts/research/mediaAlignment
```

測試用標準庫 unittest，含真實 FFmpeg／MP3 編解碼 smoke；找不到 FFmpeg 時兩個檔案測試會明確跳過。評估器必須有 FFmpeg，輸出目錄必須尚未存在；保存合成案例的候選、已知真值、100 ms 網格評分、歌詞候選、程式指紋與四分鐘合成 WAV。它不讀取使用者曲庫，也不宣稱真人歌唱準確率。
