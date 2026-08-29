# NetEase 隔離式技術驗證契約

狀態：歷史 Phase A engineering evaluation；產品進入條件已由 owner 於 2026-08-29 取代。
建立日期：2026-08-28。

> 本契約保留當時的隔離驗證與 Sentinel 判定規則，不再是現行產品接入契約。現行邊界見
> [NetEase 歌詞取得契約](netease-acquisition-contract.md)。

## 目的與非目標

本階段只驗證 maintained NetEase reverse client 的接口健康、錄音版本匹配與
`lyric_new` timing 能力。LRCLIB 維持預設來源；NetEase 不加入固定 LRCLIB／AMLL
registry、自動歌詞取得、installer、production dependency、Electron startup、preload、
renderer 或正式 sidecar provenance。本階段不建立 v5 corpus，也不宣稱歌曲覆蓋率。

## Dependency Boundary

Evaluation profile 固定為 `netease-yrc-evaluation-v1`，只接受
`@neteasecloudmusicapienhanced/api` 4.40.1。根套件 npm SRI 固定為
`sha512-RUpVnxUCkeEt0yYeElc+UvCXqucikI/PIlJaLj18FlwHQ8X9wk4QkM/h7C+qePC97COMODcmgRXKgWO94YLuWA==`，
unpacked size 為 15,322,633 bytes，授權為 MIT。獨立 npm lock 必須固定所有 transitive
registry artifacts 的版本、resolved URL 與 SHA-512 integrity；main `package-lock.json`
不得改變。

Runtime 位於 ignored evaluation root，與主 `node_modules` 及 Electron `userData` 分離。
Install 使用 staging generation；只有 package identity、lock、Node compatibility、大小與
license 驗證通過的 immutable generation 可以原子 activation。Worker 的 home、profile、
roaming/local app data 與 temp 都指向 disposable evaluation directories，不繼承 cookie、
token、proxy/npm credentials、`NODE_OPTIONS`、`ELECTRON_RUN_AS_NODE` 或非必要環境值。

## Process And IPC Boundary

每個 probe 使用一個 one-shot child process。Parent 只傳 exact versioned IPC message，內容
為 title、artist、optional album、duration 與 controlled recording version。Worker 在單一
absolute deadline 內完成 `cloudsearch`、deterministic ranking 與 `lyric_new` classification，
並只回傳既有 normalized categorical observation；只有 smoke 人工複核需要時，才另帶 bounded
candidate summary（title、artists、album、duration 與 controlled match facts），不得帶 provider id、
URL、body、lyrics 或 catalog id。

Worker stdout／stderr 使用 ignored sinks。IPC 每個方向最多一個 message、4 KiB，拒絕 extra
fields、重複 message 與 malformed observation。Timeout 或 protocol failure 必須終止並 reap
Windows process tree；`Promise.race` 不構成取消。一次只允許一個 worker，provider request
間隔不得短於 500 ms。

任何 package integrity mismatch、credential／user-state inheritance、provider output／body
leak、oversized／invalid IPC、process-tree termination failure 或 unresolved schema drift 都是
hard failure，不能由成功率抵銷。

## Adapter And Timing

候選以 title、artist、album、duration、aliases、translated titles 與 recording-version
markers 決定排序。Live、remix、錯誤版本或過大 duration delta 不可成為 accepted match。

- T0：沒有同步時間。
- T1：有效逐行 LRC。
- T2：完整通過 parent-line 與 segment bounds／ordering 驗證的 provider-authored YRC。

Invalid／partial YRC 不能被推論為 T2。Catalog miss、YRC missing、rate limit、timeout、upstream
failure、response too large、invalid response、schema drift、worker crash 與 forced termination
必須分開統計。Untrusted catalog ids、URLs、bodies、lyrics、translations、exception text、paths、
stdout 與 stderr 不得跨出 worker 或寫入報告。

## Smoke And Sentinel

Smoke 使用 ignored private manifest，涵蓋少量清楚、近代、主流的中文、英文、日文與韓文
studio recordings。Reference metadata 只存在 ignored private manifest；持久化 smoke report 只有
aggregate interface health。自動 version／duration gate 後仍模糊的少數候選，只在當次 CLI
輸出 bounded candidate summary 交由 owner 確認，不寫入 smoke report 或 Sentinel state。

Sentinel 每 15 分鐘執行一個輪替 probe，不補發 missed slots。至少 288 attempted slots 才構成
72 observed hours；本機 downtime 會延長完成時間。Checkpoint 只保存 interval／cumulative
request success、match／miss、T0／T1／T2、YRC missing、latency buckets、fixed failures、schema
drift 與 termination state。Synthetic fault fixtures 與 live provider health 分開。

## Provisional Decision

- `technically-usable`：所有 hard gates 通過、smoke selection 正確、完成 288 slots、request
  success 至少 95%、無 schema drift，且存在 validated T2 evidence。
- `fallback-experimental-only`：hard gates 通過，但成功率為 90–95%，或 catalog／validated-YRC
  evidence 仍不足。
- `unstable-exclude`：任一 hard failure、schema drift、smoke selection 錯誤、sentinel 未完成，
  或 request success 低於 90%。

即使 72 小時為 `technically-usable`，仍只開始累積 30 complete days 的相同本機健康紀錄。
完成 30 天以前不得討論產品 registry、candidate UI、storage migration、automatic fallback 或
generic provider contract。Musixmatch 已有獨立的 official-API reserve adapter 決議，不是本
契約完成後自動開始的 reverse-provider 候選。
