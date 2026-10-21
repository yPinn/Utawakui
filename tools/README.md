# 維護工具

`tools/` 保存發布維護工具；一般開發、研究與驗收命令見 [scripts 導覽](../scripts/README.md)。目前只有 `update-signing/`，以三個直接入口分工，不另增加 npm 別名。

## 更新 Manifest 簽章

| 工具                                                        | 用途                                                                                           | 使用者與寫入範圍                                                                                                             |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| [generate-keypair.mjs](update-signing/generate-keypair.mjs) | `node tools/update-signing/generate-keypair.mjs` 產生開發用 Ed25519 keypair，輸出公鑰與 key id | 手動一次性準備；私鑰寫到本工具目錄的 `.local/dev-private-key.pem`，已存在時拒絕覆寫。不是正式金鑰佈署入口                    |
| [sign-manifest.mjs](update-signing/sign-manifest.mjs)       | 依指定 installer 的 basename、size、SHA-512 產生 schema v2 manifest，支援多簽章                | 本機維護或 release workflow 的條件式 sign job；讀取明確提供的私鑰，寫入 `--out`，預設為目前工作目錄的 `update-manifest.json` |
| [verify-manifest.mjs](update-signing/verify-manifest.mjs)   | 驗證 production registry、指定版本、必要簽章及每個 artifact 的大小與 hash                      | release workflow 的 sign／publish jobs 與手動發布前檢查；只讀取輸入，不簽署或產生金鑰                                        |

請在專案根目錄執行。簽署與驗證的完整參數見各檔案的 usage；兩者不帶參數執行時只顯示 usage 並失敗退出。金鑰產生器不帶參數就會嘗試建立金鑰，不適合作為入口探測命令。

正式啟用、金鑰保管、輪替及發布操作只在[發行手冊](../docs/operations/release-runbook.md#signed-manifest-activation-and-rotation)維護；簽章格式與信任規則見 [ADR 0018](../docs/adr/0018-signed-update-manifest.md)。開發金鑰不能通過 production 驗證。功能是否啟用以 `shared/appUpdateValues.json` 為準，公鑰與狀態以 `shared/updateSigningKeys.json` 為準；保留工具不代表正式簽章已啟用。

## 維護邊界與檢查

- `.local/` 是 ignored 的開發金鑰保存位置，不是暫存快取。不要因本次清理刪除、重建，或把私鑰複製進文件／測試證據。正式金鑰仍依發行手冊管理。
- `sign-manifest.mjs` 與 `verify-manifest.mjs` 共用 `electron/lib/updateManifestVerification.js` 的 canonicalization／驗證契約；兩者分別由不同 workflow jobs 呼叫，保留獨立入口。
- `tools/` 不隨應用程式封裝；不要因名稱有 update 就移入 Electron runtime。搬動工具前須同步 workflow、測試及文件引用。
- 相關測試位於 `scripts/update-signing.test.mjs`、`scripts/update-manifest-verifier.test.mjs`、`scripts/update-signing-policy.test.mjs`、`scripts/release-workflow.test.mjs`，runtime 驗證測試位於 `electron/lib/updateManifestVerification.test.js`。測試使用臨時金鑰與合成 artifact，不使用 `.local/` 私鑰。
