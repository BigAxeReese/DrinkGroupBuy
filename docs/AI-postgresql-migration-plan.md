# PostgreSQL 遷移規劃

最後更新：2026-08-13

本文件整理從目前 SQLite 開發資料庫遷移到 PostgreSQL 的方向。它是規劃文件，不是可直接執行的 production migration。

## 目前狀態

- 目前開發資料庫：SQLite。
- SQLite schema：`database/schema.sql`。
- SQLite seed：`database/seed-dev.sql`。
- Backend 目前仍以本機 SQLite 作為開發資料來源。
- PostgreSQL schema draft：`database/migrations/001_initial_postgres.sql`。
- PostgreSQL seed draft：`database/migrations/002_seed_dev_postgres.sql`。
- PostgreSQL 結算折扣快照 migration draft：`database/migrations/003_activity_settlement_discount_snapshot_postgres.sql`。
- 統一 PostgreSQL migration runner：`database/migrate.js`（`npm run postgres:migrate`）。
- 本機 PostgreSQL 設定草案：`database/docker-compose.postgres.yml`。

## 為什麼要遷移到 PostgreSQL

DrinkGroupBuy 後續會處理訂單、付款、截止結算與多使用者同時加入團購，PostgreSQL 比 SQLite 更適合正式 backend 使用。

- 支援更可靠的 transaction 與 row lock。
- 適合處理 LINE Pay authorization、capture、void、refund、provider event 與付款 reconciliation 狀態。
- 適合保存 audit log 與 status history。
- 適合處理活動截止時的結算批次。
- 適合防止多人同時下單造成杯數超過上限。
- 適合長期保留訂單、付款與取貨紀錄。

## 遷移原則

1. 第一版 PostgreSQL 先保留 `text` primary key，不改成 UUID。
2. 資料表與欄位維持 `snake_case`。
3. API JSON 對外仍使用 `camelCase`。
4. 訂單、付款、活動狀態需要保留歷史紀錄。
5. Mobile app 不應直接連資料庫。
6. 金流密鑰只放 backend 環境變數，不進 database 或 mobile。
7. PostgreSQL migration 必須可追蹤、可重跑到乾淨 dev database（已由 `database/migrate.js` 統一 runner 滿足，詳見下方「2026-08-12 統一 migration runner」）。
8. PostgreSQL draft 可與目前 SQLite runtime schema 有少量差異，但差異要寫清楚。

## Primary key 決策

決策：PostgreSQL v1 繼續使用 `text` ID。

原因：

- 目前 SQLite schema 已使用 text ID。
- Mobile 與 API 已把 ID 視為字串。
- 開發資料可以使用可讀 ID，例如 `user-customer-yinji`、`store-001`。
- 第一階段遷移不應同時改變 ID 型別與所有 API 行為。
- UUID 可保留為未來選項，但不是第一版遷移目標。

範例：

```sql
id text primary key
```

## 時間欄位決策

決策：PostgreSQL 的時間欄位使用 `timestamptz`。

原因：

- 團購截止時間、付款預授權時間、取貨時間與結算時間都必須是可靠時間點。
- UI 可以顯示台灣時間，但資料庫不應長期保存 UI formatted string。
- `timestamptz` 可避免時區解讀不一致。

範例：

```sql
created_at timestamptz not null
updated_at timestamptz not null
deadline_at timestamptz not null
authorized_at timestamptz
```

適用欄位包含：

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

## Boolean 欄位決策

決策：PostgreSQL 的 true/false 欄位使用 `boolean`。

| SQLite 欄位                                            | PostgreSQL 型別 | 說明                 |
| ------------------------------------------------------ | --------------- | -------------------- |
| `menu_items.is_available`                              | `boolean`       | 飲品是否開放販售     |
| `customization_options.is_available`                   | `boolean`       | 客製化選項是否可使用 |
| `pickup_credentials.visible_after_merchant_acceptance` | `boolean`       | 取貨憑證顯示規則     |

API JSON 應對外回傳 `true` / `false`，不要回傳 `1` / `0`。

## JSON 欄位決策

決策：只有 raw provider payload 與 audit metadata 使用 `jsonb`。

| SQLite 欄位                            | PostgreSQL 型別 | 說明                                   |
| -------------------------------------- | --------------- | -------------------------------------- |
| `payment_provider_events.payload_json` | `jsonb`         | 保存 LINE Pay 或其他 provider 原始事件 |
| `audit_logs.metadata_json`             | `jsonb`         | 保存敏感操作的補充 metadata            |

限制：

- 不用 JSON 保存核心訂單、飲品、客製化、優惠門檻或付款狀態。
- 核心資料仍使用 relational child tables。
- `jsonb` 僅用於 trace、debug、audit 與 provider event 重播。

## Status 欄位決策

決策：PostgreSQL v1 使用 `text check (...)`，不使用 PostgreSQL enum。

原因：

- 目前 activity、order、payment、pickup 狀態仍會隨產品規則調整。
- `text check (...)` 可以保留有效值限制，又比 enum 容易修改。
- 等流程穩定後，再評估是否改用 enum。

範例：

```sql
status text not null check (status in ('recruiting', 'confirmed', 'failed', 'cancelled'))
payment_status text not null check (payment_status in ('pending', 'authorized', 'captured', 'authorization_voided', 'failed', 'refunded'))
```

目前主要 status 欄位：

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

## SQLite 到 PostgreSQL 型別對照

| SQLite 型別或寫法                       | PostgreSQL 型別       | 說明                          |
| --------------------------------------- | --------------------- | ----------------------------- |
| `TEXT PRIMARY KEY`                      | `text PRIMARY KEY`    | 第一版維持 text ID            |
| `TEXT` datetime                         | `timestamptz`         | 用於 created_at、deadline_at  |
| `INTEGER` 數量或金額                    | `integer`             | 金額以 NTD 整數保存           |
| `INTEGER` boolean with `CHECK (0, 1)`   | `boolean`             | 例如 `is_available`           |
| `REAL` latitude / longitude             | `double precision`    | 地圖座標                      |
| JSON text                               | `jsonb`               | provider events 與 audit logs |
| `CHECK (...)` status strings            | `text CHECK (...)`    | 第一版不使用 enum             |
| `UNIQUE (...)`                          | 相同                  | PostgreSQL 支援               |
| `REFERENCES ... ON DELETE CASCADE`      | 相同                  | PostgreSQL 支援               |

## PostgreSQL schema 分組

| 分組           | 資料表                                                                  |
| -------------- | ----------------------------------------------------------------------- |
| 身份與角色     | `users`, `user_roles`, `user_private_profiles`, `user_public_profiles`  |
| 商家與門市     | `merchants`, `merchant_users`, `stores`                                 |
| 菜單           | `menu_items`, `customization_options`, `menu_item_customization_rules`  |
| 團購活動       | `group_buy_activities`, `promotion_tiers`, `activity_notices`           |
| 購物車草稿     | `cart_drafts`, `cart_draft_items`, `cart_draft_item_customizations`     |
| 訂單           | `orders`, `order_items`, `order_item_customizations`, `order_action_idempotency`, `order_revisions`, `order_revision_items`, `order_revision_item_customizations` |
| 付款           | `payment_authorizations`, `payment_captures`, `payment_refunds`, `refund_requests`, `payment_provider_events` |
| 結算與取貨     | `activity_settlements`, `pickup_credentials`                            |
| 狀態與稽核     | `status_history`, `audit_logs`                                          |

## PostgreSQL 後續候選 schema

目前 SQLite 已使用的交易結構已於 PostgreSQL 全數補齊（`order_revisions`／revision item tables、`menu_item_customization_rules`、`order_action_idempotency`、`payment_refunds`、`refund_requests` 皆已存在於 `001_initial_postgres.sql` 或 `004_order_revision_refund_pickup_postgres.sql`），無 parity 缺口。以下為純未來功能候選，可延後：

| 候選項目             | 可能資料表或欄位                         | 原因                                      |
| -------------------- | ---------------------------------------- | ----------------------------------------- |
| Session              | `sessions`, `refresh_tokens`             | 若未來 backend 自行管理 session           |
| Settlement job log   | settlement job attempt table             | 追蹤截止結算重試與失敗原因                |
| Notification         | `notifications`, `notification_events`   | 實作推播或站內通知時需要                  |
| Verification policy  | phone/email verification audit fields    | 若未來手機或 email 驗證成為正式需求       |

## 遷移階段

### Phase 1：盤點完成

- 保留 SQLite runtime。
- 建立 PostgreSQL schema draft。
- 建立 database design v1。
- 確認 primary key 第一版使用 `text`。
- 確認時間欄位使用 `timestamptz`。

### Phase 2：加入 PostgreSQL dependency

- 在 backend 加入 `pg` 或 query builder / migration tool。
- 在 `backend/.env` 加入 `DATABASE_URL`。
- 在 `.env.example` 提供不含密鑰的範例。
- 保留現有 SQLite code path，直到 PostgreSQL vertical slice 穩定。

### Phase 3：完成 PostgreSQL schema migration

- 完成 `database/migrations/001_initial_postgres.sql`。
- 將 SQLite schema 轉為 PostgreSQL-compatible SQL。
- 補上 constraints 與 indexes。
- 使用 `jsonb` 保存 provider/audit payload。
- 使用 `003_activity_settlement_discount_snapshot_postgres.sql` 為既有 settlement 回填不可變折扣快照與一致性 constraints。

驗收：

- migration 可在乾淨 dev database 成功執行。
- 尚未切換 backend runtime。
- 尚未碰正式資料。

#### 活動結算折扣快照決策

`activity_settlements.discount_amount` 繼續代表適用級距的總折扣。PostgreSQL `003` 額外保存：

- `discount_per_cup`：截止時每杯實際折扣。
- `allocated_discount_amount`：實際分配到顧客訂單的總額。
- `undistributed_discount_amount`：無法整除的尾差。
- `discount_funder`：優惠出資方，第一版允許 `merchant` 或 `platform`。
- `calculation_version`：第一版固定為 `floor_per_cup_v1`。

保存衍生欄位是為了讓歷史結算不受未來公式與出資規則變更影響。Database constraints 強制「實際分配 + 尾差 = 級距總折扣」以及「實際分配 = 每杯折扣 × 有效授權杯數」。SQLite runtime 目前仍由既有 `discount_amount` 與 `authorized_cups` 重算；本 migration 不代表 runtime 切換或雙寫。

### Phase 4：完成 PostgreSQL seed data

- 完成 `database/migrations/002_seed_dev_postgres.sql`。
- Seed 顧客、店家、管理員、商家、門市與菜單。
- 不 seed runtime 團購、訂單、付款與取貨資料，避免測試殘留。

### Phase 5：建立 backend repository layer

以 adapter / repository layer 逐步抽換資料庫存取。目前已完成下列程式、真實 runtime 與 HTTP source proof：

1. Customer public store menu read（已完成；repository、真實 PostgreSQL runtime 與 HTTP source proof 均通過）。
2. List activities（已完成；repository、真實 PostgreSQL runtime 與 HTTP source proof 均通過）。
3. Login／role／merchant-store permission（已完成；repository、真實 PostgreSQL runtime 與 HTTP source proof 均通過）。
4. Merchant creates activity（已完成；transaction、merchant/store row lock、菜單價格鎖定、idempotency 與 HTTP source proof 均通過）。
5. Merchant reads／writes full store menu（已完成；store-first row lock、折扣回歸防護、audit log、HTTP source proof 與清理均通過）。
6. Customer creates order（已完成；activity row lock、deadline／capacity／price／duplicate guards、snapshots、history、audit 與 HTTP proof 均通過）。
7. Customer order read／payment request context（已完成；列表、明細、request lease、pending authorization、history、audit、retry job 與 HTTP proof 均通過）。
8. LINE Pay authorization confirm（已完成；activity-first row lock、截止／期限／容量重驗、狀態／provider event／history／audit、retry job 完成與拒絕補償 void proof 均通過）。
9. Payment capture／group-buy settlement（已完成並接入 server route／scheduler；`PAYMENT_CAPTURE_RUNTIME`／`GROUP_BUY_SETTLEMENT_RUNTIME` 須同為 postgres，production 另需 `PAYMENT_CAPTURE_RUNTIME_ALLOW_PRODUCTION=true`）。
10. Order revision（已完成並接入 server route；`ORDER_REVISION_RUNTIME`，重用 customer order write 既有計價／折扣驗證）。
11. Refund（已完成並接入 server route；`PAYMENT_REFUND_RUNTIME`，涵蓋 provider 退款執行與商家退款申請審核流程）。
12. Pickup credential（已完成並接入 server route／排程；`PICKUP_CREDENTIAL_RUNTIME`，涵蓋 mark-ready、顧客／商家查詢、redeem 與取貨逾期排程）。

商家菜單、建立團購、顧客首次建單、訂單讀取、authorization request／confirm／cancel、capture／settlement、改單／revision、refund 與 pickup 均已使用同一 PostgreSQL 資料來源並接上各自的 server route／scheduler；建單、confirm、cancel／void 與顧客取消採 activity-first row lock，付款生命週期另有跨執行個體 operation lease。所有切片仍各自由獨立的 `*_RUNTIME` 環境變數控制，預設仍是 SQLite 且不雙寫；capture／settlement／refund 在 `LINE_PAY_ENV=production` 時另需明確 opt-in（詳見 `docs/AI-current-progress.md`）。

要求：

- Mobile API response shape 不要一次大改。
- 不要直接在很多 route 裡混用 SQL。

### Phase 6：付款與結算 transaction

需要補強：

- 建立 activity transaction（已完成第一版）。
- 送出 order transaction。
- 建立 payment authorization。
- LINE Pay authorization confirm。
- 更新 authorized cups。
- Deadline settlement。

### Phase 7：移除 SQLite runtime dependency

當 PostgreSQL vertical slice 穩定後：

- Backend runtime 不再依賴 SQLite。
- SQLite schema 僅保留歷史或測試用途。
- PostgreSQL migration 成為開發與正式部署依據。

## 環境變數需求

本機 `.env` 應保留在本機，不可 commit。

```text
DATABASE_URL=postgres://user:password@localhost:5432/drink_group_buy
STORE_MENU_READ_RUNTIME=sqlite
GROUP_BUY_ACTIVITY_READ_RUNTIME=sqlite
GROUP_BUY_ACTIVITY_WRITE_RUNTIME=sqlite
MERCHANT_MENU_RUNTIME=sqlite
CUSTOMER_ORDER_WRITE_RUNTIME=sqlite
CUSTOMER_ORDER_READ_RUNTIME=sqlite
PAYMENT_AUTHORIZATION_REQUEST_RUNTIME=sqlite
PAYMENT_AUTHORIZATION_CONFIRM_RUNTIME=sqlite
PAYMENT_AUTHORIZATION_CANCEL_RUNTIME=sqlite
CUSTOMER_ORDER_CANCEL_RUNTIME=sqlite
AUTH_PROFILE_READ_RUNTIME=sqlite
AUTH_SESSION_SECRET=...
LINE_PAY_CHANNEL_ID=...
LINE_PAY_CHANNEL_SECRET=...
LINE_PAY_API_BASE_URL=...
LINE_PAY_CONFIRM_URL=...
LINE_PAY_CANCEL_URL=...
```

`.env.example` 只能放範例，不放真實密鑰。

## 重要 transaction 設計

PostgreSQL 遷移後，以下流程需要 transaction：

1. 建立團購：insert activity、insert promotion tiers、insert notices、insert status history。
2. 送出訂單：lock/validate activity、檢查 deadline／capacity／權威價格、insert order/items/customizations/history/audit；payment authorization 由後續 request transaction 建立。
3. 付款 confirm：lock order、update payment authorization、update order payment status、write status history/audit log。
4. 截止結算：lock activity、lock eligible authorized orders、count authorized cups、select promotion tier、create settlement、capture/void payments、write status history。
5. 取消團購：lock activity、cancel eligible orders、void eligible authorizations、write status history/audit log。

## 風險

| 風險                             | 原因                                    | 緩解方式                                        |
| -------------------------------- | --------------------------------------- | ----------------------------------------------- |
| SQLite 與 PostgreSQL schema 差異 | 時間、boolean、jsonb、locking 行為不同  | 以 migration draft 與欄位規格追蹤差異           |
| 一次改太多                       | Mobile/API/DB 同時變動容易造成回歸      | 一次只遷移一個 vertical slice                   |
| secrets 洩漏                     | PostgreSQL URL 與 LINE Pay secrets 敏感 | `.env` ignore，`.env.example` 只放範例          |
| 付款狀態不一致                   | authorization/capture/void 需嚴格同步   | 付款狀態寫入 DB 並建立 status history/audit log |
| 團購超賣                         | 多人同時下單可能超過最高門檻            | 使用 PostgreSQL transaction 與 row lock         |

## 驗收清單

切換 backend runtime 到 PostgreSQL 前，至少需要確認：

- 顧客 Google Login + backend role mapping 正常。
- 店家 Google Login + store permission mapping 正常。
- 管理員 Google Login + role mapping 正常。
- 店家只能管理自己的門市。
- 顧客只能看到自己的訂單。
- 顧客不能在截止前 30 分鐘內修改或退出。
- 店家不能在截止前 30 分鐘內取消團購。
- 團購截止時間不可超過建立或發布後 24 小時。
- LINE Pay sandbox request 正常。
- LINE Pay confirm 正常更新 payment authorization 與 order 狀態。
- 顧客完成預授權後，杯數會立即納入團購統計。
- 截止結算能顯示正確杯數，例如 `25 / 30`。

## 下一步

取消 HTTP proof 已通過；capture 與 settlement persistence／service building blocks 已完成真實 PostgreSQL mock-capture、五欄折扣快照、持久化 job retry／complete、`FOR UPDATE SKIP LOCKED`、跨執行個體 lock 與清理歸零 proof。下一步等待分離式請款 Sandbox 核准後做人工 E2E，再接入 server；仍禁止 SQLite／PostgreSQL 雙寫。

## 2026-07-30～2026-07-31 驗證進度

- `001_initial_postgres.sql` 已補上 `payment_reliability_jobs` 與 `operation_locks`，與目前 SQLite 可靠性核心 schema 對齊。
- Root 已安裝 `pg`，`backend/database/` 提供 SQLite／PostgreSQL adapter、query、execute、transaction、health check 與 close 邊界。
- `npm run database-adapter:smoke` 已驗證 SQLite commit／rollback 與模擬 PostgreSQL transaction 契約。
- `npm run store-menu-read:smoke` 與 `npm run group-buy-activity-read:smoke` 已驗證兩個切片的 SQLite 委派、PostgreSQL SQL 與 API JSON 契約。
- 本機 PostgreSQL 16 已重新套用 `001_initial_postgres.sql` 與 `002_seed_dev_postgres.sql`，並限制只監聽 `localhost`；真實 `npm run postgres-runtime:smoke` 已通過。
- 顧客公開菜單 route 已用 PostgreSQL 專用臨時品項完成 HTTP source proof；臨時資料已清除。
- 團購活動列表 route 已用 PostgreSQL 專用臨時活動完成 HTTP source proof；活動與級距均已清除。
- 登入／角色／門市權限 repository 已完成；Firebase UID、dev session、legacy dev login 與 bearer token 後續解析共用 `AUTH_PROFILE_READ_RUNTIME`。
- PostgreSQL-only 臨時顧客已完成 dev session 與 bearer token HTTP source proof，測試後資料已刪除。
- PostgreSQL v1 以 `merchant_users.store_id` 授權，不分店家內部權限等級；相容欄位 `permissionLevel` 回傳 `null`。
- 第一個 PostgreSQL 寫入切片已完成：商家建立團購以 `GROUP_BUY_ACTIVITY_WRITE_RUNTIME` 獨立切換，預設仍是 SQLite 且不雙寫。
- PostgreSQL 建團與商家菜單寫入統一先鎖 store row，再驗證 merchant 授權及鎖定所需菜單 rows；建團會寫入 activity、tiers、notice、初始 status history 與 audit log。
- 跨連線 HTTP proof 已確認鎖定期間請求等待、釋放後成功、重複 idempotency key 只建立一次，測試資料最後清除為 0。
- 商家完整菜單查詢／建立／修改／停售已完成 PostgreSQL repository 與跨連線 HTTP proof；公開菜單會排除停售項目，商家完整菜單仍可讀取，測試資料與 audit log 均已清除。
- PostgreSQL 顧客首次建單已完成：跨連線 proof 確認 activity lock 等待、截止／容量／重複／改價防護、快照、history／audit 與清理為 0。
- PostgreSQL 訂單列表／明細與 authorization request／confirm／cancel、一般 authorization void、顧客取消已完成受控 server 切片。capture／settlement repositories 已完成真實 PostgreSQL proof，但尚未接入 server；改單／revision、refund 與 pickup 仍待搬移，背景 scheduler 維持停用避免跨 runtime 與未核准自動請款。

## 2026-07-31 結算快照 migration 驗證

- `003_activity_settlement_discount_snapshot_postgres.sql` 已完成回填、NOT NULL、非負數、出資方與金額一致性 constraints。
- `npm run postgres-settlement-snapshot:smoke` 已在本機 PostgreSQL 16 transaction 中驗證 3 杯折 100 元會保存每杯 33 元、分配 99 元、尾差 1 元。
- 不一致快照會被 PostgreSQL `CHECK` constraint 拒絕。
- `npm run postgres-settlement-snapshot:apply` 已將 `003` 永久套用本機開發資料庫並驗證 schema／backfill；Backend runtime 仍預設 SQLite，沒有雙寫。

## 2026-08-12 統一 migration runner

- 新增 `database/migrate.js`，取代個別 migration 各自的 ad hoc apply 腳本，統一以 `npm run postgres:migrate` 套用。Runner 會讀取 `database/migrations/` 內所有 `.sql` 檔，依檔名數字前綴順序執行，並用自動建立的 `schema_migrations` 資料表（`version text PRIMARY KEY`、`name text`、`applied_at timestamptz`）追蹤已套用版本，只套用尚未記錄的檔案，每個檔案各自包在一個 transaction 內。
- 已刪除 `database/apply-postgres-settlement-snapshot.js`（原 `npm run postgres-settlement-snapshot:apply`）與 `database/apply-postgres-order-revision-refund-pickup-tables.js`（原 `npm run postgres-order-revision-refund-pickup-tables:apply`），對應 npm script 一併從 `package.json` 移除；`001`／`002` 先前完全沒有專屬 apply 腳本，僅靠 README 範例的手動 `psql` 指令套用，新 runner 已統一涵蓋全部四個 migration 檔案。
- 新鮮 schema 驗證：在一個空的 throwaway PostgreSQL schema（`CREATE SCHEMA` 建立、驗證後 `DROP`）上執行 runner，依序成功套用 `001`～`004`，建立 35 個資料表，`schema_migrations` 正確記錄全部 4 個版本；重跑一次會正確判斷無待套用項目、不重複執行。
- 本機開發資料庫（先前已用舊 ad hoc 方式套用過全部 4 個 migration）已一次性直接 bootstrap `schema_migrations`（非 checked-in 腳本，屬一次性動作），bootstrap 前已先確認各 migration 預期的資料表／欄位確實存在；bootstrap 後執行 `npm run postgres:migrate` 正確回報「已是最新狀態」，未嘗試重新套用任何檔案。
- 新 migration 檔案慣例：檔名須以數字前綴開頭（例如 `005_description.sql`）；不應包含自己的 `BEGIN`／`COMMIT`。`database/migrate.js` 檔案開頭以註解記錄一個已知例外：`001`／`002` 這兩個歷史檔案本身就包含 `BEGIN`／`COMMIT`，Postgres 會把巢狀 `BEGIN` 視為無害警告、可正常執行，但檔案自己的 `COMMIT` 會提前結束 transaction，導致這兩個檔案的內容套用與 runner 寫入 `schema_migrations` 的 bookkeeping 不在同一個 transaction 內（不是原子的）；這是已知並接受的落差，不會為此回頭修改已套用過的歷史 migration 檔案。
- 此工作範圍不含正式環境部署程序（migrate 前備份、staging 驗證晉升、rollback 工具）；目前尚無正式 PostgreSQL 部署，這部分仍待規劃。
