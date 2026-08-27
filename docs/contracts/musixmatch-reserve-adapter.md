# Musixmatch Reserve Adapter Contract

## Decision

Musixmatch 目前只保留為未啟用的官方 API 備用接入口。現有實作證明 Electron 邊界可以
接受 Musixmatch provider，但正式接入需要付費 API 資格與另一次產品決策；在此之前不得
把它呈現為可用歌詞來源或納入自動取得流程。

這不是 reverse-client 評估，也不授權使用 desktop token、cookie、非公開 endpoint 或
第三方 reverse package。RichSync 不在目前 adapter 的已實作能力內。

## Existing Footprint

- `electron/lib/musixmatch.js` 使用官方 `ws/1.1` API 的
  `matcher.subtitle.get`，只解析 LRC 並回傳 bounded availability summary；不把 provider
  body 或歌詞內容送到 renderer，也不保存來源。
- `electron/main/lyrics/acquisitionHandlers.js`、`electron/preload.js` 與
  `src/composables/lyrics/useLyricsAcquisition.js` 已保留 gated probe 接線。
- production renderer 沒有 component／view 呼叫 `probeMusixmatch()`；目前只有 tests
  覆蓋此備用路徑。因此它是 dormant end-to-end capability，不是完全未被 import 的 dead
  file。
- 未提供 `MUSIXMATCH_API_KEY` 時，adapter 只回傳 `not-configured`。專案不自動載入
  `.env`，也不隨 installer 配置 API key。

## Non-Goals

在另一次明確產品決策以前，Musixmatch 不得：

- 加入 LRCLIB candidate search／save、固定 provider registry 或 automatic fallback；
- 出現在可用來源 UI、預設設定或 onboarding；
- 取得、保存或繼承使用者 cookie、desktop token 或 reverse-client profile；
- 引入 production dependency、installer artifact、背景 runtime、Sentinel 或 corpus；
- 被描述為已授權、免費可用、正式支援或具有任何 corpus 覆蓋率。

## Future Activation Gate

只有 owner 明確決定正式評估，且已有可用的官方 API 方案後，才重新檢查商業條款、授權
範圍、費用、secret provisioning、rate limits、RichSync entitlement、資料保存與使用者介面。
現有 adapter 只能作為接線起點；它本身不代表上述 gate 已通過。
