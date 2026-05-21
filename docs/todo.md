# DrinkGroupBuy TODO

## Current Progress

- Project folder exists at `C:\vscode\DrinkGroupBuy`.
- Repository currently has only `.git`; no application scaffold has been created yet.
- Initial system architecture discussion is documented in `docs/ai_notes.md`.
- Initial project handoff notes are documented in `AGENTS.md`.
- Test shop data exists in `data/shops/shops.json`.
- Shop test data now uses B2C preorder promotion fields.

## Next Decisions

- Decide MVP scope:
  - Option A: single shop, single active group buy first.
  - Option B: multi-shop, multi-group-buy support from the start.
- Decide frontend stack:
  - Plain HTML/CSS/JavaScript for fastest simple version.
  - React for a more scalable UI structure.
- Decide whether participants need login in version 1.
- Decide how organizer/admin access should work:
  - Private admin link.
  - Password.
  - Full account system.
- Decide how shops will publish promotions:
  - Admin-created seed data first.
  - Shop dashboard later.

## Implementation TODO

- Create project scaffold.
- Add `package.json`.
- Set up Express server.
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
  - Join group buy.
  - Leave group buy.
  - Recalculate group-buy totals.
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
- Add order summary calculation.
- Add payment status update.
- Add close/reopen group-buy behavior.
- Add text export for final shop order.

## Later Enhancements

- User accounts and permissions.
- LINE Bot notifications.
- Payment integration.
- CSV/Excel export.
- Menu import from image or spreadsheet.
- Order edit/cancel flow.
- Audit log for admin changes.
- Mobile-first UI polish.
- Deployment setup.
