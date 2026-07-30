# LINE Pay 分離式請款 Sandbox 驗證清單

最後更新：2026-07-30

## 目前狀態

- 已向 LINE Pay 申請 Sandbox Channel 的分離式請款能力。
- 在 LINE Pay 明確回覆開通前，`LINE_PAY_CAPTURE_SEPARATED` 必須維持 `false` 或不設定。
- 本清單只用於 Sandbox，不得拿 production Channel 或真實款項測試。
- Channel ID、Channel Secret 與測試帳號不得寫入 Git、文件或測試輸出。

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

- LP-01、LP-02、LP-04、LP-07、LP-08、LP-09、LP-10 全部通過。
- LINE Pay 明確確認 partial capture 後，LP-03 才列為必要通過。
- 任一案例出現重複扣款、provider 與本機狀態不一致或無法追溯時，不得進入 PostgreSQL runtime 切換或 production 申請。
- Sandbox 全部通過也不等於可使用正式金流；production Channel 仍需獨立申請、設定與驗收。
