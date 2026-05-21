# DrinkGroupBuy TODO

## Current Progress

- Project folder exists at `C:\vscode\DrinkGroupBuy`.
- Repository currently has only `.git`; no application scaffold has been created yet.
- Initial system architecture discussion is documented in `docs/ai_notes.md`.
- Initial project handoff notes are documented in `AGENTS.md`.

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

## Implementation TODO

- Create project scaffold.
- Add `package.json`.
- Set up Express server.
- Set up SQLite database.
- Create database schema/migrations.
- Add REST API routes:
  - Shops.
  - Menu items.
  - Group buys.
  - Orders.
  - Order items.
- Build initial frontend pages:
  - Group-buy list.
  - Create group buy.
  - Participant order form.
  - Admin order view.
  - Shop and menu management.
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

