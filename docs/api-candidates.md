# API Inventory And Candidates

Last updated: 2026-06-26

API JSON uses `camelCase`. Implemented routes are authoritative only for the current development prototype; candidate routes are not contracts.

## Implemented

### Health Check

| Item | Value |
| --- | --- |
| Method / path | `GET /health` |
| Purpose | Verify backend availability |
| Response | `{ ok, service }` |

### List Group-Buy Activities

| Item | Value |
| --- | --- |
| Method / path | `GET /api/group-buy-activities` |
| Purpose | Return activities, stores, and promotion tiers from SQLite |
| Response | `{ activities: [{ id, storeId, createdByUserId, title, status, rawStatus, startAt, deadlineAt, pickupStartAt, pickupEndAt, maximumCups, targetCups, currentCups, authorizedCups, participantCount, withdrawalLockMinutes, cancellationReason, store, tiers }] }` |
| Current gap | Mobile does not call this endpoint at startup |

### Create Merchant Activity

| Item | Value |
| --- | --- |
| Method / path | `POST /api/merchant/group-buy-activities` |
| Related screen | `MerchantDealCreateScreen` |
| Request | Bearer token required. Body: `{ storeId, title, startAt, deadlineAt, pickupStartAt, pickupEndAt, withdrawalLockMinutes?, tiers[], notice?, idempotencyKey? }` |
| Response | `{ activity }` |
| Implemented rules | Requires merchant role, verifies merchant-store access, derives `createdByUserId` from authenticated user, required-field validation, tier normalization, maximum cups derived from highest tier, transaction, simple idempotency, audit log |
| Missing rules | Robust date validation, richer merchant permission model |

### Administrator Cancels Activity

| Item | Value |
| --- | --- |
| Method / path | `DELETE /api/admin/group-buy-activities/:activityId` |
| Related screen | `AdminDashboardScreen` |
| Request | Bearer token required. Body: `{ reason? }` |
| Response | `{ activity }` |
| Implemented rules | Requires admin role, derives `actorUserId` from authenticated user, soft cancellation, status history, audit log, idempotent response for an already cancelled activity |
| Missing rules | Cascading order/payment handling |

### Create Customer Order

| Item | Value |
| --- | --- |
| Method / path | `POST /api/orders` |
| Related screen | `CartScreen` |
| Request | Bearer token required. Body: `{ activityId, fallbackPurchasePreference, items: [{ menuItemId?, itemName, quantity, unitPrice, subtotal, size?, sweetness?, ice?, toppings? }] }` |
| Response | `{ order }` |
| Implemented rules | Requires customer role, derives `customerUserId` from authenticated user, requires existing backend `group_buy_activities` row, requires active customer user, writes `orders`, `order_items`, `order_item_customizations`, `status_history`, and `audit_logs` in one transaction, blocks non-joinable activities, checks authorized cups against `maximum_cups` |
| Missing rules | Order modification API, price validation against current menu, idempotency key, complete concurrency locking for simultaneous joins |

### Get Order Detail

| Item | Value |
| --- | --- |
| Method / path | `GET /api/orders/:orderId` |
| Related screen | `PaymentReportScreen`, `CustomerOrdersScreen` |
| Request | Bearer token required |
| Response | `{ order: { id, activityId, customerUserId, status, paymentStatus, authorizationStatus, originalAmount, totalCups, items, latestLinePayAuthorization } }` |
| Implemented rules | Owner/admin access check; returns order item snapshots and latest LINE Pay authorization so mobile can refresh payment state after LINE Pay redirect |
| Missing rules | Merchant visibility checks, pagination/history for multiple authorizations |

### Request LINE Pay Authorization

| Item | Value |
| --- | --- |
| Method / path | `POST /api/payments/line-pay/request` |
| Related screen | `PaymentReportScreen` |
| Request | Bearer token required. Body: `{ orderId, amount, currency?, productName?, packageName?, products? }` |
| Response | `{ provider, orderId, transactionId, paymentUrl, paymentAccessToken, status }` |
| Implemented rules | Owner/admin access check, backend-only Channel ID/Secret, LINE Pay request signature, sandbox base URL by default, verifies order exists in SQLite, verifies requested amount equals `orders.original_amount`, blocks duplicate request when latest LINE Pay authorization is `pending` or `authorized`, creates `payment_authorizations.status = pending`, keeps temporary in-memory redirect lookup |
| Missing rules | Durable redirect lookup, idempotency table, webhook verification, mobile callback sync, authorization expiry handling, separated capture support confirmation |

### LINE Pay Confirm Redirect

| Item | Value |
| --- | --- |
| Method / path | `GET /api/payments/line-pay/confirm?transactionId=&orderId=` |
| Related screen | LINE Pay hosted page redirects here |
| Request | Query parameters from LINE Pay plus `orderId` added to configured confirm URL |
| Response | HTML result page |
| Implemented rules | Looks up pending payment in memory, calls LINE Pay confirm using original amount/currency, updates `payment_authorizations.status = authorized`, updates `orders.payment_status = authorized` and `orders.authorization_status = authorized`, records provider event and status history |
| Missing rules | Durable redirect lookup across server restart, mobile callback sync, handle provider retries or duplicate redirects beyond simple already-authorized behavior |

### LINE Pay Cancel Redirect

| Item | Value |
| --- | --- |
| Method / path | `GET /api/payments/line-pay/cancel?transactionId=&orderId=` |
| Related screen | LINE Pay hosted page redirects here |
| Response | HTML cancellation page |
| Implemented rules | Clears in-memory pending payment when possible |
| Missing rules | Persist cancellation event and return user to app |

## Next Candidates

### Stores And Menus

| Method / path candidate | Purpose | Key uncertainty |
| --- | --- | --- |
| `GET /api/stores/nearby?latitude=&longitude=&radiusMeters=` | Map and nearby store data | Distance source and Google Places relationship |
| `GET /api/stores/:storeId/menu` | Menu and customization options | Availability and snapshot/version rules |

### Orders And Cart

| Method / path candidate | Purpose | Key uncertainty |
| --- | --- | --- |
| `POST /api/group-buy-activities/:activityId/orders` | Alternative nested route for order creation | Current implemented route is `POST /api/orders`; final route shape still undecided |
| `GET /api/customers/me/orders` | Active and historical customer orders | Authentication and pagination |
| `GET /api/orders/:orderId/history` | Order/payment status history | Owner/merchant/admin visibility |
| `PATCH /api/orders/:orderId/items` | Modify order before lock | Reauthorization and revision history |
| `POST /api/orders/:orderId/cancel` | Exit before lock | Deadline race and authorized-cup rollback |

### Payment

| Method / path candidate | Purpose | Key uncertainty |
| --- | --- | --- |
| `POST /api/orders/:orderId/payment-authorizations` | Start provider authorization | LINE Pay capability and redirect/deep-link flow |
| `POST /api/payment-authorizations/:authorizationId/void` | Void unused authorization | Provider expiry and idempotency |
| `POST /api/payment-authorizations/:authorizationId/capture` | Partial capture final amount | Provider support and retry policy |
| `POST /api/payments/webhooks/line-pay` | Receive provider events | Signature verification and event ordering |

### Merchant Fulfillment

| Method / path candidate | Purpose | Key uncertainty |
| --- | --- | --- |
| `GET /api/merchant/group-buy-activities/:activityId/orders` | Merchant order queue and history | Exposed customer fields |
| `POST /api/merchant/group-buy-activities/:activityId/accept-orders` | Accept eligible locked orders | Bulk vs per-order acceptance |
| `POST /api/merchant/orders/:orderId/ready` | Mark preparation complete and reveal pickup code | Current UI labels this action as 完成訂單 |
| `POST /api/merchant/orders/:orderId/pickup` | Verify pickup and complete order | Code/QR verification method |

### Deadline Settlement

| Method / path candidate | Purpose | Key uncertainty |
| --- | --- | --- |
| Internal job/event, not necessarily public API | Lock orders, select tier, capture/void payments, create settlement | Scheduler ownership, retries, concurrency and recovery |

## Cross-Cutting Requirements

- Authentication and role authorization.
- Input validation and consistent error format.
- Idempotency for create, authorization, capture, cancellation, and pickup operations.
- Transactions for operations that update orders, cup totals, payment state, and history together.
- Optimistic concurrency or locking for deadline/capacity races.
- Highest promotion tier is the activity cup capacity. Order creation and payment authorization must reject requests that would exceed `maximumCups`.
- Status history and audit logs for sensitive transitions.
