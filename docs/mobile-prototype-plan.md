# Mobile Prototype Plan

## Document Purpose

This document plans the first Android-first mobile app prototype. It is based on the current Web reference prototype and docs, but it does not create real API, backend, database, payment, map, login, or push-notification behavior.

Recommended implementation direction for the next phase: React Native + Expo in a future `mobile/` folder.

## Prototype Scope

The first mobile prototype should focus on:

- Android phone user flow.
- Mobile screen structure.
- Touch-first navigation.
- Mock data display.
- Status readability.
- Screen-level loading, empty, and error states.
- Data requirements for future API and database design.

The first mobile prototype should not implement:

- Real Google Maps API.
- Real GPS lookup.
- Real Google login.
- Real payment authorization or capture.
- Real LINE Pay integration.
- Real push notification.
- Real backend writes.
- Real database persistence.
- iOS-specific optimization.

## Screen Plan

### 1. NearbyDealsScreen

| Item | Content |
| --- | --- |
| Purpose | Let customers browse nearby stores and active group-buy opportunities on Android. |
| User role | Customer |
| Data to display | Store name, distance text, business status, deal title, deal status, current cups, target cups, next discount tier, remaining time, pickup time summary. |
| User actions | Open deal detail, switch between list mock and map mock, refresh mock list, view location permission placeholder. |
| Mock data | `stores`, `deals` |
| Real features not included | Real Google Maps API, real GPS lookup, real search ranking, real push notification. |
| Future API | `GET /mobile/deals/nearby`, `GET /mobile/stores/nearby` |
| Future database entity | `stores`, `store_locations`, `deals` or `group_buy_activities`, `discount_tiers` |
| Open questions | Should the home screen show only joinable deals? How should denied location permission be displayed? Should cancelled or full deals appear? Is `targetCups` the first tier, next tier, or maximum tier? |

### 2. DealDetailScreen

| Item | Content |
| --- | --- |
| Purpose | Let customers inspect a store and deal before joining. |
| User role | Customer |
| Data to display | Store profile, address, phone, business status, distance, deal title, status, current cups, participant count, remaining time, end time, pickup time, all cup discount tiers, cancellation reason, notices. |
| User actions | Go to drink selection, view group progress, inspect discount tiers, read cancellation or full-cap message. |
| Mock data | `stores`, `deals` |
| Real features not included | Real navigation map, real phone call integration, real favorite store, real share link, real API refresh. |
| Future API | `GET /mobile/deals/:dealId`, `GET /mobile/deals/:dealId/progress` |
| Future database entity | `stores`, `deals`, `discount_tiers`, `deal_status_history`, `deal_cancellations` |
| Open questions | Should participant count be public? Which cancellation reason is visible to customers? Can customers join after the highest discount tier is reached? How should multiple discount tiers be explained on a small screen? |

### 3. DrinkSelectionScreen

| Item | Content |
| --- | --- |
| Purpose | Let customers choose drinks, customize options, set quantity, and indicate fallback purchase preference. |
| User role | Customer |
| Data to display | Store name, deal summary, drink items, price, sweetness options, ice options, topping options, quantity, subtotal, fallback purchase preference, join restriction message. |
| User actions | Select drink, choose sweetness, choose ice, select toppings, change quantity, review subtotal, choose whether to buy at original price if the deal fails, submit mock join action. |
| Mock data | `stores`, `deals`, `drinks` |
| Real features not included | Real order creation, real payment authorization, real inventory validation, real menu sync, real login. |
| Future API | `GET /mobile/stores/:storeId/menu`, `POST /mobile/deals/:dealId/orders` |
| Future database entity | `drinks`, `drink_options`, `drink_toppings`, `orders`, `order_items`, `order_item_customizations`, `payment_authorizations` |
| Open questions | Can one order contain multiple drink items? Can toppings be multi-select or multiple quantities? Can orders be edited before deadline? Does joining require payment preauthorization immediately? |

### 4. GroupProgressScreen

| Item | Content |
| --- | --- |
| Purpose | Let customers track current group-buy progress, outcome, and their own order summary. |
| User role | Customer |
| Data to display | Deal status, current cups, target cups, maximum cups, participant count, remaining time, cups until next tier, applied or next discount tier, my order summary, fallback purchase preference, possible next actions. |
| User actions | View payment screen, view pickup screen, review own order, see result if completed, failed, cancelled, or full. |
| Mock data | `deals`, `groupOrders`, `orders` |
| Real features not included | Real-time progress sync, real settlement, real payment capture, real order cancellation, real push notification. |
| Future API | `GET /mobile/deals/:dealId/progress`, `GET /mobile/orders/:orderId`, `PATCH /mobile/orders/:orderId`, `DELETE /mobile/orders/:orderId` |
| Future database entity | `group_buy_activities`, `orders`, `order_items`, `activity_settlements`, `order_settlements`, `status_history` |
| Open questions | Which status controls payment and pickup access? How should concurrent joins be handled? Should customers see all participants or only aggregate counts? How should failed deals with original-price fallback be shown? |

### 5. PaymentReportScreen

| Item | Content |
| --- | --- |
| Purpose | Prototype how customers see payment information and payment status on mobile. |
| User role | Customer; merchant visibility is a future related flow |
| Data to display | Amount due, payment status, recipient or provider label, bank code or provider name, masked account if manual payment remains, QR placeholder, authorization/capture/release placeholder, payment note. |
| User actions | Read payment status, submit manual report mock if retained, select screenshot placeholder if retained, view failure or no-payment-needed state. |
| Mock data | `paymentReports`, possibly future `paymentAuthorizations` mock |
| Real features not included | Real LINE Pay, real credit-card authorization, real capture, real refund/release, real file upload, real payment review. |
| Future API | `GET /mobile/orders/:orderId/payment`, `POST /mobile/orders/:orderId/payment-reports`, `POST /mobile/orders/:orderId/payment-authorizations` |
| Future database entity | `payment_reports`, `payment_report_attachments`, `payment_reviews`, `payment_authorizations`, `payment_captures`, `payment_releases` |
| Open questions | Is manual transfer report still part of the product? Is online preauthorization the main flow? Who confirms payment? What payment records require history and audit logs? |

### 6. PickupInfoScreen

| Item | Content |
| --- | --- |
| Purpose | Let customers view individual pickup information after a deal outcome allows pickup. |
| User role | Customer |
| Data to display | Store name, pickup address, pickup time, item summary, pickup status, update notice, possible pickup identifier placeholder. |
| User actions | Review pickup instructions, view address map placeholder, read update notice, view cancellation or not-ready state. |
| Mock data | `pickupInfo`, `orders`, `stores` |
| Real features not included | Real map navigation, real QR code verification, real push update, real pickup scan, real merchant handoff. |
| Future API | `GET /mobile/orders/:orderId/pickup`, `GET /mobile/deals/:dealId/pickup-window` |
| Future database entity | `pickup_windows`, `order_pickups`, `pickup_status_history`, `pickup_updates`, `notification_events` |
| Open questions | Is pickup identified by QR code, number, customer surname, or phone? Can pickup time change after deal creation? Should pickup updates generate notifications later? |

### 7. MerchantDealCreateScreen

| Item | Content |
| --- | --- |
| Purpose | Let merchants create a mock discount activity from a mobile device. |
| User role | Merchant |
| Data to display | Authorized store selector, activity form, discount tier input, start time, end time, pickup time, notices, validation messages. |
| User actions | Select store, enter title, set cup thresholds, set discount amount, set time windows, add notes, submit mock create action. |
| Mock data | `stores`, local form state, future `merchantStores` mock |
| Real features not included | Real merchant authorization, real store ownership validation, real publication, real notification, real backend write. |
| Future API | `GET /mobile/merchant/stores`, `POST /mobile/merchant/deals` |
| Future database entity | `merchant_accounts`, `merchant_store_memberships`, `stores`, `deals`, `discount_tiers`, `pickup_windows` |
| Open questions | Can merchants create multiple activities at the same time? Are discount tiers always cup-based only? Which fields are editable after publication? Can merchants cancel after customers joined? |

### 8. MerchantDashboardScreen

| Item | Content |
| --- | --- |
| Purpose | Let merchants review their activities, participation, payment summary, and pickup readiness on mobile. |
| User role | Merchant |
| Data to display | Activity list, status, current cups, target cups, order count, payment summary, pickup summary, store name, cancellation state. |
| User actions | Open activity summary, create activity, inspect payment summary placeholder, inspect pickup summary placeholder, cancel activity in future screen. |
| Mock data | `deals`, `orders`, `stores`, possible future `merchantActivitySummaries` mock |
| Real features not included | Real merchant auth, real payment review, real pickup verification, real cancellation write, real export. |
| Future API | `GET /mobile/merchant/deals`, `GET /mobile/merchant/deals/:dealId`, `POST /mobile/merchant/deals/:dealId/cancel` |
| Future database entity | `merchant_accounts`, `stores`, `deals`, `orders`, `payment_reviews`, `order_pickups`, `deal_cancellations`, `audit_logs` |
| Open questions | How much customer data can merchants see? Should customer surname be visible? Does merchant dashboard belong inside the same app as customer screens? What cancellation reason is required? |

## Shared Status Candidates

Mobile screens should keep status naming consistent with existing status candidates until formalized.

| Owner | Candidate values |
| --- | --- |
| Deal or activity | `recruiting`, `formed`, `failed`, `cancelled`, `full`, plus possible settlement states |
| Order | `draft`, `submitted`, `locked`, `completed`, `cancelled` |
| Payment | `pending`, `submitted`, `confirmed`, `not_required`, or online-payment states such as `authorized`, `captured`, `released`, `failed` |
| Pickup | `not_ready`, `ready`, `picked_up`, `cancelled`, `expired` |
| Store | `open`, `closed`, `temporarily_closed` |

## First-Phase Success Criteria

- The mobile prototype can be opened on Android.
- All eight first-phase screens can be navigated.
- All data comes from prototype mock data.
- Mock data is clearly marked as not final API contract.
- No real backend, database, payment, map, login, or notification service is connected.
- The mobile UI is touch-first and does not copy Web desktop layout directly.
