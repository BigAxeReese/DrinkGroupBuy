# Mobile 畫面資料需求

最後更新：2026-07-30

## 文件用途

本文件整理 mobile 每個畫面需要顯示的資料、使用者可以做的操作、目前資料來源，以及尚未完成的後端工作。

它不是「最終成品固定流程」，而是目前版本的畫面與流程規格。之後 API、資料庫、付款、訂單狀態變清楚時，這份文件會一起更新。

## 中文註解規則

- Screen / component 名稱保留英文，因為它們對應 `mobile/src/screens/` 內的檔案。
- API route、state key、status value 保留英文，避免和程式碼命名脫節。
- 中文說明用來輔助理解畫面用途、資料需求、使用者操作流程。
- 如果畫面資料來源仍是 local state、localStorage 或 mock，代表目前還不是完全由 backend 資料驅動，之後要逐步改成以 backend 權威資料為準。

目前 app 是 React Native + Expo。第一版只以 Android 作為正式開發與驗收範圍；Expo Web 僅供開發預覽，iOS 不列入第一階段。

## 資料來源分級

| 分級 | 意義 | 目前處理方式 |
| ---- | ---- | ------------ |
| Backend source of truth | 已有後端 route 或後端資料庫可作權威來源 | Mobile 應優先呼叫 API，local state 只作畫面暫存 |
| Partial backend | 部分資料已接 API，但列表、歷史或錯誤恢復仍靠 local state | 文件需列出缺哪個 API 或同步策略 |
| Prototype/local | 主要靠 mocks、localStorage 或 app state | 不可視為正式資料契約，後續需改接 backend |

目前優先收斂順序：登入／角色解析 PostgreSQL 唯讀切片、活動首頁串接、LINE Pay sandbox 人工驗證、付款錯誤 UX、完整 mobile E2E。

## 畫面資料需求

| Screen                      | 角色與用途                                       | 顯示資料 / 輸入                                                                                                  | 使用者操作                                                                                                  | 目前資料來源                                                                            | 尚未完成 / 後端缺口                                                                                    |
| --------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `RoleSelectScreen`          | Google 登入入口畫面                              | Google Login 按鈕、載入狀態、錯誤訊息、登入後使用者摘要；本機 dev mode 額外顯示測試身份下拉選單                  | 開始 Google 登入、把 Firebase ID token 送到 backend、依 backend 回傳角色進入對應首頁、登出 Firebase session；本機 dev mode 可選擇測試身份進入 | Firebase Auth + backend `POST /api/auth/firebase-session`；dev-only `GET /api/auth/dev-users`、`POST /api/auth/dev-session` | 需要 Firebase 專案設定，以及開發資料庫的 `users.firebase_uid` 對應；dev-only 身份切換不得出現在 production |
| `NearbyGroupBuyActivitiesScreen` | 顧客首頁，顯示已參加與推薦團購             | 會員資訊、目前顧客已參加的團購進度、推薦店家／團購、預估每杯折扣與下一級距差杯數、活動同步狀態 | 開啟團購詳情、地圖、訂單、會員頁、活動同步失敗後重試 | `GET /api/group-buy-activities` + `GET /api/customers/me/orders`；local state 作 cache；同步失敗保留上次成功資料 | 定位與距離資料仍待後端化、完整 Android E2E |
| `LiveMapScreen`             | 用地圖瀏覽附近店家                               | Google Map、店家 marker、店名、進行中的團購杯數進度                                                              | 地圖拖曳 / 縮放、查看 marker                                                                                | Google Maps SDK + 匯出 / mock 店家資料                                                  | 附近店家 API、即時團購同步                                                                             |
| `GroupBuyActivityDetailScreen` | 下單前查看團購詳情 | 店家、團購狀態、優惠門檻、目前有效杯數、預估每杯折扣、預估分配、尾差、下一級距差杯數、截止時間、取餐時間、公告、活動同步狀態 | 開啟菜單、查看進度、活動同步失敗後重試 | Backend 活動列表 + Mobile cache；同步失敗保留上次成功資料；店家距離仍為 mock | 獨立詳情 API 非第一階段必要；店家距離後端化與 Android E2E |
| `StoreMenuScreen`           | 瀏覽活動店家的全部上架飲料菜單                   | 店家摘要、分類、`isAvailable = true` 的品項、說明、價格、客製化選項與選擇上限                                   | 瀏覽店家權威菜單                                                                                            | `GET /api/stores/:storeId/menu`；mobile 已串接後端菜單                                    | 店家基本資料仍有部分 prototype/mock 來源                                                              |
| `DrinkSelectionScreen`      | 客製化單杯飲料                                   | 尺寸、甜度、冰塊、可多選加料、店家設定的明確加料上限、數量、小計                                                 | 加入購物車、編輯後儲存                                                                                      | Backend menu API + Mobile cart state；傳送 `customizationOptionIds`                       | 完整裝置 E2E、選項異動後返回購物車的更細 UX                                                           |
| `CartScreen`                | 檢查購物車並送出訂單                             | 飲料明細、數量、客製化、金額、是否接受原價購買                                                                   | 刪除項目、繼續選購、建立訂單、更新 pending 訂單、為已授權訂單建立 revision                                  | Mobile cart state / localStorage；三種 order write API 均使用後端權威菜單驗證與價格重算  | `order_price_changed`／`order_items_invalid` 的逐項修正提示、revision 失敗提示仍需細化                  |
| `PaymentAuthorizationScreen` | LINE Pay sandbox 預授權 / 重新預授權 / 重新付款 | 原價金額、授權金額、最終金額、請款金額、釋放金額、付款狀態、provider `transactionId`、`paymentUrl`、backend 結果、deep link 返回結果 | 開啟 LINE Pay sandbox 授權 URL、由 deep link 返回付款畫面、自動刷新 backend 訂單狀態、手動刷新付款狀態、revision 重新預授權、請款失敗後重新付款 | Partial backend：Mobile payment state；`POST /api/payments/line-pay/request`；`POST /api/payments/line-pay/repay`；`GET /api/orders/:orderId`；後端 provider reconciliation 已完成第一版 | 付款錯誤提示與 LINE Pay sandbox 人工 E2E；refund 是開發 / 補救後端 API，尚未有正式 mobile 操作 UI |
| `GroupProgressScreen` | 顯示團購與顧客訂單進度 | 團購徽章、目前／下一門檻杯數、預估每杯折扣、預估分配、尾差、參與者、剩餘時間、訂單摘要、活動同步狀態 | 前往付款或取餐資訊、活動同步失敗後重試 | Backend 活動列表／訂單 API + Mobile cache；共用折扣摘要與同步提示已接線 | 截止後專用最終結算快照顯示與 Android E2E |
| `CustomerOrdersScreen`      | 顧客查看進行中 / 歷史訂單與編輯訂單              | 店家、品項、客製化、品項金額、訂單總額、訂單／付款／取貨狀態、取餐憑證有效期限                                   | 鎖單前編輯或取消、建立 revision、前往重新授權／重新付款、查看取貨碼與歷史訂單                                | Backend `GET /api/customers/me/orders` + 單筆訂單／取貨憑證 API；local state 僅作 cache   | revision／付款錯誤提示細化、完整 Android E2E                                                            |
| `PickupInfoScreen`          | 顯示取餐資訊                                     | 店家、地址、取餐時間、取餐憑證有效期限、訂單摘要、取餐狀態                                                       | 查看位置與有效六位取餐碼                                                                                     | Backend 取貨憑證 API + 訂單 cache；逾期排程已完成                                        | 清除剩餘店家／活動 mock fallback、完整 Android E2E                                                     |
| `MerchantDashboardScreen` | 商家管理團購與履約 | 進行中團購、即時預估每杯折扣、訂單數、付款數、取餐數、取餐憑證有效期限、退款申請狀態、歷史紀錄 | 建立團購、查看門市有效訂單、標記可取餐、查碼與核銷取餐、針對已請款訂單提出退款申請 | Backend 活動列表 + `GET /api/merchant/stores/:storeId/orders` + pickup APIs；local state 作 cache | 退款申請 API／UI、獨立總覽聚合 API、完整 Android E2E；商家不得直接執行 provider refund |
| `MerchantGroupBuyActivityCreateScreen` | 商家建立團購與優惠門檻 | 固定店家、標題、24 小時內截止時間、取餐開始與結束時間、公告、優惠門檻、欄位級中文錯誤 | 新增／刪除門檻、建立團購；格式、截止時間、取餐時間、每杯折扣上下限不合法時阻擋送出 | POST API + local fallback；Backend 驗證 tier 可達區間與最低單杯金額；Mobile 轉譯 `discount_tier_invalid`／`discount_menu_invalid` | 完整 Android E2E |
| `MerchantMenuManagementScreen` | 店家查看、修改與上下架店內菜單                  | 完整菜單、分類、名稱、說明、價格、客製化選項、`isAvailable`、每杯加料上限                                       | 新增品項、修改資料、上架或停售、輸入明確加料上限                                                           | Merchant menu GET/POST/PATCH API + merchant-store permission；mobile 第一版已串接         | 更完整的表單元件、刪除前確認與 mobile E2E                                                            |
| `AdminDashboardScreen`      | 開發 / 補救工具，不屬於第一階段正式 App 流程     | 團購進度、訂單 / 付款摘要、取消狀態                                                                              | 開發或營運補救時查看詳情、取消團購                                                                          | DELETE API + local fallback                                                             | 若未來要做正式後台，需另開管理員需求與權限設計                                                          |
| `CustomerPlaceholderScreen` | 討論區／個人中心 placeholder | 會員摘要、選填電話的遮罩值、帳號狀態 | 查看會員資料、提出帳號關閉申請 | Static | 個人中心、電話保護、帳號關閉 API 與去識別化流程尚未設計 |

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
- 團購不另設適用飲品清單；菜單畫面只顯示活動所屬店家目前 `isAvailable = true` 的品項。
- 送出購物車或重新預授權前必須以最新菜單重新驗證。價格、停售狀態或客製化選項變更時，應提示顧客重新確認。
- 已送出的訂單顯示訂單快照，不因後續菜單修改而改變。
- 客製化選擇限制由 `menu_item_customization_rules` 提供；店家可為每杯飲品設定明確 `maxSelections`，mobile 與 backend 都必須遵守，以 backend 驗證為準。
- 每杯預估折扣使用 `floor(目前達成級距總折扣 / 目前有效授權杯數)`；截止前必須顯示「預估」，截止後改顯示 Backend 保存的最終結算快照。
- 商家建立活動或修改菜單若會讓任何可達級距的每杯折扣變成 0，或高於最低可售單杯金額，畫面必須顯示 Backend 回傳的明確修正提示；不得只在前端自行判斷或偷偷把應付金額截為 0。
- 商家只能提出退款申請，不能在 Mobile 直接執行 LINE Pay refund；全額退款必須二次確認申請金額與訂單。

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
-> 菜單管理（可新增、修改、上架或停售）
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
- 本機開發若 `EXPO_PUBLIC_AUTH_MODE=dev`，登入頁可顯示「本機測試身份」下拉選單，供開發者切換 SQLite 內的顧客、商家與開發補救身份。
- 這個下拉選單只作測試用途，正式 app 不顯示。
- Firebase 登入後，由 backend response 決定進入哪個入口；第一階段正式 App 只規劃顧客與商家入口：
  - `customer` -> 顧客首頁 / 地圖 / 訂單
  - `merchant` -> 該商家有權管理店家的商家後台
- `admin` -> 僅作開發或後端補救工具，不列入第一階段正式 App 使用者流程
- 既有 password 欄位與帳號下拉選單已從 mobile 登入畫面移除。
- 開發期間如果要測不同角色，應使用不同 Firebase Google 測試帳號，或用本機 mapping helper 改 `users.firebase_uid` 對應；正式 app 不提供角色切換 UI。
