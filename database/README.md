# DrinkGroupBuy 資料庫

這個資料夾放 DrinkGroupBuy 的本機開發資料庫設計與初始化腳本。

目前 backend runtime 預設與多數流程使用 SQLite，主要目的是讓開發階段可以先把資料流程跑起來。

PostgreSQL 是未來正式資料庫方向。`database/migrations/` 保存 schema/seed draft，`backend/database/` 已有隔離 adapter；三個唯讀切片、商家建團、商家菜單與顧客首次建單已可受控切換，`backend/db.js` 尚未整體切換。

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
| `migrations/001_initial_postgres.sql` | PostgreSQL v1 schema draft，含付款可靠性工作與 operation lease |
| `migrations/002_seed_dev_postgres.sql` | PostgreSQL dev seed；供 auth、菜單與團購活動讀寫 runtime 驗證使用 |
| `migrate.js` | 統一 PostgreSQL migration runner；依檔名數字前綴順序套用 `migrations/` 內尚未套用的檔案，並記錄於 `schema_migrations` |
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

目前 PostgreSQL 已用於 schema／seed、adapter、唯讀切片、商家建團、菜單管理、顧客首次建單與付款 request／confirm／cancel／一般 void／顧客取消。capture／settlement repositories 已完成真實 PostgreSQL proof，但尚未接入 server route／scheduler。

先用 Docker 啟動本機 PostgreSQL container：

```powershell
docker compose -f database/docker-compose.postgres.yml up -d
```

套用 migration 統一使用 `database/migrate.js`：它會讀取 `database/migrations/` 內所有 `.sql` 檔，依檔名數字前綴順序執行，並用會自動建立的 `schema_migrations` 資料表追蹤哪些版本已套用，只套用尚未套用的檔案，每個檔案各自包在一個 transaction 內：

```powershell
$env:DATABASE_URL='postgres://...'
npm run postgres:migrate
```

如果要重建 PostgreSQL dev database，先移除 volume 再重新啟動，接著重新執行 `npm run postgres:migrate` 套用全部 migration：

```powershell
docker compose -f database/docker-compose.postgres.yml down -v
docker compose -f database/docker-compose.postgres.yml up -d
```

本機 PostgreSQL draft 連線字串：

```text
postgres://drink_group_buy:drink_group_buy_dev_password@localhost:5432/drink_group_buy
```

注意：這是本機開發用預設值，不可用於正式環境。

跨執行個體併發鎖定驗收（不只是驗證 SQL 語法本身，是用真正獨立的 OS 程序去搶同一筆 job／同一把 lock，對一個真的在跑的 PostgreSQL 執行）：

```powershell
$env:DATABASE_URL='postgres://...'
npm run postgres-reliability:multiprocess
```

這個測試會自己建立、清除測試用的 `payment_reliability_jobs`／`operation_locks` 列，執行前後資料庫其餘內容不受影響。

目前驗證狀態：

- 2026-07-02：`001_initial_postgres.sql` 已成功在 Docker PostgreSQL dev container 執行。
- 2026-07-02：`002_seed_dev_postgres.sql` 已成功在同一個 fresh dev database 執行。
- 2026-07-02：PostgreSQL draft 已調整為 `users` + `user_private_profiles` + `user_public_profiles`，並已重新用 fresh dev database 驗證。
- 2026-07-02：PostgreSQL draft 已調整為每個商家帳號只綁定一間 `stores`，並已重新用 fresh dev database 驗證。
- 2026-07-03：PostgreSQL seed draft 已補上 96 customization_options，並已重新用 fresh dev database 驗證。
- 驗證後 baseline 資料為 12 users、12 user_private_profiles、12 user_public_profiles、12 user_roles、7 merchants、7 merchant_users、7 stores、8 menu_items、96 customization_options。
- 2026-07-30：PostgreSQL schema 已補上 `payment_reliability_jobs` 與 `operation_locks`。
- 2026-07-30：本機 PostgreSQL 16 已重新套用 `001`／`002`，`npm run database-adapter:smoke` 與真實 `npm run postgres-runtime:smoke` 均通過；服務只監聽 `localhost`。
- 2026-07-30：公開菜單 HTTP route 已用 PostgreSQL 專用臨時品項證明資料來源，驗證後臨時品項已清除。
- 2026-07-30：團購活動列表 HTTP route 已用 PostgreSQL 專用臨時活動證明資料來源，驗證後活動與級距均已清除。
- 2026-07-31：商家菜單建立／修改／停售已通過 PostgreSQL transaction、store row lock 與 HTTP proof；臨時品項、選項與 audit log 均已清除。
- 2026-07-31：顧客首次建單已通過 PostgreSQL activity row lock、容量／價格／重複防護與 HTTP proof；臨時訂單、活動、history 與 audit 均已清除。
- 2026-07-31：`003` 已由專用 transaction runner 永久套用並通過 schema／backfill 驗證。
- 2026-07-31：結算 proof 已驗證折扣快照、持久化 job retry／complete、`FOR UPDATE SKIP LOCKED`、跨執行個體 lock、mock capture 與清理歸零。
- 驗證後 runtime 資料仍為 0 group_buy_activities、0 promotion_tiers、0 orders、0 payment_authorizations、0 payment_captures、0 pickup_credentials。
- 2026-08-12：新增統一 PostgreSQL migration runner `database/migrate.js`（`npm run postgres:migrate`），取代已刪除的 `database/apply-postgres-settlement-snapshot.js`（原 `npm run postgres-settlement-snapshot:apply`）與 `database/apply-postgres-order-revision-refund-pickup-tables.js`（原 `npm run postgres-order-revision-refund-pickup-tables:apply`）；`001`／`002` 先前沒有專屬 apply 腳本，只能用手動 `psql` 指令套用，新 runner 已統一涵蓋全部四個 migration 檔案。已在全新 throwaway PostgreSQL schema 驗證：依序成功套用 4 個 migration、建立 35 個資料表，`schema_migrations` 正確記錄全部 4 個版本；重跑會正確偵測無待套用項目。本機開發資料庫已一次性直接 bootstrap `schema_migrations`（非 checked-in 腳本，先確認各 migration 預期資料表／欄位已存在），之後執行 `npm run postgres:migrate` 正確回報已是最新狀態、未重複套用。
- 2026-08-20：本機改用原生安裝的 PostgreSQL 16 Windows 服務（環境沒有 Docker 可用），連線設定與帳號密碼跟 `docker-compose.postgres.yml` 的預設值相同，`001`～`004` migration 均已套用（`schema_migrations` 記錄 4 筆），共 35 張表；baseline 資料維持 12 users、7 merchants、7 stores，其餘業務資料表皆為 0 筆。（注意：這筆記錄原本誤寫成「`001`～`005` 均已套用」，誤把 `postgres-migration-runner:smoke` 自己獨立 throwaway schema 的驗證，當成主資料庫也套用過；實際上 `005_order_rule_consents_postgres.sql` 當時還沒套到這個資料庫，已於同日稍晚發現並修正，見下一筆記錄。）重新對這個真實 PostgreSQL 執行既有唯讀／寫入 proof（`postgres-runtime`、`payment-capture-postgres`、`payment-refund-postgres`、`pickup-credential-postgres`、`order-revision-postgres`、`group-buy-settlement-postgres`、`group-buy-activity-postgres-http`、`auth-profile-postgres-http`）全數通過，執行前後資料庫內容一致，確認先前這幾份 proof 的結論在這台實際服務上依然成立。新增 `npm run postgres-reliability:multiprocess`（`scripts/postgres-reliability-multiprocess-smoke.js` + `scripts/helpers/postgres-reliability-process-worker.js`），是 `payment-reliability:multiprocess`（SQLite 版）的 PostgreSQL 對應版本：用兩個真正獨立的 OS 程序（不是同一個程序裡開兩條連線）搶同一筆 `reconcile_line_pay_request` job、搶同一把 `order:{id}:payment-lifecycle` lock，驗證「只有一個程序搶得到」「租約還沒到期會被擋」「租約過期或明確 release 後可以被接手」「非持有者不能 release」——全部針對這個真的在跑的 PostgreSQL 執行，不是只驗證 SQL 語法或用假的 database mock；跑了兩次確認結果穩定，測試自己清乾淨、執行前後 `payment_reliability_jobs`／`operation_locks` 資料表歸零。`group-buy-settlement-postgres:smoke` 先前已經用「同程序兩條連線」的方式驗證過 `settlement:activity:*` 這把鎖，這次是用真正分開的 OS 程序，把驗證方式補齊到跟 SQLite 版本一致的嚴謹度，同時涵蓋另一組更廣泛共用的 `order:*:payment-lifecycle` lock key（LINE Pay 請款/取消/人工重新請款與 ECPay 共用的鎖）。

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
- `payment_reliability_jobs`：provider 對帳與結算的持久化工作。
- `operation_locks`：跨程序敏感操作的租約。
- `pickup_credentials`：取貨代碼。
- `status_history`：狀態變更歷史。
- `audit_logs`：重要操作紀錄。

## 目前與後端的關係

後端預設與多數流程仍讀寫 SQLite；auth、公開菜單、活動讀寫、商家菜單與顧客首次建單已有 PostgreSQL repositories。三個寫入切片需一起切換且不雙寫；訂單後續、付款與 `backend/db.js` 其餘流程尚未整體搬移。

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
- **`drink-group-buy-dev.sqlite` 目前資料已過期，跟現在的 `seed-dev.sql` 對不上**（2026-08-20 用 `scripts/order-api-smoke.js` 測試時發現 `store-001` 查不到）。日常開發已永久切到 PostgreSQL，這個檔案主要只影響還在用 SQLite 的獨立 smoke test 腳本；要修好需要重新用 `db:init` + `db:seed` 重建這個檔案（會整個重建、不是增量修正），屬於會改變本機檔案狀態的操作，先記錄、待確認後再處理。
- `database/test/` 是展示/測試資料，不是正式資料庫規格。
- LINE Pay 真正上線前，付款狀態、webhook、capture、void、refund 都需要更完整的記錄與測試。

## 2026-08-20 本機 backend 完整切換到 PostgreSQL 運作的驗證記錄

把 `backend/.env` 內全部 21 個 `*_RUNTIME` 環境變數一次設為 `postgres`（透過既有 `backend/auth.js` 的 `loadLocalEnv` 自動載入，不需額外指令或旗標），讓本機開發 backend 第一次真的整個以 PostgreSQL 運作，不再是各切片各自獨立測試：

- 補套用先前一直沒被套用到這個主資料庫的 `005_order_rule_consents_postgres.sql`（見上一筆記錄的更正說明）。
- 過程中發現 `authorization` 是 PostgreSQL 保留字，不能當裸 SQL 別名使用（`SELECT authorization.id FROM payment_authorizations authorization` 會直接噴 `syntax error at or near "."`，已對這個真實 PostgreSQL 16 服務直接驗證確認）；`paymentReliabilityJobRepository.js`、`manualLinePayRepaymentRepository.js`、`merchantGroupBuyActivityCancelRepository.js` 三支既有檔案裡的查詢有這個問題，先前只被假資料庫模擬測試驗證過（只比對 SQL 文字，不會真的解析執行），從未被真的 PostgreSQL 解析過，這次才現形，已全部修正並重新驗證。
- 完整重跑一輪真實寫入流程：透過真實 HTTP API 建立團購活動、送出訂單、發起 LINE Pay 請款、呼叫管理員取消團購 API，直接查資料庫確認訂單狀態、付款預授權狀態、audit log 皆正確；既有 `group-buy-activity-postgres-write-http`、`merchant-menu-postgres-http`、`customer-order-postgres-http`、`payment-capture-postgres`、`payment-refund-postgres`、`pickup-credential-postgres`、`order-revision-postgres`、`group-buy-settlement-postgres` 全數重新對這個真實服務驗證通過。
- 詳細的程式碼修正內容（含另外修正的 3 個既有已知缺口）記錄於 `docs/AI-security-review-log.md`（2026-08-20 條目）與 `PROGRESS.md`。
- 驗證前後資料庫內容一致（7 merchants、7 stores、8 menu_items、96 customization_options、12 users 維持不變，其餘業務資料表歸零），測試資料均已清除。
- **後續更新**：一開始驗證完是切回 SQLite（因為發現 `backend/.env` 是全域生效，任何獨立腳本沒有明確隔離 runtime 就會被悄悄導去查 PostgreSQL）。已找出並修正唯一受影響的腳本（`scripts/merchant-activity-cancel-service-smoke.js`，其餘 10 支同類型腳本本來就已經用 `env: {}` 隔離），修好後重新把 `backend/.env` 永久切成 PostgreSQL——**現在本機開發 backend 預設就是跑在 PostgreSQL 上，不是暫時測試**。所有原本受影響的 11 支 repository smoke test 與主要 HTTP proof 皆已在永久切換後的狀態下重新驗證通過。

## 2026-08-20 新增 `stores.pickup_closing_time`，並補一支同類型受影響的 smoke test

延續上一筆記錄的「`backend/.env` 全域生效」現象，這次又在 `scripts/order-api-smoke.js` 發現同一類問題：它用子行程（`spawn`）啟動自己的 backend 並只明確指定 2 個 `*_RUNTIME` 為 `sqlite`，其餘變數（含 `DATABASE_URL`）沿用 `...process.env`，於是被 `backend/.env` 悄悄補上其餘變數為 `postgres`，兩邊混用觸發啟動期的一致性檢查而直接噴錯。已比照 `merchant-activity-cancel-service-smoke.js` 的做法，在這支腳本的子行程 env 明確列出全部 21 個 `*_RUNTIME` 為 `sqlite`、`DATABASE_URL` 明確清空。修好後這支腳本本身還有另一個無關的既有問題——`database/drink-group-buy-dev.sqlite` 這份本機檔案的資料已經跟目前 `seed-dev.sql` 對不上（`store-001` 查不到），屬於本機檔案過期，不是這次改動造成，未在這次範圍內處理。

新增欄位本身：`stores` 增加 `pickup_closing_time`（`HH:MM` 24 小時制文字，可為 NULL）——`database/migrations/006_store_pickup_closing_time_postgres.sql` 已套用到本機 PostgreSQL；`database/schema.sql` 已同步更新供未來全新建立的 SQLite 資料庫使用。目前所有既有種子店家維持 NULL（等同 24 小時營業、不設取餐時段上限），避免影響既有測試對「取餐時間沒有上限」的假設；已用真實 API 呼叫暫時把 `store-001` 設成 `22:00` 驗證「允許」「拒絕」「剛好卡在邊界」三種情境皆正確後，改回 NULL。詳見 `backend/pickup/pickupWindow.js`（含對應 `backend/pickup/pickupWindow.test.js`）。
