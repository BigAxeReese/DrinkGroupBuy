# Database Entity Candidates

## 重要聲明

本文件僅從目前 frontend prototype 推導候選資料實體，不是正式 schema，也不是 migration。欄位名稱候選暫採 `snake_case`。

## Candidate Entities

| entity name | purpose | possible fields | related screens | related API candidates | possible relationships | whether history is needed | uncertainty |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `users` | 未來登入身分與顧客展示資料 | `id`, `google_subject_id`, `display_name`, `surname`, `email`, `created_at` | `GroupProgressPage`, `PickupInfoPage`; 規劃中的登入入口 | future auth、`GET /activities/:activityId/progress` | user 1:N orders; user M:N merchants | 權限變更需記錄 | Google 綁定與姓氏隱私規則 |
| `user_roles` | 表達顧客、商家、管理者角色 | `user_id`, `role_type`, `status`, `granted_at` | 商家頁；規劃中的登入/後台 | `/merchant/*`; future `/admin/*` | N:1 user | 是 | 一人多角色與管理者核發 |
| `merchants` | 商家主體 | `id`, `name`, `status`, `created_at` | `MerchantDealCreatePage`, `MerchantDealDashboardPage` | `GET /merchant/shops`, `GET /merchant/activities` | merchant 1:N shops; M:N users | 授權與停權需記錄 | 品牌與門市層級 |
| `merchant_users` | 商家管理授權關聯 | `merchant_id`, `user_id`, `permission_level`, `status` | `MerchantDealCreatePage`, `MerchantDealDashboardPage` | `/merchant/*` | join entity between users and merchants | 是 | 多門市 scope 與權限層級 |
| `shops` | 實際發布及取貨門市 | `id`, `merchant_id`, `name`, `address`, `latitude`, `longitude`, `phone`, `business_status` | `NearbyDealsPage`, `DealDetailPage`, `PickupInfoPage`, 商家頁 | `GET /activities`, `GET /merchant/shops` | merchant 1:N shops; shop 1:N activities/menu items | 驗證狀態視需求 | Google 地點、營業狀態來源 |
| `group_buy_activities` | 一場獨立團購活動 | `id`, `shop_id`, `created_by_user_id`, `title`, `status`, `start_at`, `deadline_at`, `maximum_cups`, `note` | 首頁、詳情、進度、商家頁 | `GET /activities`, `GET /activities/:activityId`, `POST /merchant/activities` | shop 1:N activities; activity 1:N tiers/orders | 是 | `deal`/`activity` 命名、`current_cups` 是否存值 |
| `promotion_tiers` | 活動杯數折扣級距 | `id`, `activity_id`, `target_cups`, `discount_amount`, `tier_order` | `NearbyDealsPage`, `DealDetailPage`, `GroupProgressPage`, `MerchantDealCreatePage` | detail/progress/create activity candidates | activity 1:N tiers; settlement N:1 tier | 修改時需要版本 | 多級距與 `targetCups` 語意 |
| `activity_notices` | 活動注意事項清單 | `id`, `activity_id`, `content`, `sort_order` | `DealDetailPage`, `MerchantDealCreatePage` | detail/create activity candidates | activity 1:N notices | 若可修改則視需求 | 是否只需 activity 單一 note |
| `activity_status_history` | 保存活動狀態改變及原因 | `id`, `activity_id`, `from_status`, `to_status`, `reason`, `trigger_type`, `created_at` | `DealDetailPage`, `GroupProgressPage`, `MerchantDealDashboardPage` | progress; planned cancellation candidate | activity 1:N status events | 本身即歷史 | `full` / `judging` 是否存在 |
| `activity_cancellations` | 保存商家或後台取消理由 | `id`, `activity_id`, `actor_user_id`, `actor_role`, `reason`, `cancelled_at` | `DealDetailPage`; 規劃中的商家詳情/後台 | planned `POST /merchant/activities/:activityId/cancellations` | activity 1:N cancellation attempts | 本身即歷史 | 原因公開程度與後台權限 |
| `menu_items` | 可訂購飲品 | `id`, `shop_id`, `name`, `category`, `base_price`, `is_available` | `DrinkSelectionPage` | `GET /activities/:activityId/menu` | shop 1:N menu items; M:N toppings | 訂單保存 snapshot | 活動專屬菜單與停售規則 |
| `customization_options` | 甜度與冰量等選項 | `id`, `menu_item_id`, `option_type`, `label`, `is_available` | `DrinkSelectionPage` | menu candidate | menu item 1:N options candidate | 不一定 | 店家共用或單品設定 |
| `toppings` | 加料與附加價格 | `id`, `shop_id`, `name`, `extra_price`, `is_available` | `DrinkSelectionPage` | menu/order submit candidates | shop 1:N toppings; M:N menu items | 訂單保存 snapshot | 可選份數與價格規則 |
| `menu_item_toppings` | 飲品可選加料關聯 | `menu_item_id`, `topping_id` | `DrinkSelectionPage` | menu candidate | join entity | 不一定 | 是否所有飲品共享加料 |
| `orders` | 顧客加入活動及流團偏好 | `id`, `activity_id`, `customer_user_id`, `status`, `fallback_purchase_preference`, `total_cups`, `subtotal_amount`, `submitted_at` | `DrinkSelectionPage`, `GroupProgressPage`, 付款/取貨頁, 商家儀表板 | submit/progress/payment/pickup candidates | activity 1:N orders; user 1:N orders | 是 | 同顧客可否多筆與修改範圍 |
| `order_items` | 訂單飲品與價格快照 | `id`, `order_id`, `menu_item_id`, `item_name_snapshot`, `unit_price_snapshot`, `quantity`, `sweetness`, `ice` | `DrinkSelectionPage`, `GroupProgressPage`, `PickupInfoPage` | order submit/progress candidates | order 1:N items | 修改需追蹤 | 是否支援多品項 |
| `order_item_toppings` | 訂單選定加料快照 | `id`, `order_item_id`, `topping_id`, `topping_name_snapshot`, `extra_price_snapshot`, `quantity` | `DrinkSelectionPage`, `GroupProgressPage` | order submit candidate | item 1:N selected toppings | 修改需追蹤 | 多份加料 |
| `order_revisions` | 記錄訂單修改與退出前後狀態 | `id`, `order_id`, `revision_no`, `change_type`, `before_snapshot`, `after_snapshot`, `changed_at` | `GroupProgressPage`; 規劃中的我的訂單 | planned update/leave candidates | order 1:N revisions | 本身即歷史 | 保存差異或完整 snapshot |
| `activity_settlements` | 截止判定與活動套用優惠結果 | `id`, `activity_id`, `final_cups`, `applied_tier_id`, `outcome`, `reason`, `settled_at` | `GroupProgressPage`, 付款/取貨頁 | progress/payment/pickup candidates | activity 1:1 settlement candidate | 是 | 部分原價履約及折扣公式 |
| `order_settlements` | 個人最終折抵與應付結果 | `id`, `order_id`, `activity_settlement_id`, `original_amount`, `discount_amount`, `payable_amount`, `outcome` | `GroupProgressPage`, `PaymentReportPage`, `PickupInfoPage` | progress/payment/pickup candidates | settlement 1:N order settlements | 是 | 捨入及不付款結果 |
| `payment_reports` | 手動匯款回報方案資料 | `id`, `order_id`, `amount_reported`, `transfer_last_five_digits`, `status`, `submitted_at` | `PaymentReportPage`, `MerchantDealDashboardPage` | payment display/report candidates | order 1:N reports | 是 | 線上支付若為唯一方案則不需 |
| `payment_report_attachments` | 付款截圖參照 | `id`, `payment_report_id`, `storage_reference`, `created_at`, `deleted_at` | `PaymentReportPage` | `POST /orders/:orderId/payment-reports` | report 1:N attachments | 是，含存取 audit | 隱私、保存與刪除規則 |
| `payment_reviews` | 手動付款人工審核 | `id`, `payment_report_id`, `reviewer_user_id`, `decision`, `note`, `reviewed_at` | `MerchantDealDashboardPage`; 規劃中的商家詳情 | future review candidate | report 1:N reviews | 本身即歷史 | 線上付款後是否仍需人工處理 |
| `payment_authorizations` | 線上支付預授權候選 | `id`, `order_id`, `provider`, `provider_reference`, `authorized_amount`, `status`, `authorized_at` | 付款頁替代方向、進度與商家頁 | planned payment authorization/status candidates | order 1:N authorizations | 是 | provider 能力與授權金額 |
| `payment_captures` | 線上支付實際請款結果 | `id`, `authorization_id`, `amount`, `status`, `captured_at` | 付款頁替代方向、商家頁 | planned payment status candidate | authorization 1:N captures | 是 | 截止結算時機 |
| `payment_releases` | 授權釋放或取消結果 | `id`, `authorization_id`, `status`, `released_at`, `failure_reason` | 付款頁替代方向 | planned payment status candidate | authorization 1:N releases | 是 | 取消/退出/流團處理 |
| `pickup_windows` | 活動指定取貨時段 | `id`, `activity_id`, `start_at`, `end_at`, `instruction` | `DealDetailPage`, `PickupInfoPage`, `MerchantDealCreatePage` | activity detail/create/pickup candidates | activity 1:N windows candidate | 變更時需要 | 是否只允許單一時段 |
| `order_pickups` | 個人取貨資格與核銷狀態 | `id`, `order_id`, `pickup_window_id`, `status`, `pickup_identifier`, `picked_up_at` | `PickupInfoPage`, `MerchantDealDashboardPage` | pickup candidate | order 1:1 pickup candidate | 核銷時需要 | 識別方式與付款前置條件 |
| `pickup_window_changes` | 取貨時間異動原因與前後值 | `id`, `pickup_window_id`, `before_snapshot`, `after_snapshot`, `reason`, `changed_at` | `PickupInfoPage` | pickup candidate | window 1:N changes | 本身即歷史 | 是否允許商家改時段 |
| `notifications` | 日後通知發送及已讀記錄 | `id`, `recipient_user_id`, `event_type`, `delivery_status`, `read_at` | 取貨異動 placeholder；規劃中提示流程 | future candidate only | user 1:N notifications | 本身即歷史 | 第一階段不實作通知 |
| `audit_logs` | 敏感操作稽核 | `id`, `actor_user_id`, `action_type`, `resource_type`, `resource_id`, `metadata`, `created_at` | 規劃中的後台/取消/付款審核 | future candidate only | actor/resource event association | 本身即歷史 | 稽核範圍與保存期限 |

## 正規化、併發與一致性風險

| Risk | Candidate impact |
| --- | --- |
| `deals` 與 `groupOrders` mock 同時含進度值 | 正式設計需指定活動杯數的 source of truth 或可重算 aggregate |
| 訂單品項需保留文字與價格 | 使用 snapshot 避免歷史訂單隨菜單變更 |
| 飲料與加料可能多對多 | 使用關聯實體，避免正式資料壓成顯示字串 |
| 商家、使用者與門市可能多對多 | 以授權關聯表管控 scope |
| 多人同時加入達上限 | 訂單新增與容量判定需要 transaction / version strategy |
| 截止時間同時仍有變更請求 | 需明確界定鎖定與結算時點 |
| 訂單、優惠、付款與取貨相依 | 需要 history/audit 或可補償事件，不能只保存最後 badge |
## Mobile Prototype Candidate Addendum

These entities are inferred from the Android-first `mobile/` prototype. They are not formal schema and not migrations.

| Entity name | Purpose | Possible fields | Related mobile screens | Related API candidates | Possible relationships | Whether history is needed | Uncertainty |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `users` | Future account identity for customer and merchant roles | `id`, `display_name`, `email`, `provider`, `created_at` | RoleSelectScreen and all authenticated future screens | future auth/me candidates | user 1:N roles/orders | Maybe | Real login is intentionally absent |
| `user_roles` | Distinguish customer and merchant capabilities | `id`, `user_id`, `role`, `status`, `granted_at` | RoleSelectScreen, MerchantDashboardScreen | `/mobile/me/roles` candidate | user 1:N roles | Yes for grants/revokes | Whether one account can be both customer and merchant |
| `mobile_sessions` | Future app session/auth placeholder | `id`, `user_id`, `device_id`, `platform`, `created_at` | All mobile screens | future auth candidates | user 1:N sessions | Maybe | Real login is not in prototype |
| `stores` | Physical store data | `id`, `merchant_id`, `name`, `address`, `phone`, `business_status`, `lat`, `lng` | Nearby, detail, merchant create, pickup | nearby/store/menu candidates | merchant 1:N stores | Business status history maybe | Location precision and registration rules |
| `group_buy_activities` | Merchant discount activity | `id`, `store_id`, `title`, `status`, `start_time`, `end_time`, `pickup_time`, `max_cups`, `cancel_reason` | Nearby, detail, progress, merchant dashboard | deal candidates | store 1:N activities | Yes | Canonical name still undecided |
| `discount_tiers` | Cup threshold discounts | `id`, `activity_id`, `cups`, `discount_amount`, `sort_order` | Detail, create, progress | deal/create candidates | activity 1:N tiers | Maybe | Tier edit rules |
| `drinks` | Store menu item | `id`, `store_id`, `name`, `category`, `price`, `status` | Drink selection | menu candidate | store 1:N drinks | Maybe | Menu sync and availability |
| `drink_customization_options` | Sweetness/ice/topping choices | `id`, `drink_id`, `option_type`, `name`, `price` | Drink selection | menu/order candidates | drink 1:N options | Maybe | Multi-select and quantity |
| `orders` | Customer participation | `id`, `activity_id`, `customer_user_id`, `status`, `fallback_preference`, `subtotal`, `total_cups` | Drink selection, progress, payment, pickup | order candidates | activity 1:N orders | Yes | Same customer multiple orders |
| `order_items` | Drink line items | `id`, `order_id`, `drink_id`, `quantity`, `unit_price`, `subtotal` | Drink selection, progress | order candidates | order 1:N items | Yes | Multi-item support |
| `order_item_customizations` | Selected sweetness/ice/toppings | `id`, `order_item_id`, `option_type`, `name`, `price` | Drink selection, progress | order candidates | order item 1:N customizations | Yes | Snapshot vs menu reference |
| `activity_settlements` | Deadline result and applied tier | `id`, `activity_id`, `outcome`, `final_cups`, `applied_tier_id`, `settled_at` | Progress, payment, pickup | progress/payment candidates | activity 1:1 settlement | Yes | Partial original-price fallback |
| `payment_authorizations` | Future online payment auth | `id`, `order_id`, `provider`, `status`, `authorized_amount`, `provider_ref` | Payment | payment candidates | order 1:N authorizations | Yes | Provider choice |
| `payment_reports` | Legacy/manual transfer report only if retained | `id`, `order_id`, `last_five_digits`, `status`, `submitted_at` | Payment legacy candidate | payment report candidates | order 1:N reports | Yes | Current direction is Line Pay, so this may be removed |
| `line_pay_transactions` | Store Line Pay transaction state | `id`, `order_id`, `transaction_id`, `status`, `amount`, `requested_at`, `confirmed_at`, `cancelled_at` | PaymentReportScreen, MerchantDashboardScreen | Line Pay payment candidates | order 1:N provider transactions | Yes | Exact provider fields depend on integration |
| `pickup_windows` | Store pickup schedule | `id`, `activity_id`, `start_time`, `end_time`, `instructions` | Pickup, detail, create | pickup candidates | activity 1:N windows | Yes | Change rules |
| `order_pickups` | Individual pickup state | `id`, `order_id`, `pickup_window_id`, `status`, `pickup_code`, `picked_up_at` | Pickup, merchant dashboard | pickup candidates | order 1:1 pickup | Yes | Verification method |
| `audit_logs` | Sensitive action tracking | `id`, `actor_id`, `action`, `resource_type`, `resource_id`, `metadata`, `created_at` | Merchant create/dashboard, cancellation, payment | future admin/merchant candidates | polymorphic event record | It is history | Scope and retention |

### Mobile Interaction Addendum

| Entity name | Purpose | Possible fields | Related mobile screens | Related API candidates | Possible relationships | Whether history is needed | Uncertainty |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `role_selection_events` | Optional analytics/audit for switching role in one app | `id`, `user_id`, `selected_role`, `created_at` | RoleSelectScreen | future auth/session candidates | user 1:N events | Maybe | Usually not needed unless role switching affects permissions |
| `order_drafts` | Preserve mobile drink customization before final join | `id`, `user_id`, `deal_id`, `payload`, `expires_at`, `created_at` | DrinkSelectionScreen | future draft candidate | user 1:N drafts | Maybe | Current prototype submits immediately; Android back behavior unresolved |
| `order_events` | Track order create, edit, submit, cancel events | `id`, `order_id`, `event_type`, `before_snapshot`, `after_snapshot`, `created_at` | DrinkSelectionScreen, GroupProgressScreen | order candidates | order 1:N events | Yes | Required if edits/withdrawals affect settlement |
| `activity_progress_snapshots` | Store or cache cups/participant summary over time | `id`, `activity_id`, `current_cups`, `participant_count`, `created_at` | NearbyDealsScreen, GroupProgressScreen, MerchantDashboardScreen | progress/summary candidates | activity 1:N snapshots | Maybe | Could be computed instead of stored |
| `payment_provider_events` | Track provider callbacks and payment state changes | `id`, `payment_transaction_id`, `provider`, `event_type`, `payload_reference`, `created_at` | PaymentReportScreen, MerchantDashboardScreen | Line Pay payment candidates | transaction 1:N provider events | Yes | Payload retention and audit policy |
| `merchant_activity_summaries` | Optional materialized merchant dashboard summary | `activity_id`, `order_count`, `confirmed_payment_count`, `ready_pickup_count`, `updated_at` | MerchantDashboardScreen | merchant summary candidate | activity 1:1 summary | Maybe | Live query vs materialized summary |

## Authorization And Partial Capture Addendum

These are candidate entities only. They are not a formal schema and no migration exists.

| Entity name | Purpose | Possible fields | Related screens | Related API candidates | Possible relationships | Whether history is needed | Uncertainty |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `payment_authorizations` | Store pre-authorization attempts and state | `id`, `order_id`, `provider`, `status`, `original_amount`, `authorized_amount`, `provider_authorization_id`, `expires_at`, `authorized_at`, `voided_at`, `failure_reason` | PaymentReportScreen, GroupProgressScreen | authorize/read/void candidates | order 1:N authorizations | Yes | Provider-specific fields and auth expiry |
| `payment_captures` | Store final discounted capture attempts | `id`, `payment_authorization_id`, `order_id`, `status`, `final_amount`, `capture_amount`, `released_amount`, `provider_capture_id`, `captured_at`, `failure_reason` | PaymentReportScreen, GroupProgressScreen, MerchantDashboardScreen | capture candidate | authorization 1:N captures candidate | Yes | Whether only one capture is allowed |
| `payment_provider_events` | Store provider callbacks/webhook events | `id`, `provider`, `resource_type`, `resource_id`, `event_type`, `event_time`, `payload_reference`, `processed_at`, `idempotency_key` | PaymentReportScreen, MerchantDashboardScreen | webhook candidates | provider event N:1 authorization/capture | Yes | Payload retention, privacy, and replay policy |
| `discount_snapshots` | Preserve exact discount calculation used for capture | `id`, `activity_id`, `target_cups`, `authorized_cups`, `discount_status`, `discount_amount`, `computed_at` | GroupProgressScreen, PaymentReportScreen | progress/capture candidates | activity 1:N snapshots; capture N:1 snapshot | Yes | Whether discount is per-cup, average split, or tier-based |
| `activity_settlement_events` | Record deadline settlement and authorization/capture decisions | `id`, `activity_id`, `event_type`, `authorized_cups`, `target_cups`, `created_at`, `metadata` | GroupProgressScreen, MerchantDashboardScreen | settlement candidates | activity 1:N events | Yes | Who or what triggers final settlement |
| `order_payment_state_history` | Audit payment state transitions per order | `id`, `order_id`, `from_status`, `to_status`, `reason`, `created_at`, `provider_event_id` | PaymentReportScreen, CustomerOrdersScreen, MerchantDashboardScreen | payment candidates | order 1:N history | Yes | Whether this can be derived from provider events |
