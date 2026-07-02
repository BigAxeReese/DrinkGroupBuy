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
| `POST` | `/api/auth/login` | 開發版登入 |
| `GET` | `/health` | 後端健康檢查 |
| `GET` | `/api/group-buy-activities` | 讀取團購活動 |
| `POST` | `/api/merchant/group-buy-activities` | 商家建立團購 |
| `POST` | `/api/orders` | 顧客建立訂單 |
| `GET` | `/api/orders/:orderId` | 讀取訂單明細 |
| `DELETE` | `/api/admin/group-buy-activities/:activityId` | 管理員取消團購 |
| `POST` | `/api/payments/line-pay/request` | 建立 LINE Pay sandbox 授權請求 |
| `GET` | `/api/payments/line-pay/confirm` | LINE Pay redirect confirm |
| `GET` | `/api/payments/line-pay/cancel` | LINE Pay redirect cancel |

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
LINE_PAY_CONFIRM_URL=http://localhost:3000/api/payments/line-pay/confirm
LINE_PAY_CANCEL_URL=http://localhost:3000/api/payments/line-pay/cancel
AUTH_SESSION_SECRET=replace_with_backend_session_secret_at_least_16_chars
```

不要把 `backend/.env` commit 到 GitHub。

## 目前限制

- 管理員登入尚未設定。
- 訂單修改 API 尚未完成。
- LINE Pay capture / void / refund 尚未完成。
- LINE Pay webhook 尚未完成。
- deadline 自動結算與正式排程尚未完成。
- 目前仍是開發資料庫，不是 production migration。
