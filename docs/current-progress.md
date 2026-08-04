# 目前進度

最後更新：2026-08-04

換電腦或交接給其他 AI 時，請先閱讀 `docs/handoff-summary.md`。

文件語言規則：會影響程式、API、資料庫或工具辨識的內容使用英文；不影響實作的說明、報告文字與備註可使用中文。若英文技術名稱不容易理解，保留英文並加中文註解。

## 進度摘要

- Firebase Auth + Google Login 已實作，backend 會驗證 Firebase ID token，再依開發資料庫的 `users.firebase_uid`、`user_roles` 與 `merchant_users` 判斷身份。
- 本機開發已新增 dev-only 身份切換器；只有 backend `AUTH_DEV_MODE=true` 且 mobile `EXPO_PUBLIC_AUTH_MODE=dev` 時才會顯示，可用下拉選單切換 SQLite 內所有有效顧客、商家與開發補救身份。
- 開發 runtime 預設仍使用 SQLite；auth、菜單、活動、首次建單、訂單讀取、authorization request／confirm／cancel 與顧客取消已可受控切換 PostgreSQL。capture 與 settlement orchestration 已有 PostgreSQL repository／service building block，但尚未接入 server route／scheduler；改單／revision、refund 與 pickup 仍使用 SQLite。
- LINE Pay 付款主幹已拆成獨立模組，已有 request、confirm、cancel、capture、void、refund、訂單修改後重新預授權與截止結算排程。
- 付款結算 smoke test 已於 2026-07-19 通過，包含達標請款、未達標原價請款／取消授權、排程結算、修改訂單替換授權、截止後拒絕預授權、三次自動請款上限、取餐前 15 分鐘以前的手動重新付款，以及退款 idempotency。
- 開發資料庫曾暴露同一筆 LINE Pay 失敗請款被無限重試的問題；目前已改為截止時第一次請款，暫時性失敗後每 30 秒重試，總計最多三次，並在重試前查詢 provider 狀態。
- 2026-07-30 已加入 LINE Pay request status reconciliation、SQLite 持久化工作佇列與 lease-based claim；pending authorization 即使 redirect 遺失或 Backend 重啟，仍可由 worker 依 provider 狀態繼續確認、失敗或標記人工檢視。
- Confirm、capture、void、refund、顧客取消、手動補付款、LINE Pay 取消回跳、取餐就緒／兌換／逾期與整團 settlement 已加入資料庫 operation lease；到期結算 scheduler 改為持久化 job。
- `GET /api/admin/payment-reliability/alerts` 已提供 admin-only 終止警示查詢；reconciliation 與 settlement scheduler 會輸出 `[payment-reliability-alert]` 結構化日誌。
- `npm run payment-reliability:smoke` 與 `npm run payment-reliability:multiprocess` 已驗證工作去重、兩個 Node.js 程序競爭、租約逾時接手、終止警示與 provider `0121` 對帳。
- 2026-07-19 已將該問題產生的 6,496 筆重複失敗紀錄壓縮為 1 筆原始失敗紀錄與 1 筆稽核摘要，共移除 6,495 筆；清理前 SQLite 備份保留於本機 `database/backups/`，後續可用 `npm run payments:cleanup:preview` 預覽及 `npm run payments:cleanup` 安全清理同類資料。
- 三次自動請款失敗或遇到不可重試錯誤後，顧客可在取餐開始前 15 分鐘以前使用結算後金額直接重新付款；後端會先查原交易狀態並解除仍有效的原授權，付款成功後訂單改為已扣款並加入製作流程。
- 已新增 `npm run check:sql-safety`，用來檢查 backend、database 與 scripts 內是否出現未審核的動態 SQL、SQL 字串插值或字串相加，降低後續開發時引入 SQL 注入風險。
- 2026-07-30 已完成 SQL safety、database adapter、真實 PostgreSQL runtime、SQLite／PostgreSQL 公開菜單與團購活動列表 repositories／HTTP source proofs、付款可靠性／雙程序 lease、付款結算、取貨碼、菜單／訂單權威與訂單列表／取消 smoke 回歸；41 個 Backend／script／database JavaScript 檔語法通過，SQLite `integrity_check = ok`、`foreign_key_check = 0`。
- 2026-07-31 已完成 PostgreSQL 商家完整菜單查詢、建立、修改與停售 transaction；跨連線 HTTP proof 驗證 store-first row lock、公開菜單過濾、選項軟停用、稽核紀錄與測試資料歸零。
- 2026-07-31 已完成 PostgreSQL 顧客首次建單 transaction；HTTP proof 驗證 activity row lock、截止／容量／重複／改價防護、品項與選項快照、history／audit 與清理歸零。
- 訂單流程新增 `npm run order-flow:smoke` 與 `npm run order-api:smoke`，覆蓋 cursor、門市／活動篩選、匿名顧客、重複下單、取消鎖定、取消冪等、idempotency key 衝突及跨店 403。
- 2026-08-04 已完成公開店家地圖切片：新增 `GET /api/stores`，Android／Web 地圖顯示 SQLite 內全部營業中且有座標的店家，並與活動 API 合併；藍色表示沒有可加入活動，黃色表示有可加入活動。店家 API 失敗時明確顯示錯誤，不回退至 mock。
- 已執行非強制 `npm audit fix`；最近一次結果為 Root `11` 項（`6 moderate`、`5 high`、`0 critical`），Mobile `46` 項（`1 low`、`11 moderate`、`33 high`、`1 critical`）。剩餘項目需要 Expo／React Native 或相關傳遞依賴的主版本升級，因此未使用 `--force` 破壞目前 Expo SDK 51 相容性。
- 系統分析書已整理為五大功能，五組描述性綱目已更新，並已抽出 `docs/system-analysis-extracted.md`；各小節使用個案描述與活動圖仍待更新。

## 2026-07-30 產品規則收斂

- 級距保存總折扣金額；目前與截止時的每杯折扣均使用 `floor(級距總折扣 / 有效授權杯數)`。例如 3 杯、總折扣 100 元時，每杯折 33 元、實際分配 99 元。
- 無法整除的尾差不分配給顧客。現行優惠由商家出資，因此尾差退回商家；未來只有明確的平台出資活動才由平台保留尾差。
- 折扣上下限已定案：活動發布時逐級驗證整個可達杯數區間，保證每杯至少折 1 元且不超過店內最低可售單杯權威金額；招募中的菜單降價／上架、訂單寫入、重新授權與截止結算都必須重新驗證，不允許負數應付金額。
- Backend 已回傳目前有效杯數、目前／下一級距、預估每杯折扣、實際預估分配與尾差；Mobile 已在顧客首頁、活動詳情、團購進度與商家儀表板接上共用折扣摘要。截止結算已依相同公式產生每筆訂單折扣與應付金額；PostgreSQL `003` migration 已決定保存每杯折扣、實際分配、尾差、出資方與計算版本的不可變快照。
- 第一階段商家只能提出退款申請，由營運／補救權限確認後執行；商家 App 不直接持有金流憑證或直接呼叫 LINE Pay refund。
- 帳號可申請關閉並立即停用登入；非必要個資刪除或去識別化，必要交易與稽核紀錄依法律、會計及爭議處理需求限制性保留。顧客電話第一階段為選填，且商家不得看到完整號碼。
- 第一階段正式平台範圍為 Android；Expo Web 只作開發預覽，iOS 不列入驗收。

## 2026-07-28 團購菜單規則更新

- 產品規則已確認：每個團購自動開放該活動所屬店家目前上架的全部飲品，商家建立活動時不逐一選擇適用飲品。
- 資料庫不需要新增 activity-menu item 多對多關聯表；顧客菜單查詢條件為 activity 的 `store_id` 加上 `menu_items.is_available = 1`。
- 店家可以修改店內菜單；新選取與未送出的購物車使用最新菜單，已送出的訂單保留品名、價格與客製化快照。
- 顧客權威菜單 API、商家菜單管理 API／畫面與訂單送出時的店家歸屬、供應狀態、客製化選項、選擇數量及價格重算已完成第一版。
- 每個飲品可由店家以明確整數設定各客製化類型的 `minSelections`／`maxSelections`；目前 mobile 菜單管理可編輯品名、分類、說明、價格、上下架、選項與每杯加料上限。
- 藍圖的每杯折扣已定義為 `floor(目前達成級距總折扣 / 目前有效授權杯數)`，顯示時必須標示為預估；截止時以最終有效授權杯數重算並保存結算快照。

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
- App 選定角色與回到前景時會同步 `GET /api/stores` 與 `GET /api/group-buy-activities`；地圖合併店家與可加入活動狀態，其他活動畫面顯示目前級距、預估每杯折扣、實際預估分配、尾差及下一級距差杯數。
- 顧客首頁與商家儀表板已提供活動同步載入、失敗提示與手動重試；同步失敗時保留上次成功資料，不再靜默失敗。
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

### Mobile 模組化進度

| 模組 | 狀態 | 下一個缺口 |
| --- | --- | --- |
| 登入與角色 | 已實作程式切片 | Firebase Console、OAuth、UID mapping 與 Android 實機 E2E |
| 活動探索 | 已完成全部營業店家地圖與活動合併切片 | 附近公里數篩選、正式定位／隱私流程、Android 地圖實機 E2E |
| 菜單、購物車與訂單 | 已完成第一版串接 | revision／失敗提示細化與 Android E2E |
| 付款授權與重新付款 | 部分完成 | LINE Pay 分離式請款 Sandbox 人工 E2E、錯誤／重試 UX |
| 截止結算顯示 | 尚未開始前端專用畫面 | 顯示不可變最終折扣／尾差快照 |
| 商家履約與取餐 | 已完成第一版串接 | 退款申請／營運審核與 Android E2E |


目前 mobile 限制：

- 公開團購活動與顧客／商家訂單列表已由 Backend 同步，mobile local state 僅作 cache；顧客首頁、商家儀表板、活動詳情與團購進度均使用共用活動載入／錯誤／重試元件，同步失敗時保留上次成功資料。
- 顧客地圖已使用 `GET /api/stores` 顯示全部營業中且有座標的店家，再與活動 API 合併可加入狀態；dev auth mode 可依登入 Backend `userId` 同步控制台固定位置或 GPS。正式版定位／隱私流程、距離計算與附近公里數篩選仍未完成。
- LINE Pay 完成後仍會先回 backend HTML 頁；HTML 頁會提供返回 App deep link，mobile 端仍保留 polling / foreground refresh 作為備援。
- 部分流程仍保留 fallback 行為。
- `StoreMenuScreen` / `DrinkSelectionScreen` 已改讀後端菜單；商家與開發補救畫面的部分店家摘要仍保留 prototype mock，需在各自模組改接登入身份可管理的 Backend store。

## Backend 端

技術方向：Node.js built-in HTTP server；預設使用 built-in SQLite driver，公開菜單與團購活動列表唯讀 repositories 可獨立使用 PostgreSQL。

重要檔案：

| 檔案                                      | 用途                                          |
| ----------------------------------------- | --------------------------------------------- |
| `backend/server.js`                       | HTTP API server                               |
| `backend/db.js`                           | SQLite 資料庫存取                             |
| `backend/pricing/groupBuyDiscount.js`     | 每杯折扣、尾差與級距上下限的純運算             |
| `backend/pricing/groupBuyDiscountDatabase.js` | 菜單、訂單與活動折扣的 SQLite 權威驗證      |
| `backend/auth.js`                         | 開發用登入、token、密碼雜湊                   |
| `backend/payments/linePayClient.js`       | LINE Pay sandbox request 簽章                 |
| `backend/payments/linePayService.js`      | LINE Pay request / confirm / cancel、手動重新付款、void / capture / refund 流程 |
| `backend/payments/linePayPendingStore.js` | LINE Pay redirect 前後的記憶體快取；confirm/cancel 以 DB 查找為主 |
| `backend/payments/settlementService.js`   | 單一團購結算流程，依結果批次 capture / void   |
| `backend/payments/reliabilityService.js`     | LINE Pay provider reconciliation 與持久化工作 worker |
| `backend/linePayClient.js`                | payment client 相容匯出                       |
| `backend/reliability/operationLease.js` | 跨程序狀態變更 lease 共用封裝                  |
| `backend/database/`                     | SQLite/PostgreSQL adapter 與公開菜單／團購活動列表唯讀 repositories |
| `docs/line-pay-separated-capture-sandbox-checklist.md` | LINE Pay 分離式請款 Sandbox 人工驗證清單 |
| `backend/README.md`                       | 後端啟動與設定說明                            |

目前 API：

| 方法     | 路徑                                          | 用途                                  |
| -------- | --------------------------------------------- | ------------------------------------- |
| `POST`   | `/api/auth/login`                             | 開發用登入                            |
| `POST`   | `/api/auth/firebase-session`                  | Firebase Google Login session         |
| `GET`    | `/api/auth/dev-users`                         | 本機 dev-only 身份清單                |
| `POST`   | `/api/auth/dev-session`                       | 本機 dev-only 模擬登入                |
| `GET`    | `/health`                                     | 健康檢查                              |
| `GET`    | `/api/stores`                                  | 查詢公開營業店家與座標                |
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
| `GET`    | `/api/admin/payment-reliability/alerts`        | Admin 查詢需人工處理的付款可靠性工作    |
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
- 團購列表會回傳 `authorizedCups`、`participantCount`、目前／下一級距、`estimatedDiscountPerCup`、預估分配總額、未分配尾差與下一級距尚差杯數；SQLite 與 PostgreSQL 唯讀 repository 契約一致。
- 活動建立會逐級驗證可達杯數區間，阻擋每杯折扣為 0 或高於店內最低可售單杯權威金額的級距；招募中的菜單降價／上架、訂單建立／更新／revision 與截止結算都會重驗。
- 結算不再用上限截斷折扣或把負數應付金額靜默改成 0；若快照價格與折扣衝突，回傳 `settlement_discount_conflict` 並停止結算。
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
- LINE Pay refund 已加入付款模組；dev/backend 後端 API 可針對已 capture 交易建立全額或部分退款，寫入 `payment_refunds`、provider event 與 audit log，並用 idempotency key 防止重複退款；全額退款後訂單付款狀態會更新為 `refunded`。正式產品規則已定為商家提出申請、營運執行，申請與審核流程尚未實作。
- 單一團購手動結算 API 已加入；開發 / 補救權限可觸發已截止活動結算，系統會計算最終級距，對有效授權訂單執行 capture 或 void，並寫入 `activity_settlements`。
- deadline settlement scheduler 已加入後端啟動流程；預設每 30 秒掃描已截止、尚未結算的團購並呼叫同一套 settlement service。`LINE_PAY_ENV=production` 時需要明確允許才會啟動。
- 本機付款結算 smoke script 已加入：`npm run settlement:smoke` 會用乾淨 schema 與 `mock_line_pay` 驗證達標 capture、未達標 fallback capture / void，以及 scheduler due activity 結算，並在測試後還原開發 SQLite。
- 商家建立團購 API 已強制 `deadlineAt` 必須晚於 `startAt`，且不得超過 `startAt` 後 24 小時；`pickupStartAt` 至少晚於 `deadlineAt` 30 分鐘，`pickupEndAt` 必須晚於 `pickupStartAt`。
- Mobile 建立團購表單已將取餐開始預設為截止後 30 分鐘，並阻擋低於 30 分鐘的取餐開始時間。
- Mobile 建立團購表單會先標示空值、非正整數與重複杯數，再把 Backend 的 `discount_tier_invalid`／`discount_menu_invalid` 轉成對應級距或菜單中文提示；每杯折扣上下限仍以 Backend 最新菜單驗證為準。
- 已授權或 pending 的授權會阻擋重複 LINE Pay request。
- 顧客下單、訂單查詢與 LINE Pay request 需要 bearer token。
- 商家建立活動需要 merchant bearer token，並檢查該商家帳號是否綁定店家。
- 開發 / 補救用取消活動目前需要 admin bearer token。

尚未完成：

- 已授權後的訂單修改 / 重新授權 mobile 第一版已串接；訂單列表現以 Backend 回應為權威、local state 僅作 cache，仍需細化失敗提示。
- LINE Pay refund 目前只有 dev/backend 後端 API 與 smoke test；尚未做商家退款申請、營運審核／執行 UI、退款失敗重試 queue 與正式 sandbox 人工端對端測試。
- LINE Pay webhook 第一版不列為必要入口；目前付款同步以 confirm/cancel redirect、polling 與後續 provider 狀態查詢為主。
- 顧客與商家權威訂單列表 API 與 Mobile 第一版已串接，登入、切換分頁及 App 回到前景會同步；Backend 統一回傳 `lifecycleBucket` 與 `availableActions`。顧客訂單與取餐資訊的店家 fallback 已改讀 Backend order／activity store。
- 顧客鎖定前取消訂單已完成第一版：pending 授權失效、authorized 先 void、pending revision 一併取消，captured 訂單拒絕自行取消。
- 付款結算失敗規則已決定：第一版以自動重試為主，不做人工處理介面；失敗中的訂單不進入製作或取貨。
- Provider reconciliation、持久化 retry jobs、payment／settlement／cancel／repay／pickup DB lease 與 terminal job 告警旗標已完成第一版；兩程序 claim／lease takeover 與 PostgreSQL settlement row-lock proof 已通過，仍缺正式告警通知管道、LINE Pay Sandbox 人工端對端與 server 接線驗收。
- Mobile 即時預估折扣／尾差已接上 Backend 活動列表；顧客首頁、活動詳情與地圖的店家摘要也已使用同一活動資料。顧客首頁、商家儀表板、活動詳情與團購進度的同步失敗提示／重試已完成；尚未完成 Android 實機 E2E、附近店家距離與截止後專用最終快照顯示。
- PostgreSQL `003_activity_settlement_discount_snapshot_postgres.sql` 已永久套用本機開發資料庫；專用 runner 會辨識未套用、完整套用與部分套用，並驗證五個折扣快照欄位、constraints 與既有資料回填。SQLite runtime 仍以既有欄位重算，沒有雙寫。
- 正式 migration 系統。
- 完整 Android mobile E2E 與 LINE Pay sandbox 人工驗證仍未完成；目前自動 smoke、Expo Doctor 與 Web bundle 已通過。

目前重要限制：

- 訂單相關 runtime 預設仍是 SQLite；受控 PostgreSQL server 模式已涵蓋首次建單、顧客／商家列表、訂單明細、首次 authorization request／confirm／cancel、一般 authorization void 與顧客取消。capture／settlement PostgreSQL building block 已驗證，但 server route 與 scheduler 仍保持停用，避免在分離式請款 Sandbox 核准前暴露自動請款；改單／revision、refund 與 pickup 仍回 `503 customer_order_runtime_mismatch`，目前不可視為付款 E2E runtime。
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
- PostgreSQL 結算快照 migration draft：`database/migrations/003_activity_settlement_discount_snapshot_postgres.sql`
- PostgreSQL 本機驗證設定：`database/docker-compose.postgres.yml`

目前 PostgreSQL 狀態：

- PostgreSQL 已完成 auth／公開菜單／活動／訂單讀取，以及商家建團、商家菜單、顧客首次建單、付款 request／confirm／cancel、一般 authorization void 與顧客取消受控切片。
- 所有 server 開關預設仍是 `sqlite`，沒有雙寫。建單、confirm、cancel／void 與顧客取消都採 activity-first lock；capture／settlement repository 已遷移但尚未接 server，改單／revision、refund 與 pickup 尚未遷移。
- 本機 PostgreSQL 16 已套用 `001_initial_postgres.sql`、`002_seed_dev_postgres.sql` 與 `003_activity_settlement_discount_snapshot_postgres.sql`；服務只監聽 `localhost`，schema／backfill 驗證通過。
- PostgreSQL cancel redirect、mock void、顧客取消、跨連線 activity lock、idempotency 與清理歸零 HTTP proof 已正式通過。
- 新增單筆 capture repository／service building block；`payment-capture:smoke`、`line-pay-capture-service:smoke` 與真實 PostgreSQL `payment-capture-postgres:smoke` 已通過，覆蓋 mock capture 成功、provider 暫時失敗、retry attempt、activity lock 與清理歸零。此 building block 尚未接入 server／settlement scheduler，不是可直接請款的新入口。
- 新增 PostgreSQL settlement repository／service building block；`group-buy-settlement:smoke` 與真實 `group-buy-settlement-postgres:smoke` 已驗證 settlement plan、capture retry state、五欄折扣快照、持久化 job retry／complete、`FOR UPDATE SKIP LOCKED`、跨執行個體 operation lock、mock capture 與清理歸零。尚未接入 server，不是可直接請款的新入口。
- PostgreSQL draft 已拆分 `users`、`user_private_profiles`、`user_public_profiles`。
- PostgreSQL draft 中每個商家帳號透過 `merchant_users.store_id` 對應一間店；不分 owner／manager／staff，API 相容欄位 `permissionLevel` 在 PostgreSQL 回傳 `null`。
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
- 舊測試工具仍可匯出 `mobile/src/mock/databaseMapStores.js`，但目前顧客地圖 runtime 已不再讀取此檔案。
- 這不是正式 runtime 資料來源。

## 下一個建議開發切片

建議下一步：

1. 前端新增截止後專用最終結算快照，明確區分招募中預估折扣與結算後不可變折扣／尾差。
2. 細化訂單、付款失敗、重試與重新付款狀態，避免只顯示通用錯誤。
3. 商家端店家摘要改接登入身份可管理的 Backend store，並補退款申請／營運審核流程。
4. 增加附近公里數篩選、正式使用者定位／隱私流程與 Android 地圖實機 E2E；目前第一版先顯示全部營業店家。
5. LINE Pay 核准分離式請款後，執行 Sandbox reconciliation、capture、void 與 lease takeover 人工端對端驗證。
6. Sandbox proof 通過後，將已驗證的 capture／settlement repositories 明確接入 Backend，並只在 Sandbox 啟用 PostgreSQL settlement route／scheduler；仍禁止雙寫。
7. 為 server runtime 加入 `PAYMENT_CAPTURE_RUNTIME` 與 `GROUP_BUY_SETTLEMENT_RUNTIME` 全組一致性防護，再做 PostgreSQL HTTP／scheduler restart proof。
8. 將正式 production 自動請款列為獨立人工核准步驟，不跟 Sandbox 啟用綁在一起。
9. 執行 Android 實機 E2E、Firebase Console／OAuth／UID mapping 驗證。

## 系統分析書進度

- Word 主檔：`系統分析書_使用個案及活動圖範本.docx`。
- Markdown 抽出版：`docs/system-analysis-extracted.md`。
- 已完成五大功能分類與描述性綱目。
- 尚待更新 4.1.1 至 4.5.4 的使用個案描述表、使用個案圖與活動圖，並移除舊範本內容。
