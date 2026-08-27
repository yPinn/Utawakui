# NetEase 隔離式技術驗證階段報告

日期：2026-08-28
範圍：Engineering evaluation；非產品來源。

## 結論

暫定結論為 **不穩定，暫時排除**。這個分類由必要證據未完成觸發，不代表已觀測到
NetEase 上游不穩定：owner 決定略過 72 小時 Sentinel，且一個 strong-band smoke 候選未做
最終人工確認。因此本階段不能產生「技術可用」或「僅適合備援／實驗」的穩定性結論。

NetEase 不加入 LRCLIB／AMLL 固定 registry、預設來源、自動歌詞取得、installer、production
dependency、Electron startup 或 v5 corpus。沒有正式歌曲覆蓋率主張，也沒有開始 30 天產品
資格觀測。

## 隔離 Runtime

- Evaluation profile：`netease-yrc-evaluation-v1`。
- Reverse client：`@neteasecloudmusicapienhanced/api` 4.40.1，獨立完整 lock 與 SHA-512
  integrity 驗證。
- 實際 activated generation：50,307,137 bytes；位於 ignored evaluation root。
- Worker 使用 disposable home／profile／app-data／temp，未繼承 cookie、token、proxy／npm
  credentials、`NODE_OPTIONS` 或 Electron runtime flags。
- 一次一個 one-shot child；stdout／stderr suppressed；IPC 每方向 4 KiB；500 ms global start
  interval；timeout 會終止 process tree，並對未完成 termination 設有 bounded grace failure。

## Four-language Smoke

Smoke 僅驗證 interface health，不代表 corpus coverage。持久化報告不含曲名、歌詞、provider
body、URL 或 catalog id。

| 指標                                  |     結果 |
| ------------------------------------- | -------: |
| Request success                       |    4 / 4 |
| Catalog match                         |    4 / 4 |
| Catalog miss                          |        0 |
| T0                                    |        0 |
| T1                                    |        2 |
| Validated T2                          |        2 |
| YRC missing                           |        2 |
| Hard failure                          |        0 |
| Schema drift                          |        0 |
| Aggregate latency                     | 3,736 ms |
| Strong-band candidate awaiting review |        1 |

中文與英文樣本取得 validated T2；日文與韓文樣本為 T1 且 YRC missing。單一 strong-band
候選只有 artist display-name 差異、duration delta 1 秒且沒有 recording-version mismatch，
但 owner 沒有提交候選正確性的明確確認，因此 selection gate 保持未完成。

## Sentinel Disposition

Owner 於 2026-08-28 明確決定不執行 Sentinel。沒有啟動背景程序、沒有 Sentinel checkpoint，
attempted slots 為 0 / 288。以下指標因此沒有 72 小時證據：request success rate、catalog
match／miss trend、T0／T1／T2 trend、YRC missing rate、latency distribution、timeout／rate-limit／
upstream failure rate 與 schema drift stability。

既定契約要求至少 288 個 attempted slots／72 observed hours；未完成觀測依規則落入
`unstable-exclude`。若未來重新評估，必須從 owner-confirmed smoke gate 起重新啟動 72 小時
Sentinel；即使通過，仍需 30 complete local days 才能討論產品整合。

## Evidence Boundary

本報告只使用 aggregate smoke 結果與 synthetic fault tests。Live health 與 synthetic failure
evidence 未混合。Owner 同日釐清 Musixmatch 已有 official-API reserve adapter 決議：保留
既有接線供未來取得付費 API 後使用，但目前不啟用，也不進行 reverse RichSync 評估。因此
NetEase 報告不構成任何 Musixmatch 開工授權。

## Verification

- Full Vitest：278 test files、3,108 tests passed。
- Full coverage：statements 87.01%、branches 81.51%、functions 90.65%、lines 89.22%。
- Coverage ratchet：所有 domain／critical-file gates passed；release-tooling branches 重新提升至
  至少 87%。
- ESLint、Markdownlint、Prettier check、`git diff --check` 與 Vite production build passed。
- Packaging exclusion：main `package-lock.json`、`electron-builder.yml`、Electron main／preload、
  production dependency tree 與固定 LRCLIB／AMLL registry 均未納入 NetEase runtime。
- Process inspection：Sentinel `not-started`、`running=false`、0 / 288 attempted slots。
