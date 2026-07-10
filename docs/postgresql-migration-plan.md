# PostgreSQL 遷移規劃

最後更新：2026-07-05

本文件說明目前從 SQLite 開發資料庫遷移到 PostgreSQL 的規劃。這是規劃文件，不代表後端已經切換到 PostgreSQL。

## 目前狀態

- 目前開發資料庫：SQLite。
- SQLite schema 來源：`database/schema.sql`。
- SQLite seed 來源：`database/seed-dev.sql`。
- 後端目前使用 Node.js built-in SQLite driver。
- 未來正式資料庫目標：PostgreSQL。
- PostgreSQL schema draft：`database/migrations/001_initial_postgres.sql`。
- PostgreSQL seed draft：`database/migrations/002_seed_dev_postgres.sql`。
- 本機 PostgreSQL 驗證設定：`database/docker-compose.postgres.yml`。

## 為什麼選 PostgreSQL

DrinkGroupBuy 未來正式版會有下列需求，PostgreSQL 比 SQLite 更適合：

- 顧客訂單。
- LINE Pay authorization、capture、void、refund、webhook 狀態。
- 團購截止時間結算。
- 優惠級距計算。
- 多人同時加入團購的併發處理。
- 商家與管理員權限。
- 狀態歷史與 audit log。

## 遷移原則

1. 保留目前主要資料表邊界。
2. 資料庫表名與欄位使用 `snake_case`。
3. API JSON 欄位使用 `camelCase`。
4. 訂單與付款需要保留交易歷史與 snapshot。
5. Mobile app 不可以直接修改付款或結算狀態。
6. 下單、付款確認、團購結算要由後端交易控制。
7. PostgreSQL 要用小切片逐步導入，不一次重寫全部。
8. PostgreSQL 第一版主鍵使用 `text`，不在第一版改成 UUID。

## 主鍵決策

決策：PostgreSQL 第一版保留 `text` ID。

原因：

- 目前 SQLite schema 已經使用 text ID。
- Mobile 與 API 目前都把 ID 當字串傳遞。
- 保留 text ID 可以降低遷移風險。
- 測試資料比較好讀，適合專題展示。
- 未來正式商業版如有需要，再評估 UUID。

範例：

```sql
id text primary key
```

## 時間欄位決策

決策：PostgreSQL 時間欄位使用 `timestamptz`。

原因：

- 團購截止時間必須可靠。
- LINE Pay 授權、請款、取消授權時間需要可稽核。
- 取貨時間區間不能含糊。
- `timestamptz` 表示明確的時間點，可避免時區混亂。

規則：

- 後端與資料庫儲存使用 `timestamptz`。
- API 回傳可以使用 ISO 8601 字串。
- UI 可以顯示台灣時間，但資料庫不應存 UI 格式字串。

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

## 布林欄位決策

決策：PostgreSQL 真 / 假欄位使用 `boolean`。

原因：

- SQLite 目前用 `0 / 1` 表示真假。
- PostgreSQL 有真正的 `boolean` 型別。
- `true / false` 比 `1 / 0` 清楚。
- API JSON 也應回傳 `true / false`。

目前應轉成 `boolean` 的欄位：

| SQLite 欄位                                            | PostgreSQL 型別 | 意義                             |
| ------------------------------------------------------ | --------------- | -------------------------------- |
| `menu_items.is_available`                              | `boolean`       | 飲料是否可販售                   |
| `customization_options.is_available`                   | `boolean`       | 客製化選項是否可選               |
| `pickup_credentials.visible_after_merchant_acceptance` | `boolean`       | 取貨憑證是否需等商家確認後才顯示 |

範例：

```sql
is_available boolean not null default true
visible_after_merchant_acceptance boolean not null default true
```

## JSON 欄位決策

決策：原始金流事件與 audit metadata 使用 `jsonb`。

| SQLite 欄位                            | PostgreSQL 型別 | 用途                                           |
| -------------------------------------- | --------------- | ---------------------------------------------- |
| `payment_provider_events.payload_json` | `jsonb`         | 保存 LINE Pay 或其他金流 provider 原始事件內容 |
| `audit_logs.metadata_json`             | `jsonb`         | 保存不同操作的額外 audit metadata              |

原因：

- 金流 provider payload 可能有巢狀欄位與 provider-specific 欄位。
- audit metadata 會依操作類型不同而有不同內容。
- `jsonb` 比純文字更適合查詢與保存 JSON 結構。
- 這些欄位只用於 trace、debug、audit，不作為核心業務狀態來源。

重要規則：

- 不要把核心業務資料塞進 `jsonb`。
- 訂單品項、客製化選項、優惠級距、付款狀態、取貨狀態都必須用正式欄位或 child tables。

範例：

```sql
payload_json jsonb
metadata_json jsonb
```

## 狀態欄位決策

決策：PostgreSQL 第一版 status 欄位使用 `text check (...)`，先不使用 PostgreSQL `enum`。

原因：

- 產品流程仍在調整。
- 狀態值未來可能新增、改名或刪除。
- `text check (...)` 可以限制合法值，也比 enum 更容易修改。
- 等 activity、order、payment、pickup 流程穩定後，再考慮是否改 enum。

範例：

```sql
status text not null check (status in ('recruiting', 'confirmed', 'failed', 'cancelled'))
payment_status text not null check (payment_status in ('pending', 'authorized', 'captured', 'authorization_voided', 'failed', 'refunded'))
```

目前 status 類欄位：

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

| SQLite 型別 / 寫法                    | PostgreSQL 型別    | 備註                                               |
| ------------------------------------- | ------------------ | -------------------------------------------------- |
| `TEXT PRIMARY KEY`                    | `text PRIMARY KEY` | 第一版保留 text ID                                 |
| `TEXT` datetime                       | `timestamptz`      | 適用 created_at、updated_at、deadline_at、付款時間 |
| `INTEGER` 金額                        | `integer`          | 台幣整數                                           |
| `INTEGER` boolean with `CHECK (0, 1)` | `boolean`          | 例如 `is_available`                                |
| `REAL` latitude / longitude           | `double precision` | 地圖座標                                           |
| JSON text                             | `jsonb`            | provider events 與 audit logs                      |
| `CHECK (...)` status strings          | `text CHECK (...)` | 第一版不使用 enum                                  |
| `UNIQUE (...)`                        | 相同               | PostgreSQL 支援                                    |
| `REFERENCES ... ON DELETE CASCADE`    | 相同               | PostgreSQL 支援                                    |

## PostgreSQL 第一版資料表

第一版先保留目前 SQLite 的主要資料表：

| 類別       | 資料表                                                                  |
| ---------- | ----------------------------------------------------------------------- |
| 身分與角色 | `users`, `user_roles`, `user_private_profiles`, `user_public_profiles`  |
| 商家與店家 | `merchants`, `merchant_users`, `stores`                                 |
| 菜單       | `menu_items`, `customization_options`                                   |
| 團購活動   | `group_buy_activities`, `promotion_tiers`, `activity_notices`           |
| 購物車     | `cart_drafts`, `cart_draft_items`, `cart_draft_item_customizations`     |
| 訂單       | `orders`, `order_items`, `order_item_customizations`                    |
| 付款       | `payment_authorizations`, `payment_captures`, `payment_provider_events` |
| 結算與取貨 | `activity_settlements`, `pickup_credentials`                            |
| 歷史與稽核 | `status_history`, `audit_logs`                                          |

## PostgreSQL 前建議補強的 schema

這些不是第一版必做，但正式上線前建議處理：

| 項目             | 建議                                           | 原因                                   |
| ---------------- | ---------------------------------------------- | -------------------------------------- |
| 訂單修改         | 新增 `order_revisions` 與 revision item tables | 授權後修改訂單需要 before / after 歷史 |
| 付款 idempotency | 增加 order / payment API idempotency key       | 避免重複授權或重複請款                 |
| Session          | 新增 `sessions` 或 `refresh_tokens`            | 目前 auth token 偏開發用               |
| 截止結算         | 增加 settlement job attempt 欄位               | 方便 retry 與錯誤追蹤                  |
| 通知             | 新增 `notifications` 或 `notification_events`  | 未來推播 / 站內通知需要                |
| 個資             | 增加 phone/email 驗證與隱私欄位                | 真實使用者前需要                       |

## 後端遷移階段

### Phase 1：準備

- 保持 SQLite 繼續運作。
- 補齊 PostgreSQL 文件與 schema draft。
- 確認 database design v1。
- 第一版 ID 維持 `text`。
- 時間欄位使用 `timestamptz`。

### Phase 2：增加 PostgreSQL dependency

- 加入 `pg` 或選定 query builder / migration tool。
- 在 `backend/.env` 加入 `DATABASE_URL`。
- 在 `.env.example` 只加入名稱，不放真實密碼。
- 過渡期保留 SQLite code path。

### Phase 3：建立 PostgreSQL schema

- 已建立 draft：`database/migrations/001_initial_postgres.sql`。
- 已把 SQLite schema 轉成 PostgreSQL-compatible SQL。
- 保留 constraints 與 indexes。
- 使用 `jsonb` 保存 provider/audit payload。

狀態：

- draft migration file 已建立。
- 尚未接到 backend runtime。
- 尚未作為正式 migration 系統執行。

### Phase 4：建立 PostgreSQL seed data

- 已建立 draft：`database/migrations/002_seed_dev_postgres.sql`。
- 包含 4 個顧客、7 個商家帳號、1 個管理員、7 間店與菜單資料。
- 不 seed 舊團購、訂單、付款、取貨資料。

### Phase 5：切換 backend repository layer

建議先建立資料庫 adapter 或 repository layer，再逐步切換：

1. Login。
2. List activities。
3. Merchant creates activity。
4. Customer creates order。
5. LINE Pay authorization confirm。

目標：

- 保持 mobile API response shape 穩定。
- 不一次重寫全部 backend。

### Phase 6：驗證交易

要驗證：

- 建立活動與優惠級距。
- 送出訂單與訂單品項。
- 建立 payment authorization。
- 確認 LINE Pay authorization。
- 計算 authorized cups。
- 取消活動。

### Phase 7：移除 SQLite runtime dependency

只有在 PostgreSQL 通過主要流程後才能做：

- backend runtime 停止使用 SQLite。
- SQLite schema 保留為歷史參考。
- 文件更新為 PostgreSQL 已正式啟用。

## 未來環境變數

後端 `.env` 可能需要：

```text
DATABASE_URL=postgres://user:password@localhost:5432/drink_group_buy
AUTH_SESSION_SECRET=...
LINE_PAY_CHANNEL_ID=...
LINE_PAY_CHANNEL_SECRET=...
LINE_PAY_API_BASE_URL=...
LINE_PAY_CONFIRM_URL=...
LINE_PAY_CANCEL_URL=...
```

不要提交真實值。

## 重要交易邊界

PostgreSQL 遷移時，最重要的是這些交易邊界：

1. 建立活動：
   - insert activity。
   - insert promotion tiers。
   - insert notices。
   - insert status history。

2. 送出訂單：
   - lock / validate activity。
   - 檢查 status 與 deadline。
   - 檢查 maximum cups。
   - insert order。
   - insert order items / customizations。
   - create payment authorization record。

3. 付款 confirm：
   - lock order。
   - update payment authorization。
   - update order payment status。
   - write status history / audit log。

4. 截止結算：
   - lock activity。
   - lock eligible authorized orders。
   - count authorized cups。
   - select promotion tier。
   - create settlement。
   - capture 或 void payments。
   - write status history。

5. 取消活動：
   - lock activity。
   - cancel eligible orders。
   - void eligible authorizations。
   - write status history / audit log。

## 風險

| 風險                          | 原因                                    | 緩解方式                                |
| ----------------------------- | --------------------------------------- | --------------------------------------- |
| SQLite 與 PostgreSQL 行為不同 | 時間、boolean、JSON、locking 都不同     | 對關鍵交易加測試                        |
| 一次重寫太多                  | 容易破壞 mobile 流程                    | 一次只遷移一個 vertical slice           |
| secrets 外洩                  | PostgreSQL URL 與 LINE Pay secrets 敏感 | `.env` ignore，`.env.example` 只放名稱  |
| 付款狀態不一致                | authorization / capture 必須可信        | 付款狀態只能由後端更新                  |
| 團購超收                      | 多人同時送單可能超過上限                | 使用 PostgreSQL transaction 與 row lock |

## 測試清單

切換 backend runtime 到 PostgreSQL 前，至少要確認：

- 顧客手機 + 密碼登入可用。
- 商家 email + 密碼登入可用。
- 管理員 email + 密碼登入可用。
- 商家可建立活動與優惠級距。
- 顧客可看到招募中的活動。
- 顧客可把購物車送成訂單。
- LINE Pay sandbox request 可建立。
- LINE Pay confirm 可更新 payment authorization 與 order 狀態。
- 管理員可取消活動。
- 已取消活動會讓相關顧客訂單進歷史訂單。
- 授權杯數顯示下一級距正確，例如 `25 / 30`。

## 目前決策

使用 PostgreSQL 作為未來正式資料庫目標。

在正式 PostgreSQL implementation slice 開始前，SQLite 繼續作為目前本機開發資料庫。
