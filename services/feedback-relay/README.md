# Feedback Relay

Cloudflare Worker that receives Utawakui 使用者回饋（`electron/lib/feedback/client.js`
送出的 payload），驗證後轉發成 Discord embed。獨立部署，不隨 App 打包——
`electron-builder.yml` 的 `files:` 白名單從未列出這個目錄。

## Production contract

- 唯一公開入口是 `POST https://api.utawakui.llazypilot.com/feedback/submit`；
  其他 path 回 `404`，其他 method 回 `405`。
- `CLIENT_MARKER` 是提交在 `wrangler.toml`、同時內嵌於桌面 App 的公開協定
  marker，只用來排除 generic drive-by POST，不是驗證或秘密。
- `RATE_LIMIT_KV` 與 `DISCORD_WEBHOOK_URL` 都是必要 binding；任一缺失或 KV
  無法存取時 relay fail closed，不會繞過 rate limit 繼續送出。
- 只有 `DISCORD_WEBHOOK_URL` 是 secret。KV namespace id 與 client marker 都可
  公開，不要把 webhook 寫進 repository、installer 或指令歷史。

Discord embed 以使用者說明為第一層；歌曲資訊、診斷附件提示與聯絡方式等可變內容
依序使用 full-width field，版本／環境才組成固定的 inline 二欄。Footer 只顯示
完整 UUID 前 12 個 hex 字元組成的 `XXXX-XXXX-XXXX` 回報碼；canonical
`reportId`、relay response 與 diagnostics filename 仍保留完整 UUID。
Relay 在這個 presentation boundary 將使用者文字的 Discord Markdown 語法轉為
literal 顯示，同時保留 bare source URL；`allowed_mentions` 在 JSON 與 multipart
兩條 delivery path 都維持停用。這只影響 Discord 顯示，不修改 App 預覽或 payload。

## 部署

Production KV namespace 已透過 `wrangler.toml` 的 `RATE_LIMIT_KV` binding
固定；如果日後重建 namespace，必須同步更新該 id 與 deployment contract test。
不要在 `services/feedback-relay/` 執行 `npm install` 產生第二份 lockfile；使用
固定版本的 Wrangler 執行部署：

```bash
cd services/feedback-relay
npx --yes wrangler@4.131.2 login
npx --yes wrangler@4.131.2 whoami
npx --yes wrangler@4.131.2 deploy
npx --yes wrangler@4.131.2 secret put DISCORD_WEBHOOK_URL
```

第一次 `deploy` 會依 `wrangler.toml` 自動建立 `utawakui-feedback-relay`，並把
`api.utawakui.llazypilot.com` 建為 Worker Custom Domain。設定明確停用
`workers.dev`，避免留下第二個永久 production 入口；該 hostname 不可預先存在
同名 DNS record。Custom Domain 的 DNS 與 TLS 都由 Cloudflare 建立。

第一次部署尚未有 Discord secret，endpoint 會依 fail-closed contract 回 `503`。
接著執行 `secret put`；它會立即建立並部署包含 secret 的新 Worker version。完成
後直接在 Custom Domain 執行 route／method／payload／rate-limit 與 Discord 收件
smoke，不另外手動建立 CNAME。

App production build 已固定使用正式 endpoint；
`UTAWAKUI_FEEDBACK_ENDPOINT` 只保留給明確的本機或 staging smoke，不要求一般
使用者設定環境變數。

## 安全邊界（誠實記錄）

`CLIENT_MARKER` 是內嵌在公開發行的桌面 App 裡的共用字串，任何人反組譯 App
都拿得到。它只擋得住隨手掃描器，擋不住刻意的濫用者。真正的防線是
`src/rateLimit.js` 的 IP 速率限制（預設每 10 分鐘 20 次）；relay 在 binding
缺失或 KV 操作失敗時一律回 `503`，不會 fail open。
之後若要更嚴謹，考慮：

- 換成每個 App 安裝各自的簽章 token（需要額外的 provisioning 流程）
- 用 Durable Object 取代目前的 KV get-then-put 計數器——現在的作法在高並發
  下不是原子操作，兩個請求可能同時讀到同一個計數並都通過；對個人專案的
  回報流量而言可接受，量大時才需要處理。

## 路由

`src/index.js` 的 `KIND_WEBHOOK_ENV` 目前把四種回饋類別（`bug`／`feature`／
`experience`／`content`）全部指到同一個 `DISCORD_WEBHOOK_URL`。日後要拆成
不同頻道，只需要：

1. 新增對應的 Discord webhook URL 作為新的 secret（例如 `DISCORD_WEBHOOK_URL_BUG`）
2. 在 `KIND_WEBHOOK_ENV` 把該 kind 指過去

App 端、payload schema 都不用改。

## 測試

邏輯（`validate.js`／`discordEmbed.js`／`rateLimit.js`／`index.js`）用純函式
或依賴注入寫成，測試已經接進repo 根目錄的 Vitest（`vite.config.js` 的
`test.include` 有列 `services/**/*.test.js`），跟主 App 一起用 `npm test` 執行，
不需要另外的 test runner 或 Miniflare。
