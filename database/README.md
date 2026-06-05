# DrinkGroupBuy Database

This folder contains the development database draft for the DrinkGroupBuy system.

## Current Stage

The schema is a local development draft. It is not a production migration history and is not yet connected to the mobile prototype or backend.

Current goals:

- define the first real database shape
- separate formal database design from `database/test/` prototype exports
- prepare for future backend API implementation
- preserve important workflow history such as order changes, payment transitions, and activity status changes

## Files

| File | Purpose |
| --- | --- |
| `schema.sql` | Development schema draft |
| `init-dev-db.js` | Recreates a local SQLite dev database from `schema.sql` |
| `drink-group-buy-dev.sqlite` | Generated local database file; should not be committed |
| `test/` | Prototype-only test database and map export scripts |

## Create Or Reset The Dev Database

```powershell
node database/init-dev-db.js
```

This creates:

```text
database/drink-group-buy-dev.sqlite
```

## Main Data Areas

- users and roles
- merchants and store ownership
- stores and map coordinates
- menus and customization options
- group-buy activities and discount tiers
- cart drafts before order submission
- orders and order item snapshots
- Line Pay-style authorization and partial capture records
- activity settlement results
- pickup credentials
- status history and audit logs

## Important Notes

- This is not backend code.
- This does not create real API routes.
- This does not connect mobile screens to the database yet.
- Payment provider fields are still candidates until the actual provider requirements are verified.
- Google Maps location data should eventually come from `stores`, but the current mobile map still uses prototype exports/local state.

## Next Steps

1. Add a small development seed file for stores, users, and menu data.
2. Decide whether backend will use SQLite first or move directly to PostgreSQL/MySQL.
3. Define API contracts for creating activities, cart drafts, orders, payment authorization, and settlement.
4. Only after the API contract is clear, connect the mobile app to backend endpoints.
