# DrinkGroupBuy TODO

## Current Progress

- Project folder exists at `C:\vscode\DrinkGroupBuy`.
- Lightweight Node/Web prototype has been created.
- Initial system architecture discussion is documented in `docs/ai_notes.md`.
- Initial project handoff notes are documented in `AGENTS.md`.
- Test shop data exists in `data/shops/shops.json`.
- Shop test data now uses B2C preorder promotion fields.
- Group-buy records are stored in `data/group_buys/group_buys.json`.
- Current UI runs at `http://localhost:3000`.
- Web admin dashboard runs at `http://localhost:3000/admin`.
- Latest pushed prototype commit before current work: `7fe6751 Build merchant and customer group buy flows`.
- The 2026-05-26 discussion and implemented feature summary is recorded in `docs/ai_notes.md`.

## Next Decisions

- Decide MVP scope:
  - Option A: single shop, single active group buy first.
  - Option B: multi-shop, multi-group-buy support from the start.
- Keep current lightweight HTML/CSS/JavaScript prototype until the flow becomes complex enough to justify React.
- Decide whether participants need login in version 1.
- Decide how organizer/admin access should work:
  - Private admin link.
  - Password.
  - Full account system.
- Decide how shops will publish promotions:
  - Admin-created seed data first.
  - Shop dashboard later.

## Implementation TODO

- Create project scaffold. Done for the lightweight prototype.
- Add `package.json`. Done.
- Set up Node server. Done in `server.js`.
- Set up SQLite database.
- Create database schema/migrations.
- Add REST API routes:
  - Shops.
  - Promotions.
  - Menu items.
  - Group buys.
  - Orders.
  - Order items.
- Add promotion eligibility calculation:
  - Cups-based target.
  - Amount-based target.
  - Fixed amount discount.
  - Implemented first reusable calculator in `src/services/promotionCalculator.js`.
- Add group-buy service:
  - Create group buy.
  - Validate shop and promotion.
  - Store group-buy records in `data/group_buys/group_buys.json`.
- Next group-buy functions:
  - Join group buy. Done in prototype.
  - Leave group buy. Done in prototype.
  - Recalculate group-buy totals. Done in prototype.
- Preserve custom promotion matrix on created group buys.
- Add participant order storage.
- Add join form that selects drink items from the shop menu. Done in prototype.
- Add dedicated customer join flow with shop-backed drink menu and sugar, ice, quantity, and note customization. Done in prototype.
- Build initial frontend pages:
  - Group-buy list.
  - Create group buy.
  - Participant order form.
  - Admin order view.
  - Shop and menu management.
  - Nearby shop map.
  - Shop promotion detail.
- Added first lightweight Web UI in `public/`:
  - Create group-buy form.
  - Custom promotion matrix inputs for cups and discount amount.
  - Average discount per cup preview.
  - Group-buy detail panel.
  - Existing group-buy list.
  - Customer list-first navigation with progress toward the nearest unreached cup-discount tier and drill-down detail. Done in prototype.
  - Customer join screen that lists joinable campaigns, then loads the corresponding shop menu and order customization form. Done in prototype.
  - Customer can open activity information from the list, tap join, view shop menu prices, and customize the selected drink in a dialog. Done in prototype.
  - Customer group-buy list is filtered to activities that can still be joined. Done in prototype.
  - Customer order management page lists the selected simulated account's joined drink entries and provides per-group-buy proportional discount amount estimates. Done in prototype.
  - Merchant group-buy name defaults to `飲料團購` when left blank. Done in prototype.
  - Simulated merchant-account selector mapped to seeded shop data. Done in prototype.
  - Simulated customer accounts `test1` to `test3`, used automatically when joining without a name field in drink customization. Done in prototype.
  - Desktop phone-frame preview with full-screen fallback for small viewports. Done in prototype.
  - Merchant list-first group-buy management navigation. Done in prototype.
  - Merchant active/history order views and completion action after deadline. Done in prototype.
  - Merchant-only simulated deadline trigger for testing receiving flow. Done in prototype.
  - Desktop web admin dashboard listing all group buys with detail viewing, participant order inspection, and editing for activity fields, discount tiers, and status. Done in prototype.
- Add order summary calculation. Customer-facing per-order estimated amount display done in prototype.
- Add payment status update.
- Add close/reopen group-buy behavior.
- Add merchant group-buy cancellation with reason. Done in prototype.
- Add formal order status machine and payment/refund handling when backend architecture is upgraded.
- Add text export for final shop order.
- Protect the web admin dashboard and group-buy edit endpoint with authenticated authorization once login architecture is introduced.

## Current Test Commands

```powershell
node C:\vscode\DrinkGroupBuy\server.js
node C:\vscode\DrinkGroupBuy\scripts\verifyPromotions.js
```

Browser:

```text
http://localhost:3000
```

## Later Enhancements

- User accounts and permissions.
- Enforce merchant authorization on group-buy creation and cancellation once authentication is introduced.
- LINE Bot notifications.
- Payment integration.
- CSV/Excel export.
- Menu import from image or spreadsheet.
- Order edit/cancel flow.
- Audit log for admin changes.
- Mobile-first UI polish.
- Deployment setup.

## 2026-06-03 Mobile Prototype Update

Done:

- Created Android-first React Native + Expo mobile prototype under `mobile/`.
- Added customer and merchant prototype navigation.
- Added customer bottom navigation: 首頁, 即時地圖, 我的訂單, 討論區, 個人中心.
- Added mobile customer order page with order list/history tabs, group-buy detail link, order details, item prices, total amount, and pickup credential mock display.
- Updated drink menu flow so users select a drink first, then configure sweetness, ice, toppings, quantity, and fallback purchase preference.
- Replaced manual payment-report direction in the mobile prototype with authorization-first payment screens.
- Added mock fields for `originalAmount`, `authorizedAmount`, `finalAmount`, `captureAmount`, `releasedAmount`, `paymentStatus`, `authorizationStatus`, `authorizedCups`, `targetCups`, and `discountStatus`.
- Updated mobile docs for screen data, API candidates, database candidates, status candidates, and open questions.

Next:

- Decide whether `PaymentReportScreen` should be renamed to `PaymentAuthorizationScreen`.
- Verify payment provider support for authorization plus partial capture.
- Define canonical payment status flow before backend design.
- Decide whether `authorizedCups` is computed live or stored as a progress snapshot.
- Add formal UI states for authorization expiry, void authorization, capture failure, and re-authorization.
