# Current Progress Handoff

Last updated: 2026-06-05

## Project Direction

The project direction is now:

- Android-first mobile app prototype
- React Native + Expo
- Main development folder: `mobile/`
- Database draft folder: `database/`
- Documentation folder: `docs/`

This is still a prototype. It is not a finished production system.

## Important Deleted Legacy Files

The old Web / Node prototype has been deleted by user confirmation:

- `frontend/`
- `server.js`
- `src/`
- `data/`

Do not restore these unless the user explicitly asks.

Known cleanup remaining:

- Root `package.json` still has `"start": "node server.js"` and should be updated later.
- `scripts/verifyPromotions.js` still references deleted `src/services/promotionCalculator.js`.
- Some old docs still mention `frontend/`, `server.js`, `src/`, or `data/`.

## Mobile App Prototype

Main entry:

```text
mobile/App.jsx
mobile/src/navigation/AppNavigator.js
```

`AppNavigator.js` currently owns most prototype state and interactions:

- login role selection
- customer / merchant / admin navigation
- merchant deal creation
- cart state
- order submission
- order modification
- Line Pay authorization mock
- partial capture mock
- localStorage prototype persistence

## Login / Role Flow

Current login screen:

```text
mobile/src/screens/RoleSelectScreen.jsx
```

It uses one dropdown-style selector for:

- customer accounts
- merchant accounts
- admin prototype account

Customer prototype accounts:

```text
mobile/src/mock/customerUsers.js
```

Current customer users:

- 引吉
- 柏綸
- 立玄
- 菁鍏

Each customer has separate cart/order state by `customerId`.

The Google login button is display-only and has no real login behavior.

## Customer Screens

Customer flow:

```text
RoleSelectScreen
→ NearbyDealsScreen
→ LiveMapScreen
→ DealDetailScreen
→ DrinkSelectionScreen
→ CartScreen
→ PaymentReportScreen
→ CustomerOrdersScreen
→ PickupInfoScreen
```

Important customer screens:

- `NearbyDealsScreen.jsx`: customer home and active/recommended deals.
- `LiveMapScreen.web.jsx`: Web Google Maps implementation.
- `LiveMapScreen.native.jsx`: Android native Google Maps implementation.
- `DealDetailScreen.jsx`: group-buy detail and discount tiers.
- `DrinkSelectionScreen.jsx`: drink list first, then customization.
- `CartScreen.jsx`: cart, fallback preference checkbox, submit order.
- `CustomerOrdersScreen.jsx`: cart draft and submitted order details.
- `GroupProgressScreen.jsx`: group-buy progress.
- `PaymentReportScreen.jsx`: Line Pay authorization / partial capture mock.
- `PickupInfoScreen.jsx`: pickup info and pickup credential placeholder.

## Merchant Screens

Merchant flow:

```text
RoleSelectScreen
→ MerchantDashboardScreen
→ MerchantDealCreateScreen
→ MerchantDashboardScreen
```

Important merchant behavior:

- Merchant identity is chosen on login.
- Merchant dashboard shows only that merchant store's activities.
- Merchant can create group-buy activities.
- Created activities are saved to React state and prototype localStorage.
- Created activities are not written to SQLite yet.

## Admin Screen

Admin prototype screen:

```text
mobile/src/screens/AdminDashboardScreen.jsx
```

It is only a prototype display and not a real backend admin system.

## Current Payment Prototype

Payment design direction:

- original amount authorization
- successful authorization sets payment status to `authorized`
- authorized cups count toward group-buy progress
- if group qualifies, final amount / capture amount / released amount are shown
- if order amount changes after authorization, reauthorization is required

This is a mock only:

- no real Line Pay integration
- no backend API
- no provider webhook

## Cart And Order Behavior

Current behavior:

1. Customer selects drink.
2. Customer customizes sweetness, ice, toppings, quantity.
3. Drink is added to cart.
4. Cart appears on `CustomerOrdersScreen` as a draft.
5. Cart can be submitted.
6. Submitted cart becomes an order.
7. Order goes to Line Pay authorization mock.
8. After authorization, editing the order resets payment state to `pending` and requires reauthorization.

Recent fix:

- Order detail now displays drink names correctly.
- `itemName` / `name` fields are normalized.
- Adding drinks while editing an already authorized order adds items directly to the existing order.
- Order totals recalculate after item add/edit/delete.

## Prototype Persistence

Prototype local persistence is implemented in:

```text
mobile/src/utils/prototypeStorage.js
```

It saves to browser `localStorage` when available:

- `deals`
- `orders`
- `paymentReports`
- `cartItems`

Important:

- This is not a database.
- It only persists on the same browser/device.
- It is not shared across computers.
- Clearing browser data removes it.

## Google Maps

Google Maps is allowed for prototype map display.

Relevant files:

```text
mobile/src/screens/LiveMapScreen.web.jsx
mobile/src/screens/LiveMapScreen.native.jsx
mobile/src/mock/mapConfig.js
mobile/src/mock/databaseMapStores.js
```

Current behavior:

- Web uses Google Maps JavaScript API.
- Native uses `react-native-maps`.
- Store marker is blue when there is no recruiting deal.
- Store marker is yellow when there is a recruiting deal.
- If a store has an active group-buy, marker label shows current cups / nearest unmet target cups.

Example:

```text
4/20杯
22/35杯
```

Google Maps API keys must remain local and must not be committed.

## Database Status

There are two SQLite areas:

### Development Database Draft

```text
database/schema.sql
database/init-dev-db.js
database/drink-group-buy-dev.sqlite
```

`drink-group-buy-dev.sqlite` is generated locally and ignored by Git.

Current dev database has tables but no seed data yet.

Main tables:

- `users`
- `user_roles`
- `merchants`
- `merchant_users`
- `stores`
- `menu_items`
- `customization_options`
- `group_buy_activities`
- `promotion_tiers`
- `cart_drafts`
- `cart_draft_items`
- `orders`
- `order_items`
- `payment_authorizations`
- `payment_captures`
- `payment_provider_events`
- `activity_settlements`
- `pickup_credentials`
- `status_history`
- `audit_logs`

Run:

```powershell
node database/init-dev-db.js
```

### Prototype Test Database

```text
database/test/
```

This is for prototype map exports and test data only.

Current test database has:

- 9 test users
- 7 stores
- 8 menu items
- 0 deals
- 0 orders
- 0 payment authorizations
- 0 pickup credentials

Run:

```powershell
node database/test/init-test-db.js
node database/test/export-mobile-map-data.js
```

## Important Constraint

Merchant-created deals currently do not write into SQLite.

Current storage:

```text
Merchant creates deal
→ React state
→ prototype localStorage
```

Future formal flow should be:

```text
Merchant creates deal
→ mobile app calls backend API
→ backend validates merchant permission
→ backend writes group_buy_activities and promotion_tiers
→ customer app reads activities from API
```

## How To Continue On Another Computer

After cloning the repository on another computer, tell the next Codex session:

```text
請先閱讀 AGENTS.md、docs/current-progress.md、docs/project-direction.md、docs/mobile-prototype-plan.md。
目前專案是 Android-first mobile app prototype。
主要開發位置是 mobile/。
舊的 frontend/、server.js、src/、data/ 已刪除，請不要恢復。
請根據目前檔案狀態接續作業。
```

Then install and run mobile:

```powershell
cd mobile
npm install
npm run web
```

For Android:

```powershell
cd mobile
npm install
npm run android
```

If Google Maps does not appear, create local env:

```text
mobile/.env
```

and set:

```text
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

Do not commit `.env`.

## Suggested Next Steps

1. Update root `package.json` because `server.js` was deleted.
2. Remove or update `scripts/verifyPromotions.js`.
3. Clean old docs that still refer to deleted Web prototype files.
4. Add `database/seed-dev.sql` for dev database users, stores, menu items.
5. Decide backend direction before connecting mobile to database.
6. Design first backend API for merchant creating group-buy activities.
