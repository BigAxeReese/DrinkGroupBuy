# DrinkGroupBuy Backend

這份 README 是給開發者看的，用來說明目前本機後端、開發資料庫與測試登入資料。

## 啟動方式

在專案根目錄執行：

```powershell
npm run db:init
npm run db:seed
npm run backend:start
```

後端預設位址：

```text
http://localhost:3000
```

健康檢查：

```powershell
Invoke-RestMethod http://localhost:3000/health
```

## 目前 API

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/firebase-session` | Firebase ID token login and backend role resolution |
| `POST` | `/api/auth/login` | 開發版登入 |
| `GET` | `/health` | 後端健康檢查 |
| `GET` | `/api/group-buy-activities` | 讀取團購活動 |
| `POST` | `/api/merchant/group-buy-activities` | 商家建立團購 |
| `POST` | `/api/orders` | 顧客建立訂單 |
| `POST` | `/api/orders/:orderId/revisions` | 建立已授權訂單的修改版本 |
| `GET` | `/api/orders/:orderId` | 讀取訂單明細 |
| `DELETE` | `/api/admin/group-buy-activities/:activityId` | 管理員取消團購 |
| `POST` | `/api/admin/group-buy-activities/:activityId/settle` | 管理員手動觸發單一團購結算 |
| `POST` | `/api/payments/line-pay/request` | 建立 LINE Pay sandbox 授權請求 |
| `GET` | `/api/payments/line-pay/confirm` | LINE Pay redirect confirm |
| `GET` | `/api/payments/line-pay/cancel` | LINE Pay redirect cancel |

## Firebase Google Login

`POST /api/auth/firebase-session` is the primary auth route. The mobile app sends:

```json
{ "idToken": "firebase_id_token_from_google_login" }
```

The backend verifies the token with Firebase Admin SDK, looks up `users.firebase_uid`, resolves `user_roles` and `merchant_users`, then returns the existing bearer token response shape.

Required local backend env:

```env
FIREBASE_PROJECT_ID=your_firebase_project_id
GOOGLE_APPLICATION_CREDENTIALS=C:\local\secrets\firebase-service-account.json
AUTH_SESSION_SECRET=replace_with_backend_session_secret_at_least_16_chars
```

Do not commit the Firebase service account JSON. Each Firebase Google test account UID must be stored in `users.firebase_uid`.

## 開發測試登入

顧客使用「手機號碼 / 密碼」登入。

| 角色 | 手機號碼 / 密碼 |
| --- | --- |
| 顧客 A | `0911000001` / `customer1` |
| 顧客 B | `0911000002` / `customer2` |
| 顧客 C | `0911000003` / `customer3` |
| 顧客 D | `0911000004` / `customer4` |

商家使用「Email / 密碼」登入。

| 店家 | Email / 密碼 |
| --- | --- |
| 青山手作茶 中科店 | `store1@example.com` / `merchant1` |
| 晨露鮮奶茶 一中店 | `store2@example.com` / `merchant2` |
| 午後水果茶 雙十店 | `store3@example.com` / `merchant3` |
| 一中黑糖研究所 | `store4@example.com` / `merchant4` |
| 北區茶作館 | `store5@example.com` / `merchant5` |
| 柳川果茶室 | `store6@example.com` / `merchant6` |
| 雙十鮮乳坊 | `store7@example.com` / `merchant7` |

管理員使用「Email / 密碼」登入。

| 角色 | Email / 密碼 |
| --- | --- |
| 管理員 | `admin@example.com` / `admin1` |

登入成功後會取得 bearer token。建立訂單、查訂單、商家開團、LINE Pay request 都需要帶 token。

## LINE Pay 設定

LINE Pay sandbox 憑證放在：

```text
backend/.env
```

範例：

```env
LINE_PAY_ENV=sandbox
LINE_PAY_API_BASE_URL=https://sandbox-api-pay.line.me
LINE_PAY_MERCHANT_ID=your_merchant_id
LINE_PAY_CHANNEL_ID=your_channel_id
LINE_PAY_CHANNEL_SECRET=your_channel_secret
LINE_PAY_CURRENCY=TWD
LINE_PAY_CAPTURE_SEPARATED=false
LINE_PAY_AUTHORIZATION_SETTLEMENT_BUFFER_MINUTES=30
LINE_PAY_CONFIRM_URL=http://localhost:3000/api/payments/line-pay/confirm
LINE_PAY_CANCEL_URL=http://localhost:3000/api/payments/line-pay/cancel
AUTH_SESSION_SECRET=replace_with_backend_session_secret_at_least_16_chars
```

LINE Pay 台灣 channel 預設是自動請款。只有在 LINE Pay 已替該 channel 開通分離式請款後，才可把 `LINE_PAY_CAPTURE_SEPARATED=true`。未開啟時，後端會阻擋真 LINE Pay request，避免自動請款被誤當預授權。

分離式請款開啟後，後端會送出 `options.payment.capture=false`。Confirm 成功時若 LINE Pay 回傳 `authorizationExpireDate`，系統會保存到 `payment_authorizations.expires_at`，且到期時間必須晚於團購截止時間加 `LINE_PAY_AUTHORIZATION_SETTLEMENT_BUFFER_MINUTES`。

不要把 `backend/.env` commit 到 GitHub。

## 付款模組

LINE Pay 相關程式目前集中在：

| 檔案 | 用途 |
| --- | --- |
| `backend/payments/linePayClient.js` | 簽章並呼叫 LINE Pay API |
| `backend/payments/linePayService.js` | 串接訂單檢查、授權建立、confirm、cancel、void 與 capture |
| `backend/payments/linePayPendingStore.js` | LINE Pay redirect 前後的記憶體快取；實際 confirm/cancel 以 DB 查找為主 |
| `backend/payments/settlementService.js` | 單一團購結算流程，依結果批次 capture / void |
| `backend/linePayClient.js` | 舊路徑相容匯出 |

商家建立團購時，`deadlineAt` 必須晚於 `startAt`，且不得超過 `startAt` 後 24 小時。`pickupStartAt` 至少要晚於 `deadlineAt` 15 分鐘，`pickupEndAt` 必須晚於 `pickupStartAt`。

本機可用 smoke script 驗證截止結算：

```powershell
npm run settlement:smoke
```

這個指令會備份並還原 `database/drink-group-buy-dev.sqlite`，中途使用乾淨 schema 建立 `mock_line_pay` 預授權資料，確認達標時 capture、未達標時依顧客選項 capture 或 void，驗證 scheduler 會抓到已截止團購，也會驗證已授權訂單 revision 在新授權成功後才套用並 void 舊授權。它不會呼叫外部 LINE Pay API，也不是正式付款流程。

後端啟動時會啟動 deadline settlement scheduler。預設每 60 秒掃描已截止、尚未結算的團購，並呼叫同一套 settlement service。相關設定：

```env
SETTLEMENT_SCHEDULER_ENABLED=true
SETTLEMENT_SCHEDULER_INTERVAL_MS=60000
SETTLEMENT_SCHEDULER_BATCH_SIZE=20
SETTLEMENT_SCHEDULER_ALLOW_PRODUCTION=false
```

若 `LINE_PAY_ENV=production`，scheduler 會被 production guard 擋下；必須明確設定 `SETTLEMENT_SCHEDULER_ALLOW_PRODUCTION=true` 才會啟動，避免意外真實請款。

## 目前限制

- 管理員登入尚未設定。
- 已授權訂單修改 API 與 mobile 重新預授權第一版已完成；仍需補 provider 狀態查詢、自動重試 queue 與更完整的錯誤提示。
- LINE Pay refund 尚未完成。
- LINE Pay webhook 第一版不列為必要入口；付款同步先以 confirm/cancel redirect、資料庫狀態與後續 provider 狀態查詢為主。
- deadline 自動結算已先以單一 backend process interval 實作；失敗處理規則已決定以自動重試為主，不做人工處理介面；跨執行個體 locking、重試佇列與告警尚未完成。
- 目前仍是開發資料庫，不是 production migration。
