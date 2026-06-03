# Open Questions Derived From Frontend Prototype

## 文件定位

本文件保存從目前 React frontend prototype、畫面需求與候選資料流程反向發現的未決問題。以下問題尚未定案，不應被 prototype 畫面、候選 API 或候選 entity 當成正式業務規則。

嚴重程度：

- `高`：不確認會導致主要流程、金額、權限、狀態或資料一致性設計錯誤。
- `中`：會影響畫面結構、API response 或資料保存策略。
- `低`：目前可用 mock 暫代，但正式化前仍需統一。

## 使用者與權限

| ID | 問題 | 影響前端 | 影響後端 | 影響資料庫 | 嚴重程度 |
| --- | --- | --- | --- | --- | --- |
| Q1 | 一個 Google 帳號能否同時具有顧客與商家身分？ | 是否提供角色切換與不同導覽 | 授權 middleware 與 scope 判斷 | `user_roles` 是否一對多 | 中 |
| Q2 | 平台後台管理者如何取得權限？ | 後台入口與功能可見性 | 管理者授權與封鎖機制 | 管理角色及核發歷史 | 高 |
| Q3 | 商家可看到的顧客姓氏來源與格式為何？ | 名單呈現及遮罩方式 | 安全產生展示名稱 | 是否保存 `surname` 或匿名名 | 中 |
| Q4 | 顧客未登入時能否瀏覽活動詳情與進度？ | 公開頁與登入提示位置 | 公開/私人資料授權界線 | 可能不影響核心表，但影響存取紀錄 | 中 |

## 商家與店家

| ID | 問題 | 影響前端 | 影響後端 | 影響資料庫 | 嚴重程度 |
| --- | --- | --- | --- | --- | --- |
| Q5 | 一個商家帳號是否可管理多個門市？ | 建立頁門市 selector 與儀表板篩選 | 管理權限範圍 | `merchant_users` / `shops` 關聯 | 高 |
| Q6 | 門市如何註冊、驗證及對應 Google 地點？ | 店家資料可信度與地圖提示 | 未來地點服務整合及審核 | 座標、place reference、驗證狀態 | 中 |
| Q7 | 商家發布活動後可修改哪些欄位？ | 編輯按鈕與異動警示 | 修改限制及重新通知 | 活動版本、異動歷史 | 高 |
| Q8 | 店家營業狀態由誰維護，是否影響已開活動可加入性？ | 首頁營業 badge 與加入提示 | 可加入規則 | 門市狀態與活動事件記錄 | 中 |

## 飲料與客製化

| ID | 問題 | 影響前端 | 影響後端 | 影響資料庫 | 嚴重程度 |
| --- | --- | --- | --- | --- | --- |
| Q9 | 一張訂單能否包含多種飲品？ | 單品表單或購物車流程 | request 驗證及金額計算 | `orders` 1:N `order_items` 使用方式 | 高 |
| Q10 | 截止前可修改杯數以外的飲品、甜冰或加料嗎？ | 編輯頁範圍 | 重新驗價及容量重算 | `order_revisions` 與快照 | 高 |
| Q11 | 加料是否依飲品限制，且可否選多份？ | 選項控制與小計試算 | 組合合法性驗證 | `menu_item_toppings` / 選取數量 | 中 |
| Q12 | 已下單後飲品或加料價格變更時，使用哪個價格？ | 是否顯示快照價格 | 結算需使用固定版本 | 品項與加料價格快照 | 高 |

## 優惠規則

| ID | 問題 | 影響前端 | 影響後端 | 影響資料庫 | 嚴重程度 |
| --- | --- | --- | --- | --- | --- |
| Q13 | 多個杯數級距是否只套用最高已達級距且不累加？ | 詳情與結果說明 | 結算公式 | 套用級距記錄 | 高 |
| Q14 | 折扣以杯數平均分時，分母為實際杯數或達成門檻杯數？ | 個人折抵與應付呈現 | 金額演算 | 個人結算快照 | 高 |
| Q15 | 平均折抵無法整除時如何分配零頭？ | 顯示金額須可信 | 捨入規則 | 個人最終折抵記錄 | 高 |
| Q16 | `targetCups` 應代表最低門檻、下一級距、目前追蹤目標或最高目標？ | 目前進度文案已可能誤導 | response 欄位需拆分 | 活動/級距欄位語意 | 高 |
| Q17 | 商家建立頁如何輸入、排序與驗證多個優惠級距？ | 需多級距編輯 UI | 建立請求驗證 | `promotion_tiers` 結構與排序 | 高 |

## 團購 / 匹配規則

| ID | 問題 | 影響前端 | 影響後端 | 影響資料庫 | 嚴重程度 |
| --- | --- | --- | --- | --- | --- |
| Q18 | 所有用語與資源名稱是否完全移除「匹配」概念？ | 標題、路由與元件命名 | API 資源命名 | 避免建立廢棄 matching entities | 低 |
| Q19 | 顧客首頁只列可加入活動，或亦顯示已成團、流團、取消活動？ | 首頁區塊與 empty state | 查詢 filter 與公開資料 | 狀態索引與歷史查詢 | 中 |
| Q20 | 達最高優惠杯數後有人退出，是否重新開放加入？ | 額滿按鈕是否恢復 | 容量狀態處理 | 狀態事件或即時計算 | 高 |
| Q21 | 截止時間到後是否需要 `judging` 中間狀態？ | 倒數歸零畫面 | 判定 job 與重試 | 狀態歷史及 job 記錄 | 中 |
| Q22 | 活動狀態與付款/取貨可用下一步的對應規則為何？ | 進度頁按鈕是否顯示/停用 | 下一步授權與結果 API | 訂單結果與流程狀態 | 高 |

## 訂單

| ID | 問題 | 影響前端 | 影響後端 | 影響資料庫 | 嚴重程度 |
| --- | --- | --- | --- | --- | --- |
| Q23 | 同一顧客在同一活動能否有多張訂單？ | 我的訂單與進度摘要 | 新增或更新判斷 | 唯一約束或多筆關聯 | 高 |
| Q24 | 顧客能否在截止前修改流團時原價購買偏好？ | 編輯操作入口 | 截止時讀取最新偏好 | 偏好變更歷史 | 高 |
| Q25 | 顧客退出團購後是否保留可見的取消訂單？ | 歷史清單顯示 | leave 流程 response | 軟刪除與取消原因 | 中 |
| Q26 | 訂單修改是否必須保存每次修改前後資料？ | 是否提供歷程檢視 | 金額/爭議查核 | `order_revisions` | 高 |
| Q27 | 加入團購成功時是否同時必須完成付款預授權？ | 提交完成或失敗頁 | 跨服務一致性與補償 | 訂單與授權狀態關聯 | 高 |

## 付款

| ID | 問題 | 影響前端 | 影響後端 | 影響資料庫 | 嚴重程度 |
| --- | --- | --- | --- | --- | --- |
| Q28 | 手動匯款回報頁是否保留，或由線上預授權支付取代？ | 付款資訊架構完全不同 | 兩套付款流程 | `payment_reports` 或 authorization entities | 高 |
| Q29 | 選定線上支付服務是否支援預授權與截止後請款？ | 可呈現的承諾與狀態 | provider 整合能力 | provider reference / capture data | 高 |
| Q30 | 預授權金額以原價、當下估算金額或最高可能金額計算？ | 確認頁說明 | 授權與請款差額流程 | 授權/請款金額記錄 | 高 |
| Q31 | 商家確認付款是人工審核，還是僅查看金流結果？ | 儀表板操作或唯讀狀態 | review endpoint 是否需要 | `payment_reviews` | 高 |
| Q32 | 取消、退出或流團不購買時，既有授權如何釋放？ | 顧客結果提示 | release / retry / compensation | 釋放狀態及失敗理由 | 高 |
| Q33 | 若保留付款截圖，上傳、遮罩、保存及刪除規則為何？ | 上傳提示與隱私告知 | 安全儲存及下載授權 | 附件參照、保存期限、存取 audit | 高 |

## 取貨

| ID | 問題 | 影響前端 | 影響後端 | 影響資料庫 | 嚴重程度 |
| --- | --- | --- | --- | --- | --- |
| Q34 | 個人到店取貨用姓氏、訂單碼、電話末碼或 QR code 識別？ | 取貨頁資訊 | 核銷驗證 | `pickup_identifier` / token | 高 |
| Q35 | 商家是否可在發布或成團後修改取貨時間？ | 異動提示畫面 | 修改限制與通知觸發 | `pickup_window_changes` | 高 |

## 通知

| ID | 問題 | 影響前端 | 影響後端 | 影響資料庫 | 嚴重程度 |
| --- | --- | --- | --- | --- | --- |
| Q36 | 第一版不做通知時，哪些事件仍需在畫面呈現提示？ | 提示區與文案 | 日後事件來源 | 日後 `notifications` 範圍 | 中 |
| Q37 | 日後若做通知，是否需保存送達、失敗與已讀記錄？ | 通知中心/未讀 badge | 發送與重試 | `notifications` / delivery log | 中 |

## 狀態流轉

| ID | 問題 | 影響前端 | 影響後端 | 影響資料庫 | 嚴重程度 |
| --- | --- | --- | --- | --- | --- |
| Q38 | 活動、訂單、付款、取貨狀態值與命名何時統一？ | badge 目前與規劃已有差異 | 狀態機與 API 枚舉 | enum/check constraint 與歷史值 | 高 |
| Q39 | 活動流團但部分顧客接受原價時，活動及個人訂單如何各自表示？ | 結果頁標籤 | 判定與履約流程 | activity/order settlement 分離 | 高 |

## 歷史紀錄

| ID | 問題 | 影響前端 | 影響後端 | 影響資料庫 | 嚴重程度 |
| --- | --- | --- | --- | --- | --- |
| Q40 | 是否保存完整活動狀態歷史及狀態改變原因？ | 日後時間軸/客服說明 | 事件紀錄 | `activity_status_history` | 高 |
| Q41 | 商家或後台取消活動是否必須寫 audit log？ | 後台操作提示 | 身分與操作追蹤 | `activity_cancellations`, `audit_logs` | 高 |
| Q42 | 顧客歷史訂單、付款附件與稽核資料各保留多久？ | 歷史/隱私說明 | 清除排程與存取權 | retention policy 欄位/刪除策略 | 中 |

## 併發與交易一致性

| ID | 問題 | 影響前端 | 影響後端 | 影響資料庫 | 嚴重程度 |
| --- | --- | --- | --- | --- | --- |
| Q43 | 團購目前杯數即時計算或儲存彙總值？ | 進度更新時效 | 查詢效能與更新策略 | aggregate 欄位/重算策略 | 高 |
| Q44 | 多位顧客同時加入使活動超過最高杯數時如何決定成功者？ | 送出失敗提示 | 原子容量檢查/鎖定 | transaction、version 或 reservation | 高 |
| Q45 | 加入、退出或修改訂單時，活動進度與付款狀態如何維持一致？ | 不應出現矛盾畫面 | 跨流程交易或補償 | event/outbox 或一致性紀錄 | 高 |
| Q46 | 截止判定與剛好同時送出的加入/退出請求如何排序？ | 截止瞬間結果提示 | cutoff locking 規則 | 交易時間與事件順序 | 高 |
| Q47 | 優惠級距、菜單或取貨設定異動後，既有訂單結算使用哪個版本？ | 顯示快照或新內容 | snapshot resolution | 活動/品項/取貨版本 | 高 |
| Q48 | 哪個資料來源是取消、付款釋放失敗或結算失敗時的最終真實來源？ | 錯誤恢復訊息 | 重試與補償策略 | event log、狀態來源與 audit | 高 |

## 資料庫正規化

| ID | 問題 | 影響前端 | 影響後端 | 影響資料庫 | 嚴重程度 |
| --- | --- | --- | --- | --- | --- |
| Q49 | `deal`, `activity` 與 `groupOrder` 是否需統一為一個活動概念，另以 progress summary 表達彙總？ | 資料欄位與 route 用語可一致 | Response 資源邊界清楚 | 避免活動主資料與彙總重複且不同步 | 高 |
| Q50 | 飲料與加料正式資料是否採多對多關聯，而訂單僅保存選取快照？ | 客製化可準確顯示可選組合 | Menu validation 與 snapshot 策略 | 需 `menu_item_toppings` 與 `order_item_toppings` | 中 |
| Q51 | 商家、使用者與門市的授權是否以關聯資料建模，而非直接放在活動？ | 門市 selector 與權限提示 | Merchant scope 驗證 | 需正規化 `merchant_users` / shop scope | 高 |
## Mobile Prototype Addendum

### Android-first App

| Question | Frontend impact | Backend impact | Database impact | Severity |
| --- | --- | --- | --- | --- |
| Should production keep customer and merchant in one app, or split apps? | RoleSelectScreen may be removed or replaced | Auth and app routing differ | Role and membership model differs | High |
| Is RoleSelectScreen only a prototype login entry or a future post-login role selection screen? | Determines if role buttons appear before or after real login | Requires `/me/roles` or auth profile API | May need role grant history | High |
| Should the first Android prototype use Expo local navigation or immediately adopt Expo Router/React Navigation? | Determines file routing and navigation patterns | None yet | None yet | Medium |
| Should merchant screens live in the same app as customer screens? | Changes bottom navigation and role switching | Requires role-aware API scopes later | Requires account-role relationships | High |
| Should location permission be mocked as granted, denied, or both? | Nearby screen empty/error states differ | Future location query inputs differ | Store location and user location history policy differ | Medium |
| Should the map remain a static placeholder until backend exists? | Avoids premature map UI complexity | Avoids location service dependency | Avoids geospatial schema assumptions | Medium |
| How exactly should Line Pay be integrated: redirect, QR, in-app browser, or provider SDK? | Payment screen and return flow differ | Provider integration and callback endpoints differ | Provider transaction fields differ | High |
| Should joining a deal create a local draft first or immediately create an order candidate? | Drink selection success state differs | Order create endpoint semantics differ | Draft/order lifecycle differs | High |
| Does Android back navigation discard in-progress drink customization? | Requires confirmation modal or draft state | Draft save API may be needed later | Draft persistence may be needed | Medium |
| What is the minimum customer identity needed before joining? | Login placeholder may become required | Auth/session APIs needed | User/session/order ownership entities needed | High |
| How should mobile show payment, pickup, and cancellation status together without dense tables? | Affects dashboard card design | Summary APIs may be needed | Derived summary materialization may be useful | Medium |
| How should merchants confirm pickup on mobile? | Needs merchant detail or scanner screen | Pickup update API needed | Pickup history/audit needed | High |

### Mobile Data And Status

| Question | Frontend impact | Backend impact | Database impact | Severity |
| --- | --- | --- | --- | --- |
| Is `full` a deal status or only a join-blocking condition? | Badge and button states differ | Status machine differs | Enum or derived field differs | High |
| Should order status be displayed separately from deal status on mobile? | Progress screen may need more sections | Order state endpoint needed | Order status history needed | High |
| Should payment online states and manual report states be separate owners? | Payment screen labels and flows differ | Separate endpoints likely | Separate tables likely | High |
| Should pickup status be computed from order/payment/deal or stored directly? | Pickup screen availability differs | Computed vs stored response logic differs | Denormalized pickup state may be needed | Medium |
| Should store business status affect join eligibility? | Nearby and detail CTA behavior differs | Eligibility calculation needed | Business status history maybe needed | Medium |

### Mobile Interaction Addendum

| Question | Frontend impact | Backend impact | Database impact | Severity |
| --- | --- | --- | --- | --- |
| Should mock join immediately navigate to progress, or show a confirmation screen first? | Determines whether a dedicated confirmation screen is needed | May require order preview endpoint | May require draft order persistence | Medium |
| Should quantity changes after joining update the same order or create a new order version? | Progress and edit UI differ | Update order endpoint and validations differ | Order events/history required | High |
| Should `confirmed` replace `formed` everywhere? | Status badges and labels need one value | API enum must be stable | Database enum/check constraints affected | High |
| Should Line Pay payment status live on `orders`, provider transaction, or both? | Dashboard summary may show conflicting data | Payment endpoints and callback logic differ | Normalization and history design differ | High |
| Should merchant-created mock deals support multiple tiers in first mobile prototype? | Create form may become more complex | Create API needs nested tier validation | `discount_tiers` required from first release | Medium |
| Should merchant dashboard summaries be computed live from orders or stored as summary rows? | Refresh behavior and loading states differ | Query complexity and caching differ | Materialized summary entity may be needed | Medium |
| Should pickup info show before payment is confirmed? | Pickup screen may need locked state | Pickup API gating required | Pickup state may depend on settlement/payment | High |
| How should failed deals handle customers who accepted original price? | Progress/payment/pickup screens need branch states | Settlement endpoint must split outcomes | Order settlement records required | High |

### Back Navigation Addendum

| Question | Frontend impact | Backend impact | Database impact | Severity |
| --- | --- | --- | --- | --- |
| Should GroupProgressScreen always return to the previous screen, or always return to NearbyDealsScreen? | Affects Android back button expectations and header button behavior | None yet | None yet | Low |
| Should payment and pickup screens be accessible from bottom navigation without a selected order? | Requires disabled/empty states or order picker | Future APIs need current-order context | May require user current-order query | Medium |
| Should Android hardware back follow the same targets as the visible header back button? | Need formal navigation library or custom back handling | None yet | None yet | Medium |

## Authorization And Partial Capture Open Questions

| Question | Frontend impact | Backend impact | Database impact | Severity |
| --- | --- | --- | --- | --- |
| 金流服務商是否支援 partial capture？ | Determines whether UI can promise discounted capture after authorization | Payment integration choice depends on provider capabilities | Authorization/capture entities may need provider-specific fields | High |
| 授權有效期限是多久？ | UI may need expiry countdown and retry state | Backend must void/re-authorize before expiry | `expires_at` and expiry history are required | High |
| 未達標時是否一定 void authorization？ | Failed deal screen must explain no charge or void timing | Settlement job must void eligible authorizations | Void events/history are required | High |
| 達標後 capture 失敗怎麼處理？ | Customer and merchant need failure/retry states | Backend needs idempotent retry and support workflow | Capture attempts and failure reasons are required | High |
| 是否需要 webhook 同步 authorization / capture 狀態？ | UI may show pending sync states | Backend needs callback endpoint and verification | Provider event table and idempotency keys are required | High |
| 若授權 70，最後優惠價 58，差額 12 的釋放時間如何呈現給使用者？ | UI needs clear wording about release timing | Backend must map provider release/void statuses | Released amount and provider event timing are required | High |
| 若優惠後金額高於原授權金額，是否允許重新授權？ | UI needs reauthorization prompt and failure branch | Backend must support second authorization flow | Multiple authorizations per order may be required | High |
| 台灣金流如綠界、藍新、LINE Pay、街口是否支援此模式，需要後續查證。 | Provider selection affects payment screen language | Integration architecture differs by provider | Provider-specific transaction fields differ | High |
| `paymentStatus` 與 `authorizationStatus` 何者為主狀態？ | Prevents conflicting badges in order/payment screens | API response must expose canonical state | Database state machine must avoid duplicated truth | High |
| `authorizedCups` 要即時計算還是儲存快照？ | Progress UI freshness and loading behavior differ | Backend query/aggregation complexity differs | Summary cache or snapshot table may be needed | Medium |
| 達標後是否立即 capture，或等商家確認後 capture？ | UI needs waiting-for-merchant state if manual confirmation exists | Backend settlement trigger differs | Settlement event actor/source must be recorded | High |
| 使用者截止前退出時，已授權款項是否立即 void？ | Exit UI needs void confirmation and timing | Backend must call provider void and handle failure | Order/payment history must record exit-triggered void | High |
