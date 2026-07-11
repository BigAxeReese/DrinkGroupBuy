# 資料庫欄位規格

最後更新：2026-07-11

## 語言與範圍

本文件依據 `database/schema.sql` 整理目前開發資料庫欄位規格，性質接近正式資料字典，但尚不是 production migration 文件。

必要的資料表名稱、欄位名稱、status value、type 與 constraint 保留英文；中文欄位名稱用於產品、文件與溝通。

注意：PostgreSQL draft 已開始和目前 SQLite runtime schema 有少量差異，尤其是身份與隱私資料。PostgreSQL draft 會以 `user_private_profiles` 與 `user_public_profiles` 取代部分店家可見顧客資料設計。

## 欄位說明

| 欄位                 | 意義                             |
| -------------------- | -------------------------------- |
| No.                  | 該資料表內的欄位序號             |
| Field name           | 資料庫欄位名稱                   |
| 中文名稱             | 業務或產品語意名稱               |
| Type                 | 目前 SQLite-oriented type        |
| Key                  | PK、FK、UNIQUE、INDEX 或空白     |
| 規則 / 格式 / 範圍   | 目前 constraint、格式或預期規則  |
| Example              | 範例值                           |

## `users`

| No. | Field name      | 中文名稱       | Type | Key    | 規則 / 格式 / 範圍                                                                  | Example                     |
| --- | --------------- | -------------- | ---- | ------ | ----------------------------------------------------------------------------------- | --------------------------- |
| 1   | `id`            | 使用者編號     | TEXT | PK     | 建議使用 `user_` 加唯一後綴                                                         | `user_001`                  |
| 2   | `login_name`    | 登入名稱       | TEXT | UNIQUE | 開發相容欄位；正式 Google-only login 不應依賴此欄位                                 | `customera`                 |
| 3   | `phone_number`  | 手機號碼       | TEXT | UNIQUE | 開發相容欄位；保存 normalized digits                                                | `0911000001`                |
| 4   | `email`         | Email          | TEXT | UNIQUE | 可為 NULL；可作帳號連結輔助，不應取代 `firebase_uid`                                | `alice@example.com`         |
| 5   | `password_hash` | 密碼雜湊       | TEXT |        | 只保存 hash，不保存明文密碼                                                         | `scrypt:salt:hash`          |
| 6   | `firebase_uid`  | Firebase UID   | TEXT | UNIQUE | Firebase Auth 身份對應欄位；正式登入應以此為主                                      | `firebase-uid-abc123`       |
| 7   | `display_name`  | 顯示名稱       | TEXT |        | 必填                                                                                | `Alice Wang`                |
| 8   | `surname`       | 姓氏           | TEXT |        | Legacy SQLite 欄位；新的店家可見顧客資料應改用 `user_public_profiles.display_alias` | `王`                        |
| 9   | `status`        | 帳號狀態       | TEXT |        | `active`, `disabled`, `deleted`                                                     | `active`                    |
| 10  | `created_at`    | 建立時間       | TEXT |        | ISO datetime string                                                                 | `2026-06-25T10:00:00+08:00` |
| 11  | `updated_at`    | 更新時間       | TEXT |        | ISO datetime string                                                                 | `2026-06-25T10:30:00+08:00` |

PostgreSQL draft 另有 `phone_verified_at`、`email_verified_at`、`last_login_at`，型別為 `timestamptz`。

## PostgreSQL draft：`user_private_profiles`

此表存在於 PostgreSQL draft，不存在於目前 SQLite runtime schema。

| No. | Field name      | 中文名稱     | Type        | Key    | 規則 / 格式 / 範圍                 | Example                     |
| --- | --------------- | ------------ | ----------- | ------ | ---------------------------------- | --------------------------- |
| 1   | `user_id`       | 使用者編號   | text        | PK, FK | References `users(id)`             | `user-customer-yinji`       |
| 2   | `real_name`     | 真實姓名     | text        |        | 僅供內部或管理用途                 | `顧客 A`                    |
| 3   | `contact_phone` | 聯絡電話     | text        |        | 僅供內部或管理用途                 | `0911000001`                |
| 4   | `contact_email` | 聯絡 Email   | text        |        | 可為 NULL                          | `alice@example.com`         |
| 5   | `created_at`    | 建立時間     | timestamptz |        | ISO datetime                       | `2026-06-05T00:00:00+08:00` |
| 6   | `updated_at`    | 更新時間     | timestamptz |        | ISO datetime                       | `2026-06-05T00:00:00+08:00` |

## PostgreSQL draft：`user_public_profiles`

此表存在於 PostgreSQL draft，不存在於目前 SQLite runtime schema。店家可見顧客資訊應優先使用此表，不直接讀取 private profile。

| No. | Field name      | 中文名稱     | Type        | Key    | 規則 / 格式 / 範圍                         | Example                     |
| --- | --------------- | ------------ | ----------- | ------ | ------------------------------------------ | --------------------------- |
| 1   | `user_id`       | 使用者編號   | text        | PK, FK | References `users(id)`                     | `user-customer-yinji`       |
| 2   | `display_alias` | 對外顯示別名 | text        |        | 顯示給店家或其他顧客的名稱                 | `匿名顧客 A`                |
| 3   | `avatar_color`  | 頭像顏色     | text        |        | 可為 NULL；供 UI 顯示                      | `#4F46E5`                   |
| 4   | `privacy_mode`  | 隱私模式     | text        |        | `anonymous`, `display_name`                | `anonymous`                 |
| 5   | `created_at`    | 建立時間     | timestamptz |        | ISO datetime                               | `2026-06-05T00:00:00+08:00` |
| 6   | `updated_at`    | 更新時間     | timestamptz |        | ISO datetime                               | `2026-06-05T00:00:00+08:00` |

## `user_roles`

| No. | Field name   | 中文名稱   | Type | Key             | 規則 / 格式 / 範圍                      | Example                     |
| --- | ------------ | ---------- | ---- | --------------- | --------------------------------------- | --------------------------- |
| 1   | `id`         | 角色編號   | TEXT | PK              | 建議使用 `role_` 加唯一後綴             | `role_001`                  |
| 2   | `user_id`    | 使用者編號 | TEXT | FK, UNIQUE pair | References `users(id)`；與 `role` 唯一  | `user_001`                  |
| 3   | `role`       | 角色       | TEXT | UNIQUE pair     | `customer`, `merchant`, `admin`         | `customer`                  |
| 4   | `status`     | 角色狀態   | TEXT |                 | `active`, `disabled`                    | `active`                    |
| 5   | `granted_at` | 授權時間   | TEXT |                 | ISO datetime string                     | `2026-06-25T10:00:00+08:00` |

## `merchants`

| No. | Field name   | 中文名稱   | Type | Key | 規則 / 格式 / 範圍                 | Example                     |
| --- | ------------ | ---------- | ---- | --- | ---------------------------------- | --------------------------- |
| 1   | `id`         | 商家編號   | TEXT | PK  | 建議使用 `merchant_` 加唯一後綴    | `merchant_001`              |
| 2   | `name`       | 商家名稱   | TEXT |     | 必填                               | `青山手作茶`                |
| 3   | `status`     | 商家狀態   | TEXT |     | `active`, `disabled`               | `active`                    |
| 4   | `created_at` | 建立時間   | TEXT |     | ISO datetime string                | `2026-06-25T10:00:00+08:00` |
| 5   | `updated_at` | 更新時間   | TEXT |     | ISO datetime string                | `2026-06-25T10:30:00+08:00` |

## `merchant_users`

目前 SQLite runtime 仍使用 `merchant_id` 與 `permission_level`。PostgreSQL draft 改為直接連 `store_id`，移除 `permission_level`，並限制一間門市一個店家帳號。

| No. | Field name         | 中文名稱         | Type | Key        | 規則 / 格式 / 範圍                                 | Example                     |
| --- | ------------------ | ---------------- | ---- | ---------- | -------------------------------------------------- | --------------------------- |
| 1   | `id`               | 店家帳號關聯編號 | TEXT | PK         | 建議使用 `merchant_user_` 加唯一後綴               | `merchant_user_001`         |
| 2   | `merchant_id`      | 商家編號         | TEXT | FK, UNIQUE | SQLite runtime：References `merchants(id)`         | `merchant_001`              |
| 3   | `store_id`         | 門市編號         | text | FK, UNIQUE | PostgreSQL draft：References `stores(id)`          | `store-001`                 |
| 4   | `user_id`          | 使用者編號       | TEXT | FK, UNIQUE | References `users(id)`                             | `user_merchant_001`         |
| 5   | `permission_level` | 權限等級         | TEXT |            | SQLite runtime：`owner`, `manager`, `staff`        | `owner`                     |
| 6   | `status`           | 關聯狀態         | TEXT |            | `active`, `disabled`                               | `active`                    |
| 7   | `created_at`       | 建立時間         | TEXT |            | ISO datetime string                                | `2026-06-25T10:00:00+08:00` |

## `stores`

| No. | Field name        | 中文名稱     | Type | Key        | 規則 / 格式 / 範圍                     | Example                     |
| --- | ----------------- | ------------ | ---- | ---------- | -------------------------------------- | --------------------------- |
| 1   | `id`              | 門市編號     | TEXT | PK         | 建議使用 `store_` 加唯一後綴           | `store_001`                 |
| 2   | `merchant_id`     | 商家編號     | TEXT | FK         | References `merchants(id)`             | `merchant_001`              |
| 3   | `name`            | 門市名稱     | TEXT |            | 必填                                   | `青山手作茶 中山店`         |
| 4   | `address`         | 地址         | TEXT |            | 必填                                   | `台中市北區三民路三段...`   |
| 5   | `phone`           | 電話         | TEXT |            | 可為 NULL                              | `04-1234-5678`              |
| 6   | `business_status` | 營業狀態     | TEXT |            | `open`, `closed`, `temporarily_closed` | `open`                      |
| 7   | `latitude`        | 緯度         | REAL | INDEX pair | 必填；地圖座標                         | `24.1505`                   |
| 8   | `longitude`       | 經度         | REAL | INDEX pair | 必填；地圖座標                         | `120.6839`                  |
| 9   | `created_at`      | 建立時間     | TEXT |            | ISO datetime string                    | `2026-06-25T10:00:00+08:00` |
| 10  | `updated_at`      | 更新時間     | TEXT |            | ISO datetime string                    | `2026-06-25T10:30:00+08:00` |

## `menu_items`

| No. | Field name     | 中文名稱     | Type    | Key | 規則 / 格式 / 範圍                 | Example                     |
| --- | -------------- | ------------ | ------- | --- | ---------------------------------- | --------------------------- |
| 1   | `id`           | 菜單品項編號 | TEXT    | PK  | 建議使用 `menu_item_` 加唯一後綴   | `menu_item_001`             |
| 2   | `store_id`     | 門市編號     | TEXT    | FK  | References `stores(id)`            | `store_001`                 |
| 3   | `name`         | 品項名稱     | TEXT    |     | 必填                               | `白玉歐蕾`                  |
| 4   | `category`     | 分類         | TEXT    |     | 必填；分類命名仍可調整             | `鮮奶茶`                    |
| 5   | `description`  | 品項說明     | TEXT    |     | 可為 NULL                          | `鮮奶搭配紅茶`              |
| 6   | `base_price`   | 基本價格     | INTEGER |     | `>= 0`，以 NTD 整數保存            | `70`                        |
| 7   | `is_available` | 是否販售     | INTEGER |     | SQLite：`1` = yes，`0` = no        | `1`                         |
| 8   | `created_at`   | 建立時間     | TEXT    |     | ISO datetime string                | `2026-06-25T10:00:00+08:00` |
| 9   | `updated_at`   | 更新時間     | TEXT    |     | ISO datetime string                | `2026-06-25T10:30:00+08:00` |

## `customization_options`

| No. | Field name     | 中文名稱     | Type    | Key | 規則 / 格式 / 範圍                    | Example         |
| --- | -------------- | ------------ | ------- | --- | ------------------------------------- | --------------- |
| 1   | `id`           | 客製選項編號 | TEXT    | PK  | 建議使用 `option_` 加唯一後綴         | `option_001`    |
| 2   | `menu_item_id` | 菜單品項編號 | TEXT    | FK  | References `menu_items(id)`           | `menu_item_001` |
| 3   | `option_type`  | 選項類型     | TEXT    |     | `sweetness`, `ice`, `topping`, `size` | `ice`           |
| 4   | `label`        | 選項名稱     | TEXT    |     | 必填                                  | `少冰`          |
| 5   | `price_delta`  | 加價金額     | INTEGER |     | 預設 `0`，可為正數                    | `10`            |
| 6   | `sort_order`   | 排序         | INTEGER |     | 數字越小越前面                        | `1`             |
| 7   | `is_available` | 是否可選     | INTEGER |     | SQLite：`1` = yes，`0` = no           | `1`             |

## `group_buy_activities`

| No. | Field name                | 中文名稱         | Type    | Key            | 規則 / 格式 / 範圍                                                                                     | Example                     |
| --- | ------------------------- | ---------------- | ------- | -------------- | ------------------------------------------------------------------------------------------------------ | --------------------------- |
| 1   | `id`                      | 團購活動編號     | TEXT    | PK             | 建議使用 `activity_` 加唯一後綴                                                                        | `activity_001`              |
| 2   | `store_id`                | 門市編號         | TEXT    | FK, INDEX pair | References `stores(id)`                                                                                | `store_001`                 |
| 3   | `created_by_user_id`      | 建立者使用者編號 | TEXT    | FK             | References `users(id)`                                                                                 | `user_merchant_001`         |
| 4   | `title`                   | 活動名稱         | TEXT    |                | 必填                                                                                                   | `離峰優惠團購`              |
| 5   | `status`                  | 活動狀態         | TEXT    | INDEX pair     | `draft`, `recruiting`, `confirmed`, `failed`, `ordering`, `ready_for_pickup`, `completed`, `cancelled` | `recruiting`                |
| 6   | `start_at`                | 開始時間         | TEXT    |                | 目前規則為建立/發布時間或店家設定時間                                                                  | `2026-06-25T14:00:00+08:00` |
| 7   | `deadline_at`             | 截止時間         | TEXT    | INDEX          | 用於鎖單與結算；產品規則要求發布後 24 小時內                                                           | `2026-06-25T15:30:00+08:00` |
| 8   | `pickup_start_at`         | 取貨開始時間     | TEXT    |                | 顧客取貨資訊必填                                                                                       | `2026-06-25T16:00:00+08:00` |
| 9   | `pickup_end_at`           | 取貨結束時間     | TEXT    |                | 顧客取貨資訊必填                                                                                       | `2026-06-25T17:00:00+08:00` |
| 10  | `maximum_cups`            | 最大杯數         | INTEGER |                | 可為 NULL；目前應等於最高 promotion tier，除非未來另定容量規則                                         | `40`                        |
| 11  | `withdrawal_lock_minutes` | 退出鎖定分鐘數   | INTEGER |                | 預設 `30`；截止前 30 分鐘不能修改或退出                                                                | `30`                        |
| 12  | `cancellation_reason`     | 取消原因         | TEXT    |                | 活動取消時填寫                                                                                         | `店家臨時設備維修`          |
| 13  | `created_at`              | 建立時間         | TEXT    |                | ISO datetime string                                                                                    | `2026-06-25T10:00:00+08:00` |
| 14  | `updated_at`              | 更新時間         | TEXT    |                | ISO datetime string                                                                                    | `2026-06-25T10:30:00+08:00` |

## `promotion_tiers`

| No. | Field name        | 中文名稱     | Type    | Key             | 規則 / 格式 / 範圍                                           | Example        |
| --- | ----------------- | ------------ | ------- | --------------- | ------------------------------------------------------------ | -------------- |
| 1   | `id`              | 優惠門檻編號 | TEXT    | PK              | 建議使用 `tier_` 加唯一後綴                                  | `tier_001`     |
| 2   | `activity_id`     | 團購活動編號 | TEXT    | FK, UNIQUE pair | References `group_buy_activities(id)`；與 `target_cups` 唯一 | `activity_001` |
| 3   | `target_cups`     | 目標杯數     | INTEGER | UNIQUE pair     | `> 0`                                                        | `20`           |
| 4   | `discount_amount` | 折扣金額     | INTEGER |                 | `>= 0`，以 NTD 整數保存                                      | `200`          |
| 5   | `sort_order`      | 排序         | INTEGER |                 | 數字越小越前面                                               | `1`            |

## `activity_notices`

| No. | Field name    | 中文名稱     | Type    | Key | 規則 / 格式 / 範圍                    | Example                |
| --- | ------------- | ------------ | ------- | --- | ------------------------------------- | ---------------------- |
| 1   | `id`          | 活動備註編號 | TEXT    | PK  | 建議使用 `notice_` 加唯一後綴         | `notice_001`           |
| 2   | `activity_id` | 團購活動編號 | TEXT    | FK  | References `group_buy_activities(id)` | `activity_001`         |
| 3   | `content`     | 備註內容     | TEXT    |     | 必填                                  | `請於指定時間到店取貨` |
| 4   | `sort_order`  | 排序         | INTEGER |     | 數字越小越前面                        | `1`                    |

## `cart_drafts`

| No. | Field name                     | 中文名稱       | Type | Key               | 規則 / 格式 / 範圍                                | Example                     |
| --- | ------------------------------ | -------------- | ---- | ----------------- | ------------------------------------------------- | --------------------------- |
| 1   | `id`                           | 購物車草稿編號 | TEXT | PK                | 建議使用 `cart_` 加唯一後綴                       | `cart_001`                  |
| 2   | `user_id`                      | 使用者編號     | TEXT | FK, UNIQUE triple | References `users(id)`                            | `user_001`                  |
| 3   | `activity_id`                  | 團購活動編號   | TEXT | FK, UNIQUE triple | References `group_buy_activities(id)`             | `activity_001`              |
| 4   | `status`                       | 草稿狀態       | TEXT | UNIQUE triple     | `active`, `submitted`, `expired`, `cancelled`     | `active`                    |
| 5   | `fallback_purchase_preference` | 未達標購買偏好 | TEXT |                   | `decline_original_price`, `accept_original_price` | `accept_original_price`     |
| 6   | `created_at`                   | 建立時間       | TEXT |                   | ISO datetime string                               | `2026-06-25T10:00:00+08:00` |
| 7   | `updated_at`                   | 更新時間       | TEXT |                   | ISO datetime string                               | `2026-06-25T10:30:00+08:00` |

## `cart_draft_items`

| No. | Field name            | 中文名稱       | Type    | Key | 規則 / 格式 / 範圍                                | Example                     |
| --- | --------------------- | -------------- | ------- | --- | ------------------------------------------------- | --------------------------- |
| 1   | `id`                  | 購物車品項編號 | TEXT    | PK  | 建議使用 `cart_item_` 加唯一後綴                  | `cart_item_001`             |
| 2   | `cart_draft_id`       | 購物車草稿編號 | TEXT    | FK  | References `cart_drafts(id)`                      | `cart_001`                  |
| 3   | `menu_item_id`        | 菜單品項編號   | TEXT    | FK  | References `menu_items(id)`                       | `menu_item_001`             |
| 4   | `item_name_snapshot`  | 品項名稱快照   | TEXT    |     | 保存加入購物車時的顯示名稱                        | `白玉歐蕾`                  |
| 5   | `unit_price_snapshot` | 單價快照       | INTEGER |     | `>= 0`                                            | `70`                        |
| 6   | `quantity`            | 數量           | INTEGER |     | `> 0`                                             | `2`                         |
| 7   | `subtotal`            | 小計           | INTEGER |     | `>= 0`；單價加選項價差後乘以數量                  | `150`                       |
| 8   | `created_at`          | 建立時間       | TEXT    |     | ISO datetime string                               | `2026-06-25T10:00:00+08:00` |
| 9   | `updated_at`          | 更新時間       | TEXT    |     | ISO datetime string                               | `2026-06-25T10:30:00+08:00` |

## `cart_draft_item_customizations`

| No. | Field name                | 中文名稱             | Type    | Key | 規則 / 格式 / 範圍                                | Example                       |
| --- | ------------------------- | -------------------- | ------- | --- | ------------------------------------------------- | ----------------------------- |
| 1   | `id`                      | 購物車客製化編號     | TEXT    | PK  | 建議使用 `cart_item_customization_` 加唯一後綴    | `cart_item_customization_001` |
| 2   | `cart_draft_item_id`      | 購物車品項編號       | TEXT    | FK  | References `cart_draft_items(id)`                 | `cart_item_001`               |
| 3   | `customization_option_id` | 客製選項編號         | TEXT    | FK  | 原選項若被刪除可為 NULL                           | `option_001`                  |
| 4   | `option_type`             | 選項類型             | TEXT    |     | `sweetness`, `ice`, `topping`, `size`             | `topping`                     |
| 5   | `label_snapshot`          | 選項名稱快照         | TEXT    |     | 必填                                              | `珍珠`                        |
| 6   | `price_delta_snapshot`    | 加價金額快照         | INTEGER |     | 預設 `0`，可為正數                                | `10`                          |
| 7   | `sort_order`              | 排序                 | INTEGER |     | 數字越小越前面                                    | `1`                           |

## `orders`

| No. | Field name                     | 中文名稱       | Type    | Key       | 規則 / 格式 / 範圍                                                                | Example                     |
| --- | ------------------------------ | -------------- | ------- | --------- | --------------------------------------------------------------------------------- | --------------------------- |
| 1   | `id`                           | 訂單編號       | TEXT    | PK        | 建議使用 `order_` 加唯一後綴                                                      | `order_001`                 |
| 2   | `activity_id`                  | 團購活動編號   | TEXT    | FK, INDEX | References `group_buy_activities(id)`                                             | `activity_001`              |
| 3   | `customer_user_id`             | 顧客使用者編號 | TEXT    | FK, INDEX | References `users(id)`                                                            | `user_001`                  |
| 4   | `status`                       | 訂單狀態       | TEXT    |           | `draft`, `submitted`, `locked`, `cancelled`, `completed`                          | `submitted`                 |
| 5   | `fallback_purchase_preference` | 未達標購買偏好 | TEXT    |           | `decline_original_price`, `accept_original_price`                                 | `accept_original_price`     |
| 6   | `total_cups`                   | 總杯數         | INTEGER |           | `> 0`；應等於 order item quantity 加總                                            | `4`                         |
| 7   | `original_amount`              | 原始金額       | INTEGER |           | `>= 0`；預授權基準金額                                                            | `280`                       |
| 8   | `final_amount`                 | 最終金額       | INTEGER |           | 結算前可為 NULL                                                                   | `248`                       |
| 9   | `payment_status`               | 付款狀態       | TEXT    | INDEX     | `pending`, `authorized`, `captured`, `authorization_voided`, `failed`, `refunded` | `authorized`                |
| 10  | `authorization_status`         | 預授權狀態     | TEXT    |           | `pending`, `authorized`, `captured`, `authorization_voided`, `failed`             | `authorized`                |
| 11  | `merchant_acceptance_status`   | 店家接單狀態   | TEXT    |           | 舊候選欄位；最新規則不需店家逐筆確認，可考慮固定 `accepted` 或移除                | `accepted`                  |
| 12  | `pickup_status`                | 取貨狀態       | TEXT    |           | `not_ready`, `ready`, `picked_up`, `cancelled`, `expired`                         | `ready`                     |
| 13  | `submitted_at`                 | 送出時間       | TEXT    |           | ISO datetime string                                                               | `2026-06-25T10:15:00+08:00` |
| 14  | `updated_at`                   | 更新時間       | TEXT    |           | ISO datetime string                                                               | `2026-06-25T10:30:00+08:00` |

## `order_items`

| No. | Field name            | 中文名稱     | Type    | Key | 規則 / 格式 / 範圍                                | Example          |
| --- | --------------------- | ------------ | ------- | --- | ------------------------------------------------- | ---------------- |
| 1   | `id`                  | 訂單品項編號 | TEXT    | PK  | 建議使用 `order_item_` 加唯一後綴                 | `order_item_001` |
| 2   | `order_id`            | 訂單編號     | TEXT    | FK  | References `orders(id)`                           | `order_001`      |
| 3   | `menu_item_id`        | 菜單品項編號 | TEXT    | FK  | 原 menu item 被刪除時可為 NULL                    | `menu_item_001`  |
| 4   | `item_name_snapshot`  | 品項名稱快照 | TEXT    |     | 必填                                              | `白玉歐蕾`       |
| 5   | `quantity`            | 數量         | INTEGER |     | `> 0`                                             | `2`              |
| 6   | `unit_price_snapshot` | 單價快照     | INTEGER |     | `>= 0`                                            | `75`             |
| 7   | `subtotal`            | 品項小計     | INTEGER |     | `>= 0`；單價加選項價差後乘以數量                  | `150`            |

## `order_item_customizations`

| No. | Field name                | 中文名稱         | Type    | Key | 規則 / 格式 / 範圍                              | Example                        |
| --- | ------------------------- | ---------------- | ------- | --- | ----------------------------------------------- | ------------------------------ |
| 1   | `id`                      | 訂單客製化編號   | TEXT    | PK  | 建議使用 `order_item_customization_` 加唯一後綴 | `order_item_customization_001` |
| 2   | `order_item_id`           | 訂單品項編號     | TEXT    | FK  | References `order_items(id)`                    | `order_item_001`               |
| 3   | `customization_option_id` | 客製選項編號     | TEXT    | FK  | 原選項若被刪除可為 NULL                         | `option_001`                   |
| 4   | `option_type`             | 選項類型         | TEXT    |     | `sweetness`, `ice`, `topping`, `size`           | `sweetness`                    |
| 5   | `label_snapshot`          | 選項名稱快照     | TEXT    |     | 必填                                            | `微糖`                         |
| 6   | `price_delta_snapshot`    | 加價金額快照     | INTEGER |     | 預設 `0`，可為正數                              | `0`                            |
| 7   | `sort_order`              | 排序             | INTEGER |     | 數字越小越前面                                  | `1`                            |

## `payment_authorizations`

| No. | Field name                  | 中文名稱            | Type    | Key       | 規則 / 格式 / 範圍                                                    | Example                     |
| --- | --------------------------- | ------------------- | ------- | --------- | --------------------------------------------------------------------- | --------------------------- |
| 1   | `id`                        | 預授權編號          | TEXT    | PK        | 建議使用 `pay_auth_` 加唯一後綴                                       | `pay_auth_001`              |
| 2   | `order_id`                  | 訂單編號            | TEXT    | FK, INDEX | References `orders(id)`                                               | `order_001`                 |
| 3   | `provider`                  | 金流服務商          | TEXT    |           | `line_pay`, `mock_line_pay`                                           | `line_pay`                  |
| 4   | `status`                    | 預授權狀態          | TEXT    |           | `pending`, `authorized`, `captured`, `authorization_voided`, `failed` | `authorized`                |
| 5   | `original_amount`           | 原始金額            | INTEGER |           | `>= 0`                                                                | `280`                       |
| 6   | `authorized_amount`         | 預授權金額          | INTEGER |           | `>= 0`；通常等於 original amount                                      | `280`                       |
| 7   | `provider_authorization_id` | Provider 預授權編號 | TEXT    |           | Mock flow 可為 NULL                                                   | `linepay-auth-123`          |
| 8   | `expires_at`                | 預授權到期時間      | TEXT    |           | 可為 NULL；依 provider 規則                                           | `2026-06-26T10:00:00+08:00` |
| 9   | `authorized_at`             | 預授權成功時間      | TEXT    |           | 預授權成功前可為 NULL                                                 | `2026-06-25T10:16:00+08:00` |
| 10  | `voided_at`                 | 取消預授權時間      | TEXT    |           | void 前可為 NULL                                                      | `2026-06-25T15:30:00+08:00` |
| 11  | `failure_reason`            | 失敗原因            | TEXT    |           | 可為 NULL                                                             | `provider_timeout`          |
| 12  | `created_at`                | 建立時間            | TEXT    |           | ISO datetime string                                                   | `2026-06-25T10:15:00+08:00` |
| 13  | `updated_at`                | 更新時間            | TEXT    |           | ISO datetime string                                                   | `2026-06-25T10:16:00+08:00` |

## `payment_captures`

| No. | Field name                 | 中文名稱          | Type    | Key | 規則 / 格式 / 範圍                       | Example                      |
| --- | -------------------------- | ----------------- | ------- | --- | ---------------------------------------- | ---------------------------- |
| 1   | `id`                       | 請款編號          | TEXT    | PK  | 建議使用 `pay_capture_` 加唯一後綴       | `pay_capture_001`            |
| 2   | `payment_authorization_id` | 預授權編號        | TEXT    | FK  | References `payment_authorizations(id)`  | `pay_auth_001`               |
| 3   | `order_id`                 | 訂單編號          | TEXT    | FK  | References `orders(id)`                  | `order_001`                  |
| 4   | `status`                   | 請款狀態          | TEXT    |     | `pending`, `captured`, `failed`          | `captured`                   |
| 5   | `final_amount`             | 最終金額          | INTEGER |     | `>= 0`                                   | `248`                        |
| 6   | `capture_amount`           | 請款金額          | INTEGER |     | `>= 0`；不可超過 authorized amount       | `248`                        |
| 7   | `released_amount`          | 釋放金額          | INTEGER |     | `>= 0`；預授權金額減請款金額             | `32`                         |
| 8   | `provider_capture_id`      | Provider 請款編號 | TEXT    |     | Mock flow 可為 NULL                      | `linepay-capture-123`        |
| 9   | `captured_at`              | 請款時間          | TEXT    |     | 請款前可為 NULL                          | `2026-06-25T15:31:00+08:00`  |
| 10  | `failure_reason`           | 失敗原因          | TEXT    |     | 可為 NULL                                | `insufficient_authorization` |
| 11  | `created_at`               | 建立時間          | TEXT    |     | ISO datetime string                      | `2026-06-25T15:30:00+08:00`  |
| 12  | `updated_at`               | 更新時間          | TEXT    |     | ISO datetime string                      | `2026-06-25T15:31:00+08:00`  |

## `payment_provider_events`

| No. | Field name        | 中文名稱          | Type | Key    | 規則 / 格式 / 範圍                         | Example                     |
| --- | ----------------- | ----------------- | ---- | ------ | ------------------------------------------ | --------------------------- |
| 1   | `id`              | Provider 事件編號 | TEXT | PK     | 建議使用 `pay_event_` 加唯一後綴           | `pay_event_001`             |
| 2   | `provider`        | 金流服務商        | TEXT |        | 必填                                       | `line_pay`                  |
| 3   | `resource_type`   | 資源類型          | TEXT |        | `authorization`, `capture`, `refund`       | `authorization`             |
| 4   | `resource_id`     | 資源編號          | TEXT |        | Provider 或本地資源識別                    | `pay_auth_001`              |
| 5   | `event_type`      | 事件類型          | TEXT |        | Provider event name                        | `authorization.succeeded`   |
| 6   | `idempotency_key` | 冪等鍵            | TEXT | UNIQUE | 防止重複處理                               | `evt_abc123`                |
| 7   | `payload_json`    | 原始事件內容      | TEXT |        | SQLite 為 JSON text；PostgreSQL 為 `jsonb` | `{"status":"authorized"}`   |
| 8   | `received_at`     | 接收時間          | TEXT |        | ISO datetime string                        | `2026-06-25T10:16:00+08:00` |
| 9   | `processed_at`    | 處理時間          | TEXT |        | 處理前可為 NULL                            | `2026-06-25T10:16:01+08:00` |

## `activity_settlements`

| No. | Field name        | 中文名稱         | Type    | Key        | 規則 / 格式 / 範圍                    | Example                     |
| --- | ----------------- | ---------------- | ------- | ---------- | ------------------------------------- | --------------------------- |
| 1   | `id`              | 活動結算編號     | TEXT    | PK         | 建議使用 `settlement_` 加唯一後綴     | `settlement_001`            |
| 2   | `activity_id`     | 團購活動編號     | TEXT    | FK, UNIQUE | 每個 activity 一筆 settlement         | `activity_001`              |
| 3   | `outcome`         | 結算結果         | TEXT    |            | `qualified`, `failed`, `cancelled`    | `qualified`                 |
| 4   | `authorized_cups` | 預授權杯數       | INTEGER |            | `>= 0`；結算時的權威杯數              | `25`                        |
| 5   | `applied_tier_id` | 適用優惠門檻編號 | TEXT    | FK         | 未達標或取消時可為 NULL               | `tier_002`                  |
| 6   | `discount_amount` | 適用折扣金額     | INTEGER |            | `>= 0`                                | `300`                       |
| 7   | `settled_at`      | 結算時間         | TEXT    |            | ISO datetime string                   | `2026-06-25T15:30:00+08:00` |
| 8   | `reason`          | 結算原因         | TEXT    |            | 可為 NULL                             | `deadline_reached`          |

## `pickup_credentials`

| No. | Field name                          | 中文名稱       | Type    | Key        | 規則 / 格式 / 範圍                          | Example                     |
| --- | ----------------------------------- | -------------- | ------- | ---------- | ------------------------------------------- | --------------------------- |
| 1   | `id`                                | 取貨憑證編號   | TEXT    | PK         | 建議使用 `pickup_cred_` 加唯一後綴          | `pickup_cred_001`           |
| 2   | `order_id`                          | 訂單編號       | TEXT    | FK, UNIQUE | 每個 order 一筆 credential                  | `order_001`                 |
| 3   | `pickup_code`                       | 取貨代碼       | TEXT    |            | 必填；格式待定                              | `A7924`                     |
| 4   | `visible_after_merchant_acceptance` | 接單後才顯示   | INTEGER |            | 舊欄位；最新規則不需逐筆接單，需後續 review | `1`                         |
| 5   | `created_at`                        | 建立時間       | TEXT    |            | ISO datetime string                         | `2026-06-25T15:40:00+08:00` |

## `status_history`

| No. | Field name      | 中文名稱         | Type | Key        | 規則 / 格式 / 範圍                                     | Example                     |
| --- | --------------- | ---------------- | ---- | ---------- | ------------------------------------------------------ | --------------------------- |
| 1   | `id`            | 狀態歷程編號     | TEXT | PK         | 建議使用 `status_history_` 加唯一後綴                  | `status_history_001`        |
| 2   | `resource_type` | 資源類型         | TEXT | INDEX pair | `activity`, `order`, `payment_authorization`, `pickup` | `order`                     |
| 3   | `resource_id`   | 資源編號         | TEXT | INDEX pair | 依 `resource_type` 指向對應資源                        | `order_001`                 |
| 4   | `from_status`   | 原狀態           | TEXT |            | 初始建立時可為 NULL                                    | `submitted`                 |
| 5   | `to_status`     | 新狀態           | TEXT |            | 必填                                                   | `locked`                    |
| 6   | `reason`        | 原因             | TEXT |            | 可為 NULL                                              | `deadline_lock`             |
| 7   | `actor_user_id` | 操作者使用者編號 | TEXT | FK         | 系統操作時可為 NULL                                    | `user_admin_001`            |
| 8   | `created_at`    | 建立時間         | TEXT |            | ISO datetime string                                    | `2026-06-25T15:30:00+08:00` |

## `audit_logs`

| No. | Field name      | 中文名稱         | Type | Key        | 規則 / 格式 / 範圍                         | Example                     |
| --- | --------------- | ---------------- | ---- | ---------- | ------------------------------------------ | --------------------------- |
| 1   | `id`            | 稽核紀錄編號     | TEXT | PK         | 建議使用 `audit_` 加唯一後綴               | `audit_001`                 |
| 2   | `actor_user_id` | 操作者使用者編號 | TEXT | FK         | 系統操作時可為 NULL                        | `user_admin_001`            |
| 3   | `action_type`   | 操作類型         | TEXT |            | 必填；使用穩定 action names                | `admin_cancel_activity`     |
| 4   | `resource_type` | 資源類型         | TEXT | INDEX pair | 必填                                       | `activity`                  |
| 5   | `resource_id`   | 資源編號         | TEXT | INDEX pair | 必填                                       | `activity_001`              |
| 6   | `metadata_json` | 補充資料         | TEXT |            | SQLite 為 JSON text；PostgreSQL 為 `jsonb` | `{"reason":"test cancel"}`  |
| 7   | `created_at`    | 建立時間         | TEXT |            | ISO datetime string                        | `2026-06-25T15:35:00+08:00` |

## 目前待解決缺口

| 範圍                    | 目前問題                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| Order revisions         | SQLite 第一版已建立 `order_revisions` 與 revision item tables；仍缺完整欄位字典與歷史查詢 API。    |
| Merchant acceptance     | 最新規則不需要店家逐筆確認接單，`merchant_acceptance_status` 與相關欄位需後續 review。            |
| Pickup visibility       | `visible_after_merchant_acceptance` 可能需要改名或改為與付款/可取餐狀態連動。                     |
| Activity deadline       | 24 小時截止限制與截止前 30 分鐘鎖定規則需落實到 API validation 與可能的 DB constraint。           |
| Pricing snapshots       | 最終折扣、適用 tier 與 per-order 分攤方式仍需更完整保存。                                         |
| Authentication          | `users` 保留 legacy password 欄位，但正式方向是 Firebase Auth + Google Login。                    |
| Notifications           | 尚未有 notification table。                                                                       |
| Production migrations   | 目前 schema 可重建本機資料庫，但尚未導入正式 migration history。                                  |
| Prototype test schema   | `database/test/` 仍為 fixture export 用途，不是權威 normalized schema。                           |
