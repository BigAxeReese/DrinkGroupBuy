# 付款規則與流程

最後更新：2026-07-11

本文件紀錄目前已確認的付款商業規則，作為下一階段 LINE Pay 實作依據。

## 已確認規則

### 核心付款模式

1. LINE Pay 採用先預授權 `authorization`，不是下單當下直接請款 `capture`。
2. 顧客只有在 LINE Pay 預授權成功後，才算正式加入團購。
3. 預授權成功後，該訂單立即計入團購杯數。
4. 店家不需要逐筆確認顧客訂單。
5. 顧客預授權成功後，店家不能拒絕或取消單筆顧客訂單。
6. 這樣可以避免店家故意不接第 50 杯，讓團購停在 49 杯以避開折扣門檻。
7. 實際請款 `capture` 會在團購截止結算時執行，因為那時才知道最終折扣級距。
8. 顧客若在 LINE Pay 頁面取消或返回，該次 pending authorization 必須在後端標記為 `failed`，訂單維持 `pending`，顧客可以重新發起付款。
9. LINE Pay confirm 回跳後，後端寫入 `authorized` 前仍必須重新檢查團購容量；若容量已滿，該次 authorization 標記為 `failed`，訂單不得計入團購。
10. 若 LINE Pay provider confirm 已成功，但後端最後容量檢查失敗，系統必須立即嘗試取消該筆授權 `void`。

### 優惠與原價購買

1. 顧客先用訂單原價金額進行預授權。
2. 團購截止結算時，系統計算最終杯數與優惠級距。
3. 如果團購達到優惠門檻，系統依折扣後金額請款。
4. 如果團購未達優惠門檻，且顧客有勾選接受原價購買，系統依原價金額請款。
5. 如果團購未達優惠門檻，且顧客沒有勾選接受原價購買，系統取消授權 `void`，並取消該訂單。
6. 顧客端保留「未達優惠時接受原價購買」選項。

### 活動時間限制

1. 店家建立團購時，截止時間必須在發布或開放招募後 24 小時內。
2. 24 小時限制是為了降低 LINE Pay 預授權過期風險。
3. LINE Pay 預授權成功後，若 LINE Pay 回傳授權到期時間，後端必須保存該時間。
4. 如果授權有效時間無法涵蓋團購截止時間與結算緩衝時間，系統不能把該授權視為有效加入團購。
5. 團購截止後，系統應立即進行結算。
6. 目前 `POST /api/merchant/group-buy-activities` 已先強制 `deadlineAt` 不可超過 `startAt` 後 24 小時；mobile 建立團購表單也會先做相同提醒與阻擋。

### 顧客修改與退出時間

1. 顧客只能在團購截止前 30 分鐘以前修改訂單。
2. 顧客只能在團購截止前 30 分鐘以前退出團購。
3. 進入團購截止前 30 分鐘後，顧客不能修改訂單，也不能退出團購。
4. 30 分鐘鎖定規則用來保護店家備料、製作與系統結算。

### 已授權訂單修改

1. 修改已授權訂單是替換流程，不是新增一筆正式訂單。
2. 顧客修改期間，原本已授權訂單仍然有效。
3. 系統會建立一份待確認的修改內容。
4. 新修改內容在新的預授權成功前，不會計入團購杯數。
5. 如果修改後杯數增加，系統只檢查並暫時保留增加的杯數差額。
6. 如果修改後杯數減少，沒有容量不足問題；最終杯數會在替換成功後才更新。
7. 顧客必須針對修改後金額完成新的 LINE Pay 預授權。
8. 如果新的預授權成功：
   - 修改後訂單內容正式生效；
   - 新預授權成為有效授權；
   - 舊預授權會被取消授權 `void`；
   - 團購杯數依杯數差額更新。
9. 如果新的預授權失敗、逾時或顧客取消：
   - 修改內容不生效；
   - 原訂單維持不變；
   - 原本預授權繼續有效；
   - 原本杯數繼續計入團購。
10. 因為新舊預授權會短時間重疊，顧客可能需要足夠額度才能完成增加金額的修改。
11. 目前第一版已用 `order_revisions` 保存待確認修改內容；`POST /api/orders/:orderId/revisions` 建立 revision，mobile 付款頁會在 `POST /api/payments/line-pay/request` 帶 `orderRevisionId` 發起新預授權。
12. 新預授權 confirm 成功後，backend 在同一個資料庫交易中套用 revision，再嘗試 void 被替換的舊授權；若 void 舊授權失敗，會保留新訂單狀態並記錄失敗事件。

### 容量規則

1. 最高優惠級距杯數視為團購容量上限。
2. 新訂單如果會超過團購容量上限，就不能完成預授權加入團購。
3. 已授權訂單修改時，如果增加的杯數差額會超過剩餘容量，就不能進入有效替換。
4. 待確認修改內容不能重複計算顧客原本訂單杯數。
5. 多位顧客同時預授權或修改訂單時，容量檢查必須由後端交易安全控制。
6. LINE Pay confirm redirect 必須在同一個資料庫交易中重新計算已授權杯數，確認沒有超過容量上限後才能把訂單付款狀態改為 `authorized`。

### 店家取消團購

1. 店家只能在團購截止前 30 分鐘以前取消已發布團購。
2. 進入團購截止前 30 分鐘後，店家不能取消團購。
3. 如果店家取消符合條件的團購，相關尚未請款的授權必須取消授權 `void`。
4. 目前產品方向不做「店家缺料回報」功能。
5. 店家備料與供應規劃視為店家營運責任。

## 截止結算流程

1. 團購到達截止時間。
2. 系統鎖定該團購並開始結算。
3. 系統計算有效預授權訂單。
4. 系統判斷最終優惠級距。
5. 系統逐筆處理已授權訂單：
   - 若達到優惠門檻，依折扣後金額請款 `capture`；
   - 若未達優惠門檻且顧客接受原價購買，依原價金額請款 `capture`；
   - 若未達優惠門檻且顧客不接受原價購買，取消授權 `void`。
6. 系統紀錄請款或取消授權結果。
7. 系統更新訂單付款狀態。
8. 系統更新團購活動狀態。
9. 結算成功後，才進入店家製作與顧客取餐流程。
10. 目前 backend 已支援 admin 手動觸發單一團購結算，並在後端啟動時開啟 deadline settlement scheduler 自動掃描已截止團購。
11. Scheduler 在 `LINE_PAY_ENV=production` 時預設不啟動；必須明確設定 `SETTLEMENT_SCHEDULER_ALLOW_PRODUCTION=true`，避免未確認前發生真實請款。

## 實作方向

1. 付款邏輯維持集中在 `backend/payments/`。
2. LINE Pay secret 只放在後端本機環境檔。
3. 付款狀態必須保存於後端資料庫，不以 mobile local state 作為主資料。
4. 需要保存預授權、請款、取消授權、provider event 與訂單替換紀錄。
5. 預授權、請款、取消授權與結算 job 需要 idempotency，避免重複執行造成金額錯誤。
6. 預授權前與訂單替換正式生效前，都需要交易安全的容量檢查。
7. 上正式金流請款前，需要補齊結算重試與 audit log。
8. LINE Pay cancel redirect 不可只清除記憶體暫存，也必須更新 `payment_authorizations`、`payment_provider_events` 與 `status_history`。
9. LINE Pay confirm/cancel redirect 應以後端資料庫查找 pending authorization；記憶體快取只能當加速輔助，不能是唯一依據。
10. LINE Pay confirm 寫入成功前需使用交易鎖定容量檢查；容量不足時需留下 provider event、status history 與 audit log。
11. LINE Pay void 使用官方 `POST /v3/payments/authorizations/{transactionId}/void`；成功後更新 `payment_authorizations.status = authorization_voided`，並同步更新訂單付款狀態與稽核紀錄；失敗時至少記錄 provider event 與 audit log。
12. LINE Pay capture 使用官方 `POST /v3/payments/authorizations/{transactionId}/capture`；成功後新增 `payment_captures`，更新 `payment_authorizations.status = captured`、`orders.payment_status = captured` 與 `orders.final_amount`，並記錄 provider event、status history 與 audit log。
13. 目前結算的折扣分攤暫行規則：將 `promotion_tiers.discount_amount` 平均到該級距 `target_cups`，再依各訂單杯數計算折扣；正式折扣分配規則仍需確認。
14. 本機開發可使用 `mock_line_pay` 測試截止結算，不呼叫外部 LINE Pay API；`npm run settlement:smoke` 會使用乾淨 schema 暫時建立 mock 預授權訂單，驗證達標 capture、未達標 fallback capture、void、scheduler due activity 結算與 order revision 套用，並在測試後還原開發資料庫。

## 尚未決定

1. 目前 LINE Pay 商家產品是否支援分離式預授權與請款。
2. 選定 LINE Pay 產品的實際預授權有效期限。
3. 團購截止後需要保留多久的結算緩衝時間。
4. webhook 簽章、重複事件與事件順序錯亂要如何處理。
5. 請款失敗時要如何重試或升級處理。
6. void 失敗時的自動重試次數、告警方式與人工處理流程尚未設計。
7. Deadline settlement scheduler 目前是單一 backend process interval；跨執行個體 locking、失敗重試佇列與告警尚未完成。
