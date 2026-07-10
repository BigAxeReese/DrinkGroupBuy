# API Inventory And Candidates

Last updated: 2026-07-10

## Language / 中文註解規則

本文件整理目前已實作與未來可能需要的 API。

- API method、path、request / response 欄位名稱保留英文，因為它們會直接影響程式串接。
- 中文只作為用途、完成度與缺口的輔助說明。
- 不要把 API path 或 JSON 欄位翻成中文。
- `Implemented` 代表目前開發版已存在的 API。
- `Candidate` 或缺口說明代表未來可能要補的 API，還不是正式契約。

API JSON uses `camelCase`. Implemented routes are authoritative only for the current development prototype; candidate routes are not contracts.

## Implemented

### Authentication Direction Update

| Item                       | Value                                                                                                          |
| -------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Decision date              | 2026-07-05                                                                                                     |
| Formal direction           | Firebase Auth with Google Login only                                                                           |
| Current implemented route  | `POST /api/auth/firebase-session`                                                                              |
| Legacy compatibility route | `POST /api/auth/login` remains temporary development compatibility                                             |
| Request                    | `{ idToken }` where `idToken` is the Firebase ID token from Google Login                                       |
| Response                   | `{ token, user: { id, loginName, phoneNumber, email, displayName, surname, roles, merchantStores } }`          |
| Backend responsibility     | Verify Firebase ID token, map Firebase UID/email to `users`, resolve roles and store permissions from database |
| Current session behavior   | Backend returns its existing bearer token after Firebase verification                                          |
| Current mapping behavior   | Looks up `users.firebase_uid`; unmapped Firebase users receive 403                                             |
| Migration note             | Do not add new production features depending on phone/password or email/password login                         |

### Development Role Testing Auth

| Item                     | Value                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| Purpose                  | Allow developers to test customer, merchant, and admin flows while production remains Google-only |
| Preferred method         | Use real Firebase test Google accounts mapped by `users.firebase_uid`                             |
| Alternative local method | Firebase Auth emulator or dev-only bypass                                                         |
| Required guard           | Enabled only by local backend env such as `AUTH_DEV_MODE=true`; default must be disabled          |
| Candidate request        | `{ devFirebaseUid }` only in local/dev mode, or normal `{ idToken }` from Firebase emulator       |
| Candidate response       | Same shape as formal Google login: `{ token, user }`                                              |
| Forbidden behavior       | Mobile production UI must not expose role selection or arbitrary Firebase UID input               |
| Audit note               | If a dev bypass is implemented, log usage clearly and keep it out of production deployment config |

### Health Check

| Item          | Value                       |
| ------------- | --------------------------- |
| Method / path | `GET /health`               |
| Purpose       | Verify backend availability |
| Response      | `{ ok, service }`           |

### List Group-Buy Activities

| Item          | Value                                                                                                                                                                                                                                                            |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Method / path | `GET /api/group-buy-activities`                                                                                                                                                                                                                                  |
| Purpose       | Return activities, stores, and promotion tiers from SQLite                                                                                                                                                                                                       |
| Response      | `{ activities: [{ id, storeId, createdByUserId, title, status, rawStatus, startAt, deadlineAt, pickupStartAt, pickupEndAt, maximumCups, targetCups, currentCups, authorizedCups, participantCount, withdrawalLockMinutes, cancellationReason, store, tiers }] }` |
| Current gap   | Mobile does not call this endpoint at startup                                                                                                                                                                                                                    |

### Create Merchant Activity

| Item                 | Value                                                                                                                                                                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Method / path        | `POST /api/merchant/group-buy-activities`                                                                                                                                                                                                    |
| Related screen       | `MerchantDealCreateScreen`                                                                                                                                                                                                                   |
| Request              | Bearer token required. Body: `{ storeId, title, startAt, deadlineAt, pickupStartAt, pickupEndAt, withdrawalLockMinutes?, tiers[], notice?, idempotencyKey? }`                                                                                |
| Response             | `{ activity }`                                                                                                                                                                                                                               |
| Implemented rules    | Requires merchant role, verifies merchant-store access, derives `createdByUserId` from authenticated user, required-field validation, tier normalization, maximum cups derived from highest tier, transaction, simple idempotency, audit log |
| Final business rules | `deadlineAt` must be within 24 hours after the activity is published or opened for recruiting                                                                                                                                                |
| Missing rules        | Enforce 24-hour deadline limit, robust date validation, richer merchant permission model                                                                                                                                                     |

### Administrator Cancels Activity

| Item              | Value                                                                                                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Method / path     | `DELETE /api/admin/group-buy-activities/:activityId`                                                                                                                    |
| Related screen    | `AdminDashboardScreen`                                                                                                                                                  |
| Request           | Bearer token required. Body: `{ reason? }`                                                                                                                              |
| Response          | `{ activity }`                                                                                                                                                          |
| Implemented rules | Requires admin role, derives `actorUserId` from authenticated user, soft cancellation, status history, audit log, idempotent response for an already cancelled activity |
| Missing rules     | Cascading order/payment handling                                                                                                                                        |

### Create Customer Order

| Item              | Value                                                                                                                                                                                                                                                                                                                                                            |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Method / path     | `POST /api/orders`                                                                                                                                                                                                                                                                                                                                               |
| Related screen    | `CartScreen`                                                                                                                                                                                                                                                                                                                                                     |
| Request           | Bearer token required. Body: `{ activityId, fallbackPurchasePreference, items: [{ menuItemId?, itemName, quantity, unitPrice, subtotal, size?, sweetness?, ice?, toppings? }] }`                                                                                                                                                                                 |
| Response          | `{ order }`                                                                                                                                                                                                                                                                                                                                                      |
| Implemented rules | Requires customer role, derives `customerUserId` from authenticated user, requires existing backend `group_buy_activities` row, requires active customer user, writes `orders`, `order_items`, `order_item_customizations`, `status_history`, and `audit_logs` in one transaction, blocks non-joinable activities, checks authorized cups against `maximum_cups` |
| Missing rules     | Price validation against current menu, idempotency key, complete concurrency locking for simultaneous joins                                                                                                                                                                                                                                                      |

### Update Pending Customer Order

| Item              | Value                                                                                                                                                                                                                                                                                                                                                            |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Method / path     | `PATCH /api/orders/:orderId`                                                                                                                                                                                                                                                                                                                                     |
| Related screen    | `CartScreen`, `PaymentReportScreen`                                                                                                                                                                                                                                                                                                                              |
| Request           | Bearer token required. Body: `{ fallbackPurchasePreference, items: [{ menuItemId?, itemName, quantity, unitPrice, subtotal, size?, sweetness?, ice?, toppings? }] }`                                                                                                                                                                                             |
| Response          | `{ order }`                                                                                                                                                                                                                                                                                                                                                      |
| Implemented rules | Requires customer role and order ownership, only allows `status = submitted` with `payment_status = pending`, replaces `order_items` and `order_item_customizations`, recalculates `total_cups` and `original_amount`, checks capacity against already authorized/captured cups, marks pending LINE Pay authorizations as `failed` before allowing a new request |
| Missing rules     | Authorized-order reauthorization flow, explicit customer cancel/exit API, revision history table                                                                                                                                                                                                                                                                 |

### Get Order Detail

| Item              | Value                                                                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Method / path     | `GET /api/orders/:orderId`                                                                                                                                |
| Related screen    | `PaymentReportScreen`, `CustomerOrdersScreen`                                                                                                             |
| Request           | Bearer token required                                                                                                                                     |
| Response          | `{ order: { id, activityId, customerUserId, status, paymentStatus, authorizationStatus, originalAmount, totalCups, items, latestLinePayAuthorization } }` |
| Implemented rules | Owner/admin access check; returns order item snapshots and latest LINE Pay authorization so mobile can refresh payment state after LINE Pay redirect      |
| Missing rules     | Merchant visibility checks, pagination/history for multiple authorizations                                                                                |

### Request LINE Pay Authorization

| Item              | Value                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Method / path     | `POST /api/payments/line-pay/request`                                                                                                                                                                                                                                                                                                                                                                 |
| Related screen    | `PaymentReportScreen`                                                                                                                                                                                                                                                                                                                                                                                 |
| Request           | Bearer token required. Body: `{ orderId, amount, currency?, productName?, packageName?, products? }`                                                                                                                                                                                                                                                                                                  |
| Response          | `{ provider, orderId, transactionId, paymentUrl, paymentAccessToken, status }`                                                                                                                                                                                                                                                                                                                        |
| Implemented rules | Owner/admin access check, backend-only Channel ID/Secret, LINE Pay request signature, sandbox base URL by default, verifies order exists in SQLite, verifies requested amount equals `orders.original_amount`, blocks duplicate request when latest LINE Pay authorization is `pending` or `authorized`, creates `payment_authorizations.status = pending`, keeps temporary in-memory redirect lookup |
| Missing rules     | Durable redirect lookup, idempotency table, webhook verification, mobile callback sync, authorization expiry handling, separated capture support confirmation                                                                                                                                                                                                                                         |

### LINE Pay Confirm Redirect

| Item              | Value                                                                                                                                                                                                                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Method / path     | `GET /api/payments/line-pay/confirm?transactionId=&orderId=`                                                                                                                                                                                                                            |
| Related screen    | LINE Pay hosted page redirects here                                                                                                                                                                                                                                                     |
| Request           | Query parameters from LINE Pay plus `orderId` added to configured confirm URL                                                                                                                                                                                                           |
| Response          | HTML result page                                                                                                                                                                                                                                                                        |
| Implemented rules | Looks up pending payment in memory, calls LINE Pay confirm using original amount/currency, updates `payment_authorizations.status = authorized`, updates `orders.payment_status = authorized` and `orders.authorization_status = authorized`, records provider event and status history |
| Missing rules     | Durable redirect lookup across server restart, mobile callback sync, handle provider retries or duplicate redirects beyond simple already-authorized behavior                                                                                                                           |

### LINE Pay Cancel Redirect

| Item              | Value                                                       |
| ----------------- | ----------------------------------------------------------- |
| Method / path     | `GET /api/payments/line-pay/cancel?transactionId=&orderId=` |
| Related screen    | LINE Pay hosted page redirects here                         |
| Response          | HTML cancellation page                                      |
| Implemented rules | Clears in-memory pending payment when possible              |
| Missing rules     | Persist cancellation event and return user to app           |

## Next Candidates

### Stores And Menus

| Method / path candidate                                     | Purpose                        | Key uncertainty                                |
| ----------------------------------------------------------- | ------------------------------ | ---------------------------------------------- |
| `GET /api/stores/nearby?latitude=&longitude=&radiusMeters=` | Map and nearby store data      | Distance source and Google Places relationship |
| `GET /api/stores/:storeId/menu`                             | Menu and customization options | Availability and snapshot/version rules        |

### Orders And Cart

| Method / path candidate                             | Purpose                                               | Key uncertainty                                                                    |
| --------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `POST /api/group-buy-activities/:activityId/orders` | Alternative nested route for order creation           | Current implemented route is `POST /api/orders`; final route shape still undecided |
| `GET /api/customers/me/orders`                      | Active and historical customer orders                 | Authentication and pagination                                                      |
| `GET /api/orders/:orderId/history`                  | Order/payment status history                          | Owner/merchant/admin visibility                                                    |
| `PATCH /api/orders/:orderId/items`                  | More granular item modification route if needed later | Reauthorization and revision history                                               |
| `POST /api/orders/:orderId/cancel`                  | Exit before lock                                      | Deadline race and authorized-cup rollback                                          |

### Payment

| Method / path candidate                                     | Purpose                      | Key uncertainty                                 |
| ----------------------------------------------------------- | ---------------------------- | ----------------------------------------------- |
| `POST /api/orders/:orderId/payment-authorizations`          | Start provider authorization | LINE Pay capability and redirect/deep-link flow |
| `POST /api/payment-authorizations/:authorizationId/void`    | Void unused authorization    | Provider expiry and idempotency                 |
| `POST /api/payment-authorizations/:authorizationId/capture` | Partial capture final amount | Provider support and retry policy               |
| `POST /api/payments/webhooks/line-pay`                      | Receive provider events      | Signature verification and event ordering       |

### Merchant Fulfillment

| Method / path candidate                                             | Purpose                                          | Key uncertainty                           |
| ------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------- |
| `GET /api/merchant/group-buy-activities/:activityId/orders`         | Merchant order queue and history                 | Exposed customer fields                   |
| `POST /api/merchant/group-buy-activities/:activityId/accept-orders` | Accept eligible locked orders                    | Bulk vs per-order acceptance              |
| `POST /api/merchant/orders/:orderId/ready`                          | Mark preparation complete and reveal pickup code | Current UI labels this action as 完成訂單 |
| `POST /api/merchant/orders/:orderId/pickup`                         | Verify pickup and complete order                 | Code/QR verification method               |

### Deadline Settlement

| Method / path candidate                        | Purpose                                                            | Key uncertainty                                        |
| ---------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------ |
| Internal job/event, not necessarily public API | Lock orders, select tier, capture/void payments, create settlement | Scheduler ownership, retries, concurrency and recovery |

## Cross-Cutting Requirements

- Authentication and role authorization.
- Local mobile web CORS must allow `Authorization` so bearer-token API calls can pass browser preflight.
- Input validation and consistent error format.
- Idempotency for create, authorization, capture, cancellation, and pickup operations.
- Transactions for operations that update orders, cup totals, payment state, and history together.
- Optimistic concurrency or locking for deadline/capacity races.
- Highest promotion tier is the activity cup capacity. Order creation and payment authorization must reject requests that would exceed `maximumCups`.
- Status history and audit logs for sensitive transitions.
