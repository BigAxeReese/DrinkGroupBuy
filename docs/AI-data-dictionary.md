# 資料字典

最後更新：2026-08-05

## 語言規則

本文件用來整理專案詞彙，避免同一個概念在 mobile、API、database 使用不同名稱。

- 中文詞彙用於報告、文件與畫面說明，不作為程式命名來源。
- Mobile / API 使用英文 `camelCase`。
- Database 使用英文 `snake_case`。
- 同一概念要固定一組英文命名，再用中文註解輔助理解。
- 本文件部分早期中文詞彙可能有編碼亂碼；若要交報告，建議以 `docs/AI-database-design-v1.md` 的命名為準重新整理。

本文件定義建議使用的產品詞彙，用來維持 mobile UI、API JSON 與 database 命名一致。

## 核心詞彙

| 中文詞彙         | 意義                            | Mobile / API (`camelCase`)       | Database (`snake_case`)               | 備註                                         |
| ---------------- | ------------------------------- | -------------------------------- | ------------------------------------- | -------------------------------------------- |
| 使用者           | 擁有一個或多個角色的人          | `user`, `userId`                 | `users`, `user_id`                    | 第一階段正式 App 使用 `customer`、`merchant`；`admin` 僅作開發或後端補救工具 |
| 使用者角色       | 掛在使用者身上的權限角色        | `userRole`, `role`               | `user_roles`, `role`                  | 第一階段正式 App 使用顧客與商家角色；管理員僅作開發或後端補救工具 |
| 商家             | 商業組織                        | `merchant`, `merchantId`         | `merchants`, `merchant_id`            | 不等同實體店家或門市                         |
| 門市 / 店家      | 實體下單與取貨地點              | `store`, `storeId`               | `stores`, `store_id`                  | 優先使用 `store`，避免再引入 `shop`          |
| 菜單品項         | 店家販售的飲品或商品            | `menuItem`, `menuItemId`         | `menu_items`, `menu_item_id`          | 基本價格存放於此                             |
| 客製化選項       | 甜度、冰塊、加料或尺寸選項      | `customizationOption`            | `customization_options`               | 部分選項可能加價                             |
| 客製化選擇規則   | 每個品項、選項類型的最少與最多選擇數 | `menuItemCustomizationRule` | `menu_item_customization_rules` | 由店家設定，Backend 驗證為準 |
| 團購活動         | 商家建立的團購事件              | `groupBuyActivity`, `activityId` | `group_buy_activities`, `activity_id` | Mobile prototype 已改用此命名；舊 `deal` 僅作相容或測試表脈絡 |
| 優惠級距         | 杯數門檻與總折扣金額            | `promotionTier`, `tierId`        | `promotion_tiers`, `tier_id`          | 例如 20 杯共折 200 元                        |
| 活動注意事項     | 顯示於活動詳情的商家備註        | `activityNotice`                 | `activity_notices`                    | 多筆注意事項分開儲存                         |
| 購物車草稿       | 已選擇但尚未送出成訂單的品項    | `cartDraft`, `cartDraftId`       | `cart_drafts`, `cart_draft_id`        | 用於付款預授權前                             |
| 購物車品項       | 購物車草稿中的一杯飲料          | `cartDraftItem`                  | `cart_draft_items`                    | 客製化內容以 child rows 儲存                 |
| 購物車客製化明細 | 購物車品項的一個已選選項        | `cartDraftItemCustomization`     | `cart_draft_item_customizations`      | 讓購物車資料符合 first normal form           |
| 訂單             | 顧客參與某一個團購活動的紀錄    | `order`, `orderId`               | `orders`, `order_id`                  | 包含一個或多個訂單品項                       |
| 訂單品項         | 訂單中的單杯飲料 snapshot       | `orderItem`, `orderItemId`       | `order_items`, `order_item_id`        | 保留品項名稱與價格 snapshot                  |
| 訂單客製化明細   | 訂單品項的一個已選選項 snapshot | `orderItemCustomization`         | `order_item_customizations`           | 甜度、冰塊、加料與尺寸以 rows 保存           |
| 訂單修改版本     | 已授權訂單重新預授權前的待確認快照 | `orderRevision` | `order_revisions` 與 revision item tables | 新授權成功後才套用 |
| 訂單操作冪等紀錄 | 防止取消等敏感操作重複執行 | `orderActionIdempotency` | `order_action_idempotency` | 保存 action、key 與結果 |
| 原價金額         | 折扣前計算出的金額              | `originalAmount`                 | `original_amount`                     | 台幣整數金額                                 |
| 預授權金額       | 金流服務商已授權的金額          | `authorizedAmount`               | `authorized_amount`                   | 尚未請款                                     |
| 最終金額         | 最終優惠級距計算後的金額        | `finalAmount`                    | `final_amount`                        | 在結算時決定                                 |
| 請款金額         | 實際請款金額                    | `captureAmount`                  | `capture_amount`                      | 不得超過有效授權金額                         |
| 釋放金額         | 已授權但未請款的金額            | `releasedAmount`                 | `released_amount`                     | 實際釋放時間取決於 provider/bank             |
| 付款預授權       | 金流服務商的付款授權嘗試        | `paymentAuthorization`           | `payment_authorizations`              | 目標流程類似 LINE Pay authorization          |
| 付款請款         | 活動結算後的 capture            | `paymentCapture`                 | `payment_captures`                    | 可能是 partial capture                       |
| 付款可靠性工作   | Provider 對帳或活動結算的持久化工作 | `paymentReliabilityJob` | `payment_reliability_jobs` | 狀態為 queued／running／retry_wait／succeeded／failed／cancelled |
| 跨執行個體租約   | 保護 provider 操作與整團結算的短期鎖 | `operationLock` | `operation_locks` | 以 `locked_until` 判斷能否由其他 worker 接手 |
| 付款退款         | 已請款交易的全額或部分退款紀錄 | `paymentRefund` | `payment_refunds` | 與 void 未請款授權不同 |
| 退款申請         | 商家對已請款訂單提出的退款申請，待營運審核 | `refundRequest`, `refundRequestId` | `refund_requests` | 狀態 `pending`／`approved`／`rejected`；核准後才實際呼叫 provider 並產生一筆 `payment_refunds`，同一筆請款同時只允許一筆 `pending` 申請 |
| 金流服務商       | 處理付款的第三方 provider        | `provider`                       | `provider`                            | 目前值：`line_pay`、`ecpay`（及對應 `mock_line_pay`、`mock_ecpay` 測試值）；ECPay 為 2026-08-05 新增的備用 provider，與 LINE Pay 並存 |
| 金流事件         | Provider event payload          | `paymentProviderEvent`           | `payment_provider_events`             | 用於 idempotency 與 reconciliation；未來可包含 webhook |
| 活動結算         | 截止結果與套用級距              | `activitySettlement`             | `activity_settlements`                | 應只建立一次且可稽核                         |
| 商家接單狀態     | 舊候選：商家是否接受製作        | `merchantAcceptanceStatus`       | `merchant_acceptance_status`          | 最新規則不需逐筆接單；可固定 accepted 或後續移除 |
| 取貨狀態         | 製作與取貨生命週期              | `pickupStatus`                   | `pickup_status`                       | `ready` 代表可以顯示取貨碼                   |
| 取貨憑證         | 顧客取貨時使用的 code/QR        | `pickupCredential`, `pickupCode` | `pickup_credentials`, `pickup_code`   | 必須只屬於一筆訂單                           |
| 狀態歷史         | 不可變更的狀態轉換紀錄          | `statusHistory`                  | `status_history`                      | 包含 actor、reason 與 timestamp              |
| 稽核紀錄         | 敏感操作者與操作紀錄            | `auditLog`                       | `audit_logs`                          | payment、cancellation、權限與後端補救操作都需要 |

## 衍生值

| 詞彙           | 意義                               | 規則                                          |
| -------------- | ---------------------------------- | --------------------------------------------- |
| 已預授權杯數   | 付款預授權成功訂單的杯數           | 只計算付款狀態已授權的訂單                    |
| 下一級目標杯數 | 高於目前已預授權杯數的最低優惠級距 | 例如目前 25 杯、級距 20/30/40，畫面顯示 30    |
| 剩餘杯數       | 達到下一個顯示目標還需要的杯數     | `nextTargetCups - authorizedCups`，最小值為 0 |
| 是否達標       | 活動是否達到優惠級距               | 依截止時的已預授權杯數，或目前顯示進度判斷    |

## 正規化備註

- 核心交易資料應避免把多個已選選項塞進同一個 JSON/text 欄位。
- 購物車品項與訂單品項的客製化內容以 child rows 儲存，讓一列代表一個已選選項。
- `payment_provider_events.payload_json` 與 `audit_logs.metadata_json` 保留外部事件與稽核 payload 原文，不作為主要查詢用業務欄位。

## 棄用或舊版詞彙

| 舊詞彙                       | 建議替代名稱                              | 原因                                      |
| ---------------------------- | ----------------------------------------- | ----------------------------------------- |
| `deal`                       | `groupBuyActivity` / `activity`           | UI 簡稱在 backend/database 工作中容易混淆 |
| activity 使用的 `groupOrder` | `groupBuyActivity`                        | order 屬於顧客；activity 屬於店家         |
| `shop`                       | `store`                                   | 目前 schema 與 mobile mock 使用 `store`   |
| `discountTier`               | `promotionTier`                           | 與目前 database table 一致                |
| `paymentReport`              | `paymentAuthorization` / `paymentCapture` | 手動匯款回報流程已不是目標付款模型        |

## 命名規則

- Mobile 變數與 API JSON 使用 `camelCase`。
- Database tables 與 columns 使用 `snake_case`。
- 跨 API 邊界的 status values 使用與 database 相容的 `snake_case` values。
- 除非未來核准多幣別需求，金額一律使用台幣整數。
