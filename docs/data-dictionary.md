# Data Dictionary

Last updated: 2026-06-25

This document defines preferred product terminology. It is used to keep mobile UI, API JSON, and database naming consistent.

## Core Terms

| Chinese term | Meaning | Mobile / API (`camelCase`) | Database (`snake_case`) | Notes |
| --- | --- | --- | --- | --- |
| 使用者 | A person with one or more roles | `user`, `userId` | `users`, `user_id` | Roles can be customer, merchant, or admin |
| 使用者角色 | A permission role attached to a user | `userRole`, `role` | `user_roles`, `role` | Current roles: `customer`, `merchant`, `admin` |
| 商家 | Business organization | `merchant`, `merchantId` | `merchants`, `merchant_id` | Not the same as a physical store |
| 門市 / 店家 | Physical ordering and pickup location | `store`, `storeId` | `stores`, `store_id` | Prefer `store`; avoid introducing `shop` |
| 菜單品項 | Drink or product sold by a store | `menuItem`, `menuItemId` | `menu_items`, `menu_item_id` | Base price is stored here |
| 客製化選項 | Sweetness, ice, topping, or size option | `customizationOption` | `customization_options` | Some options may add price |
| 團購活動 | Merchant-created group-buy event | `groupBuyActivity`, `activityId` | `group_buy_activities`, `activity_id` | Mobile prototype may still use `deal` |
| 優惠級距 | Cup threshold and discount amount | `promotionTier`, `tierId` | `promotion_tiers`, `tier_id` | Example: 20 cups discount 200 |
| 活動注意事項 | Merchant note shown on activity detail | `activityNotice` | `activity_notices` | Stored separately for multiple notes |
| 購物車草稿 | Items selected but not submitted as an order | `cartDraft`, `cartDraftId` | `cart_drafts`, `cart_draft_id` | Used before payment authorization |
| 購物車品項 | One drink item in a cart draft | `cartDraftItem` | `cart_draft_items` | Customizations are stored in child rows |
| 購物車客製化明細 | One selected option for one cart item | `cartDraftItemCustomization` | `cart_draft_item_customizations` | Keeps cart data first-normal-form friendly |
| 訂單 | One customer's participation in one activity | `order`, `orderId` | `orders`, `order_id` | Contains one or more order items |
| 訂單品項 | One drink item snapshot inside an order | `orderItem`, `orderItemId` | `order_items`, `order_item_id` | Preserve item name and price snapshots |
| 訂單客製化明細 | One selected option snapshot for one order item | `orderItemCustomization` | `order_item_customizations` | Preserve sweetness, ice, topping, and size as rows |
| 原價金額 | Amount calculated before discount | `originalAmount` | `original_amount` | Integer New Taiwan dollar amount |
| 預授權金額 | Amount authorized by payment provider | `authorizedAmount` | `authorized_amount` | Not captured yet |
| 最終金額 | Amount after final tier calculation | `finalAmount` | `final_amount` | Determined at settlement |
| 請款金額 | Amount actually captured | `captureAmount` | `capture_amount` | Must not exceed valid authorization |
| 釋放金額 | Authorized amount not captured | `releasedAmount` | `released_amount` | Release timing depends on provider/bank |
| 付款預授權 | Payment provider authorization attempt | `paymentAuthorization` | `payment_authorizations` | Target flow is LINE Pay-like authorization |
| 付款請款 | Capture after activity settlement | `paymentCapture` | `payment_captures` | May be partial capture |
| 金流事件 | Provider webhook or event payload | `paymentProviderEvent` | `payment_provider_events` | Needed for idempotency and reconciliation |
| 活動結算 | Deadline outcome and applied tier | `activitySettlement` | `activity_settlements` | Should be created once and auditable |
| 商家接單狀態 | Whether merchant accepted production | `merchantAcceptanceStatus` | `merchant_acceptance_status` | Separate from order and pickup status |
| 取貨狀態 | Preparation and pickup lifecycle | `pickupStatus` | `pickup_status` | `ready` means pickup code may be shown |
| 取貨憑證 | Customer code/QR used at pickup | `pickupCredential`, `pickupCode` | `pickup_credentials`, `pickup_code` | Must belong to exactly one order |
| 狀態歷史 | Immutable status transition record | `statusHistory` | `status_history` | Include actor, reason, and timestamp |
| 稽核紀錄 | Sensitive actor/action record | `auditLog` | `audit_logs` | Required for admin, payment, and cancellation actions |

## Derived Values

| Term | Meaning | Rule |
| --- | --- | --- |
| 已預授權杯數 | Cups from orders whose payment authorization succeeded | Count only orders with authorized payment state |
| 下一級目標杯數 | Lowest promotion tier above current authorized cups | Example: 25 cups with tiers 20/30/40 shows 30 |
| 剩餘杯數 | Cups needed to reach next displayed target | `nextTargetCups - authorizedCups`, minimum 0 |
| 是否達標 | Whether an activity reached a promotion tier | Based on authorized cups at deadline or current display |

## Normalization Notes

- Core transaction data should avoid storing multiple selected options in one JSON/text column.
- Cart item and order item customizations are stored as child rows so one row represents one selected option.
- `payment_provider_events.payload_json` and `audit_logs.metadata_json` are retained as raw external-event/audit payloads, not as query-oriented business fields.

## Deprecated Or Legacy Terms

| Legacy term | Preferred replacement | Reason |
| --- | --- | --- |
| `deal` | `groupBuyActivity` / `activity` | UI shorthand is ambiguous in backend/database work |
| `groupOrder` for an activity | `groupBuyActivity` | An order belongs to a customer; an activity belongs to a store |
| `shop` | `store` | Current schema and mobile mock use store |
| `discountTier` | `promotionTier` | Matches current database table |
| `paymentReport` | `paymentAuthorization` / `paymentCapture` | Manual transfer report flow is no longer the target payment model |

## Naming Rules

- Mobile variables and API JSON: `camelCase`.
- Database tables and columns: `snake_case`.
- Status values crossing API boundaries: use database-compatible `snake_case` values.
- Currency values are integer New Taiwan dollar amounts unless a future multi-currency requirement is approved.
