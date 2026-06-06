# API Candidates Derived From Frontend Prototype

## 重要聲明

本文件整理 mobile prototype 與目前資料庫規劃推導出的 API candidates。以下 method、path、request 與 response 都是 candidate，仍需在正式 backend 實作前確認。

- Candidate JSON 欄位暫以 `camelCase` 表示。
- 目前 prototype 不呼叫 API、不做登入授權、不串地圖、通知或金流。
- `deal`、`activity`、狀態值與付款方案仍需先統一，請參考 `docs/open-questions.md`。

## Implemented Screen Candidates

### NearbyDealsPage：瀏覽附近團購

| 項目 | 內容 |
| --- | --- |
| related screen | `NearbyDealsPage` / 附近優惠團購 |
| user action | 開啟首頁、以位置與篩選條件瀏覽活動、點選活動詳情 |
| method | `GET` |
| path candidate | `/activities` |
| request candidate | query: `{ latitude, longitude, radiusMeters, publicStatus, sortBy }` |
| response candidate | `{ "activities": [{ "activityId": "act_001", "title": "午後珍奶團購", "shop": { "shopId": "shop_001", "name": "測試店家", "distanceMeters": 350, "businessStatus": "open" }, "status": "recruiting", "currentCups": 12, "minimumThresholdCups": 20, "nextTier": { "targetCups": 20, "discountAmount": 400 }, "maximumCups": 40, "deadlineAt": "...", "canJoin": true }] }` |
| business rule dependency | 首頁公開哪些活動狀態；距離來源；額滿但未截止是否仍公開；`minimumThresholdCups` 與 `nextTier` 的意義 |
| uncertainty | prototype 目前亦顯示流團及取消活動；正式首頁是否只列可加入活動尚未定案 |

### DealDetailPage：查看團購詳情

| 項目 | 內容 |
| --- | --- |
| related screen | `DealDetailPage` / 團購活動詳情 |
| user action | 查看店家資料、所有優惠級距、進度、注意事項與加入資格 |
| method | `GET` |
| path candidate | `/activities/:activityId` |
| request candidate | path: `{ activityId }` |
| response candidate | `{ "activityId": "act_001", "title": "午後珍奶團購", "shop": { "shopId": "shop_001", "name": "測試店家", "address": "...", "phone": "...", "businessStatus": "open", "distanceMeters": 350 }, "status": "recruiting", "currentCups": 12, "participantCount": 7, "promotionTiers": [{ "tierId": "tier_001", "targetCups": 20, "discountAmount": 400 }], "nextTier": { "tierId": "tier_001", "remainingCups": 8 }, "maximumCups": 40, "deadlineAt": "...", "pickupWindow": { "startAt": "...", "endAt": "..." }, "canJoin": true, "notices": [], "cancellation": null }` |
| business rule dependency | 可加入判定；折扣只採最高已達級距或可累加；取消原因公開範圍；參與人數是否公開 |
| uncertainty | 目前 prototype 將第一門檻作為 `targetCups` 顯示，無法完整表達目前套用及下一級距 |

### DrinkSelectionPage：取得飲料與客製化選項

| 項目 | 內容 |
| --- | --- |
| related screen | `DrinkSelectionPage` / 飲品選擇與客製化 |
| user action | 載入活動可訂購飲品、選擇甜度/冰量/加料、前端試算小計 |
| method | `GET` |
| path candidate | `/activities/:activityId/menu` |
| request candidate | path: `{ activityId }` |
| response candidate | `{ "activityId": "act_001", "shopId": "shop_001", "items": [{ "menuItemId": "item_001", "name": "珍珠奶茶", "category": "奶茶", "basePrice": 65, "isAvailable": true, "sweetnessOptions": ["微糖"], "iceOptions": ["少冰"], "toppings": [{ "toppingId": "top_001", "name": "珍珠", "extraPrice": 10 }] }] }` |
| business rule dependency | 菜單是店家共用或活動快照；停售是否影響已加入訂單；加料是否依飲品限制 |
| uncertainty | prototype 僅支援一次選一品項及一種加料，是否符合正式訂單模式未知 |

### DrinkSelectionPage：加入團購

| 項目 | 內容 |
| --- | --- |
| related screen | `DrinkSelectionPage` / 飲品選擇與客製化 |
| user action | 選定飲品、數量與流團原價偏好後點擊「加入團購」 |
| method | `POST` |
| path candidate | `/activities/:activityId/orders` |
| request candidate | `{ "items": [{ "menuItemId": "item_001", "quantity": 2, "sweetness": "微糖", "ice": "少冰", "toppingSelections": [{ "toppingId": "top_001", "quantity": 1 }] }], "fallbackPurchasePreference": "declineOriginalPrice" }` |
| response candidate | `{ "orderId": "order_001", "activityId": "act_001", "orderStatus": "submitted", "subtotalAmount": 150, "totalCups": 2, "activityProgress": { "currentCups": 14, "nextTierRemainingCups": 6, "canJoin": true }, "paymentNextStep": "undecided" }` |
| business rule dependency | 截止/額滿下的併發加入驗證；同顧客能否多筆加入；流團偏好能否修改；付款授權時機 |
| uncertainty | 是否在加入時建立預授權，以及多人同時加入造成超過最高杯數時的處理尚未定案 |

### GroupProgressPage：團購進度與我的訂單摘要

| 項目 | 內容 |
| --- | --- |
| related screen | `GroupProgressPage` / 團購進度 |
| user action | 查看目前杯數、參與人數、優惠差距、結果與自己的訂單摘要 |
| method | `GET` |
| path candidate | `/activities/:activityId/progress` |
| request candidate | path: `{ activityId }`; query candidate: `{ includeMyOrder: true }` |
| response candidate | `{ "activityId": "act_001", "status": "recruiting", "currentCups": 12, "participantCount": 7, "minimumThresholdCups": 20, "maximumCups": 40, "nextTier": { "targetCups": 20, "remainingCups": 8 }, "appliedTier": null, "deadlineAt": "...", "myOrder": { "orderId": "order_001", "items": [], "subtotalAmount": 150, "fallbackPurchasePreference": "declineOriginalPrice", "availableNextSteps": [] } }` |
| business rule dependency | 成團/流團判定；折扣套用與捨入；付款及取貨頁何時可進入；公開進度與個人資料權限 |
| uncertainty | prototype 固定連至另一筆付款/取貨 mock；正式 API 必須回傳與目前訂單一致的可用下一步 |

### PaymentReportPage / PaymentAuthorizationScreen：查看預授權資訊

| 項目 | 內容 |
| --- | --- |
| related screen | `PaymentReportPage` legacy name；mobile candidate name: `PaymentAuthorizationScreen` |
| user action | 查看原價、預授權金額、授權狀態、達標後請款金額與釋放差額 |
| method | `GET` |
| path candidate | `/orders/:orderId/payment-authorization` |
| request candidate | path: `{ orderId }` |
| response candidate | `{ "orderId": "order_001", "mode": "onlineAuthorization", "originalAmount": 70, "authorizedAmount": 70, "authorizationStatus": "authorized", "paymentStatus": "authorized", "discountStatus": "qualified", "finalAmount": 58, "captureAmount": 58, "releasedAmount": 12 }` |
| business rule dependency | 僅預授權尚未扣款；只有 authorized 訂單杯數計入優惠門檻；達標後才能以優惠價 partial capture |
| uncertainty | 手動回報方案已視為 legacy candidate；正式 contract 前不應與預授權 response 混用 |

### PaymentReportPage：送出手動付款回報 Candidate（Legacy）

| 項目 | 內容 |
| --- | --- |
| related screen | `PaymentReportPage` / 付款資訊與付款回報 Mock |
| user action | 輸入末五碼、選擇付款截圖、送出回報 |
| method | `POST` |
| path candidate | `/orders/:orderId/payment-reports` |
| request candidate | multipart candidate: `{ transferLastFiveDigits, screenshotFile, note }` |
| response candidate | `{ "paymentReportId": "report_001", "orderId": "order_001", "reviewStatus": "submitted", "submittedAt": "..." }` |
| business rule dependency | 僅在採手動付款模式時存在；檔案隱私、保留期限、商家審核權限 |
| uncertainty | 若產品改採預授權支付，本 endpoint 不應建立 |

### PickupInfoPage：查看取貨資訊

| 項目 | 內容 |
| --- | --- |
| related screen | `PickupInfoPage` / 到店個別取貨 |
| user action | 查看店家、地址、取貨時間、訂單摘要、取貨狀態與異動提示 |
| method | `GET` |
| path candidate | `/orders/:orderId/pickup` |
| request candidate | path: `{ orderId }` |
| response candidate | `{ "orderId": "order_001", "shop": { "name": "測試店家", "address": "..." }, "pickupWindow": { "startAt": "...", "endAt": "..." }, "orderSummary": "珍珠奶茶 x2", "pickupStatus": "readyForPickup", "updateNotice": null, "pickupIdentifier": null }` |
| business rule dependency | 僅成立且需履約的個人訂單可取貨；識別/核銷方式；商家修改取貨時間的規則 |
| uncertainty | prototype 有異動提示 placeholder，但通知與異動歷史尚未定案 |

### MerchantDealCreatePage：列出可管理店家

| 項目 | 內容 |
| --- | --- |
| related screen | `MerchantDealCreatePage` / 商家建立優惠活動 |
| user action | 開啟表單並選擇要發布活動的門市 |
| method | `GET` |
| path candidate | `/merchant/shops` |
| request candidate | none |
| response candidate | `{ "shops": [{ "shopId": "shop_001", "name": "測試店家", "canCreateActivity": true }] }` |
| business rule dependency | 商家身分及門市授權；一位商家是否管理多門市 |
| uncertainty | prototype 可直接選所有 mock stores，不代表正式授權範圍 |

### MerchantDealCreatePage：建立活動

| 項目 | 內容 |
| --- | --- |
| related screen | `MerchantDealCreatePage` / 商家建立優惠活動 |
| user action | 輸入門市、活動名稱、時間、優惠門檻及注意事項後建立活動 |
| method | `POST` |
| path candidate | `/merchant/activities` |
| request candidate | `{ "shopId": "shop_001", "title": "午後珍奶團購", "startAt": "...", "deadlineAt": "...", "pickupWindow": { "startAt": "...", "endAt": "..." }, "promotionTiers": [{ "targetCups": 20, "discountAmount": 400 }], "notices": ["個別到店取貨"] }` |
| response candidate | `{ "activityId": "act_001", "status": "recruiting", "promotionTiers": [{ "tierId": "tier_001", "targetCups": 20, "discountAmount": 400 }], "maximumCups": 20, "createdAt": "..." }` |
| business rule dependency | 是否支援多級距；級距驗證；截止/取貨時間限制；發布後可修改欄位 |
| uncertainty | prototype 表單只有單級距，但詳情需求要求多級距 |

### MerchantDealDashboardPage：商家活動摘要

| 項目 | 內容 |
| --- | --- |
| related screen | `MerchantDealDashboardPage` / 商家活動與參與狀態 |
| user action | 查看自己門市的活動清單、杯數、訂單與付款/取貨摘要 |
| method | `GET` |
| path candidate | `/merchant/activities` |
| request candidate | query: `{ shopId, status, page }` |
| response candidate | `{ "activities": [{ "activityId": "act_001", "shopName": "測試店家", "title": "午後珍奶團購", "status": "recruiting", "currentCups": 12, "minimumThresholdCups": 20, "maximumCups": 40, "orderCount": 7, "paymentSummary": { "confirmedCount": 0, "pendingCount": 7 }, "pickupSummary": { "readyCount": 0, "pickedUpCount": 0 } }] }` |
| business rule dependency | 商家可見門市範圍；付款與取貨摘要統計口徑；是否包含取消及歷史活動 |
| uncertainty | prototype 只以簡單計數示意，未定義每個狀態進入摘要的時機 |

## Follow-On Flow Candidates Not Yet Implemented As Pages

以下 endpoint 不是目前八頁已提供的操作，而是畫面缺口或風險檢查推導出的 candidate。

### Planned My Orders：修改訂單

| 項目 | 內容 |
| --- | --- |
| method | `PATCH` |
| path candidate | `/orders/:orderId` |
| related screen | 規劃中的我的訂單頁 |
| user action | 截止前修改杯數或流團原價偏好 |
| request candidate | `{ "items": [{ "orderItemId": "item_001", "quantity": 3 }], "fallbackPurchasePreference": "acceptOriginalPrice" }` |
| response candidate | `{ "orderId": "order_001", "revisionId": "rev_002", "subtotalAmount": 225, "activityProgress": { "currentCups": 15 } }` |
| business rule dependency | 截止前可修改範圍、價格重算及是否調整付款授權 |
| uncertainty | 該頁尚未實作；是否保存完整修改歷史未定 |

### Planned My Orders：退出團購

| 項目 | 內容 |
| --- | --- |
| method | `POST` |
| path candidate | `/orders/:orderId/leave` |
| related screen | 規劃中的我的訂單頁 |
| user action | 截止前退出團購 |
| request candidate | `{ "reason": null }` |
| response candidate | `{ "orderId": "order_001", "orderStatus": "cancelled", "activityProgress": { "currentCups": 10, "canJoin": true } }` |
| business rule dependency | 額滿後是否重新開放、付款授權釋放、取消訂單是否保留 |
| uncertainty | 該頁尚未實作；退出與取消命名未定 |

### Planned Merchant Detail：商家取消活動

| 項目 | 內容 |
| --- | --- |
| method | `POST` |
| path candidate | `/merchant/activities/:activityId/cancellations` |
| related screen | 規劃中的商家活動詳情頁 |
| user action | 商家填寫原因並取消自己的活動 |
| request candidate | `{ "reason": "設備維修", "note": "" }` |
| response candidate | `{ "activityId": "act_001", "status": "cancelled", "cancelledAt": "...", "cancellationReason": "設備維修" }` |
| business rule dependency | 取消權限、取消後付款/取貨/通知處理與原因公開範圍 |
| uncertainty | 取消之後是否需補償或人工覆核尚未定 |

### Planned Online Payment：建立預授權

| 項目 | 內容 |
| --- | --- |
| method | `POST` |
| path candidate | `/orders/:orderId/payment-authorizations` |
| related screen | 付款資訊頁的線上支付替代方向 |
| user action | 顧客建立線上支付預授權 |
| request candidate | `{ "provider": "linePay", "authorizedAmount": 85 }` |
| response candidate | `{ "authorizationId": "auth_001", "paymentStatus": "authorized", "authorizedAmount": 85 }` |
| business rule dependency | 支付 provider 能力、授權金額及加入訂單與授權的完成順序 |
| uncertainty | 是否取代目前手動付款回報頁尚未決定 |

### Planned Online Payment：查詢請款或釋放結果

| 項目 | 內容 |
| --- | --- |
| method | `GET` |
| path candidate | `/orders/:orderId/payment-status` |
| related screen | 付款資訊頁的線上支付替代方向；團購進度頁下一步 |
| user action | 顧客查看截止後實際請款或授權釋放結果 |
| request candidate | path: `{ orderId }` |
| response candidate | `{ "paymentStatus": "captured", "authorizedAmount": 85, "capturedAmount": 65, "releasedAt": null, "failureReason": null }` |
| business rule dependency | 成團/流團結果、原價偏好、取消與授權釋放規則 |
| uncertainty | 狀態命名、商家是否另需確認及 payment history 呈現尚未定案 |

## Cross-Cutting API Risks

| 風險 | API candidate 需要表達的內容 | 未決重點 |
| --- | --- | --- |
| 畫面只顯示取消結果 | response 可能需要 `cancellation.reason`, `cancelledBy`, `cancelledAt` | 原因公開給顧客的範圍 |
| 畫面只顯示成團/流團結果 | progress response 可能需要 `outcomeReason`, `appliedTier`, `settlementSnapshot` | 部分顧客原價履約時活動結果如何表達 |
| 狀態歷史 | 管理畫面日後可能需 history endpoint | 是否保存完整流轉或只保存重要事件 |
| 付款審核 | 手動回報方案需要 report/review endpoint | 與預授權模式是否互斥 |
| 訂單修改 | update endpoint 需回傳新杯數與重新試算 | 是否保存修改前後差異 |
| 優惠套用 | result response 需明示 applied tier 與個人折抵 | 捨入及快照時點 |
| 取貨異動 | pickup response 需有目前時段及異動提示 | 是否另提供 history |
| 通知 | 本輪不建 endpoint | 日後事件發送與已讀紀錄範圍 |
| 併發加入 | submit response 需處理滿額/截止競爭錯誤 | 如何避免超過最高杯數 |
| 交易一致性 | 加入、進度更新、付款建立不能呈現矛盾結果 | 哪些操作必須在同一交易或補償流程完成 |
## Mobile Prototype Candidate Addendum

These candidates are derived from `mobile/` Android-first prototype screens. They are not real APIs and are not implemented.

| Related screen | User action | Method | Path candidate | Request candidate | Response candidate | Business rule dependency | Uncertainty |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RoleSelectScreen | Choose prototype role | NONE now; future GET/POST candidate | Future `/mobile/session/role` or `/mobile/auth/me` | Future auth token or selected role | Available roles and profile scope | Real login and authorization | Whether customer and merchant are same account |
| NearbyDealsScreen | Browse nearby deals | GET | `/mobile/deals/nearby` | `lat`, `lng`, `radius`, `statusFilter` | Nearby stores and deal cards | Location permission, joinable visibility, store registration | Whether to include cancelled/full deals |
| DealDetailScreen | View deal details | GET | `/mobile/deals/:dealId` | path `dealId` | Store, deal, tiers, status, notices | Public/private fields and cancellation reason rules | Canonical term deal/activity/group-buy |
| DrinkSelectionScreen | Load store menu | GET | `/mobile/stores/:storeId/menu` | path `storeId` | Drinks, options, toppings | Menu ownership and availability | Multi-item and topping quantity rules |
| DrinkSelectionScreen | Join group buy | POST | `/mobile/deals/:dealId/orders` | drink item, customizations, quantity, fallback preference | Order summary, payment next step, progress snapshot | Deadline, max cups, concurrency, payment preauthorization | Whether payment auth is required immediately |
| GroupProgressScreen | View progress and my order | GET | `/mobile/deals/:dealId/progress` | path `dealId`, optional `orderId` | Aggregate progress plus user order summary | Visibility and settlement rules | Public vs private response split |
| PaymentReportScreen | View Line Pay payment info | GET | `/mobile/orders/:orderId/payment` | path `orderId` | Amount due, payment status, Line Pay provider info, QR/payment token candidate | Online payment provider flow | Exact Line Pay integration mode not decided |
| PaymentReportScreen | Simulate provider payment completion | POST | `/mobile/orders/:orderId/payments/line-pay/confirm` | provider transaction reference candidate | Payment status and provider result | Line Pay authorization/capture/cancel rules | Callback/webhook design not decided |
| PickupInfoScreen | View pickup info | GET | `/mobile/orders/:orderId/pickup` | path `orderId` | Pickup window, status, instructions | Payment and settlement eligibility | Pickup verification method |
| MerchantDealCreateScreen | List merchant stores | GET | `/mobile/merchant/stores` | authenticated merchant candidate | Authorized stores | Merchant authorization | Login not implemented |
| MerchantDealCreateScreen | Create activity | POST | `/mobile/merchant/deals` | store, title, tiers, end time, pickup time, notes | Created activity summary | Store ownership, tier validation | Editable fields after publish |
| MerchantDashboardScreen | View merchant activity list | GET | `/mobile/merchant/deals` | merchant scope | Activity summaries and counts | Store authorization and summary definitions | Customer data visibility |
| MerchantDashboardScreen | Cancel activity | POST | `/mobile/merchant/deals/:dealId/cancel` | reason | Cancelled status and payment/pickup impact | Cancellation, audit, notification | Not yet in first screen actions |

### Mobile Interaction Addendum

| Related screen | User action | Method | Path candidate | Request candidate | Response candidate | Business rule dependency | Uncertainty |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RoleSelectScreen | Enter customer or merchant flow | Future GET | `/mobile/me/roles` | authenticated user candidate | `roles[]`, default role, store memberships | Real auth and account model | Prototype currently has no login |
| DrinkSelectionScreen | Confirm join group buy and update progress | POST | `/mobile/deals/:dealId/orders` | `drinkId`, `sweetness`, `ice`, `toppings[]`, `quantity`, `fallbackPurchasePreference` | Created order, updated progress, payment requirement | Deadline lock, max cup cap, concurrent joins, payment authorization | Whether order create and payment authorization must be one transaction |
| GroupProgressScreen | Read aggregate progress plus my latest order | GET | `/mobile/deals/:dealId/progress?orderId=:orderId` | `dealId`, optional `orderId` | Deal status, cups, target, next gap, private order summary | Public/private data split | Whether order summary belongs in same response |
| PaymentReportScreen | Complete Line Pay payment mock | POST | `/mobile/orders/:orderId/payments/line-pay/confirm` | provider reference candidate | Payment status `confirmed` | Provider callback, idempotency, cancellation, refund | Current prototype is only local state |
| PickupInfoScreen | Read pickup info with my order summary | GET | `/mobile/orders/:orderId/pickup` | `orderId` | Pickup status, store, pickup time, order summary | Payment and settlement gating | Whether unpaid orders can see pickup details |
| MerchantDealCreateScreen | Create merchant deal and return dashboard summary | POST | `/mobile/merchant/deals` | `storeId`, `title`, `tiers[]: { cups, discountAmount }`, `startTime`, `endTime`, `pickupTime`, `notices` | Created deal with sorted tiers and merchant dashboard summary | Merchant store ownership, tier ordering/uniqueness, time validation | Whether highest tier is also the hard maximum cup cap |
| MerchantDashboardScreen | Refresh runtime summaries | GET | `/mobile/merchant/deals/summary` | merchant scope | Activity cards, order count, payment summary, pickup summary | Merchant authorization and customer privacy | Whether summaries are computed live or materialized |

## Authorization And Partial Capture Addendum

These are candidate APIs only. The mobile prototype still uses local mock state and does not call any real API or payment provider.

| Related screen | User action | Method | Path candidate | Request candidate | Response candidate | Business rule dependency | Uncertainty |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DrinkSelectionScreen | Submit order and begin payment authorization candidate | POST | `/mobile/deals/:dealId/orders/authorize` | `drinkId`, `quantity`, `customizations`, `originalAmount`, `fallbackPreference` | `orderId`, `paymentStatus: authorized`, `authorizationStatus: authorized`, `authorizedAmount`, updated `authorizedCups` | Order creation and authorization may need one atomic transaction | Provider authorization might require redirect/deep link instead of same API response |
| PaymentReportScreen / PaymentAuthorizationScreen candidate | Read authorization and capture state | GET | `/mobile/orders/:orderId/payment-authorization` | path `orderId` | `originalAmount`, `authorizedAmount`, `authorizationStatus`, `finalAmount`, `captureAmount`, `releasedAmount`, `paymentStatus` | Customer can only read own payment state | Screen name and endpoint naming are not final |
| GroupProgressScreen | Read discount progress based on authorized cups | GET | `/mobile/deals/:dealId/authorized-progress` | path `dealId`, optional `orderId` | `targetCups`, `authorizedCups`, `remainingAuthorizedCups`, `discountStatus`, optional my order payment summary | Only authorized payments count toward threshold | Whether progress is computed live or cached |
| PaymentReportScreen | Void authorization when group fails | POST | `/mobile/orders/:orderId/payment-authorizations/:authorizationId/void` | `reason: group_failed` | `paymentStatus: authorization_voided`, `authorizationStatus: authorization_voided` | Deadline settlement must determine failed deals | Provider void behavior and expiry rules differ |
| PaymentReportScreen | Capture discounted final amount after deal qualifies | POST | `/mobile/orders/:orderId/payment-authorizations/:authorizationId/capture` | `captureAmount`, `finalAmount`, `discountSnapshotId` | `paymentStatus: captured`, `captureAmount`, `releasedAmount` | Must apply final discount snapshot exactly once | Idempotency and partial capture support must be verified |
| MerchantDashboardScreen | View authorization/capture summary | GET | `/mobile/merchant/deals/:dealId/payment-summary` | merchant scope, `dealId` | counts by `authorized`, `authorization_voided`, `capture_pending`, `captured`, `capture_failed`; totals for authorized/captured/released amounts | Merchant visibility and privacy rules | Whether merchant can see customer surname only or full payment state |
| CustomerOrdersScreen | Modify order and require reauthorization when amount changes | PATCH | `/mobile/orders/:orderId` | updated `items[]`, expected order version | updated order, `paymentStatus: pending`, `reauthorizationRequired: true`, updated authorized progress | Old authorization must be voided/replaced atomically with order update | Whether same-amount customization changes require reauthorization |
| CustomerOrdersScreen | Attempt to leave or delete item before deadline | DELETE | `/mobile/orders/:orderId/items/:itemId` | expected order version | updated order or withdrawal lock error | Request must be rejected during final 30-minute withdrawal lock while join remains allowed | Whether reducing quantity counts as withdrawal |
| CartScreen | Submit cart and create order before LINE Pay authorization | POST | `/mobile/deals/:dealId/orders` | `items[]: { drinkId, quantity, sweetness, ice, toppings[] }`, `fallbackPurchasePreference`, expected prices | Created order with `originalAmount`, payment authorization next step | Deal must still accept joins; prices/options must be revalidated; order creation must precede provider authorization | Whether cart itself is local-only or server-persisted |
