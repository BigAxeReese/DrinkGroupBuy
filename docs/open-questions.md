# Open Questions

Last updated: 2026-06-26

Only unresolved decisions that still affect implementation are retained here.

## Identity And Permission

| Priority | Question | Impact |
| --- | --- | --- |
| High | Can one user hold customer and merchant roles simultaneously? | Navigation, token claims, `user_roles` |
| High | How is a merchant user authorized for one or multiple stores? | Merchant API scope and `merchant_users` |
| High | How are administrator roles granted and audited? | Admin API security and audit logs |
| Medium | Which customer fields may merchants see besides surname? | Privacy and merchant order response |

## Stores And Menu

| Priority | Question | Impact |
| --- | --- | --- |
| High | Is `database/schema.sql` or the seven-store test DB the canonical seed source? | Map/menu consistency |
| Medium | Are menu options store-wide or item-specific? | Menu schema and customization UI |
| High | What happens when price or availability changes while an item is in cart? | Submit validation and conflict UX |
| Medium | How are store coordinates verified against Google Maps/Places? | Map trust and store onboarding |
| Medium | Should `database/test/` be normalized or replaced by the canonical dev schema? | Test data reliability and map/menu exports |

## Activity And Promotion

| Priority | Question | Impact |
| --- | --- | --- |
| Resolved | Does reaching the highest tier stop new orders immediately? | Yes. The highest promotion tier cup count is the maximum capacity; new orders must not exceed it. |
| High | After reaching a tier, can later exits lower the final tier before deadline? | Progress, authorization rollback, settlement |
| High | Is group discount divided by cups, orders, or item value? | `finalAmount` calculation and snapshots |
| Medium | Which activity fields may merchants edit after publishing? | API, version history, customer notices |
| High | Who runs deadline settlement and how are retries recovered? | Background job and transaction design |

## Orders

| Priority | Question | Impact |
| --- | --- | --- |
| High | Is one customer limited to one order per activity? | Unique constraints and edit behavior |
| High | Is the last 30 minutes join-only for both new and existing customers? | Lock validation and UI messaging |
| High | Should `readyForPickup` be an order status or only `pickupStatus = ready`? | Current mobile/schema mismatch |
| High | What immutable order revision data is required after authorization? | Audit and dispute handling |
| Medium | Can a customer remove all items, and does that equal cancelling the order? | Order lifecycle and cup rollback |
| Medium | Should order item customization snapshots store option IDs as nullable references, pure snapshots, or both? | Historical accuracy when menu options change |

## Payment

| Priority | Question | Impact |
| --- | --- | --- |
| High | Does the selected LINE Pay product support authorization plus partial capture? | Entire payment model |
| High | The current sandbox channel rejects `capture:false` with "Parameter is not allowed"; does this merchant account support separated authorization/capture through another setting or product type? | Determines whether partial capture can be implemented with LINE Pay |
| High | What is the authorization validity period? | Maximum activity duration and reauthorization |
| High | On failed activity, when is authorization voided? | Customer messaging and settlement job |
| High | How are capture failures retried or escalated? | Fulfillment eligibility and operations |
| High | How are webhook signatures, duplicate events, and out-of-order events handled? | Payment correctness |
| Resolved | Should LINE Pay confirm immediately update the order as `authorized`? | Yes for the first backend slice: confirm updates `payment_authorizations`, `orders.payment_status`, and `orders.authorization_status`. App sync after redirect remains open. |
| High | How should the mobile app receive the updated `authorized` status after LINE Pay redirect? | Polling, deep link, or order reload flow |
| High | Where should LINE Pay transaction IDs, request IDs, return codes, and raw provider events be persisted? | `payment_authorizations`, provider event tables, auditability |
| Medium | How should released amount timing be explained to users? | Payment UI and support |
| High | If an edited order exceeds the original authorization, must it be reauthorized before counting? | Authorized cup total and order edits |

## Pickup And Fulfillment

| Priority | Question | Impact |
| --- | --- | --- |
| High | Does merchant “完成訂單” mean preparation complete or customer pickup complete? | Button wording and status transition |
| High | Who changes `ready` to `picked_up`, and how is the code/QR verified? | Pickup API and audit trail |
| Medium | Can pickup windows change after customers are charged? | History and notification requirements |
| Medium | When does a pickup credential expire? | Credential schema and customer history |
| High | Should `preparing` be stored as pickup status or derived? | Current mobile/schema mismatch |

## Consistency And Operations

| Priority | Question | Impact |
| --- | --- | --- |
| High | How are simultaneous authorizations prevented from exceeding maximum cups? | Database locking/idempotency |
| High | What is the source of truth for authorized cup progress? | Avoid duplicated mutable counters |
| High | How does activity cancellation cascade to orders and payment authorizations? | Transactions and recovery |
| Medium | Which actions require audit logs beyond admin cancellation? | Storage and compliance |
| Medium | When should SQLite be replaced by PostgreSQL/MySQL, if at all? | Deployment and concurrency |

## Documentation And Naming

| Priority | Question | Impact |
| --- | --- | --- |
| Medium | When will mobile legacy `deal` variables/routes migrate to `groupBuyActivity`? | Cross-layer readability |
| Medium | Should `PaymentReportScreen` be renamed to `PaymentAuthorizationScreen` now? | UI/navigation naming consistency |
