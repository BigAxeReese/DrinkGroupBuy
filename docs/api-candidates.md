# API 清單與候選項

最後更新：2026-07-20

## 語言規則

本文件整理目前已實作與未來可能需要的 API。

- API method、path、request / response 欄位名稱保留英文，因為它們會直接影響程式串接。
- 中文只作為用途、完成度與缺口的輔助說明。
- 不要把 API path 或 JSON 欄位翻成中文。
- `Implemented` 代表目前開發版已存在的 API。
- `Candidate` 或缺口說明代表未來可能要補的 API，還不是正式契約。

API JSON 使用 `camelCase`。已實作 routes 只對目前開發 prototype 具權威性；candidate routes 不是正式契約。`/api/admin/...` routes 目前屬於開發或後端補救工具，不屬於第一階段正式 App 使用者流程。

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
| 用途               | 在 production 維持 Google-only 的前提下，讓開發者測試 customer、merchant 流程，以及必要的 dev/admin 後端補救權限 |
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
| 相關畫面      | `MerchantGroupBuyActivityCreateScreen`                                                                                                                                                        |
| Request       | 需要 bearer token。Body: `{ storeId, title, startAt, deadlineAt, pickupStartAt, pickupEndAt, withdrawalLockMinutes?, tiers[], notice?, idempotencyKey? }`                                     |
| Response      | `{ activity }`                                                                                                                                                                                |
| 已實作規則    | 需要 merchant role、驗證 merchant-store access、從登入使用者推導 `createdByUserId`、必填欄位驗證、`deadlineAt` 不可超過 `startAt` 後 24 小時、`pickupStartAt` 至少晚於 `deadlineAt` 30 分鐘、`pickupEndAt` 必須晚於 `pickupStartAt`、tier normalization、由最高 tier 推導 maximum cups、transaction、簡單 idempotency、audit log |
| 最終商業規則  | `deadlineAt` 必須在活動發布或開放招募後 24 小時內；取餐時間由店家開團時設定，顧客加入前可見；取餐開始至少晚於截止時間 30 分鐘，表單預設為截止後 30 分鐘 |
| 尚缺規則      | 較完整的 merchant permission model                                                                                                                                                            |

### 開發 / 補救用：後端取消團購活動

| 項目          | 內容                                                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Method / path | `DELETE /api/admin/group-buy-activities/:activityId`                                                                                        |
| 相關畫面      | 目前無正式 App 畫面；不列入第一階段最終產品使用者流程                                                                                      |
| Request       | 需要後端補救權限；目前 route 使用 admin bearer token。Body: `{ reason? }`                                                                   |
| Response      | `{ activity }`                                                                                                                              |
| 已實作規則    | 目前以補救用 admin role 驗證、從登入使用者推導 `actorUserId`、soft cancellation、status history、audit log、已取消活動重複呼叫時回傳 idempotent response |
| 尚缺規則      | 取消活動時連動 orders/payment handling                                                                                                      |

### 開發 / 補救用：手動結算團購活動

| 項目          | 內容                                                                                                                                                                                                                                                      |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Method / path | `POST /api/admin/group-buy-activities/:activityId/settle`                                                                                                                                                                                                 |
| 相關畫面      | 目前無正式畫面；本機開發與後端補救測試用                                                                                                                                                                                                                 |
| Request       | 需要後端補救權限；目前 route 使用 admin bearer token。Body: `{ force?: boolean }`；`force` 只用於本機測試尚未截止活動                                                                                                                                     |
| Response      | 完成時回傳 `{ plan, results, capturedOrderCount, voidedOrderCount, failedOrderCount, settlement, activity }`；等待下次請款時以 `202` 回傳 `{ error: "settlement_retry_pending", pendingRetries }`；非請款流程錯誤回傳 `settlement_payment_failures` |
| 已實作規則    | 目前以補救用 admin role 驗證、預設要求活動已過截止時間、鎖定 authorized 訂單、計算有效授權杯數與適用優惠級距、依顧客 fallback preference 執行 capture 或 void、可重試請款每 30 秒最多三次、重試前查 provider 狀態、完成後建立 settlement 與稽核紀錄 |
| 本機驗證      | `npm run settlement:smoke` 使用 `mock_line_pay` 驗證達標 capture、未達標 capture/void、排程、訂單 revision、截止後拒絕預授權、30 秒重試與三次上限、手動重新付款與 refund idempotency，測完還原 SQLite |
| 尚缺實作      | 跨執行個體 idempotency / locking、持久化工作佇列與失敗告警                                                                                                                                                                                                |

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
| 相關畫面      | `CartScreen`、`PaymentAuthorizationScreen`                                                                                                                                                                                                                                                                 |
| Request       | 需要 bearer token。Body: `{ fallbackPurchasePreference, items: [{ menuItemId?, itemName, quantity, unitPrice, subtotal, size?, sweetness?, ice?, toppings? }] }`                                                                                                                                            |
| Response      | `{ order }`                                                                                                                                                                                                                                                                                                 |
| 已實作規則    | 需要 customer role 與 order ownership；只允許 `status = submitted` 且 `payment_status = pending`；替換 `order_items` 與 `order_item_customizations`；重新計算 `total_cups` 與 `original_amount`；用已 authorized/captured 杯數檢查容量；允許新 request 前，將 pending LINE Pay authorizations 標成 `failed` |
| 尚缺規則      | 明確 customer cancel/exit API、revision 失敗 / 容量不足 / void 舊授權失敗時的 mobile 錯誤提示                                                                                                                                                                                                                |

### 建立已授權訂單修改版本

| 項目          | 內容                                                                                                                                                                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Method / path | `POST /api/orders/:orderId/revisions`                                                                                                                                                                                                    |
| 相關畫面      | `CustomerOrdersScreen`、`CartScreen`、`PaymentAuthorizationScreen`；mobile 第一版已串接                                                                                                                                                    |
| Request       | 需要 customer bearer token。Body: `{ fallbackPurchasePreference, items: [{ menuItemId?, itemName, quantity, unitPrice, subtotal, size?, sweetness?, ice?, toppings? }] }`                                                                |
| Response      | `{ revision }`；revision 包含 `id`, `orderId`, `status`, `totalCups`, `originalAmount`, `items`                                                                                                                                          |
| 已實作規則    | 只允許 owner 修改 `status = submitted` 且 `payment_status = authorized` 的訂單；截止前 30 分鐘內不可建立 revision；檢查活動可加入與容量上限；建立 `order_revisions` 與 revision item snapshots；不直接修改原訂單，也不取消舊預授權 |
| 後續付款      | 使用 `POST /api/payments/line-pay/request` 並帶入 `{ orderId, orderRevisionId, amount }` 對 revision 金額重新預授權                                                                                                                     |
| 尚缺規則      | revision 取消 API、完整 revision 歷史查詢 API、失敗狀態的 mobile 告知與重試入口                                                                                                                                                            |

### 查詢訂單明細

| 項目          | 內容                                                                                                                                                      |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Method / path | `GET /api/orders/:orderId`                                                                                                                                |
| 相關畫面      | `PaymentAuthorizationScreen`、`CustomerOrdersScreen`                                                                                                      |
| Request       | 需要 bearer token                                                                                                                                         |
| Response      | `{ order: { id, activityId, customerUserId, status, paymentStatus, authorizationStatus, originalAmount, totalCups, items, latestLinePayAuthorization, pendingRevision } }` |
| 已實作規則    | 檢查訂單本人權限；開發補救權限另由後端限制。回傳 order item snapshots、最新 LINE Pay authorization 與待重新預授權 revision，讓 mobile 可在 LINE Pay redirect 後刷新付款狀態 |
| 尚缺規則      | Merchant visibility checks、多筆 authorizations 的 pagination/history                                                                                     |

### 建立 LINE Pay 預授權

| 項目          | 內容                                                                                                                                                                                                                                                                                                                                                      |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Method / path | `POST /api/payments/line-pay/request`                                                                                                                                                                                                                                                                                                                     |
| 相關畫面      | `PaymentAuthorizationScreen`                                                                                                                                                                                                                                                                                                                               |
| Request       | 需要 bearer token。Body: `{ orderId, orderRevisionId?, amount, currency?, productName?, packageName?, products? }`                                                                                                                                                                                                                                          |
| Response      | `{ provider, orderId, orderRevisionId?, transactionId, paymentUrl, paymentAccessToken, status }`                                                                                                                                                                                                                                                           |
| 已實作規則    | Owner access check、Channel ID/Secret 只在 backend、LINE Pay request signature、預設 sandbox base URL、確認 SQLite 有對應訂單或 pending revision、確認 request amount 等於訂單或 revision 原價金額、未設定 `LINE_PAY_CAPTURE_SEPARATED=true` 時阻擋真 LINE Pay request、latest LINE Pay authorization 為 `pending` 或 `authorized` 時阻擋重複 request、建立 `payment_authorizations.status = pending`、redirect 以 DB 查找為主且 memory cache 只作輔助 |
| 尚缺規則      | Idempotency table、mobile callback sync、provider 狀態查詢、自動重試 queue                                                                                                                                                                                                                     |

### LINE Pay 手動重新付款

| 項目          | 內容 |
| ------------- | ---- |
| Method / path | `POST /api/payments/line-pay/repay` |
| 相關畫面      | `CustomerOrdersScreen`、`PaymentAuthorizationScreen` |
| Request       | `{ orderId, productName?, packageName? }`；金額由後端結算結果決定，不接受前端指定 |
| Response      | LINE Pay 直接付款網址、交易編號、最終付款金額與付款截止時間 |
| 已實作規則    | 僅限訂單本人；自動請款已終止且付款狀態為 failed；只允許取餐開始前 15 分鐘以前建立；先查原交易避免重複扣款；仍為 authorized 時先 void；以 `direct_repayment` 建立直接付款；confirm 時再次檢查期限；成功後更新訂單為 captured 並加入製作流程；pending 與 captured 狀態防止重複付款 |
| 尚缺實作      | 跨多個 backend process 的分散式鎖、正式 sandbox 人工端對端測試、付款異常告警 |

### LINE Pay 退款

| 項目          | 內容 |
| ------------- | ---- |
| Method / path | `POST /api/payments/line-pay/refund` |
| 相關畫面      | 目前無正式畫面；開發 / 後端補救測試用 |
| Request       | 需要後端補救權限；目前 route 使用 admin bearer token。Body: `{ orderId?, captureId?, providerTransactionId?, refundAmount?, reason?, idempotencyKey?, provider? }`；正式使用預設 `provider = line_pay`，`mock_line_pay` 只供非 production smoke test |
| Response      | `{ refund, capture, order, status, fullyRefunded, totalRefundedAmount, remainingRefundableAmount, providerTransactionId }` |
| 已實作規則    | 只允許已 capture 的付款退款；未指定 `refundAmount` 時退剩餘全額；退款金額不可超過剩餘可退金額；用 `payment_refunds.idempotency_key` 防止重複退款；同一 key 已退款時回傳 idempotent 結果；成功寫入 `payment_refunds`、provider event 與 audit log；全額退款後 `orders.payment_status = refunded` |
| 尚缺實作      | 正式退款操作 UI、退款失敗重試 queue、provider 狀態 reconciliation、正式 sandbox 人工端對端測試 |

### LINE Pay Confirm Redirect

| 項目          | 內容                                                                                                                                                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Method / path | `GET /api/payments/line-pay/confirm?transactionId=&orderId=`                                                                                                                                                                                                 |
| 相關畫面      | LINE Pay hosted page 會 redirect 到這裡                                                                                                                                                                                                                      |
| Request       | LINE Pay query parameters，加上 confirm URL 裡自行帶入的 `orderId`                                                                                                                                                                                           |
| Response      | HTML result page                                                                                                                                                                                                                                             |
| 已實作規則    | 以 DB 查找 pending authorization，memory cache 只作輔助；用原價金額/currency 呼叫 LINE Pay confirm；寫入 `authorized` 前用交易重新檢查是否已截止、容量與 `authorizationExpireDate`；一般訂單成功時更新 `payment_authorizations` 與 `orders`；revision 授權成功時先套用 `order_revisions` 再嘗試 void 舊授權；截止後 confirm、容量不足或授權期限不足時標記 authorization / revision failed，並自動嘗試 LINE Pay void；記錄 provider event、status history 與 audit log |
| 尚缺實作      | Mobile callback sync、provider 狀態查詢、自動重試 queue、void 失敗重試與告警、duplicate redirect 更完整的 idempotency table                                                                                                                                     |

### LINE Pay Cancel Redirect

| 項目          | 內容                                                        |
| ------------- | ----------------------------------------------------------- |
| Method / path | `GET /api/payments/line-pay/cancel?transactionId=&orderId=` |
| 相關畫面      | LINE Pay hosted page 會 redirect 到這裡                     |
| Response      | HTML cancellation page                                      |
| 已實作規則    | 以 DB 查找 pending authorization，將 pending authorization 標記為 `failed`；若屬於 order revision，revision 也會標記為 `failed`；寫入 provider event、status history 與 audit log，並清除 memory cache |
| 尚缺規則      | 導回 app、duplicate cancel redirect 的完整 idempotency table                                                                 |

## 下一步候選 API

優先順序：

| 優先級 | 範圍              | 原因                                                                 |
| ------ | ----------------- | -------------------------------------------------------------------- |
| High   | 顧客訂單列表 / 退出團購 | Mobile 仍大量依賴 local state，且退出會影響杯數、authorization 與 deadline race |
| High   | 商家履約 / pickup | 取貨碼、可取餐、核銷與逾期未取是已請款後的核心履約流程               |
| High   | provider status / reconciliation | LINE Pay redirect 遺失、重試與重複扣款防護需要後端可查 provider 狀態 |
| Medium | provider-neutral payment routes | 目前先以 LINE Pay 專用 route 前進，正式 API shape 後續再收斂       |
| Medium | stores/menu APIs  | 可逐步把 mobile mocks 移到 backend 權威資料                         |

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
| `GET /api/orders/:orderId/history`                  | 訂單與付款狀態歷史               | Owner/merchant visibility；dev/admin 補救權限另定                 |
| `PATCH /api/orders/:orderId/items`                  | 若未來需要，更細的品項修改 route | 目前已有 `POST /api/orders/:orderId/revisions` 作為已授權修改入口 |
| `POST /api/orders/:orderId/cancel`                  | 鎖定前退出團購                   | Deadline race 與 authorized-cup rollback                          |

### 付款

| Method / path candidate                                     | 用途                         | 主要不確定點                                   |
| ----------------------------------------------------------- | ---------------------------- | ---------------------------------------------- |
| `POST /api/orders/:orderId/payment-authorizations`          | 開始 provider authorization  | LINE Pay capability 與 redirect/deep-link flow |
| `POST /api/payment-authorizations/:authorizationId/void`    | 取消未使用授權               | Provider expiry 與 idempotency                 |
| `POST /api/payment-authorizations/:authorizationId/capture` | Partial capture final amount | Backend payment module 已有內部 capture service 與單一 process 重試控制；尚未開公開 API |
| `POST /api/payment-captures/:captureId/refunds`             | Provider-neutral refund      | 目前已先實作 LINE Pay 專用開發 / 後端補救 route；正式 API shape 尚未決定 |
| `GET /api/payments/line-pay/status/:transactionId`          | 查詢 provider 狀態並對帳     | 正式上線前用於重試、redirect 遺失與付款狀態 reconciliation |

### 商家履約

| Method / path candidate                                             | 用途                         | 主要不確定點                     |
| ------------------------------------------------------------------- | ---------------------------- | -------------------------------- |
| `GET /api/merchant/group-buy-activities/:activityId/orders`         | 商家訂單佇列與歷史           | 可曝光的 customer fields         |
| `POST /api/merchant/orders/:orderId/ready`                          | 標記製作完成並顯示取貨碼     | 目前 UI 將此動作標為「完成訂單」 |
| `POST /api/merchant/orders/:orderId/pickup`                         | 驗證取貨並完成訂單           | 需拒絕已過期憑證；Code/QR verification method |
| Internal pickup expiration job                                      | 將逾期未取訂單移至歷史訂單   | 需依取餐開始時間、店家營業結束時間與 24 小時營業規則計算 expiresAt |

備註：最新產品規則不需要店家逐筆接受訂單，因此不再規劃店家接單 API。商家端應改以「標記可取餐」與「核銷取貨」作為履約操作。

### 截止結算

| Method / path candidate                        | 用途                                                        | 主要不確定點                                       |
| ---------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------- |
| Internal backend interval job                  | 自動找出已截止團購並觸發 settlement                         | 單一 process 每 30 秒執行且請款最多三次；仍缺跨執行個體 locking、持久化 queue 與 recovery |

## 跨功能需求

- Authentication 與 role authorization。
- Local mobile web CORS 必須允許 `Authorization`，讓 bearer-token API calls 可以通過 browser preflight。
- Input validation 與一致的 error format。
- create、authorization、capture、cancellation、pickup operations 需要 idempotency。
- 更新 orders、cup totals、payment state 與 history 的操作需要 transaction。
- deadline/capacity races 需要 optimistic concurrency 或 locking。
- 最高 promotion tier 是 activity cup capacity。建立訂單與付款 authorization 必須拒絕會超過 `maximumCups` 的 request。
- 敏感狀態轉換需要 status history 與 audit logs。
- 取貨憑證有效期限必須在顧客付款前清楚顯示；逾期未取不自動退款，但店家不得交付有食品安全疑慮的飲品。
