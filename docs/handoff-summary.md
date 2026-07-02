# Handoff Summary

Last updated: 2026-07-02

Use this file when continuing work on another computer or handing the project to another AI assistant.

## Project Direction

DrinkGroupBuy is now a full-stack Android-first mobile app project.

Current structure:

```text
project-root/
+-- mobile/
+-- backend/
+-- database/
+-- docs/
+-- AGENTS.md
```

Current strategy:

- Mobile app: React Native + Expo.
- Backend: Node.js built-in HTTP server.
- Current development database: SQLite.
- Future production database target: PostgreSQL.
- Firebase is not the main database direction.
- LINE Pay sandbox flow has started.

## Most Important Rule

Do not commit secrets.

Secrets stay in:

```text
.env
mobile/.env
backend/.env
```

Examples:

- Google Maps API key.
- LINE Pay Channel ID / Channel Secret.
- Auth session secret.
- Future PostgreSQL `DATABASE_URL`.

## Current Mobile State

Technology:

- React Native + Expo.
- Android-first.
- Expo Web is used for current preview.

Implemented mobile areas:

- Login screen.
- Customer home.
- Google Maps live map.
- Store menu and drink customization.
- Cart.
- Customer orders and order history.
- Group progress.
- Payment authorization screen.
- Pickup code / pickup information.
- Merchant dashboard.
- Merchant activity creation.
- Merchant order handling and history.
- Admin dashboard and activity cancellation.

Important mobile limitation:

- Some runtime state is still mobile-local.
- App startup does not yet fully load authoritative activity/order/payment data from backend.
- Some screens may still rely on local prototype state or fallback behavior.

## Current Backend State

Backend location:

```text
backend/
```

Important files:

| File | Purpose |
| --- | --- |
| `backend/server.js` | HTTP API server |
| `backend/db.js` | SQLite database access |
| `backend/auth.js` | Development auth/token/password helpers |
| `backend/linePayClient.js` | LINE Pay sandbox request signing/client |
| `backend/README.md` | Backend instructions |

Implemented endpoints:

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/login` | Login |
| `GET` | `/health` | Health check |
| `GET` | `/api/group-buy-activities` | List group-buy activities |
| `POST` | `/api/merchant/group-buy-activities` | Merchant creates activity |
| `POST` | `/api/orders` | Customer creates order |
| `GET` | `/api/orders/:orderId` | Get order detail |
| `DELETE` | `/api/admin/group-buy-activities/:activityId` | Admin cancels activity |
| `POST` | `/api/payments/line-pay/request` | Create LINE Pay sandbox authorization request |
| `GET` | `/api/payments/line-pay/confirm` | LINE Pay confirm redirect |
| `GET` | `/api/payments/line-pay/cancel` | LINE Pay cancel redirect |

Current backend limitations:

- No registration.
- No password reset.
- No production auth/session design.
- No LINE Pay capture/void/refund yet.
- No payment webhook handling yet.
- No pickup APIs yet.
- No deadline settlement job yet.
- Backend still uses SQLite.

## Current Login Test Accounts

Customer login uses phone number + password.

| User | Phone | Password |
| --- | --- | --- |
| A | `0911000001` | `customer1` |
| B | `0911000002` | `customer2` |
| C | `0911000003` | `customer3` |
| D | `0911000004` | `customer4` |

Merchant login uses email + password.

| Store | Email | Password |
| --- | --- | --- |
| Store 1 | `store1@example.com` | `merchant1` |
| Store 2 | `store2@example.com` | `merchant2` |
| Store 3 | `store3@example.com` | `merchant3` |
| Store 4 | `store4@example.com` | `merchant4` |
| Store 5 | `store5@example.com` | `merchant5` |
| Store 6 | `store6@example.com` | `merchant6` |
| Store 7 | `store7@example.com` | `merchant7` |

Admin login:

| Email | Password |
| --- | --- |
| `admin@example.com` | `admin1` |

## Current Database State

Current development database:

```text
database/drink-group-buy-dev.sqlite
```

Current SQLite schema:

```text
database/schema.sql
```

Current seed:

```text
database/seed-dev.sql
```

Current local development data:

| Data area | Count |
| --- | ---: |
| Users | 12 |
| User roles | 12 |
| Merchants | 7 |
| Merchant users | 7 |
| Stores | 7 |
| Menu items | 8 |
| Group-buy activities | 0 |
| Promotion tiers | 0 |
| Orders | 0 |
| Payment authorizations | 0 |
| Payment captures | 0 |
| Pickup credentials | 0 |

Meaning:

- Account/store/menu seed data exists.
- Group-buy/order/payment runtime data has been cleared for clean testing.

## PostgreSQL Direction

PostgreSQL is the future production database target.

Important docs:

| File | Purpose |
| --- | --- |
| `docs/database-design-v1.md` | Current database design baseline |
| `docs/postgresql-migration-plan.md` | SQLite to PostgreSQL migration plan |
| `database/migrations/001_initial_postgres.sql` | PostgreSQL v1 schema draft |

PostgreSQL v1 decisions:

| Area | Decision |
| --- | --- |
| Primary key | `text` |
| Time fields | `timestamptz` |
| Boolean fields | `boolean` |
| Raw JSON fields | `jsonb` |
| Status fields | `text check (...)` |
| Money amount | `integer` NTD |

Important:

- PostgreSQL is not implemented yet.
- Backend still uses SQLite.
- The migration file is a draft and is not wired into runtime.

## LINE Pay State

Current direction:

- Customer submits cart.
- Backend creates order.
- Backend creates LINE Pay sandbox authorization request.
- LINE Pay redirects back to backend confirm endpoint.
- Backend marks order/payment authorization as authorized.

Current limitations:

- Only authorization/confirm is started.
- Capture is not implemented.
- Void is not implemented.
- Refund is not implemented.
- Webhook handling is not implemented.
- Deadline settlement is not implemented.

Security rule:

- LINE Pay secrets must stay in `backend/.env`.
- Mobile app must never hold LINE Pay Channel Secret.

## Important Product Rules Already Decided

- Merchant opens group-buy activities.
- Customer joins by selecting drinks, adding to cart, submitting order, and going through LINE Pay authorization.
- Only authorized cups count toward promotion thresholds.
- If tiers are 20 / 30 / 40 cups, the max capacity should be 40 unless a separate capacity rule is added later.
- If current authorized cups are 25 with tiers 20 / 30 / 40, display should be `25 / 30`.
- Customer active orders should show only that customer's joined activities.
- Nearby recruiting activities should show all recruiting activities.
- Order modification after authorization should require reauthorization.
- Existing authorization should not be cancelled until the customer confirms reauthorization.
- Store pickup code should be shown only after the merchant-side readiness rule is satisfied.

## Known High-Priority Gaps

1. Mobile startup should load activities from backend instead of relying on stale local activity data.
2. Menu read APIs are needed.
3. Order list/detail should become backend-authoritative.
4. Order modification API is needed.
5. Order revision history is needed before real authorized order edits.
6. Deadline settlement job is needed.
7. LINE Pay capture/void/refund needs implementation.
8. Payment webhook/idempotency handling is needed.
9. Pickup credential API is needed.
10. PostgreSQL seed draft is not created yet.

## Suggested Next Step

Recommended next step:

Create a PostgreSQL seed draft:

```text
database/migrations/002_seed_dev_postgres.sql
```

Purpose:

- Seed 4 customers.
- Seed 7 merchants.
- Seed 1 admin.
- Seed 7 stores.
- Seed menu items.
- Do not seed old group-buy activities unless needed for tests.

After that, choose one of these paths:

1. Continue SQLite feature work first.
2. Start PostgreSQL implementation slice.
3. Make mobile load backend activity/menu/order data more consistently.

## How To Continue On Another Computer

1. Pull or copy the project.
2. Read `AGENTS.md`.
3. Read this file: `docs/handoff-summary.md`.
4. Read `docs/current-progress.md`.
5. Check local `.env` files manually. They are not committed.
6. Install dependencies if needed:

```bash
npm install
cd mobile
npm install
```

7. Start backend and mobile according to `backend/README.md` and `mobile/README.md`.

Do not expect secrets or local SQLite runtime data to automatically exist on the new computer unless copied separately.
