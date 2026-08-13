# ECPay 信用卡 Stage 人工驗證清單

最後更新：2026-08-08

## 目前狀態

- 信用卡（綠界 ECPay）原為 LINE Pay 分離式請款卡關期間新增的備用付款 provider；**LINE Pay 已於 2026-07-31 核准、2026-08-08 完成 Sandbox 人工端對端驗證**（詳見 `docs/line-pay-separated-capture-sandbox-checklist.md`），ECPay 回歸單純備援/並行角色，本清單優先度已降低但仍建議完成以維持雙 provider 可用性。詳見 `docs/AI-current-progress.md`「2026-08-05 新增信用卡（ECPay）付款」與 `docs/payment-rules-and-flow.md`「付款 Provider 方向」。
- `backend/payments/ecpayClient.js`／`ecpayService.js`／`server.js` 路由已完成並通過自動化測試（`npm run ecpay:smoke`，走 `mock_ecpay`，不打真實網路）與函式層/HTTP 層端對端驗證。
- 本清單用於**真正打 ECPay Stage 測試環境**的人工驗證，尚未執行。
- 本清單只用於 Stage 測試環境，不得拿 production Channel 或真實款項測試。

## 開始條件

不需要等待審核——這與 LINE Pay 分離式請款不同，ECPay 的「先授權、之後才關帳」是帳號層級標準設定，測試用公開特店資料可直接使用：

- 商號（MerchantID）：`3002607`
- HashKey／HashIV：ECPay 官方公開測試資料，已內建於 `backend/payments/ecpayClient.js` 作為預設值（`ECPAY_ENV` 非 `production` 時自動套用），僅供 Stage 環境使用。
- 測試環境後台：`https://vendor-stage.ecpay.com.tw/`
- 測試付款頁網域：`https://payment-stage.ecpay.com.tw/`

執行測試前，需要在本機或測試主機的 `backend/.env` 設定：

```env
ECPAY_ENV=stage
ECPAY_RETURN_URL=<可從外部連到的 backend URL>/api/payments/ecpay/return
ECPAY_CLIENT_BACK_URL=<可從外部連到的 backend URL>/api/payments/ecpay/client-back
```

**`ECPAY_RETURN_URL` 必須是 ECPay 伺服器能連到的網址**（例如用 ngrok 或部署到測試主機），本機 `localhost` 無法讓 ECPay 呼叫到，這點跟 LINE Pay confirm/cancel（使用者瀏覽器 redirect）不同——ECPay 的 ReturnURL 是伺服器對伺服器直接呼叫。

## 測試前紀錄

每次測試保存以下資料，但不得保存任何正式環境金鑰：

- 測試日期與操作者。
- Git commit SHA。
- Backend 啟動環境：`ECPAY_ENV=stage`。
- 訂單 ID、`MerchantTradeNo`、ECPay `TradeNo`。
- request／webhook／capture／void／refund 的回應內容與時間（可去識別化保存 `payment_provider_events` 內容）。

## 必測案例

| 編號 | 案例 | 說明 | 預期結果 |
| --- | --- | --- | --- |
| EC-01 | 標準結帳成功授權 | 使用 ECPay 官方測試信用卡卡號（3D 驗證簡訊固定為 `1234`）完成付款頁流程 | ReturnURL webhook 收到 `RtnCode=1`，訂單變成 `authorized`；回應 `"1|OK"` |
| EC-02 | 使用者中途取消 | 在 ECPay 付款頁點選返回或關閉 | 訂單維持 `pending`，可重新發起付款 |
| EC-03 | CheckMacValue 驗證失敗 | 手動竄改一個已完成的合法 webhook 參數後重送 | 後端回 `400` 與 `"0|CheckMacValue invalid"`，資料庫狀態不變 |
| EC-04 | webhook 重送冪等 | 對同一筆 `MerchantTradeNo` 重複送出相同 ReturnURL 通知 | 不重複寫入 `payment_provider_events`／不重複觸發狀態轉換，仍回 `"1|OK"` |
| EC-05 | ClientBackURL 早於 webhook 到達 | 模擬使用者比 webhook 更快回到 App（人工延遲 ReturnURL 送達） | 落地頁與 App 顯示「處理中」，不得顯示最終結果；webhook 到達後狀態才更新，App 下次刷新或 polling correctly 顯示 |
| EC-06 | webhook 到但使用者從未回到 App | 完成付款後直接關閉瀏覽器，不點擊回 App | 後端狀態仍正確更新為 `authorized`；使用者之後重新打開 App 手動刷新可看到正確狀態 |
| EC-07 | 關帳（capture） | 團購達標，截止結算觸發 capture | ECPay 後台顯示已關帳，`payment_captures` 寫入 `captured`，訂單 `final_amount` 正確 |
| EC-08 | 取消／退款 | 分別測試截止前 void（未達標）與截止後 refund（已請款需退費） | `payment_authorizations.status = authorization_voided` 或 `payment_refunds.status = refunded`，`payment_provider_events` 與 `audit_logs` 皆有紀錄 |

EC-05、EC-06 是 ECPay 特有的雙軌通知風險點（LINE Pay 沒有對應案例，因為 LINE Pay 的 confirm 就是使用者瀏覽器 redirect 本身），務必獨立測試，不能只測「webhook 跟 ClientBackURL 同時到達」的樂觀情境。

## 每案資料庫檢查

- `payment_authorizations` 狀態與 ECPay 端查詢結果一致。
- `payment_captures`／`payment_refunds` 不存在重複成功紀錄。
- `payment_provider_events` 保存必要的去識別化 ECPay 回應（含 `TradeNo`、`RtnCode`）。
- `status_history` 與 `audit_logs` 可還原敏感狀態轉換。
- `PRAGMA integrity_check` 為 `ok`，`PRAGMA foreign_key_check` 為 0 筆。

## 通過門檻

- EC-01、EC-03、EC-04、EC-05、EC-06、EC-07 全部通過，才可視為 ECPay 路徑基本可用。
- 任一案例出現重複請款、provider 與本機狀態不一致或無法追溯時，不得規劃上線。
- Stage 全部通過也不等於可使用正式金流；production 特約商店仍需獨立申請、設定與驗收，且需另外確認正式環境的關帳（每日自動關帳 vs 手動關帳）設定符合本專案「截止結算才請款」的商業規則。

## 已知限制（V1 範圍，尚未涵蓋）

- ECPay webhook 遺失時沒有自動輪詢對帳機制（LINE Pay 有 `reliabilityService.js`，ECPay 目前沒有對應機制）；若懷疑 webhook 遺失，需人工用 ECPay 後台或查詢 API 核對，尚無自動化補救工具。
- 沒有 ECPay 授權有效期檢查（比照 LINE Pay 的 `validateLinePayAuthorizationExpiry`）；21 天關帳寬限期遠大於團購 24 小時週期上限，風險評估為低，但尚未做程式化保護。
- 沒有 ECPay 專屬的手動重新付款流程。

詳細範圍界定見 `docs/AI-current-progress.md`「2026-08-05 新增信用卡（ECPay）付款」。
