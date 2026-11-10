# 導唱音高開發原型

開發版從「提詞器 → 跟唱」開啟。先啟用音訊處理、準備 FFmpeg，並選用有四聲道分離導唱的曲目。SwiftF0 在 CPU 分析原調導唱，最長 12 分鐘。播放調性沿用播放器當下的設定。[跟唱操作與顯示契約](../../docs/contracts/performer-prompter-contract.md#開發版跟唱)

將 SwiftF0 0.3.0 官方 wheel 內的 `model.onnx` 放在本目錄。原型接受 135,090 位元組、SHA-256 為 `6385e8c2ebc3872e82c9ff5946228de44cd3be77a750ea53698b7dbfe94b0a22` 的權重。此本機資產不進發行封裝。

分離結果旁保存原調音高 `reference-pitch-v1.json`，以及同源 Inst HQ 4 適用的活動遮罩 `reference-pitch-activity-v1.json`。有效快取直接載入。遮罩不適用或計算失敗時回退到原調音高。人工標記另存 `reference-pitch-review-v1.json`，只套用於相同曲目與分離版本。

選用的分離成品發布後，開發版在背景準備上述快取。設定的音訊處理區可檢查並補齊既有曲目的快取。分離、自動準備、提詞器及補檔各自回報狀態。提詞器與補檔共用同一分離成品的準備工作。

反相 B 與 `UTAWAKUI_REFERENCE_JA_REST` 只供研究對照。[前期量測](../../docs/research/audio/reference-pitch-note-boundary-summary-2026-11-06.md)
