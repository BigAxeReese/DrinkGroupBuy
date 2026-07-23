# 交接總整理

最後更新：2026-07-21

換電腦、交接給其他人、或開新的 Codex 對話時，請先閱讀本文件。

## 專案方向

DrinkGroupBuy 目前是全端 Android-first mobile app 專案。

目前結構：

```text
project-root/
+-- mobile/
+-- backend/
+-- database/
+-- docs/
+-- AGENTS.md
```

目前策略：

- Mobile app：React Native + Expo。
- Backend：Node.js built-in HTTP server。
- 目前開發資料庫：SQLite。
- 未來正式資料庫目標：PostgreSQL。
- Firebase 不作為主要資料庫方向。
- Firebase 目前只規劃用於 Auth / Google Login。
- 開發期優先用 Firebase Google 測試帳號；若帳號不足，本機可用 dev-only 身份切換器測顧客、商家，以及必要的後端補救權限。
- LINE Pay sandbox 預授權、void、capture、refund、手動重新付款、單一團購手動結算與 deadline settlement scheduler 已有後端切片。

文件語言規則：

- 程式、API、資料庫、status value、環境變數、SQL、檔名使用英文。
- 中文用於報告、流程說明、畫面文案與補充註解。
- 不確定是否會影響程式時，先保留英文原名，再加中文註解。
- 不要把 `groupBuyActivity`、`group_buy_activities`、`paymentStatus` 這類技術名稱直接翻成中文後拿去實作。

## 最重要規則

不要提交機密資料 `secrets`。

機密資料只放在：

```text
.env
mobile/.env
backend/.env
```

包含：

- Google Maps API key。
- LINE Pay Channel ID / Channel Secret。
- Auth session secret。
- 未來 PostgreSQL `DATABASE_URL`。

## 目前 Mobile 狀態

技術：

- React Native + Expo。
- Android-first。
- 目前用 Expo Web 預覽。

已實作或已開始：

- 登入頁。
- 顧客首頁。
- Google Maps 即時地圖。
- 店家菜單與飲料客製化。
- 購物車。
- 顧客訂單與歷史訂單。
- 團購進度。
- 付款預授權畫面。
- 取貨碼 / 取貨資訊。
- 商家首頁。
- 商家建立團購活動。
- 商家查看訂單、標記可取餐、核銷取餐與歷史訂單。
- 開發 / 補救用取消活動與手動結算 route；不列入第一階段正式 App 使用者流程。

重要限制：

- 部分執行狀態 `runtime state` 仍保存在 mobile local state。
- App 啟動時尚未完整載入後端權威 activity / order / payment data。
- 部分畫面仍可能有 prototype fallback 行為。

## 目前 Backend 狀態

位置：

```text
backend/
```

重要檔案：

| 檔案                                      | 用途                                          |
| ----------------------------------------- | --------------------------------------------- |
| `backend/server.js`                       | HTTP API server                               |
| `backend/db.js`                           | SQLite 資料庫存取                             |
| `backend/auth.js`                         | 開發用登入、token、密碼工具                   |
| `backend/payments/linePayClient.js`       | LINE Pay sandbox request 簽章                 |
| `backend/payments/linePayService.js`      | LINE Pay 授權 request / confirm / cancel、手動重新付款、void / capture / refund 流程 |
| `backend/payments/linePayPendingStore.js` | LINE Pay redirect 前後的記憶體快取；confirm/cancel 以 DB 查找為主                    |
| `backend/payments/settlementService.js`   | 單一團購結算流程，依結果批次 capture / void，並處理請款重試                         |
| `backend/linePayClient.js`                | payment client 相容匯出                       |
| `backend/README.md`                       | 後端啟動說明                                  |

目前 API：

| 方法     | 路徑                                          | 用途                           |
| -------- | --------------------------------------------- | ------------------------------ |
| `POST`   | `/api/auth/login`                             | 登入                           |
| `POST`   | `/api/auth/firebase-session`                  | Firebase Google Login session   |
| `GET`    | `/health`                                     | 健康檢查                       |
| `GET`    | `/api/group-buy-activities`                   | 查詢團購活動                   |
| `POST`   | `/api/merchant/group-buy-activities`          | 商家建立團購活動               |
| `POST`   | `/api/orders`                                 | 顧客建立訂單                   |
| `PATCH`  | `/api/orders/:orderId`                        | 更新尚未預授權成功的訂單明細   |
| `POST`   | `/api/orders/:orderId/revisions`              | 建立已授權訂單的修改版本       |
| `GET`    | `/api/orders/:orderId`                        | 查詢訂單明細                   |
| `DELETE` | `/api/admin/group-buy-activities/:activityId` | 開發 / 補救用取消活動         |
| `POST`   | `/api/admin/group-buy-activities/:activityId/settle` | 開發 / 補救用手動觸發單一團購結算 |
| `POST`   | `/api/payments/line-pay/request`              | 建立 LINE Pay sandbox 授權請求 |
| `POST`   | `/api/payments/line-pay/repay`                | 請款失敗後建立 LINE Pay 重新付款 |
| `POST`   | `/api/payments/line-pay/refund`               | 開發 / 補救用已請款交易退款    |
| `GET`    | `/api/payments/line-pay/confirm`              | LINE Pay confirm redirect      |
| `GET`    | `/api/payments/line-pay/cancel`               | LINE Pay cancel redirect       |

目前 backend 限制：

- 沒有註冊。
- 沒有密碼重設。
- 沒有正式 production auth/session 設計；目前 Firebase session route 會回傳既有 bearer token。
- LINE Pay void / capture / refund 已在付款模組與 dev/backend API 切片實作；refund 尚未有正式操作 UI、失敗重試 queue 與正式 sandbox 人工端對端驗證。
- LINE Pay webhook 第一版不列為必要入口；付款同步先以 confirm/cancel redirect、資料庫狀態與後續 provider 狀態查詢為主。
- 尚未實作 pickup APIs。
- 已實作開發 / 補救用手動觸發單一團購結算，也已接上後端啟動時的 deadline settlement scheduler。
- Scheduler 預設每 30 秒掃描已截止、尚未結算的團購；若 `LINE_PAY_ENV=production`，必須設定 `SETTLEMENT_SCHEDULER_ALLOW_PRODUCTION=true` 才會啟動。
- 可用 `npm run settlement:smoke` 以乾淨 schema 與 `mock_line_pay` 驗證本機結算 capture / void / scheduler、order revision 替換授權、截止後拒絕預授權、三次請款重試、取餐前 15 分鐘以前手動重新付款與 refund idempotency，測試後會還原開發 SQLite。
- 後端仍使用 SQLite。

## 測試登入帳號

目前正式登入方向是 Firebase Auth + Google Login；角色與權限由 backend database 的 `users.firebase_uid`、`user_roles` 與 `merchant_users` 判斷。production UI 不顯示角色選擇，也不允許任意 UID 輸入。

本機若只有一個 Google 帳號，可改用 dev-only 身份切換器：

```env
AUTH_DEV_MODE=true
EXPO_PUBLIC_AUTH_MODE=dev
```

啟用後，mobile 登入頁會顯示「本機測試身份」下拉選單，選項來自 SQLite 內所有 active 的 customer、merchant 與開發補救身份。此模式不得用於 production build。

舊帳密登入端點仍暫時保留作開發相容，但不屬於正式產品流程。

Legacy dev mock login 顧客可使用手機號碼 + 密碼登入。

| 顧客 | 手機         | 密碼        |
| ---- | ------------ | ----------- |
| A    | `0911000001` | `customer1` |
| B    | `0911000002` | `customer2` |
| C    | `0911000003` | `customer3` |
| D    | `0911000004` | `customer4` |

Legacy dev mock login 商家可使用 email + 密碼登入。

| 商家    | Email                | 密碼        |
| ------- | -------------------- | ----------- |
| Store 1 | `store1@example.com` | `merchant1` |
| Store 2 | `store2@example.com` | `merchant2` |
| Store 3 | `store3@example.com` | `merchant3` |
| Store 4 | `store4@example.com` | `merchant4` |
| Store 5 | `store5@example.com` | `merchant5` |
| Store 6 | `store6@example.com` | `merchant6` |
| Store 7 | `store7@example.com` | `merchant7` |

Legacy dev mock login 開發 / 補救帳號：

| Email               | 密碼     |
| ------------------- | -------- |
| `admin@example.com` | `admin1` |

## 目前資料庫狀態

目前開發資料庫：

```text
database/drink-group-buy-dev.sqlite
```

目前 SQLite schema：

```text
database/schema.sql
```

目前 SQLite seed：

```text
database/seed-dev.sql
```

目前資料概況：

| 資料                     | 筆數 |
| ------------------------ | ---: |
| `users`                  | 12   |
| `user_roles`             | 12   |
| `merchants`              | 7    |
| `merchant_users`         | 7    |
| `stores`                 | 7    |
| `menu_items`             | 8    |
| `group_buy_activities`   | 0    |
| `promotion_tiers`        | 0    |
| `orders`                 | 0    |
| `payment_authorizations` | 0    |
| `payment_captures`       | 0    |
| `pickup_credentials`     | 0    |

意思：

- 帳號、店家、菜單 seed data 已存在。
- 團購、訂單、付款、取貨 runtime data 目前已清空，方便乾淨測試。

## PostgreSQL 方向

PostgreSQL 是未來正式資料庫目標。

Firebase Auth / Google Login 與 PostgreSQL 的關係：

- Firebase 只負責登入與取得 Google identity。
- PostgreSQL / backend database 保存使用者角色、商家綁定、訂單、付款與團購資料。
- 後端要驗證 Firebase ID token，再用 `firebase_uid` 或 email 對應 `users`。
- 不把團購、訂單、付款主資料搬到 Firestore。

重要文件：

| 檔案                                            | 用途                              |
| ----------------------------------------------- | --------------------------------- |
| `docs/database-design-v1.md`                    | 目前資料庫設計基準                |
| `docs/postgresql-migration-plan.md`             | SQLite 轉 PostgreSQL 規劃         |
| `database/migrations/001_initial_postgres.sql`  | PostgreSQL v1 schema draft        |
| `database/migrations/002_seed_dev_postgres.sql` | PostgreSQL development seed draft |
| `database/docker-compose.postgres.yml`          | 本機 PostgreSQL dev container     |

PostgreSQL v1 決策：

| 項目           | 決策                |
| -------------- | ------------------- |
| 主鍵           | `text`              |
| 時間欄位       | `timestamptz`       |
| 布林欄位       | `boolean`           |
| 原始 JSON 欄位 | `jsonb`             |
| 狀態欄位       | `text check (...)`  |
| 金額           | `integer`，台幣整數 |

重要狀態：

- PostgreSQL 尚未接入後端 runtime。
- 後端仍使用 SQLite。
- PostgreSQL migration 與 seed 目前是草稿，但已用本機 Docker PostgreSQL dev container 驗證過。
- PostgreSQL draft 拆分 `users`、`user_private_profiles`、`user_public_profiles`，避免商家看到顧客私人資料。
- PostgreSQL draft 透過 `merchant_users.store_id` 讓每個商家帳號對應一間店。
- PostgreSQL seed draft 替每個菜單品項建立甜度、冰塊、尺寸、加料選項。

## LINE Pay 狀態

目前方向：

1. 顧客送出購物車。
2. 後端建立訂單。
3. 後端建立 LINE Pay sandbox authorization request。
4. LINE Pay redirect 回後端 confirm endpoint。
5. 後端把 order 與 payment authorization 更新為 `authorized`。
6. 截止結算時依團購結果執行 capture 或 void。
7. 請款失敗訂單可在取餐前 15 分鐘以前重新付款；已請款交易可由 dev/backend refund API 處理。

目前限制：

- 已完成 authorization request / confirm / cancel 起步。
- void / capture 已在付款模組內部實作。
- 已實作開發 / 補救用手動觸發單一團購結算。
- 已實作取餐前 15 分鐘以前的手動重新付款第一版。
- refund 已有 dev/backend 後端 API 與 smoke test；尚未有正式退款 UI、退款失敗重試 queue、provider reconciliation 與正式 sandbox 人工端對端測試。
- 第一版不做 LINE Pay webhook endpoint；後續需要補 provider 狀態查詢、重試佇列與對帳。
- 自動 deadline settlement scheduler 已先接上單一 backend process interval；尚未有跨執行個體 locking、重試佇列與告警。

安全規則：

- LINE Pay secrets 只能放在 `backend/.env`。
- Mobile app 不可以保存 LINE Pay Channel Secret。

## 已決定的重要產品規則

- 商家開團。
- 顧客透過選飲料、加入購物車、送出訂單、LINE Pay 預授權來加入團購。
- 只有預授權成功的杯數才計入優惠門檻。
- 如果優惠級距是 20 / 30 / 40 杯，最高容量就是 40 杯，除非之後新增獨立容量規則。
- 如果目前授權杯數是 25，級距是 20 / 30 / 40，畫面應顯示 `25 / 30`。
- 顧客進行中訂單只顯示該顧客已加入的團購。
- 附近招募中團購顯示所有招募中的活動。
- 訂單修改後若金額變動，需要重新預授權。
- 已有授權不可在顧客確認重新預授權前直接取消。
- 取貨碼需等商家端符合可顯示規則後才顯示。

## 高優先未完成項目

1. Mobile 啟動時應從後端載入 activities。
2. 需要菜單讀取 API。
3. 訂單列表與訂單明細應改成以後端資料為準。
4. 已授權訂單修改 API 與 mobile revision + LINE Pay request 第一版已完成；仍需補失敗提示與重試入口。
5. 仍需要完整 order revision 歷史查詢與 UI 呈現。
6. 需要跨執行個體 settlement locking、重試佇列與失敗告警。
7. LINE Pay refund 已有後端 dev/backend 切片；仍需要正式退款 UI、退款失敗重試與正式 sandbox 人工端對端測試。
8. 需要 provider 狀態查詢、重試佇列與跨執行個體 idempotency 處理。
9. 需要 pickup credential API。
10. 尚未建立 PostgreSQL backend runtime adapter。

## 建議下一步

可選下一步：

1. 繼續用 SQLite 做功能。
2. 開始 PostgreSQL implementation slice。
3. 讓 mobile 更穩定地載入後端 activity / menu / order data。

## 換電腦後怎麼接

1. Pull 或複製專案。
2. 先讀 `AGENTS.md`。
3. 再讀 `docs/handoff-summary.md`。
4. 再讀 `docs/current-progress.md`。
5. 手動檢查 `.env` 檔案，因為 secrets 不會 commit。
6. 需要時安裝依賴：

```bash
npm install
cd mobile
npm install
```

7. 依照 `backend/README.md` 與 `mobile/README.md` 啟動 backend / mobile。

注意：機密資料 `secrets` 與本機 SQLite runtime data 不會自動出現在新電腦，除非你另外複製。
