# 未決問題

最後更新：2026-07-12

## 語言規則

本文件整理目前還沒完全決定、但會影響實作的問題。

- `Resolved` 表示目前已有暫定決策。
- `High` 表示會影響核心流程，例如付款、訂單、團購結算或權限。
- `Medium` / `Low` 表示可以稍後再定，但仍需要追蹤。
- 問題可以用中文補充，但涉及欄位、API、status value 時仍保留英文名稱。
- 技術決策確認後，應同步更新對應的 API、database 或 status 文件。

## 身份與權限

| 優先級   | 問題                                                                          | 決策或影響                                                                                                                   |
| -------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Resolved | 同一個使用者是否可以同時擁有顧客與商家角色？                                  | 第一階段不讓同一個 Firebase UID 同時作為顧客與商家切換使用；若未來要支援，需另做明確角色切換流程。                           |
| Resolved | 是否使用 Firebase？                                                           | 只使用 Firebase Auth 做 Google Login。Firestore 不作為主要業務資料庫。                                                       |
| Resolved | 正式產品是否保留密碼登入？                                                    | 不保留。正式方向是只使用 Google Login；目前密碼登入是舊版開發相容功能。                                                      |
| Resolved | 哪個欄位用來對應 Firebase Auth 使用者與既有 `users` rows？                    | 使用 `users.firebase_uid` 作為正式且唯一的 Firebase identity 欄位。                                                          |
| Resolved | Google 帳號如何連結到既有 seeded users 與 merchant/store 權限？               | 以 `users.firebase_uid` 手動或 seed/script 對應；不由前端選角色，也不以 email 自動取得商家權限。未對應者暫不允許進入主流程。 |
| Resolved | 沒有角色選擇密碼帳號後，開發與測試登入如何運作？                              | 使用 Firebase Google 測試帳號，並以 `users.firebase_uid` 對應；可選 local emulator/dev bypass，但必須由 env 明確開啟。       |
| Resolved | dev mock login 如何在 production 停用？                                       | 預設停用；只能透過本機 env 如 `AUTH_DEV_MODE=true` 明確啟用，且 production UI 不得顯示角色選擇。                             |
| Resolved | 哪些實際 Google 測試帳號要對應 customer A/B/C/D、各 merchant store 與 admin？ | 第一階段不做 admin；測試至少需要一個顧客與一個店家 UID。若 Google 帳號不足，本機可用 dev bypass 或重新映射同一 UID 測試角色。 |
| Resolved | 商家使用者如何被授權管理一間或多間店？                                        | 目前方向是一個商家帳號只透過 `merchant_users.store_id` 管理一間店；暫不拆 owner/manager/staff。                              |
| Resolved | 管理員角色如何授權與稽核？                                                    | 分析文件與第一階段產品不納入管理員角色；後台或營運工具若未來需要，另開需求處理。                                             |
| Resolved | 除了 alias 與取餐/訂單資料外，商家可以看到哪些顧客公開資料？                  | 商家只看得到顧客 alias、訂單品項、客製化內容、金額、付款狀態、取貨狀態與取貨憑證；不顯示 email、Firebase UID 或敏感身份資料。 |

## 店家與菜單

| 優先級   | 問題                                                              | 決策或影響                                                                                         |
| -------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Resolved | `database/schema.sql` 還是七間店測試資料庫才是正式 seed 來源？    | `database/schema.sql` 與正式 dev seed 檔是主來源；`database/test/` 只作測試或匯出輔助，不作權威資料。 |
| Resolved | 菜單選項是 store-wide 還是 item-specific？                        | 第一階段採 item-specific；甜度、冰塊、加料、尺寸等選項直接隸屬於單一 `menu_items`。                 |
| Resolved | 商品在購物車內時，如果價格或可販售狀態變更，要如何處理？          | 購物車可保留快照顯示；送出訂單或重新預授權前必須重新驗證目前價格、可販售狀態與選項是否仍有效。       |
| Resolved | 店家座標如何與 Google Maps/Places 驗證？                          | 第一階段由資料庫保存店家座標並用 Google Maps 顯示；不先做 Google Places 店家驗證。                  |
| Resolved | `database/test/` 是否應正規化，或改由 canonical dev schema 取代？ | 以 canonical dev schema 為準；`database/test/` 可留作 smoke test，但不得成為另一套正式資料模型。     |

## 團購活動與優惠

| 優先級   | 問題                                                     | 決策或影響                                                                                                       |
| -------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Resolved | 達到最高優惠級距後，是否立即停止新訂單？                 | 是。最高優惠級距杯數就是最大容量；新訂單不得超過此容量。                                                         |
| Resolved | 商家建立的團購活動最長可以開放多久？                     | 截止時間必須在活動發布或開放招募後 24 小時內。                                                                   |
| Resolved | 達到某個優惠級距後，截止前有人退出是否會讓最終級距下降？ | 會。最終級距以截止結算時仍有效的已預授權訂單為準；但進入截止前 30 分鐘後，顧客不可退出或修改。                   |
| Resolved | 團購折扣是依杯數、訂單數，還是品項金額分配？             | 折扣是該級距的總折扣金額，截止結算時平均分攤給每一杯有效授權飲品；無法整除的餘額不分配給訂單，作為系統維運補貼。   |
| Resolved | 團購發布後，商家可以修改哪些 activity fields？           | 第一階段發布後不允許修改截止時間、優惠門檻、折扣規則、適用飲品或取餐時間；只能取消符合條件的團購或查看狀態。       |
| Resolved | 誰負責執行 deadline settlement？                         | 系統排程負責自動結算；開發或營運用手動觸發只能作補救工具，不是一般使用者流程。                                   |
| Resolved | deadline settlement 失敗後，重試、告警與人工補救怎麼做？ | 第一版以自動重試為主，不做人工處理介面；仍無法處理時保留失敗狀態與紀錄，訂單不得進入製作或取貨。                 |

## 訂單

| 優先級   | 問題                                                                                       | 決策或影響                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Resolved | 每位顧客在同一個 activity 是否只能有一筆訂單？                                             | 同一顧客同一團購只能有一筆有效訂單；修改用 `order_revisions`，不是新增第二筆有效訂單。                       |
| Resolved | 截止前最後 30 分鐘是否對新顧客與既有顧客都只能加入、不能修改？                             | 截止前 30 分鐘內，已有有效訂單的顧客不能修改或退出；尚未參與的顧客仍可在未滿容量且未截止前加入。               |
| Resolved | 顧客截止前進入 LINE Pay，但 confirm 回來時已超過截止時間，是否算加入？                     | 不算。必須在截止前完成 Line Pay confirm 且後端寫入 `authorized`；截止後才 confirm 的授權會標記失敗並嘗試 void。 |
| Resolved | 顧客完成預授權後要如何修改訂單？                                                           | 採用待確認替換流程。舊訂單與舊預授權在新預授權成功前維持有效；如果新預授權失敗或取消，原訂單維持不變。         |
| Resolved | `readyForPickup` 應該是 order status，還是只用 `pickupStatus = ready`？                    | 訂單狀態維持 `locked`；可取貨用 `pickup_status = ready` 表示，不再新增 `readyForPickup` 作為 order status。    |
| Resolved | 預授權後需要保存哪些不可變更的 order revision data？                                       | 保存原訂單與新 revision 的杯數、金額、品項快照、客製化快照、原授權 ID、替換授權 ID、狀態與失敗原因。           |
| Resolved | 顧客是否可以移除所有品項？這是否等同取消訂單？                                             | 是。若移除所有品項，視為退出團購；必須符合截止前 30 分鐘限制，並取消尚未請款的有效授權。                       |
| Resolved | order item customization snapshots 應保存 nullable option IDs、純 snapshot，還是兩者都存？ | 兩者都存。保留原 option ID 方便追溯；同時保存 label、type、price delta 快照，避免菜單變更後歷史訂單失真。       |

## 付款

| 優先級   | 問題                                                                                                                                              | 決策或影響                                                                                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resolved | 選定的 LINE Pay 產品是否支援 authorization + partial capture？                                                                                    | LINE Pay 官方支援分離式 confirm/capture 與 partial capture；但台灣 channel 預設是自動請款，使用前需向 LINE Pay 申請開通。                                         |
| Resolved | 目前 sandbox channel 對 `capture:false` 回傳 "Parameter is not allowed"；此商家帳號是否能透過其他設定或產品類型支援分離式 authorization/capture？ | 視為目前 sandbox channel 尚未開通分離式請款。後端預設不送 `capture:false`，且未設定 `LINE_PAY_CAPTURE_SEPARATED=true` 時會阻擋真 LINE Pay request。                 |
| Resolved | authorization 有效期限是多久？                                                                                                                    | 不寫死固定時數。以 LINE Pay confirm 回傳的 `info.authorizationExpireDate` 為準；該時間必須晚於團購截止時間加結算緩衝時間。                                         |
| Resolved | 團購活動如何降低 authorization 過期風險？                                                                                                         | 團購截止時間限制為 24 小時內；LINE Pay authorization 後，授權到期時間仍必須涵蓋截止時間與結算緩衝時間。                                                           |
| Resolved | 活動未達標時，authorization 何時 void？                                                                                                           | 截止結算時立即處理；未達標且顧客未接受原價購買的訂單，系統取消授權 `void` 並取消訂單。                                                                             |
| Resolved | capture 失敗如何重試或升級處理？                                                                                                                  | 系統自動重試並先查 provider 狀態避免重複請款；授權有效期限內仍無法完成時取消該訂單，不進入製作。                                                                   |
| Resolved | webhook 簽章、重複事件與 out-of-order events 如何處理？                                                                                           | 第一版不做 LINE Pay webhook endpoint；LINE Pay Online API 以 confirm/cancel redirect 加 provider 狀態查詢為主。若未來接 provider webhook，必須先驗簽、保存 raw payload、用 idempotency key 去重，並以資料庫狀態轉換規則處理亂序事件。 |
| Resolved | LINE Pay confirm 是否立即把訂單更新為 `authorized`？                                                                                              | 第一個 backend slice 先這樣做：confirm 更新 `payment_authorizations`、`orders.payment_status`、`orders.authorization_status`。                                      |
| Resolved | LINE Pay redirect 後，mobile app 如何取得更新後的 `authorized` 狀態？                                                                             | 第一階段用付款結果頁 polling、返回前景重新讀取訂單、手動重新整理；deep link 可留到後續。                                                                           |
| Resolved | LINE Pay transaction IDs、request IDs、return codes 與 raw provider events 要保存在哪裡？                                                         | 存在 `payment_authorizations`、`payment_captures`、`payment_provider_events`，並在必要時寫入 `status_history` 與 `audit_logs`。                                      |
| Resolved | 釋放未請款金額的時間要如何向使用者說明？                                                                                                          | 顯示為「未請款金額會由 LINE Pay 或發卡銀行依規定釋放，實際時間以付款服務為準」。                                                                                   |
| Resolved | 修改後訂單金額或杯數超過原本預授權時，是否需要重新預授權？                                                                                        | 需要。修改內容在新預授權成功前維持待確認；原訂單仍然計入杯數，系統只針對增加的杯數差額做容量檢查或暫時保留。                                                      |

## 取貨與履約

| 優先級   | 問題                                                     | 決策或影響                                                                                         |
| -------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Resolved | 商家端「完成訂單」代表製作完成，還是顧客已取貨？         | 不使用模糊的「完成訂單」。製作完成用「標記可取餐」；顧客取走後用「核銷取貨」或「標記取餐完成」。     |
| Resolved | 誰負責把 `ready` 改成 `picked_up`，code/QR 如何驗證？    | 由店家在顧客取餐時核對取貨憑證或取貨代碼，系統更新為 `picked_up`；QR 可作後續優化，不是第一階段必要。 |
| Resolved | 顧客被請款後，取餐時段是否可以變更？                     | 第一階段不支援顧客自行變更取餐時段；若店家需調整，先以店家與顧客自行協調處理。                       |
| Resolved | pickup credential 何時過期？                             | 取餐憑證自取餐開始時間起保留 3 小時；若店家當日營業結束早於 3 小時，則保留至當日營業結束；24 小時營業店家一律保留 3 小時。到期後訂單移至歷史訂單，店家不再負原飲品保管責任，且不自動退款。 |
| Resolved | `preparing` 應保存為 pickup status，還是由其他狀態推導？ | 不存 `preparing`。製作中由 activity/order/payment 狀態推導；取貨狀態只保存 `not_ready`、`ready` 等值。 |

## 一致性與營運

| 優先級   | 問題                                                              | 決策或影響                                                                                           |
| -------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Resolved | 多筆 simultaneous authorizations 如何避免超過最大杯數？           | 由後端資料庫交易、容量重算與 idempotency 控制；正式多使用者環境應使用 PostgreSQL row lock 或等效機制。 |
| Resolved | authorized cup progress 的資料來源以哪裡為準？                    | 以有效 `authorized` 訂單及其最新 revision 為準重新計算；不要依賴可漂移的前端或手動 counter。           |
| Resolved | activity cancellation 如何連動 orders 與 payment authorizations？ | 取消團購需在同一交易中更新 activity、eligible orders、authorization 狀態，並寫入 history/audit。       |
| Resolved | 除了 admin cancellation，哪些操作也需要 audit logs？              | 付款授權、請款、取消授權、結算、活動取消、訂單 revision 套用與敏感權限變更都需要 audit log。           |
| Resolved | 是否需要、以及何時要用 PostgreSQL/MySQL 取代 SQLite？             | SQLite 只作本機開發；正式多人測試、真金流或部署前應切到 PostgreSQL。                                  |

## 文件與命名

| 優先級   | 問題                                                                  | 決策或影響                                                                                                              |
| -------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Resolved | mobile legacy `deal` 變數與 routes 何時遷移到 `groupBuyActivity`？    | 已遷移。Mobile state、route、screen、mock 與主要工具函式改用 `groupBuyActivity`；舊本機儲存只保留相容讀取。             |
| Resolved | `PaymentReportScreen` 是否現在就改名為 `PaymentAuthorizationScreen`？ | 已改名。付款預授權畫面、route 與 mock state 使用 `PaymentAuthorizationScreen` / `paymentAuthorization` 命名。           |
