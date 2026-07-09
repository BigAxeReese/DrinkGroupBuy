# Database Table Dictionary

Last updated: 2026-07-09

## 文件用途

本文件整理 DrinkGroupBuy 目前開發資料庫的資料字典，格式偏向分析書 / 論文可用的資料表說明。

資料來源以 `database/schema.sql` 為準。若本文件與實際 schema 不一致，請優先以 `database/schema.sql` 為準。

## 欄位說明

| 欄位     | 說明                              |
| :------- | :-------------------------------- |
| 欄位名稱 | 資料庫實際欄位名稱                |
| 中文名稱 | 分析書使用的中文說明              |
| 欄位型態 | 目前 SQLite schema 使用的欄位型態 |
| NULL     | `N` 表示不可為空，`Y` 表示可為空  |
| PK/FK    | 主鍵、外鍵或其他重要限制          |

## 6.3.1 使用者資料表

使用者資料表主要用於記錄系統中的使用者帳號資料，包含 Firebase Google 登入對應欄位、基本顯示名稱與帳號狀態。正式登入方向為 Firebase Auth + Google Login，系統身分與角色仍由後端資料庫判斷。

表 6.3.1.1 `users` 使用者資料表

| 欄位名稱        | 中文名稱              | 欄位型態 | NULL | PK/FK  |
| :-------------- | :-------------------- | :------- | :--- | :----- |
| `id`            | 使用者編號            | TEXT     | N    | PK     |
| `login_name`    | 登入名稱              | TEXT     | Y    | UNIQUE |
| `phone_number`  | 手機號碼              | TEXT     | Y    | UNIQUE |
| `email`         | 電子郵件              | TEXT     | Y    | UNIQUE |
| `password_hash` | 密碼雜湊              | TEXT     | Y    |        |
| `firebase_uid`  | Firebase 使用者識別碼 | TEXT     | Y    | UNIQUE |
| `display_name`  | 顯示名稱              | TEXT     | N    |        |
| `surname`       | 姓氏                  | TEXT     | Y    |        |
| `status`        | 帳號狀態              | TEXT     | N    |        |
| `created_at`    | 建立時間              | TEXT     | N    |        |
| `updated_at`    | 更新時間              | TEXT     | N    |        |

## 6.3.2 角色資料表

角色資料表主要用於記錄使用者在系統中的角色，例如顧客、商家或管理員。使用者可透過此表與角色建立關聯，登入後由後端查詢角色決定進入對應功能。

表 6.3.2.1 `user_roles` 角色資料表

| 欄位名稱     | 中文名稱     | 欄位型態 | NULL | PK/FK                 |
| :----------- | :----------- | :------- | :--- | :-------------------- |
| `id`         | 角色紀錄編號 | TEXT     | N    | PK                    |
| `user_id`    | 使用者編號   | TEXT     | N    | FK                    |
| `role`       | 角色類型     | TEXT     | N    | UNIQUE(user_id, role) |
| `status`     | 角色狀態     | TEXT     | N    |                       |
| `granted_at` | 授權時間     | TEXT     | N    |                       |

## 6.3.3 商家資料表

商家資料表主要用於記錄飲料店品牌或商家組織資料。商家可擁有一間或多間店家，並透過商家使用者關聯表指定可操作的商家帳號。

表 6.3.3.1 `merchants` 商家資料表

| 欄位名稱     | 中文名稱 | 欄位型態 | NULL | PK/FK |
| :----------- | :------- | :------- | :--- | :---- |
| `id`         | 商家編號 | TEXT     | N    | PK    |
| `name`       | 商家名稱 | TEXT     | N    |       |
| `status`     | 商家狀態 | TEXT     | N    |       |
| `created_at` | 建立時間 | TEXT     | N    |       |
| `updated_at` | 更新時間 | TEXT     | N    |       |

## 6.3.4 商家使用者關聯資料表

商家使用者關聯資料表主要用於記錄使用者與商家之間的管理關係。系統可透過此表判斷商家帳號可管理哪一個商家或店家。

表 6.3.4.1 `merchant_users` 商家使用者關聯資料表

| 欄位名稱           | 中文名稱           | 欄位型態 | NULL | PK/FK |
| :----------------- | :----------------- | :------- | :--- | :---- |
| `id`               | 商家使用者關聯編號 | TEXT     | N    | PK    |
| `merchant_id`      | 商家編號           | TEXT     | N    | FK    |
| `user_id`          | 使用者編號         | TEXT     | N    | FK    |
| `permission_level` | 權限等級           | TEXT     | N    |       |
| `status`           | 關聯狀態           | TEXT     | N    |       |
| `created_at`       | 建立時間           | TEXT     | N    |       |

## 6.3.5 店家資料表

店家資料表主要用於記錄實體門市資料，包含門市名稱、地址、電話、營業狀態與地圖座標。地圖與取餐資訊皆會使用此表資料。

表 6.3.5.1 `stores` 店家資料表

| 欄位名稱          | 中文名稱 | 欄位型態 | NULL | PK/FK |
| :---------------- | :------- | :------- | :--- | :---- |
| `id`              | 店家編號 | TEXT     | N    | PK    |
| `merchant_id`     | 商家編號 | TEXT     | N    | FK    |
| `name`            | 店家名稱 | TEXT     | N    |       |
| `address`         | 店家地址 | TEXT     | N    |       |
| `phone`           | 店家電話 | TEXT     | Y    |       |
| `business_status` | 營業狀態 | TEXT     | N    |       |
| `latitude`        | 緯度     | REAL     | N    | INDEX |
| `longitude`       | 經度     | REAL     | N    | INDEX |
| `created_at`      | 建立時間 | TEXT     | N    |       |
| `updated_at`      | 更新時間 | TEXT     | N    |       |

## 6.3.6 菜單品項資料表

菜單品項資料表主要用於記錄各店家販售的飲料品項，包含品項名稱、分類、說明、基本價格與是否可販售。

表 6.3.6.1 `menu_items` 菜單品項資料表

| 欄位名稱       | 中文名稱     | 欄位型態 | NULL | PK/FK |
| :------------- | :----------- | :------- | :--- | :---- |
| `id`           | 菜單品項編號 | TEXT     | N    | PK    |
| `store_id`     | 店家編號     | TEXT     | N    | FK    |
| `name`         | 品項名稱     | TEXT     | N    |       |
| `category`     | 品項分類     | TEXT     | N    |       |
| `description`  | 品項說明     | TEXT     | Y    |       |
| `base_price`   | 基本價格     | INTEGER  | N    |       |
| `is_available` | 是否可販售   | INTEGER  | N    |       |
| `created_at`   | 建立時間     | TEXT     | N    |       |
| `updated_at`   | 更新時間     | TEXT     | N    |       |

## 6.3.7 客製化選項資料表

客製化選項資料表主要用於記錄飲料可選擇的甜度、冰塊、加料與尺寸等選項，並可設定是否加價與是否可選。

表 6.3.7.1 `customization_options` 客製化選項資料表

| 欄位名稱       | 中文名稱       | 欄位型態 | NULL | PK/FK |
| :------------- | :------------- | :------- | :--- | :---- |
| `id`           | 客製化選項編號 | TEXT     | N    | PK    |
| `menu_item_id` | 菜單品項編號   | TEXT     | N    | FK    |
| `option_type`  | 選項類型       | TEXT     | N    |       |
| `label`        | 選項名稱       | TEXT     | N    |       |
| `price_delta`  | 加價金額       | INTEGER  | N    |       |
| `sort_order`   | 排序           | INTEGER  | N    |       |
| `is_available` | 是否可選       | INTEGER  | N    |       |

## 6.3.8 團購活動資料表

團購活動資料表主要用於記錄商家建立的團購活動，包含活動店家、建立者、活動狀態、開始時間、截止時間、取貨時間與最高杯數等資訊。

表 6.3.8.1 `group_buy_activities` 團購活動資料表

| 欄位名稱                  | 中文名稱         | 欄位型態 | NULL | PK/FK     |
| :------------------------ | :--------------- | :------- | :--- | :-------- |
| `id`                      | 團購活動編號     | TEXT     | N    | PK        |
| `store_id`                | 店家編號         | TEXT     | N    | FK, INDEX |
| `created_by_user_id`      | 建立者使用者編號 | TEXT     | N    | FK        |
| `title`                   | 活動名稱         | TEXT     | N    |           |
| `status`                  | 活動狀態         | TEXT     | N    | INDEX     |
| `start_at`                | 開始時間         | TEXT     | N    |           |
| `deadline_at`             | 截止時間         | TEXT     | N    | INDEX     |
| `pickup_start_at`         | 取貨開始時間     | TEXT     | N    |           |
| `pickup_end_at`           | 取貨結束時間     | TEXT     | N    |           |
| `maximum_cups`            | 最高杯數         | INTEGER  | Y    |           |
| `withdrawal_lock_minutes` | 退出鎖定分鐘     | INTEGER  | N    |           |
| `cancellation_reason`     | 取消原因         | TEXT     | Y    |           |
| `created_at`              | 建立時間         | TEXT     | N    |           |
| `updated_at`              | 更新時間         | TEXT     | N    |           |

## 6.3.9 優惠級距資料表

優惠級距資料表主要用於記錄團購活動的優惠門檻，例如達到幾杯可享有多少折扣。每個團購活動可設定多個優惠級距。

表 6.3.9.1 `promotion_tiers` 優惠級距資料表

| 欄位名稱          | 中文名稱     | 欄位型態 | NULL | PK/FK                                |
| :---------------- | :----------- | :------- | :--- | :----------------------------------- |
| `id`              | 優惠級距編號 | TEXT     | N    | PK                                   |
| `activity_id`     | 團購活動編號 | TEXT     | N    | FK, UNIQUE(activity_id, target_cups) |
| `target_cups`     | 目標杯數     | INTEGER  | N    | UNIQUE(activity_id, target_cups)     |
| `discount_amount` | 折扣金額     | INTEGER  | N    |                                      |
| `sort_order`      | 排序         | INTEGER  | N    |                                      |

## 6.3.10 活動公告資料表

活動公告資料表主要用於記錄商家於團購活動中顯示給顧客的注意事項或活動說明。

表 6.3.10.1 `activity_notices` 活動公告資料表

| 欄位名稱      | 中文名稱     | 欄位型態 | NULL | PK/FK |
| :------------ | :----------- | :------- | :--- | :---- |
| `id`          | 活動公告編號 | TEXT     | N    | PK    |
| `activity_id` | 團購活動編號 | TEXT     | N    | FK    |
| `content`     | 公告內容     | TEXT     | N    |       |
| `sort_order`  | 排序         | INTEGER  | N    |       |

## 6.3.11 購物車草稿資料表

購物車草稿資料表主要用於記錄顧客送出訂單前的購物車狀態，包含所屬使用者、團購活動、草稿狀態與流團時是否接受原價購買。

表 6.3.11.1 `cart_drafts` 購物車草稿資料表

| 欄位名稱                       | 中文名稱       | 欄位型態 | NULL | PK/FK                                    |
| :----------------------------- | :------------- | :------- | :--- | :--------------------------------------- |
| `id`                           | 購物車草稿編號 | TEXT     | N    | PK                                       |
| `user_id`                      | 使用者編號     | TEXT     | N    | FK, UNIQUE(user_id, activity_id, status) |
| `activity_id`                  | 團購活動編號   | TEXT     | N    | FK, UNIQUE(user_id, activity_id, status) |
| `status`                       | 草稿狀態       | TEXT     | N    | UNIQUE(user_id, activity_id, status)     |
| `fallback_purchase_preference` | 流團購買偏好   | TEXT     | N    |                                          |
| `created_at`                   | 建立時間       | TEXT     | N    |                                          |
| `updated_at`                   | 更新時間       | TEXT     | N    |                                          |

## 6.3.12 購物車品項資料表

購物車品項資料表主要用於記錄購物車中的飲料品項，並保存品項名稱、單價、數量與小計等快照資料。

表 6.3.12.1 `cart_draft_items` 購物車品項資料表

| 欄位名稱              | 中文名稱       | 欄位型態 | NULL | PK/FK |
| :-------------------- | :------------- | :------- | :--- | :---- |
| `id`                  | 購物車品項編號 | TEXT     | N    | PK    |
| `cart_draft_id`       | 購物車草稿編號 | TEXT     | N    | FK    |
| `menu_item_id`        | 菜單品項編號   | TEXT     | N    | FK    |
| `item_name_snapshot`  | 品項名稱快照   | TEXT     | N    |       |
| `unit_price_snapshot` | 單價快照       | INTEGER  | N    |       |
| `quantity`            | 數量           | INTEGER  | N    |       |
| `subtotal`            | 小計           | INTEGER  | N    |       |
| `created_at`          | 建立時間       | TEXT     | N    |       |
| `updated_at`          | 更新時間       | TEXT     | N    |       |

## 6.3.13 購物車客製化明細資料表

購物車客製化明細資料表主要用於記錄購物車品項所選擇的甜度、冰塊、加料或尺寸等客製化選項。

表 6.3.13.1 `cart_draft_item_customizations` 購物車客製化明細資料表

| 欄位名稱                  | 中文名稱             | 欄位型態 | NULL | PK/FK |
| :------------------------ | :------------------- | :------- | :--- | :---- |
| `id`                      | 購物車客製化明細編號 | TEXT     | N    | PK    |
| `cart_draft_item_id`      | 購物車品項編號       | TEXT     | N    | FK    |
| `customization_option_id` | 客製化選項編號       | TEXT     | Y    | FK    |
| `option_type`             | 選項類型             | TEXT     | N    |       |
| `label_snapshot`          | 選項名稱快照         | TEXT     | N    |       |
| `price_delta_snapshot`    | 加價金額快照         | INTEGER  | N    |       |
| `sort_order`              | 排序                 | INTEGER  | N    |       |

## 6.3.14 訂單資料表

訂單資料表主要用於記錄顧客送出的團購訂單，包含所屬團購活動、顧客、總杯數、原價金額、付款狀態、商家接單狀態與取貨狀態。

表 6.3.14.1 `orders` 訂單資料表

| 欄位名稱                       | 中文名稱       | 欄位型態 | NULL | PK/FK     |
| :----------------------------- | :------------- | :------- | :--- | :-------- |
| `id`                           | 訂單編號       | TEXT     | N    | PK        |
| `activity_id`                  | 團購活動編號   | TEXT     | N    | FK, INDEX |
| `customer_user_id`             | 顧客使用者編號 | TEXT     | N    | FK, INDEX |
| `status`                       | 訂單狀態       | TEXT     | N    |           |
| `fallback_purchase_preference` | 流團購買偏好   | TEXT     | N    |           |
| `total_cups`                   | 總杯數         | INTEGER  | N    |           |
| `original_amount`              | 原價金額       | INTEGER  | N    |           |
| `final_amount`                 | 最終金額       | INTEGER  | Y    |           |
| `payment_status`               | 付款狀態       | TEXT     | N    | INDEX     |
| `authorization_status`         | 預授權狀態     | TEXT     | N    |           |
| `merchant_acceptance_status`   | 商家接單狀態   | TEXT     | N    |           |
| `pickup_status`                | 取貨狀態       | TEXT     | N    |           |
| `submitted_at`                 | 送出時間       | TEXT     | N    |           |
| `updated_at`                   | 更新時間       | TEXT     | N    |           |

## 6.3.15 訂單品項資料表

訂單品項資料表主要用於記錄訂單中的飲料品項快照，避免日後菜單名稱或價格改變時影響已成立訂單。

表 6.3.15.1 `order_items` 訂單品項資料表

| 欄位名稱              | 中文名稱     | 欄位型態 | NULL | PK/FK |
| :-------------------- | :----------- | :------- | :--- | :---- |
| `id`                  | 訂單品項編號 | TEXT     | N    | PK    |
| `order_id`            | 訂單編號     | TEXT     | N    | FK    |
| `menu_item_id`        | 菜單品項編號 | TEXT     | Y    | FK    |
| `item_name_snapshot`  | 品項名稱快照 | TEXT     | N    |       |
| `quantity`            | 數量         | INTEGER  | N    |       |
| `unit_price_snapshot` | 單價快照     | INTEGER  | N    |       |
| `subtotal`            | 小計         | INTEGER  | N    |       |

## 6.3.16 訂單客製化明細資料表

訂單客製化明細資料表主要用於記錄訂單品項實際選擇的甜度、冰塊、加料或尺寸快照。

表 6.3.16.1 `order_item_customizations` 訂單客製化明細資料表

| 欄位名稱                  | 中文名稱           | 欄位型態 | NULL | PK/FK |
| :------------------------ | :----------------- | :------- | :--- | :---- |
| `id`                      | 訂單客製化明細編號 | TEXT     | N    | PK    |
| `order_item_id`           | 訂單品項編號       | TEXT     | N    | FK    |
| `customization_option_id` | 客製化選項編號     | TEXT     | Y    | FK    |
| `option_type`             | 選項類型           | TEXT     | N    |       |
| `label_snapshot`          | 選項名稱快照       | TEXT     | N    |       |
| `price_delta_snapshot`    | 加價金額快照       | INTEGER  | N    |       |
| `sort_order`              | 排序               | INTEGER  | N    |       |

## 6.3.17 付款預授權資料表

付款預授權資料表主要用於記錄訂單向金流服務商建立的付款授權紀錄，例如 LINE Pay 預授權狀態、授權金額與金流端交易編號。

表 6.3.17.1 `payment_authorizations` 付款預授權資料表

| 欄位名稱                    | 中文名稱     | 欄位型態 | NULL | PK/FK     |
| :-------------------------- | :----------- | :------- | :--- | :-------- |
| `id`                        | 預授權編號   | TEXT     | N    | PK        |
| `order_id`                  | 訂單編號     | TEXT     | N    | FK, INDEX |
| `provider`                  | 金流服務商   | TEXT     | N    |           |
| `status`                    | 預授權狀態   | TEXT     | N    |           |
| `original_amount`           | 原價金額     | INTEGER  | N    |           |
| `authorized_amount`         | 授權金額     | INTEGER  | N    |           |
| `provider_authorization_id` | 金流授權編號 | TEXT     | Y    |           |
| `expires_at`                | 授權到期時間 | TEXT     | Y    |           |
| `authorized_at`             | 授權成功時間 | TEXT     | Y    |           |
| `voided_at`                 | 取消授權時間 | TEXT     | Y    |           |
| `failure_reason`            | 失敗原因     | TEXT     | Y    |           |
| `created_at`                | 建立時間     | TEXT     | N    |           |
| `updated_at`                | 更新時間     | TEXT     | N    |           |

## 6.3.18 付款請款資料表

付款請款資料表主要用於記錄團購結算後實際向金流服務商請款的結果，包含最終金額、請款金額與釋放金額。

表 6.3.18.1 `payment_captures` 付款請款資料表

| 欄位名稱                   | 中文名稱     | 欄位型態 | NULL | PK/FK |
| :------------------------- | :----------- | :------- | :--- | :---- |
| `id`                       | 請款編號     | TEXT     | N    | PK    |
| `payment_authorization_id` | 預授權編號   | TEXT     | N    | FK    |
| `order_id`                 | 訂單編號     | TEXT     | N    | FK    |
| `status`                   | 請款狀態     | TEXT     | N    |       |
| `final_amount`             | 最終金額     | INTEGER  | N    |       |
| `capture_amount`           | 請款金額     | INTEGER  | N    |       |
| `released_amount`          | 釋放金額     | INTEGER  | N    |       |
| `provider_capture_id`      | 金流請款編號 | TEXT     | Y    |       |
| `captured_at`              | 請款時間     | TEXT     | Y    |       |
| `failure_reason`           | 失敗原因     | TEXT     | Y    |       |
| `created_at`               | 建立時間     | TEXT     | N    |       |
| `updated_at`               | 更新時間     | TEXT     | N    |       |

## 6.3.19 金流事件資料表

金流事件資料表主要用於保存金流服務商回傳的事件或 webhook 資料，並透過冪等鍵避免重複處理。

表 6.3.19.1 `payment_provider_events` 金流事件資料表

| 欄位名稱          | 中文名稱     | 欄位型態 | NULL | PK/FK  |
| :---------------- | :----------- | :------- | :--- | :----- |
| `id`              | 金流事件編號 | TEXT     | N    | PK     |
| `provider`        | 金流服務商   | TEXT     | N    |        |
| `resource_type`   | 資源類型     | TEXT     | N    |        |
| `resource_id`     | 資源編號     | TEXT     | N    |        |
| `event_type`      | 事件類型     | TEXT     | N    |        |
| `idempotency_key` | 冪等鍵       | TEXT     | Y    | UNIQUE |
| `payload_json`    | 原始事件內容 | TEXT     | Y    |        |
| `received_at`     | 接收時間     | TEXT     | N    |        |
| `processed_at`    | 處理時間     | TEXT     | Y    |        |

## 6.3.20 活動結算資料表

活動結算資料表主要用於記錄團購截止後的結算結果，包含是否達標、已授權杯數、套用優惠級距與折扣金額。

表 6.3.20.1 `activity_settlements` 活動結算資料表

| 欄位名稱          | 中文名稱         | 欄位型態 | NULL | PK/FK      |
| :---------------- | :--------------- | :------- | :--- | :--------- |
| `id`              | 活動結算編號     | TEXT     | N    | PK         |
| `activity_id`     | 團購活動編號     | TEXT     | N    | FK, UNIQUE |
| `outcome`         | 結算結果         | TEXT     | N    |            |
| `authorized_cups` | 已預授權杯數     | INTEGER  | N    |            |
| `applied_tier_id` | 套用優惠級距編號 | TEXT     | Y    | FK         |
| `discount_amount` | 折扣金額         | INTEGER  | N    |            |
| `settled_at`      | 結算時間         | TEXT     | N    |            |
| `reason`          | 結算原因         | TEXT     | Y    |            |

## 6.3.21 取貨憑證資料表

取貨憑證資料表主要用於記錄訂單取貨時使用的取貨碼，並控制取貨憑證是否需在商家接單後才顯示。

表 6.3.21.1 `pickup_credentials` 取貨憑證資料表

| 欄位名稱                            | 中文名稱     | 欄位型態 | NULL | PK/FK      |
| :---------------------------------- | :----------- | :------- | :--- | :--------- |
| `id`                                | 取貨憑證編號 | TEXT     | N    | PK         |
| `order_id`                          | 訂單編號     | TEXT     | N    | FK, UNIQUE |
| `pickup_code`                       | 取貨代碼     | TEXT     | N    |            |
| `visible_after_merchant_acceptance` | 接單後才顯示 | INTEGER  | N    |            |
| `created_at`                        | 建立時間     | TEXT     | N    |            |

## 6.3.22 狀態歷史資料表

狀態歷史資料表主要用於記錄團購活動、訂單、付款預授權與取貨等資源的狀態變更歷程。

表 6.3.22.1 `status_history` 狀態歷史資料表

| 欄位名稱        | 中文名稱         | 欄位型態 | NULL | PK/FK |
| :-------------- | :--------------- | :------- | :--- | :---- |
| `id`            | 狀態歷史編號     | TEXT     | N    | PK    |
| `resource_type` | 資源類型         | TEXT     | N    | INDEX |
| `resource_id`   | 資源編號         | TEXT     | N    | INDEX |
| `from_status`   | 原狀態           | TEXT     | Y    |       |
| `to_status`     | 新狀態           | TEXT     | N    |       |
| `reason`        | 變更原因         | TEXT     | Y    |       |
| `actor_user_id` | 操作者使用者編號 | TEXT     | Y    | FK    |
| `created_at`    | 建立時間         | TEXT     | N    |       |

## 6.3.23 稽核紀錄資料表

稽核紀錄資料表主要用於記錄敏感操作，例如取消團購、付款狀態變更、管理員操作與商家操作等，以利後續追蹤。

表 6.3.23.1 `audit_logs` 稽核紀錄資料表

| 欄位名稱        | 中文名稱         | 欄位型態 | NULL | PK/FK |
| :-------------- | :--------------- | :------- | :--- | :---- |
| `id`            | 稽核紀錄編號     | TEXT     | N    | PK    |
| `actor_user_id` | 操作者使用者編號 | TEXT     | Y    | FK    |
| `action_type`   | 操作類型         | TEXT     | N    |       |
| `resource_type` | 資源類型         | TEXT     | N    | INDEX |
| `resource_id`   | 資源編號         | TEXT     | N    | INDEX |
| `metadata_json` | 補充資料         | TEXT     | Y    |       |
| `created_at`    | 建立時間         | TEXT     | N    |       |

