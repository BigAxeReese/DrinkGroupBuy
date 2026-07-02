# PostgreSQL Migration Plan

Last updated: 2026-07-02

This document describes the planned migration path from the current SQLite development database to PostgreSQL. It is a planning document only. PostgreSQL is not implemented yet.

## Current State

- Current development database: SQLite.
- SQLite schema source: `database/schema.sql`.
- SQLite seed source: `database/seed-dev.sql`.
- Backend currently uses Node.js built-in SQLite driver.
- PostgreSQL is the intended future production database target.

## Why PostgreSQL

PostgreSQL is a better fit than SQLite for the future production version because DrinkGroupBuy has:

- Customer orders.
- LINE Pay authorization, capture, void, refund, and webhook state.
- Group-buy deadline settlement.
- Promotion tier calculations.
- Concurrent joins when many users submit orders near the same time.
- Merchant/admin permissions.
- Audit and status history requirements.

## Migration Principles

1. Keep the current table boundaries.
2. Keep database names in `snake_case`.
3. Keep API JSON names in `camelCase`.
4. Preserve transaction history through snapshot fields.
5. Do not let the mobile app directly write payment or settlement state.
6. Use backend transactions for order submission, authorization refresh, and deadline settlement.
7. Introduce PostgreSQL in a small vertical slice instead of rewriting everything at once.
8. Use `text` primary keys for the first PostgreSQL version. Do not switch to UUID during the initial migration.

## Primary Key Decision

Decision: keep `text` IDs for the first PostgreSQL version.

Reason:

- The current SQLite schema already uses text IDs.
- The mobile app and backend API already pass IDs as strings.
- Keeping text IDs reduces migration risk.
- Development seed data remains readable for project demonstration.
- UUID can still be introduced later if the production version needs it.

Example:

```sql
id text primary key
```

## Time Field Decision

Decision: use `timestamptz` for PostgreSQL time fields.

Reason:

- Group-buy deadlines must be interpreted consistently.
- LINE Pay authorization/capture/void timestamps need reliable auditability.
- Pickup windows are time-sensitive.
- `timestamptz` keeps an absolute point in time and avoids ambiguous local-time storage.

Rule:

- Store backend/database timestamps as `timestamptz`.
- API responses can still return ISO 8601 strings.
- UI may display Taiwan local time, but storage should not depend on UI formatting.

Examples:

```sql
created_at timestamptz not null
updated_at timestamptz not null
deadline_at timestamptz not null
authorized_at timestamptz
```

PostgreSQL v1 time fields should include:

- `created_at`
- `updated_at`
- `granted_at`
- `start_at`
- `deadline_at`
- `pickup_start_at`
- `pickup_end_at`
- `submitted_at`
- `expires_at`
- `authorized_at`
- `voided_at`
- `captured_at`
- `received_at`
- `processed_at`
- `settled_at`

## Boolean Field Decision

Decision: use PostgreSQL `boolean` for true/false fields.

Reason:

- SQLite currently represents booleans as `INTEGER` with `0` or `1`.
- PostgreSQL has a real `boolean` type.
- `true` / `false` is clearer for availability, visibility, and feature flags.
- API JSON should also expose booleans as `true` / `false`, not `0` / `1`.

Current SQLite fields that should become PostgreSQL `boolean`:

| Current field | PostgreSQL type | Meaning |
| --- | --- | --- |
| `menu_items.is_available` | `boolean` | Whether a drink can be ordered |
| `customization_options.is_available` | `boolean` | Whether a customization option can be selected |
| `pickup_credentials.visible_after_merchant_acceptance` | `boolean` | Whether pickup credential visibility depends on merchant acceptance |

Examples:

```sql
is_available boolean not null default true
visible_after_merchant_acceptance boolean not null default true
```

## JSON Field Decision

Decision: use PostgreSQL `jsonb` for raw provider payloads and audit metadata.

Fields:

| Current SQLite field | PostgreSQL type | Purpose |
| --- | --- | --- |
| `payment_provider_events.payload_json` | `jsonb` | Store raw LINE Pay or payment-provider event payloads |
| `audit_logs.metadata_json` | `jsonb` | Store action-specific audit metadata |

Reason:

- Payment provider payloads may contain nested or provider-specific fields.
- Audit metadata differs by action type.
- `jsonb` allows PostgreSQL to validate and query JSON structure better than plain text.
- These fields are trace/debug/audit records, not the source of core business state.

Important rule:

- Do not use `jsonb` for core normalized business data such as order items, customization options, promotion tiers, payment status, or pickup status.
- Core business fields must stay in relational columns and child tables.

Examples:

```sql
payload_json jsonb
metadata_json jsonb
```

## Status Field Decision

Decision: use `text check (...)` for PostgreSQL v1 status fields. Do not use PostgreSQL `enum` in the first migration.

Reason:

- Product flow is still evolving.
- Status values may still be renamed, added, or removed.
- `text check (...)` still prevents invalid values while staying easier to change than enum.
- PostgreSQL enum can be reconsidered later when the state flows are stable.

Examples:

```sql
status text not null check (status in ('recruiting', 'confirmed', 'failed', 'cancelled'))
payment_status text not null check (payment_status in ('pending', 'authorized', 'captured', 'authorization_voided', 'failed', 'refunded'))
```

Current status-like fields:

- `users.status`
- `user_roles.status`
- `merchants.status`
- `merchant_users.status`
- `stores.business_status`
- `group_buy_activities.status`
- `cart_drafts.status`
- `orders.status`
- `orders.payment_status`
- `orders.authorization_status`
- `orders.merchant_acceptance_status`
- `orders.pickup_status`
- `payment_authorizations.status`
- `payment_captures.status`
- `activity_settlements.outcome`

## SQLite To PostgreSQL Type Mapping

| Current SQLite type / pattern | PostgreSQL candidate | Notes |
| --- | --- | --- |
| `TEXT PRIMARY KEY` | `text PRIMARY KEY` | First PostgreSQL version keeps text IDs |
| `TEXT` datetime | `timestamptz` | Recommended for `created_at`, `updated_at`, `deadline_at`, payment timestamps |
| `INTEGER` money amount | `integer` | Store NTD as integer dollars for now |
| `INTEGER` boolean with `CHECK (0, 1)` | `boolean` | Example: `is_available`, `visible_after_merchant_acceptance` |
| `REAL` latitude/longitude | `double precision` | Good enough for map coordinates |
| `payload_json`, `metadata_json` as `TEXT` | `jsonb` | Better querying for provider events and audit logs |
| `CHECK (...)` status strings | `text CHECK (...)` | PostgreSQL v1 keeps text checks; no enum yet |
| `UNIQUE (...)` | same | Directly supported |
| `REFERENCES ... ON DELETE CASCADE` | same | Directly supported |

## Recommended PostgreSQL Tables

The first PostgreSQL version should keep the current SQLite table list:

| Group | Tables |
| --- | --- |
| Identity | `users`, `user_roles` |
| Merchant/store | `merchants`, `merchant_users`, `stores` |
| Menu | `menu_items`, `customization_options` |
| Activity | `group_buy_activities`, `promotion_tiers`, `activity_notices` |
| Cart | `cart_drafts`, `cart_draft_items`, `cart_draft_item_customizations` |
| Orders | `orders`, `order_items`, `order_item_customizations` |
| Payment | `payment_authorizations`, `payment_captures`, `payment_provider_events` |
| Settlement/pickup | `activity_settlements`, `pickup_credentials` |
| Traceability | `status_history`, `audit_logs` |

## Schema Changes To Consider Before PostgreSQL

These are not required for the first PostgreSQL migration, but they are strongly recommended before production:

| Area | Suggested change | Reason |
| --- | --- | --- |
| Order modification | Add `order_revisions` and revision item tables | Authorized order edits need before/after history |
| Payment idempotency | Add request idempotency keys for order and payment APIs | Prevent duplicate authorization/capture requests |
| Sessions | Add `sessions` or `refresh_tokens` table | Current auth token is development-oriented |
| Deadline settlement | Add fields for settlement job attempts | Needed for retries and failure visibility |
| Notifications | Add `notifications` or `notification_events` | Needed once push/in-app notifications are implemented |
| PII | Add phone/email verification and privacy policy fields | Needed before real users |

## Backend Migration Steps

### Phase 1: Preparation

- Keep SQLite running.
- Add PostgreSQL plan docs.
- Confirm schema v1 table list.
- Keep IDs as `text` for the first PostgreSQL version.
- Use `timestamptz` for PostgreSQL time fields.

### Phase 2: Add PostgreSQL Dependency

- Add `pg` or a query builder/migration tool.
- Add `DATABASE_URL` to `backend/.env`.
- Add `DATABASE_URL` to `.env.example` without secrets.
- Keep SQLite code path available during transition.

### Phase 3: Create PostgreSQL Schema

- Create a versioned migration file: `database/migrations/001_initial_postgres.sql`.
- Convert SQLite `schema.sql` into PostgreSQL-compatible SQL.
- Keep constraints and indexes.
- Use `jsonb` for raw provider/audit payload fields.

Status: draft migration file has been created but is not executed or wired into backend runtime.

### Phase 4: Seed PostgreSQL Dev Data

- Convert `database/seed-dev.sql` into PostgreSQL-compatible seed data.
- Preserve the 4 customer users, 7 merchant users, 1 admin, 7 stores, and menu items.
- Do not seed old group-buy activities unless explicitly needed for tests.

### Phase 5: Switch Backend Repository Layer

- Introduce a database adapter boundary in `backend/db.js` or a new `backend/repositories/` layer.
- Port one vertical slice first:
  1. Login.
  2. List activities.
  3. Merchant creates activity.
  4. Customer creates order.
  5. LINE Pay authorization confirm.
- Keep response shape stable for mobile.

### Phase 6: Validate Transactions

Validate transaction behavior for:

- Creating activity with promotion tiers.
- Submitting order and order items.
- Creating payment authorization.
- Confirming authorization.
- Counting authorized cups.
- Cancelling activity.

### Phase 7: Remove SQLite Runtime Dependency

Only after PostgreSQL passes the main flows:

- Stop using SQLite in backend runtime.
- Keep SQLite schema only as historical reference if useful.
- Update docs to mark PostgreSQL as active database.

## Required Environment Variables

Future backend `.env` candidates:

```text
DATABASE_URL=postgres://user:password@localhost:5432/drink_group_buy
AUTH_SESSION_SECRET=...
LINE_PAY_CHANNEL_ID=...
LINE_PAY_CHANNEL_SECRET=...
LINE_PAY_API_BASE_URL=...
LINE_PAY_CONFIRM_URL=...
LINE_PAY_CANCEL_URL=...
```

Never commit real values.

## Transaction Requirements

PostgreSQL migration should prioritize these transaction boundaries:

1. Activity creation:
   - Insert activity.
   - Insert promotion tiers.
   - Insert notices.
   - Insert status history.

2. Order submission:
   - Lock or validate activity.
   - Check status and deadline.
   - Check maximum cups.
   - Insert order.
   - Insert order items and customizations.
   - Create payment authorization record.

3. Payment confirm:
   - Lock order.
   - Update payment authorization.
   - Update order payment status.
   - Write status history and audit log.

4. Deadline settlement:
   - Lock activity.
   - Lock eligible authorized orders.
   - Count authorized cups.
   - Select promotion tier.
   - Create settlement.
   - Capture or void payments.
   - Write status history.

5. Activity cancellation:
   - Lock activity.
   - Cancel eligible orders.
   - Void eligible authorizations.
   - Write status history and audit log.

## Risks

| Risk | Why it matters | Mitigation |
| --- | --- | --- |
| SQLite and PostgreSQL behavior differences | Date/time, boolean, JSON, and locking differ | Add tests around critical transactions |
| Rewriting too much at once | Easy to break mobile flows | Migrate one vertical slice at a time |
| Secret leakage | PostgreSQL URL and LINE Pay secrets are sensitive | Keep `.env` ignored and use `.env.example` only for names |
| Payment inconsistency | Authorization/capture must be trustworthy | Backend-only payment state updates and audit logs |
| Over-capacity orders | Many users may submit at once | Use PostgreSQL transactions and row locks |

## Testing Checklist

Before switching backend runtime to PostgreSQL:

- Login works for customer phone/password.
- Login works for merchant email/password.
- Login works for admin email/password.
- Merchant can create an activity with promotion tiers.
- Customer can see recruiting activities.
- Customer can submit cart into an order.
- LINE Pay sandbox request can be created.
- LINE Pay confirm updates payment authorization and order state.
- Admin can cancel an activity.
- Cancelled activity moves affected customer orders to history.
- Authorized cup count displays the next tier correctly, for example `25 / 30`.

## Current Decision

Use PostgreSQL as the future production database target.

Keep SQLite as the current local development database until a dedicated PostgreSQL implementation slice begins.
