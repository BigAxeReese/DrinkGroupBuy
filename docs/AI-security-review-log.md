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

**驗證限制**：`npm test` 53 項、`group-buy-activity-read:smoke`、`check:sql-safety`、SQLite `integrity_check`／`foreign_key_check`、Mobile Babel 解析與 Web export 已通過；沒有呼叫真實 LINE Pay／ECPay、沒有對 live PostgreSQL 執行 migration，也尚未由使用者在 Android 模擬器人工確認最終結算卡片排版。
