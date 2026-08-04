# 交接總整理

最後更新：2026-08-05

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
- 目前開發資料庫預設為 SQLite；auth、公開菜單、活動讀寫、商家菜單、顧客首次建單、訂單讀取、付款 request／confirm／cancel、一般 authorization void 與顧客取消已有受控 PostgreSQL repositories，相關 runtime 必須一起切換且不雙寫。
- 未來正式資料庫目標：PostgreSQL。
- Firebase 不作為主要資料庫方向。
- Firebase 目前只規劃用於 Auth / Google Login。
- 開發期優先用 Firebase Google 測試帳號；若帳號不足，本機可用 dev-only 身份切換器測顧客、商家，以及必要的後端補救權限。
- LINE Pay sandbox 預授權、void、capture、refund、手動重新付款、單一團購手動結算與 deadline settlement scheduler 已有後端切片。
- 訂單流程階段 0～5 的第一版已完成；GitHub 完成基準為 `7f52ed0 Complete and validate order flows`。

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

- 顧客與商家訂單列表已在登入、切換頁籤及 App 回到前景時向 Backend 同步；local state 僅作畫面 cache。
- 團購活動首頁、地圖及部分店家摘要仍混用 local state 或 mock，尚未完全由 Backend 權威資料驅動。
- LINE Pay reliability 核心已完成；PostgreSQL authorization cancel／一般 void／顧客取消 HTTP proof 已通過。capture 與 settlement repository／service building blocks 亦通過真實 PostgreSQL mock-capture、折扣快照、持久化 job retry／complete、`SKIP LOCKED`、跨執行個體 lock 與清理歸零 proof；尚未接入 server／scheduler，改單／revision、refund、pickup 與 Sandbox 人工 E2E 尚未完成。

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
| `backend/payments/reliabilityService.js` | Provider reconciliation、持久化工作 worker 與結構化警示 |
| `backend/reliability/operationLease.js`   | 跨程序敏感狀態變更 lease 共用封裝             |
| `backend/database/`                       | SQLite/PostgreSQL adapter 與 auth、菜單、活動、顧客建單 repositories |
| `backend/README.md`                       | 後端啟動說明                                  |

目前 API：

| 方法     | 路徑                                          | 用途                           |
| -------- | --------------------------------------------- | ------------------------------ |
| `POST`   | `/api/auth/login`                             | 登入                           |
| `POST`   | `/api/auth/firebase-session`                  | Firebase Google Login session   |
| `GET`    | `/api/auth/dev-users`                         | 本機 dev-only 身份清單          |
| `POST`   | `/api/auth/dev-session`                       | 本機 dev-only 模擬登入          |
| `GET`    | `/health`                                     | 健康檢查                       |
| `GET`    | `/api/stores`                                  | 查詢公開營業店家與座標         |
| `GET`    | `/api/group-buy-activities`                   | 查詢團購活動                   |
| `GET`    | `/api/stores/:storeId/menu`                   | 顧客查詢上架菜單               |
| `GET`    | `/api/merchant/stores/:storeId/menu`          | 商家查詢完整菜單               |
| `POST`   | `/api/merchant/stores/:storeId/menu-items`    | 商家新增菜單品項               |
| `PATCH`  | `/api/merchant/stores/:storeId/menu-items/:menuItemId` | 商家修改或上下架品項 |
| `POST`   | `/api/merchant/group-buy-activities`          | 商家建立團購活動               |
| `POST`   | `/api/orders`                                 | 顧客建立訂單                   |
| `PATCH`  | `/api/orders/:orderId`                        | 更新尚未預授權成功的訂單明細   |
| `POST`   | `/api/orders/:orderId/revisions`              | 建立已授權訂單的修改版本       |
| `GET`    | `/api/customers/me/orders`                    | 顧客權威訂單列表               |
| `GET`    | `/api/merchant/stores/:storeId/orders`        | 商家門市權威訂單列表           |
| `POST`   | `/api/orders/:orderId/cancel`                 | 顧客在鎖定前取消訂單           |
| `POST`   | `/api/merchant/orders/:orderId/refund-requests` | 商家對已請款訂單提出退款申請 |
| `GET`    | `/api/merchant/stores/:storeId/refund-requests` | 商家查詢自己門市的退款申請   |
| `GET`    | `/api/admin/refund-requests`                  | 營運查詢退款申請佇列           |
| `POST`   | `/api/admin/refund-requests/:requestId/approve` | 營運核准退款申請並執行退款 |
| `POST`   | `/api/admin/refund-requests/:requestId/reject`  | 營運駁回退款申請             |
| `POST`   | `/api/merchant/group-buy-activities/:activityId/ready-for-pickup` | 商家標記活動可取餐 |
| `GET`    | `/api/orders/:orderId/pickup-credential`      | 顧客查詢取貨憑證               |
| `POST`   | `/api/merchant/pickup-credentials/lookup`     | 商家查詢取貨碼                 |
| `POST`   | `/api/merchant/pickup-credentials/redeem`     | 商家核銷取貨碼                 |
| `GET`    | `/api/orders/:orderId`                        | 查詢訂單明細                   |
| `DELETE` | `/api/admin/group-buy-activities/:activityId` | 開發 / 補救用取消活動         |
| `POST`   | `/api/admin/group-buy-activities/:activityId/settle` | 開發 / 補救用手動觸發單一團購結算 |
| `POST`   | `/api/payments/line-pay/request`              | 建立 LINE Pay sandbox 授權請求 |
| `POST`   | `/api/payments/line-pay/repay`                | 請款失敗後建立 LINE Pay 重新付款 |
| `POST`   | `/api/payments/line-pay/refund`               | 開發 / 補救用已請款交易退款    |
| `GET`    | `/api/payments/line-pay/confirm`              | LINE Pay confirm redirect      |
| `GET`    | `/api/payments/line-pay/cancel`               | LINE Pay cancel redirect       |
| `POST`   | `/api/payments/ecpay/request`                 | 建立信用卡（ECPay）預授權請求  |
| `GET`    | `/api/payments/ecpay/checkout-redirect`       | 產生導向 ECPay 託管付款頁的中介頁面 |
| `POST`   | `/api/payments/ecpay/return`                  | ECPay ReturnURL webhook（權威付款通知） |
| `GET`    | `/api/payments/ecpay/client-back`             | ECPay ClientBackURL（非權威來源） |

目前 backend 限制：

- 沒有註冊。
- 沒有密碼重設。
- 沒有正式 production auth/session 設計；目前 Firebase session route 會回傳既有 bearer token。
- LINE Pay void / capture / refund 已在付款模組與 dev/backend API 切片實作；refund 尚未有正式操作 UI、失敗重試 queue 與正式 sandbox 人工端對端驗證。
- LINE Pay webhook 第一版不列為必要入口；付款同步先以 confirm/cancel redirect、資料庫狀態與後續 provider 狀態查詢為主。
- 取貨憑證、標記可取餐、取貨碼查詢／核銷與逾期處理已完成第一版；QR Code、正式通知與完整 Android E2E 尚未完成。
- 已實作開發 / 補救用手動觸發單一團購結算，也已接上後端啟動時的 deadline settlement scheduler。
- Scheduler 預設每 30 秒掃描已截止、尚未結算的團購；若 `LINE_PAY_ENV=production`，必須設定 `SETTLEMENT_SCHEDULER_ALLOW_PRODUCTION=true` 才會啟動。
- 自動檢查包含 `check:sql-safety`、`database-adapter:smoke`、`store-menu-read:smoke`、`payment-reliability:smoke`、`payment-reliability:multiprocess`、`settlement:smoke`、`refund-request:smoke`、`pickup-expiration:smoke`、`pickup-credential:smoke`、`menu-order:smoke`、`order-flow:smoke`、`order-api:smoke` 與 `postgres-runtime:smoke`；會碰觸 SQLite 的 smoke scripts 完成後會還原開發資料庫。
- 後端預設仍使用 SQLite；auth、公開菜單、活動讀寫、商家菜單、首次建單、訂單讀取、authorization request／confirm／cancel、一般 void 與顧客取消可受控切換 PostgreSQL，沒有雙寫；其餘訂單後續與付款仍是 SQLite。

## 2026-07-30～2026-07-31 驗證基準

- SQL safety 與上述可在本機執行的 smoke 全數通過；`order-api:smoke` 已實際覆蓋公開菜單 route。
- Backend／scripts／database 共 41 個 JavaScript 檔語法通過；先前 Mobile JSX parse、Expo Doctor `17/17` 與 Web production export 亦通過。
- SQLite `integrity_check = ok`、`foreign_key_check = 0`。
- 本機 PostgreSQL 16 已套用 migrations／seed，並限制只監聽 `localhost`；auth、菜單、活動讀寫、商家菜單與顧客建單 HTTP proofs 均通過，臨時 proof 資料已清除。
- 尚未完成 Android 實機、Firebase 正式設定與 LINE Pay sandbox 人工端對端驗證。

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

- 公開菜單仍可由 `STORE_MENU_READ_RUNTIME` 獨立切換；啟用 PostgreSQL 寫入時，auth、公開菜單、活動讀寫與 `MERCHANT_MENU_RUNTIME` 必須一起切換。
- PostgreSQL migration／seed 草稿與 reliability schema parity 已完成。
- `database-adapter:smoke` 與 `store-menu-read:smoke` 已通過。
- 本機實際 PostgreSQL auth、公開菜單、活動讀寫、商家菜單、首次建單、訂單讀取、付款 request／confirm／cancel、一般 void 與顧客取消 routes 已驗證通過；capture／settlement building blocks 與 `003` schema／backfill proof 也已通過，沒有雙寫。
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
- Refund 已有 dev/backend API、operation lease 與 smoke test；尚未有正式退款 UI、退款專用 reconciliation job 與 Sandbox 人工端對端測試。
- 第一版不做 LINE Pay webhook endpoint；request status reconciliation、持久化重試與 redirect 遺失恢復已完成。
- 自動 deadline settlement scheduler 已使用持久化 job、跨程序 claim／lease takeover 與結構化終止警示。

安全規則：

- LINE Pay secrets 只能放在 `backend/.env`。
- Mobile app 不可以保存 LINE Pay Channel Secret。

## 信用卡（ECPay）狀態——2026-08-05，後端與 mobile 第一版已完成

**唯一原因是 LINE Pay 分離式請款官方審核進度不確定**，新增綠界 ECPay 作為備用付款 provider（走跳轉 ECPay 託管付款頁的標準結帳方式）。**LINE Pay 完全不受影響、兩者並存**；信用卡是「多一個選擇」不是「取代 LINE Pay」，要不要上線可以視 LINE Pay 審核進度再決定。詳見 `docs/current-progress.md`「2026-08-05 新增信用卡（ECPay）付款」與 `docs/payment-rules-and-flow.md`「付款 Provider 方向」。

目前狀態：

- 已完成並驗證：DB `provider` CHECK 放寬（含 SQLite 重建表遷移）、`ecpayClient.js`（CheckMacValue 簽章已對照官方範例驗證吻合）、`ecpayService.js`、四支 `server.js` 路由（已用真實 HTTP 請求驗證，包含真實建單流程）、`settlementService.js`／`refundRequestService.js` 的 provider 分派、mobile `apiClient.js`／`PaymentAuthorizationScreen.jsx`（付款方式選擇 UI，已用 Babel 驗證語法）。
- `npm run ecpay:smoke` 已加入自動化回歸測試（`mock_ecpay`），涵蓋建立請求、webhook 確認、竄改簽章拒絕、結算 capture/void、退款自動分派、重複請求阻擋。
- 尚未做：真正打 ECPay Stage 環境的人工端對端驗證（`docs/ecpay-checkout-stage-checklist.md` 已建立但尚未執行）、webhook 遺失的輪詢對帳機制、ECPay 授權有效期檢查、ECPay 手動重新付款流程。
- ECPay 官方公開測試特店資料（僅供 Stage 測試環境）已內建於 `ecpayClient.js` 作為預設值：商號 `3002607`；不需要申請真正商業帳號即可開發測試。
- **注意**：`settlement:smoke`／`refund-request:smoke`／`ecpay:smoke` 等會完整重建 `database/drink-group-buy-dev.sqlite` 的 smoke test，不建議在本機同時有 `npm run backend:start` 執行時跑，曾在開發過程中因檔案鎖定衝突造成一次資料庫損毀（已安全復原）。

安全規則：

- ECPay HashKey／HashIV／MerchantID 正式環境值只能放 `backend/.env`（Stage 測試值可留在程式碼作為預設值，因為官方本來就公開這組資料，僅供測試環境使用）。
- 一律走跳轉 ECPay 託管付款頁，不做 ECPay 幕後授權 API，避免後端經手卡號。

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

1. 讓 Mobile 啟動時從 Backend 載入 activities，逐步移除活動、地圖與店家摘要 mock。
2. LINE Pay 回覆開通後，依 `docs/line-pay-separated-capture-sandbox-checklist.md` 執行人工 E2E。
3. 將 terminal job 的 `alert_required` 接到正式告警通知管道。
4. Sandbox proof 通過後，把已驗證的 capture／settlement building blocks 接入 server，加入全組 runtime 防護並執行 HTTP／scheduler restart proof。
5. 細化 revision、容量不足、void 失敗與重新付款的 Mobile 錯誤提示及重試入口。
6. 補完整 order revision 歷史查詢與 UI 呈現。
7. 規劃 Expo SDK／React Native 升級，處理目前無法非破壞性修正的依賴警告。
8. 完成 Android、Firebase Google Login 與 LINE Pay sandbox 人工 E2E。

## 建議下一步

PostgreSQL cancel／void／顧客取消 server proof 與 capture／settlement building block proof 已通過，SQLite 仍是預設。下一步等待分離式請款 Sandbox 核准並完成人工 E2E，再接入 server；目前仍不是付款 E2E runtime。

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
