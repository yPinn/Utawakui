# Feedback Relay

Cloudflare Worker that receives Utawakui 使用者回饋（`electron/lib/feedback/client.js`
送出的 payload），驗證後轉發成 Discord embed。獨立部署，不隨 App 打包——
`electron-builder.yml` 的 `files:` 白名單從未列出這個目錄。

## 部署

```bash
cd services/feedback-relay
npm install
npx wrangler kv namespace create RATE_LIMIT_KV   # 貼 id 進 wrangler.toml
npx wrangler secret put CLIENT_TOKEN
npx wrangler secret put DISCORD_WEBHOOK_URL
npx wrangler deploy
```

部署後把 Worker URL 設進 App 端的 `UTAWAKUI_FEEDBACK_ENDPOINT` 環境變數
（見 `electron/lib/feedback/constants.js`），或直接改該檔案的
`DEFAULT_FEEDBACK_ENDPOINT`。

## 安全邊界（誠實記錄）

`CLIENT_TOKEN` 是內嵌在公開發行的桌面 App 裡的共用字串——**它不是秘密**，
任何人反組譯 App 都拿得到。它只擋得住隨手掃描器，擋不住刻意的濫用者。
真正的防線是 `src/rateLimit.js` 的 IP 速率限制（預設每 10 分鐘 20 次）。
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
