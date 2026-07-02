# Database Field Specification

Last updated: 2026-06-25

This document is a development field specification based on `database/schema.sql`. It is similar to a formal data dictionary, but it is not a production migration document yet.

## Legend

| Column | Meaning |
| --- | --- |
| No. | Field number within the table |
| Field name | Database column name |
| Chinese name | Business-facing name |
| Type | Current SQLite-oriented type |
| Key | PK, FK, UNIQUE, INDEX, or blank |
| Rule / format / range | Current rule, check constraint, or intended format |
| Example |

## `users`

| No. | Field name | Chinese name | Type | Key | Rule / format / range | Example |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | ????? | TEXT | PK | Recommend `user_` + unique suffix | `user_001` |
| 2 | `login_name` | ?????? | TEXT | UNIQUE | Kept for development compatibility; phone login is preferred | `customera` |
| 3 | `phone_number` | ???? | TEXT | UNIQUE | Primary password-login identifier; store normalized digits | `0911000001` |
| 4 | `email` | ???? | TEXT | UNIQUE | Nullable; reserved for real email contact/login later | `alice@example.com` |
| 5 | `password_hash` | ???? | TEXT |  | Store hash only, never plain password | `scrypt:salt:hash` |
| 6 | `google_subject_id` | Google ???? | TEXT | UNIQUE | Nullable; unique if Google login is used | `google-oauth-sub` |
| 7 | `display_name` | ???? | TEXT |  | Required | `Alice Wang` |
| 8 | `surname` | ?? | TEXT |  | Merchant may see surname only if privacy rule allows | `?` |
| 9 | `status` | ????? | TEXT |  | `active`, `disabled`, `deleted` | `active` |
| 10 | `created_at` | ???? | TEXT |  | ISO datetime string | `2026-06-25T10:00:00+08:00` |
| 11 | `updated_at` | ???? | TEXT |  | ISO datetime string | `2026-06-25T10:30:00+08:00` |

## `user_roles`

| No. | Field name | Chinese name | Type | Key | Rule / format / range | Example |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | 角色紀錄編號 | TEXT | PK | Recommend `role_` + unique suffix | `role_001` |
| 2 | `user_id` | 使用者編號 | TEXT | FK, UNIQUE pair | References `users(id)`; unique with `role` | `user_001` |
| 3 | `role` | 角色 | TEXT | UNIQUE pair | `customer`, `merchant`, `admin` | `customer` |
| 4 | `status` | 角色狀態 | TEXT |  | `active`, `disabled` | `active` |
| 5 | `granted_at` | 授權時間 | TEXT |  | ISO datetime string | `2026-06-25T10:00:00+08:00` |

## `merchants`

| No. | Field name | Chinese name | Type | Key | Rule / format / range | Example |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | 商家編號 | TEXT | PK | Recommend `merchant_` + unique suffix | `merchant_001` |
| 2 | `name` | 商家名稱 | TEXT |  | Required | `青山手作茶` |
| 3 | `status` | 商家狀態 | TEXT |  | `active`, `disabled` | `active` |
| 4 | `created_at` | 建立時間 | TEXT |  | ISO datetime string | `2026-06-25T10:00:00+08:00` |
| 5 | `updated_at` | 更新時間 | TEXT |  | ISO datetime string | `2026-06-25T10:30:00+08:00` |

## `merchant_users`

| No. | Field name | Chinese name | Type | Key | Rule / format / range | Example |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | 商家使用者關聯編號 | TEXT | PK | Recommend `merchant_user_` + unique suffix | `merchant_user_001` |
| 2 | `merchant_id` | 商家編號 | TEXT | FK, UNIQUE pair | References `merchants(id)`; unique with `user_id` | `merchant_001` |
| 3 | `user_id` | 使用者編號 | TEXT | FK, UNIQUE pair | References `users(id)` | `user_002` |
| 4 | `permission_level` | 權限等級 | TEXT |  | `owner`, `manager`, `staff` | `owner` |
| 5 | `status` | 關聯狀態 | TEXT |  | `active`, `disabled` | `active` |
| 6 | `created_at` | 建立時間 | TEXT |  | ISO datetime string | `2026-06-25T10:00:00+08:00` |

## `stores`

| No. | Field name | Chinese name | Type | Key | Rule / format / range | Example |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | 門市編號 | TEXT | PK | Recommend `store_` + unique suffix | `store_001` |
| 2 | `merchant_id` | 商家編號 | TEXT | FK | References `merchants(id)` | `merchant_001` |
| 3 | `name` | 門市名稱 | TEXT |  | Required | `青山手作茶 中山店` |
| 4 | `address` | 地址 | TEXT |  | Required | `台中市北區三民路三段...` |
| 5 | `phone` | 電話 | TEXT |  | Nullable | `04-1234-5678` |
| 6 | `business_status` | 營業狀態 | TEXT |  | `open`, `closed`, `temporarily_closed` | `open` |
| 7 | `latitude` | 緯度 | REAL | INDEX pair | Required; map coordinate | `24.1505` |
| 8 | `longitude` | 經度 | REAL | INDEX pair | Required; map coordinate | `120.6839` |
| 9 | `created_at` | 建立時間 | TEXT |  | ISO datetime string | `2026-06-25T10:00:00+08:00` |
| 10 | `updated_at` | 更新時間 | TEXT |  | ISO datetime string | `2026-06-25T10:30:00+08:00` |

## `menu_items`

| No. | Field name | Chinese name | Type | Key | Rule / format / range | Example |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | 菜單品項編號 | TEXT | PK | Recommend `menu_item_` + unique suffix | `menu_item_001` |
| 2 | `store_id` | 門市編號 | TEXT | FK | References `stores(id)` | `store_001` |
| 3 | `name` | 品項名稱 | TEXT |  | Required | `白玉歐蕾` |
| 4 | `category` | 分類 | TEXT |  | Required; category naming still flexible | `鮮奶系列` |
| 5 | `description` | 說明 | TEXT |  | Nullable | `招牌鮮奶茶加入白玉珍珠` |
| 6 | `base_price` | 基本價格 | INTEGER |  | `>= 0`, integer NTD | `70` |
| 7 | `is_available` | 是否可販售 | INTEGER |  | `1` = yes, `0` = no | `1` |
| 8 | `created_at` | 建立時間 | TEXT |  | ISO datetime string | `2026-06-25T10:00:00+08:00` |
| 9 | `updated_at` | 更新時間 | TEXT |  | ISO datetime string | `2026-06-25T10:30:00+08:00` |

## `customization_options`

| No. | Field name | Chinese name | Type | Key | Rule / format / range | Example |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | 客製化選項編號 | TEXT | PK | Recommend `option_` + unique suffix | `option_001` |
| 2 | `menu_item_id` | 菜單品項編號 | TEXT | FK | References `menu_items(id)` | `menu_item_001` |
| 3 | `option_type` | 選項類型 | TEXT |  | `sweetness`, `ice`, `topping`, `size` | `ice` |
| 4 | `label` | 選項名稱 | TEXT |  | Required | `少冰` |
| 5 | `price_delta` | 加價金額 | INTEGER |  | Default `0`; can be positive | `10` |
| 6 | `sort_order` | 排序 | INTEGER |  | Lower value appears first | `1` |
| 7 | `is_available` | 是否可選 | INTEGER |  | `1` = yes, `0` = no | `1` |

## `group_buy_activities`

| No. | Field name | Chinese name | Type | Key | Rule / format / range | Example |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | 團購活動編號 | TEXT | PK | Recommend `activity_` + unique suffix | `activity_001` |
| 2 | `store_id` | 門市編號 | TEXT | FK, INDEX pair | References `stores(id)` | `store_001` |
| 3 | `created_by_user_id` | 建立者使用者編號 | TEXT | FK | References `users(id)` | `user_merchant_001` |
| 4 | `title` | 活動名稱 | TEXT |  | Required | `離峰優惠團購` |
| 5 | `status` | 活動狀態 | TEXT | INDEX pair | `draft`, `recruiting`, `confirmed`, `failed`, `ordering`, `ready_for_pickup`, `completed`, `cancelled` | `recruiting` |
| 6 | `start_at` | 開始時間 | TEXT |  | Current product rule: created time or merchant configured start | `2026-06-25T14:00:00+08:00` |
| 7 | `deadline_at` | 截止時間 | TEXT | INDEX | Time used for lock/settlement | `2026-06-25T15:30:00+08:00` |
| 8 | `pickup_start_at` | 取貨開始時間 | TEXT |  | Required for customer pickup info | `2026-06-25T16:00:00+08:00` |
| 9 | `pickup_end_at` | 取貨結束時間 | TEXT |  | Required for customer pickup info | `2026-06-25T17:00:00+08:00` |
| 10 | `maximum_cups` | 最高杯數 | INTEGER |  | Nullable; if set, activity stops at limit | `40` |
| 11 | `withdrawal_lock_minutes` | 退出鎖定分鐘 | INTEGER |  | Default `30`; cannot exit in final lock window | `30` |
| 12 | `cancellation_reason` | 取消原因 | TEXT |  | Required when status becomes `cancelled` by admin/merchant | `店家臨時設備維修` |
| 13 | `created_at` | 建立時間 | TEXT |  | ISO datetime string | `2026-06-25T10:00:00+08:00` |
| 14 | `updated_at` | 更新時間 | TEXT |  | ISO datetime string | `2026-06-25T10:30:00+08:00` |

## `promotion_tiers`

| No. | Field name | Chinese name | Type | Key | Rule / format / range | Example |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | 優惠級距編號 | TEXT | PK | Recommend `tier_` + unique suffix | `tier_001` |
| 2 | `activity_id` | 團購活動編號 | TEXT | FK, UNIQUE pair | References `group_buy_activities(id)`; unique with `target_cups` | `activity_001` |
| 3 | `target_cups` | 目標杯數 | INTEGER | UNIQUE pair | `> 0`; cup threshold | `20` |
| 4 | `discount_amount` | 折扣金額 | INTEGER |  | `>= 0`; total group discount amount | `200` |
| 5 | `sort_order` | 排序 | INTEGER |  | Lower value appears first | `1` |

## `activity_notices`

| No. | Field name | Chinese name | Type | Key | Rule / format / range | Example |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | 活動注意事項編號 | TEXT | PK | Recommend `notice_` + unique suffix | `notice_001` |
| 2 | `activity_id` | 團購活動編號 | TEXT | FK | References `group_buy_activities(id)` | `activity_001` |
| 3 | `content` | 注意事項內容 | TEXT |  | Required | `請於指定時間到店取貨` |
| 4 | `sort_order` | 排序 | INTEGER |  | Lower value appears first | `1` |

## `cart_drafts`

| No. | Field name | Chinese name | Type | Key | Rule / format / range | Example |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | 購物車草稿編號 | TEXT | PK | Recommend `cart_` + unique suffix | `cart_001` |
| 2 | `user_id` | 使用者編號 | TEXT | FK, UNIQUE triple | References `users(id)` | `user_001` |
| 3 | `activity_id` | 團購活動編號 | TEXT | FK, UNIQUE triple | References `group_buy_activities(id)` | `activity_001` |
| 4 | `status` | 草稿狀態 | TEXT | UNIQUE triple | `active`, `submitted`, `expired`, `cancelled` | `active` |
| 5 | `fallback_purchase_preference` | 流團偏好 | TEXT |  | `decline_original_price`, `accept_original_price` | `accept_original_price` |
| 6 | `created_at` | 建立時間 | TEXT |  | ISO datetime string | `2026-06-25T10:00:00+08:00` |
| 7 | `updated_at` | 更新時間 | TEXT |  | ISO datetime string | `2026-06-25T10:30:00+08:00` |

## `cart_draft_items`

| No. | Field name | Chinese name | Type | Key | Rule / format / range | Example |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | 購物車品項編號 | TEXT | PK | Recommend `cart_item_` + unique suffix | `cart_item_001` |
| 2 | `cart_draft_id` | 購物車草稿編號 | TEXT | FK | References `cart_drafts(id)` | `cart_001` |
| 3 | `menu_item_id` | 菜單品項編號 | TEXT | FK | References `menu_items(id)` | `menu_item_001` |
| 4 | `item_name_snapshot` | 品項名稱快照 | TEXT |  | Required; preserve display name at time of cart | `白玉歐蕾` |
| 5 | `unit_price_snapshot` | 單價快照 | INTEGER |  | `>= 0` | `70` |
| 6 | `quantity` | 數量 | INTEGER |  | `> 0` | `2` |
| 7 | `subtotal` | 小計 | INTEGER |  | `>= 0`; unit price plus option deltas times quantity | `150` |
| 8 | `created_at` | 建立時間 | TEXT |  | ISO datetime string | `2026-06-25T10:00:00+08:00` |
| 9 | `updated_at` | 更新時間 | TEXT |  | ISO datetime string | `2026-06-25T10:30:00+08:00` |

## `cart_draft_item_customizations`

| No. | Field name | Chinese name | Type | Key | Rule / format / range | Example |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | 購物車客製化明細編號 | TEXT | PK | Recommend `cart_item_customization_` + unique suffix | `cart_item_customization_001` |
| 2 | `cart_draft_item_id` | 購物車品項編號 | TEXT | FK | References `cart_draft_items(id)` | `cart_item_001` |
| 3 | `customization_option_id` | 客製化選項編號 | TEXT | FK | Nullable if original option is later deleted | `option_001` |
| 4 | `option_type` | 選項類型 | TEXT |  | `sweetness`, `ice`, `topping`, `size` | `topping` |
| 5 | `label_snapshot` | 選項名稱快照 | TEXT |  | Required | `珍珠` |
| 6 | `price_delta_snapshot` | 加價金額快照 | INTEGER |  | Default `0`; can be positive | `10` |
| 7 | `sort_order` | 排序 | INTEGER |  | Lower value appears first | `1` |

## `orders`

| No. | Field name | Chinese name | Type | Key | Rule / format / range | Example |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | 訂單編號 | TEXT | PK | Recommend `order_` + unique suffix | `order_001` |
| 2 | `activity_id` | 團購活動編號 | TEXT | FK, INDEX | References `group_buy_activities(id)` | `activity_001` |
| 3 | `customer_user_id` | 顧客使用者編號 | TEXT | FK, INDEX | References `users(id)` | `user_001` |
| 4 | `status` | 訂單狀態 | TEXT |  | `draft`, `submitted`, `locked`, `cancelled`, `completed` | `locked` |
| 5 | `fallback_purchase_preference` | 流團偏好 | TEXT |  | `decline_original_price`, `accept_original_price` | `accept_original_price` |
| 6 | `total_cups` | 總杯數 | INTEGER |  | `> 0`; should equal sum of order item quantities | `4` |
| 7 | `original_amount` | 原價金額 | INTEGER |  | `>= 0`; authorization base amount | `280` |
| 8 | `final_amount` | 最終金額 | INTEGER |  | Nullable until settlement | `248` |
| 9 | `payment_status` | 付款狀態 | TEXT | INDEX | `pending`, `authorized`, `captured`, `authorization_voided`, `failed`, `refunded` | `authorized` |
| 10 | `authorization_status` | 預授權狀態 | TEXT |  | `pending`, `authorized`, `captured`, `authorization_voided`, `failed` | `authorized` |
| 11 | `merchant_acceptance_status` | 商家接單狀態 | TEXT |  | `pending`, `accepted`, `rejected`, `cancelled` | `accepted` |
| 12 | `pickup_status` | 取貨狀態 | TEXT |  | `not_ready`, `ready`, `picked_up`, `cancelled`, `expired` | `ready` |
| 13 | `submitted_at` | 送出時間 | TEXT |  | ISO datetime string | `2026-06-25T10:15:00+08:00` |
| 14 | `updated_at` | 更新時間 | TEXT |  | ISO datetime string | `2026-06-25T10:30:00+08:00` |

## `order_items`

| No. | Field name | Chinese name | Type | Key | Rule / format / range | Example |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | 訂單品項編號 | TEXT | PK | Recommend `order_item_` + unique suffix | `order_item_001` |
| 2 | `order_id` | 訂單編號 | TEXT | FK | References `orders(id)` | `order_001` |
| 3 | `menu_item_id` | 菜單品項編號 | TEXT | FK | Nullable if menu item is deleted later | `menu_item_001` |
| 4 | `item_name_snapshot` | 品項名稱快照 | TEXT |  | Required | `白玉歐蕾` |
| 5 | `quantity` | 數量 | INTEGER |  | `> 0` | `2` |
| 6 | `unit_price_snapshot` | 單價快照 | INTEGER |  | `>= 0` | `75` |
| 7 | `subtotal` | 品項小計 | INTEGER |  | `>= 0`; unit price plus option deltas times quantity | `150` |

## `order_item_customizations`

| No. | Field name | Chinese name | Type | Key | Rule / format / range | Example |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | 訂單客製化明細編號 | TEXT | PK | Recommend `order_item_customization_` + unique suffix | `order_item_customization_001` |
| 2 | `order_item_id` | 訂單品項編號 | TEXT | FK | References `order_items(id)` | `order_item_001` |
| 3 | `customization_option_id` | 客製化選項編號 | TEXT | FK | Nullable if original option is later deleted | `option_001` |
| 4 | `option_type` | 選項類型 | TEXT |  | `sweetness`, `ice`, `topping`, `size` | `sweetness` |
| 5 | `label_snapshot` | 選項名稱快照 | TEXT |  | Required | `微糖` |
| 6 | `price_delta_snapshot` | 加價金額快照 | INTEGER |  | Default `0`; can be positive | `0` |
| 7 | `sort_order` | 排序 | INTEGER |  | Lower value appears first | `1` |

## `payment_authorizations`

| No. | Field name | Chinese name | Type | Key | Rule / format / range | Example |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | 預授權編號 | TEXT | PK | Recommend `pay_auth_` + unique suffix | `pay_auth_001` |
| 2 | `order_id` | 訂單編號 | TEXT | FK, INDEX | References `orders(id)` | `order_001` |
| 3 | `provider` | 金流服務商 | TEXT |  | `line_pay`, `mock_line_pay` | `mock_line_pay` |
| 4 | `status` | 預授權狀態 | TEXT |  | `pending`, `authorized`, `captured`, `authorization_voided`, `failed` | `authorized` |
| 5 | `original_amount` | 原價金額 | INTEGER |  | `>= 0` | `280` |
| 6 | `authorized_amount` | 授權金額 | INTEGER |  | `>= 0`; normally equals original amount | `280` |
| 7 | `provider_authorization_id` | 金流授權編號 | TEXT |  | Nullable in mock flow | `linepay-auth-123` |
| 8 | `expires_at` | 授權到期時間 | TEXT |  | Nullable; provider dependent | `2026-06-26T10:00:00+08:00` |
| 9 | `authorized_at` | 授權成功時間 | TEXT |  | Nullable until authorized | `2026-06-25T10:16:00+08:00` |
| 10 | `voided_at` | 取消授權時間 | TEXT |  | Nullable until voided | `2026-06-25T15:30:00+08:00` |
| 11 | `failure_reason` | 失敗原因 | TEXT |  | Nullable | `provider_timeout` |
| 12 | `created_at` | 建立時間 | TEXT |  | ISO datetime string | `2026-06-25T10:15:00+08:00` |
| 13 | `updated_at` | 更新時間 | TEXT |  | ISO datetime string | `2026-06-25T10:16:00+08:00` |

## `payment_captures`

| No. | Field name | Chinese name | Type | Key | Rule / format / range | Example |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | 請款編號 | TEXT | PK | Recommend `pay_capture_` + unique suffix | `pay_capture_001` |
| 2 | `payment_authorization_id` | 預授權編號 | TEXT | FK | References `payment_authorizations(id)` | `pay_auth_001` |
| 3 | `order_id` | 訂單編號 | TEXT | FK | References `orders(id)` | `order_001` |
| 4 | `status` | 請款狀態 | TEXT |  | `pending`, `captured`, `failed` | `captured` |
| 5 | `final_amount` | 最終金額 | INTEGER |  | `>= 0` | `248` |
| 6 | `capture_amount` | 請款金額 | INTEGER |  | `>= 0`; should not exceed authorized amount | `248` |
| 7 | `released_amount` | 釋放金額 | INTEGER |  | `>= 0`; authorized minus captured | `32` |
| 8 | `provider_capture_id` | 金流請款編號 | TEXT |  | Nullable in mock flow | `linepay-capture-123` |
| 9 | `captured_at` | 請款時間 | TEXT |  | Nullable until captured | `2026-06-25T15:31:00+08:00` |
| 10 | `failure_reason` | 失敗原因 | TEXT |  | Nullable | `insufficient_authorization` |
| 11 | `created_at` | 建立時間 | TEXT |  | ISO datetime string | `2026-06-25T15:30:00+08:00` |
| 12 | `updated_at` | 更新時間 | TEXT |  | ISO datetime string | `2026-06-25T15:31:00+08:00` |

## `payment_provider_events`

| No. | Field name | Chinese name | Type | Key | Rule / format / range | Example |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | 金流事件編號 | TEXT | PK | Recommend `pay_event_` + unique suffix | `pay_event_001` |
| 2 | `provider` | 金流服務商 | TEXT |  | Required | `line_pay` |
| 3 | `resource_type` | 資源類型 | TEXT |  | `authorization`, `capture`, `refund` | `authorization` |
| 4 | `resource_id` | 資源編號 | TEXT |  | Provider or local resource identifier | `pay_auth_001` |
| 5 | `event_type` | 事件類型 | TEXT |  | Provider event name | `authorization.succeeded` |
| 6 | `idempotency_key` | 冪等鍵 | TEXT | UNIQUE | Prevent duplicate processing | `evt_abc123` |
| 7 | `payload_json` | 原始事件內容 | TEXT |  | JSON text | `{"status":"authorized"}` |
| 8 | `received_at` | 接收時間 | TEXT |  | ISO datetime string | `2026-06-25T10:16:00+08:00` |
| 9 | `processed_at` | 處理時間 | TEXT |  | Nullable until processed | `2026-06-25T10:16:01+08:00` |

## `activity_settlements`

| No. | Field name | Chinese name | Type | Key | Rule / format / range | Example |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | 活動結算編號 | TEXT | PK | Recommend `settlement_` + unique suffix | `settlement_001` |
| 2 | `activity_id` | 團購活動編號 | TEXT | FK, UNIQUE | One settlement per activity | `activity_001` |
| 3 | `outcome` | 結算結果 | TEXT |  | `qualified`, `failed`, `cancelled` | `qualified` |
| 4 | `authorized_cups` | 已預授權杯數 | INTEGER |  | `>= 0`; authoritative settlement count | `25` |
| 5 | `applied_tier_id` | 套用優惠級距 | TEXT | FK | Nullable if failed/cancelled | `tier_002` |
| 6 | `discount_amount` | 套用折扣金額 | INTEGER |  | `>= 0` | `300` |
| 7 | `settled_at` | 結算時間 | TEXT |  | ISO datetime string | `2026-06-25T15:30:00+08:00` |
| 8 | `reason` | 結算原因 | TEXT |  | Nullable | `deadline_reached` |

## `pickup_credentials`

| No. | Field name | Chinese name | Type | Key | Rule / format / range | Example |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | 取貨憑證編號 | TEXT | PK | Recommend `pickup_cred_` + unique suffix | `pickup_cred_001` |
| 2 | `order_id` | 訂單編號 | TEXT | FK, UNIQUE | One credential per order | `order_001` |
| 3 | `pickup_code` | 取貨代碼 | TEXT |  | Required; format still open | `A7924` |
| 4 | `visible_after_merchant_acceptance` | 接單後才顯示 | INTEGER |  | `1` = yes, `0` = no | `1` |
| 5 | `created_at` | 建立時間 | TEXT |  | ISO datetime string | `2026-06-25T15:40:00+08:00` |

## `status_history`

| No. | Field name | Chinese name | Type | Key | Rule / format / range | Example |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | 狀態歷史編號 | TEXT | PK | Recommend `status_history_` + unique suffix | `status_history_001` |
| 2 | `resource_type` | 資源類型 | TEXT | INDEX pair | `activity`, `order`, `payment_authorization`, `pickup` | `order` |
| 3 | `resource_id` | 資源編號 | TEXT | INDEX pair | References logical resource by type | `order_001` |
| 4 | `from_status` | 原狀態 | TEXT |  | Nullable for initial creation | `submitted` |
| 5 | `to_status` | 新狀態 | TEXT |  | Required | `locked` |
| 6 | `reason` | 原因 | TEXT |  | Nullable | `deadline_lock` |
| 7 | `actor_user_id` | 操作者使用者編號 | TEXT | FK | Nullable for system action | `user_admin_001` |
| 8 | `created_at` | 建立時間 | TEXT |  | ISO datetime string | `2026-06-25T15:30:00+08:00` |

## `audit_logs`

| No. | Field name | Chinese name | Type | Key | Rule / format / range | Example |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | 稽核紀錄編號 | TEXT | PK | Recommend `audit_` + unique suffix | `audit_001` |
| 2 | `actor_user_id` | 操作者使用者編號 | TEXT | FK | Nullable for system action | `user_admin_001` |
| 3 | `action_type` | 操作類型 | TEXT |  | Required; use stable action names | `admin_cancel_activity` |
| 4 | `resource_type` | 資源類型 | TEXT | INDEX pair | Required | `activity` |
| 5 | `resource_id` | 資源編號 | TEXT | INDEX pair | Required | `activity_001` |
| 6 | `metadata_json` | 補充資料 | TEXT |  | JSON text | `{"reason":"test cancel"}` |
| 7 | `created_at` | 建立時間 | TEXT |  | ISO datetime string | `2026-06-25T15:35:00+08:00` |

## Current Gaps To Resolve

| Area | Current issue |
| --- | --- |
| Order status | Mobile has used `readyForPickup`; current schema does not allow it. Prefer using `pickup_status = ready` unless formally added. |
| Pickup status | Mobile has used `preparing`; current schema does not allow it. Decide whether to add `preparing` or derive it from merchant acceptance. |
| Order revisions | Authorized order changes need a future `order_revisions` or equivalent immutable history design. |
| Authentication | `users` has password/Google fields, but sessions, password reset, and auth policies are not fully designed. |
| Notifications | No notification table yet. |
| Production migrations | Current schema is recreated for local development; migration history is not implemented. |
| Prototype test schema | `database/test/` still keeps JSON fields for fixture export convenience and is not the canonical normalized schema. |
