# DrinkGroupBuy Development Notes

## Project Overview

DrinkGroupBuy is a B2C drink group-buying preorder platform. Shops can publish preorder discount opportunities, and consumers can create or join group buys to unlock tiered discounts such as 15 cups for 90 TWD off, 30 cups for 240 TWD off, and 50 cups for 500 TWD off.

## Current Status

This project has a lightweight browser-testable prototype.

Important notes are stored in:

- `docs/ai_notes.md`: product and architecture discussion.
- `docs/todo.md`: current progress and next tasks.

## Suggested Architecture

- Backend: Node.js HTTP server in `server.js` for the prototype; Express can be introduced later.
- Database: JSON files for the prototype; SQLite/PostgreSQL later.
- Frontend: plain HTML/CSS/JavaScript in `public/` for the prototype; React can be introduced later.
- API style: REST.
- Mobile direction: Web App first, then package with Capacitor for Android/iOS.

## Development Principles

- Keep the first version small and useful.
- Prefer simple, maintainable code over premature abstractions.
- Do not require participant login unless the product direction changes.
- Keep organizer workflows fast: create, share, review, close, export.
- Record important architecture decisions in `docs/ai_notes.md`.
- Track implementation work in `docs/todo.md`.

## Expected First Workflow

```text
Organizer creates group buy
  -> organizer defines custom discount tiers
  -> participant opens shared link
  -> participant submits drink order
  -> organizer reviews list and summary
  -> organizer marks payment status
  -> organizer closes group buy
  -> organizer exports final order text
```

Implemented prototype flows:

- Merchant/customer view switcher in the browser UI.
- Merchant creates a group buy with custom promotion tiers.
- A blank merchant group-buy name is stored as `飲料團購`.
- Customer opens the dedicated join screen, selects an open group buy, and sees menu items loaded from the associated shop record.
- Customer joins by selecting a drink and entering sugar, ice, quantity, and optional notes; these customization fields are stored on the participant entry.
- Customer tapping an activity in the browse list first sees its information; open activities provide a join button that opens the shop menu.
- The customer browse list contains only group buys whose API payload reports `isJoinable: true`.
- Drink selection opens a customization dialog for sugar, ice, quantity, and optional notes.
- Customer leaves an open group buy entry.
- Join/leave recalculates total cups, amount, participants, and promotion progress.
- Expired group buys cannot be joined or left.
- Merchant can cancel a still-open group buy with a recorded reason; cancelled group buys cannot accept further changes.
- Merchant mode includes a simulated merchant selector populated from `data/shops/shops.json`; it filters merchant activities and sets the shop for newly created group buys.
- Customer mode includes simulated `test1`, `test2`, and `test3` accounts; the selected account supplies `customerName` when submitting an order.
- Once a deadline is reached, an open group buy is surfaced as receiving orders; the merchant can complete it and it moves into the historical-order view.
- Prototype merchant detail includes a simulate-deadline button which sets an open activity deadline to now so the receiving/completion flow can be tested quickly.
- The browser preview uses a phone-frame shell on desktop and switches to full-screen mobile presentation at small viewports.

The merchant and customer selectors are prototype conveniences, not authentication or authorization.

## Local Execution

Run the current prototype with:

```powershell
node C:\vscode\DrinkGroupBuy\server.js
```

Then open:

```text
http://localhost:3000
```

Useful verification commands:

```powershell
node C:\vscode\DrinkGroupBuy\scripts\verifyPromotions.js
```

No package install is currently required.

## Notes For Future Codex Sessions

- Start by reading `AGENTS.md`, `docs/ai_notes.md`, and `docs/todo.md`.
- Check the current git state before editing files.
- Do not overwrite user changes.
- If the project has already been scaffolded, follow the existing stack and patterns.
- Preserve existing user data in `data/*.json` unless the user explicitly asks to reset test data.
- Read `docs/ai_notes.md` section `Development Conversation Record - 2026-05-26` for the current feature-decision history.
