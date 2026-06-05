# Prototype Test Database

This SQLite database is for local prototype testing only. It is not the final production schema, formal migration history, or final API contract.

It currently stores test examples for:

- users and roles
- seven prototype stores with addresses, phone numbers, business status, and coordinates
- store menu items and customization option snapshots
- group-buy deals and discount tiers
- orders and order items
- payment authorization / partial capture fields
- merchant acceptance status
- pickup credentials

## Create Or Reset

```powershell
node C:\vscode\DrinkGroupBuy\database\test\init-test-db.js
```

This deletes and recreates the local test database file:

```text
database/test/drink-group-buy-test.sqlite
```

The generated SQLite file is ignored by Git.

## Inspect Seed Data

```powershell
node C:\vscode\DrinkGroupBuy\database\test\inspect-test-db.js
```

## Export Map Data To Mobile

The mobile app does not connect directly to SQLite. After recreating the database, export the map-facing test data:

```powershell
node C:\vscode\DrinkGroupBuy\database\test\export-mobile-map-data.js
```

This generates `mobile/src/mock/databaseMapStores.js`. Marker rules are derived from SQLite:

- blue: the store has no `recruiting` deal
- yellow: the store has at least one `recruiting` deal

## Current Limitation

The mobile prototype does not connect directly to this database yet. Its map uses a generated export from SQLite. A future test-only API or local persistence adapter is still required for live updates, cross-device consistency, and merchant-created deals.
