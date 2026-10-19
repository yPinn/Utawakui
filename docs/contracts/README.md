# 契約文件索引

契約定義可驗證的資料、ownership、安全與驗收邊界；檔案存在不代表功能已交付。產品現況見[規格](../spec.md)，決策原因見[ADR索引](../adr/README.md)。

## 曲庫、匯入與播放

- [匯入session與批次互動](import-task-session.md)
- [曲庫空間管理](library-storage-management.md)
- [曲目編輯](track-editing.md)
- [曲目試聽](track-preview.md)
- [播放紀錄與啟動恢復](playback-history-and-resume.md)
- [本地播放安排與場次進度](performance-session-preparation.md)
- [BGM準備、播放與互斥交接](bgm-standby-lane.md)

## 歌詞與來源

- [T0／T1／T2時間與回退](lyrics-timing-contract.md)
- [獨立聲學詞塊估計](lyrics-acoustic-estimate-contract.md)
- [讀音品質與人工驗收](lyrics-reading-quality-contract.md)
- [Provider驗證語料](lyrics-provider-evaluation-corpus.md)
- [多來源搜尋與選擇](multi-source-lyrics-search-contract.md)
- [LRCLIB取得／保存](lrclib-acquisition-contract.md)
- [NetEase取得](netease-acquisition-contract.md)
- [Better Lyrics手動快取取得](betterlyrics-acquisition-contract.md)
- [AMLL退役來源相容](amll-acquisition-contract.md)
- [Musixmatch備援規劃](musixmatch-reserve-adapter.md)
- [NetEase歷史隔離驗證](netease-isolated-technical-validation.md)
- [Self-View提詞與窄域控制](performer-prompter-contract.md)

## 音樂分析與識別

- [分析producer／資料契約](music-analysis-contract.md)
- [BPM品質門檻](music-analysis-bpm-quality-gate.md)
- [M2真實歌曲門檻](music-analysis-m2-quality-gate.md)
- [音樂identity與evidence](music-identity-evidence-contract.md)
- [演出者照片來源](artist-photo-provider.md)

## Output與外部整合

- [Output runtime防護](output-runtime-hardening.md)
- [Overlay資產安全](overlay-asset-security.md)
- [Overlay pack契約／後續方向](overlay-pack-contract.md)
- [整合adapter邊界](integration-adapter-contract.md)

## 操作介面與共同規則

- [操作層級與確認](action-intent-and-confirmation.md)
- [輸入綁定](input-bindings.md)
- [Settings操作回饋](settings-operation-feedback.md)
- [Token v2元件檢查](token-v2-component-review.md)
- [Token v2替換驗收](token-v2-replacement.md)
- [程式命名](codebase-naming.md)

## 分析測試範本

[BPM benchmark](music-analysis-bpm-benchmark-template.json)、[完整run config](music-analysis-bpm-run-config-template.json)、[runtime smoke config](music-analysis-bpm-smoke-run-config-template.json)、[M2 benchmark](music-analysis-m2-benchmark-template.json)。範本用途與門檻以所屬契約為準。
