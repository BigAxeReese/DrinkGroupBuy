# Mobile Screen Data Requirements

## Document Purpose

This document records the first Android-first mobile prototype screens under `mobile/`. The screens are prototype-only and use mock data. The fields listed here are not final API contracts and not database schema.

## Shared Mobile Prototype Rules

- Android-first touch layout.
- Single-hand operation preferred.
- Large tap targets.
- Lists should avoid dense desktop-style tables.
- Forms should use mobile-friendly grouping.
- QR code, image upload, payment, login, and push notification remain placeholders only. Google Maps base-map rendering is connected, while store/activity markers remain prototype mock data.
- All mock data must remain marked `prototype only, not final API contract`.

## Screens

### 1. RoleSelectScreen / Login Placeholder

| Item | Content |
| --- | --- |
| Purpose | Prototype login entry before entering customer or merchant flow. |
| Role | Prototype tester; customer; merchant |
| Display data | Login title, customer login button, merchant login button |
| User input | None |
| User actions | Enter as customer, enter as merchant |
| Mock data | None; local navigation only |
| Loading state | None in current prototype |
| Empty state | Not logged in yet |
| Error state | Formal auth unavailable; shown as boundary note only |
| Permission needs | No real login; future role authorization needed |
| Open questions | Should customer and merchant live in one app? When should Google login be introduced? |

### 2. NearbyDealsScreen

| Item | Content |
| --- | --- |
| Purpose | Browse nearby stores and group-buy activities on Android. |
| Role | Customer |
| Display data | `store.name`, `store.distanceText`, `store.businessStatus`, `deal.title`, `deal.status`, `deal.currentCups`, `deal.targetCups`, `deal.participantCount`, `deal.remainingTimeText` |
| User input | None |
| User actions | Open detail, inspect map placeholder, use bottom navigation |
| Mock data | `mobile/src/mock/stores.js`, `mobile/src/mock/deals.js` |
| Loading state | Nearby activity loading placeholder needed later |
| Empty state | No nearby joinable deals |
| Error state | Location unavailable or mock list unavailable |
| Permission needs | Customer-facing public browsing; real location permission not implemented |
| Open questions | Should denied location permission show city fallback? Should cancelled/full deals remain visible? |

### 3. DealDetailScreen

| Item | Content |
| --- | --- |
| Purpose | Review store, deal, discount tiers, progress, and join eligibility. |
| Role | Customer |
| Display data | Store profile, address, phone, distance, deal title/status/progress, end time, pickup time, tiers, notices, cancellation reason |
| User input | None |
| User actions | Go to drink selection, go to progress |
| Mock data | `stores`, `deals` |
| Loading state | Deal detail loading |
| Empty state | Deal not found or no discount tier |
| Error state | Deal cancelled/full/expired and cannot be joined |
| Permission needs | Public detail with future customer join rules |
| Open questions | Should participant count be public? How should cancellation reason visibility work? |

### 4. DrinkSelectionScreen

| Item | Content |
| --- | --- |
| Purpose | Select drink, customizations, quantity, and fallback purchase preference. |
| Role | Customer |
| Display data | Drink name, price, sweetness, ice, toppings, quantity, subtotal, fallback options |
| User input | `drinkId`, `sweetness`, `ice`, `toppingId`, `quantity`, `fallbackPreference` |
| User actions | Select options, change quantity, submit mock join |
| Mock data | `stores`, `deals`, `drinks` |
| Loading state | Menu loading |
| Empty state | No drink menu for store |
| Error state | Join closed, invalid option, quantity unavailable |
| Permission needs | Customer order ownership; no login implemented |
| Open questions | Multi-item order? Multiple toppings? Immediate payment authorization on submit? |

### 5. GroupProgressScreen

| Item | Content |
| --- | --- |
| Purpose | Track group progress, outcome, and my order summary. |
| Role | Customer |
| Display data | Deal status, cups, target, max cups, participants, next tier gap, my order, subtotal, fallback preference |
| User input | None |
| User actions | Go to payment mock, go to pickup info |
| Mock data | `deals`, `groupOrders`, `orders` |
| Loading state | Progress loading |
| Empty state | User has no order or group has no participants |
| Error state | Progress and order data mismatch |
| Permission needs | Public aggregate progress plus private order summary |
| Open questions | Which statuses unlock payment or pickup? How are concurrent joins settled? |

### 6. PaymentReportScreen / Line Pay Payment Mock

| Item | Content |
| --- | --- |
| Purpose | Display Line Pay payment status and payment entry mock. |
| Role | Customer |
| Display data | Amount due, Line Pay provider label, recipient, QR placeholder, payment status |
| User input | None in current prototype |
| User actions | Simulate Line Pay payment completed; go to pickup info |
| Mock data | `paymentReports` |
| Loading state | Payment state loading |
| Empty state | Payment not required or not ready |
| Error state | Payment unavailable or provider result failed |
| Permission needs | Customer only sees own payment; merchant sees provider result summary later |
| Open questions | Line Pay authorization/capture timing; how failed/cancelled payment is displayed |

### 7. PickupInfoScreen

| Item | Content |
| --- | --- |
| Purpose | Show pickup location, time, order summary, and pickup status. |
| Role | Customer |
| Display data | Store name, address, pickup time, item summary, pickup status, update notice, map placeholder, pickup code placeholder |
| User input | None |
| User actions | Read instructions, inspect map/navigation placeholder |
| Mock data | `pickupInfo` |
| Loading state | Pickup info loading |
| Empty state | Order not formed or pickup not ready |
| Error state | Activity cancelled or pickup window changed |
| Permission needs | Customer only sees own pickup details |
| Open questions | QR code, surname, phone, or order number for pickup verification? |

### 8. MerchantDealCreateScreen

| Item | Content |
| --- | --- |
| Purpose | Let merchants create a mock discount activity from mobile. |
| Role | Merchant |
| Display data | Fixed prototype merchant store, title, promotion tier cards, pickup time, notes, start time, end time |
| User input | `title`, `tiers[].cups`, `tiers[].discountAmount`, `pickupTime`, `notices`, `startTime`, `endTime`; `storeId` 目前由測試商家身分固定帶入，不由畫面選擇 |
| User actions | Edit form, add/remove promotion tier cards, submit mock create |
| Mock data | `stores`, local form state |
| Loading state | Creating activity |
| Empty state | No authorized store |
| Error state | Invalid time, empty tiers, duplicate thresholds, or invalid discount rules |
| Permission needs | Merchant can only manage authorized stores; not implemented |
| Open questions | How should duplicate or descending tiers be validated? Can merchants edit published deals? |

### 9. MerchantDashboardScreen

| Item | Content |
| --- | --- |
| Purpose | Let merchants review activity progress, payment summary, and pickup readiness. |
| Role | Merchant |
| Display data | Deal title/status/progress, store, order count, confirmed payment count, ready pickup count |
| User input | None |
| User actions | Create activity, open deal detail |
| Mock data | `deals`, `orders`, `stores` |
| Loading state | Merchant activities loading |
| Empty state | No merchant activities |
| Error state | Merchant activity data unavailable |
| Permission needs | Merchant sees only authorized stores and limited customer info |
| Open questions | Should merchant dashboard be in same app as customer flow? What customer fields are visible? |

## First Mobile Implementation Notes

- Current navigation is prototype local state stack navigation, not formal navigation architecture.
- Initial route is `RoleSelectScreen`, currently displayed as a login page.
- Customer purchase flow: `RoleSelectScreen -> NearbyDealsScreen -> DealDetailScreen -> DrinkSelectionScreen -> CartScreen -> PaymentReportScreen -> GroupProgressScreen / PickupInfoScreen`.
- Merchant flow: `RoleSelectScreen -> MerchantDashboardScreen -> MerchantDealCreateScreen -> MerchantDashboardScreen`.
- Bottom navigation contains key entry points for fast prototype testing after role selection.
- Screens should later move to Expo Router or React Navigation if prototype grows.
- Current UI intentionally avoids desktop tables and uses cards, large buttons, and grouped form sections.

## Interaction Update

The current `mobile/` prototype now includes runtime mock interactions. These interactions mutate local React state only. They do not write to files, backend, database, or API.

| Screen | Prototype interaction | Runtime mock state changed | Future implication |
| --- | --- | --- | --- |
| RoleSelectScreen | Tap customer or merchant login button | Navigation stack and local role only | Requires future auth/session/role design |
| NearbyDealsScreen | Tap deal card to open detail | Navigation stack only | Requires future deal detail route/API |
| DealDetailScreen | Tap join to open drink selection; tap progress | Navigation stack only | Requires eligibility and progress APIs |
| DrinkSelectionScreen | Select drink, sweetness, ice, topping, quantity, fallback preference | Local form state | Requires menu/options schema and order draft rules |
| DrinkSelectionScreen | Add customized drink to cart | Adds runtime mock cart item only; does not create an order or payment yet | Requires cart/draft ownership and validation rules |
| CartScreen | Review cart and submit order | Creates runtime mock order and payment authorization candidate, then clears that deal's cart | Requires transactional order creation before starting Line Pay authorization |
| GroupProgressScreen | Show recruiting/confirmed/failed/cancelled status and my order summary | Reads runtime deals/orders state | Requires status flow and private/public response split |
| PaymentReportScreen | Simulate Line Pay payment completion | Changes runtime payment status from `pending` to `confirmed` | Requires future payment provider authorization/capture flow |
| PaymentReportScreen | Continue to pickup info | Navigation stack only | Requires payment/pickup gating rules |
| PickupInfoScreen | Show pickup data and my order summary | Reads runtime orders and pickup mock | Requires pickup eligibility and verification design |
| MerchantDealCreateScreen | Submit create activity form | Adds runtime mock deal | Requires merchant authorization and create-deal transaction |
| MerchantDashboardScreen | Show activity list, order count, payment summary, pickup summary | Reads runtime deals/orders state | Requires merchant summary API and visibility rules |

## Runtime Mock Data Note

Initial data still comes from `mobile/src/mock/`, each marked `prototype only, not final API contract`.

User interactions create additional in-memory mock data inside `mobile/src/navigation/AppNavigator.js`. This is also prototype-only and should not be interpreted as persistence, API behavior, or database schema.

## Back Button Update

The current prototype adds a simple shared back button through `MobileScreen`. This is prototype navigation only and does not use React Navigation headers yet.

| Screen | Has back button | Back target or behavior | Notes |
| --- | --- | --- | --- |
| DealDetailScreen | Yes | `NearbyDealsScreen` via `navigation.replace("nearby")` | Returns to customer home/list. |
| DrinkSelectionScreen | Yes | `DealDetailScreen` with current `dealId` | Returns to the deal being ordered. |
| GroupProgressScreen | Yes | `navigation.back()` | This screen can be reached from drink selection, detail, or bottom nav; back stack is currently the most reasonable behavior. |
| PaymentReportScreen | Yes | `GroupProgressScreen` with `dealId` and `orderId` | Explicit target avoids returning to stale payment form. |
| PickupInfoScreen | Yes | `GroupProgressScreen` with derived `dealId` and `orderId` | Uses order data when available. |
| MerchantDealCreateScreen | Yes | `MerchantDashboardScreen` | Returns to merchant activity list. |

### Back Path Uncertainty

`GroupProgressScreen` has the only intentionally flexible back path. If entered after joining, it returns to `DrinkSelectionScreen`; if entered from detail or bottom navigation, it returns to the previous stack entry. A formal navigation library may later replace this behavior with route-aware headers.

## Payment Authorization Update

The mobile prototype now treats the payment step as authorization-first, not manual payment report. This is prototype only and does not call a real payment provider.

| Screen | Display data | User input | User actions | Mock data source | Loading state | Empty state | Error state | Permission needs | Open questions |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PaymentReportScreen / PaymentAuthorizationScreen candidate | `originalAmount`, `authorizedAmount`, `authorizationStatus`, `paymentStatus`, `finalAmount`, `captureAmount`, `releasedAmount`; text explaining that authorization is not a final charge | None in current mock | Simulate successful authorization; simulate partial capture after discount qualification; continue to pickup info | `mobile/src/mock/paymentReports.js`, runtime payment state in `mobile/src/navigation/AppNavigator.js` | Future provider authorization/capture loading | No selected order or no payment record | Authorization failed, capture failed, provider timeout | Customer can only view and authorize their own order | Whether this screen should be renamed to `PaymentAuthorizationScreen` |
| GroupProgressScreen | `targetCups`, `authorizedCups`, `remainingAuthorizedCups`, `discountStatus`, my order summary, `paymentStatus`, and when qualified: `finalAmount`, `captureAmount`, `releasedAmount` | None | Continue to payment authorization; continue to pickup info | `mobile/src/mock/groupOrders.js`, `mobile/src/mock/orders.js`, `mobile/src/mock/paymentReports.js` | Future progress aggregation loading | No group order or no user order | Progress cannot be calculated, payment state missing | Public progress may be visible; my order/payment summary is private | Whether `authorizedCups` should be stored, computed live, or cached |

### Authorization Flow Notes

- 使用者選擇並完成客製化後，只加入本機 mock 購物車，不建立訂單也不啟動付款。
- 使用者在 `CartScreen` 送出後，才建立 mock order，並以訂單 `originalAmount` 建立 LINE Pay 預授權候選。
- 預授權成功後，`paymentStatus = authorized` 且 `authorizationStatus = authorized`。
- 只有 `paymentStatus = authorized` 或後續 `captured` 的訂單杯數可計入 `authorizedCups`。
- 當 `authorizedCups >= targetCups`，`discountStatus = qualified`。
- 達標後顯示 `finalAmount` / `captureAmount` / `releasedAmount`。
- 未達標的未來候選狀態為 `paymentStatus = authorization_voided`，目前畫面只記錄規則，尚未做真金流或 provider callback。
- 修改或刪除訂單品項後，若訂單總額變動，mock flow 將付款狀態重設為 `pending`，顯示「重新預授權」，並暫時從 `authorizedCups` 移除該訂單杯數。
- 團購截止前 30 分鐘為訂單鎖定期：仍可新增訂單加入團購，但既有訂單不可修改、退出或刪除品項。
- 商家流程使用商家首頁與底部導覽；商家底部導覽目前只包含「首頁」與「開團」，開團頁返回目標固定為商家首頁。
- 商家開團頁目前固定使用一間測試商家，不提供門市選擇；未來應由商家登入帳號及其授權門市決定 `storeId`。

## CartScreen Update

| Screen | Display data | User input | User actions | Mock data source | Loading state | Empty state | Error state | Permission needs | Open questions |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CartScreen | Customized cart items, quantities, item subtotals, total cups, original amount total, LINE Pay next-step notice | None currently | Remove item, continue shopping, submit order and proceed to LINE Pay | Runtime `cartItems` in `mobile/src/navigation/AppNavigator.js`; prototype only, not final API contract | Future order submit and payment handoff loading | Empty cart | Item unavailable, deal closed, price changed, order submit failed | Customer can only access their own cart | Whether carts persist across app restarts and whether one cart may contain multiple deals |

## Merchant Login Prototype Update

| Screen | Display data | User input | User actions | Mock data source | Loading state | Empty state | Error state | Permission needs | Open questions |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| RoleSelectScreen merchant login section | Merchant store dropdown, selected store name and address | Selected prototype store | Open dropdown, select merchant store, enter merchant dashboard as selected store | `mobile/src/mock/stores.js`; prototype only, not final API contract | Future login loading | No merchant stores | Unauthorized store or inactive merchant account | Real auth not implemented; this is role simulation | Whether one merchant account can manage multiple stores and how default store is selected |

## Prototype Account Isolation Update

| Screen | Display data | User input | User actions | Mock data source | Loading state | Empty state | Error state | Permission needs | Open questions |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CustomerOrdersScreen | Only orders belonging to the selected prototype customer account | None | View own order, edit own mock order, reauthorize own payment | `orders.customerId`, runtime orders in `AppNavigator`; prototype only, not final auth model | Future account order loading | Selected customer has no orders | Order belongs to another customer or no longer exists | Real auth/session required later | Whether users can switch accounts on the same device without clearing local cart |

## LiveMapScreen Update

| Screen | Display data | User input | User actions | Mock data source | Loading state | Empty state | Error state | Permission needs | Open questions |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| LiveMapScreen | Full-page Google Maps view, National Taichung University of Science and Technology center marker, seven prototype store markers with store names shown below, selected store card, zoom level, marker legend; normal test stores use blue markers and stores with `recruiting` deals use yellow markers; Google Maps built-in POI clicks are disabled | None | Pan/pinch zoom, use zoom buttons, select prototype store marker, open that store's recruiting deal | Native Google Maps / Maps JavaScript API plus generated `mobile/src/mock/databaseMapStores.js`; this file is exported from the prototype SQLite database and is not a final API contract | Map API loading | No prototype store markers | Google Maps unavailable, missing Android/Web API key, database export missing | Customer only in current bottom navigation | A future API or local SQLite adapter is required for live map updates without rerunning the export script |
