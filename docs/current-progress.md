# 目前進度

最後更新：2026-07-30

換電腦或交接給其他 AI 時，請先閱讀 `docs/handoff-summary.md`。

文件語言規則：會影響程式、API、資料庫或工具辨識的內容使用英文；不影響實作的說明、報告文字與備註可使用中文。若英文技術名稱不容易理解，保留英文並加中文註解。

## 進度摘要

- Firebase Auth + Google Login 已實作，backend 會驗證 Firebase ID token，再依開發資料庫的 `users.firebase_uid`、`user_roles` 與 `merchant_users` 判斷身份。
- 本機開發已新增 dev-only 身份切換器；只有 backend `AUTH_DEV_MODE=true` 且 mobile `EXPO_PUBLIC_AUTH_MODE=dev` 時才會顯示，可用下拉選單切換 SQLite 內所有有效顧客、商家與開發補救身份。
- 開發資料庫仍使用 SQLite，主要 schema、seed 與付款相關資料表已建立；PostgreSQL schema / seed 草稿已在本機容器驗證，但尚未接入 backend runtime，目前還不是正式資料庫。
- LINE Pay 付款主幹已拆成獨立模組，已有 request、confirm、cancel、capture、void、refund、訂單修改後重新預授權與截止結算排程。
- 付款結算 smoke test 已於 2026-07-19 通過，包含達標請款、未達標原價請款／取消授權、排程結算、修改訂單替換授權、截止後拒絕預授權、三次自動請款上限、取餐前 15 分鐘以前的手動重新付款，以及退款 idempotency。
- 開發資料庫曾暴露同一筆 LINE Pay 失敗請款被無限重試的問題；目前已改為截止時第一次請款，暫時性失敗後每 30 秒重試，總計最多三次，並在重試前查詢 provider 狀態。
- 2026-07-19 已將該問題產生的 6,496 筆重複失敗紀錄壓縮為 1 筆原始失敗紀錄與 1 筆稽核摘要，共移除 6,495 筆；清理前 SQLite 備份保留於本機 `database/backups/`，後續可用 `npm run payments:cleanup:preview` 預覽及 `npm run payments:cleanup` 安全清理同類資料。
- 三次自動請款失敗或遇到不可重試錯誤後，顧客可在取餐開始前 15 分鐘以前使用結算後金額直接重新付款；後端會先查原交易狀態並解除仍有效的原授權，付款成功後訂單改為已扣款並加入製作流程。
- 已新增 `npm run check:sql-safety`，用來檢查 backend、database 與 scripts 內是否出現未審核的動態 SQL、SQL 字串插值或字串相加，降低後續開發時引入 SQL 注入風險。
- 2026-07-30 已完成 SQL safety、付款結算、取貨逾期、取貨碼、菜單／訂單權威、訂單列表／取消與 HTTP route smoke 回歸；Expo Doctor 17/17 通過，Web production bundle 可成功輸出。
- 訂單流程新增 `npm run order-flow:smoke` 與 `npm run order-api:smoke`，覆蓋 cursor、門市／活動篩選、匿名顧客、重複下單、取消鎖定、取消冪等、idempotency key 衝突及跨店 403。
- 已執行非強制 `npm audit fix`；Root 與 Mobile 仍有只能透過 Expo／React Native 或相關傳遞依賴主版本升級處理的 audit 警告，未使用 `--force` 破壞目前 Expo SDK 51 相容性。
- 系統分析書已整理為五大功能，五組描述性綱目已更新，並已抽出 `docs/system-analysis-extracted.md`；各小節使用個案描述與活動圖仍待更新。

## 2026-07-28 團購菜單規則更新

- 產品規則已確認：每個團購自動開放該活動所屬店家目前上架的全部飲品，商家建立活動時不逐一選擇適用飲品。
- 資料庫不需要新增 activity-menu item 多對多關聯表；顧客菜單查詢條件為 activity 的 `store_id` 加上 `menu_items.is_available = 1`。
- 店家可以修改店內菜單；新選取與未送出的購物車使用最新菜單，已送出的訂單保留品名、價格與客製化快照。
- 顧客權威菜單 API、商家菜單管理 API／畫面與訂單送出時的店家歸屬、供應狀態、客製化選項、選擇數量及價格重算已完成第一版。
- 每個飲品可由店家以明確整數設定各客製化類型的 `minSelections`／`maxSelections`；目前 mobile 菜單管理可編輯品名、分類、說明、價格、上下架、選項與每杯加料上限。
- 藍圖可用「每杯折 10／15 元」呈現門檻優惠；顯示換算與截止時依實際有效杯數分攤總折扣的公式仍需再收斂，避免顯示金額與最終請款不一致。

## 2026-07-05 登入方向更新

- 正式登入方向已確定為只使用 Firebase Auth + Google Login。
- 密碼登入應視為舊版開發相容功能，不是最終產品流程。
- 正式環境中，顧客與商家角色不得由 mobile UI 選擇。Mobile app 應在 Google Login 後取得 Firebase ID token，送到 backend，並由 backend 從資料庫解析使用者角色；admin 僅作開發或後端補救工具，第一階段正式 App 不提供管理員流程。
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
  - `npm run auth:map:admin`（僅供開發或後端補救測試）
- 這不是正式環境角色切換器。Mobile app 仍不顯示角色選擇，角色解析仍由 backend/database 控制。
- 重新對應後，需要登出再登入，讓 app 取得新的 backend token。

## 2026-07-21 本機模擬身份切換

- Mobile 登入頁在 `EXPO_PUBLIC_AUTH_MODE=dev` 時會額外顯示「本機測試身份」下拉選單。
- Backend 只有在 `AUTH_DEV_MODE=true` 且非 `NODE_ENV=production` 時才開放 `GET /api/auth/dev-users` 與 `POST /api/auth/dev-session`。
- 下拉選單資料來自 SQLite `users`、`user_roles` 與 `merchant_users`，包含所有 active 的 customer、merchant 與開發補救身份。
- 這不是正式產品角色選擇；正式環境仍只顯示 Google 登入，並由 Firebase UID 對應資料庫身份。

## Mobile 端

技術方向：React Native + Expo，Android-first，目前使用 Expo Web 預覽。

已完成或已開始的畫面與流程：

- 登入頁面使用 Firebase Auth + Google Login，並將 Firebase ID token 送到 backend 建立應用程式 session。
- 顧客與商家使用相同的 Google 登入入口；角色不由 mobile UI 選擇，而是由 backend/database 判斷。
- 密碼登入只保留為舊版開發相容功能，不屬於最終產品流程。
- 開發期仍保留測試帳號與 dev-only 身份切換器，方便在本機切換顧客與商家流程。
- 顧客首頁、Google Maps 即時地圖、店家菜單、飲料客製化、購物車。
- 顧客首頁會區分「目前顧客已加入的團購」與「附近招募中的團購推薦」。
- 顧客可查看進行中訂單、訂單明細、修改訂單、團購進度、取貨碼與歷史訂單。
- 活動容量依最高優惠級距判斷，例如 20 / 30 / 40 杯代表最多接受 40 杯。
- LINE Pay 預授權與 partial capture 的 mobile UI / 狀態流程已串接第一版。
- 付款畫面可向後端建立 LINE Pay sandbox 授權網址，並開啟 LINE Pay 付款頁。
- 付款畫面在開啟 LINE Pay 後會短時間自動輪詢 backend 訂單狀態；App / 瀏覽器回到前景時也會安靜刷新，授權完成後同步顯示 `authorized`。
- LINE Pay confirm/cancel backend HTML 結果頁已提供 `drinkgroupbuy://payment/result` app deep link，並嘗試自動返回 App；mobile 端會監聽 deep link、導回付款畫面並同步該筆訂單。
- 顧客送出預授權後，購物車會保留飲品；只有 backend 訂單同步為 `authorized` / `captured` 後，才清除該團購的購物車飲品。
- Mobile 主要團購命名已從 `deal` 遷移到 `groupBuyActivity`，付款預授權畫面已從 `PaymentReportScreen` 改為 `PaymentAuthorizationScreen`；舊 localStorage key 只保留相容讀取。
- 付款規則已集中記錄在 `docs/payment-rules-and-flow.md`；目前決議是預授權成功即計入杯數，修改授權訂單採先新授權成功、再取消舊授權的替換流程。
- 商家儀表板、建立活動、查看訂單、標記可取餐、核銷取餐、商家歷史訂單。
- 開發 / 補救用取消活動與手動結算 route；不列入第一階段正式 App 使用者流程。
- 在瀏覽器環境可使用 `localStorage` 做 prototype 本機保存。

目前 mobile 限制：

- App 啟動時尚未完整載入後端權威活動列表。
- 訂單、付款、取貨與大部分 runtime progress 仍有 mobile-local state。
- LINE Pay 完成後仍會先回 backend HTML 頁；HTML 頁會提供返回 App deep link，mobile 端仍保留 polling / foreground refresh 作為備援。
- 部分流程仍保留 fallback 行為。
- `StoreMenuScreen` / `DrinkSelectionScreen` 已改讀後端菜單；地圖與部分店家基本資料仍保留 prototype mock data。

## Backend 端

技術方向：Node.js built-in HTTP server，目前使用 built-in SQLite driver。

重要檔案：

| 檔案                                      | 用途                                          |
| ----------------------------------------- | --------------------------------------------- |
| `backend/server.js`                       | HTTP API server                               |
| `backend/db.js`                           | SQLite 資料庫存取                             |
| `backend/auth.js`                         | 開發用登入、token、密碼雜湊                   |
| `backend/payments/linePayClient.js`       | LINE Pay sandbox request 簽章                 |
| `backend/payments/linePayService.js`      | LINE Pay request / confirm / cancel、手動重新付款、void / capture / refund 流程 |
| `backend/payments/linePayPendingStore.js` | LINE Pay redirect 前後的記憶體快取；confirm/cancel 以 DB 查找為主 |
| `backend/payments/settlementService.js`   | 單一團購結算流程，依結果批次 capture / void   |
| `backend/linePayClient.js`                | payment client 相容匯出                       |
| `backend/README.md`                       | 後端啟動與設定說明                            |

目前 API：

| 方法     | 路徑                                          | 用途                                  |
| -------- | --------------------------------------------- | ------------------------------------- |
| `POST`   | `/api/auth/login`                             | 開發用登入                            |
| `POST`   | `/api/auth/firebase-session`                  | Firebase Google Login session         |
| `GET`    | `/api/auth/dev-users`                         | 本機 dev-only 身份清單                |
| `POST`   | `/api/auth/dev-session`                       | 本機 dev-only 模擬登入                |
| `GET`    | `/health`                                     | 健康檢查                              |
| `GET`    | `/api/group-buy-activities`                   | 查詢團購活動與優惠級距                |
| `POST`   | `/api/merchant/group-buy-activities`          | 商家建立團購活動                      |
| `GET`    | `/api/stores/:storeId/menu`                   | 顧客查詢上架飲品、選項與選擇限制      |
| `GET`    | `/api/merchant/stores/:storeId/menu`          | 商家查詢完整菜單                      |
| `POST`   | `/api/merchant/stores/:storeId/menu-items`    | 商家新增飲品                          |
| `PATCH`  | `/api/merchant/stores/:storeId/menu-items/:menuItemId` | 商家修改、上架或停售飲品     |
| `POST`   | `/api/orders`                                 | 建立訂單與訂單品項快照                |
| `PATCH`  | `/api/orders/:orderId`                        | 更新尚未預授權成功的 pending 訂單明細 |
| `POST`   | `/api/orders/:orderId/revisions`              | 建立已授權訂單的待重新預授權修改版本  |
| `GET`    | `/api/orders/:orderId`                        | 查詢訂單明細與最新 LINE Pay 授權      |
| `GET`    | `/api/customers/me/orders`                    | 顧客權威進行中／歷史訂單列表          |
| `GET`    | `/api/merchant/stores/:storeId/orders`        | 商家門市權威訂單列表與履約摘要        |
| `POST`   | `/api/orders/:orderId/cancel`                 | 顧客在鎖定前退出團購並取消訂單        |
| `DELETE` | `/api/admin/group-buy-activities/:activityId` | 開發 / 補救用 soft-cancel 活動        |
| `POST`   | `/api/admin/group-buy-activities/:activityId/settle` | 開發 / 補救用手動觸發單一團購結算 |
| `POST`   | `/api/payments/line-pay/request`              | 建立 LINE Pay sandbox 授權請求        |
| `POST`   | `/api/payments/line-pay/repay`                | 請款失敗後建立 LINE Pay 重新付款      |
| `POST`   | `/api/payments/line-pay/refund`               | 開發 / 補救用已請款交易退款           |
| `GET`    | `/api/payments/line-pay/confirm`              | LINE Pay confirm redirect             |
| `GET`    | `/api/payments/line-pay/cancel`               | LINE Pay cancel redirect              |

已實作的保護：

- 活動建立與取消使用交易。
- 訂單建立會保存品項與客製化快照。
- 建立、更新 pending 訂單與建立 revision 都會重新驗證飲品店家歸屬、上架狀態、客製化選項與店家設定的選擇數量，並由後端以基本價格加選項價差重算單價與小計。
- Client 金額與權威金額不同時回傳 `order_price_changed`，不會靜默改價或直接進入付款；無效／停售品項或超過加料上限時回傳 `order_items_invalid`。
- 尚未預授權成功的 pending 訂單可以用目前購物車內容更新；更新時會把舊的 pending LINE Pay 授權標成 `failed`，避免下一次預授權被阻擋。
- 已授權訂單修改第一版已加入：`POST /api/orders/:orderId/revisions` 會建立 pending revision 與 item snapshots，不會立即修改原訂單；mobile 購物車與訂單明細修改會建立 revision，付款頁會帶 `orderRevisionId` 重新發起 LINE Pay 預授權；新預授權 confirm 成功後才套用 revision，並嘗試 void 舊授權。
- 付款畫面可在 LINE Pay redirect 後透過 app deep link、自動輪詢、回前景刷新或手動刷新同步後端訂單狀態。
- 團購列表會回傳 `authorizedCups` 與 `participantCount`。
- 活動建立有基本 idempotency 處理。
- 開發 / 補救用取消活動會寫入 `status_history` 與 `audit_logs`。
- LINE Pay Channel ID / Secret 只放後端。
- LINE Pay request / confirm / cancel 邏輯已拆到 `backend/payments/`，目前 API path 維持不變。
- LINE Pay request 會檢查後端是否存在對應訂單。
- 真 LINE Pay request 目前需要 `LINE_PAY_CAPTURE_SEPARATED=true` 才能送出；台灣 LINE Pay channel 預設自動請款，必須先向 LINE Pay 開通分離式請款，避免自動請款被誤當預授權。
- LINE Pay confirm 會把付款授權與訂單狀態更新為 `authorized`。
- LINE Pay confirm 寫入 `authorized` 前會檢查是否已達團購截止時間；若 confirm 時已達或超過截止時間，該授權不計入團購並會嘗試 void。
- LINE Pay confirm 若回傳 `authorizationExpireDate`，後端會保存到 `payment_authorizations.expires_at`；該時間必須晚於團購截止時間加結算緩衝時間，否則會標記失敗並嘗試 void。
- LINE Pay cancel redirect 會把對應 pending authorization 標記為 `failed`，並寫入 provider event、status history 與 audit log，讓顧客可重新付款。
- LINE Pay confirm/cancel redirect 可用資料庫的 `provider_authorization_id` 找回 pending authorization；記憶體暫存只作快取，後端重啟後仍可處理 redirect。
- LINE Pay confirm 在寫入 `authorized` 前會用資料庫交易重新檢查團購容量；容量不足時會把 authorization 標記為 `failed`，訂單不會計入團購。
- LINE Pay void 已加入付款模組；容量不足但 provider confirm 已成功時，系統會自動嘗試 void，成功後寫入 `authorization_voided`、provider event、status history 與 audit log；void 失敗時會留下 provider event 與 audit log。
- LINE Pay capture 已加入付款模組；成功後會寫入 `payment_captures`、更新 authorization/order 狀態與 `orders.final_amount`，失敗時會留下 failed capture、provider event 與 audit log。
- LINE Pay refund 已加入付款模組；dev/backend 後端 API 可針對已 capture 交易建立全額或部分退款，寫入 `payment_refunds`、provider event 與 audit log，並用 idempotency key 防止重複退款；全額退款後訂單付款狀態會更新為 `refunded`。
- 單一團購手動結算 API 已加入；開發 / 補救權限可觸發已截止活動結算，系統會計算最終級距，對有效授權訂單執行 capture 或 void，並寫入 `activity_settlements`。
- deadline settlement scheduler 已加入後端啟動流程；預設每 30 秒掃描已截止、尚未結算的團購並呼叫同一套 settlement service。`LINE_PAY_ENV=production` 時需要明確允許才會啟動。
- 本機付款結算 smoke script 已加入：`npm run settlement:smoke` 會用乾淨 schema 與 `mock_line_pay` 驗證達標 capture、未達標 fallback capture / void，以及 scheduler due activity 結算，並在測試後還原開發 SQLite。
- 商家建立團購 API 已強制 `deadlineAt` 必須晚於 `startAt`，且不得超過 `startAt` 後 24 小時；`pickupStartAt` 至少晚於 `deadlineAt` 30 分鐘，`pickupEndAt` 必須晚於 `pickupStartAt`。
- Mobile 建立團購表單已將取餐開始預設為截止後 30 分鐘，並阻擋低於 30 分鐘的取餐開始時間。
- 已授權或 pending 的授權會阻擋重複 LINE Pay request。
- 顧客下單、訂單查詢與 LINE Pay request 需要 bearer token。
- 商家建立活動需要 merchant bearer token，並檢查該商家帳號是否綁定店家。
- 開發 / 補救用取消活動目前需要 admin bearer token。

尚未完成：

- 已授權後的訂單修改 / 重新授權 mobile 第一版已串接；訂單列表現以 Backend 回應為權威、local state 僅作 cache，仍需細化失敗提示。
- LINE Pay refund 目前只有 dev/backend 後端 API 與 smoke test；尚未做正式操作 UI、退款失敗重試 queue 與正式 sandbox 人工端對端測試。
- LINE Pay webhook 第一版不列為必要入口；目前付款同步以 confirm/cancel redirect、polling 與後續 provider 狀態查詢為主。
- 顧客與商家權威訂單列表 API 與 Mobile 第一版已串接，登入、切換分頁及 App 回到前景會同步；Backend 統一回傳 `lifecycleBucket` 與 `availableActions`。已移除訂單清單中的舊 local 訂單覆蓋，其他活動畫面仍有 mock fallback。
- 顧客鎖定前取消訂單已完成第一版：pending 授權失效、authorized 先 void、pending revision 一併取消，captured 訂單拒絕自行取消。
- 付款結算失敗規則已決定：第一版以自動重試為主，不做人工處理介面；失敗中的訂單不進入製作或取貨。
- 尚未實作跨執行個體 deadline settlement locking、持久化重試 queue 與失敗告警；單一 backend process 內的 provider 狀態查詢、三次上限與 30 秒重試已實作。
- 正式 migration 系統。
- 完整 Android mobile E2E 與 LINE Pay sandbox 人工驗證仍未完成；目前自動 smoke、Expo Doctor 與 Web bundle 已通過。

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
- `menu_items` / `customization_options` / `menu_item_customization_rules`
- `group_buy_activities` / `promotion_tiers` / `activity_notices`
- `cart_drafts` / `cart_draft_items` / `cart_draft_item_customizations`
- `orders` / `order_items` / `order_item_customizations`
- `order_revisions` / `order_revision_items` / `order_revision_item_customizations`
- `payment_authorizations` / `payment_captures` / `payment_refunds` / `payment_provider_events`
- `activity_settlements`
- `pickup_credentials`
- `status_history`
- `audit_logs`

取貨逾期資料結構：

- `pickup_credentials.expires_at` 保存取貨憑證到期時間。
- `pickup_credentials.expired_at` 保存系統實際執行逾期處理的時間。
- `orders.pickup_status` 已支援 `expired`，`status_history` 已支援保存取貨狀態變更。
- 既有 SQLite 會在後端開啟資料庫時自動補欄位與到期時間索引，不會重建或清除資料。
- 取貨逾期排程每 30 秒掃描一次；期限取 `pickupStartAt + 3 小時` 與 `pickupEndAt` 較早者。
- 到期後，已扣款但未取餐的訂單更新為 `pickup_status = expired`，已取餐維持 `picked_up`，活動更新為 `completed`。
- 狀態歷程、audit log、同活動交易鎖定與重複執行防護已完成，並可用 `npm run pickup-expiration:smoke` 驗證。
- 取貨憑證建立／驗證、逾期排程及 App 歷史訂單第一版已串接；仍待完整 Android E2E 與補救權限流程。

資料正規化方向：

- 飲料客製化選項以 child rows 儲存，不把甜度、冰塊、加料塞成 JSON 或逗號字串。
- 訂單品項與客製化選項保留 snapshot，避免菜單改價後影響舊訂單。
- `menu_item_customization_rules` 以飲品與選項類型為複合主鍵，保存最少／最多選擇數；`max_selections = 0` 表示不提供該類型，加料可由店家設定明確上限。

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
- PostgreSQL seed draft 有 4 個顧客、7 個商家、1 個 dev/admin 補救帳號、7 間店、8 個菜單項目與 96 個客製化選項。

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

1. 補 LINE Pay provider 狀態查詢、redirect 遺失恢復與持久化重試 queue。
2. 補跨執行個體 settlement／cancel／capture locking 與失敗告警。
3. 建立 PostgreSQL runtime adapter 與正式 migration 流程。
4. 細化 revision、容量不足及 void 失敗的 mobile 錯誤提示。
5. 待恢復測試階段後執行 Android E2E 與 LINE Pay sandbox 人工驗證。

## 系統分析書進度

- Word 主檔：`系統分析書_使用個案及活動圖範本.docx`。
- Markdown 抽出版：`docs/system-analysis-extracted.md`。
- 已完成五大功能分類與描述性綱目。
- 尚待更新 4.1.1 至 4.5.4 的使用個案描述表、使用個案圖與活動圖，並移除舊範本內容。
