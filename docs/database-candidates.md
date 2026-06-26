# Database Inventory And Candidates

Last updated: 2026-06-24

The authoritative development draft is `database/schema.sql`. This document explains current entities and unresolved additions; it is not a migration file. Field-level details are listed in `docs/database-field-spec.md`.

## Implemented Development Entities

| Entity | Purpose | Important relationships |
| --- | --- | --- |
| `users`, `user_roles` | Identity and customer/merchant/admin roles | User 1:N roles |
| `merchants`, `merchant_users` | Business organization and authorized users | Merchant M:N users |
| `stores` | Physical store and map location | Merchant 1:N stores |
| `menu_items`, `customization_options` | Store menu and allowed customization | Store 1:N items; item 1:N options |
| `group_buy_activities` | Merchant-created group-buy activity | Store 1:N activities |
| `promotion_tiers` | Cup thresholds and group discount amounts | Activity 1:N tiers |
| `activity_notices` | Activity notes | Activity 1:N notices |
| `cart_drafts`, `cart_draft_items`, `cart_draft_item_customizations` | Optional server-side pre-submit cart | User/activity 1:N items; item 1:N selected options |
| `orders`, `order_items`, `order_item_customizations` | Customer participation and item/customization snapshots | Activity/user 1:N orders; order 1:N items; item 1:N selected options |
| `payment_authorizations` | Provider authorization attempts | Order 1:N authorizations |
| `payment_captures` | Partial/full capture result | Authorization/order 1:N captures |
| `payment_provider_events` | Idempotent provider webhook/event storage | References payment resources logically |
| `activity_settlements` | Deadline result and applied tier | Activity 1:1 settlement |
| `pickup_credentials` | Order pickup code | Order 1:1 credential |
| `status_history` | Status transitions and reasons | Polymorphic resource reference |
| `audit_logs` | Sensitive actor/action history | Polymorphic resource reference |

## Current Persistence Status

- Backend reads/writes `group_buy_activities`, `promotion_tiers`, `activity_notices`, `status_history`, and `audit_logs` for implemented activity APIs.
- Seed data populates users, roles, one merchant/store, menu items, activities, and tiers.
- Order, payment, settlement, and pickup tables currently contain no development records and are not connected to mobile flows.
- `database/test/` is a separate prototype fixture database. It must not be treated as production schema or live mobile persistence.
- Core cart/order customization data is now first-normal-form friendly: selected sweetness, ice, toppings, and size are represented as child rows instead of JSON arrays.
- Activity capacity is derived from the highest promotion tier. `group_buy_activities.maximum_cups` should match that highest tier unless a future separate capacity rule is explicitly added.

## Known Schema Gaps

| Area | Gap / decision |
| --- | --- |
| Order status | Mobile uses `readyForPickup`; schema does not. Decide whether pickup readiness belongs only to `pickup_status`. |
| Pickup status | Mobile uses `preparing`; schema does not. Add it or derive it from activity/acceptance state. |
| Order revisions | Authorized order edits need immutable before/after history. |
| Pricing snapshots | Exact applied tier and per-order discount allocation must be reproducible. |
| Store/menu source | Seven-store test database and one-store development database are not unified. |
| Authentication | Password/Google identity fields exist, but credential/session tables and policies are not implemented. |
| Notification | No notification delivery or event table yet. |
| Migrations | Current schema is recreated by script; no production migration history exists. |
| Test fixture normalization | `database/test/` still uses JSON fields for prototype map/menu exports and is not the canonical normalized schema. |

## Transaction Boundaries Required Later

1. Submit order: validate activity/menu/prices, write order/items, initiate or reserve authorization workflow.
2. Modify authorized order: preserve revision, void/re-authorize safely, update counted cups once.
3. Deadline settlement: lock activity/orders, count authorized cups, choose tier, persist settlement, capture/void each payment idempotently.
4. Cancel activity: cancel eligible orders, handle authorizations, write histories and audit records.
5. Pickup: validate credential, mark pickup/order completion, write history atomically.
