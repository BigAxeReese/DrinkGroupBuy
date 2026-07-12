# 資料庫盤點與候選設計

最後更新：2026-07-11

## 語言與命名規則

本文件用中文描述資料庫設計方向；必要的技術名稱、資料表名稱、欄位名稱、狀態值與檔案路徑保留英文。

- 資料表與欄位使用 `snake_case`。
- API JSON 欄位使用 `camelCase`。
- 同一個概念不要在不同文件使用不同名稱。
- 目前正式開發草案以 `database/schema.sql` 為準。
- PostgreSQL 遷移方向請看 `docs/postgresql-migration-plan.md`。

`database/schema.sql` 是目前本機開發資料庫的權威草案。本文件只整理目前已存在的 entity、候選補充項目與尚未解決的資料庫問題，不是 migration 檔。欄位細節請看 `docs/database-field-spec.md`。

## 已建立的開發資料表

| 資料表                                                              | 用途                           | 重要關係                                                   |
| ------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------- |
| `users`, `user_roles`                                               | 帳號身份與顧客/店家/管理員角色 | User 1:N roles                                             |
| `merchants`                                                         | 商家組織或品牌                 | Merchant 1:N stores                                        |
| `stores`, `merchant_users`                                          | 實體門市與店家登入帳號         | PostgreSQL draft 中 Store 1:1 merchant account             |
| `menu_items`, `customization_options`                               | 門市菜單與可選客製化項目       | Store 1:N items；item 1:N options                          |
| `group_buy_activities`                                              | 店家建立的團購活動             | Store 1:N activities                                       |
| `promotion_tiers`                                                   | 杯數門檻與總折扣金額           | Activity 1:N tiers                                         |
| `activity_notices`                                                  | 團購活動備註                   | Activity 1:N notices                                       |
| `cart_drafts`, `cart_draft_items`, `cart_draft_item_customizations` | 送出前的伺服器端購物車草稿     | User/activity 1:N items；item 1:N selected options         |
| `orders`, `order_items`, `order_item_customizations`                | 顧客參與團購與品項快照         | Activity/user 1:N orders；order 1:N items                  |
| `order_revisions`, `order_revision_items`, `order_revision_item_customizations` | 已授權訂單修改版本             | Order 1:N revisions；revision 1:N items                    |
| `payment_authorizations`                                            | 付款預授權紀錄                 | Order 1:N authorizations                                   |
| `payment_captures`                                                  | 請款結果                       | Authorization/order 1:N captures                           |
| `payment_provider_events`                                           | 金流 provider event 原始紀錄   | 以邏輯方式關聯付款資源，保留未來 webhook 擴充空間           |
| `activity_settlements`                                              | 截止後結算結果與適用門檻       | Activity 1:1 settlement                                    |
| `pickup_credentials`                                                | 訂單取貨憑證                   | Order 1:1 credential                                       |
| `status_history`                                                    | 狀態變更歷程與原因             | Polymorphic resource reference                             |
| `audit_logs`                                                        | 敏感操作紀錄                   | Polymorphic resource reference                             |

## 目前資料保存狀態

- Backend 已經會讀寫 `group_buy_activities`、`promotion_tiers`、`activity_notices`、`status_history` 與 `audit_logs`，用於目前已實作的活動 API。
- Seed data 會建立 users、roles、一組或多組 merchant/store、menu items、activities 與 tiers。
- `orders`、`order_revisions`、payment、settlement、pickup 相關資料表目前仍偏向候選設計與付款模組串接準備，尚未完整連到所有 mobile 流程。
- `payment_authorizations.provider` 目前支援 `line_pay` 與本機測試用 `mock_line_pay`；`mock_line_pay` 只用於開發 smoke 測試，不代表正式金流。
- `database/test/` 是舊 prototype fixture database，不應視為正式 schema 或目前 mobile 的權威資料來源。
- 購物車與訂單客製化資料已朝 first normal form 調整：甜度、冰塊、加料與尺寸以 child rows 表示，不以 JSON array 當主要資料結構。
- 活動容量目前由最高 `promotion_tiers.target_cups` 推導；除非未來明確新增獨立容量規則，`group_buy_activities.maximum_cups` 應與最高門檻一致。

## 已確認的業務規則

- 正式登入只使用 Firebase Auth + Google Login。
- Mobile 不顯示角色選擇，使用者不能自行選顧客、店家或管理員。
- Backend 驗證 Firebase ID token 後，依 `users.firebase_uid`、`user_roles` 與 `merchant_users` 決定身份。
- 顧客送出訂單並完成 LINE Pay 預授權後，訂單即納入團購杯數統計。
- 店家不需要逐筆確認接單，也不能任意取消單一已預授權訂單。
- 顧客可在截止前 30 分鐘以前修改訂單或退出團購；進入截止前 30 分鐘後不可修改或退出。
- 店家可在截止前 30 分鐘以前取消整個團購；進入截止前 30 分鐘後不可取消。
- 團購截止時間必須在建立或發布後 24 小時內。
- 取餐時間由店家開團時設定，顧客加入前可見；取餐開始至少晚於截止時間 15 分鐘，表單預設為截止後 30 分鐘。
- 取貨憑證自取餐開始時間起保留 3 小時；若店家當日營業結束早於 3 小時，則保留至當日營業結束；24 小時營業店家保留 3 小時。
- 取貨憑證到期後，訂單移至歷史訂單；逾期未取不自動退款，店家不再負原飲品保管責任。
- 若顧客修改已預授權訂單，採 replacement flow：舊預授權先保留，新預授權成功後才替換；新預授權失敗時，原訂單與原預授權維持有效。

## 已知 schema 缺口

| 範圍                    | 缺口或待決策項目                                                                                                      |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Order revision          | `order_revisions` 第一版已建立並支援 replacement authorization；仍缺完整歷史查詢 API 與 mobile UI 串接。              |
| Pricing snapshot        | 實際適用門檻、折扣分配與請款金額需要可重現，目前仍需補強欄位或 settlement 設計。                                      |
| Activity deadline       | 24 小時截止限制已先落到商家建立團購 API；截止前 30 分鐘鎖定規則仍需落到訂單修改 / 退出與取消 API。                   |
| Merchant acceptance     | `orders.merchant_acceptance_status` 是早期候選欄位；最新規則不需要店家逐筆確認接單，未來可考慮移除或固定為 accepted。 |
| Pickup status           | Mobile 曾使用 `preparing`，目前 schema 沒有該值；應優先用 activity/order 狀態與 `pickup_status = ready` 表示。        |
| Pickup credential expiry | `pickup_credentials` 目前缺 `expires_at` / `expired_at`；取貨 API 實作時需補憑證到期時間與逾期處理紀錄。              |
| Store/menu source       | 七間店家的測試資料與正式開發資料需統一來源。                                                                          |
| Authentication          | Password 欄位屬於開發相容；正式方向以 Firebase UID 對應 backend user 與角色權限。                                     |
| Notification            | 尚未有通知 delivery 或 notification event 資料表。                                                                    |
| Migrations              | 目前 SQLite schema 可重建，尚未有正式 production migration history。                                                  |
| Test fixture            | `database/test/` 仍有 JSON 欄位供 prototype 匯出，不是權威 normalized schema。                                        |

## 2026-07-05 Authentication 資料庫方向

- Firebase Auth 負責 Google Login 與身份證明。
- Backend database 仍負責 app identity、roles、merchant-store permissions、orders、payments 與 audit history。
- 權威對應欄位是 `users.firebase_uid`。
- Backend 查詢應優先使用 `users.firebase_uid`。Email 可以作為首次連結帳號的輔助依據，但不應成為永久唯一身份鍵。
- Password 相關欄位可在開發期間保留，但正式 Google-only login 不應依賴 password。
- Seed data 應逐步補上 Firebase UID placeholder 或明確的本機開發 mapping。
- 開發期間測不同角色時，每個測試身份應 seed 一個 `firebase_uid`；角色仍由 `user_roles` 決定，店家門市權限仍由 `merchant_users` 決定。

## 後續需要的交易邊界

1. 送出訂單：驗證活動、菜單、價格、剩餘容量，建立 order/items，並啟動 LINE Pay 預授權。
2. 修改已預授權訂單：保存 revision，進行 replacement authorization，避免杯數重複計算或超過上限。
3. 截止結算：鎖定活動與合格訂單，計算 authorized cups，選擇適用 tier，保存 settlement，並以 idempotent 方式 capture/void payment。
4. 取消活動：只允許截止前 30 分鐘以前取消，取消 eligible orders，處理 authorizations，寫入 history 與 audit log。
5. 取貨：驗證 pickup credential，確認尚未過期，更新 pickup/order completion，並寫入 status history。
6. 取貨逾期：依 `expires_at` 或等效規則將未取貨訂單更新為 `pickup_status = expired`，移至歷史訂單並寫入 status history。
