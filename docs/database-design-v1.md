# Database Design v1

Last updated: 2026-07-02

This document is the current database design baseline for DrinkGroupBuy. It describes the local SQLite development schema and keeps the design friendly for a future PostgreSQL migration.

The authoritative implementation draft is still `database/schema.sql`. This document explains the design in product terms.

## Direction

- Current development database: SQLite at `database/drink-group-buy-dev.sqlite`.
- Current schema source: `database/schema.sql`.
- Current seed source: `database/seed-dev.sql`.
- Future production database target: PostgreSQL.
- SQLite is currently used as the local development backend database, not just mock data.
- Firebase is not planned as the main production database. It may still be considered later for Auth, push notifications, or storage if needed.

## Current Development Data

As of 2026-07-02, the local development database contains:

| Data area | Current count | Notes |
| --- | ---: | --- |
| Users | 12 | 4 customers, 7 merchants, 1 admin |
| User roles | 12 | One active role per seeded user |
| Merchants | 7 | One merchant organization per test store |
| Merchant users | 7 | Each merchant account owns one merchant |
| Stores | 7 | Includes map coordinates |
| Menu items | 8 | Development menu items |
| Group-buy activities | 0 | Cleared for clean testing |
| Promotion tiers | 0 | Cleared with activities |
| Orders | 0 | Cleared for clean testing |
| Payment authorizations | 0 | Cleared for clean testing |
| Payment captures | 0 | Cleared for clean testing |
| Pickup credentials | 0 | Cleared for clean testing |

## Main Entity Groups

### Identity And Roles

| Table | Purpose | Primary key | Important relationships |
| --- | --- | --- | --- |
| `users` | Stores account identity shared by customers, merchants, and admins | `id` | 1 user can have many roles |
| `user_roles` | Stores the role granted to a user | `id` | Many roles belong to one user |

Current login direction:

- Customers use phone number plus password.
- Merchants use email plus password.
- Admin uses email plus password.
- Passwords are stored as hashes, not plain text.

Future PostgreSQL direction:

- Keep `users` and `user_roles` as normalized relational tables.
- Add stronger production constraints later, such as verified phone/email fields, password reset fields, and session or refresh-token storage.
- If Firebase Auth is ever used, keep payment/order ownership in PostgreSQL and link `users` to the Firebase Auth UID.

### Merchant And Store

| Table | Purpose | Primary key | Important relationships |
| --- | --- | --- | --- |
| `merchants` | Business organization | `id` | 1 merchant can own many stores |
| `merchant_users` | Links merchant accounts to merchants | `id` | Many-to-many bridge between users and merchants |
| `stores` | Physical pickup and map location | `id` | Store belongs to one merchant |

Design note:

- `merchant` means the business owner/company.
- `store` means the physical branch shown on the map and used for pickup.

Future PostgreSQL direction:

- Keep `merchants`, `stores`, and `merchant_users` as separate relational tables.
- Use foreign keys and indexes for merchant permission checks.
- This structure maps directly from SQLite to PostgreSQL.

### Menu And Customization

| Table | Purpose | Primary key | Important relationships |
| --- | --- | --- | --- |
| `menu_items` | Drink/product sold by a store | `id` | Many menu items belong to one store |
| `customization_options` | Sweetness, ice, topping, size options | `id` | Many options belong to one menu item |

Design note:

- Customization options are rows, not comma-separated text.
- This keeps the menu compatible with first normal form.

Future PostgreSQL direction:

- Keep `menu_items` and `customization_options` as normalized relational tables.
- Add indexes by `store_id`, `category`, and availability if menu queries grow.

### Group-Buy Activity

| Table | Purpose | Primary key | Important relationships |
| --- | --- | --- | --- |
| `group_buy_activities` | Merchant-created group-buy event | `id` | Activity belongs to one store |
| `promotion_tiers` | Cup thresholds and discount amount | `id` | Many tiers belong to one activity |
| `activity_notices` | Merchant notes shown on activity detail | `id` | Many notices belong to one activity |

Important rules:

- A merchant opens a group-buy activity.
- Opening an activity starts it immediately.
- Merchant sets `deadline_at`.
- The system locks orders at deadline.
- Promotion is based on authorized cups.
- If tiers are 20, 30, and 40 cups, the maximum accepted cups should be 40 unless a separate capacity rule is added later.
- The displayed target should be the next not-yet-reached tier. Example: 25 authorized cups with 20/30/40 tiers should display `25 / 30`.

Future PostgreSQL direction:

- Keep `group_buy_activities`, `promotion_tiers`, and `activity_notices` as relational tables.
- Use transactions and row locking for activity settlement and maximum-cup enforcement.
- PostgreSQL is the preferred target for concurrent order submission and deadline settlement.

### Cart Draft

| Table | Purpose | Primary key | Important relationships |
| --- | --- | --- | --- |
| `cart_drafts` | Customer-selected items before order submission | `id` | Cart belongs to one user and one activity |
| `cart_draft_items` | One drink in the cart | `id` | Many items belong to one cart |
| `cart_draft_item_customizations` | One selected option for a cart item | `id` | Many customizations belong to one cart item |

Important rules:

- Adding drinks to the cart should not immediately create a final order.
- Submitting the cart creates an order and starts LINE Pay authorization.
- If an already-authorized order is modified, the old authorization should not be cancelled until the customer confirms reauthorization.

Future PostgreSQL direction:

- Keep cart drafts in relational tables if server-side carts remain required.
- Consider expiring abandoned carts by scheduled backend job.
- Use transactions when converting a cart draft into an order.

### Orders

| Table | Purpose | Primary key | Important relationships |
| --- | --- | --- | --- |
| `orders` | One customer's submitted participation in one activity | `id` | Order belongs to one activity and one customer |
| `order_items` | Snapshot of one ordered drink | `id` | Many items belong to one order |
| `order_item_customizations` | Snapshot of selected options | `id` | Many customizations belong to one order item |

Important rules:

- Order item names and prices are stored as snapshots.
- This preserves the customer's submitted order even if menu data changes later.
- Order status and pickup status are separate.
- Customer active orders should show only orders for the logged-in customer.
- Nearby recruiting activities should show all recruiting activities, not only joined activities.

Future PostgreSQL direction:

- Keep orders and order item snapshots in normalized relational tables.
- Add `order_revisions` before implementing authorized order modification.
- Use PostgreSQL transactions to prevent over-capacity joins and inconsistent order/payment state.

### Payment

| Table | Purpose | Primary key | Important relationships |
| --- | --- | --- | --- |
| `payment_authorizations` | LINE Pay authorization attempt | `id` | Many authorizations can belong to one order |
| `payment_captures` | Capture after final discount is known | `id` | Capture belongs to one authorization and one order |
| `payment_provider_events` | Provider events and webhook records | `id` | Logical reference to payment resources |

Current payment direction:

1. Customer submits cart.
2. Backend creates an order.
3. Backend creates a LINE Pay authorization request.
4. LINE Pay redirects back to backend confirm endpoint.
5. Backend marks authorization and order as authorized.
6. Only authorized cups count toward group-buy tiers.
7. At deadline, the system should calculate the applied tier.
8. If qualified, backend should partial-capture the final amount.
9. If not qualified and customer does not accept original price, backend should void authorization.

Not yet implemented:

- Automatic deadline settlement job.
- LINE Pay capture.
- LINE Pay void.
- LINE Pay refund.
- Payment webhook processing.

Future PostgreSQL direction:

- Payment provider calls should not be done directly from the app.
- Use the backend to hold LINE Pay secrets and perform request signing.
- Store payment state in `payment_authorizations`, `payment_captures`, and `payment_provider_events`.
- PostgreSQL should be the source of truth for authorization, capture, void, refund, and webhook reconciliation.

### Settlement And Pickup

| Table | Purpose | Primary key | Important relationships |
| --- | --- | --- | --- |
| `activity_settlements` | Deadline result and applied tier | `id` | One settlement per activity |
| `pickup_credentials` | Pickup code shown to customer | `id` | One credential per order |

Important rules:

- Pickup credential should appear only after merchant acceptance / order readiness rule is satisfied.
- Merchant can mark an order completed.
- Customer historical orders should include completed, cancelled, failed, or admin-cancelled orders.

Future PostgreSQL direction:

- Keep `activity_settlements` and `pickup_credentials` as relational tables.
- Use a unique settlement per activity and a unique pickup credential per order.

### History And Audit

| Table | Purpose | Primary key | Important relationships |
| --- | --- | --- | --- |
| `status_history` | Status transition records | `id` | Polymorphic resource reference |
| `audit_logs` | Sensitive actor/action record | `id` | Polymorphic resource reference |

Design note:

- Status changes should be traceable.
- Admin cancellation, merchant acceptance, payment state changes, deadline settlement, and pickup completion should write history.
- Audit logs are especially important for payment, cancellation, permission, and admin actions.

Future PostgreSQL direction:

- Keep `status_history` and `audit_logs` as append-only relational tables.
- Add indexes by resource and actor for later admin review.

## Current Primary Keys

All current tables use text primary keys named `id`.

PostgreSQL v1 decision: keep `text` primary keys. Do not switch to UUID during the first PostgreSQL migration.

Reason:

- Easier to reference in API JSON as `id`.
- Easier to migrate from SQLite to PostgreSQL without changing mobile/API ID handling.
- Easier to create readable development IDs such as `user-customer-yinji` or `store-001`.
- UUID remains a future option, but it is not part of the first PostgreSQL migration.

Important caution:

- `id` alone is acceptable inside each table.
- Foreign keys must still be explicit, such as `user_id`, `store_id`, `activity_id`, and `order_id`.

## PostgreSQL Time Field Decision

PostgreSQL v1 decision: use `timestamptz` for time fields.

This applies to fields such as:

- `created_at`
- `updated_at`
- `start_at`
- `deadline_at`
- `pickup_start_at`
- `pickup_end_at`
- `submitted_at`
- `authorized_at`
- `voided_at`
- `captured_at`
- `settled_at`

Reason:

- Group-buy deadlines, payment states, and pickup windows must be stored as reliable points in time.
- The app can display Taiwan local time, but the database should not store UI-formatted time strings as the long-term production format.

## PostgreSQL Boolean Field Decision

PostgreSQL v1 decision: use `boolean` for true/false fields.

Current SQLite fields stored as `0` / `1` should become PostgreSQL booleans:

| Field | PostgreSQL type | Meaning |
| --- | --- | --- |
| `menu_items.is_available` | `boolean` | Drink availability |
| `customization_options.is_available` | `boolean` | Customization option availability |
| `pickup_credentials.visible_after_merchant_acceptance` | `boolean` | Pickup credential visibility rule |

API JSON should expose these values as `true` / `false`.

## Normalization Check

### First Normal Form

The canonical schema is mostly first-normal-form friendly:

- One table cell stores one value.
- Cart customizations are stored in child rows.
- Order customizations are stored in child rows.
- Promotion tiers are stored as rows.

Accepted exceptions:

- `payment_provider_events.payload_json` stores raw provider payload JSON.
- `audit_logs.metadata_json` stores raw audit metadata JSON.

These exceptions are acceptable because they are raw event/audit payloads, not primary query fields.

PostgreSQL v1 decision: store these fields as `jsonb`.

| Field | PostgreSQL type | Use |
| --- | --- | --- |
| `payment_provider_events.payload_json` | `jsonb` | Raw provider event payload |
| `audit_logs.metadata_json` | `jsonb` | Action-specific audit metadata |

Do not use JSON fields for core order, drink, customization, promotion, payment status, or pickup status data.

### Second Normal Form

The schema is mostly second-normal-form friendly:

- Tables use single-column primary keys.
- Business attributes depend on the row's own `id`.
- Many-to-many relationships are separated into bridge tables such as `merchant_users`.

### Third Normal Form

The schema is mostly third-normal-form friendly:

- Store data belongs to `stores`, not repeated in activities or orders.
- Menu base data belongs to `menu_items`.
- Order item snapshots intentionally duplicate item name and price to preserve transaction history.

Intentional duplication:

- `item_name_snapshot`
- `unit_price_snapshot`
- `label_snapshot`
- `price_delta_snapshot`

These are not normalization mistakes. They are historical snapshots needed for orders and payment disputes.

## Status Owners

PostgreSQL v1 decision: keep status fields as `text check (...)`. Do not use PostgreSQL enum in the first migration.

Reason:

- Status flows are still changing during product development.
- `text check (...)` keeps valid-value protection while remaining easier to modify.
- PostgreSQL enum can be reconsidered after activity, order, payment, and pickup flows stabilize.

| Owner | Current status field | Current values |
| --- | --- | --- |
| User | `users.status` | `active`, `disabled`, `deleted` |
| Role | `user_roles.status` | `active`, `disabled` |
| Merchant | `merchants.status` | `active`, `disabled` |
| Store | `stores.business_status` | `open`, `closed`, `temporarily_closed` |
| Activity | `group_buy_activities.status` | `draft`, `recruiting`, `confirmed`, `failed`, `ordering`, `ready_for_pickup`, `completed`, `cancelled` |
| Cart | `cart_drafts.status` | `active`, `submitted`, `expired`, `cancelled` |
| Order | `orders.status` | `draft`, `submitted`, `locked`, `cancelled`, `completed` |
| Payment | `orders.payment_status` | `pending`, `authorized`, `captured`, `authorization_voided`, `failed`, `refunded` |
| Authorization | `orders.authorization_status`, `payment_authorizations.status` | `pending`, `authorized`, `captured`, `authorization_voided`, `failed` |
| Merchant acceptance | `orders.merchant_acceptance_status` | `pending`, `accepted`, `rejected`, `cancelled` |
| Pickup | `orders.pickup_status` | `not_ready`, `ready`, `picked_up`, `cancelled`, `expired` |
| Settlement | `activity_settlements.outcome` | `qualified`, `failed`, `cancelled` |

## Recommended Next Database Step

The next database step should be small:

1. Confirm whether the current schema's table list is accepted as database design v1.
2. Add an `order_revisions` design if order modification after authorization remains required.
3. Add a deadline-settlement design for locking orders and choosing promotion tiers.
4. Use `docs/postgresql-migration-plan.md` as the migration roadmap before changing backend runtime database code.

## Open Questions

1. Should `group_buy_activities.maximum_cups` always equal the highest `promotion_tiers.target_cups`, or can it be a separate merchant-configured capacity?
2. Do we need an `order_revisions` table before implementing real order modification?
3. Should pickup status include `preparing`, or should preparation be represented by activity/order status only?
4. Should rejected merchant orders be possible after payment authorization?
5. Should failed group buys with `accept_original_price` create captures at original price?
6. Should Firebase be used at all, or should authentication also remain fully backend/PostgreSQL based?
7. Should customer phone numbers be encrypted or only normalized and protected by access control?
8. How long should LINE Pay authorizations remain valid?
9. Should deadline settlement be triggered by backend cron, Cloud Functions, or merchant action fallback?
10. What data must be retained after a user requests account deletion?
