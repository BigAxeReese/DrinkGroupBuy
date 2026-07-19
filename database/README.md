# DrinkGroupBuy 資料庫

這個資料夾放 DrinkGroupBuy 的本機開發資料庫設計與初始化腳本。

目前 backend runtime 使用 SQLite，主要目的是讓開發階段可以先把資料流程跑起來。

PostgreSQL 是未來正式資料庫方向。`database/migrations/` 內已開始保存 PostgreSQL schema/seed draft，但尚未接到 backend runtime。

## 目前用途

- 建立本機開發用 SQLite 資料庫。
- 保存團購活動、訂單、付款授權、狀態歷史等資料。
- 作為後端 API 的資料來源。
- 協助整理正式資料庫 schema 的方向。

## 重要檔案

| 檔案 | 用途 |
| --- | --- |
| `schema.sql` | 目前開發用資料表結構 |
| `seed-dev.sql` | 開發用初始資料 |
| `init-dev-db.js` | 依照 `schema.sql` 重建 SQLite 資料庫 |
| `seed-dev-db.js` | 匯入 `seed-dev.sql` |
| `drink-group-buy-dev.sqlite` | 產生出的本機資料庫檔案，不應上傳 Git |
| `migrations/001_initial_postgres.sql` | PostgreSQL v1 schema draft，尚未接到 backend |
| `migrations/002_seed_dev_postgres.sql` | PostgreSQL dev seed draft，尚未接到 backend |
| `docker-compose.postgres.yml` | 本機 PostgreSQL dev container 設定 |
| `test/` | 測試/展示用資料，不是正式 schema 來源 |

## 建立或重建資料庫

從專案根目錄執行：

```powershell
npm run db:init
npm run db:seed
```

會產生：

```text
database/drink-group-buy-dev.sqlite
```

注意：`db:init` 會重建資料庫，原本本機資料會被清掉。

## PostgreSQL draft 驗證方式

目前 PostgreSQL 只用於 schema/seed draft 驗證，不是 backend runtime。

本機沒有安裝 `psql` 也可以用 Docker container 內的 `psql` 驗證：

```powershell
docker compose -f database/docker-compose.postgres.yml up -d
docker compose -f database/docker-compose.postgres.yml exec postgres psql -U drink_group_buy -d drink_group_buy -f /migrations/001_initial_postgres.sql
docker compose -f database/docker-compose.postgres.yml exec postgres psql -U drink_group_buy -d drink_group_buy -f /migrations/002_seed_dev_postgres.sql
```

如果要重建 PostgreSQL dev database，先移除 volume 再重新啟動：

```powershell
docker compose -f database/docker-compose.postgres.yml down -v
docker compose -f database/docker-compose.postgres.yml up -d
```

本機 PostgreSQL draft 連線字串：

```text
postgres://drink_group_buy:drink_group_buy_dev_password@localhost:5432/drink_group_buy
```

注意：這是本機開發用預設值，不可用於正式環境。

目前驗證狀態：

- 2026-07-02：`001_initial_postgres.sql` 已成功在 Docker PostgreSQL dev container 執行。
- 2026-07-02：`002_seed_dev_postgres.sql` 已成功在同一個 fresh dev database 執行。
- 2026-07-02：PostgreSQL draft 已調整為 `users` + `user_private_profiles` + `user_public_profiles`，並已重新用 fresh dev database 驗證。
- 2026-07-02：PostgreSQL draft 已調整為每個商家帳號只綁定一間 `stores`，並已重新用 fresh dev database 驗證。
- 2026-07-03：PostgreSQL seed draft 已補上 96 customization_options，並已重新用 fresh dev database 驗證。
- 驗證後 baseline 資料為 12 users、12 user_private_profiles、12 user_public_profiles、12 user_roles、7 merchants、7 merchant_users、7 stores、8 menu_items、96 customization_options。
- 驗證後 runtime 資料仍為 0 group_buy_activities、0 promotion_tiers、0 orders、0 payment_authorizations、0 payment_captures、0 pickup_credentials。

## 目前主要資料表

- `users`：使用者。
- `user_private_profiles`：使用者私密個資，給系統內部必要流程使用。
- `user_public_profiles`：使用者對外顯示資料，例如匿名顧客代稱。
- `user_roles`：使用者角色，例如顧客、商家、管理員。
- `merchants`：商家。
- `merchant_users`：商家帳號與分店關係；PostgreSQL draft 中每個帳號只管理一間分店。
- `stores`：店家門市與地圖座標。
- `menu_items`：飲品品項。
- `customization_options`：甜度、冰塊、加料、尺寸等選項。
- `group_buy_activities`：商家建立的團購活動。
- `promotion_tiers`：優惠杯數級距，例如 20 杯折 200。
- `orders`：顧客訂單。
- `order_items`：訂單內的飲品項目。
- `order_item_customizations`：每個飲品的客製化選項快照。
- `payment_authorizations`：LINE Pay 預授權紀錄。
- `payment_captures`：partial capture 請款結果、嘗試次數與下次重試時間。
- `payment_provider_events`：金流 provider 回傳事件。
- `activity_settlements`：團購截止後結算結果。
- `pickup_credentials`：取貨代碼。
- `status_history`：狀態變更歷史。
- `audit_logs`：重要操作紀錄。

## 目前與後端的關係

後端已經會讀寫這個 SQLite 資料庫。PostgreSQL migration draft 尚未接到後端。

目前已接上的資料流程：

1. 商家建立團購活動。
2. 顧客送出購物車並建立訂單。
3. LINE Pay 預授權 request 建立 `payment_authorizations.status = pending`。
4. LINE Pay confirm 成功後改成 `authorized`。
5. 管理員取消團購會寫入狀態歷史與 audit log。

## 設計原則

- 資料表與欄位使用 `snake_case`。
- 訂單飲品與客製化選項使用子表保存，避免把多個值塞在同一欄。
- 付款、訂單、團購這類重要狀態要保留歷史紀錄。
- 開發 seed data 與正式資料要分開。
- 不要直接刪除正式資料；取消活動應該用狀態表示。

## 注意事項

- `drink-group-buy-dev.sqlite` 是本機產物，不要上傳 GitHub。
- `database/test/` 是展示/測試資料，不是正式資料庫規格。
- LINE Pay 真正上線前，付款狀態、webhook、capture、void、refund 都需要更完整的記錄與測試。
