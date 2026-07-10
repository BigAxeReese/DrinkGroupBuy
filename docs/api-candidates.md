# API 清單與候選項

最後更新：2026-07-10

## 語言規則

本文件整理目前已實作與未來可能需要的 API。

- API method、path、request / response 欄位名稱保留英文，因為它們會直接影響程式串接。
- 中文只作為用途、完成度與缺口的輔助說明。
- 不要把 API path 或 JSON 欄位翻成中文。
- `Implemented` 代表目前開發版已存在的 API。
- `Candidate` 或缺口說明代表未來可能要補的 API，還不是正式契約。

API JSON 使用 `camelCase`。已實作 routes 只對目前開發 prototype 具權威性；candidate routes 不是正式契約。

## 已實作

### 登入方向更新

| 項目              | 內容                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| 決策日期          | 2026-07-05                                                                                              |
| 正式方向          | 只使用 Firebase Auth + Google Login                                                                     |
| 目前已實作 route  | `POST /api/auth/firebase-session`                                                                       |
| 舊版相容 route    | `POST /api/auth/login` 暫時保留為開發相容功能                                                           |
| Request           | `{ idToken }`，其中 `idToken` 是 Google Login 後取得的 Firebase ID token                                |
| Response          | `{ token, user: { id, loginName, phoneNumber, email, displayName, surname, roles, merchantStores } }`   |
| Backend 責任      | 驗證 Firebase ID token，將 Firebase UID/email 對應到 `users`，並從資料庫解析 roles 與 store permissions |
| 目前 session 行為 | Backend 在 Firebase 驗證後回傳既有 bearer token                                                         |
| 目前對應行為      | 查詢 `users.firebase_uid`；未對應的 Firebase users 回傳 403                                             |
| 遷移備註          | 不要再新增依賴 phone/password 或 email/password login 的 production features                            |

### 開發期角色測試登入

| 項目               | 內容                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------- |
| 用途               | 在 production 維持 Google-only 的前提下，讓開發者測試 customer、merchant、admin 流程         |
| 建議方法           | 使用真實 Firebase Google 測試帳號，並用 `users.firebase_uid` 對應                            |
| 本機替代方法       | Firebase Auth emulator 或 dev-only bypass                                                    |
| 必要防護           | 只能由本機 backend env 如 `AUTH_DEV_MODE=true` 開啟；預設必須停用                            |
| Candidate request  | 僅 local/dev mode 可使用 `{ devFirebaseUid }`，或使用 Firebase emulator 的正常 `{ idToken }` |
| Candidate response | 與正式 Google login 相同：`{ token, user }`                                                  |
| 禁止行為           | Mobile production UI 不得顯示角色選擇，也不得允許任意輸入 Firebase UID                       |
| Audit 備註         | 若實作 dev bypass，需明確記錄使用情況，且不得進入 production deployment config               |

### 健康檢查

| 項目          | 內容                |
| ------------- | ------------------- |
| Method / path | `GET /health`       |
| 用途          | 確認 backend 可用性 |
| Response      | `{ ok, service }`   |

### 查詢團購活動列表

| 項目          | 內容                                                                                                                                                                                                                                                             |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Method / path | `GET /api/group-buy-activities`                                                                                                                                                                                                                                  |
| 用途          | 從 SQLite 回傳 activities、stores 與 promotion tiers                                                                                                                                                                                                             |
| Response      | `{ activities: [{ id, storeId, createdByUserId, title, status, rawStatus, startAt, deadlineAt, pickupStartAt, pickupEndAt, maximumCups, targetCups, currentCups, authorizedCups, participantCount, withdrawalLockMinutes, cancellationReason, store, tiers }] }` |
| 目前缺口      | Mobile 啟動時尚未呼叫此 endpoint                                                                                                                                                                                                                                 |

### 商家建立團購活動

| 項目          | 內容                                                                                                                                                                                          |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Method / path | `POST /api/merchant/group-buy-activities`                                                                                                                                                     |
| 相關畫面      | `MerchantDealCreateScreen`                                                                                                                                                                    |
| Request       | 需要 bearer token。Body: `{ storeId, title, startAt, deadlineAt, pickupStartAt, pickupEndAt, withdrawalLockMinutes?, tiers[], notice?, idempotencyKey? }`                                     |
| Response      | `{ activity }`                                                                                                                                                                                |
| 已實作規則    | 需要 merchant role、驗證 merchant-store access、從登入使用者推導 `createdByUserId`、必填欄位驗證、tier normalization、由最高 tier 推導 maximum cups、transaction、簡單 idempotency、audit log |
| 最終商業規則  | `deadlineAt` 必須在活動發布或開放招募後 24 小時內                                                                                                                                             |
| 尚缺規則      | 強制 24 小時 deadline limit、較完整的日期驗證、較完整的 merchant permission model                                                                                                             |

### 管理員取消團購活動

| 項目          | 內容                                                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Method / path | `DELETE /api/admin/group-buy-activities/:activityId`                                                                                        |
| 相關畫面      | `AdminDashboardScreen`                                                                                                                      |
| Request       | 需要 bearer token。Body: `{ reason? }`                                                                                                      |
| Response      | `{ activity }`                                                                                                                              |
| 已實作規則    | 需要 admin role、從登入使用者推導 `actorUserId`、soft cancellation、status history、audit log、已取消活動重複呼叫時回傳 idempotent response |
| 尚缺規則      | 取消活動時連動 orders/payment handling                                                                                                      |

### 顧客建立訂單

| 項目          | 內容                                                                                                                                                                                                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Method / path | `POST /api/orders`                                                                                                                                                                                                                                                                                      |
| 相關畫面      | `CartScreen`                                                                                                                                                                                                                                                                                            |
| Request       | 需要 bearer token。Body: `{ activityId, fallbackPurchasePreference, items: [{ menuItemId?, itemName, quantity, unitPrice, subtotal, size?, sweetness?, ice?, toppings? }] }`                                                                                                                            |
| Response      | `{ order }`                                                                                                                                                                                                                                                                                             |
| 已實作規則    | 需要 customer role、從登入使用者推導 `customerUserId`、需要既有 backend `group_buy_activities` row、需要 active customer user、在同一個 transaction 寫入 `orders`、`order_items`、`order_item_customizations`、`status_history`、`audit_logs`、阻擋不可加入活動、用 `maximum_cups` 檢查 authorized cups |
| 尚缺規則      | 依目前菜單驗證價格、idempotency key、同時加入時完整 concurrency locking                                                                                                                                                                                                                                 |

### 更新尚未預授權成功的顧客訂單

| 項目          | 內容                                                                                                                                                                                                                                                                                                        |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Method / path | `PATCH /api/orders/:orderId`                                                                                                                                                                                                                                                                                |
| 相關畫面      | `CartScreen`、`PaymentReportScreen`                                                                                                                                                                                                                                                                         |
| Request       | 需要 bearer token。Body: `{ fallbackPurchasePreference, items: [{ menuItemId?, itemName, quantity, unitPrice, subtotal, size?, sweetness?, ice?, toppings? }] }`                                                                                                                                            |
| Response      | `{ order }`                                                                                                                                                                                                                                                                                                 |
| 已實作規則    | 需要 customer role 與 order ownership；只允許 `status = submitted` 且 `payment_status = pending`；替換 `order_items` 與 `order_item_customizations`；重新計算 `total_cups` 與 `original_amount`；用已 authorized/captured 杯數檢查容量；允許新 request 前，將 pending LINE Pay authorizations 標成 `failed` |
| 尚缺規則      | 已授權訂單 reauthorization flow、明確 customer cancel/exit API、revision history table                                                                                                                                                                                                                      |

### 查詢訂單明細

| 項目          | 內容                                                                                                                                                      |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Method / path | `GET /api/orders/:orderId`                                                                                                                                |
| 相關畫面      | `PaymentReportScreen`、`CustomerOrdersScreen`                                                                                                             |
| Request       | 需要 bearer token                                                                                                                                         |
| Response      | `{ order: { id, activityId, customerUserId, status, paymentStatus, authorizationStatus, originalAmount, totalCups, items, latestLinePayAuthorization } }` |
| 已實作規則    | 檢查 owner/admin 權限；回傳 order item snapshots 與最新 LINE Pay authorization，讓 mobile 可在 LINE Pay redirect 後刷新付款狀態                           |
| 尚缺規則      | Merchant visibility checks、多筆 authorizations 的 pagination/history                                                                                     |

### 建立 LINE Pay 預授權

| 項目          | 內容                                                                                                                                                                                                                                                                                                                                                      |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Method / path | `POST /api/payments/line-pay/request`                                                                                                                                                                                                                                                                                                                     |
| 相關畫面      | `PaymentReportScreen`                                                                                                                                                                                                                                                                                                                                     |
| Request       | 需要 bearer token。Body: `{ orderId, amount, currency?, productName?, packageName?, products? }`                                                                                                                                                                                                                                                          |
| Response      | `{ provider, orderId, transactionId, paymentUrl, paymentAccessToken, status }`                                                                                                                                                                                                                                                                            |
| 已實作規則    | Owner/admin access check、Channel ID/Secret 只在 backend、LINE Pay request signature、預設 sandbox base URL、確認 SQLite 有對應訂單、確認 request amount 等於 `orders.original_amount`、latest LINE Pay authorization 為 `pending` 或 `authorized` 時阻擋重複 request、建立 `payment_authorizations.status = pending`、暫時使用 in-memory redirect lookup |
| 尚缺規則      | Durable redirect lookup、idempotency table、webhook verification、mobile callback sync、authorization expiry handling、separated capture support confirmation                                                                                                                                                                                             |

### LINE Pay Confirm Redirect

| 項目          | 內容                                                                                                                                                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Method / path | `GET /api/payments/line-pay/confirm?transactionId=&orderId=`                                                                                                                                                                                                 |
| 相關畫面      | LINE Pay hosted page 會 redirect 到這裡                                                                                                                                                                                                                      |
| Request       | LINE Pay query parameters，加上 confirm URL 裡自行帶入的 `orderId`                                                                                                                                                                                           |
| Response      | HTML result page                                                                                                                                                                                                                                             |
| 已實作規則    | 在 memory 查詢 pending payment、用原價金額/currency 呼叫 LINE Pay confirm、更新 `payment_authorizations.status = authorized`、更新 `orders.payment_status = authorized` 與 `orders.authorization_status = authorized`、記錄 provider event 與 status history |
| 尚缺規則      | 跨 server restart 的 durable redirect lookup、mobile callback sync、處理 provider retries 或 duplicate redirects，不能只依賴簡單 already-authorized behavior                                                                                                 |

### LINE Pay Cancel Redirect

| 項目          | 內容                                                        |
| ------------- | ----------------------------------------------------------- |
| Method / path | `GET /api/payments/line-pay/cancel?transactionId=&orderId=` |
| 相關畫面      | LINE Pay hosted page 會 redirect 到這裡                     |
| Response      | HTML cancellation page                                      |
| 已實作規則    | 可行時清除 in-memory pending payment                        |
| 尚缺規則      | 保存 cancellation event，並導回 app                         |

## 下一步候選 API

### 店家與菜單

| Method / path candidate                                     | 用途               | 主要不確定點                     |
| ----------------------------------------------------------- | ------------------ | -------------------------------- |
| `GET /api/stores/nearby?latitude=&longitude=&radiusMeters=` | 地圖與附近店家資料 | 距離來源與 Google Places 關係    |
| `GET /api/stores/:storeId/menu`                             | 菜單與客製化選項   | 供應狀態與 snapshot/version 規則 |

### 訂單與購物車

| Method / path candidate                             | 用途                             | 主要不確定點                                                      |
| --------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------- |
| `POST /api/group-buy-activities/:activityId/orders` | 訂單建立的替代 nested route      | 目前已實作 route 是 `POST /api/orders`；最終 route shape 尚未決定 |
| `GET /api/customers/me/orders`                      | 顧客進行中與歷史訂單             | Authentication 與 pagination                                      |
| `GET /api/orders/:orderId/history`                  | 訂單與付款狀態歷史               | Owner/merchant/admin visibility                                   |
| `PATCH /api/orders/:orderId/items`                  | 若未來需要，更細的品項修改 route | Reauthorization 與 revision history                               |
| `POST /api/orders/:orderId/cancel`                  | 鎖定前退出團購                   | Deadline race 與 authorized-cup rollback                          |

### 付款

| Method / path candidate                                     | 用途                         | 主要不確定點                                   |
| ----------------------------------------------------------- | ---------------------------- | ---------------------------------------------- |
| `POST /api/orders/:orderId/payment-authorizations`          | 開始 provider authorization  | LINE Pay capability 與 redirect/deep-link flow |
| `POST /api/payment-authorizations/:authorizationId/void`    | 取消未使用授權               | Provider expiry 與 idempotency                 |
| `POST /api/payment-authorizations/:authorizationId/capture` | Partial capture final amount | Provider support 與 retry policy               |
| `POST /api/payments/webhooks/line-pay`                      | 接收 provider events         | Signature verification 與 event ordering       |

### 商家履約

| Method / path candidate                                             | 用途                         | 主要不確定點                     |
| ------------------------------------------------------------------- | ---------------------------- | -------------------------------- |
| `GET /api/merchant/group-buy-activities/:activityId/orders`         | 商家訂單佇列與歷史           | 可曝光的 customer fields         |
| `POST /api/merchant/group-buy-activities/:activityId/accept-orders` | 接受符合條件的 locked orders | Bulk vs per-order acceptance     |
| `POST /api/merchant/orders/:orderId/ready`                          | 標記製作完成並顯示取貨碼     | 目前 UI 將此動作標為「完成訂單」 |
| `POST /api/merchant/orders/:orderId/pickup`                         | 驗證取貨並完成訂單           | Code/QR verification method      |

### 截止結算

| Method / path candidate                        | 用途                                                        | 主要不確定點                                       |
| ---------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------- |
| Internal job/event, not necessarily public API | 鎖定訂單、選擇 tier、capture/void payments、建立 settlement | Scheduler ownership、retries、concurrency/recovery |

## 跨功能需求

- Authentication 與 role authorization。
- Local mobile web CORS 必須允許 `Authorization`，讓 bearer-token API calls 可以通過 browser preflight。
- Input validation 與一致的 error format。
- create、authorization、capture、cancellation、pickup operations 需要 idempotency。
- 更新 orders、cup totals、payment state 與 history 的操作需要 transaction。
- deadline/capacity races 需要 optimistic concurrency 或 locking。
- 最高 promotion tier 是 activity cup capacity。建立訂單與付款 authorization 必須拒絕會超過 `maximumCups` 的 request。
- 敏感狀態轉換需要 status history 與 audit logs。
