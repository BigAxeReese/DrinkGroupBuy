# Current Progress

Last updated: 2026-06-26

## Mobile

Technology: React Native + Expo, Android-first with Expo Web preview.

Implemented screens and flows:

- Prototype customer, merchant, and administrator sign-in selection.
- Customer home, Google Maps live map, store menu, drink customization, and cart.
- Customer home separates current-customer joined orders from global/nearby recruiting activity recommendations.
- Customer active orders, order detail/editing, group progress, pickup code, and order history.
- Activity capacity follows the highest promotion tier; for example 20/30/40 cup tiers mean the activity can accept at most 40 cups.
- LINE Pay authorization and partial-capture UI/state simulation.
- Payment screen can now ask the backend to create a LINE Pay sandbox authorization URL, then open the LINE Pay hosted page.
- Merchant dashboard, activity creation, order acceptance, preparation completion, and merchant history.
- Administrator dashboard and activity cancellation.
- Local prototype persistence through browser `localStorage` when available.

Real API usage:

- `MerchantDealCreateScreen` creates activities through the backend, with local fallback on failure.
- `AdminDashboardScreen` cancels activities through the backend, with local fallback on failure.

Important limitation: app startup does not yet load the authoritative activity list from the backend. Orders, payments, pickup, and most runtime progress remain mobile-local state.

## Backend

Technology: Node.js built-in HTTP server and built-in SQLite driver.

Implemented endpoints:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Service health check |
| `GET` | `/api/group-buy-activities` | List activities and promotion tiers |
| `POST` | `/api/merchant/group-buy-activities` | Create an activity and tiers |
| `POST` | `/api/orders` | Create an order and order item snapshots from cart data |
| `DELETE` | `/api/admin/group-buy-activities/:activityId` | Soft-cancel an activity |
| `POST` | `/api/payments/line-pay/request` | Create a LINE Pay sandbox authorization request |
| `GET` | `/api/payments/line-pay/confirm` | LINE Pay redirect confirm endpoint |
| `GET` | `/api/payments/line-pay/cancel` | LINE Pay redirect cancellation endpoint |

Implemented safeguards:

- Transactional activity creation and cancellation.
- Transactional order creation with item/customization snapshots.
- Simple idempotency handling for activity creation.
- Status history and audit log on administrator cancellation.
- Request validation for required activity fields.
- LINE Pay request signing keeps Channel ID/Secret on the backend only.
- LINE Pay request now requires a matching backend `orders` row, creates `payment_authorizations.status = pending`, and confirm updates the authorization and order to `authorized`.
- LINE Pay request now blocks duplicate requests when the latest authorization for the order is already `pending` or `authorized`.

Not implemented: authentication, authorization, order modification APIs, durable LINE Pay redirect lookup across backend restarts, LINE Pay capture/void/refund, payment webhooks, pickup APIs, deadline settlement jobs, production migrations, and automated tests.

Important current limitation: `POST /api/orders` only works for activities that already exist in the backend SQLite database. A stale mobile-local activity will be rejected until mobile startup loads the backend activity list.

## Database

Development database: `database/drink-group-buy-dev.sqlite`.

The schema includes users/roles, merchants/stores, menu data, activities/tiers, carts, cart item customizations, orders/items, order item customizations, payment authorization/capture, settlement, pickup credentials, status history, and audit logs.

Core cart/order customization data has been adjusted toward first normal form: selected sweetness, ice, toppings, and size are stored as child rows instead of JSON arrays on the item row.

Current development data:

- 6 users and 6 roles.
- 1 merchant, 1 merchant user, and 1 store.
- 2 menu items.
- 2 group-buy activities and 5 promotion tiers.
- 0 orders, payment authorizations, captures, settlements, or pickup credentials.

Prototype test database: `database/test/drink-group-buy-test.sqlite`.

- 9 users, 7 stores, and 8 menu items.
- Map data is exported to `mobile/src/mock/databaseMapStores.js`; it is not live database access.

## Next Vertical Slice

Recommended next slice:

1. Load activities from the backend when mobile starts.
2. Add menu read APIs.
3. Add transactional order creation and order item persistence.
4. Move payment authorization state from mobile local state into backend/database mock endpoints.
5. Add merchant acceptance, ready-for-pickup, and pickup credential APIs.
