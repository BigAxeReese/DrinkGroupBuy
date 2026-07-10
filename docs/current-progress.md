# 目前進度

最後更新：2026-07-11

換電腦或交接給其他 AI 時，請先閱讀 `docs/handoff-summary.md`。

文件語言規則：會影響程式、API、資料庫或工具辨識的內容使用英文；不影響實作的說明、報告文字與備註可使用中文。若英文技術名稱不容易理解，保留英文並加中文註解。

## 2026-07-05 登入方向更新

- 正式登入方向已確定為只使用 Firebase Auth + Google Login。
- 密碼登入應視為舊版開發相容功能，不是最終產品流程。
- 正式環境中，顧客、商家、管理員角色不得由 mobile UI 選擇。Mobile app 應在 Google Login 後取得 Firebase ID token，送到 backend，並由 backend 從資料庫解析使用者角色。
- 角色、商家與店家綁定、訂單、付款與團購活動狀態都以 backend database 作為資料來源。
- 現有 `/api/auth/login` 密碼端點只作為 Firebase 登入實作與測試完成前的暫時開發橋接。

## 2026-07-05 Firebase Google Login 切片

- Mobile 登入畫面已改為 Google-only Firebase Auth 入口，不再顯示角色與密碼選擇。
- Mobile 會用 Firebase ID token 呼叫 backend `POST /api/auth/firebase-session` 換取 session。
- Backend 使用 Firebase Admin SDK 驗證 Firebase ID token，查詢 `users.firebase_uid`，從資料庫解析 roles/stores，並回傳既有 backend bearer token 格式。
- 尚未對應的 Firebase 使用者會收到 403，並提示開發者將 Firebase UID 加到 `users.firebase_uid`。
- 仍需要外部本機設定：建立 Firebase project/OAuth clients、加入 mobile 公開 Firebase config、設定 backend Firebase Admin credentials，並在開發資料庫對應測試帳號 UIDs。

## 2026-07-05 本機角色對應工具

- 本機開發若只有一個 Google 測試帳號，可用 `scripts/map-firebase-user.js` 將目前 Firebase UID 重新對應到 SQLite seed users。
- Root npm 指令：
  - `npm run auth:map:customer`
  - `npm run auth:map:customer-b`
  - `npm run auth:map:merchant`
  - `npm run auth:map:admin`
- 這不是正式環境角色切換器。Mobile app 仍不顯示角色選擇，角色解析仍由 backend/database 控制。
- 重新對應後，需要登出再登入，讓 app 取得新的 backend token。

## Mobile 端

技術方向：React Native + Expo，Android-first，目前使用 Expo Web 預覽。

已完成或已開始的畫面與流程：

- 登入頁面已會呼叫後端登入 API，並在 mobile API client 保存 bearer token。
- 顧客登入使用手機號碼與密碼。
- 商家與管理員登入使用 email 與密碼。
- 已決定未來正式登入方向為 Firebase Auth + Google Login。
- 開發期仍保留 dev mock login / 測試帳號概念，方便切換身份測流程。
- 顧客首頁、Google Maps 即時地圖、店家菜單、飲料客製化、購物車。
- 顧客首頁會區分「目前顧客已加入的團購」與「附近招募中的團購推薦」。
- 顧客可查看進行中訂單、訂單明細、修改訂單、團購進度、取貨碼與歷史訂單。
- 活動容量依最高優惠級距判斷，例如 20 / 30 / 40 杯代表最多接受 40 杯。
- LINE Pay 預授權與 partial capture 的 UI / 狀態模擬已開始。
- 付款畫面可向後端建立 LINE Pay sandbox 授權網址，並開啟 LINE Pay 付款頁。
- 付款畫面在開啟 LINE Pay 後會短時間自動輪詢 backend 訂單狀態；App / 瀏覽器回到前景時也會安靜刷新，授權完成後同步顯示 `authorized`。
- 顧客送出預授權後，購物車會保留飲品；只有 backend 訂單同步為 `authorized` / `captured` 後，才清除該團購的購物車飲品。
- 付款規則已集中記錄在 `docs/payment-rules-and-flow.md`；目前決議是預授權成功即計入杯數，修改授權訂單採先新授權成功、再取消舊授權的替換流程。
- 商家儀表板、建立活動、接單、完成訂單、商家歷史訂單。
- 管理員儀表板與取消活動。
- 在瀏覽器環境可使用 `localStorage` 做 prototype 本機保存。

目前 mobile 限制：

- App 啟動時尚未完整載入後端權威活動列表。
- 訂單、付款、取貨與大部分 runtime progress 仍有 mobile-local state。
- LINE Pay 完成後目前仍回 backend HTML 頁，尚未做正式 app deep link；mobile 端先以 polling / foreground refresh 同步狀態。
- 部分流程仍保留 fallback 行為。

## Backend 端

技術方向：Node.js built-in HTTP server，目前使用 built-in SQLite driver。

重要檔案：

| 檔案                                      | 用途                                          |
| ----------------------------------------- | --------------------------------------------- |
| `backend/server.js`                       | HTTP API server                               |
| `backend/db.js`                           | SQLite 資料庫存取                             |
| `backend/auth.js`                         | 開發用登入、token、密碼雜湊                   |
| `backend/payments/linePayClient.js`       | LINE Pay sandbox request 簽章                 |
| `backend/payments/linePayService.js`      | LINE Pay 授權 request / confirm / cancel 流程 |
| `backend/payments/linePayPendingStore.js` | LINE Pay redirect 前後的暫存查找              |
| `backend/linePayClient.js`                | payment client 相容匯出                       |
| `backend/README.md`                       | 後端啟動與設定說明                            |

目前 API：

| 方法     | 路徑                                          | 用途                                  |
| -------- | --------------------------------------------- | ------------------------------------- |
| `POST`   | `/api/auth/login`                             | 開發用登入                            |
| `GET`    | `/health`                                     | 健康檢查                              |
| `GET`    | `/api/group-buy-activities`                   | 查詢團購活動與優惠級距                |
| `POST`   | `/api/merchant/group-buy-activities`          | 商家建立團購活動                      |
| `POST`   | `/api/orders`                                 | 建立訂單與訂單品項快照                |
| `PATCH`  | `/api/orders/:orderId`                        | 更新尚未預授權成功的 pending 訂單明細 |
| `GET`    | `/api/orders/:orderId`                        | 查詢訂單明細與最新 LINE Pay 授權      |
| `DELETE` | `/api/admin/group-buy-activities/:activityId` | 管理員 soft-cancel 活動               |
| `POST`   | `/api/payments/line-pay/request`              | 建立 LINE Pay sandbox 授權請求        |
| `GET`    | `/api/payments/line-pay/confirm`              | LINE Pay confirm redirect             |
| `GET`    | `/api/payments/line-pay/cancel`               | LINE Pay cancel redirect              |

已實作的保護：

- 活動建立與取消使用交易。
- 訂單建立會保存品項與客製化快照。
- 尚未預授權成功的 pending 訂單可以用目前購物車內容更新；更新時會把舊的 pending LINE Pay 授權標成 `failed`，避免下一次預授權被阻擋。
- 付款畫面可在 LINE Pay redirect 後透過自動輪詢、回前景刷新或手動刷新同步後端訂單狀態。
- 團購列表會回傳 `authorizedCups` 與 `participantCount`。
- 活動建立有基本 idempotency 處理。
- 管理員取消活動會寫入 `status_history` 與 `audit_logs`。
- LINE Pay Channel ID / Secret 只放後端。
- LINE Pay request / confirm / cancel 邏輯已拆到 `backend/payments/`，目前 API path 維持不變。
- LINE Pay request 會檢查後端是否存在對應訂單。
- LINE Pay confirm 會把付款授權與訂單狀態更新為 `authorized`。
- 已授權或 pending 的授權會阻擋重複 LINE Pay request。
- 顧客下單、訂單查詢與 LINE Pay request 需要 bearer token。
- 商家建立活動需要 merchant bearer token，並檢查該商家帳號是否綁定店家。
- 管理員取消活動需要 admin bearer token。

尚未完成：

- 註冊。
- 忘記密碼 / 密碼重設。
- Firebase Auth + Google Login 實作。
- Backend 驗證 Firebase ID token。
- `users.firebase_uid` 對應 Firebase identity。
- 已授權後的訂單修改 / 重新授權流程。
- 後端重啟後仍可追蹤 LINE Pay redirect 的持久化查找。
- LINE Pay capture / void / refund。
- LINE Pay webhook。
- 取貨 API。
- 截止時間自動結算 job。
- 正式 migration 系統。
- 自動化測試。

目前重要限制：

- `POST /api/orders` 只適用於已存在於後端 SQLite 的活動。
- 如果 mobile local activity 已過期或不存在於後端，送單會失敗。

## Database / 資料庫

目前開發資料庫：

```text
database/drink-group-buy-dev.sqlite
```

目前 SQLite schema：

```text
database/schema.sql
```

目前 seed：

```text
database/seed-dev.sql
```

目前 schema 已包含：

- `users` / `user_roles`
- `user_private_profiles` / `user_public_profiles`
- `merchants` / `merchant_users` / `stores`
- `menu_items` / `customization_options`
- `group_buy_activities` / `promotion_tiers` / `activity_notices`
- `cart_drafts` / `cart_draft_items` / `cart_draft_item_customizations`
- `orders` / `order_items` / `order_item_customizations`
- `payment_authorizations` / `payment_captures` / `payment_provider_events`
- `activity_settlements`
- `pickup_credentials`
- `status_history`
- `audit_logs`

資料正規化方向：

- 飲料客製化選項以 child rows 儲存，不把甜度、冰塊、加料塞成 JSON 或逗號字串。
- 訂單品項與客製化選項保留 snapshot，避免菜單改價後影響舊訂單。

PostgreSQL 方向：

- 資料庫設計總覽：`docs/database-design-v1.md`
- PostgreSQL 遷移規劃：`docs/postgresql-migration-plan.md`
- PostgreSQL schema draft：`database/migrations/001_initial_postgres.sql`
- PostgreSQL seed draft：`database/migrations/002_seed_dev_postgres.sql`
- PostgreSQL 本機驗證設定：`database/docker-compose.postgres.yml`

目前 PostgreSQL 狀態：

- PostgreSQL 尚未接入後端 runtime。
- 後端仍使用 SQLite。
- PostgreSQL schema / seed draft 已在本機 Docker PostgreSQL 開發容器驗證過。
- PostgreSQL draft 已拆分 `users`、`user_private_profiles`、`user_public_profiles`。
- PostgreSQL draft 中每個商家帳號透過 `merchant_users.store_id` 對應一間店。
- PostgreSQL seed draft 有 4 個顧客、7 個商家、1 個管理員、7 間店、8 個菜單項目與 96 個客製化選項。

目前開發資料概況：

- 12 筆 `users` 與 12 筆 `roles`。
- PostgreSQL seed draft 有 12 筆 private profiles 與 12 筆 public profiles。
- 7 筆 `merchants`、7 筆 `merchant_users`、7 筆 `stores`。
- PostgreSQL seed draft 有 8 筆 `menu_items` 與 96 筆 `customization_options`。
- 0 筆 `group_buy_activities`。
- 0 筆 `promotion_tiers`。
- 0 筆 `orders`、payment authorizations、captures、settlements、pickup credentials。

測試資料庫：

```text
database/test/drink-group-buy-test.sqlite
```

用途：

- prototype 測試資料。
- 地圖資料會匯出到 `mobile/src/mock/databaseMapStores.js`。
- 這不是正式 runtime 資料來源。

## 下一個建議開發切片

建議下一步：

1. App 啟動時從後端載入 activities。
2. 增加菜單讀取 API。
3. 讓訂單列表與訂單明細改成以後端資料為準。
4. 補訂單修改 API。
5. 補商家接單、完成訂單與取貨憑證 API。
