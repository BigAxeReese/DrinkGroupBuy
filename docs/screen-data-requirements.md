# Screen Data Requirements

## 文件定位

本文件只記錄目前 `frontend/` 第一輪 React prototype 已建立頁面的資料需求。資料欄位與操作均為畫面驗證用途，不是正式 API contract 或 database schema。

## Implemented Screens

### 1. NearbyDealsPage / 附近優惠團購

| 項目 | 內容 |
| --- | --- |
| 頁面名稱 | `NearbyDealsPage` |
| 顯示資料 | `deal.id`, `deal.title`, `deal.status`, `deal.currentCups`, `deal.targetCups`, `deal.remainingTimeText`, `deal.tiers[0].discountAmount`, `store.name`, `store.distanceText`, `store.businessStatus` |
| 使用者輸入 | 無 |
| 使用者操作 | 點選活動詳情；列表 / 地圖 mock 按鈕 |
| mock data source | `frontend/src/mock/deals.js`, `frontend/src/mock/stores.js` |
| loading state | 附近活動載入中 |
| empty state | 附近目前沒有可加入活動 |
| error state | 無法取得 mock 店家列表 |
| 權限需求 | 顧客瀏覽用途；正式公開瀏覽與登入限制未定 |
| open questions | 首頁應只列可加入活動或包含已結束/取消活動；`targetCups` 是否正確表達下一門檻 |

### 2. DealDetailPage / 團購活動詳情

| 項目 | 內容 |
| --- | --- |
| 頁面名稱 | `DealDetailPage` |
| 顯示資料 | `deal.title`, `deal.status`, `deal.currentCups`, `deal.targetCups`, `deal.participantCount`, `deal.remainingTimeText`, `deal.endTime`, `deal.pickupTime`, `deal.canJoin`, `deal.cancellationReason`, `deal.tiers[]`, `deal.notices[]`, `store.name`, `store.address`, `store.phone`, `store.distanceText`, `store.businessStatus` |
| 使用者輸入 | 無 |
| 使用者操作 | 選擇飲料並加入；查看進度 |
| mock data source | `frontend/src/mock/deals.js`, `frontend/src/mock/stores.js` |
| loading state | 活動詳情讀取中 |
| empty state | 店家未提供優惠級距 |
| error state | 活動截止、額滿或取消時不可加入 |
| 權限需求 | 公開資料與顧客加入資格範圍未定；商家編輯不在此頁 |
| open questions | 參與人數是否公開；取消原因公開內容；已套用級距如何呈現 |

### 3. DrinkSelectionPage / 飲品選擇與客製化

| 項目 | 內容 |
| --- | --- |
| 頁面名稱 | `DrinkSelectionPage` |
| 顯示資料 | `drink.name`, `drink.price`, `drink.sweetnessOptions[]`, `drink.iceOptions[]`, `drink.toppings[]`, 計算後 `subtotal`, `store.name` |
| 使用者輸入 | `drinkId`, `sweetness`, `ice`, `toppingId`, `quantity`, `fallbackPurchasePreference` |
| 使用者操作 | 選飲品與選項；本機試算；模擬加入團購；返回詳情 |
| mock data source | `frontend/src/mock/deals.js`, `frontend/src/mock/stores.js`, `frontend/src/mock/drinks.js` |
| loading state | 菜單載入中 |
| empty state | 店家尚未提供可選飲料 |
| error state | 截止或達最高杯數時不可送出 |
| 權限需求 | 僅顧客提交自己的加入意圖；登入尚未實作 |
| open questions | 是否支援多品項；加料可否多選/多份；送出後是否立即預授權；是否可修改客製化 |

### 4. GroupProgressPage / 團購進度

| 項目 | 內容 |
| --- | --- |
| 頁面名稱 | `GroupProgressPage` |
| 顯示資料 | `deal.status`, `deal.currentCups`, `deal.targetCups`, `deal.maximumCups`, `deal.participantCount`, `deal.remainingTimeText`, `groupOrder.cupsUntilNextTier`, `order.itemName`, `order.quantity`, `order.sweetness`, `order.ice`, `order.toppings[]`, `order.subtotal`, `order.fallbackPurchasePreference` |
| 使用者輸入 | 無 |
| 使用者操作 | 前往付款資訊 mock；前往取貨資訊 |
| mock data source | `frontend/src/mock/deals.js`, `frontend/src/mock/groupOrders.js`, `frontend/src/mock/orders.js` |
| loading state | 進度與判定結果載入中 |
| empty state | 目前零杯且尚無參與者 |
| error state | 優惠級距資料不一致，無法試算 |
| 權限需求 | 公開進度與個人訂單摘要必須有不同可見權限 |
| open questions | 付款/取貨下一步何時可用；固定連至 `order-002` 的 prototype 串接需日後修正；流團但接受原價如何顯示 |

### 5. PaymentReportPage / 付款資訊與回報 Mock

| 項目 | 內容 |
| --- | --- |
| 頁面名稱 | `PaymentReportPage` |
| 顯示資料 | `payment.amountDue`, `payment.recipientName`, `payment.bankCode`, `payment.accountNumberMasked`, `payment.qrCodeLabel`, `payment.status` |
| 使用者輸入 | `lastFiveDigits`, screenshot file placeholder |
| 使用者操作 | 選擇檔案示意；送出付款回報 mock |
| mock data source | `frontend/src/mock/paymentReports.js` |
| loading state | 付款狀態載入中 |
| empty state | 尚未進入付款階段 |
| error state | 付款回報未送出 |
| 權限需求 | 顧客只可看到自己的付款資訊；商家付款審核權限未定 |
| open questions | 手動匯款回報或線上預授權何者為主流程；截圖保存與審核規則 |

### 6. PickupInfoPage / 到店個別取貨

| 項目 | 內容 |
| --- | --- |
| 頁面名稱 | `PickupInfoPage` |
| 顯示資料 | `pickup.storeName`, `pickup.address`, `pickup.pickupTime`, `pickup.itemSummary`, `pickup.status`, `pickup.updateNotice` |
| 使用者輸入 | 無 |
| 使用者操作 | 查看取貨資訊及異動提示 |
| mock data source | `frontend/src/mock/pickupInfo.js` |
| loading state | 取貨資訊載入中 |
| empty state | 訂單尚未成立，沒有取貨資訊 |
| error state | 活動取消或取貨時段已有異動 |
| 權限需求 | 顧客只看自己的取貨內容；商家備貨/核銷權限未實作 |
| open questions | 取貨識別方式；取貨時間可否更改；是否需要異動紀錄與通知 |

### 7. MerchantDealCreatePage / 商家建立優惠活動

| 項目 | 內容 |
| --- | --- |
| 頁面名稱 | `MerchantDealCreatePage` |
| 顯示資料 | 商家建立表單提示及單一杯數門檻限制說明 |
| 使用者輸入 | `storeId`, `title`, `targetCups`, `discountAmount`, `startTime`, `endTime`, `pickupTime`, `notices` |
| 使用者操作 | 選門市；填寫表單；模擬建立活動 |
| mock data source | `frontend/src/mock/stores.js`, component local state |
| loading state | 活動建立中 |
| empty state | 尚未填寫活動內容 |
| error state | 結束或取貨時間順序錯誤 |
| 權限需求 | 僅可管理被授權的商家門市；prototype 尚未驗證 |
| open questions | 多級距表單如何設計；商家多門市；發布後可修改欄位 |

### 8. MerchantDealDashboardPage / 商家活動與參與狀態

| 項目 | 內容 |
| --- | --- |
| 頁面名稱 | `MerchantDealDashboardPage` |
| 顯示資料 | `deal.title`, `deal.status`, `deal.currentCups`, `deal.targetCups`, `store.name`, derived `orderCount`, derived payment confirmed count, derived pickup ready count |
| 使用者輸入 | 無 |
| 使用者操作 | 前往建立活動 |
| mock data source | `frontend/src/mock/deals.js`, `frontend/src/mock/orders.js`, `frontend/src/mock/stores.js` |
| loading state | 商家活動清單載入中 |
| empty state | 尚未建立任何活動 |
| error state | 無法取得商家活動 mock 資料 |
| 權限需求 | 商家僅可看到自己管理門市的活動；目前沒有 authorization |
| open questions | 付款/取貨摘要口徑；是否需要商家詳情與取消頁；顧客資料可見範圍 |

## Planned But Not Implemented Screens

| Planned screen | Why still needed | Status |
| --- | --- | --- |
| 登入 / 身分入口 Mock | 驗證顧客、商家、管理者導覽與權限提示 | 未建立 |
| Mock 地圖瀏覽 | 驗證地點列表與地圖切換 | 僅有按鈕文案 |
| 送出訂單確認 | 清楚承接流團偏好與付款說明 | 功能併入選飲頁，未獨立建立 |
| 我的訂單 | 修改杯數、退出、查看個人歷史 | 未建立 |
| 商家活動詳情 / 訂單彙總 | 顧客姓氏、付款、取消與備貨 | 未建立 |
| 平台後台 | 查看及取消全部活動 | 未建立 |

## Mock Data Notice

`frontend/src/mock/stores.js`、`deals.js`、`drinks.js`、`groupOrders.js`、`orders.js`、`paymentReports.js` 與 `pickupInfo.js` 均標記 `prototype only, not final API contract`。頁面目前沒有 API 呼叫或持久化行為。
