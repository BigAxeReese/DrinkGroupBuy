# API 清單與候選項

最後更新：2026-08-11

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
| 舊版相容 route    | `POST /api/auth/login` 暫時保留為開發相容功能；僅在非 production 且 `AUTH_DEV_MODE=true` 時存在          |
| Request           | `{ idToken }`，其中 `idToken` 是 Google Login 後取得的 Firebase ID token                                |
| Response          | `{ token, user: { id, loginName, phoneNumber, email, displayName, surname, roles, merchantStores } }`   |
| Backend 責任      | 驗證 Firebase ID token，將 Firebase UID/email 對應到 `users`，並從資料庫解析 roles 與 store permissions |
| 目前 session 行為 | Backend 在 Firebase 驗證後回傳既有 bearer token                                                         |
| 目前對應行為      | 查詢 `users.firebase_uid`；未對應的 Firebase users 回傳 403                                             |
| 可切換資料來源    | `AUTH_PROFILE_READ_RUNTIME=sqlite|postgres`；預設 `sqlite`，Firebase session、dev auth 與 bearer token 後續角色／門市權限解析共用同一 repository |
| PostgreSQL 差異   | PostgreSQL v1 以 `merchant_users.store_id` 作授權邊界且不分內部權限等級；`merchantStores[].permissionLevel` 保留但回傳 `null` |
| 遷移備註          | 不要再新增依賴 phone/password 或 email/password login 的 production features                            |

### 開發期角色測試登入

| 項目               | 內容                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------- |
| 用途               | 在 production 維持 Google-only 的前提下，讓開發者測試 customer、merchant 流程，以及必要的 dev/admin 後端補救權限 |
| 建議方法           | 使用真實 Firebase Google 測試帳號，並用 `users.firebase_uid` 對應                            |
| 本機替代方法       | 已實作 dev-only 身份切換器；mobile 只在 `EXPO_PUBLIC_AUTH_MODE=dev` 時顯示下拉選單              |
| 必要防護           | 只能由本機 backend env 如 `AUTH_DEV_MODE=true` 開啟；預設必須停用                            |
| 已實作 route       | `GET /api/auth/dev-users`、`POST /api/auth/dev-session`                                      |
| Request            | `GET /api/auth/dev-users` 無 body；`POST /api/auth/dev-session` body: `{ userId }`            |
| Response           | `GET` 回傳 `{ users }`；`POST` 與正式 Google login 相同：`{ token, user }`                    |
| 禁止行為           | Mobile production UI 不得顯示身份切換下拉選單，也不得允許任意輸入 Firebase UID               |
| Audit 備註         | dev-only 身份切換不得進入 production deployment config；正式身份仍以 Firebase UID 對應為準    |

### 健康檢查

| 項目          | 內容                |
| ------------- | ------------------- |
| Method / path | `GET /health`       |
| 用途          | 確認 backend 可用性 |
| Response      | `{ ok, service }`   |

### 查詢公開店家列表

| 項目          | 內容 |
| ------------- | ---- |
| Method / path | `GET /api/stores` |
| 用途          | 提供地圖顯示 SQLite 中全部營業中且有座標的店家 |
| Response      | `{ stores: [{ id, name, address, phone, businessStatus, latitude, longitude }] }` |
| 公開資料限制  | 只回傳店名、地址、電話、營業狀態與座標等公開欄位；不回傳帳號、角色、Firebase UID 或商家權限 |
| Mobile 串接   | App 選定角色與回到前景時同步，並與 `GET /api/group-buy-activities` 合併可加入活動狀態；失敗顯示「店家資料載入失敗」，不回退至 mock |
| 第一版範圍    | 不作距離篩選；目前開發 SQLite 回傳 6 間營業店家。暫停營業或缺少座標的店家不回傳 |

### 查詢團購活動列表

| 項目          | 內容                                                                                                                                                                                                                                                             |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Method / path | `GET /api/group-buy-activities`                                                                                                                                                                                                                                  |
| 用途          | 從目前選定的 SQLite／PostgreSQL activity read runtime 回傳 activities、stores 與 promotion tiers |
| Response      | `{ activities: [{ id, storeId, createdByUserId, title, status, rawStatus, startAt, deadlineAt, pickupStartAt, pickupEndAt, maximumCups, targetCups, currentCups, authorizedCups, participantCount, currentTierId, currentTierTargetCups, currentTierDiscountAmount, estimatedDiscountPerCup, estimatedAllocatedDiscountAmount, estimatedUndistributedDiscountAmount, nextTierTargetCups, cupsToNextTier, withdrawalLockMinutes, cancellationReason, store: { name, address, phone, latitude, longitude }, tiers }] }` |
| Mobile 串接   | App 選定角色與回到前景時同步；顧客首頁與活動詳情使用活動回傳的 store，地圖則把活動狀態合併至 `GET /api/stores` 的公開店家列表 |
| 已實作折扣欄位 | 已回傳目前達成級距、`estimatedDiscountPerCup = floor(tierTotalDiscount / authorizedCups)`、預估分配總額、未分配尾差與下一級距差杯數；Mobile 仍須把截止前數值標示為預估 |

### 商家建立團購活動

| 項目          | 內容                                                                                                                                                                                          |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Method / path | `POST /api/merchant/group-buy-activities`                                                                                                                                                     |
| 相關畫面      | `MerchantGroupBuyActivityCreateScreen`                                                                                                                                                        |
| Request       | 需要 bearer token。Body: `{ storeId, title, startAt, deadlineAt, pickupStartAt, pickupEndAt, withdrawalLockMinutes?, tiers[], notice?, idempotencyKey? }`                                     |
| Response      | `{ activity }`                                                                                                                                                                                |
| 已實作規則    | 需要 merchant role、驗證 merchant-store access、從登入使用者推導 `createdByUserId`、必填欄位驗證、`deadlineAt` 不可超過 `startAt` 後 24 小時、`pickupStartAt` 至少晚於 `deadlineAt` 30 分鐘、`pickupEndAt` 必須晚於 `pickupStartAt`、tier normalization、由最高 tier 推導 maximum cups、transaction、idempotency、status history、audit log |
| 最終商業規則  | `deadlineAt` 必須在活動發布或開放招募後 24 小時內；取餐時間由店家開團時設定，顧客加入前可見；取餐開始至少晚於截止時間 30 分鐘，表單預設為截止後 30 分鐘 |
| 已實作驗證    | SQLite 與 PostgreSQL 都會逐級驗證可達杯數區間；每杯至少折 1 元，且不得高於店內最低可售單杯權威金額 |
| 可切換資料來源 | `GROUP_BUY_ACTIVITY_WRITE_RUNTIME=sqlite|postgres`；預設 `sqlite`，不雙寫 |
| PostgreSQL transaction | 先 `FOR UPDATE` 鎖定 store row，再驗證 merchant 授權並鎖菜單資料；同 transaction 寫入 activity、tiers、notice、初始 status history 與 audit log |
| PostgreSQL 限制 | Backend 要求 auth、公開菜單、活動讀取／寫入與 `MERCHANT_MENU_RUNTIME` 同步使用 PostgreSQL；訂單與付款仍是 SQLite，不代表完整 runtime 已切換 |
| 尚缺規則      | PostgreSQL 顧客建單、付款與正式 runtime 切換策略；PostgreSQL v1 已決定不拆 owner／manager／staff                                                                                              |

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
| 尚缺實作      | DB lease locking、持久化工作佇列及 cancel／repay／pickup 鎖已完成第一版；仍缺正式告警通知、PostgreSQL row-lock 與 LINE Pay sandbox 驗證                                                                                                                    |

### 顧客建立訂單

| 項目          | 內容                                                                                                                                                                                                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Method / path | `POST /api/orders`                                                                                                                                                                                                                                                                                      |
| 相關畫面      | `CartScreen`                                                                                                                                                                                                                                                                                            |
| Request       | 需要 bearer token。Body: `{ activityId, fallbackPurchasePreference, items: [{ menuItemId, quantity, unitPrice, subtotal, customizationOptionIds[] }] }`；品名與金額只作 client 顯示／衝突偵測，不作權威來源 |
| Response      | `{ order }`                                                                                                                                                                                                                                                                                             |
| 已實作規則    | 需要 customer role、從登入使用者推導 `customerUserId`、驗證活動／截止時間／active customer、驗證飲品屬於活動店家且已上架、驗證 option ID 與 min/max、後端重算價格、保存快照、寫入 status history／audit、檢查重複訂單與容量；PostgreSQL 會先 `FOR UPDATE` 鎖 activity |
| 可切換資料來源 | `CUSTOMER_ORDER_WRITE_RUNTIME=sqlite|postgres`；預設 `sqlite`，不雙寫 |
| PostgreSQL 狀態 | 首次建單、顧客／商家列表、訂單明細、authorization request／confirm／cancel、一般 authorization void 與顧客取消已完成受控 server 切片且真實 HTTP proof 通過。capture 與 settlement repository／service building blocks 已通過真實 PostgreSQL mock-capture、折扣快照、持久化 job、`SKIP LOCKED` 與跨執行個體 lock proof，但尚未接入 server；改單／revision payment、refund、pickup 與 settlement route 仍回 `503 customer_order_runtime_mismatch` |
| 尚缺規則      | 建立訂單通用 idempotency key；目前重複 POST 以同顧客／活動 active-order conflict 與既有 `orderId` 回應 |

### 更新尚未預授權成功的顧客訂單

| 項目          | 內容                                                                                                                                                                                                                                                                                                        |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Method / path | `PATCH /api/orders/:orderId`                                                                                                                                                                                                                                                                                |
| 相關畫面      | `CartScreen`、`PaymentAuthorizationScreen`                                                                                                                                                                                                                                                                 |
| Request       | 需要 bearer token。Body 同建立訂單，使用 `menuItemId`、`customizationOptionIds[]` 與 client 顯示金額 |
| Response      | `{ order }`                                                                                                                                                                                                                                                                                                 |
| 已實作規則    | 需要 customer role 與 order ownership；只允許 `status = submitted` 且 `payment_status = pending`；替換 `order_items` 與 `order_item_customizations`；重新計算 `total_cups` 與 `original_amount`；用已 authorized/captured 杯數檢查容量；允許新 request 前，將 pending LINE Pay authorizations 標成 `failed` |
| 尚缺規則      | revision 失敗／容量不足／void 舊授權失敗時更細的 mobile 錯誤提示 |

### 建立已授權訂單修改版本

| 項目          | 內容                                                                                                                                                                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Method / path | `POST /api/orders/:orderId/revisions`                                                                                                                                                                                                    |
| 相關畫面      | `CustomerOrdersScreen`、`CartScreen`、`PaymentAuthorizationScreen`；mobile 第一版已串接                                                                                                                                                    |
| Request       | 需要 customer bearer token。Body 同建立訂單；重新預授權前再次使用最新菜單驗證與重算 |
| Response      | `{ revision }`；revision 包含 `id`, `orderId`, `status`, `totalCups`, `originalAmount`, `items`                                                                                                                                          |
| 已實作規則    | 只允許 owner 修改 `status = submitted` 且 `payment_status = authorized` 的訂單；截止前 30 分鐘內不可建立 revision；檢查活動可加入與容量上限；建立 `order_revisions` 與 revision item snapshots；不直接修改原訂單，也不取消舊預授權 |
| 後續付款      | 使用 `POST /api/payments/line-pay/request` 並帶入 `{ orderId, orderRevisionId, amount }` 對 revision 金額重新預授權                                                                                                                     |
| 尚缺規則      | revision 取消 API、完整 revision 歷史查詢 API、失敗狀態的 mobile 告知與重試入口 |

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
| 尚缺規則      | Provider request status query 與持久化 retry job 已完成第一版；仍缺通用 payment request idempotency table、sandbox callback 人工 E2E 與更細的 mobile 錯誤提示                                                                                                                                    |
| 已確認候選擴充（未實作） | 顧客前往付款時由 Client 傳送目前顯示的 `ruleVersion` 與明確同意旗標；Backend 必須驗證為目前有效版本，使用伺服器端權威規則內容與伺服器時間新增 `order_rule_consents`，成功後才可呼叫 LINE Pay。未勾選回傳 `rule_consent_required`，版本過期回傳 `rule_version_outdated`，同意紀錄寫入失敗時不得建立 provider request。 |

### LINE Pay 手動重新付款

| 項目          | 內容 |
| ------------- | ---- |
| Method / path | `POST /api/payments/line-pay/repay` |
| 相關畫面      | `CustomerOrdersScreen`、`PaymentAuthorizationScreen` |
| Request       | `{ orderId, productName?, packageName? }`；金額由後端結算結果決定，不接受前端指定 |
| Response      | LINE Pay 直接付款網址、交易編號、最終付款金額與付款截止時間 |
| 已實作規則    | 僅限訂單本人；自動請款已終止且付款狀態為 failed；只允許取餐開始前 15 分鐘以前建立；先查原交易避免重複扣款；仍為 authorized 時先 void；以 `direct_repayment` 建立直接付款；confirm 時再次檢查期限；成功後更新訂單為 captured 並加入製作流程；pending 與 captured 狀態防止重複付款 |
| 尚缺實作      | DB lease 已完成第一版；仍缺正式 sandbox 人工端對端測試、付款異常通知與 PostgreSQL row-lock 驗收 |

### LINE Pay 退款

| 項目          | 內容 |
| ------------- | ---- |
| Method / path | `POST /api/payments/line-pay/refund` |
| 相關畫面      | 目前無正式畫面；開發 / 後端補救測試用 |
| Request       | 需要後端補救權限；目前 route 使用 admin bearer token。Body: `{ orderId?, captureId?, providerTransactionId?, refundAmount?, reason?, idempotencyKey?, provider? }`；正式使用預設 `provider = line_pay`，`mock_line_pay` 只供非 production smoke test |
| Response      | `{ refund, capture, order, status, fullyRefunded, totalRefundedAmount, remainingRefundableAmount, providerTransactionId }` |
| 已實作規則    | 只允許已 capture 的付款退款；未指定 `refundAmount` 時退剩餘全額；退款金額不可超過剩餘可退金額；用 `payment_refunds.idempotency_key` 防止重複退款；同一 key 已退款時回傳 idempotent 結果；成功寫入 `payment_refunds`、provider event 與 audit log；全額退款後 `orders.payment_status = refunded` |
| 正式產品規則  | 商家不得直接呼叫此 route；商家只能針對自己門市的已請款訂單提出退款申請並填寫金額與原因，由營運／補救權限核准後執行 |
| 尚缺實作      | 商家退款申請與營運審核／執行 UI、退款失敗專用 retry／reconciliation job、正式告警通知與 sandbox 人工端對端測試 |

### LINE Pay Confirm Redirect

| 項目          | 內容                                                                                                                                                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Method / path | `GET /api/payments/line-pay/confirm?transactionId=&orderId=`                                                                                                                                                                                                 |
| 相關畫面      | LINE Pay hosted page 會 redirect 到這裡                                                                                                                                                                                                                      |
| Request       | LINE Pay query parameters，加上 confirm URL 裡自行帶入的 `orderId`                                                                                                                                                                                           |
| Response      | HTML result page；包含返回 App 的 deep link，例如 `drinkgroupbuy://payment/result?orderId=...`                                                                                                                                                              |
| 已實作規則    | 以 DB 查找 pending authorization，memory cache 只作輔助；用原價金額/currency 呼叫 LINE Pay confirm；寫入 `authorized` 前用交易重新檢查是否已截止、容量與 `authorizationExpireDate`；一般訂單成功時更新 `payment_authorizations` 與 `orders`；revision 授權成功時先套用 `order_revisions` 再嘗試 void 舊授權；截止後 confirm、容量不足或授權期限不足時標記 authorization / revision failed，並自動嘗試 LINE Pay void；記錄 provider event、status history 與 audit log；結果頁會提供 app deep link 並嘗試自動返回 App |
| 尚缺實作      | Request status query 與 pending authorization retry job 已完成第一版；仍缺 void 失敗重試與正式告警、duplicate redirect 更完整的 idempotency table、雙 process／sandbox 驗證                                                                                  |

### LINE Pay Cancel Redirect

| 項目          | 內容                                                        |
| ------------- | ----------------------------------------------------------- |
| Method / path | `GET /api/payments/line-pay/cancel?transactionId=&orderId=` |
| 相關畫面      | LINE Pay hosted page 會 redirect 到這裡                     |
| Response      | HTML cancellation page；包含返回 App 的 deep link             |
| 已實作規則    | 以 DB 查找 pending authorization，將 pending authorization 標記為 `failed`；若屬於 order revision，revision 也會標記為 `failed`；寫入 provider event、status history 與 audit log，並清除 memory cache；結果頁會提供 app deep link |
| 尚缺規則      | duplicate cancel redirect 的完整 idempotency table             |

## 下一步候選 API

優先順序：

| 優先級 | 範圍              | 原因                                                                 |
| ------ | ----------------- | -------------------------------------------------------------------- |
| High   | provider reconciliation validation | 第一版已完成；仍需 LINE Pay sandbox 與 redirect 遺失人工驗證 |
| High   | persisted job alerts | Retry jobs 與 terminal flag 已完成；仍需正式告警通知管道 |
| High   | cross-instance locking hardening | Payment／settlement DB lease 已完成；仍需雙 process 測試與 cancel／repay／pickup 完整鎖定 |
| High   | pricing snapshot and live discount | SQLite API 即時欄位、結算分配與公式 smoke 已完成；仍需 Mobile 顯示、專用持久化快照設計與 PostgreSQL 寫入 runtime |
| Medium | provider-neutral payment routes | 目前先以 LINE Pay 專用 route 前進，正式 API shape 後續再收斂       |
| Medium | order revision history UI | 修改與重新授權主幹已有第一版，仍缺完整歷史查詢與 UI 呈現 |
| Medium | PostgreSQL runtime adapter | Migration draft 已驗證，但 Backend runtime 仍使用 SQLite |
| Medium | refund request and account closure | 商家退款申請／營運執行及帳號關閉／去識別化規則已確認，API 與權限尚未實作 |

已完成並移出候選優先清單：顧客訂單列表／取消、商家訂單列表、店家菜單管理，以及取貨碼／可取餐／核銷／逾期未取第一版。

### 店家與菜單

| Method / path                                                | 用途                         | 實作狀態／規則 |
| ------------------------------------------------------------ | ---------------------------- | ------------------- |
| `GET /api/stores/nearby?latitude=&longitude=&radiusMeters=`  | 地圖附近公里數篩選           | 尚未實作；全部營業店家列表已由 `GET /api/stores` 提供，後續再決定距離計算與半徑契約 |
| `GET /api/stores/:storeId/menu`                              | 顧客查詢菜單與客製化選項     | 已實作；只回傳上架品項／選項與 min/max 選擇數 |
| `GET /api/merchant/stores/:storeId/menu`                     | 店家查看完整菜單             | 已實作；需 merchant-store permission，包含停售品項／選項 |
| `POST /api/merchant/stores/:storeId/menu-items`              | 店家新增菜單品項             | 已實作；驗證價格、分類、選項、價差及明確選擇上限 |
| `PATCH /api/merchant/stores/:storeId/menu-items/:menuItemId` | 店家修改品項或上／下架       | 已實作；未提交的舊選項採軟停用，保留歷史訂單 FK 與快照 |

菜單 runtime：`MERCHANT_MENU_RUNTIME=sqlite|postgres`，預設 `sqlite`。PostgreSQL 建立／修改會先鎖 store row、再驗證 merchant-store access，並在同一 transaction 更新品項、規則、選項與 audit log；折扣衝突會 rollback。

菜單查詢規則：活動菜單由 `menu_items.store_id = activity.store_id AND menu_items.is_available = 1` 決定，不需要活動與飲品的多對多關聯。建立訂單、更新 pending 訂單與建立 revision 時，後端均會重新驗證並以資料庫價格重算金額；client 金額不一致時回傳 `order_price_changed`，品項／選項失效或選擇數不符時回傳 `order_items_invalid`。

### 訂單與購物車

| Method / path candidate                             | 用途                             | 主要不確定點                                                      |
| --------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------- |
| `POST /api/group-buy-activities/:activityId/orders` | 訂單建立的替代 nested route      | 目前已實作 route 是 `POST /api/orders`；最終 route shape 尚未決定 |
| `GET /api/customers/me/orders`                      | 顧客進行中與歷史訂單             | 已實作 bearer ownership、scope、cursor、limit、lifecycleBucket 與 availableActions |
| `GET /api/orders/:orderId/history`                  | 訂單與付款狀態歷史               | Owner/merchant visibility；dev/admin 補救權限另定                 |
| `PATCH /api/orders/:orderId/items`                  | 若未來需要，更細的品項修改 route | 目前已有 `POST /api/orders/:orderId/revisions` 作為已授權修改入口 |
| `POST /api/orders/:orderId/cancel`                  | 鎖定前退出團購                   | 已實作第一版；idempotency、pending 授權失效、authorized 先 void、revision 取消與 audit |

訂單列表 query 契約：

- `scope=active|history`，預設 `active`。
- `limit` 預設 20、上限 100。
- `cursor` 使用 Backend 產生的不透明字串；回應以 `nextCursor` 提供下一頁位置。
- 商家列表可另傳 `activityId`，但 `storeId` 仍是權限邊界。
- 每筆訂單包含活動、店家、品項快照、付款／revision 摘要、取貨憑證摘要、`lifecycleBucket` 與角色專屬 `availableActions`；列表不回傳完整取貨碼。
- 同一顧客在同一活動只允許一張非取消訂單；重複 `POST /api/orders` 回 `409` 及既有 `orderId`。

### 付款

| Method / path candidate                                     | 用途                         | 主要不確定點                                   |
| ----------------------------------------------------------- | ---------------------------- | ---------------------------------------------- |
| `POST /api/orders/:orderId/payment-authorizations`          | 開始 provider authorization  | LINE Pay capability 與 redirect/deep-link flow |
| `POST /api/payment-authorizations/:authorizationId/void`    | 取消未使用授權               | Provider expiry 與 idempotency                 |
| `POST /api/payment-authorizations/:authorizationId/capture` | Partial capture final amount | Backend payment module 已有內部 capture service、持久化重試與跨程序 lease；尚未開公開 API |
| `POST /api/payment-captures/:captureId/refunds`             | Provider-neutral refund      | 目前已先實作 LINE Pay 專用開發 / 後端補救 route；正式 API shape 尚未決定 |
| `POST /api/merchant/orders/:orderId/refund-requests`        | 商家提出退款申請              | 已實作第一版：只允許所屬門市、已請款且仍有可退餘額的訂單；需金額（`requestedAmount`）與原因（`reason`），可帶 `idempotencyKey`；不直接呼叫 provider，同一筆請款同時只允許一筆 `pending` 申請 |
| `GET /api/merchant/stores/:storeId/refund-requests`         | 商家查詢自己門市的退款申請     | 已實作第一版；可選 `status` 篩選，沿用 `canManageStore` 門市權限檢查 |
| `GET /api/admin/refund-requests`                            | 營運查詢待審核退款申請佇列     | 已實作第一版，admin-only；可選 `status` 篩選 |
| `POST /api/admin/refund-requests/:requestId/approve`        | 營運核准並執行退款            | 已實作第一版，admin-only；內部重用既有 LINE Pay refund service（含 idempotency）；provider 失敗時申請維持 `pending` 供重試，尚未接正式告警通知 |
| `POST /api/admin/refund-requests/:requestId/reject`         | 營運駁回退款申請              | 已實作第一版，admin-only；需填 `reason`，不呼叫 provider |
| `GET /api/payments/line-pay/status/:transactionId`          | 查詢 provider 狀態並對帳     | 正式上線前用於重試、redirect 遺失與付款狀態 reconciliation |
| `GET /api/admin/payment-reliability/alerts`                  | 查詢終止失敗工作             | 已實作 admin-only、jobType/status/limit 白名單篩選；通知通道尚未接入 |
| `POST /api/payments/ecpay/request`                           | 建立 ECPay 信用卡預授權請求  | 已實作並已用真實 HTTP 請求驗證（含真實建單、dev auth）；`npm run ecpay:smoke` 覆蓋 `mock_ecpay` 情境；尚未打過真實 ECPay Stage 網路（見 `docs/ecpay-checkout-stage-checklist.md`） |
| `POST /api/payments/ecpay/return`                            | ECPay ReturnURL webhook（權威付款通知） | 已實作並驗證（含 CheckMacValue 驗簽、竄改簽章正確拒絕）；與 LINE Pay 的 GET confirm 模式不同，是 POST + 必須回應純文字 `1\|OK` |
| `GET /api/payments/ecpay/client-back`                        | ECPay ClientBackURL（僅導回瀏覽器，非權威來源） | 已實作；不觸發任何狀態變更，只查目前 DB 狀態顯示 |
| `GET /api/payments/ecpay/checkout-redirect`                  | 產生導向 ECPay 託管付款頁的 auto-submit 表單頁 | 已實作並驗證；ECPay AioCheckOut 是 POST 表單跳轉，不是單一 GET URL，故需要這個中介頁面 |

### 商家履約

| Method / path candidate                                             | 用途                         | 主要不確定點                     |
| ------------------------------------------------------------------- | ---------------------------- | -------------------------------- |
| `GET /api/merchant/stores/:storeId/orders?activityId=`              | 商家訂單佇列與歷史           | 已實作門市權限、活動篩選、匿名顧客及履約摘要 |
| `POST /api/merchant/group-buy-activities/:activityId/ready-for-pickup` | 標記活動可取餐並建立取貨憑證 | 已實作第一版，需 merchant-store permission |
| `GET /api/orders/:orderId/pickup-credential`                       | 顧客查詢自己的取貨憑證       | 已實作 ownership 檢查及顯示條件 |
| `POST /api/merchant/pickup-credentials/lookup`                     | 商家用取貨碼查詢訂單         | 已實作門市權限、錯誤次數限制與過期拒絕 |
| `POST /api/merchant/pickup-credentials/redeem`                     | 商家核銷取貨並完成訂單       | 已實作冪等、狀態歷程與 audit；QR Code 尚未實作 |
| Internal pickup expiration job                                      | 將逾期未取訂單移至歷史訂單   | Backend interval 已實作；期限取 `pickupStartAt + 3 小時` 與 `pickupEndAt` 較早者，取貨 API 與第一版 App 串接已完成 |

備註：最新產品規則不需要店家逐筆接受訂單，因此不再規劃店家接單 API。商家端應改以「標記可取餐」與「核銷取貨」作為履約操作。

### 截止結算

| Method / path candidate                        | 用途                                                        | 主要不確定點                                       |
| ---------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------- |
| Internal backend interval job                  | 自動找出已截止團購並觸發 settlement                         | 已使用持久化 job、lease claim、跨程序 activity lock 與租約逾時 recovery；請款最多三次 |

## 跨功能需求

- Authentication 與 role authorization。
- Local mobile web CORS 必須允許 `Authorization`，讓 bearer-token API calls 可以通過 browser preflight。
- Input validation 與一致的 error format。
- 所有 API 在處理查詢、建立、修改、刪除資料時，必須使用參數化查詢；若有動態排序欄位、狀態值、角色或類型，必須使用白名單驗證，避免使用者輸入改變 SQL 結構。
- create、authorization、capture、cancellation、pickup operations 需要 idempotency。
- 更新 orders、cup totals、payment state 與 history 的操作需要 transaction。
- deadline/capacity races 需要 optimistic concurrency 或 locking。
- 最高 promotion tier 是 activity cup capacity。建立訂單與付款 authorization 必須拒絕會超過 `maximumCups` 的 request。
- 敏感狀態轉換需要 status history 與 audit logs。
- 取貨憑證有效期限必須在顧客付款前清楚顯示；逾期未取不自動退款，但店家不得交付有食品安全疑慮的飲品。
- 團購進行中以有效已授權杯數即時計算預估每杯折扣；截止結算時重新計算並保存級距、杯數、每杯折扣、實際分配總額及未分配尾差。
- 所有金額驗證由 Backend 使用權威菜單與客製化最低價差計算；若活動或菜單異動會造成每杯折扣為 0、超過最低單杯金額或應付金額為負數，API 必須拒絕並回傳可修正的 validation error。
- 帳號關閉 API 必須先停用登入與撤銷 session，再刪除或去識別化非必要個資；不得直接刪除仍受法定保存、付款對帳或爭議處理需求約束的交易紀錄。
