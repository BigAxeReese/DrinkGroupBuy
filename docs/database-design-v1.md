# 資料庫設計 v1

最後更新：2026-07-30

## 語言與註解規則

本文件用中文描述 DrinkGroupBuy 的資料庫設計基準；必要的技術名稱保留英文，例如資料表、欄位、status value、API JSON 欄位與檔案路徑。

- 資料表與欄位維持 `snake_case`。
- 產品語意使用中文說明。
- 同一概念盡量維持一致命名，例如團購活動使用 `group_buy_activity` / `groupBuyActivity`。
- PostgreSQL 遷移細節請看 `docs/postgresql-migration-plan.md` 與 `database/migrations/001_initial_postgres.sql`。

本文件是目前 DrinkGroupBuy 的資料庫設計基準，說明本機 SQLite 開發 schema，並讓後續 PostgreSQL 遷移方向保持一致。

目前權威實作草案仍是 `database/schema.sql`。本文件用產品與資料設計語意說明 schema，不是 production migration。

## 方向

- 目前開發資料庫：`database/drink-group-buy-dev.sqlite`。
- 目前 schema 來源：`database/schema.sql`。
- 目前 seed 來源：`database/seed-dev.sql`。
- 未來正式資料庫目標：PostgreSQL。
- SQLite 目前是本機開發 backend database，不只是 mock data。
- Firebase 不作為主要正式資料庫；目前決策是只用 Firebase Auth 處理 Google Login，業務資料保留在 backend database / PostgreSQL。

## 目前開發資料

截至 2026-07-20，本機開發資料庫內容如下：

| 資料範圍               | 目前數量 | 說明                                 |
| ---------------------- | -------: | ------------------------------------ |
| Users                  | 12       | 4 customers、7 merchants、1 dev/admin |
| User roles             | 12       | 每個 seed user 一個 active role      |
| Merchants              | 7        | 每間測試店一個 merchant organization |
| Merchant users         | 7        | 每個店家帳號管理一間門市             |
| Stores                 | 7        | 包含地圖座標                         |
| Menu items             | 8        | 開發用菜單品項                       |
| Group-buy activities   | 0        | 已清空，方便乾淨測試                 |
| Promotion tiers        | 0        | 隨 activities 清空                   |
| Orders                 | 0        | 已清空，方便乾淨測試                 |
| Payment authorizations | 0        | 已清空，方便乾淨測試                 |
| Payment captures       | 0        | 已清空，方便乾淨測試                 |
| Pickup credentials     | 0        | 已清空，方便乾淨測試                 |

## 主要資料群組

### 身份與角色

| 資料表                  | 用途                                    | Primary key | 重要關係                         |
| ----------------------- | --------------------------------------- | ----------- | -------------------------------- |
| `users`                 | 顧客、店家與開發補救帳號共用的帳號身份  | `id`        | 1 user 可有多個 role             |
| `user_private_profiles` | PostgreSQL draft 中的內部私人身份資料   | `user_id`   | 1 private profile 屬於 1 user    |
| `user_public_profiles`  | PostgreSQL draft 中可對外顯示的別名資料 | `user_id`   | 1 public profile 屬於 1 user     |
| `user_roles`            | 使用者被授予的角色                      | `id`        | 多個 role 屬於 1 user            |

目前登入方向：

- 正式登入只用 Firebase Auth + Google Login。
- Phone/password 與 email/password 屬於 legacy development compatibility，不再作為新的正式登入流程。
- Mobile 不應讓使用者手動選擇 customer、merchant 或 admin。
- Mobile 完成 Google Login 後取得 Firebase ID token，送給 backend。
- Backend 驗證 Firebase ID token 後，依 `users`、`user_roles` 與 `merchant_users` 決定身份與權限。
- Firebase 只負責 authentication，不是主要資料庫。
- Backend database 是 roles、merchant-store binding、orders、payments、group-buy activity state 的 source of truth。
- `users.firebase_uid` 是 Firebase Auth 身份對應的穩定欄位。
- 顧客未來若要自助註冊，也應透過 Google Login/account-linking 流程。
- 店家看到顧客資料時，應使用 public alias，不直接暴露私人身份或聯絡資料。

PostgreSQL 方向：

- 保留 `users`、`user_private_profiles`、`user_public_profiles`、`user_roles` 作為 normalized relational tables。
- `users` 保存 app identity 與帳號狀態；password hash 欄位可作開發相容，但正式 Google-only flow 不應依賴它。
- `user_private_profiles` 保存真實姓名、聯絡電話、email 等內部資料，不應由店家 API 直接讀取。
- `user_public_profiles` 保存可顯示給店家或其他顧客的 alias，例如 `匿名顧客 A`。
- 後續需補強 Firebase UID 唯一性、帳號連結 audit log、session/token verification policy 與更嚴格的驗證規則。

### 商家與門市

| 資料表           | 用途                       | Primary key | 重要關係                                             |
| ---------------- | -------------------------- | ----------- | ---------------------------------------------------- |
| `merchants`      | 商家組織或品牌             | `id`        | 1 merchant 可擁有多間 store                          |
| `stores`         | 地圖顯示與取貨用的實體門市 | `id`        | Store 屬於 1 merchant                                |
| `merchant_users` | 店家帳號與門市權限連結     | `id`        | PostgreSQL v1 預計 1 store 對 1 merchant account     |

設計說明：

- `merchant` 代表商家組織或品牌。
- `store` 代表地圖上顯示、可取貨的實體門市。
- 目前產品方向是每間門市有自己的店家帳號。
- 目前不拆 owner、manager、staff 等店家內部角色。
- 店家帳號只能管理其綁定門市的資料。

PostgreSQL 方向：

- `merchants`、`stores`、`merchant_users` 分開保存。
- `merchant_users.store_id` 是店家 API 權限邊界。
- PostgreSQL v1 使用 `UNIQUE (store_id)` 與 `UNIQUE (user_id)`，限制一間門市一個店家帳號、一個店家帳號管理一間門市。
- 這與目前 SQLite runtime 的 `merchant_users.merchant_id` 有差異，等 backend 開始 PostgreSQL 遷移時再切換。

### 菜單與客製化

| 資料表                            | 用途                                 | Primary key                    | 重要關係                         |
| --------------------------------- | ------------------------------------ | ------------------------------ | -------------------------------- |
| `menu_items`                      | 門市販售的飲品或商品                 | `id`                           | 多個 menu item 屬於 1 store      |
| `customization_options`           | 甜度、冰塊、加料、尺寸等選項         | `id`                           | 多個 option 屬於 1 menu item     |
| `menu_item_customization_rules`   | 每品項、每類選項的明確選擇數量限制   | `menu_item_id`, `option_type`  | 每組 rule 屬於 1 menu item       |

設計說明：

- 客製化選項以 rows 保存，不用逗號字串。
- 每個品項以 `min_selections`、`max_selections` 明確限制各類型可選數量；加料可由店家設為停用、單選或有上限的多選。
- 這讓菜單符合 first normal form。
- 店家在開團前或團購進行中皆可確認並修改菜單內容。
- 每個團購自動適用活動所屬店家目前 `is_available = true` 的全部飲品；不建立 activity-menu item 關聯表。
- 菜單修改影響後續新選取及未送出的購物車；已送出的訂單使用 snapshot，不應被後續菜單修改改寫。
- 已被訂單引用的品項應以 `is_available = false` 停售，不直接刪除。

目前 PostgreSQL seed 方向：

- 每個 seed menu item 先使用相同基礎選項。
- 甜度：`正常糖`、`半糖`、`微糖`、`無糖`。
- 冰塊：`正常冰`、`少冰`、`微冰`、`去冰`。
- 尺寸：`中杯`、`大杯`。
- 選擇規則：甜度、冰塊、尺寸預設各選 1；加料預設可選 0 至 2 種。
- 加料：`珍珠`、`椰果`。
- `大杯` 加 10 元；`珍珠` 與 `椰果` 各加 10 元；甜度與冰塊加 0 元。

### 團購活動

| 資料表                  | 用途                         | Primary key | 重要關係                       |
| ----------------------- | ---------------------------- | ----------- | ------------------------------ |
| `group_buy_activities`  | 店家建立的團購活動           | `id`        | Activity 屬於 1 store          |
| `promotion_tiers`       | 杯數門檻與總折扣金額         | `id`        | 多個 tier 屬於 1 activity      |
| `activity_notices`      | 顯示於活動詳情的店家備註     | `id`        | 多個 notice 屬於 1 activity    |

重要規則：

- 店家建立並發布團購後，活動進入招募中。
- 團購截止時間必須在建立或發布後 24 小時內。
- 店家設定 `deadline_at`、取貨時間、最低成團杯數與優惠門檻；飲品範圍由該店家目前上架菜單自動決定。
- 取貨開始時間至少晚於截止時間 30 分鐘；建立團購表單預設為截止後 30 分鐘。
- 顧客完成 LINE Pay 預授權後，杯數才納入團購統計。
- 截止前 30 分鐘後，顧客不能修改訂單或退出團購。
- 截止前 30 分鐘後，店家不能取消整個團購。
- 系統在 deadline 鎖定訂單並進行結算。
- 優惠以 authorized cups 判斷。
- 若 tiers 是 20、30、40 杯，除非未來新增獨立容量規則，最高可接受杯數應為 40。
- 顯示目標應是下一個尚未達成的 tier，例如 25 authorized cups 且 tiers 為 20/30/40 時，顯示 `25 / 30`。

PostgreSQL 方向：

- 保留 `group_buy_activities`、`promotion_tiers`、`activity_notices`。
- 使用 transaction 與 row locking 處理活動結算與最大杯數限制。
- PostgreSQL 是多人同時下單與截止結算的目標資料庫。

### 購物車草稿

| 資料表                           | 用途                     | Primary key | 重要關係                              |
| -------------------------------- | ------------------------ | ----------- | ------------------------------------- |
| `cart_drafts`                    | 顧客送出訂單前選好的品項 | `id`        | Cart 屬於 1 user 與 1 activity        |
| `cart_draft_items`               | 購物車中的一杯飲品       | `id`        | 多個 item 屬於 1 cart                 |
| `cart_draft_item_customizations` | 購物車品項的單一客製選項 | `id`        | 多個 customization 屬於 1 cart item   |

重要規則：

- 加入購物車不代表建立正式訂單。
- 送出購物車後才建立 order 並啟動 LINE Pay 預授權。
- 顧客可以選擇若未達優惠時是否接受原價購買。
- 若修改已預授權訂單，舊預授權先保留；新預授權成功後才替換舊訂單。
- 若新預授權失敗，舊訂單與舊預授權維持有效。

PostgreSQL 方向：

- 若保留 server-side cart，就保留這三張 relational tables。
- 可用 scheduled backend job 清理 abandoned carts。
- 將 cart draft 轉成 order 時應使用 transaction。

### 訂單

| 資料表                      | 用途                         | Primary key | 重要關係                         |
| --------------------------- | ---------------------------- | ----------- | -------------------------------- |
| `orders`                    | 顧客在單一活動中的送出訂單   | `id`        | Order 屬於 1 activity 與 1 user  |
| `order_items`               | 訂單中單一飲品的快照         | `id`        | 多個 item 屬於 1 order           |
| `order_item_customizations` | 訂單品項選擇的客製化快照     | `id`        | 多個 customization 屬於 1 item   |

重要規則：

- 訂單品名、單價與客製化名稱都要保存 snapshot。
- 菜單後續修改不應改變既有訂單內容。
- 訂單狀態與取貨狀態分開。
- 顧客只能看到自己送出的 active orders 與歷史訂單。
- 附近招募中的活動應顯示所有 recruiting activities，不只顯示顧客已加入的活動。
- 顧客完成預授權後，訂單即視為已加入團購並納入杯數統計。
- 店家不需要逐筆確認接單，也不能任意取消單一已預授權訂單。
- `orders.merchant_acceptance_status` 是早期候選欄位；最新規則下可能固定為 `accepted` 或在後續 schema 中移除。

PostgreSQL 方向：

- 保留 orders 與 order item snapshot tables。
- SQLite 第一版已新增 `order_revisions` 與 revision item snapshot tables；PostgreSQL draft 仍需同步同等設計。
- 使用 PostgreSQL transaction 防止超過容量，以及避免訂單與付款狀態不一致。

### 付款

| 資料表                    | 用途                             | Primary key | 重要關係                                |
| ------------------------- | -------------------------------- | ----------- | --------------------------------------- |
| `payment_authorizations`  | LINE Pay 預授權嘗試              | `id`        | 多筆 authorization 可屬於 1 order       |
| `payment_captures`        | 截止後確認折扣後的請款結果       | `id`        | Capture 屬於 1 authorization 與 1 order |
| `payment_refunds`         | 已請款交易的退款結果             | `id`        | Refund 屬於 1 capture、authorization 與 order |
| `payment_provider_events` | 金流 provider event 紀錄 | `id`        | 以邏輯方式關聯付款資源，保留未來 webhook 擴充空間 |

目前付款方向：

1. 顧客送出購物車。
2. Backend 建立 order。
3. Backend 建立 LINE Pay authorization request。
4. LINE Pay redirect 回 backend confirm endpoint。
5. Backend 將 authorization 與 order 標記為 authorized。
6. Authorized cups 立即納入團購杯數統計。
7. 店家不逐筆確認接單。
8. 截止時系統計算適用 tier。
9. 若達成優惠，backend 依最終金額進行 capture。
10. 若未達優惠且顧客不接受原價購買，backend void authorization。

尚未完成：

- Deadline settlement scheduler 已使用持久化工作、跨程序 lease claim／takeover、admin 警示查詢與結構化日誌；正式通知通道仍待實作。
- LINE Pay capture 已在付款模組內部實作。
- LINE Pay void 已在付款模組內部實作。
- LINE Pay refund 已有後端開發 / 補救切片；正式規則為商家提出退款申請、營運／補救權限執行，仍缺申請與審核 UI、退款失敗重試及正式 sandbox 人工端對端測試。
- Provider 狀態查詢、付款重試與 reconciliation。
- Order replacement authorization 已有 SQLite revision tables；仍缺對外歷史查詢 API、UI 呈現與 PostgreSQL draft 同步。

PostgreSQL 方向：

- Mobile 不直接呼叫金流 provider。
- Backend 保存 LINE Pay secrets 並進行 request signing。
- 付款狀態保存在 `payment_authorizations`、`payment_captures`、`payment_refunds` 與 `payment_provider_events`。
- PostgreSQL 是 authorization、capture、void、refund、provider event 與付款 reconciliation 的 source of truth。

### 結算與取貨

| 資料表                 | 用途                   | Primary key | 重要關係                      |
| ---------------------- | ---------------------- | ----------- | ----------------------------- |
| `activity_settlements` | 截止結果與適用 tier    | `id`        | 每個 activity 一筆 settlement |
| `pickup_credentials`   | 顯示給顧客的取貨憑證   | `id`        | 每個 order 一筆 credential    |

重要規則：

- 團購截止後，系統計算 authorized cups 與適用 discount tier。
- 每杯折扣使用 `floor(級距總折扣 / 有效授權杯數)`；最終結算保存每杯折扣、實際分配、尾差、出資方與計算版本。
- 達標且完成 capture 後，符合條件的訂單進入製作流程。
- 店家完成製作後，可標記可取餐；系統此時才顯示或產生取貨憑證或取貨代碼。
- 顧客到店取餐時，店家核對取貨憑證或取貨代碼。
- 店家可標記訂單已取貨。
- 取貨憑證自取餐開始時間起保留 3 小時；若店家當日營業結束早於 3 小時，保留至當日營業結束；24 小時營業店家保留 3 小時。
- 憑證到期後，訂單取貨狀態改為 `expired` 並移至歷史訂單；逾期未取不自動退款，店家不再負原飲品保管責任。
- 若顧客在有效取餐期間到店但店家無法交付，不得將訂單標記為 `expired`。
- 顧客歷史訂單應包含 completed、cancelled、未成團、逾期未取，以及超過重新付款期限仍未付款的 failed 訂單。

PostgreSQL 方向：

- 保留 `activity_settlements` 與 `pickup_credentials`。
- `003_activity_settlement_discount_snapshot_postgres.sql` 為 settlement 增加不可變折扣快照與一致性 constraints。
- 每個 activity 只能有一筆 settlement。
- 每個 order 只能有一筆 pickup credential。

### 歷史與稽核

| 資料表           | 用途                   | Primary key | 重要關係                       |
| ---------------- | ---------------------- | ----------- | ------------------------------ |
| `status_history` | 狀態變更紀錄           | `id`        | Polymorphic resource reference |
| `audit_logs`     | 敏感 actor/action 紀錄 | `id`        | Polymorphic resource reference |

設計說明：

- 重要狀態變更必須可追蹤。
- 活動取消、付款狀態變更、截止結算、取貨完成都應寫入 history。
- 付款、取消、權限與後端補救操作尤其需要 audit log。

PostgreSQL 方向：

- `status_history` 與 `audit_logs` 應採 append-only。
- 加入 resource 與 actor index，方便後續後台查詢。

## Primary key 決策

目前所有主要資料表使用名為 `id` 的 text primary key。

PostgreSQL v1 決策：維持 `text` primary key，第一階段不切換 UUID。

原因：

- API JSON 較容易用 `id` 字串引用。
- 從 SQLite 遷移到 PostgreSQL 時，不需要同時改 mobile/API ID 處理。
- 開發資料可以使用可讀 ID，例如 `user-customer-yinji` 或 `store-001`。
- UUID 可作為未來選項，但不是第一版 PostgreSQL migration 的目標。

注意：

- 每張表內使用 `id` 可以接受。
- Foreign key 仍必須明確命名，例如 `user_id`、`store_id`、`activity_id`、`order_id`。

## PostgreSQL 時間欄位決策

PostgreSQL v1 決策：時間欄位使用 `timestamptz`。

適用欄位包含：

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
- `refunded_at`
- `next_retry_at`
- `settled_at`
- 候選：`pickup_credentials.expires_at`、`pickup_credentials.expired_at`

原因：

- 團購截止、付款狀態與取貨時間都必須保存為可靠時間點。
- App 可以顯示台灣時間，但資料庫不應把 UI 格式化字串作為正式長期格式。

## PostgreSQL Boolean 欄位決策

PostgreSQL v1 決策：true/false 欄位使用 `boolean`。

| 欄位                                                   | PostgreSQL 型別 | 意義                 |
| ------------------------------------------------------ | --------------- | -------------------- |
| `menu_items.is_available`                              | `boolean`       | 飲品是否開放販售     |
| `customization_options.is_available`                   | `boolean`       | 客製化選項是否可使用 |
| `pickup_credentials.visible_after_merchant_acceptance` | `boolean`       | 取貨憑證顯示規則     |

API JSON 應回傳 `true` / `false`。

## 正規化檢查

### First normal form

目前權威 schema 大致符合 first normal form：

- 一個欄位只保存一個值。
- 購物車客製化以 child rows 保存。
- 訂單客製化以 child rows 保存。
- 優惠門檻以 rows 保存。

可接受例外：

- `payment_provider_events.payload_json` 保存 provider 原始 payload。
- `audit_logs.metadata_json` 保存 audit metadata。

這些例外是 raw event/audit payload，不是核心查詢欄位。

PostgreSQL v1 決策：這些欄位使用 `jsonb`。

| 欄位                                   | PostgreSQL 型別 | 用途                        |
| -------------------------------------- | --------------- | --------------------------- |
| `payment_provider_events.payload_json` | `jsonb`         | Provider event 原始 payload |
| `audit_logs.metadata_json`             | `jsonb`         | 特定操作的 audit metadata   |

核心訂單、飲品、客製化、優惠、付款狀態與取貨狀態不可用 JSON 取代 relational tables。

### Second normal form

目前 schema 大致符合 second normal form：

- 多數資料表使用 single-column primary key。
- 業務屬性依賴該 row 的 `id`。
- 店家帳號授權獨立在 `merchant_users`，PostgreSQL draft 中一個店家帳號連到一間門市。

### Third normal form

目前 schema 大致符合 third normal form：

- 門市資料屬於 `stores`，不重複塞進 activities 或 orders。
- 菜單基礎資料屬於 `menu_items`。
- 訂單品項快照刻意重複保存品名與價格，目的是保留交易歷史。

刻意保留的 snapshot 欄位：

- `item_name_snapshot`
- `unit_price_snapshot`
- `label_snapshot`
- `price_delta_snapshot`

這不是正規化錯誤，而是訂單查核、付款爭議與歷史追蹤所需。

## Status owners

PostgreSQL v1 決策：status 欄位使用 `text check (...)`，第一版不使用 PostgreSQL enum。

原因：

- 狀態流程仍會隨產品開發調整。
- `text check (...)` 能保留有效值限制，又比 enum 更容易修改。
- 等 activity、order、payment、pickup 流程穩定後，再重新評估 enum。

| Owner               | 目前 status 欄位                                               | 目前值                                                                                                 |
| ------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| User                | `users.status`                                                 | `active`, `disabled`, `deleted`                                                                        |
| Role                | `user_roles.status`                                            | `active`, `disabled`                                                                                   |
| Merchant            | `merchants.status`                                             | `active`, `disabled`                                                                                   |
| Store               | `stores.business_status`                                       | `open`, `closed`, `temporarily_closed`                                                                 |
| Activity            | `group_buy_activities.status`                                  | `draft`, `recruiting`, `confirmed`, `failed`, `ordering`, `ready_for_pickup`, `completed`, `cancelled` |
| Cart                | `cart_drafts.status`                                           | `active`, `submitted`, `expired`, `cancelled`                                                          |
| Order               | `orders.status`                                                | `draft`, `submitted`, `locked`, `cancelled`, `completed`                                               |
| Payment             | `orders.payment_status`                                        | `pending`, `authorized`, `captured`, `authorization_voided`, `failed`, `refunded`                      |
| Authorization       | `orders.authorization_status`, `payment_authorizations.status` | `pending`, `authorized`, `captured`, `authorization_voided`, `failed`                                  |
| Merchant acceptance | `orders.merchant_acceptance_status`                            | `pending`, `accepted`, `rejected`, `cancelled`                                                         |
| Pickup              | `orders.pickup_status`                                         | `not_ready`, `ready`, `picked_up`, `cancelled`, `expired`                                              |
| Settlement          | `activity_settlements.outcome`                                 | `qualified`, `failed`, `cancelled`                                                                     |

注意：最新產品規則不需要店家逐筆確認接單，因此 `merchant_acceptance_status` 需要在後續 schema review 中重新判斷是否保留。

## 建議下一步

1. 確認目前資料表清單是否作為 database design v1。
2. 將 SQLite `order_revisions` 第一版同步到 PostgreSQL migration draft。
3. 為截止結算設計 locking 與 promotion tier 選擇規則。
4. 將 24 小時截止限制與截止前 30 分鐘鎖定規則落到 API validation。
5. 依 `docs/postgresql-migration-plan.md` 規劃 runtime database 切換。

## 待收斂事項

1. `order_revisions` 需要公開完整歷史查詢 API，並決定是否另存更完整的 before/after snapshot。
2. `orders.merchant_acceptance_status` 應移除，或在預授權成功後固定為 `accepted`。
3. `pickup_credentials` 需補 `expires_at` / `expired_at`，並實作逾期處理 job。
4. 顧客 phone number 是否需要加密，或只需 normalize 並由 access control 保護。
5. 使用者要求刪除帳號後，訂單、付款與 audit data 應保留到什麼程度。
