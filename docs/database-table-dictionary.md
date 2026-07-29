# 資料庫資料表字典

最後更新：2026-07-30

## 文件用途

本文件整理 DrinkGroupBuy 目前開發資料庫的主要資料表與欄位中文名稱，方便對照系統分析、資料庫設計與後續文件。

資料表結構以 `database/schema.sql` 為主要依據；PostgreSQL draft 中已新增但 SQLite runtime 尚未建立的表，會另外標示。

## 欄位標示

| 欄位     | 說明                                        |
| -------- | ------------------------------------------- |
| 欄位名稱 | 實際 database column name                   |
| 中文名稱 | 文件與業務溝通使用的中文名稱                |
| 型別     | 目前 SQLite schema 或 PostgreSQL draft 型別 |
| NULL     | `N` 表示不可為空，`Y` 表示可為空            |
| PK/FK    | Primary key、foreign key、unique/index 註記 |

## 資料表總覽

| 分類       | 資料表                                                                  |
| ---------- | ----------------------------------------------------------------------- |
| 身份與角色 | `users`, `user_roles`, `user_private_profiles`, `user_public_profiles`  |
| 商家與門市 | `merchants`, `merchant_users`, `stores`                                 |
| 菜單       | `menu_items`, `customization_options`, `menu_item_customization_rules`  |
| 團購活動   | `group_buy_activities`, `promotion_tiers`, `activity_notices`           |
| 購物車     | `cart_drafts`, `cart_draft_items`, `cart_draft_item_customizations`     |
| 訂單       | `orders`, `order_items`, `order_item_customizations`                    |
| 付款       | `payment_authorizations`, `payment_captures`, `payment_refunds`, `payment_provider_events` |
| 結算取貨   | `activity_settlements`, `pickup_credentials`                            |
| 歷程稽核   | `status_history`, `audit_logs`                                          |

## `users` 使用者資料表

用途：保存顧客、店家、管理員共用的帳號身份。正式登入方向以 `firebase_uid` 對應 Firebase Auth。

| 欄位名稱        | 中文名稱     | 型別 | NULL | PK/FK  |
| --------------- | ------------ | ---- | ---- | ------ |
| `id`            | 使用者編號   | TEXT | N    | PK     |
| `login_name`    | 登入名稱     | TEXT | Y    | UNIQUE |
| `phone_number`  | 手機號碼     | TEXT | Y    | UNIQUE |
| `email`         | Email        | TEXT | Y    | UNIQUE |
| `password_hash` | 密碼雜湊     | TEXT | Y    |        |
| `firebase_uid`  | Firebase UID | TEXT | Y    | UNIQUE |
| `display_name`  | 顯示名稱     | TEXT | N    |        |
| `surname`       | 姓氏         | TEXT | Y    |        |
| `status`        | 帳號狀態     | TEXT | N    |        |
| `created_at`    | 建立時間     | TEXT | N    |        |
| `updated_at`    | 更新時間     | TEXT | N    |        |

## PostgreSQL draft：`user_private_profiles` 使用者私人資料表

用途：保存真實姓名與聯絡資料，僅供內部或管理用途。此表尚未存在於 SQLite runtime。

| 欄位名稱        | 中文名稱   | 型別        | NULL | PK/FK  |
| --------------- | ---------- | ----------- | ---- | ------ |
| `user_id`       | 使用者編號 | text        | N    | PK, FK |
| `real_name`     | 真實姓名   | text        | Y    |        |
| `contact_phone` | 聯絡電話   | text        | Y    |        |
| `contact_email` | 聯絡 Email | text        | Y    |        |
| `created_at`    | 建立時間   | timestamptz | N    |        |
| `updated_at`    | 更新時間   | timestamptz | N    |        |

## PostgreSQL draft：`user_public_profiles` 使用者公開資料表

用途：保存可顯示給店家或其他顧客的匿名別名資料。此表尚未存在於 SQLite runtime。

| 欄位名稱        | 中文名稱     | 型別        | NULL | PK/FK  |
| --------------- | ------------ | ----------- | ---- | ------ |
| `user_id`       | 使用者編號   | text        | N    | PK, FK |
| `display_alias` | 對外顯示別名 | text        | N    |        |
| `avatar_color`  | 頭像顏色     | text        | Y    |        |
| `privacy_mode`  | 隱私模式     | text        | N    |        |
| `created_at`    | 建立時間     | timestamptz | N    |        |
| `updated_at`    | 更新時間     | timestamptz | N    |        |

## `user_roles` 使用者角色資料表

用途：保存使用者角色，例如顧客、店家、管理員。

| 欄位名稱     | 中文名稱   | 型別 | NULL | PK/FK                 |
| ------------ | ---------- | ---- | ---- | --------------------- |
| `id`         | 角色編號   | TEXT | N    | PK                    |
| `user_id`    | 使用者編號 | TEXT | N    | FK                    |
| `role`       | 角色       | TEXT | N    | UNIQUE(user_id, role) |
| `status`     | 角色狀態   | TEXT | N    |                       |
| `granted_at` | 授權時間   | TEXT | N    |                       |

## `merchants` 商家資料表

用途：保存商家組織或品牌資料。

| 欄位名稱     | 中文名稱 | 型別 | NULL | PK/FK |
| ------------ | -------- | ---- | ---- | ----- |
| `id`         | 商家編號 | TEXT | N    | PK    |
| `name`       | 商家名稱 | TEXT | N    |       |
| `status`     | 商家狀態 | TEXT | N    |       |
| `created_at` | 建立時間 | TEXT | N    |       |
| `updated_at` | 更新時間 | TEXT | N    |       |

## `merchant_users` 店家帳號關聯資料表

用途：保存店家登入帳號與其可管理商家或門市的關聯。SQLite runtime 使用 `merchant_id`；PostgreSQL draft 改以 `store_id` 作為權限邊界。

| 欄位名稱           | 中文名稱         | 型別 | NULL | PK/FK  |
| ------------------ | ---------------- | ---- | ---- | ------ |
| `id`               | 店家帳號關聯編號 | TEXT | N    | PK     |
| `merchant_id`      | 商家編號         | TEXT | N    | FK     |
| `store_id`         | 門市編號         | text | N    | FK     |
| `user_id`          | 使用者編號       | TEXT | N    | FK     |
| `permission_level` | 權限等級         | TEXT | N    |        |
| `status`           | 關聯狀態         | TEXT | N    |        |
| `created_at`       | 建立時間         | TEXT | N    |        |

## `stores` 門市資料表

用途：保存實體門市、取貨地點與地圖座標。

| 欄位名稱          | 中文名稱 | 型別 | NULL | PK/FK |
| ----------------- | -------- | ---- | ---- | ----- |
| `id`              | 門市編號 | TEXT | N    | PK    |
| `merchant_id`     | 商家編號 | TEXT | N    | FK    |
| `name`            | 門市名稱 | TEXT | N    |       |
| `address`         | 地址     | TEXT | N    |       |
| `phone`           | 電話     | TEXT | Y    |       |
| `business_status` | 營業狀態 | TEXT | N    |       |
| `latitude`        | 緯度     | REAL | N    | INDEX |
| `longitude`       | 經度     | REAL | N    | INDEX |
| `created_at`      | 建立時間 | TEXT | N    |       |
| `updated_at`      | 更新時間 | TEXT | N    |       |

## `menu_items` 菜單品項資料表

用途：保存門市可販售的飲品或商品。店家可在開團前確認與修改菜單。

| 欄位名稱       | 中文名稱     | 型別    | NULL | PK/FK |
| -------------- | ------------ | ------- | ---- | ----- |
| `id`           | 菜單品項編號 | TEXT    | N    | PK    |
| `store_id`     | 門市編號     | TEXT    | N    | FK    |
| `name`         | 品項名稱     | TEXT    | N    |       |
| `category`     | 分類         | TEXT    | N    |       |
| `description`  | 品項說明     | TEXT    | Y    |       |
| `base_price`   | 基本價格     | INTEGER | N    |       |
| `is_available` | 是否販售     | INTEGER | N    |       |
| `created_at`   | 建立時間     | TEXT    | N    |       |
| `updated_at`   | 更新時間     | TEXT    | N    |       |

## `customization_options` 客製化選項資料表

用途：保存甜度、冰塊、加料、尺寸等可選項目。

| 欄位名稱       | 中文名稱     | 型別    | NULL | PK/FK |
| -------------- | ------------ | ------- | ---- | ----- |
| `id`           | 客製選項編號 | TEXT    | N    | PK    |
| `menu_item_id` | 菜單品項編號 | TEXT    | N    | FK    |
| `option_type`  | 選項類型     | TEXT    | N    |       |
| `label`        | 選項名稱     | TEXT    | N    |       |
| `price_delta`  | 加價金額     | INTEGER | N    |       |
| `sort_order`   | 排序         | INTEGER | N    |       |
| `is_available` | 是否可選     | INTEGER | N    |       |

## `menu_item_customization_rules` 品項客製化選擇規則資料表

用途：保存單一菜單品項在甜度、冰塊、加料、尺寸等類型的明確最少與最多選擇數。`max_selections = 0` 表示不提供、`1` 表示單選、`2` 以上表示限制數量的多選。

| 欄位名稱       | 中文名稱       | 型別    | NULL | PK/FK |
| -------------- | -------------- | ------- | ---- | ----- |
| `menu_item_id` | 菜單品項編號   | TEXT    | N    | PK, FK |
| `option_type`  | 選項類型       | TEXT    | N    | PK    |
| `min_selections` | 最少選擇數   | INTEGER | N    |       |
| `max_selections` | 最多選擇數   | INTEGER | N    |       |
| `created_at`   | 建立時間       | TEXT    | N    |       |
| `updated_at`   | 更新時間       | TEXT    | N    |       |

## `group_buy_activities` 團購活動資料表

用途：保存店家建立的團購活動與主要時間、狀態、容量設定。

| 欄位名稱                  | 中文名稱         | 型別    | NULL | PK/FK     |
| ------------------------- | ---------------- | ------- | ---- | --------- |
| `id`                      | 團購活動編號     | TEXT    | N    | PK        |
| `store_id`                | 門市編號         | TEXT    | N    | FK, INDEX |
| `created_by_user_id`      | 建立者使用者編號 | TEXT    | N    | FK        |
| `title`                   | 活動名稱         | TEXT    | N    |           |
| `status`                  | 活動狀態         | TEXT    | N    | INDEX     |
| `start_at`                | 開始時間         | TEXT    | N    |           |
| `deadline_at`             | 截止時間         | TEXT    | N    | INDEX     |
| `pickup_start_at`         | 取貨開始時間     | TEXT    | N    |           |
| `pickup_end_at`           | 取貨結束時間     | TEXT    | N    |           |
| `maximum_cups`            | 最大杯數         | INTEGER | Y    |           |
| `withdrawal_lock_minutes` | 退出鎖定分鐘數   | INTEGER | N    |           |
| `cancellation_reason`     | 取消原因         | TEXT    | Y    |           |
| `created_at`              | 建立時間         | TEXT    | N    |           |
| `updated_at`              | 更新時間         | TEXT    | N    |           |

## `promotion_tiers` 優惠門檻資料表

用途：保存團購杯數門檻與對應總折扣金額。

| 欄位名稱          | 中文名稱     | 型別    | NULL | PK/FK                                |
| ----------------- | ------------ | ------- | ---- | ------------------------------------ |
| `id`              | 優惠門檻編號 | TEXT    | N    | PK                                   |
| `activity_id`     | 團購活動編號 | TEXT    | N    | FK, UNIQUE(activity_id, target_cups) |
| `target_cups`     | 目標杯數     | INTEGER | N    | UNIQUE(activity_id, target_cups)     |
| `discount_amount` | 總折扣金額   | INTEGER | N    | 結算時平均分攤到有效杯數，未整除餘額作維運補貼 |
| `sort_order`      | 排序         | INTEGER | N    |                                      |

## `activity_notices` 活動備註資料表

用途：保存團購活動詳情頁顯示的店家備註。

| 欄位名稱      | 中文名稱     | 型別    | NULL | PK/FK |
| ------------- | ------------ | ------- | ---- | ----- |
| `id`          | 活動備註編號 | TEXT    | N    | PK    |
| `activity_id` | 團購活動編號 | TEXT    | N    | FK    |
| `content`     | 備註內容     | TEXT    | N    |       |
| `sort_order`  | 排序         | INTEGER | N    |       |

## `cart_drafts` 購物車草稿資料表

用途：保存顧客送出訂單前的購物車狀態。

| 欄位名稱                       | 中文名稱       | 型別 | NULL | PK/FK                                    |
| ------------------------------ | -------------- | ---- | ---- | ---------------------------------------- |
| `id`                           | 購物車草稿編號 | TEXT | N    | PK                                       |
| `user_id`                      | 使用者編號     | TEXT | N    | FK, UNIQUE(user_id, activity_id, status) |
| `activity_id`                  | 團購活動編號   | TEXT | N    | FK, UNIQUE(user_id, activity_id, status) |
| `status`                       | 草稿狀態       | TEXT | N    | UNIQUE(user_id, activity_id, status)     |
| `fallback_purchase_preference` | 未達標購買偏好 | TEXT | N    |                                          |
| `created_at`                   | 建立時間       | TEXT | N    |                                          |
| `updated_at`                   | 更新時間       | TEXT | N    |                                          |

## `cart_draft_items` 購物車品項資料表

用途：保存購物車內每一杯飲品。

| 欄位名稱              | 中文名稱       | 型別    | NULL | PK/FK |
| --------------------- | -------------- | ------- | ---- | ----- |
| `id`                  | 購物車品項編號 | TEXT    | N    | PK    |
| `cart_draft_id`       | 購物車草稿編號 | TEXT    | N    | FK    |
| `menu_item_id`        | 菜單品項編號   | TEXT    | N    | FK    |
| `item_name_snapshot`  | 品項名稱快照   | TEXT    | N    |       |
| `unit_price_snapshot` | 單價快照       | INTEGER | N    |       |
| `quantity`            | 數量           | INTEGER | N    |       |
| `subtotal`            | 小計           | INTEGER | N    |       |
| `created_at`          | 建立時間       | TEXT    | N    |       |
| `updated_at`          | 更新時間       | TEXT    | N    |       |

## `cart_draft_item_customizations` 購物車客製化資料表

用途：保存購物車品項的甜度、冰塊、加料、尺寸等選擇。

| 欄位名稱                  | 中文名稱         | 型別    | NULL | PK/FK |
| ------------------------- | ---------------- | ------- | ---- | ----- |
| `id`                      | 購物車客製化編號 | TEXT    | N    | PK    |
| `cart_draft_item_id`      | 購物車品項編號   | TEXT    | N    | FK    |
| `customization_option_id` | 客製選項編號     | TEXT    | Y    | FK    |
| `option_type`             | 選項類型         | TEXT    | N    |       |
| `label_snapshot`          | 選項名稱快照     | TEXT    | N    |       |
| `price_delta_snapshot`    | 加價金額快照     | INTEGER | N    |       |
| `sort_order`              | 排序             | INTEGER | N    |       |

## `orders` 訂單資料表

用途：保存顧客送出的正式訂單。顧客完成預授權後，訂單即納入團購統計。

| 欄位名稱                       | 中文名稱       | 型別    | NULL | PK/FK |
| ------------------------------ | -------------- | ------- | ---- | ----- |
| `id`                           | 訂單編號       | TEXT    | N    | PK    |
| `activity_id`                  | 團購活動編號   | TEXT    | N    | FK    |
| `customer_user_id`             | 顧客使用者編號 | TEXT    | N    | FK    |
| `status`                       | 訂單狀態       | TEXT    | N    |       |
| `fallback_purchase_preference` | 未達標購買偏好 | TEXT    | N    |       |
| `total_cups`                   | 總杯數         | INTEGER | N    |       |
| `original_amount`              | 原始金額       | INTEGER | N    |       |
| `final_amount`                 | 最終金額       | INTEGER | Y    |       |
| `payment_status`               | 付款狀態       | TEXT    | N    | INDEX |
| `authorization_status`         | 預授權狀態     | TEXT    | N    |       |
| `merchant_acceptance_status`   | 店家接單狀態   | TEXT    | N    |       |
| `pickup_status`                | 取貨狀態       | TEXT    | N    |       |
| `submitted_at`                 | 送出時間       | TEXT    | N    |       |
| `updated_at`                   | 更新時間       | TEXT    | N    |       |

備註：最新產品規則不需要店家逐筆確認接單，因此 `merchant_acceptance_status` 是待 review 欄位。

## `order_items` 訂單品項資料表

用途：保存訂單內每一杯飲品的 snapshot。

| 欄位名稱              | 中文名稱     | 型別    | NULL | PK/FK |
| --------------------- | ------------ | ------- | ---- | ----- |
| `id`                  | 訂單品項編號 | TEXT    | N    | PK    |
| `order_id`            | 訂單編號     | TEXT    | N    | FK    |
| `menu_item_id`        | 菜單品項編號 | TEXT    | Y    | FK    |
| `item_name_snapshot`  | 品項名稱快照 | TEXT    | N    |       |
| `quantity`            | 數量         | INTEGER | N    |       |
| `unit_price_snapshot` | 單價快照     | INTEGER | N    |       |
| `subtotal`            | 小計         | INTEGER | N    |       |

## `order_item_customizations` 訂單客製化資料表

用途：保存訂單品項的客製化 snapshot。

| 欄位名稱                  | 中文名稱       | 型別    | NULL | PK/FK |
| ------------------------- | -------------- | ------- | ---- | ----- |
| `id`                      | 訂單客製化編號 | TEXT    | N    | PK    |
| `order_item_id`           | 訂單品項編號   | TEXT    | N    | FK    |
| `customization_option_id` | 客製選項編號   | TEXT    | Y    | FK    |
| `option_type`             | 選項類型       | TEXT    | N    |       |
| `label_snapshot`          | 選項名稱快照   | TEXT    | N    |       |
| `price_delta_snapshot`    | 加價金額快照   | INTEGER | N    |       |
| `sort_order`              | 排序           | INTEGER | N    |       |

## `payment_authorizations` 付款預授權資料表

用途：保存 LINE Pay 或 mock provider 的預授權紀錄。

| 欄位名稱                    | 中文名稱            | 型別    | NULL | PK/FK |
| --------------------------- | ------------------- | ------- | ---- | ----- |
| `id`                        | 預授權編號          | TEXT    | N    | PK    |
| `order_id`                  | 訂單編號            | TEXT    | N    | FK    |
| `order_revision_id`         | 訂單修改版本編號    | TEXT    | Y    | FK    |
| `provider`                  | 金流服務商          | TEXT    | N    |       |
| `payment_flow`              | 付款流程            | TEXT    | N    |       |
| `status`                    | 預授權狀態          | TEXT    | N    |       |
| `original_amount`           | 原始金額            | INTEGER | N    |       |
| `authorized_amount`         | 預授權金額          | INTEGER | N    |       |
| `provider_authorization_id` | Provider 預授權編號 | TEXT    | Y    |       |
| `expires_at`                | 預授權到期時間      | TEXT    | Y    | LINE Pay 分離式請款時取自 `authorizationExpireDate` |
| `authorized_at`             | 預授權成功時間      | TEXT    | Y    |       |
| `voided_at`                 | 取消預授權時間      | TEXT    | Y    |       |
| `failure_reason`            | 失敗原因            | TEXT    | Y    |       |
| `created_at`                | 建立時間            | TEXT    | N    |       |
| `updated_at`                | 更新時間            | TEXT    | N    |       |

## `payment_captures` 付款請款資料表

用途：保存截止結算後的 capture 結果。

| 欄位名稱                   | 中文名稱            | 型別    | NULL | PK/FK |
| -------------------------- | ------------------- | ------- | ---- | ----- |
| `id`                       | 請款編號            | TEXT    | N    | PK    |
| `payment_authorization_id` | 預授權編號          | TEXT    | N    | FK    |
| `order_id`                 | 訂單編號            | TEXT    | N    | FK    |
| `status`                   | 請款狀態            | TEXT    | N    |       |
| `final_amount`             | 最終金額            | INTEGER | N    |       |
| `capture_amount`           | 請款金額            | INTEGER | N    |       |
| `released_amount`          | 釋放金額            | INTEGER | N    |       |
| `provider_capture_id`      | Provider 請款編號   | TEXT    | Y    |       |
| `captured_at`              | 請款時間            | TEXT    | Y    |       |
| `failure_reason`           | 失敗原因            | TEXT    | Y    |       |
| `attempt_number`           | 本次請款嘗試序號    | INTEGER | N    |       |
| `retryable`                | 是否允許自動重試    | INTEGER | N    |       |
| `next_retry_at`            | 下次允許重試時間    | TEXT    | Y    |       |
| `created_at`               | 建立時間            | TEXT    | N    |       |
| `updated_at`               | 更新時間            | TEXT    | N    |       |

## `payment_refunds` 付款退款資料表

用途：保存已請款成功後的退款紀錄。未請款的預授權取消不寫入此表，應使用 `void`。

| 欄位名稱                   | 中文名稱          | 型別    | NULL | PK/FK  |
| -------------------------- | ----------------- | ------- | ---- | ------ |
| `id`                       | 退款編號          | TEXT    | N    | PK     |
| `payment_capture_id`       | 請款編號          | TEXT    | N    | FK     |
| `payment_authorization_id` | 預授權編號        | TEXT    | N    | FK     |
| `order_id`                 | 訂單編號          | TEXT    | N    | FK     |
| `provider`                 | 金流服務商        | TEXT    | N    |        |
| `status`                   | 退款狀態          | TEXT    | N    |        |
| `refund_amount`            | 退款金額          | INTEGER | N    |        |
| `provider_refund_id`       | Provider 退款編號 | TEXT    | Y    |        |
| `idempotency_key`          | 冪等鍵            | TEXT    | Y    | UNIQUE |
| `refunded_at`              | 退款完成時間      | TEXT    | Y    |        |
| `failure_reason`           | 失敗原因          | TEXT    | Y    |        |
| `created_at`               | 建立時間          | TEXT    | N    |        |
| `updated_at`               | 更新時間          | TEXT    | N    |        |

## `payment_provider_events` 金流事件資料表

用途：保存金流 provider 事件原始資料，並支援冪等處理；未來若接 webhook，也保存於此。

| 欄位名稱          | 中文名稱          | 型別 | NULL | PK/FK  |
| ----------------- | ----------------- | ---- | ---- | ------ |
| `id`              | Provider 事件編號 | TEXT | N    | PK     |
| `provider`        | 金流服務商        | TEXT | N    |        |
| `resource_type`   | 資源類型          | TEXT | N    |        |
| `resource_id`     | 資源編號          | TEXT | N    |        |
| `event_type`      | 事件類型          | TEXT | N    |        |
| `idempotency_key` | 冪等鍵            | TEXT | Y    | UNIQUE |
| `payload_json`    | 原始事件內容      | TEXT | Y    |        |
| `received_at`     | 接收時間          | TEXT | N    |        |
| `processed_at`    | 處理時間          | TEXT | Y    |        |

## `activity_settlements` 活動結算資料表

用途：保存團購截止後的結算結果與適用優惠門檻。

| 欄位名稱          | 中文名稱         | 型別    | NULL | PK/FK      |
| ----------------- | ---------------- | ------- | ---- | ---------- |
| `id`              | 活動結算編號     | TEXT    | N    | PK         |
| `activity_id`     | 團購活動編號     | TEXT    | N    | FK, UNIQUE |
| `outcome`         | 結算結果         | TEXT    | N    |            |
| `authorized_cups` | 預授權杯數       | INTEGER | N    |            |
| `applied_tier_id` | 適用優惠門檻編號 | TEXT    | Y    | FK         |
| `discount_amount` | 適用總折扣金額   | INTEGER | N    |            |
| `settled_at`      | 結算時間         | TEXT    | N    |            |
| `reason`          | 結算原因         | TEXT    | Y    |            |

## `pickup_credentials` 取貨憑證資料表

用途：保存顧客到店取貨時使用的取貨代碼或憑證。

| 欄位名稱                            | 中文名稱       | 型別    | NULL | PK/FK      |
| ----------------------------------- | -------------- | ------- | ---- | ---------- |
| `id`                                | 取貨憑證編號   | TEXT    | N    | PK         |
| `order_id`                          | 訂單編號       | TEXT    | N    | FK, UNIQUE |
| `pickup_code`                       | 取貨代碼       | TEXT    | N    |            |
| `visible_after_merchant_acceptance` | 接單後才顯示   | INTEGER | N    |            |
| `expires_at`                        | 憑證到期時間   | TEXT    | N    | INDEX      |
| `expired_at`                        | 實際逾期時間   | TEXT    | Y    |            |
| `created_at`                        | 建立時間       | TEXT    | N    |            |

備註：

- 最新產品規則不需要店家逐筆確認接單，`visible_after_merchant_acceptance` 欄位名稱與規則需後續 review。
- `expires_at` 保存依取餐時間規則算出的憑證到期時間；系統實際執行逾期處理時寫入 `expired_at`。
- 憑證到期後，訂單取貨狀態應更新為 `expired` 並移至歷史訂單。

## `status_history` 狀態歷程資料表

用途：保存活動、訂單、付款與取貨的狀態變更歷史。

| 欄位名稱        | 中文名稱         | 型別 | NULL | PK/FK |
| --------------- | ---------------- | ---- | ---- | ----- |
| `id`            | 狀態歷程編號     | TEXT | N    | PK    |
| `resource_type` | 資源類型         | TEXT | N    | INDEX |
| `resource_id`   | 資源編號         | TEXT | N    | INDEX |
| `from_status`   | 原狀態           | TEXT | Y    |       |
| `to_status`     | 新狀態           | TEXT | N    |       |
| `reason`        | 原因             | TEXT | Y    |       |
| `actor_user_id` | 操作者使用者編號 | TEXT | Y    | FK    |
| `created_at`    | 建立時間         | TEXT | N    |       |

## `audit_logs` 稽核紀錄資料表

用途：保存付款、取消、權限、管理員操作等敏感行為的稽核紀錄。

| 欄位名稱        | 中文名稱         | 型別 | NULL | PK/FK |
| --------------- | ---------------- | ---- | ---- | ----- |
| `id`            | 稽核紀錄編號     | TEXT | N    | PK    |
| `actor_user_id` | 操作者使用者編號 | TEXT | Y    | FK    |
| `action_type`   | 操作類型         | TEXT | N    |       |
| `resource_type` | 資源類型         | TEXT | N    | INDEX |
| `resource_id`   | 資源編號         | TEXT | N    | INDEX |
| `metadata_json` | 補充資料         | TEXT | Y    |       |
| `created_at`    | 建立時間         | TEXT | N    |       |
