# 契約文件索引

契約定義可驗證的資料、ownership、安全與驗收邊界；檔案存在不代表功能已交付。產品現況見[規格](../spec.md)，決策原因見[ADR索引](../adr/README.md)。

## 曲庫、匯入與播放

- [匯入session與批次互動](import-task-session.md)
- [曲庫空間管理](library-storage-management.md)
- [曲目編輯](track-editing.md)
- [曲庫檢查與校對](library-reconciliation.md)
- [音檔標籤回寫](audio-tag-writeback.md)
- [作品、版本與發行資料](works-versions-and-releases.md)
- [來源發行曲序、本地持有與批次下載](release-source-catalog.md)
- [Folder 頁面物件](folder-page-objects.md)
- [曲目試聽](track-preview.md)
- [播放紀錄與啟動恢復](playback-history-and-resume.md)
- [本地播放安排與場次進度](performance-session-preparation.md)
- [BGM準備、播放與互斥交接](bgm-standby-lane.md)

## 歌詞與來源

- [T0／T1／T2時間與回退](lyrics-timing-contract.md)
- [來源保真、共用文字預處理與模板分區](lyrics-text-processing.md)
- [獨立聲學詞塊估計](lyrics-acoustic-estimate-contract.md)
- [讀音品質與人工驗收](lyrics-reading-quality-contract.md)
- [Provider驗證語料](lyrics-provider-evaluation-corpus.md)
- [外部服務限流與重試](external-service-request-policy.md)
- [歌詞來源：搜尋、自動取得與各來源](lyrics-sources.md)
- [Self-View提詞與窄域控制](performer-prompter-contract.md)

## 音樂分析與識別

- [音樂分析：資料、投影與品質門檻](music-analysis.md)
- [音樂identity與evidence](music-identity-evidence-contract.md)
- [演出者照片來源](artist-photo-provider.md)

## Output與外部整合

- [Output runtime：投影、傳輸與頁面生命週期](output-runtime.md)
- [Output 外觀：欄位、模板、本機來源與預覽](output-appearance.md)
- [Overlay pack 與資產安全（規劃）](overlay-pack.md)
- [整合adapter邊界](integration-adapter-contract.md)

## 操作介面與共同規則

- [操作層級與確認](action-intent-and-confirmation.md)
- [輸入綁定](input-bindings.md)
- [Settings操作回饋](settings-operation-feedback.md)
- [Token v2元件檢查](token-v2-component-review.md)
- [程式命名](codebase-naming.md)
