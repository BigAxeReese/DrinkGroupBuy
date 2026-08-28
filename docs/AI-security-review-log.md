# 安全審查記錄

這份文件記錄每次 `/security-review` 或手動安全審查的結果——誠實記錄「審查過什麼、發現什麼、還沒解決什麼」，不是給外部客戶看的正式報告，是給自己跟之後接手的人看的工作記錄。

跟 `DECISIONS.md` 一樣邊做邊記，不倒著補；每次審查完，不管有沒有發現問題都要記一筆（「沒發現問題」本身也是有價值的資訊，代表這個範圍審查過了）。

`/security-review` 的邊界：只檢查注入攻擊、身份驗證/授權、加密/機密資料、程式碼執行、資料外洩這五類，明確不包含 DoS、過時套件漏洞、塞進 AI prompt 的使用者內容這些——這些如果需要，要另外處理，不能指望這份記錄涵蓋。

---

## 範本（複製這段開始寫新的一筆）

```
## YYYY-MM-DD — 審查範圍

**範圍**：（例如：LINE Pay 退款流程改動、backend/payments/ 整個資料夾）
**觸發原因**：（例如：CLAUDE.md 規則自動觸發 / 手動要求 / 上線前檢查）

### 發現

| 嚴重度 | 位置 | 問題 | 建議修法 | 狀態 |
|--------|------|------|----------|------|
| 高/中/低 | file.js:行號 | ... | ... | 已修 / 待處理 / 評估後不修（原因） |

### 沒發現問題的部分
（列出審查過、但沒發現問題的範圍，跟上面的發現一樣重要——證明這塊真的被看過）
```

---

## 2026-08-11 — 付款／訂單修改／取貨憑證相關的未 commit 改動

**範圍**：`backend/payments/`（ecpayService.js、linePayService.js、refundRequestService.js）、`backend/database/repositories/`（含新檔案 orderRevisionRepository.js、paymentRefundRepository.js、pickupCredentialRepository.js）、`backend/pickup/`、`backend/db.js`、`backend/server.js`、`database/migrations/004_order_revision_refund_pickup_postgres.sql`
**觸發原因**：手動要求，針對目前工作目錄裡還沒 commit 的這批改動做審查
**方法**：讀完整 diff＋新檔案全文，並追過呼叫路徑（不只看 diff 片段），交叉驗證授權/歸屬檢查跟金額防竄改邏輯

### 發現

沒有找到信心度達到門檻（8/10 以上）的漏洞。

### 沒發現問題的部分（已交叉驗證）

| 面向 | 檢查結果 |
|------|----------|
| SQL injection | 新／改動的查詢全部用參數化 `$1/$2...`，沒有把輸入字串拼進 SQL |
| 訂單修改權限 | `createPostgresOrderRevision` 有檢查 `order.customer_user_id`，route handler 也要求 `customer` 角色並用 `authUser.id`，別人的訂單改不到 |
| 金額竄改（改單後的 LINE Pay 授權） | `requestLinePayAuthorizationUnlocked` 跟 `createPostgresPendingAuthorization` 各自獨立驗證金額對得上 `revision.originalAmount`，兩層防護，客戶端傳的金額不會被直接信任 |
| 取貨憑證跨店存取（IDOR） | `findMerchantCredentialPostgres`／`markReadyPostgres` 都有透過 `merchant_users` 限定在自己店，別的店的取貨碼查不到也改不動 |
| 取貨碼隨機性 | 用 `node:crypto` 的 `randomInt`，是密碼學安全的亂數，不是可預測的 |
| Postgres/SQLite 執行模式不一致的路由繞過風險 | 有 boot-time 檢查，設定不一致會直接讓伺服器啟動失敗，不會讓程式帶著矛盾設定跑起來 |

**這次沒審查到的部分**：ECPay／LINE Pay 的 webhook 簽章驗證（`CheckMacValue`、confirm signature）這次沒有改動，所以沒有重新審查，不代表這塊沒問題，只是這次範圍沒碰到。

### 待人工評估（信心度不夠高，沒有列為正式發現）

**改單後，舊的付款授權沒有被明確作廢**（信心度約 4/10，不是確認的漏洞，是資料完整性上的疑慮）
- 位置：`backend/database/repositories/paymentAuthorizationConfirmRepository.js` 的 `confirmPostgresAuthorization`（約 145-197 行）
- 狀況：訂單改單產生新授權（A2）並確認後，程式沒有把原本的授權（A1，`revision.original_payment_authorization_id`）明確轉成作廢狀態——A1 理論上還留在 `authorized` 狀態
- 為什麼沒列為正式漏洞：目前範圍內查到的請款／作廢／取消查詢都是抓「同一張訂單裡最新一筆」（`ORDER BY created_at DESC LIMIT 1`），所以正常流程只會摸到 A2，沒找到會去撈全部 `authorized` 狀態授權的路徑，沒有具體的雙重請款情境可以指出來
- 如果你想順手補：在套用改單的同一個 transaction 裡，明確把 A1 轉成作廢/取消狀態，就算目前沒有真的能被利用的漏洞，這樣資料庫的狀態也會更誠實、少一個潛在風險

---

## 2026-08-13 — 修法覆核：A1 作廢邏輯（呼應 2026-08-11 那筆「待人工評估」）

**範圍**：`backend/database/repositories/paymentAuthorizationConfirmRepository.js`（單一檔案的改動）
**觸發原因**：CLAUDE.md 規則自動觸發——金流相關改動，修完後主動跑一次 `/security-review` 留記錄
**方法**：只審查這次的 diff，對照 `paymentAuthorizationCancelRepository.js` 既有的 `voidPostgresAuthorization` 模式判斷一致性，並追過 `order_id`／`customerUserId` 的來源鏈路確認沒有跨訂單風險

### 這次改了什麼
在 `confirmPostgresAuthorization` 套用改單、確認新授權（A2）的同一個 transaction 裡，加了：用 `FOR UPDATE` 鎖住舊授權（A1），如果還是 `authorized` 狀態就轉成 `authorization_voided`（含 `voided_at`、`failure_reason`、provider event、status history、audit log、取消 reliability job），完全複製既有 `voidPostgresAuthorization` 的欄位與副作用。

### 發現

沒有找到信心度達到門檻（8/10 以上）的新問題。

**原本的疑慮是否解決**：**是**。A2 轉成 `authorized`、套用改單、跟 A1 轉成 `authorization_voided`，三件事在同一個 Postgres transaction 裡，要嘛一起成功、要嘛一起失敗，不會再有 A1 卡在 `authorized` 狀態的空窗期。

### 沒發現問題的部分（已交叉驗證）

| 面向 | 檢查結果 |
|------|----------|
| 會不會作廢到別的訂單/別人的授權（IDOR） | `revision.original_payment_authorization_id` 在建立改單時就已經限定同一張訂單，訂單本身也已經檢查過 `customer_user_id`，A1/A2/改單三者永遠綁在同一張訂單，沒有客戶端能操控的路徑指到別人的授權 |
| 重複作廢／併發競爭 | 有 `status === 'authorized'` 才會作廢的判斷式（跟舊有的作廢函式邏輯一致），加上 `FOR UPDATE` 鎖跟外層「A2 不是 pending 就直接回傳」的 idempotent 保護，重跑或併發都不會重複作廢 |
| provider event 的 idempotency key 會不會撞號 | 新的 key 格式（用改單的 UUID 命名空間）跟現有其他格式不會撞，不會有稽核事件被意外吞掉的風險 |
| 鎖的順序會不會死鎖 | 跟既有的作廢邏輯一樣先鎖 activity 再鎖授權，順序一致 |
| 如果 A1 已經被請款（captured）會不會誤作廢 | 判斷式只處理 `authorized` 狀態，已經 captured 的不會被誤動 |

**這次沒審查到的部分**：範圍只有這一支檔案的這次 diff，沒有重新審查 8/11 那次涵蓋的其他檔案（ecpayService.js、pickup 相關等）——那些維持 8/11 記錄的結論，不代表這次又重新確認過一次。

---

## 2026-08-17 — 商家自助取消團購（新功能）

**範圍**：`backend/server.js`（新路由）、`backend/db.js`（`cancelGroupBuyActivity` 的 `actionType` 參數化＋三個新的 SQLite gateway 函式）、`backend/database/repositories/merchantGroupBuyActivityCancelRepository.js`（新檔案）、`backend/payments/merchantActivityCancelService.js`（新檔案）、mobile 端（`apiClient.js`／`AppNavigator.js`／`MerchantDashboardScreen.jsx`）
**觸發原因**：CLAUDE.md 規則自動觸發——新功能涉及付款授權撤銷，屬於高風險區域，完成後主動跑一次 `/security-review` 留記錄
**方法**：只審查這次新增的 diff／新檔案，對照既有 `POST /api/orders/:orderId/cancel` 與 `customerOrderCancelRepository.js` 的既有安全模式（角色檢查、歸屬檢查、參數化查詢）判斷一致性，並追過 `reason`／`:id` path param／`authUser` 從 HTTP 請求到資料庫寫入與撤銷授權呼叫的完整鏈路

### 發現

沒有找到信心度達到門檻（8/10 以上）的問題。

### 沒發現問題的部分（已交叉驗證）

| 面向 | 檢查結果 |
|------|----------|
| 商家能不能取消別家店的團購（IDOR／越權） | `canManageStore(authUser, activity.store_id)` 在讀到活動後、任何資料庫異動前就檢查；後續查詢訂單一律限定在已驗證過的 `activity_id`，商家碰不到別家店的訂單 |
| 角色檢查 | 路由要求 `authUser.roles.includes("merchant")`，跟既有 merchant 路由寫法一致 |
| 客戶端能不能偽造 `actorUserId`／`activityId`／idempotency key／`actionType` | `actorUserId` 一律來自驗證過的 `authUser.id`；`activityId` 來自 URL path，不受 body 覆寫；idempotency key 與 `actionType`（`merchant_cancel_group_buy_activity`／`merchant_cancel_order`）都是伺服器端組出來的常數，body 傳不進去 |
| SQL injection | 新增的 SQLite／Postgres 查詢全部用 `?`／`$n` 參數化，包含 `cancelGroupBuyActivity` 新參數化的 `actionType`，沒有字串拼接 |
| 截止前 30 分鐘鎖定窗口能不能繞過 | 判斷用 `businessClock.nowIso()`（伺服器時間），mobile 端的 `isWithdrawalLocked` 只是 UI 提示，後端有獨立重新檢查 |
| 撤銷付款授權會不會撤到別人的授權 | `voidLinePayAuthorization`／`voidEcpayAuthorization` 呼叫時的 `orderId` 都來自已經限定 `activity_id` 的 eligible 訂單清單，沒有客戶端可操控指到別筆授權的路徑 |
| API 回應會不會洩漏多餘資料 | 只回傳 `{ activity, cancelledOrderCount, failedOrderIds }`，內部呼叫 `getOrderDetail` 取得的付款細節沒有被帶進 HTTP 回應 |
| `reason` 欄位 | 檢查非空、一律走參數化寫入，沒有被拿去組 HTML 或執行，沒有注入面 |

**這次沒審查到的部分**：沒有重新審查既有的 `POST /api/orders/:orderId/cancel`／`customerOrderCancelRepository.js` 本身（這次 diff 沒有動它們，只是拿來對照），也沒有涵蓋 admin 的 `DELETE /api/admin/group-buy-activities/:id` 路徑（這次功能刻意不修它，取消功能本身不完整——只改活動狀態、沒有連動訂單／授權——是已知但這次範圍外的資料完整性問題，不是這次新增的安全漏洞）。

---

## 2026-08-18 — 商家自助取消團購 code review 修正批次

**呼應**：2026-08-17 那筆（商家自助取消團購新功能）——這次是針對 `/code-review` 抓出的問題做修正後的複查，不是全新功能，範圍聚焦在這批修正本身有沒有新增漏洞
**範圍**：`backend/database/repositories/merchantGroupBuyActivityCancelRepository.js`（新增 `cancelPostgresActivityStatus`、`withOperationLock`）、`backend/payments/merchantActivityCancelService.js`（活動狀態改走 repository、per-order lock 改由 repository 內部決定、取消迴圈改成 `Promise.allSettled` 平行處理）、`backend/db.js`（`cancelMerchantOrderInDatabase` 補上逐筆 `status_history`／`payment_reliability_jobs` 清理）、`backend/server.js`（Postgres 全面切換一致性檢查加入新 repository）、`mobile/src/utils/fetchWithTimeout.js`（新檔案，取代原本會導致當機的 `AbortController` 逾時寫法）、`mobile/src/screens/MerchantDashboardScreen.jsx`（取消按鈕加同步防連點）、`mobile/src/screens/PaymentAuthorizationScreen.jsx`（取餐規則同意加「必須展開閱讀過」的檢查）
**觸發原因**：CLAUDE.md 規則自動觸發——這批修正動到付款授權撤銷與訂單取消的鎖定機制，屬於高風險區域

### 發現

沒有找到信心度達到門檻（8/10 以上）的問題。

### 沒發現問題的部分（已交叉驗證）

| 面向 | 檢查結果 |
|------|----------|
| `cancelPostgresActivityStatus` 有沒有重新做歸屬檢查、會不會被繞過 | 沒有在函式內重做，但確認唯一呼叫者（service 層）在任何寫入動作前就已經用同一個 `activityId` 做過 `canManageStore` 檢查，中間沒有客戶端可操控、會讓兩處 `activityId` 不一致的路徑 |
| repository 內部決定 lock 機制（原本是 service 層依 `paymentAuthorizationCancelRepository.kind` 分支）會不會讓兩個 repository 的 runtime 不一致、鎖不到同一把鎖 | `backend/server.js` 的 Postgres 全面切換一致性檢查已把新 repository 納入，任一 repository 切到 postgres 就強制全部都要是 postgres，不可能出現兩邊 runtime 不同步的狀態 |
| `fetchWithTimeout.js` 用 URL 當 key 做 in-flight 去重，會不會讓不同使用者的回應被互相搭到 | 兩個呼叫點分別是固定 URL（無使用者資料）跟帶 `userId` 查詢參數的 URL，不同使用者天生產生不同 key；且這個快取只存在單一 client 自己的 JS runtime，不是伺服端共享狀態 |
| 取消迴圈改成平行處理（`Promise.allSettled`）會不會讓原本序列處理下不會發生的跨訂單互相干擾冒出來 | 每筆訂單各自有獨立的 per-order lock 與 idempotency key，彼此沒有共用可變狀態；活動層級的最終狀態寫入本身是原子、冪等的，平行處理前後結果一致 |
| `cancelMerchantOrderInDatabase` 新增的逐筆 `status_history`／`payment_reliability_jobs` 寫入 SQL | 全部走 `?` 綁定參數，沒有字串拼接 |

**這次沒審查到的部分**：沒有重新審查 2026-08-17 那次已經涵蓋的範圍（角色檢查、`reason` 驗證、撤銷授權的訂單歸屬等），只聚焦在這批新增/修改的程式碼本身。

---

## 2026-08-20 — PostgreSQL 遷移三個新切片（店家清單／訂單編輯／LINE Pay 人工重新請款）

**範圍**：`backend/database/repositories/storeDirectoryReadRepository.js`（新檔案，唯讀）、`backend/database/repositories/customerOrderWriteRepository.js`（新增 `updateOrder`／`updatePostgresPendingOrder`）、`backend/database/repositories/manualLinePayRepaymentRepository.js`（新檔案，含 `getPostgresRepaymentContext`、`completePostgresRepayment`）、`backend/payments/linePayService.js`（`requestManualLinePayRepayment`／`requestManualLinePayRepaymentUnlocked`／`confirmLinePayAuthorizationUnlocked` 改為接受並使用注入的 repository）、`backend/server.js`（建構三個新/擴充的 repository、路由改走 repository、新增兩處 Postgres 全面切換一致性檢查、`isSqliteOrderDependentRoute` 白名單新增 `PATCH /api/orders/:orderId`）
**觸發原因**：CLAUDE.md 規則自動觸發——這批動到訂單金額重算、付款預授權作廢與人工重新請款的請款/確認邏輯，屬於高風險區域
**方法**：讀完整 diff 與兩個新檔案全文（不只看 diff 片段），交叉比對既有 repository（`paymentAuthorizationCancelRepository.js`、`customerOrderReadRepository.js`）已經確立的 row lock／冪等／授權檢查慣例，追查所有新 SQL 的參數化與 HTTP request body 到 SQL 的資料流

### 發現

沒有找到信心度達到門檻（8/10 以上）的問題。

### 沒發現問題的部分（已交叉驗證）

| 面向 | 檢查結果 |
|------|----------|
| 新 SQL 有沒有字串拼接、繞過參數化 | 全部走 `$1/$2...` 參數化；唯一出現在 SQL 文字裡的 `${...}` 樣板字串都是綁進參數的 `randomUUID()` 產生的 ID，不是拼進 SQL 語法本身 |
| `updatePostgresPendingOrder` 會不會被拿去改別人的訂單 | 寫入前檢查 `order.customer_user_id === input.customerUserId`，且用 `FOR UPDATE` 鎖住 `orders`／`group_buy_activities` 兩張表，跟 `createPostgresCustomerOrder` 用同一把活動列鎖，容量檢查不會跟建單流程互相搶跑 |
| 訂單編輯會不會繞過重新計價／折扣／容量驗證 | 重用既有 `pricePostgresOrderItems`／`validatePostgresOrderDiscount`，任何價格不符、折扣衝突、超過容量都回結構化錯誤、不寫入 |
| `completePostgresRepayment` 會不會被重複觸發、造成重複請款 | 鎖住 authorization 列（`FOR UPDATE`），只接受 `direct_repayment`＋`pending` 狀態；用 `UPDATE ... WHERE status = 'pending'` 搭配 `rowCount` 檢查達成冪等，`payment_provider_events` 另外用 `ON CONFLICT (idempotency_key) DO NOTHING` |
| 請款金額能不能被竄改 | 嚴格比對 `amount === authorization.original_amount`，不接受任何容差或前端自報的覆寫值 |
| 新的一致性檢查（`manualRepaymentPostgresReady`）會不會讓人工重新請款用 postgres、但確認/取消還在 sqlite，造成兩邊資料不同步 | 這個檢查要求 `customerOrderWriteRepository` 也必須是 postgres，而既有的全面切換檢查已經把 `paymentAuthorizationConfirmRepository`／`paymentAuthorizationCancelRepository` 綁進同一組，不可能出現人工重新請款走 postgres、但確認／取消還在 sqlite 的分裂狀態 |
| `storeDirectoryReadRepository` 的 postgres 版本會不會洩漏比原本 SQLite 版本更多的欄位 | 回傳欄位（`id, name, address, phone, business_status, latitude, longitude`）跟既有 SQLite `listPublicStores()` 完全一致 |
| `isSqliteOrderDependentRoute` 這次的白名單異動，會不會不小心放行了還沒真正接上 postgres 的路由 | 這次只放行了確實已經完整改走 repository 的 `PATCH /api/orders/:orderId`；`POST /api/payments/line-pay/repay`（發起新的人工重新請款）內部還有 3 處未接上 repository 的直接呼叫，維持原本的擋停，沒有放行 |

**這次沒審查到的部分**：`POST /api/payments/line-pay/repay` 內部尚未接上 repository 的三處直接呼叫（已請款和解、建立新預授權、對帳排程）本身不在這次改動範圍內，維持原樣未動，等下一輪處理時再審查。

---

## 2026-08-20 — LINE Pay 對帳背景排程 PostgreSQL 支援（呼應上一筆「這次沒審查到的部分」）

**呼應**：同一天稍早那筆（PostgreSQL 遷移三個新切片）——那筆結尾明講「`POST /api/payments/line-pay/repay` 內部三處未接上 repository 的直接呼叫...等下一輪處理時再審查」，這筆就是那個下一輪
**範圍**：`backend/database/repositories/paymentReliabilityJobRepository.js`（新檔案，重用 `groupBuySettlementRepository.js` 已審查過的通用 job-queue 函式）、`backend/database/repositories/groupBuySettlementRepository.js`（新增匯出 `completePostgresSettlementJob`／`mapJob`，函式本身不變）、`backend/payments/reliabilityService.js`（整支改寫成接受注入 repository）、`backend/payments/linePayService.js`（`requestManualLinePayRepaymentUnlocked` 補上三個 repository 注入、`requestLinePayAuthorizationUnlocked` 移除舊有「postgres 模式下跳過排入對帳工作」的防呆）、`backend/server.js`（建構新 repository、路由改走 repository、新增一致性檢查、排程啟動條件改為動態判斷）
**觸發原因**：CLAUDE.md 規則自動觸發——這批動到付款確認/取消/請款的背景重試與人工重新請款發起流程，屬於高風險區域

### 發現

用一個 sub-task 找候選漏洞，人工複查每一個候選（未额外拆分平行 false-positive sub-task，因為兩個候選都已經用 grep／實際讀取程式碼直接證實為真，不是需要額外驗證才能判斷的推測性問題）：

| 嚴重度 | 位置 | 問題 | 建議修法 | 狀態 |
|--------|------|------|----------|------|
| 高 | `backend/server.js`（`POST /api/payments/line-pay/request` route） | 移除舊防呆（`if (kind !== "postgres") { enqueue }`）改成一律呼叫 `enqueuePendingAuthorizationReconciliation`，但這個主要付款請求路由的呼叫沒有把新的 `reliabilityJobRepository` 傳進去；沒收到就會走 `undefined ? ... : 直接呼叫 SQLite`的 fallback，等於所有主流程建立的授權，對帳保護工作都固定寫進 SQLite，就算全站已經切到 PostgreSQL 也一樣，而且不會有任何錯誤或警告 | 在該路由呼叫 `requestLinePayAuthorization({...})` 時比照 `/repay` 路由，補上 `reliabilityJobRepository` | 已修 |
| 中 | `backend/server.js`（新的 `reconciliationPostgresReady` 一致性檢查） | 原本的檢查只往一個方向驗證（`reliabilityJobRepository` 是 postgres、但其他三個不是才會擋），沒有驗證反過來的狀況：其他三個都切到 postgres、但忘記設定新的 `PAYMENT_RELIABILITY_JOB_RUNTIME`——這種情況伺服器會正常啟動，只是背景排程被靜默停用，沒有任何啟動錯誤提示 | 把觸發條件改成「四個裡面只要有任何一個是 postgres、但沒有全部都是 postgres」就擋停 | 已修 |

### 沒發現問題的部分（已交叉驗證）

| 面向 | 檢查結果 |
|------|----------|
| 對帳背景工作（沒有登入使用者、代表系統執行）會不會確認/請款/作廢到錯誤訂單、或金額被竄改 | job payload 裡的 `orderId`／`amount` 只用來查詢，實際寫入金額一律重新從資料庫查出的權威 context 取得，不採信 payload 裡的值 |
| 重用「團購結算」排程的通用 job-queue 函式，會不會讓不同 job_type 搶到／完成／重排到彼此的工作 | claim 用 `FOR UPDATE SKIP LOCKED` 且 `WHERE job_type = $1` 限定範圍；complete／reschedule 用 `id + locked_by = workerId` 精確鎖定單一列，`id` 是 claim 時產生的全域唯一值，不會跨 job_type 誤觸 |
| `paymentReliabilityJobRepository.js` 兩個新查詢（`listPostgresPendingLinePayAuthorizations`、`listPostgresPaymentReliabilityAlerts`）的 SQL injection | 全部走 `$1/$2/$3` 參數化 |
| 監控告警端點（`GET /api/admin/payment-reliability/alerts`）改走 repository 後，權限檢查有沒有被繞過 | admin 角色檢查邏輯完全沒動，只有資料來源從直接呼叫改成透過 repository |

**這次沒審查到的部分**：`confirmLinePayAuthorizationUnlocked` 裡處理訂單修改（revision）替換舊授權時呼叫 `voidLinePayAuthorization` 沒有傳入 `authorizationCancelRepository`，會一律走 SQLite——但這是這次改動之前就存在的既有程式碼（沒有被這次 diff 動到），不算這次改動新增的問題，記錄下來留給之後處理 revision 相關 PostgreSQL 支援時一併處理。

---

## 2026-08-20 — ECPay 核心付款流程 PostgreSQL 支援

**範圍**：`backend/database/repositories/ecpayAuthorizationRepository.js`（新檔案，含 `getLatestPostgresEcpayAuthorizationForOrder`、`createPostgresPendingEcpayAuthorization`、`withPostgresEcpayOperationLock`；請款/作廢/確認回跳的核心邏輯改為交叉重用既有 `paymentCaptureRepository.js`／`paymentAuthorizationCancelRepository.js`／`paymentAuthorizationConfirmRepository.js`／`paymentRefundRepository.js` 已審查過的函式）、`backend/payments/ecpayService.js`（`requestEcpayAuthorization`／`renderEcpayCheckoutRedirectHtml`／`handleEcpayReturnWebhook`／`captureEcpayAuthorization`／`voidEcpayAuthorization`／`withEcpayOperationLock` 改為接受並使用注入的 repository）、`backend/payments/settlementService.js`／`backend/payments/merchantActivityCancelService.js`（結算與商家取消團購呼叫 ECPay 請款/作廢時，新增三個相依 repository 是否同時切齊 postgres 的執行期防呆）、`backend/server.js`（建構新 repository、四個路由改走 repository、新增一致性檢查 `ecpayPostgresReady`、路由白名單新增 `client-back`／有條件放行 `request`／`checkout-redirect`／`return`）、`backend/database/repositories/paymentAuthorizationRequestRepository.js`（修正一個既有 LINE Pay Postgres 缺陷）、`backend/database/repositories/paymentRefundRepository.js`（新增匯出 `getLatestProviderEventPayloadPostgres`，函式本身不變）
**觸發原因**：CLAUDE.md 規則自動觸發——這批動到信用卡請款、作廢授權、webhook 確認回跳的核心付款邏輯，屬於高風險區域
**方法**：用一個 sub-task 找候選漏洞（給完整 diff、四個核心檔案全文、以及本次重用函式的來源檔案全文），該候選未額外拆分平行 false-positive sub-task驗證——因為候選本身已經透過直接讀取 `backend/db.js` 源頭邏輯、比對既有 LINE Pay Postgres 對應函式、寫一個能重現問題的 repository 層 regression test 三種方式交叉證實為真，不是需要額外驗證才能判斷的推測性問題

### 發現

| 嚴重度 | 位置 | 問題 | 建議修法 | 狀態 |
|--------|------|------|----------|------|
| 高 | `backend/database/repositories/ecpayAuthorizationRepository.js`（`createPostgresPendingEcpayAuthorization`） | 建立待確認授權時有對 `orders` 資料表下 `FOR UPDATE` 鎖，但鎖到之後沒有拿鎖到的 `original_amount` 跟請款金額比對，就直接把請款金額寫進新的 `payment_authorizations` 列——如果在「`ecpayService.js` 檢查金額」跟「這個交易真正鎖住訂單」中間，剛好有一次訂單編輯（`PATCH /api/orders/:orderId`）改了金額，就會留下一筆金額跟訂單當下實際金額不一致的授權紀錄；`backend/db.js` 的 SQLite 版本本來就沒有這個檢查（甚至訂單讀取根本不在交易內），但既有 LINE Pay Postgres 對應函式（`createPostgresPendingAuthorization`）確實有做這個檢查，這次新寫的 ECPay 版本一開始因為「忠實比照 SQLite 原始邏輯」而漏掉了 | 在拿到 `FOR UPDATE` 鎖之後、寫入前，比照既有 LINE Pay Postgres 版本補上金額比對，不符就回傳 `null`；呼叫方（`ecpayService.js`）原本收到 `null` 會靜默回傳「成功」但 `authorization: null`，一併補上明確的 409 錯誤，不管 SQLite 或 PostgreSQL 路徑都適用 | 已修，並新增 repository 層 regression test（`verifyPostgresCreatePendingAuthorizationRejectsStaleAmount`）覆蓋這個情境 |

### 沒發現問題的部分（已交叉驗證）

| 面向 | 檢查結果 |
|------|----------|
| 新 SQL 有沒有 SQL injection | `ecpayAuthorizationRepository.js` 全部新 SQL，以及這次重用的既有 Postgres 函式，全部走 `$1/$2...` 參數化，沒有字串拼接 |
| 訂單歸屬與角色檢查 | `requestEcpayAuthorizationUnlocked` 的 `order.customerUserId !== authUser.id && !admin` 檢查，SQLite／PostgreSQL 兩條路徑完全相同，沒有被這次改動弱化 |
| 請款／作廢／確認回跳會不會用錯 provider 或錯的授權列 | 重用的 `getPostgresAuthorizationContext`／`capturePostgresAuthorization`／`voidPostgresAuthorization` 一律用明確傳入的 `provider` 參數 + `FOR UPDATE` 精確鎖定，這次新增的 ECPay 呼叫方沒有弱化這些檢查 |
| `ECPAY_AUTHORIZATION_RUNTIME`／`PAYMENT_CAPTURE_RUNTIME`／`PAYMENT_AUTHORIZATION_CANCEL_RUNTIME` 三個獨立開關沒切齊時，會不會讓請款/作廢悄悄查到錯的 runtime、查無資料被當成沒事 | `server.js` 開機時擋停「`ecpayAuthorizationRepository` 是 postgres、但另外兩個不是」的組合；`settlementService.js`／`merchantActivityCancelService.js` 在每次實際呼叫請款/作廢前，另外重新核對三者是否同時為 postgres，沒有同時切齊就整批退回 SQLite（而不是只退回其中一兩個），逐一追過所有呼叫點沒有找到會悄悄查錯 runtime 的組合 |
| webhook（`handleEcpayReturnWebhook`）能不能被重放造成重複請款/授權 | `verifyEcpayCheckMacValue` 簽章驗證與重用的 `confirmPostgresAuthorization` 內建 `status !== 'pending'` 提早回傳（不是靠 idempotency key），兩層防護都沒有被這次改動動到 |
| 機密與硬式編碼憑證 | 沒有新增任何硬式編碼金鑰、密碼或簽章繞過 |

**這次額外發現、但不屬於本次 diff 範圍的既有問題**：`linePayService.js` 的 `requestLinePayAuthorizationUnlocked`（LINE Pay 主要請款流程本身）呼叫 `createPendingAuthorization` 後沒有檢查回傳是否為 `null`，跟這次修正前的 ECPay 版本是同一種缺口；同檔案的人工重新請款流程（`requestManualLinePayRepaymentUnlocked`）則已經有做這個檢查。這次沒有動 `linePayService.js` 的這段邏輯，記錄下來留給之後處理 LINE Pay 請款流程時一併評估是否要補上。

---

## 2026-08-20 — 三個已知缺口修正＋本機全面切換 PostgreSQL 過程中發現的問題

**呼應**：同一天稍早三筆記錄裡各自標記「待處理」的既有缺口——「改單替換舊授權未接上 PostgreSQL repository」「主要請款流程缺少建立失敗檢查」「管理員舊版取消團購工具資料不完整」，這筆是修正這三個
**範圍**：`backend/payments/linePayService.js`（`voidReplacedAuthorizationIfNeeded` 補上 `authorizationCancelRepository` 注入；`requestLinePayAuthorizationUnlocked` 對 `createPendingAuthorization` 回傳 `null` 補上明確錯誤）、`backend/payments/merchantActivityCancelService.js`（`cancelMerchantGroupBuyActivity` 的 `actionType` 改為可由呼叫方指定）、`backend/server.js`（管理員 `DELETE /api/admin/group-buy-activities/:id` 改為重用 `cancelMerchantGroupBuyActivity` 而非直接呼叫只改活動狀態的舊函式；回應改為轉發完整結果而非只回傳 `activity`）、`backend/database/repositories/paymentReliabilityJobRepository.js`／`manualLinePayRepaymentRepository.js`／`merchantGroupBuyActivityCancelRepository.js`（修正 `authorization` 這個 PostgreSQL 保留字被當作裸 SQL別名的問題）
**觸發原因**：CLAUDE.md 規則自動觸發——這批動到付款作廢、訂單取消層級的核心邏輯，屬於高風險區域；同時本機首次把 backend 所有 21 個 `*_RUNTIME` 開關一次切到 PostgreSQL 做完整驗證時，額外發現了下面幾個問題

### 發現（本次修正的既有缺口 + 這次改動本身的審查）

用一個 sub-task 找候選漏洞，人工複查每一個候選：

| 嚴重度 | 位置 | 問題 | 建議修法 | 狀態 |
|--------|------|------|----------|------|
| 中 | `backend/server.js`（管理員取消團購路由） | 改用 `cancelMerchantGroupBuyActivity` 後，回應只回傳 `{ activity: result.activity }`，把 `cancelledOrderIds`／`cancelledOrderCount`／`failedOrderIds` 都丟掉了——如果底下某張訂單的作廢呼叫失敗（例如 provider 端暫時打不通），活動本身還是會被標記取消，但管理員收到的回應是普通的 200，跟全部成功時看起來一模一樣，等於重新製造了一個範圍更小、但性質相同的「看起來成功、實際上資料沒對齊」問題 | 改成直接轉發 `cancelMerchantGroupBuyActivity` 的完整回傳結果 | 已修 |
| 中 | `backend/payments/merchantActivityCancelService.js`（`cancelMerchantGroupBuyActivity`，未修改既有邏輯，重新被管理員路由呼叫後才顯現） | 這個函式原本只給商家自助取消用，內建兩條商家專屬限制（活動必須是 `recruiting` 狀態；截止前 30 分鐘鎖定視窗）。管理員舊工具原本沒有這兩條限制、可以無條件取消。改用這個函式後，管理員取消團購也會被這兩條擋下來——已知且刻意接受的取捨：新行為換來的是正確的訂單/授權連動處理，舊行為（無條件改狀態、完全不處理訂單付款）本身就是這份記錄從一開始要修的問題根源，繼續保留「無條件」等於保留原本的資料不一致風險。沒有另外做管理員專屬的略過選項 | 目前維持這個限制，不做略過選項；如果之後確定管理員需要在非 `recruiting` 狀態或截止前 30 分鐘內強制取消，需要另外設計一個明確的管理員覆蓋機制（同時仍要跑訂單/授權連動），不是恢復舊的無條件行為 | 已記錄為已知取捨，未修改（刻意維持） |

### 過程中發現、不屬於這批程式改動本身、但同樣重要的基礎設施問題

這兩個不是「程式邏輯」的安全漏洞，是本機第一次把所有切片同時打開、對一個真的在跑的 PostgreSQL 執行時才會現形的問題，值得記錄避免以後重複踩到：

1. **`authorization` 是 PostgreSQL 保留字，不能當裸別名**：`SELECT authorization.id FROM payment_authorizations authorization` 這種寫法在真的 PostgreSQL 上會直接噴 `syntax error at or near "."`；先前這幾支查詢只被套過假的 mock 資料庫測試（只比對 SQL 文字，不會真的解析執行），從沒被真的 PostgreSQL 解析過，所以這個問題一直沒被抓到。影響到 `paymentReliabilityJobRepository.js`（`listPostgresPendingLinePayAuthorizations`）、`manualLinePayRepaymentRepository.js`（`getPostgresRepaymentContext`，改名 `original_payment_auth`）、`merchantGroupBuyActivityCancelRepository.js`（`listPostgresEligibleOrders`，改名 `payment_auth`）三支既有檔案裡的查詢，全部已改用不會撞保留字的別名並重新驗證通過。
2. **`005_order_rule_consents_postgres.sql` 從沒被真的套用到本機開發資料庫**：只有 migration runner 自己的獨立 smoke test（用完即丟的 throwaway schema）驗證過套用結果，`schema_migrations` 實際只記錄到 `004`。已執行 `npm run postgres:migrate` 補上。

### 驗證方式

- 修正後 `npm test` 59/59、既有 repository/service smoke test 全數重跑通過。
- 三個管理員取消路由的修正，直接對本機真實 PostgreSQL 16 用真實 HTTP 流程驗證：建立真的活動與訂單、模擬已授權付款、呼叫真的管理員取消 API、直接查資料庫確認訂單被取消、付款預授權被作廢、audit log 正確記錄 `admin_cancel_group_buy_activity`（先用真實 LINE Pay provider 驗證到「作廢呼叫真的有觸發、失敗時正確回報 `failedOrderIds`」；再用 `mock_line_pay` provider 驗證完整成功路徑）。
- 把本機 backend 全部 21 個 `*_RUNTIME` 開關切到 `postgres`，跑過完整寫入流程（建團、建單、LINE Pay 請款、商家菜單、改單）與既有 `*-postgres-http-smoke` 系列，過程中資料庫內容執行前後一致，測試資料均已清除。

**這次沒完全查清楚、記錄下來的觀察**：測試過程中曾在一次 LINE Pay 作廢呼叫失敗（provider 回傳「Transaction record not found」，這是測試手法本身的產物——手動把訂單狀態直接改成已授權、沒有真的走過 LINE Pay confirm）時，看到一次 `pg` 套件的 deprecation warning：「Calling client.query() when the client is already executing a query」。後續重跑同樣情境與大量其他測試都沒有再出現，懷疑是跟背景對帳排程（每 15 秒一次）在時間點上的巧合，還沒有辦法穩定重現、也還沒找到確切原因。目前是 deprecation warning、不是硬性錯誤，但未來 `pg` 主版本升級後可能變成真的錯誤，值得之後有人重現時再深入排查。

**後續補充（同日）**：原本驗證完把 `backend/.env` 切回 SQLite；使用者確認要把本機開發環境永久改成跑在 PostgreSQL 上。永久切換前，找出 `backend/.env` 是全域生效（透過 `backend/auth.js` 的 `loadLocalEnv`，任何間接用到登入相關程式碼的獨立腳本都會載入，不只 backend 伺服器本身），逐一檢查所有用 `sqliteGateway` 建構 repository 的獨立測試腳本（11 支），確認只有 `scripts/merchant-activity-cancel-service-smoke.js` 沒有明確用 `env: {}` 隔離、會被悄悄導去查真實 PostgreSQL（其餘 10 支本來就已經隔離），已修正並重新驗證。這不是這次改動本身新增的安全漏洞（純粹是測試環境隔離問題，不影響正式程式邏輯），記錄在這裡是為了跟上面同一批工作的脈絡銜接完整。永久切換後，`npm test` 與全部相關 smoke test／HTTP proof 已重新驗證通過。

---

## 2026-08-15 — dev-only 全域業務時間與付款／取餐時限串接

**範圍**：`backend/time/businessClock.js`、`backend/server.js`、`backend/db.js`、`backend/payments/linePayService.js`、`backend/payments/settlementService.js`、`backend/pickup/credentialService.js`、`backend/pickup/expirationService.js`、受影響 activity/order repositories，以及本機 `local-dev-console/` 修改入口
**觸發原因**：全域規則自動觸發——本次改動會影響授權確認、截止結算與取餐逾期的時間判斷
**方法**：讀完整本次 diff 與業務時鐘全文，追查 API 修改權限、付款 provider 呼叫與資料庫確認、scheduler、operation lock、取餐碼 rate limit 的時間來源；另執行單元測試與獨立 Backend HTTP smoke

### 發現

| 嚴重度 | 位置 | 問題 | 建議修法 | 狀態 |
|--------|------|------|----------|------|
| 中 | `backend/payments/settlementService.js:30`、`backend/pickup/credentialService.js:13` | 初版串接讓 operation lease 跟著模擬時間；固定時間可能讓鎖無法正常逾時，切換時間也可能扭曲併發保護 | 業務期限使用 business time，但鎖的建立／到期一律保留真實時間 | 已修 |
| 中 | `backend/pickup/credentialService.js:288` | 初版讓取餐碼失敗次數視窗跟著模擬時間；倒退或固定時間可能延長／繞過限流視窗 | rate limit 獨立使用真實時間，只讓憑證有效期與核銷業務時間使用模擬值 | 已修 |
| 低 | `local-dev-console/server.js:315` | 僅靠 loopback 仍可能讓其他網頁從使用者瀏覽器跨來源呼叫本機控制台修改時間 | mutation 檢查 `Origin`，只接受本機控制台同來源；Backend PUT 同時維持 dev gate 與 loopback 限制 | 已修 |

### 沒發現問題的部分（已交叉驗證）

| 面向 | 檢查結果 |
|------|----------|
| Production 暴露 | route 只有非 production 且 `AUTH_DEV_MODE=true` 時存在；`PUT` 另要求 Backend 主機 loopback，production 即使傳入 payload 也不能修改 clock |
| 輸入與資源濫用 | mode 使用白名單；offset 必須為整數；offset／fixed 都限制在真實伺服器時間前後 7 天；狀態只存在記憶體且重啟恢復 |
| 帳號與權限 | 沒有修改 Firebase UID、`user_roles`、merchant permission 或 bearer token 驗證；Mobile 只有 GET，沒有時間修改 API |
| 金額竄改 | 沒有更動訂單／付款金額計算；授權確認仍使用 Backend 資料庫金額，client 無法用時間 payload 帶入金額 |
| Provider 機密與簽章 | 沒有記錄 API key、secret 或完整 provider payload；Firebase、token、LINE Pay／ECPay request、簽章與 webhook clock 未改用 business time |
| 非預期直接扣款 | `PUT /api/dev/business-time` 只更新記憶體狀態，不直接呼叫 capture／void；排程只會在原本下一次 interval 依新時間檢查，production capture guard 維持不變 |
| 資料注入 | 新 endpoint 不建立 SQL 字串；既有資料庫操作仍使用原來的參數化查詢，時間值由 Backend 產生並經 ISO 正規化 |

**驗證限制**：這次沒有呼叫真實 LINE Pay／ECPay 網路，也沒有執行會重建開發 SQLite 的付款 smoke；只驗證業務時鐘單元行為、Backend route 切換／還原與程式串接。真實 provider E2E 結論仍以既有 checklist 為準。

---

## 2026-08-15 — 顧客／商家付款狀態顯示文案分離

**範圍**：`mobile/src/types/prototypeTypes.js`、`mobile/src/components/StatusBadge.jsx`、`mobile/src/screens/GroupProgressScreen.jsx`、`mobile/src/screens/MerchantDashboardScreen.jsx`、`mobile/tests/paymentStatusLabels.test.mjs`
**觸發原因**：金流相關 Mobile 顯示修改，依專案規則完成後進行聚焦安全複查
**方法**：讀取完整付款文案 diff，確認狀態來源、顧客／商家 owner 選擇、顯示色彩與測試；交叉確認沒有改動 Backend、付款金額、provider 呼叫或權限判斷

### 發現

沒有發現安全問題。

### 沒發現問題的部分

| 面向 | 檢查結果 |
|------|----------|
| 金額竄改 | 只修改狀態 label 與呈現色彩，沒有改動 `originalAmount`、`authorizedAmount`、`captureAmount` 或折扣計算 |
| 狀態竄改 | `authorized`／`captured`／`failed` 等資料仍來自既有 Backend／Mobile state；沒有新增 client-side 狀態轉移或把顯示文案回寫後端 |
| 身份與授權 | 顧客／商家差異由畫面既有 owner 選擇決定，沒有修改登入、角色解析、商家店家權限或 API 存取控制 |
| 機密與資料外洩 | 新增測試只讀取靜態文案模組，不讀取 `.env`、token、交易編號或顧客資料 |
| 程式碼執行 | 測試透過本機既有靜態來源建立 ESM data URL，不接受使用者輸入，也不執行外部或下載內容 |

**驗證限制**：`npm test` 42 項與 Mobile 語法解析已通過；尚未在 Android 顧客／商家實際畫面人工確認排版，因此 UI E2E 仍列為待處理。

---

## 2026-08-15 — LINE Pay 付款前取餐／逾期未取規則同意

**範圍**：`backend/payments/orderRuleConsent.js`、`backend/payments/linePayService.js`、`backend/database/repositories/paymentAuthorizationRequestRepository.js`、`backend/db.js`、`backend/server.js`、`database/schema.sql`、`database/migrations/005_order_rule_consents_postgres.sql`、`mobile/src/screens/PaymentAuthorizationScreen.jsx`、`mobile/src/utils/apiClient.js` 與本次同意流程測試
**觸發原因**：付款前同意證據與 LINE Pay request gate 屬金流／身份驗證相關改動，依專案規則完成聚焦安全複查
**方法**：讀取本次完整同意流程與其呼叫的付款 request、SQLite／PostgreSQL persistence、Mobile 送出路徑；檢查注入、身份／授權、金額竄改、規則內容竄改、機密與 provider 呼叫順序；另執行單元、SQLite 完整性、repository smoke、SQL safety 與 Mobile Babel 解析

### 發現與修正

| 嚴重度 | 位置 | 問題 | 修正 | 狀態 |
|--------|------|------|------|------|
| 中 | `mobile/src/screens/PaymentAuthorizationScreen.jsx` | 既有「模擬預授權成功」按鈕可以只改 Mobile local state，不經 Backend 保存同意證據，畫面會看似已授權 | 移除 pending 狀態的本機模擬授權入口；付款只能走 Backend LINE Pay request gate | 已修 |

修正後沒有發現其他達門檻的安全問題。

### 沒發現問題的部分

| 面向 | 檢查結果 |
|------|----------|
| 身份與授權 | LINE Pay request 仍要求 bearer token，並改為只允許 `orders.customer_user_id === authUser.id`；管理員不能代顧客建立同意紀錄，測試已證明 403 且 provider 不會被呼叫 |
| 規則與時間竄改 | Client 只提交 `accepted`、`ruleType`、`ruleVersion`；Backend 驗證現行版本，保存自己的完整規則全文與真實伺服器 UTC 時間，不接受 Client 的全文、帳號或時間，也不使用 dev 模擬業務時間 |
| SQL 注入與跨訂單寫入 | SQLite 與 PostgreSQL 均使用參數化 SQL；`INSERT ... SELECT` 從訂單列取得真正的 `customer_user_id`，並以 order ID + owner 條件限制，沒有字串拼接或由 Client 指定證據歸屬 |
| Append-only／重試 | `(order_id, rule_type, rule_version)` 唯一鍵配合 conflict-ignore，重試會讀回第一筆紀錄，不覆寫同意時間或內容；服務還會比對讀回的 owner、版本與全文，不一致即停止付款 |
| Provider 呼叫順序 | 缺少同意、版本過期、保存失敗或 owner 不符都在 `requestLinePayPayment` 前終止；測試以注入的 provider 函式確認不會被呼叫 |
| 金額竄改 | 同意 gate 沒有改動金額來源；既有 `order.originalAmount === Number(body.amount)` 與 pending authorization repository 再驗證仍保留 |
| 機密與資料外洩 | 公開規則 API 只回傳規則類型、版本、標題與全文，不回傳訂單、帳號、Firebase UID、token 或 provider 機密；同意錯誤也不包含機密 |

**驗證限制**：`npm test` 48 項、`payment-authorization-request:smoke`、`check:sql-safety`、SQLite `integrity_check`／`foreign_key_check` 與 Mobile Babel 解析已通過；PostgreSQL `005` 只驗證 runner 排序與 repository SQL smoke，未對 live PostgreSQL 套用 migration；尚未執行 Android 長文排版與 LINE Pay sandbox 人工 E2E。ECPay UI 目前隱藏且未套用本次同意 gate，因此不列為已完成。

---

## 2026-08-15 — Provider 告警驗證與顧客最終結算快照顯示

**範圍**：`backend/payments/reliabilityService.js`、`backend/database/repositories/groupBuyActivityReadRepository.js`、`backend/db.js`、`mobile/src/navigation/AppNavigator.js`、`mobile/src/utils/groupBuyActivityProgress.js`、`mobile/src/screens/GroupProgressScreen.jsx` 與本次新增／更新的測試
**觸發原因**：可靠性告警屬付款維運範圍，最終結算畫面會呈現顧客實際應付金額，依專案規則完成聚焦安全複查
**方法**：讀取本次 diff 與活動結算、顧客訂單讀取及 Mobile 正規化路徑；檢查 SQL 注入、身份／授權、金額竄改、機密與公開資料、錯誤日誌內容；執行單元測試、PostgreSQL read repository smoke、SQL safety、SQLite 唯讀完整性檢查、Mobile Babel 解析與 Web export

### 發現

沒有發現安全問題。

### 沒發現問題的部分

| 面向 | 檢查結果 |
|------|----------|
| 金額權威來源 | 顧客「實際應付」只讀取 Backend 訂單 `finalAmount`；Mobile 只計算原價與最終金額的顯示差額，不把任何顯示值回寫 Backend，也沒有改動 capture／void／refund 狀態轉移 |
| 最終狀態判斷 | Mobile 只有收到 Backend 已保存的 `settlement` 才顯示最終結果；單純由裝置判斷已截止不會自行宣告成團或最終折扣 |
| SQL 注入 | PostgreSQL settlement 讀取使用固定 SQL，沒有把 query、帳號、活動 ID 或其他外部輸入拼入 SQL；本次沒有新增資料庫寫入 |
| 身份與授權 | 沒有更動 Firebase、bearer token、角色解析、商家店家權限或付款 route；`GET /api/group-buy-activities` 維持原本公開讀取性質 |
| 公開資料與機密 | 新增的 `settlement` 只包含活動層級的杯數、折扣分配、尾差、版本與結算時間，不含顧客帳號、Firebase UID、付款交易編號、token 或 provider 金鑰；顧客訂單金額仍由既有受保護訂單 API 取得 |
| 告警內容 | 本次只把既有 `logAlertRequiredJobs` 列入可測介面並驗證篩選行為，沒有擴張日誌欄位；告警仍只輸出工作識別、狀態、次數與既有序列化錯誤，不輸出環境憑證 |
| 數值邊界 | Mobile 顯示 helper 只接受非負整數；缺少或不合法的訂單最終金額顯示為待同步，不用預設 0 偽裝成已結算金額 |

---

## 2026-08-22 — 新增管理員網頁後台（`/admin`）

**範圍**：`backend/server.js` 新增的 `/admin`、`/admin/login`、`/admin/logout`、`/admin/group-buy-activities/:id/cancel`、`/admin/refund-requests`、`/admin/refund-requests/:id/approve`、`/admin/refund-requests/:id/reject` 路由與相關 helper 函式（`getAdminWebUser`、`requireAdminWebUser`、`verifyAdminWebPassword`、`buildAdminCsrfToken`、`verifyAdminCsrfToken`、`buildAdminSessionCookie` 等）；`backend/auth.js` 的既有 `createAuthToken`／`verifyAuthToken` 未改動，只是被新入口重用。Mobile 端同時移除 `AdminDashboardScreen.jsx`、`AdminRefundRequestsScreen.jsx` 與相關 API client 函式，純刪除不影響本次安全範圍。
**觸發原因**：使用者要求把管理員功能從手機 App 移到獨立網頁後台；改動涉及退款核准（金流）與新的登入/session 機制，依規則主動觸發

### 發現

| 嚴重度 | 位置 | 問題 | 建議修法 | 狀態 |
|--------|------|------|------|------|
| 中 | `backend/server.js`（`buildAdminSessionCookie`／`buildAdminSessionClearCookie`） | 新的 admin session cookie 一開始沒有加 `Secure` 屬性；這個 cookie 帶的是跟既有 JSON admin API 共用的同一把簽章 token，若未來透過非 HTTPS 存取（例如內部 staging 網址、被 SSL-strip），有被網路中間人攔截並重放取得完整管理員權限的風險。信心度 7/10（在正式環境用 TLS 部署時風險才成立，本機開發本來就是明文 HTTP） | 加上 `Secure`，比照檔案裡既有的 `NODE_ENV === "production"` 條件式寫法，本機開發維持可用、正式環境自動加固 | 已修（當下就修，`adminCookieSecureAttribute()`） |

### 沒發現問題的部分（已交叉驗證）

| 面向 | 檢查結果 |
|------|----------|
| XSS | 新的 admin HTML 頁面裡，所有外部可控字串（活動標題、店名、取消原因、退款店家/訂單 ID/申請原因/駁回原因、從 query string 讀出的 flash 訊息、登入錯誤訊息、CSRF token 本身）都有經過既有 `escapeHtml()` 才插進 HTML；沒有插值的只有數字（杯數、人數）跟已經 `encodeURIComponent()` 處理過、用在雙引號屬性裡的 ID |
| CSRF | 所有會改資料的表單（取消團購、核准/駁回退款）都要求一次性 CSRF token，token 是 `HMAC-SHA256(sessionToken, AUTH_SESSION_SECRET)`，沒有 cookie 就算不出來；沒帶或帶錯 token 一律 403，已用真實 HTTP 請求驗證擋下 |
| 認證繞過 | `/admin/login` 用 `crypto.timingSafeEqual` 做固定時間密碼比對，沒有預設密碼／空密碼可以繞過的路徑；`ADMIN_WEB_PASSWORD` 沒設定時直接判定密碼錯誤，不會意外開放 |
| 授權 | 每個受保護路由都先呼叫 `requireAdminWebUser` guard，session 解出來的 user 一定要 `roles.includes("admin")` 才算數；沒有其他角色可以誤觸這些路由 |
| 業務邏輯是否被繞過 | 取消團購／核准退款／駁回退款都直接重用既有 `cancelMerchantGroupBuyActivity`／`approveRefundRequest`／`rejectRefundRequest`，完全沒有另外寫一套簡化版邏輯；連 Postgres/SQLite 執行模式一致性 boot-time 檢查（`isSqliteOrderDependentRoute`／`isSettlementRouteReadyForPostgres`）都特地把新路由納入同一個既有 gate，不會繞過 |
| SQL injection | 本次沒有新增或修改任何 SQL 查詢，新路由都是呼叫既有 repository／service 函式 |
| Session 固定攻擊 | 每次登入都重新 `createAuthToken`，沒有讓 client 指定或延用舊 token 的路徑 |

**驗證方式**：以真實 HTTP 請求（非模擬）驗證登入成功／密碼錯誤／未登入導向登入頁／CSRF 缺失回 403／CSRF 正確但目標不存在回傳正確錯誤訊息／登出清除 cookie；未對真實資料觸發一次成功的取消或退款核准（避免動到開發資料庫裡的真實資料）。`npm test` 69/69 全數通過（未改動任何被測邏輯）。

---

## 2026-08-22（同日追加）— 呼應上一筆：`/code-review` 發現的修復

**範圍**：對同一批 `/admin` 網頁後台程式碼做的後續修改，回應 `/code-review`（xhigh 強度，10 個角度）找到的 15 個問題裡跟這份安全記錄相關的幾項：把 `verifyAdminWebPassword`／`verifyAdminCsrfToken` 改成呼叫 `backend/auth.js` 新匯出的 `safeEqual()`（不再各自重複寫一份 timing-safe 比對）；把 `getAdminWebUser` 改成呼叫新的共用 `getUserFromToken()`（跟既有 `getAuthenticatedUser` 共用同一套 token 解析邏輯）；`POST /admin/login` 改成直接 `getById(ADMIN_WEB_USER_ID)` 查詢，不再呼叫只該給開發模式身份切換器用的 `listDevUsers()`；把三個會改資料的表單（取消團購、核准／駁回退款）的 CSRF 檢查抽成共用的 `readCsrfVerifiedAdminFormBody()`；把 `GET /admin/refund-requests` 補進原本漏掉的 PostgreSQL 執行模式一致性檢查（`isSqliteOrderDependentRoute`／`isSettlementRouteReadyForPostgres`）；這個檢查若觸發，`/admin/*` 路徑現在會回傳有樣式的 HTML 錯誤頁，不再是沒有樣式的原始 JSON。
**確認是否解決**：這批修改全部是重構（保留原本行為，只是把重複的邏輯抽成共用函式）或是「新增檢查/新增資訊揭露」（例如把原本悄悄吞掉的訂單取消失敗清單顯示出來），沒有任何一項是放寬權限、放寬驗證或縮小檢查範圍——已用真實 HTTP 請求重新驗證登入、CSRF 拒絕、cancel 對不存在活動回傳翻譯過的中文錯誤訊息（而非原始英文代碼）、refund reject 對不存在申請回傳正確錯誤訊息、登出流程都正常，`npm test` 70/70（含新增的跨午夜取餐時間標籤測試）全數通過。判定：上一筆記錄的所有發現都已解決，不需要另外開一輪完整安全審查。

**驗證限制**：`npm test` 53 項、`group-buy-activity-read:smoke`、`check:sql-safety`、SQLite `integrity_check`／`foreign_key_check`、Mobile Babel 解析與 Web export 已通過；沒有呼叫真實 LINE Pay／ECPay、沒有對 live PostgreSQL 執行 migration，也尚未由使用者在 Android 模擬器人工確認最終結算卡片排版。

---

## 2026-08-23 — 管理員網頁後台改為支援多組密碼

**範圍**：`backend/server.js` 的 `verifyAdminWebPassword`；`backend/.env` 的 `ADMIN_WEB_PASSWORD`（單一密碼）改名為 `ADMIN_WEB_PASSWORDS`（逗號分隔的多組密碼）
**觸發原因**：使用者要求把單一密碼換掉，並新增 3 組密碼供不同人使用（共 4 組）

### 發現

沒有找到信心度達到門檻（8/10 以上）的漏洞。

### 沒發現問題的部分

| 面向 | 檢查結果 |
|------|----------|
| 比對方式 | 每組密碼都用既有的 `safeEqual()`（timing-safe）逐一比對，用 `reduce` 而非 `.some()`——即使某一組提早比對成功，後面的組別還是會照樣比對完，避免比對次數／時間差洩漏「submit 的密碼命中第幾組」這種側channel 資訊 |
| 密碼強度 | 4 組密碼都是使用者自訂、非本工具產生，強度判斷交由使用者自行負責；沒有把任何一組寫死在程式碼裡（只在 `backend/.env`，不進 git） |
| 身份模型 | 4 組密碼都對應同一個管理員身份（`user-admin-001`），沒有因為多組密碼而分裂出多個身份或多套權限，audit log 仍然是同一個 `actorUserId`，沒有新增稽核缺口 |
| 舊密碼失效 | 舊的單一密碼 `UGznhaQHBr0W` 已從設定檔移除，改用真實 HTTP 請求驗證確認舊密碼跟隨意亂猜的密碼一樣會被拒絕（`error=1`），4 組新密碼各自都能成功登入 |

**驗證方式**：以真實 HTTP 請求驗證 4 組新密碼皆可登入、舊密碼與亂猜密碼皆被拒絕。`npm test` 70/70 全數通過（未改動任何被測邏輯）。

---

## 2026-08-24 — 本機測試控制台併入 /admin 登入、個人中心新增真正的登出

**範圍**：`backend/server.js`（`/dev-console/*` route gate、`buildAdminSessionCookie`／`buildAdminSessionClearCookie` 的 cookie Path）；`mobile/src/navigation/AppNavigator.js`（新增 `navigation.logout()`）；新檔 `mobile/src/screens/ProfileScreen.jsx`；`mobile/src/screens/RoleSelectScreen.jsx`（登入後把完整 user 物件往下傳）
**觸發原因**：使用者要求「本機測試控制台是後台的一部分，進入要密碼」，把原本只靠 loopback 限制、不需要密碼的 `/dev-console` 併入 `/admin` 的登入狀態；順帶把個人中心的「登出」從假登出（只是換畫面）改成真的清掉登入憑證

### 發現

| 嚴重度 | 位置 | 問題 | 建議修法 | 狀態 |
|--------|------|------|----------|------|
| 中 | `mobile/src/navigation/AppNavigator.js`（新增的 `logout()`） | `logout()` 原本只清掉 token／角色／會員資料，沒清本機快取的 `orders`／`cartItems`／`paymentAuthorizations`；這些資料用一個只有 4 筆對照的固定表（`RoleSelectScreen.jsx` 的 `backendCustomerToPrototypeCustomer`）分桶，任何不在表裡的真實帳號都會落到同一個 fallback 桶（`"customer-yinji"`）。同一台裝置上，A 登出後 B 用不同真實帳號登入，會看到 A 留下的購物車與訂單/付款紀錄 | 在 `logout()` 裡一併清空 `orders`／`cartItems`／`paymentAuthorizations` 並重設 `selectedCustomerId`／`selectedMerchantStoreId` 為預設值 | 已修 |

### 沒發現問題的部分

| 面向 | 檢查結果 |
|------|----------|
| `/dev-console` 存取控制完整性 | 逐一核對 `/dev-console` 區塊裡的每一條 route（頁面、靜態檔、`api/status`、`api/accounts`、`api/business-time` GET/PUT、`api/config` GET/PUT、`api/config/reset`、`api/events`），全部落在新加的 `requireAdminWebUser` 檢查之後，沒有漏掉任何一條 |
| App 呼叫路徑沒被誤鎖 | Mobile App 本身直接呼叫的 `GET /dev-console/api/app/config`／`POST /dev-console/api/app/report`（`mobile/src/utils/devLocationControl.js`）刻意排除在新的密碼檢查之外，仍只靠原本的 loopback + `AUTH_DEV_MODE` 把關；用不帶任何 cookie 的 `curl` 實測仍回 200，人看的頁面／控制 API 在同樣條件下正確被導去登入頁 |
| Cookie Path 放寬（`/admin` → `/`） | `HttpOnly`／`SameSite=Lax`／正式環境的 `Secure` 屬性都沒變；確認 `parseCookies(request)[ADMIN_SESSION_COOKIE_NAME]` 只在 `/admin/*` 跟 `/dev-console/*` 這兩處被讀取，其他路由不會意外因為 cookie 送達範圍變大而多長出新的攻擊面 |
| 兩支例外路由本身的資料外洩風險 | `api/app/config`／`api/app/report` 讓同機任何呼叫者可讀寫別的測試帳號模擬定位，但這個能力併入前就已存在（僅限本機 + 開發模式），這次沒有擴大 |
| `ProfileScreen.jsx` 資料範圍 | 只顯示 `currentUserProfile` 這個 prop 本身帶的資料（登入當下後端已回傳、屬於目前登入者自己），沒有另外呼叫任何 API 或顯示其他角色/其他使用者的資料 |

**驗證方式**：以真實 HTTP 請求驗證：`/admin` 未登入導向登入頁、登入後 `/dev-console` 頁面與帳號列表可直接開啟（同一顆 session cookie）、`api/app/config` 全程不帶 cookie 仍回 200、`api/accounts` 不帶 cookie 回 302 導向登入頁。Web 預覽走過完整流程：登入 → 個人中心顯示真實資料 → 登出 → 回到登入畫面，且登出後本機快取的訂單／購物車／付款紀錄狀態確認已重設。

---

## 2026-08-24（同日追加）— 正式告警通知管道（ALERT_WEBHOOK_URL）

**範圍**：新檔 `backend/payments/alertNotifier.js`；呼叫端 `backend/payments/reliabilityService.js`（`logAlertRequiredJobs`、reconciliation scheduler 的頂層 catch）、`backend/payments/settlementService.js`（settlement scheduler 的 per-job alert 迴圈與頂層 catch）
**觸發原因**：呼應 `docs/AI-security-review-log.md` 之前一筆與 `PROGRESS.md` 都記錄過的「正式告警通知管道 [待處理]」——原本付款背景工作失敗只寫進伺服器本機的結構化 log，這次補上一個可設定的外部 webhook，讓失敗能主動推播出去

### 發現

| 嚴重度 | 位置 | 問題 | 建議修法 | 狀態 |
|--------|------|------|----------|------|
| 中 | `backend/payments/settlementService.js`（`runDueGroupBuySettlementJobs` 把整個 `result` 存成 job 的 `lastError`，含 `plan.orders`／`results`／`failures` 三個陣列） | 結算排程失敗時，`job.lastError` 帶的是**整個團購活動所有訂單**的明細（每筆訂單的 `customerUserId`、`providerTransactionId`、金額），跟 LINE Pay 對帳排程刻意精簡過的 `{message, linePayPayload}` 不一樣。這份完整明細被原封不動送進 `sendPaymentReliabilityJobAlert`，等於把一整批顧客與金流識別碼從「只存在伺服器本機」擴大到「送到操作員自己接的外部 webhook（Slack／Discord 之類）」，範圍比原本只寫本機 log 大很多 | 在 `alertNotifier.js` 送出前先摘要化：拿掉 `plan`／`results`／`failures` 這三個陣列本身，只保留筆數（`orderCount`／`resultCount`／`failureCount`），其餘欄位（`error` 代碼等）照舊送出 | 已修 |

### 沒發現問題的部分

| 面向 | 檢查結果 |
|------|----------|
| 是否外洩密鑰／憑證 | 追過 `linePayClient.js`／`ecpayClient.js` 的錯誤物件組成，`lastError`／`linePayPayload` 只會帶 provider 回傳的代碼／訊息，從沒帶過 channel secret、HashKey/HashIV、bearer token 這類機密 |
| `ALERT_WEBHOOK_URL` 本身是否可被外部操控 | 純粹讀 `backend/.env`，跟使用者輸入無關；依既有審查慣例，環境變數視為受信任設定，不算攻擊面 |
| Webhook 呼叫是否會反過來影響金流邏輯 | `postAlertWebhook` 的回傳值只用在自己的 log／回傳結果，沒有被拿去判斷任何工作是否算完成、是否要重試——webhook 掛掉或回應異常不會讓真正的付款/結算判斷跟著錯 |
| 未設定時的行為 | `ALERT_WEBHOOK_URL` 沒設就完全不呼叫 `fetch`，`npm test`／sandbox 環境不會意外對外發送任何請求 |

**驗證方式**：新增 7 個單元測試（未設定時不呼叫、成功送出、webhook 回應非 2xx、webhook 連線失敗、排程層級失敗、以及這次修復的「settlement 明細被摘要化、顧客 ID／交易序號不再出現在送出內容裡」），與既有測試共 77/77 全數通過；重新啟動 backend 確認模組正常載入、排程照常啟動。

---

## 2026-08-26 — ECPay webhook 可被用來偽造「已付款」訂單，新增後端總開關

**範圍**：`backend/payments/ecpayService.js`（`handleEcpayReturnWebhook`，唯讀調查，本次未修改）、`backend/payments/ecpayClient.js`（`getEcpayConfig`／`verifyEcpayCheckMacValue`，唯讀調查，本次未修改）、`backend/server.js`（新增 `isEcpayEnabled()`，四支 ECPay 路由 `/api/payments/ecpay/request`／`checkout-redirect`／`return`／`client-back` 加上總開關擋門）、`.env.example`（新增 `ECPAY_ENABLED=false` 說明）
**觸發原因**：使用者直接提問「檢查是否能透過未完成的 ecpay 漏洞去動到訂單」，非 CLAUDE.md 規則自動觸發，屬於手動要求的調查
**呼應**：2026-08-20 那筆審查過 ECPay 的 Postgres 支援，範圍是「webhook 會不會被重放造成重複請款/授權」並確認沒問題；這次發現的是兩個不同的問題（見下），2026-08-20 的結論不受影響、也沒有被推翻，只是那次審查範圍沒有涵蓋到這兩點

### 發現

| 嚴重度 | 位置 | 問題 | 建議修法 | 狀態 |
|--------|------|------|----------|------|
| 高 | `backend/payments/ecpayService.js:209`（`handleEcpayReturnWebhook`） | 只驗證 `CheckMacValue` 簽章是否合法，從未檢查 ECPay 真正代表付款結果的 `RtnCode` 欄位，簽章一過就無條件呼叫 `authorizeAuthorization` 把訂單標記為已付款；往下追過 `backend/db.js`（`authorizeLinePayPaymentInDatabase`）與 Postgres 版 `confirmPostgresAuthorization` 兩條路徑，皆沒有任何地方檢查過 `RtnCode`。顧客只要在 ECPay 真實頁面上讓卡片刷卡失敗，ECPay 仍會送出一個「簽章正確、內容為失敗」的通知，系統會誤判為付款成功——不需要偽造任何東西，走真實 ECPay 流程即可觸發 | 在 `authorizeAuthorization` 之前，額外檢查 `formFields.RtnCode === "1"`，非成功一律回傳失敗、不得呼叫任何會改動訂單狀態的函式 | 待處理（本次先用下面的總開關擋住整條路徑，尚未修這個檢查本身） |
| 高 | `backend/payments/ecpayClient.js:17-30`（`getEcpayConfig`） | `ECPAY_ENV` 沒有明確設成 `"production"` 時預設為 `"stage"`，此時 `hashKey`／`hashIv` 會 fallback 成 ECPay 官方開發者文件公開發布的測試密鑰（`STAGE_HASH_KEY`／`STAGE_HASH_IV`），任何人都查得到、算得出合法的 `CheckMacValue`。已核對目前 `backend/.env` 實際設定確實是 `ECPAY_ENV=stage` 且未另外設定 `ECPAY_HASH_KEY`／`ECPAY_HASH_IV`，符合觸發條件；`ECPAY_RETURN_URL` 也設成一個公開的 Cloudflare tunnel 網址，代表這條路徑理論上可被公開存取。攻擊者需先合法擁有一筆自己訂單的待付款 ECPay 授權（`/request` 本身有做歸屬與金額檢查，無法幫別人的訂單建立），之後可完全跳過 ECPay 頁面，直接偽造簽章正確的 POST 打到 `/return`，讓自己的訂單被標記為已付款 | 正式環境要求 `ECPAY_ENV` 必須明確設定且不得預設 fallback 到 stage 金鑰；或至少在 `assertEcpayConfig` 加上「正式環境偵測到仍在使用已知的公開 stage 金鑰」時直接拒絕啟動 | 待處理（本次先用下面的總開關擋住整條路徑，尚未修這個 fallback 本身） |

### 已完成的緩解措施（本次實際改動）

上面兩個問題都還沒有直接修正核心邏輯，但確認：手機 App 隱藏 ECPay 付款入口（`PROGRESS.md`）**沒有**同步在後端擋掉這幾支路由，直接用 HTTP 呼叫完全打得到，等於「藏起來」目前沒有提供實際防護。考量 ECPay 業務上已經是「備援、暫緩」優先度，且要正確修好上面兩個問題還需要重新過一次完整的 ECPay 端對端測試，這次先加一個後端總開關：新增 `isEcpayEnabled()`（讀取 `ECPAY_ENABLED`，預設 `false`），四支路由（`request`／`checkout-redirect`／`return`／`client-back`）在最前面就擋下，未經明確設定 `ECPAY_ENABLED=true` 一律回傳「暫停使用」，不會呼叫任何會讀寫訂單的邏輯。

### 沒發現問題的部分

| 面向 | 檢查結果 |
|------|----------|
| 金額能否被偽造 | `handleEcpayReturnWebhook` 用的是資料庫裡既有 `pendingAuthorization.originalAmount`，不是採信偽造請求裡的金額欄位，所以上面的漏洞只能讓「已存在、金額正確」的待付款授權變成已付款，無法無中生有偽造任意金額的訂單 |
| 新開關本身是否引入新的注入或資料外洩 | `isEcpayEnabled()` 只讀取受信任的環境變數；四處新增的 503 回應重用既有 `buildLinePayResultPage`／`buildLinePayAppReturnUrl`／`toSafeScriptString`，跟原本程式碼路徑用的是同一套跳脫邏輯，`orderId` 沒有新的資料流向 |
| 新開關是否弱化任何既有檢查 | 四個新增的 `if (!isEcpayEnabled())` 都是最先執行、且只會讓路由回應「停用」提早結束，不會略過或改動後面任何既有的驗證邏輯 |

**驗證限制**：本次是唯讀調查加上一個純粹「提早擋門」的開關，沒有實際呼叫真實 ECPay 網路，也沒有重建/寫入開發資料庫；`npm test` 84/84 全過、`node --check backend/server.js` 語法檢查通過。尚未用真實 HTTP 請求驗證停用後四支路由的實際回應內容（需要重啟目前正在跑的本機 backend process 才能載入新程式碼，這次沒有主動重啟使用者手動啟動的 dev server）。`RtnCode` 檢查與 stage 金鑰 fallback 這兩個核心問題本身仍待修——若之後要重新啟用 ECPay，這兩點必須先修好才能把 `ECPAY_ENABLED` 打開。

## 2026-08-27 — 呼應上一筆：ECPay 整個移除，而非修復

**範圍**：`backend/server.js`（移除 4 支路由、repository 初始化與所有 postgres 就緒檢查）、`backend/payments/ecpayService.js`／`ecpayClient.js`（整檔刪除）、`backend/database/repositories/ecpayAuthorizationRepository.js`（整檔刪除）、`backend/payments/settlementService.js`／`merchantActivityCancelService.js`／`refundRequestService.js`（移除 ECPay 分支，保留 LINE Pay 邏輯）、`backend/db.js`（刪除一次性 `widenPaymentProviderCheckConstraints` 遷移函式）、`database/schema.sql`（`payment_authorizations`／`payment_refunds` 的 `provider` CHECK constraint 收回只允許 `line_pay`／`mock_line_pay`）、`mobile/src/screens/PaymentAuthorizationScreen.jsx`／`mobile/src/utils/apiClient.js`（移除信用卡付款選項與對應 API 呼叫）、`scripts/ecpay-smoke.js`／`ecpay-authorization-repository-smoke.js`（整檔刪除）、`.env.example`／`backend/.env`／`package.json`（清除對應設定與 script）
**觸發原因**：使用者確認後，直接要求「把 ecpay 完全刪除以絕後患」，取代上一筆記錄裡「先加總開關」的暫時緩解措施
**呼應**：直接呼應上一筆（2026-08-26）記錄的兩個高風險發現——`handleEcpayReturnWebhook` 缺少 `RtnCode` 檢查、`getEcpayConfig` 在非正式環境 fallback 成公開 stage 金鑰。兩者當時都標記「待處理」，這次確認：**兩者已完全解決**，因為存在這兩個問題的程式碼（`ecpayService.js`、`ecpayClient.js`）已整檔刪除，不是繼續留著加強防護，是問題所在的程式碼本身不存在了

### 發現

沒有找到信心度達到門檻（8/10 以上）的新漏洞。這次改動性質是移除既有攻擊面，不是新增邏輯。

### 沒發現問題的部分

| 面向 | 檢查結果 |
|------|----------|
| 是否有殘留但仍可觸發的 ECPay 程式碼路徑 | `grep -ri ecpay` 掃過整個 repo（不含歷史紀錄型文件與已套用的 migration 檔），backend／mobile／scripts 三個目錄下已無任何殘留引用；語法檢查（`node --check`）全數通過 |
| 移除 provider 分支後，LINE Pay 既有邏輯是否被連帶改動 | `settlementService.js`／`merchantActivityCancelService.js`／`refundRequestService.js` 三處都是刪除 `isEcpayProvider(...)` 判斷式整個分支，LINE Pay 那條分支的程式碼本身逐行核對未被觸碰；`npm test` 84/84 全過 |
| 移除的路由是否留下可被利用的殘破狀態 | 4 支路由（`request`／`checkout-redirect`／`return`／`client-back`）連同 `isEcpayEnabled()` 開關一起整段刪除，不是只刪路由留著開關，也不是只關開關留著路由；實際啟動 backend（對真實 PostgreSQL）後人工測試 `POST /api/payments/ecpay/request` 與 `GET /api/payments/ecpay/client-back`，回應是既有「`/api/payments/` 前綴但找不到對應路由」的通用 503（`customer_order_runtime_mismatch`），跟其他任何不存在的 `/api/payments/*` 路徑行為一致，不是殘留的 ECPay 專屬回應 |
| CHECK constraint 收窄是否影響既有資料 | 只改了 `database/schema.sql`（給全新建立的資料庫用的範本）與 `backend/db.js` 裡同樣只在資料表不存在時才會執行的 `CREATE TABLE IF NOT EXISTS`；沒有對正在使用中的 SQLite 開發檔案或真實 PostgreSQL 資料庫執行任何 `ALTER`／`migrate`，兩邊的既有資料表結構未被觸碰 |
| 移除後是否還有資料因此變成「處理邏輯消失」的孤兒 | 唯讀查詢過 SQLite 開發檔案與真實 PostgreSQL 資料庫的 `payment_authorizations`，`provider LIKE '%ecpay%'` 兩邊都是 0 筆，代表這次移除的分支在移除當下沒有任何真實資料依賴它 |
| Mobile 端移除是否留下死碼或壞掉的畫面邏輯 | `PaymentAuthorizationScreen.jsx` 的 `selectedProvider` state、付款方式選擇區塊、`getProviderDisplayName` 與所有 `=== "ecpay"` 分支已一併移除並簡化成單一 LINE Pay 路徑；`grep -ri ecpay` 整個 `mobile/` 目錄下已無殘留 |

**驗證限制**：`npm test` 84/84（不需要即時 PostgreSQL 連線的單元測試）全過；額外實際啟動 backend 對接真實 PostgreSQL 16，確認一般路由（`GET /api/stores`）正常回應、ECPay 路由回應變成通用 404-等效的 503（非 ECPay 專屬訊息），驗證後已關閉這個臨時啟動的測試 process，未影響使用者原本的 dev session。Mobile 端因為是 JSX，這次只做語法層面與逐行核對，沒有實際在模擬器／瀏覽器操作畫面確認付款流程——之後如果要對付款流程做一次真機或 Web 預覽的人工操作驗證，建議連同這次改動一起走一遍「送出訂單 → 進入付款畫面 → 完成 LINE Pay 授權」的完整路徑。

## 2026-08-28 — 管理員無條件取消團購 + 後台團購列表分歷史／進行中

**範圍**：`backend/payments/merchantActivityCancelService.js`（新增 `input.unconditional` 參數，繞過「僅限 recruiting 狀態」與「截止前 30 分鐘鎖定」兩道守門條件）、`backend/server.js`（兩個既有管理員取消路由——`DELETE /api/admin/group-buy-activities/:id` 與 `POST /admin/group-buy-activities/:id/cancel`——改傳 `unconditional: true`；`renderAdminDashboardBody` 重構為「進行中團購」／「歷史團購」兩個區塊；同時補上前一輪 `/code-review` 發現的 `/admin/refund-requests` 維護頁面缺少登入檢查的漏洞修復）、`scripts/merchant-activity-cancel-service-smoke.js`（新增兩個情境：管理員無條件取消繞過狀態與截止鎖定、非管理員呼叫仍維持原本限制）
**觸發原因**：使用者回報實機操作卡住——後台想取消一個 `ordering`／`failed` 狀態的團購被擋下「這個團購目前的狀態無法取消」；使用者要求管理員可無條件取消，並「決定是否退款」

### 設計決策（用 AskUserQuestion 跟使用者確認過，不是我自行假設）

已請款（`payment_status = captured`）的訂單，這次**完全不動**——不取消訂單、不觸發退款。使用者明確表示「退款應該要另外設一個管理金錢的地方不能跟其他綁再一起」，所以退款維持走既有的 `refundRequestService.js`（商家申請、管理員核准）這條獨立流程，不併入取消團購的邏輯。技術上這剛好也是既有 `listEligibleOrders` 查詢原本就有的行為（`payment_status NOT IN ('captured', 'refunded')` 早就排除已請款訂單），所以這次不需要改查詢，只需要確保「繞過狀態檢查」不會意外把這個既有的排除條件也繞過去。

### 發現

沒有找到信心度達到門檻（8/10 以上）的漏洞。

### 沒發現問題的部分（已交叉驗證）

| 面向 | 檢查結果 |
|------|----------|
| `unconditional` 旁路是否可能被非管理員觸發 | 全 repo 搜過 `cancelMerchantGroupBuyActivity(` 的三個呼叫點：商家自助取消（line 888）未傳這個參數、沿用原本的 `canManageStore` 真實檢查，不受影響；兩個管理員路由分別掛在 `authUser.roles.includes("admin")`（JSON API）與 `requireAdminWebUser`（web 表單，未登入會被導去 `/admin/login`）後面，兩道守門都是既有邏輯，這次沒有改動 |
| 繞過狀態檢查是否連帶繞過活動不存在／店家歸屬檢查 | `activity_not_found` 與 `canManageStore(activity.store_id)` 兩個檢查在 `input.unconditional` 判斷之前就先執行、不受這個旗標影響（管理員路由的 `canManageStore` 本來就固定回傳 `true`，是既有設計，不是這次新增） |
| 已請款訂單是否會被這次改動意外波及 | 用 smoke test 實際跑過一個「`ordering` 狀態＋1 筆待處理訂單＋1 筆已請款訂單」的情境，管理員無條件取消後確認：待處理訂單被取消，已請款訂單的 `status`／`payment_status` 完全沒被改動；另外用瀏覽器對真實 PostgreSQL dev 環境實際操作驗證了一次（見下方「驗證限制」），結果一致 |
| 管理後台列表重構（HTML 拆成兩區塊）是否有新的 XSS/跳脫遺漏 | 逐一比對重構前後：`activity.title`／`activity.status`／店名／取消原因／`csrfToken` 全部維持原本的 `escapeHtml(...)`，新增的兩個區塊標題只插入數字（陣列長度），沒有插入任何使用者可控字串 |
| 是否意外弱化商家自助取消原本的保護 | smoke test 新增情境 7 明確驗證：同樣的非 recruiting 狀態，商家自助取消（不傳 `unconditional`）仍然照舊被 `activity_not_cancellable` 擋下 |

**驗證限制**：`npm test` 92/92 全過；`merchant-activity-cancel-service:smoke`（會重建本機 SQLite dev 資料庫）經使用者明確同意後執行，執行前已備份、執行後確認 `integrity_check=ok` 且 0 筆 foreign key 違反。另外用瀏覽器實際登入 `/admin` 對**真實 PostgreSQL dev 資料庫**操作驗證了取消 `ordering`／`failed` 狀態團購兩種情境，過程中不慎誤解了這個專案的實際 runtime（以為團購讀寫走 SQLite，其實永久走 PostgreSQL），導致兩筆真實種子測試資料被意外取消；已在使用者確認後用一次性、範圍精確的 SQL 修正腳本把這兩筆活動的 `status`／`cancellation_reason`／`updated_at` 還原，並刪除因此多出的 `status_history`／`audit_logs` 紀錄，還原後重新讀取確認資料與異動前一致。
