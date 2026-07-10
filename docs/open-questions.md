# 未決問題

最後更新：2026-07-11

## 語言規則

本文件整理目前還沒完全決定、但會影響實作的問題。

- `Resolved` 表示目前已有暫定決策。
- `High` 表示會影響核心流程，例如付款、訂單、團購結算或權限。
- `Medium` / `Low` 表示可以稍後再定，但仍需要追蹤。
- 問題可以用中文補充，但涉及欄位、API、status value 時仍保留英文名稱。
- 技術決策確認後，應同步更新對應的 API、database 或 status 文件。

本文件只保留仍會影響實作的未決決策。

## 身份與權限

| 優先級   | 問題                                                                          | 影響                                                                                                                   |
| -------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| High     | 同一個使用者是否可以同時擁有顧客與商家角色？                                  | 導覽邏輯、token claims、`user_roles`                                                                                   |
| Resolved | 是否使用 Firebase？                                                           | 只使用 Firebase Auth 做 Google Login。Firestore 不作為主要業務資料庫。                                                 |
| Resolved | 正式產品是否保留密碼登入？                                                    | 不保留。正式方向是只使用 Google Login；目前密碼登入是舊版開發相容功能。                                                |
| Resolved | 哪個欄位用來對應 Firebase Auth 使用者與既有 `users` rows？                    | 使用 `users.firebase_uid` 作為正式且唯一的 Firebase identity 欄位。                                                    |
| High     | Google 帳號如何連結到既有 seeded users 與 merchant/store 權限？               | 帳號連結、email 重複處理、merchant onboarding、seeded users 遷移                                                       |
| Resolved | 沒有角色選擇密碼帳號後，開發與測試登入如何運作？                              | 使用 Firebase Google 測試帳號，並以 `users.firebase_uid` 對應；可選 local emulator/dev bypass，但必須由 env 明確開啟。 |
| Resolved | dev mock login 如何在 production 停用？                                       | 預設停用；只能透過本機 env 如 `AUTH_DEV_MODE=true` 明確啟用，且 production UI 不得顯示角色選擇。                       |
| High     | 哪些實際 Google 測試帳號要對應 customer A/B/C/D、各 merchant store 與 admin？ | Firebase Console 設定與 seed data 需要實際 Firebase UID。                                                              |
| Resolved | 商家使用者如何被授權管理一間或多間店？                                        | 目前方向是一個商家帳號只透過 `merchant_users.store_id` 管理一間店；暫不拆 owner/manager/staff。                        |
| High     | 管理員角色如何授權與稽核？                                                    | Admin API security 與 audit logs                                                                                       |
| Medium   | 除了 alias 與取餐/訂單資料外，商家可以看到哪些顧客公開資料？                  | 隱私與 merchant order response                                                                                         |

## 店家與菜單

| 優先級 | 問題                                                              | 影響                              |
| ------ | ----------------------------------------------------------------- | --------------------------------- |
| High   | `database/schema.sql` 還是七間店測試資料庫才是正式 seed 來源？    | 地圖與菜單一致性                  |
| Medium | 菜單選項是 store-wide 還是 item-specific？                        | Menu schema 與 customization UI   |
| High   | 商品在購物車內時，如果價格或可販售狀態變更，要如何處理？          | Submit validation 與 conflict UX  |
| Medium | 店家座標如何與 Google Maps/Places 驗證？                          | 地圖可信度與 store onboarding     |
| Medium | `database/test/` 是否應正規化，或改由 canonical dev schema 取代？ | 測試資料可靠性與 map/menu exports |

## 團購活動與優惠

| 優先級   | 問題                                                     | 影響                                                     |
| -------- | -------------------------------------------------------- | -------------------------------------------------------- |
| Resolved | 達到最高優惠級距後，是否立即停止新訂單？                 | 是。最高優惠級距杯數就是最大容量；新訂單不得超過此容量。 |
| Resolved | 商家建立的團購活動最長可以開放多久？                     | 截止時間必須在活動發布或開放招募後 24 小時內。           |
| High     | 達到某個優惠級距後，截止前有人退出是否會讓最終級距下降？ | 進度顯示、authorization rollback、settlement             |
| High     | 團購折扣是依杯數、訂單數，還是品項金額分配？             | `finalAmount` calculation 與 snapshots                   |
| Medium   | 團購發布後，商家可以修改哪些 activity fields？           | API、version history、customer notices                   |
| High     | 誰負責執行 deadline settlement，失敗重試如何恢復？       | Background job 與 transaction design                     |

## 訂單

| 優先級   | 問題                                                                                       | 影響                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| High     | 每位顧客在同一個 activity 是否只能有一筆訂單？                                             | Unique constraints 與 edit behavior                                                                    |
| High     | 截止前最後 30 分鐘是否對新顧客與既有顧客都只能加入、不能修改？                             | Lock validation 與 UI messaging                                                                        |
| Resolved | 顧客完成預授權後要如何修改訂單？                                                           | 採用待確認替換流程。舊訂單與舊預授權在新預授權成功前維持有效；如果新預授權失敗或取消，原訂單維持不變。 |
| High     | `readyForPickup` 應該是 order status，還是只用 `pickupStatus = ready`？                    | 目前 mobile/schema mismatch                                                                            |
| High     | 預授權後需要保存哪些不可變更的 order revision data？                                       | Audit 與 dispute handling                                                                              |
| Medium   | 顧客是否可以移除所有品項？這是否等同取消訂單？                                             | Order lifecycle 與 cup rollback                                                                        |
| Medium   | order item customization snapshots 應保存 nullable option IDs、純 snapshot，還是兩者都存？ | 菜單選項變更後的歷史準確性                                                                             |

## 付款

| 優先級   | 問題                                                                                                                                              | 影響                                                                                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| High     | 選定的 LINE Pay 產品是否支援 authorization + partial capture？                                                                                    | 整體付款模型                                                                                                                                                |
| High     | 目前 sandbox channel 對 `capture:false` 回傳 "Parameter is not allowed"；此商家帳號是否能透過其他設定或產品類型支援分離式 authorization/capture？ | 決定是否能用 LINE Pay 實作 partial capture                                                                                                                  |
| High     | authorization 有效期限是多久？                                                                                                                    | 最大活動時間與 reauthorization                                                                                                                              |
| Resolved | 團購活動如何降低 authorization 過期風險？                                                                                                         | 團購截止時間限制為 24 小時內；LINE Pay authorization 後，授權到期時間仍必須涵蓋截止時間與結算緩衝時間。                                                     |
| High     | 活動未達標時，authorization 何時 void？                                                                                                           | 顧客提示與 settlement job                                                                                                                                   |
| High     | capture 失敗如何重試或升級處理？                                                                                                                  | 履約資格與營運處理                                                                                                                                          |
| High     | webhook 簽章、重複事件與 out-of-order events 如何處理？                                                                                           | 付款正確性                                                                                                                                                  |
| Resolved | LINE Pay confirm 是否立即把訂單更新為 `authorized`？                                                                                              | 第一個 backend slice 先這樣做：confirm 更新 `payment_authorizations`、`orders.payment_status`、`orders.authorization_status`。Redirect 後 app sync 仍待決。 |
| High     | LINE Pay redirect 後，mobile app 如何取得更新後的 `authorized` 狀態？                                                                             | Polling、deep link 或 order reload flow                                                                                                                     |
| High     | LINE Pay transaction IDs、request IDs、return codes 與 raw provider events 要保存在哪裡？                                                         | `payment_authorizations`、provider event tables、可稽核性                                                                                                   |
| Medium   | 釋放未請款金額的時間要如何向使用者說明？                                                                                                          | Payment UI 與客服支援                                                                                                                                       |
| Resolved | 修改後訂單金額或杯數超過原本預授權時，是否需要重新預授權？                                                                                        | 需要。修改內容在新預授權成功前維持待確認；原訂單仍然計入杯數，系統只針對增加的杯數差額做容量檢查或暫時保留。                                                |

## 取貨與履約

| 優先級 | 問題                                                     | 影響                                  |
| ------ | -------------------------------------------------------- | ------------------------------------- |
| High   | 商家端「完成訂單」代表製作完成，還是顧客已取貨？         | 按鈕文字與 status transition          |
| High   | 誰負責把 `ready` 改成 `picked_up`，code/QR 如何驗證？    | Pickup API 與 audit trail             |
| Medium | 顧客被請款後，取餐時段是否可以變更？                     | 歷史紀錄與通知需求                    |
| Medium | pickup credential 何時過期？                             | Credential schema 與 customer history |
| High   | `preparing` 應保存為 pickup status，還是由其他狀態推導？ | 目前 mobile/schema mismatch           |

## 一致性與營運

| 優先級 | 問題                                                              | 影響                         |
| ------ | ----------------------------------------------------------------- | ---------------------------- |
| High   | 多筆 simultaneous authorizations 如何避免超過最大杯數？           | Database locking/idempotency |
| High   | authorized cup progress 的資料來源以哪裡為準？                    | 避免重複且可變的計數器       |
| High   | activity cancellation 如何連動 orders 與 payment authorizations？ | Transactions 與 recovery     |
| Medium | 除了 admin cancellation，哪些操作也需要 audit logs？              | 儲存與 compliance            |
| Medium | 是否需要、以及何時要用 PostgreSQL/MySQL 取代 SQLite？             | Deployment 與 concurrency    |

## 文件與命名

| 優先級 | 問題                                                                  | 影響                     |
| ------ | --------------------------------------------------------------------- | ------------------------ |
| Medium | mobile legacy `deal` 變數與 routes 何時遷移到 `groupBuyActivity`？    | 跨層可讀性               |
| Medium | `PaymentReportScreen` 是否現在就改名為 `PaymentAuthorizationScreen`？ | UI/navigation 命名一致性 |
