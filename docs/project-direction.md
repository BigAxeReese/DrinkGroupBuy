# Project Direction

## Current Direction

DrinkGroupBuy is now a full-stack, Android-first mobile app project.

Primary target:

- Android-first mobile app
- React Native + Expo in `mobile/`
- Backend APIs may be created in `backend/`
- Development database lives in `database/`
- Documentation lives in `docs/`

The project is no longer limited to a frontend-only prototype.

## Current Project Roles

| Path | Current role |
| --- | --- |
| `mobile/` | Main Android-first React Native + Expo app |
| `database/` | Development SQLite schema, local DB scripts, and prototype test DB |
| `backend/` | Future backend API location; may be created when API work starts |
| `docs/` | Product, API, database, status, and handoff documentation |
| `AGENTS.md` | Current collaboration and development rules |

## Deleted Legacy Areas

These older prototype areas were deleted after user confirmation:

- `frontend/`
- `server.js`
- `src/`
- `data/`

Do not restore them unless the user explicitly requests it.

## Mobile Position

`mobile/` is the current app implementation.

It currently contains:

- role/login prototype
- customer home
- Google Maps live map
- deal detail
- drink selection
- cart
- customer orders
- payment authorization mock
- pickup info
- merchant dashboard
- merchant deal creation
- admin prototype screen

## Backend Position

Backend has not been implemented yet, but backend development is now allowed.

Future backend should provide APIs for:

- authentication/session
- merchant activity creation
- nearby activities and map store data
- menu loading
- cart or order draft
- order submission and modification
- payment authorization / capture / void
- pickup credential generation
- merchant dashboard summaries

## Database Position

Development database draft exists:

```text
database/schema.sql
database/init-dev-db.js
```

Generated local SQLite:

```text
database/drink-group-buy-dev.sqlite
```

This local database is ignored by Git.

The dev schema currently defines users, merchants, stores, menu, group-buy activities, promotion tiers, carts, orders, payments, pickups, status history, and audit logs.

## Current Persistence Reality

The mobile app still uses local prototype state:

```text
React state + localStorage
```

Merchant-created activities are not yet written to SQLite.

Formal future flow should be:

```text
mobile
→ backend API
→ database
→ API response back to mobile
```

## Near-Term Direction

Recommended next vertical slice:

```text
Merchant creates group-buy activity
→ backend API
→ database group_buy_activities + promotion_tiers
→ customer nearby/map reads from API
```

This is the cleanest first full-stack connection point.
