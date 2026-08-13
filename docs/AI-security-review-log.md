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
