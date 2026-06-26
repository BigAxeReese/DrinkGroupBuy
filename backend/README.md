# DrinkGroupBuy 後端

這個資料夾是 DrinkGroupBuy 的本機開發後端，目前用 Node.js 內建 HTTP server 和 SQLite 做開發版 API。

README 是給人看的：你、組員、之後接手專案的人都可以照這份文件啟動與測試。

## 目前已完成

- `GET /health`：確認後端是否正常。
- `GET /api/group-buy-activities`：讀取資料庫中的團購活動。
- `POST /api/merchant/group-buy-activities`：商家建立團購活動。
- `POST /api/orders`：顧客送出購物車並建立訂單。
- `DELETE /api/admin/group-buy-activities/:activityId`：管理員取消團購活動。
- `POST /api/payments/line-pay/request`：建立 LINE Pay sandbox 付款連結。
- `GET /api/payments/line-pay/confirm`：LINE Pay 回傳後確認授權成功。
- `GET /api/payments/line-pay/cancel`：LINE Pay 取消付款回傳。

## 尚未完成

- 真實帳號登入與權限檢查。
- 訂單修改 API。
- LINE Pay capture / void / refund。
- LINE Pay webhook。
- 團購截止後自動結算。
- 正式 production migration。
- 自動化測試。

## 啟動方式

從專案根目錄執行：

```powershell
npm run db:init
npm run db:seed
npm run backend:start
```

後端預設網址：

```text
http://localhost:3000
```

健康檢查：

```powershell
Invoke-RestMethod http://localhost:3000/health
```

## LINE Pay 設定

LINE Pay 的商店密鑰只能放在後端本機設定檔：

```text
backend/.env
```

不要放在：

```text
mobile/.env
```

因為 mobile 的設定會進到前端 App，不能保存真正機密。

`backend/.env` 範例：

```env
LINE_PAY_ENV=sandbox
LINE_PAY_API_BASE_URL=https://sandbox-api-pay.line.me
LINE_PAY_MERCHANT_ID=你的商店ID
LINE_PAY_CHANNEL_ID=你的通路ID
LINE_PAY_CHANNEL_SECRET=你的通路密鑰
LINE_PAY_CURRENCY=TWD
LINE_PAY_CONFIRM_URL=http://localhost:3000/api/payments/line-pay/confirm
LINE_PAY_CANCEL_URL=http://localhost:3000/api/payments/line-pay/cancel
```

目前 LINE Pay 流程：

1. 顧客送出購物車。
2. 後端建立 `orders`。
3. App 進入付款頁。
4. App 呼叫 `POST /api/payments/line-pay/request`。
5. 後端建立 `payment_authorizations.status = pending`。
6. 使用者到 LINE Pay 頁面完成授權。
7. LINE Pay 回到 `/api/payments/line-pay/confirm`。
8. 後端把付款改成 `authorized`。

目前先跑通 LINE Pay sandbox request / confirm。這組通路目前拒絕 `capture:false` 參數，所以 separated authorization / partial capture 需要後續再確認 LINE Pay 帳戶或產品設定。

## 建立團購活動範例

```powershell
$body = @{
  storeId = "store-001"
  createdByUserId = "user-merchant-001"
  title = "滿 20 杯折 200"
  startAt = "2026-06-05T14:00:00+08:00"
  deadlineAt = "2026-06-05T15:30:00+08:00"
  pickupStartAt = "2026-06-05T16:00:00+08:00"
  pickupEndAt = "2026-06-05T16:30:00+08:00"
  tiers = @(
    @{ targetCups = 20; discountAmount = 200 },
    @{ targetCups = 30; discountAmount = 450 }
  )
} | ConvertTo-Json -Depth 5

Invoke-RestMethod `
  -Uri http://localhost:3000/api/merchant/group-buy-activities `
  -Method Post `
  -ContentType "application/json" `
  -Body $body
```

## 建立訂單範例

`activityId` 必須是資料庫中已存在的團購活動 ID。

```powershell
$body = @{
  activityId = "activity-id-from-backend"
  customerUserId = "user-customer-yinji"
  fallbackPurchasePreference = "accept_original_price"
  items = @(
    @{
      menuItemId = "drink-002"
      itemName = "四季春青茶"
      quantity = 1
      unitPrice = 40
      subtotal = 40
      size = "L"
      sweetness = "微糖"
      ice = "少冰"
      toppings = @("不加料")
    }
  )
} | ConvertTo-Json -Depth 5

Invoke-RestMethod `
  -Uri http://localhost:3000/api/orders `
  -Method Post `
  -ContentType "application/json" `
  -Body $body
```

## 管理員取消團購範例

這是軟刪除，不會真的刪除資料。它會把團購狀態改成 `cancelled`，並寫入狀態歷史和 audit log。

```powershell
$body = @{
  actorUserId = "user-admin-001"
  reason = "Admin cancelled from prototype dashboard"
} | ConvertTo-Json

Invoke-RestMethod `
  -Uri http://localhost:3000/api/admin/group-buy-activities/activity-id `
  -Method Delete `
  -ContentType "application/json" `
  -Body $body
```

## 注意事項

- 不要把 `backend/.env` 上傳 GitHub。
- 目前是開發版，不是正式後端。
- LINE Pay 目前建議只用 sandbox 測試。
- 如果修改 backend 程式，記得重啟 `npm run backend:start`。
