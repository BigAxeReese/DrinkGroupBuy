# Mobile Screen Data Requirements

Last updated: 2026-06-24

## Language / 中文註解規則

本文件整理 mobile 每個畫面需要顯示的資料、使用者操作、目前資料來源，以及尚未完成的後端工作。

- Screen / component 名稱保留英文，因為它們對應 `mobile/src/screens/` 內的檔案。
- 中文說明用來輔助理解畫面用途與資料需求。
- 若涉及 API 欄位、state key 或 route name，保留英文並可加中文註解。
- 若畫面資料來源仍是 local state、localStorage 或 mock，之後要逐步改成 backend authoritative data。

Current app: React Native + Expo, Android-first. Data may come from backend API, mobile local state, localStorage, or clearly marked mock files; each screen below states the current source.

| Screen | Role and purpose | Displayed data / input | Actions | Current source | Missing states / backend work |
| --- | --- | --- | --- | --- | --- |
| `RoleSelectScreen` | Google Login entry screen | Google Login button, loading/error state, signed-in user summary after login | Start Google Login, exchange Firebase ID token with backend, continue to backend-resolved role home, sign out Firebase session | Firebase Auth + backend `POST /api/auth/firebase-session` | Requires Firebase project config and `users.firebase_uid` mappings in development database |
| `NearbyDealsScreen` | Customer home and joined/recommended activities | Member header, joined activity progress for the selected customer only, recommended stores/activities | Open activity, map, orders, member page | Mobile deals/orders/store mocks and local state | Backend activity load, location loading/error |
| `LiveMapScreen` | Browse stores geographically | Google map, store marker/name, active activity cup progress | Pan/zoom, inspect marker | Google Maps SDK plus exported/mock store data | Nearby store API, live activity synchronization |
| `DealDetailScreen` | Review activity before ordering | Store, activity status, tiers, progress, deadline, pickup window, notices | Open menu or progress | Mobile app state and store mocks | Detail API, join eligibility validation |
| `StoreMenuScreen` | Browse drink menu | Categories, menu items, prices | Select drink | Mobile drink/store mocks | Menu API, availability and price changes |
| `DrinkSelectionScreen` | Customize one drink | Size, sweetness, ice, toppings, quantity, subtotal | Add to cart or save edit | Mobile state and mocks | Server validation, unavailable options |
| `CartScreen` | Review draft and submit | Items, totals, fallback original-price checkbox | Remove item, continue shopping, submit | Mobile cart state/localStorage | Transactional order API, price conflict handling |
| `PaymentReportScreen` | Simulate LINE Pay authorization/capture and launch sandbox LINE Pay authorization | Original, authorized, final, capture and released amounts; payment status; provider `transactionId`; `paymentUrl`; backend request result | Open LINE Pay sandbox authorization URL; authorize/capture mock fallback | Mobile payment state; `POST /api/payments/line-pay/request` | Rename screen, provider API persistence, redirect-to-app sync, webhook/error recovery |
| `GroupProgressScreen` | Show activity and customer order progress | Activity badge, current/next target cups, participants, remaining time, order summary | Open payment or pickup | Mobile app state | Progress API, authoritative settlement result |
| `CustomerOrdersScreen` | Active/history orders and order editing | Store, items, customizations, item totals, order total, statuses, pickup code | Open activity, edit/delete before lock, reauthorize | Mobile orders/payments/localStorage | Order APIs, revision history, server permission/lock validation |
| `PickupInfoScreen` | Show pickup information | Store/address/window, order summary, pickup status | View location/code placeholder | Mobile state and mocks | Pickup API and credential verification |
| `MerchantDashboardScreen` | Merchant activity and fulfillment dashboard | Active activities, order/payment/pickup counts, history | Create activity, accept orders, complete preparation | Activities partly API-backed; orders local | Merchant summary/order APIs and authorization |
| `MerchantDealCreateScreen` | Create activity and promotion tiers | Fixed store, title, deadline, pickup time, notes, tiers | Add/remove tier, create activity | POST API with local fallback | Merchant auth, robust validation, retry UX |
| `AdminDashboardScreen` | Review/cancel platform activities | Activity progress, order/payment summaries, cancellation state | View detail, cancel activity | DELETE API with local fallback | Admin auth, backend list, cascading payment/order result |
| `CustomerPlaceholderScreen` | Discussion/profile placeholders | Placeholder copy | Navigate only | Static | Features not designed |

## Shared Screen Rules

- Mobile tap targets should remain at least approximately 44x44 points.
- Back actions should use navigation history and an explicit fallback only when no prior route exists.
- Customer data must be scoped to the authenticated customer once authentication exists.
- Customer joined/active order areas are customer-scoped. Home recommendations, map discovery, and recruiting activity lists are global/nearby activity data.
- Merchant data must be scoped to authorized stores.
- Raw internal field names such as `targetCups:` must not be shown as debug text.
- Pickup credentials are visible only when `pickupStatus = ready` or during a defined later state.
- Cancelled/failed/completed activities and orders belong in history, not active lists.
- The highest promotion tier cup count is the activity capacity limit. Cart submit and payment authorization must not push activity cups beyond that maximum.

## Current Navigation

Customer:

```text
Google Login -> Backend role resolution -> Home/Map -> Activity Detail -> Menu -> Drink Customization -> Cart
      -> Payment Authorization Mock -> Progress/Orders -> Pickup
```

Merchant:

```text
Google Login -> Backend role resolution -> Merchant Dashboard -> Create Activity -> Dashboard
                            -> Accept Orders -> Complete Preparation
```

Administrator:

```text
Google Login -> Backend role resolution -> Admin Dashboard -> Activity Detail / Cancel Activity
```

## 2026-07-05 Login UI Direction

- Production login shows only Google Login.
- The user must not manually select customer, merchant, or admin role in production.
- After Firebase login, backend response decides the destination:
  - customer -> customer home/map/orders
  - merchant -> merchant dashboard for authorized store
  - admin -> admin dashboard
- Existing password fields and account dropdown have been removed from the mobile login screen.
- During development, test roles should be switched by signing in with different Firebase Google test accounts mapped in backend seed data, not by selecting a role in the app.
