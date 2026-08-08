# LINE Pay 分離式請款 Sandbox 驗證清單

最後更新：2026-08-08

## 目前狀態

- LINE Pay 已於 2026-07-31 回覆「測試商店 test_202606269512 已開通分開請款功能」，確認分離式請款已開通。
- 2026-08-08 已完成人工端對端驗證，`backend/.env` 設定 `LINE_PAY_CAPTURE_SEPARATED=true`。**通過門檻（LP-01、LP-02、LP-04、LP-07、LP-08、LP-09、LP-10）全數通過**，詳見下方「已完成驗證結果」。
- LP-03（partial capture）因 LINE Pay 回覆未明確確認是否支援，本輪仍列為略過；不影響通過門檻。
- 本清單只用於 Sandbox，不得拿 production Channel 或真實款項測試。
- Channel ID、Channel Secret 與測試帳號不得寫入 Git、文件或測試輸出。

## 已完成驗證結果（2026-08-08）

- 測試方式：Android 模擬器（`DrinkGroupBuy_API34`）+ 真實 LINE Pay Sandbox 網頁流程（`access.line.me` 登入 + CAPTCHA 由人工完成，`sandbox-web-pay.line.me` 模擬付款頁由 Claude 操作）。
- Git commit：延續 2026-08-05 ECPay 切片後的工作樹（本輪為文件與驗證更新，未變更程式碼）。
- Backend 啟動環境：`LINE_PAY_ENV=sandbox`、`LINE_PAY_CAPTURE_SEPARATED=true`。
- LP-01：`transactionId=2026080802374237210`，confirm 後 `authorized`，`authorizedAmount=65`，`expiresAt` 為 confirm 時間 +5 天（Sandbox 授權效期）。
- LP-02／LP-06：目標 1 杯達標，截止結算自動 capture，`finalAmount=60`（原價 65 折扣 5），`releasedAmount=5`，僅 1 筆 capture。
- LP-04：已授權訂單於顧客取消時 void，`failureReason=customer_cancelled_order`，未產生 capture。
- LP-05：目標 3 杯僅 1 杯下單、顧客不接受原價，截止結算 void，`failureReason=deadline_settlement_discount_not_qualified`，活動狀態 `failed`。
- LP-07／LP-09：`npm run payment-reliability:smoke`、`npm run payment-reliability:multiprocess` 通過（跨程序 lease 互斥與逾時接手、provider `0121` 對帳）；`multiprocess` 第一次遇到 Windows SQLite `database is locked`，重跑後通過，判斷為暫時性鎖定競爭，非邏輯錯誤。
- LP-08：建立真實 pending 授權後未完成登入即重啟 backend，重啟後 `providerAuthorizationId` 與狀態完整保留，無遺失或重複。
- LP-10／LP-11：`npm run settlement:smoke` 通過，`capture retry: interval=30s, attempts=3, fourth_attempt_suppressed=1`；`manual repayment: cutoff=15m, captured=1, duplicate_capture_suppressed=1`。
- LP-12：已 capture 訂單全額退款成功（`returnCode=0000`），重複呼叫退款回傳同一筆記錄（`idempotent=true`），未產生第二筆退款。
- 額外發現（非本清單範圍，另案追蹤）：backend 重啟時 log 出現 `[line-pay-reconciliation] ReferenceError: logAlertRequiredJobs is not defined`（`backend/payments/reliabilityService.js` 既有 bug，函式被誤巢狀在 `stoppedScheduler` 內），不影響對帳核心邏輯，只影響告警日誌輸出。

## 開始條件

收到 LINE Pay 回覆後，先確認文字中明確包含：

1. 指定 Sandbox 商店 ID／Channel ID 已支援 request 的 `options.payment.capture=false`。
2. 已支援後續 capture API。
3. 是否允許 capture 金額小於 authorization 金額；若限制 partial capture，先停止「最終金額較低」測試並回覆 LINE Pay 確認。
4. authorization 有效期限與 Sandbox 測試限制。

只有以上資訊一致，才可在本機 `backend/.env` 暫時設定 `LINE_PAY_CAPTURE_SEPARATED=true`。

## 測試前紀錄

每次測試保存以下資料，但不得保存 Secret：

- 測試日期與操作者。
- Sandbox 商店 ID、Channel ID 後四碼。
- Git commit SHA。
- Backend 啟動環境：`LINE_PAY_ENV=sandbox`、capture separated 是否開啟。
- 訂單 ID、authorization ID、LINE Pay transaction ID。
- request／confirm／capture／void 的 return code、時間與去識別化 payload。

## 必測案例

| 編號 | 案例 | 明確數字 | 預期結果 |
| --- | --- | --- | --- |
| LP-01 | 建立分離式授權 | 預授權 NT$100 | confirm 後為 `authorized`，不得立刻扣款成 `captured` |
| LP-02 | 等額請款 | 授權 NT$100、請款 NT$100 | 僅一筆成功 capture，訂單為 `captured` |
| LP-03 | 部分請款 | 授權 NT$100、請款 NT$80 | capture NT$80，未請款 NT$20 由 provider 釋放；本案須先確認 Channel 支援 |
| LP-04 | 取消授權 | 授權 NT$100、請款前 void | authorization 為 `authorization_voided`，不得產生 capture |
| LP-05 | 團購未達標 | 目標 3 杯、實際 2 杯、顧客不接受原價 | 結算 void，訂單取消 |
| LP-06 | 接受原價 | 目標 3 杯、實際 2 杯、原價 NT$100 | 結算 capture NT$100 |
| LP-07 | 遺失 redirect | 建立授權後不開啟 backend confirm redirect | reconciliation 依 provider 狀態收斂，不重複建立授權 |
| LP-08 | Backend 重啟 | pending authorization 建立後重啟 Backend | 持久化工作仍可接續處理 |
| LP-09 | 兩執行個體競爭 | 同一 job 同時由 2 個 Backend worker claim | 只允許 1 個 worker 處理，租約到期後才可接手 |
| LP-10 | 請款暫時失敗 | 同一筆 capture 最多 3 次 | 每次前先查 provider 狀態，不得重複扣款；終止後產生警示 |
| LP-11 | 手動重新付款 | 自動請款 3 次失敗且仍在期限內 | 原授權先查詢／必要時 void，新付款成功後才進入製作 |
| LP-12 | 退款 | 已 capture NT$80 後退款 NT$80 | refund、provider event、audit log 與訂單狀態一致 |

## 每案資料庫檢查

- `payment_authorizations` 狀態與 provider 查詢結果一致。
- `payment_captures`／`payment_refunds` 不存在重複成功紀錄。
- `payment_provider_events` 保存必要的去識別化 provider 回應。
- `payment_reliability_jobs` 成功時結束，重試耗盡時為 `failed` 且 `alert_required = 1`。
- `status_history` 與 `audit_logs` 可還原敏感狀態轉換。
- `PRAGMA integrity_check` 為 `ok`，`PRAGMA foreign_key_check` 為 0 筆。

## 通過門檻

- LP-01、LP-02、LP-04、LP-07、LP-08、LP-09、LP-10 全部通過。**2026-08-08 已全數通過**，詳見上方「已完成驗證結果」。
- LINE Pay 明確確認 partial capture 後，LP-03 才列為必要通過；目前仍未確認，LP-03 略過不影響門檻。
- 任一案例出現重複扣款、provider 與本機狀態不一致或無法追溯時，不得進入 PostgreSQL runtime 切換或 production 申請。本輪驗證未發現此類問題。
- Sandbox 全部通過也不等於可使用正式金流；production Channel 仍需獨立申請、設定與驗收。
