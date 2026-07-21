# Mobile 畫面資料需求

最後更新：2026-07-20

## 文件用途

本文件整理 mobile 每個畫面需要顯示的資料、使用者可以做的操作、目前資料來源，以及尚未完成的後端工作。

它不是「最終成品固定流程」，而是目前版本的畫面與流程規格。之後 API、資料庫、付款、訂單狀態變清楚時，這份文件會一起更新。

## 中文註解規則

- Screen / component 名稱保留英文，因為它們對應 `mobile/src/screens/` 內的檔案。
- API route、state key、status value 保留英文，避免和程式碼命名脫節。
- 中文說明用來輔助理解畫面用途、資料需求、使用者操作流程。
- 如果畫面資料來源仍是 local state、localStorage 或 mock，代表目前還不是完全由 backend 資料驅動，之後要逐步改成以 backend 權威資料為準。

目前 app 是 React Native + Expo，Android-first。開發時也會用 Expo Web 測試。

## 資料來源分級

| 分級 | 意義 | 目前處理方式 |
| ---- | ---- | ------------ |
| Backend source of truth | 已有後端 route 或後端資料庫可作權威來源 | Mobile 應優先呼叫 API，local state 只作畫面暫存 |
| Partial backend | 部分資料已接 API，但列表、歷史或錯誤恢復仍靠 local state | 文件需列出缺哪個 API 或同步策略 |
| Prototype/local | 主要靠 mocks、localStorage 或 app state | 不可視為正式資料契約，後續需改接 backend |

目前優先收斂順序：顧客活動/訂單列表、菜單 API、商家訂單/取貨 API、provider 狀態查詢與付款錯誤恢復。

## 畫面資料需求

| Screen                      | 角色與用途                                       | 顯示資料 / 輸入                                                                                                  | 使用者操作                                                                                                  | 目前資料來源                                                                            | 尚未完成 / 後端缺口                                                                                    |
| --------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `RoleSelectScreen`          | Google 登入入口畫面                              | Google Login 按鈕、載入狀態、錯誤訊息、登入後使用者摘要                                                          | 開始 Google 登入、把 Firebase ID token 送到 backend、依 backend 回傳角色進入對應首頁、登出 Firebase session | Firebase Auth + backend `POST /api/auth/firebase-session`                               | 需要 Firebase 專案設定，以及開發資料庫的 `users.firebase_uid` 對應                                     |
| `NearbyGroupBuyActivitiesScreen` | 顧客首頁，顯示已參加與推薦團購             | 會員資訊、目前顧客已參加的團購進度、推薦店家 / 團購                                                              | 開啟團購詳情、地圖、訂單、會員頁                                                                            | Prototype/local：Mobile mocks、本機 state；已有 `GET /api/group-buy-activities` 但啟動尚未完整接入 | 顧客已參加訂單列表 API、定位載入 / 錯誤狀態、首頁啟動同步                                              |
| `LiveMapScreen`             | 用地圖瀏覽附近店家                               | Google Map、店家 marker、店名、進行中的團購杯數進度                                                              | 地圖拖曳 / 縮放、查看 marker                                                                                | Google Maps SDK + 匯出 / mock 店家資料                                                  | 附近店家 API、即時團購同步                                                                             |
| `GroupBuyActivityDetailScreen` | 下單前查看團購詳情                            | 店家、團購狀態、優惠門檻、目前進度、截止時間、取餐時間、公告                                                     | 開啟菜單、查看進度                                                                                          | Mobile app state + store mocks                                                          | 詳情 API、是否可加入的後端驗證                                                                         |
| `StoreMenuScreen`           | 瀏覽飲料菜單                                     | 分類、品項、價格                                                                                                 | 選擇飲料                                                                                                    | Mobile drink/store mocks                                                                | 菜單 API、品項供應狀態、價格異動                                                                       |
| `DrinkSelectionScreen`      | 客製化單杯飲料                                   | 尺寸、甜度、冰塊、加料、數量、小計                                                                               | 加入購物車、編輯後儲存                                                                                      | Mobile state + mocks                                                                    | 後端驗證、不可用選項處理                                                                               |
| `CartScreen`                | 檢查購物車並送出訂單                             | 飲料明細、數量、客製化、金額、是否接受原價購買                                                                   | 刪除項目、繼續選購、建立訂單、更新 pending 訂單、為已授權訂單建立 revision                                  | Mobile cart state / localStorage；`POST /api/orders`；`PATCH /api/orders/:orderId`；`POST /api/orders/:orderId/revisions` | 價格衝突處理、revision 失敗提示仍需細化                                                               |
| `PaymentAuthorizationScreen` | LINE Pay sandbox 預授權 / 重新預授權 / 重新付款 | 原價金額、授權金額、最終金額、請款金額、釋放金額、付款狀態、provider `transactionId`、`paymentUrl`、backend 結果 | 開啟 LINE Pay sandbox 授權 URL、自動刷新 backend 訂單狀態、手動刷新付款狀態、revision 重新預授權、請款失敗後重新付款 | Partial backend：Mobile payment state；`POST /api/payments/line-pay/request`；`POST /api/payments/line-pay/repay`；`GET /api/orders/:orderId` | 正式 app deep link、provider 狀態查詢 / 錯誤恢復；refund 是開發 / 補救後端 API，尚未有正式 mobile 操作 UI |
| `GroupProgressScreen`       | 顯示團購與顧客訂單進度                           | 團購徽章、目前 / 下一門檻杯數、參與者、剩餘時間、訂單摘要                                                        | 前往付款或取餐資訊                                                                                          | Mobile app state                                                                        | 進度 API、權威結算結果                                                                                 |
| `CustomerOrdersScreen`      | 顧客查看進行中 / 歷史訂單與編輯訂單              | 店家、品項、客製化、品項金額、訂單總額、訂單狀態、取餐碼、取餐憑證有效期限                                       | 開啟團購、鎖單前編輯 / 刪除、建立 revision、前往重新授權、取餐前 15 分鐘以前重新付款、查看歷史訂單           | Partial backend：Mobile orders/payments/localStorage；`GET /api/orders/:orderId`；`POST /api/orders/:orderId/revisions` | 顧客訂單列表 API、revision 錯誤提示、退出團購 API、逾期取餐狀態                                         |
| `PickupInfoScreen`          | 顯示取餐資訊                                     | 店家、地址、取餐時間、取餐憑證有效期限、訂單摘要、取餐狀態                                                       | 查看位置 / 取餐碼 placeholder                                                                               | Mobile state + mocks                                                                    | 取餐 API、取餐憑證驗證、逾期未取處理                                                                   |
| `MerchantDashboardScreen`   | 商家管理團購與履約                               | 進行中團購、訂單數、付款數、取餐數、取餐憑證有效期限、歷史紀錄                                                   | 建立團購、查看有效訂單、標記可取餐、核銷取餐                                                                | Partial backend：團購部分接 API；訂單與取貨仍偏 local                                  | 商家總覽 API、商家訂單 API、商家授權、可取餐 / 核銷取貨 / 逾期未取處理                                  |
| `MerchantGroupBuyActivityCreateScreen` | 商家建立團購與優惠門檻                | 固定店家、標題、24 小時內截止時間、取餐開始與結束時間、公告、優惠門檻                                            | 新增 / 刪除門檻、建立團購；截止時間超過 24 小時、取餐開始早於截止後 30 分鐘、取餐結束早於開始時阻擋送出        | POST API + local fallback                                                               | 重試 UX                                                                                                  |
| `AdminDashboardScreen`      | 開發 / 補救工具，不屬於第一階段正式 App 流程     | 團購進度、訂單 / 付款摘要、取消狀態                                                                              | 開發或營運補救時查看詳情、取消團購                                                                          | DELETE API + local fallback                                                             | 若未來要做正式後台，需另開管理員需求與權限設計                                                          |
| `CustomerPlaceholderScreen` | 討論區 / 個人中心 placeholder                    | placeholder 文字                                                                                                 | 只做頁面切換                                                                                                | Static                                                                                  | 功能尚未設計                                                                                           |

## 共用畫面規則

- Mobile 可點擊區域應盡量維持至少約 44x44 points。
- 返回動作應優先使用 navigation history；只有沒有上一頁時才使用明確 fallback。
- 顧客資料必須綁定目前登入的顧客。
- 顧客已參加 / 進行中訂單區塊只顯示該顧客資料。
- 首頁推薦、地圖探索、招募中的團購列表屬於全域 / 附近資料，不是單一顧客私有資料。
- 商家資料必須限制在該商家有權管理的店家。
- 不應把內部欄位名稱，例如 `targetCups:`，直接當 debug 文字顯示給使用者。
- 取餐憑證只有在 `pickupStatus = ready` 或之後明確定義的狀態才可顯示。
- 取餐憑證需顯示有效期限；到期後訂單移至歷史訂單，顧客仍可用歷史訂單向店家協調，但不再顯示有效取貨碼。
- `cancelled`、`completed` 的團購與訂單應進入歷史紀錄，不應顯示在進行中清單；扣款失敗訂單在重新付款期限內仍需保留重新付款入口，逾期後才移入歷史紀錄。
- 最高優惠門檻杯數目前視為團購容量上限。送出購物車與付款授權不得讓杯數超過該上限。

## 目前操作流程

顧客：

```text
Google Login
-> Backend 判斷角色
-> 首頁 / 地圖
-> 團購詳情
-> 菜單
-> 飲料客製化
-> 購物車
-> 建立或更新 pending 訂單
-> LINE Pay 預授權
-> 自動刷新訂單付款狀態
-> 預授權成功後清除該團購購物車
-> 團購進度 / 我的訂單
-> 取餐
```

商家：

```text
Google Login
-> Backend 判斷角色
-> 商家後台
-> 建立團購
-> 回到商家後台查看進度
-> 查看有效訂單
-> 標記可取餐
-> 核銷取貨
```

開發 / 補救工具：

```text
Google Login
-> Backend 判斷角色
-> 開發或營運補救入口
-> 必要時查看團購詳情 / 觸發取消或手動結算
```

## 2026-07-05 登入 UI 方向

- 正式環境只顯示 Google Login。
- 使用者不能在正式 app 內手動選擇顧客、商家或管理員。
- Firebase 登入後，由 backend response 決定進入哪個入口；第一階段正式 App 只規劃顧客與商家入口：
  - `customer` -> 顧客首頁 / 地圖 / 訂單
  - `merchant` -> 該商家有權管理店家的商家後台
- `admin` -> 僅作開發或後端補救工具，不列入第一階段正式 App 使用者流程
- 既有 password 欄位與帳號下拉選單已從 mobile 登入畫面移除。
- 開發期間如果要測不同角色，應使用不同 Firebase Google 測試帳號，或用本機 mapping helper 改 `users.firebase_uid` 對應；正式 app 不提供角色切換 UI。
