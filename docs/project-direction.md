# Project Direction

Last updated: 2026-06-24

## Product Direction

DrinkGroupBuy is a full-stack, Android-first hand-shaken drink group-buying application.

- `mobile/`: React Native + Expo app; Web is used for development preview.
- `backend/`: Node.js HTTP API connected to the development SQLite database.
- `database/`: SQLite development schema, seed data, and a separate prototype test database.
- `docs/`: current contracts, terminology, status rules, requirements, and unresolved decisions.

The current system is an evolving prototype, not a production deployment.

## Current Integration Boundary

Already connected end to end:

- Merchant creates a group-buy activity: Mobile -> API -> SQLite.
- Administrator cancels an activity: Mobile -> API -> SQLite soft cancellation.
- Backend can list activities from SQLite.

Still local or mocked in mobile:

- Login and authorization.
- Cart, customer orders, order edits, and progress updates.
- LINE Pay authorization, capture, void, and webhook behavior.
- Merchant acceptance, preparation completion, and pickup credentials.
- Most store/menu reads and map marker synchronization.

## Architecture Principles

1. New backend and database work uses `groupBuyActivity` / `group_buy_activity` terminology.
2. Mobile legacy variables may temporarily use `deal`, but new interfaces must not expand that usage.
3. Mobile and API fields use `camelCase`; database tables and columns use `snake_case`.
4. Secrets stay in local environment files and are never committed.
5. Payment remains mock or sandbox until real-money behavior is explicitly approved.
6. Stateful operations require validation, idempotency where relevant, transactions, and history records.

## Legacy Note

The old Web frontend and root legacy server were deleted. Do not restore `frontend/`, root `server.js`, `src/`, or `data/` unless explicitly requested.
