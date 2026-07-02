# Current Progress

Last updated: 2026-07-02

For moving to another computer or handing work to another AI assistant, read `docs/handoff-summary.md` first.

## Mobile

Technology: React Native + Expo, Android-first with Expo Web preview.

Implemented screens and flows:

- Login screen now calls backend authentication and stores a bearer token in the mobile API client.
- Customer login uses phone number and password.
- Merchant and administrator login use email and password.
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
| `POST` | `/api/auth/login` | Development phone-number/password login |
| `GET` | `/health` | Service health check |
| `GET` | `/api/group-buy-activities` | List activities and promotion tiers |
| `POST` | `/api/merchant/group-buy-activities` | Create an activity and tiers |
| `POST` | `/api/orders` | Create an order and order item snapshots from cart data |
| `GET` | `/api/orders/:orderId` | Return order detail and latest LINE Pay authorization |
| `DELETE` | `/api/admin/group-buy-activities/:activityId` | Soft-cancel an activity |
| `POST` | `/api/payments/line-pay/request` | Create a LINE Pay sandbox authorization request |
| `GET` | `/api/payments/line-pay/confirm` | LINE Pay redirect confirm endpoint |
| `GET` | `/api/payments/line-pay/cancel` | LINE Pay redirect cancellation endpoint |

Implemented safeguards:

- Transactional activity creation and cancellation.
- Transactional order creation with item/customization snapshots.
- Payment screen can refresh a backend order after LINE Pay redirect and update mobile-local payment state.
- Group-buy activity list now returns `authorizedCups` and `participantCount`; payment-state refresh also updates mobile group progress.
- Simple idempotency handling for activity creation.
- Status history and audit log on administrator cancellation.
- Request validation for required activity fields.
- LINE Pay request signing keeps Channel ID/Secret on the backend only.
- LINE Pay request now requires a matching backend `orders` row, creates `payment_authorizations.status = pending`, and confirm updates the authorization and order to `authorized`.
- LINE Pay request now blocks duplicate requests when the latest authorization for the order is already `pending` or `authorized`.
- Customer order creation, order detail, and LINE Pay request now require a bearer token; `customerUserId` is derived from the authenticated user instead of trusting the request body.
- Merchant activity creation now requires a merchant bearer token; `createdByUserId` is derived from the authenticated user and the user must be linked to the selected store.
- Administrator activity cancellation now requires an admin bearer token; `actorUserId` is derived from the authenticated user for status history and audit log records.

Not implemented: registration, password reset, Google login, order modification APIs, durable LINE Pay redirect lookup across backend restarts, LINE Pay capture/void/refund, payment webhooks, pickup APIs, deadline settlement jobs, production migrations, and automated tests.

Important current limitation: `POST /api/orders` only works for activities that already exist in the backend SQLite database. A stale mobile-local activity will be rejected until mobile startup loads the backend activity list.

## Database

Development database: `database/drink-group-buy-dev.sqlite`.

The schema includes users/roles, merchants/stores, menu data, activities/tiers, carts, cart item customizations, orders/items, order item customizations, payment authorization/capture, settlement, pickup credentials, status history, and audit logs.

Core cart/order customization data has been adjusted toward first normal form: selected sweetness, ice, toppings, and size are stored as child rows instead of JSON arrays on the item row.

Database design v1 is now summarized in `docs/database-design-v1.md`. The current strategy is to continue using SQLite for local full-stack development while keeping IDs, entity boundaries, and payment/auth flows friendly for a future PostgreSQL migration.

The PostgreSQL migration roadmap is documented in `docs/postgresql-migration-plan.md`. PostgreSQL is not implemented yet.

A PostgreSQL v1 schema draft exists at `database/migrations/001_initial_postgres.sql`. It is not executed yet and the backend still uses SQLite.

Current development data:

- 12 users and 12 roles.
- 7 merchants, 7 merchant users, and 7 stores.
- 8 menu items.
- 0 group-buy activities and 0 promotion tiers.
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
