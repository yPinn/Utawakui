# 音訊擷取工廠

`obsInput.cjs` 僅供隔離研究：呼叫者提供 Main 私有盤點已核對的 B2 裝置，在第一次 `CreateInput` 就指定 endpoint，避免短暫開啟預設 B1。裝置缺失或被替代時拒絕，不回退；呼叫者負責只清理自己建立的來源，並等待錄音 STOPPED 後退出。

此工具不連線、不錄音、不變更 mixer 或產品 gate；原生驗收與限制見 [R01](../../docs/research/audio/derived-audio-reduction-r01-2026-10-30.md)。裝置 id、憑證及錄音留在本機，不提交。

```powershell
node --test prototypes/audio-routing/obsInput.test.mjs
```
