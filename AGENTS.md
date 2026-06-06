# AGENTS.md

## Project Role

You are assisting with a hand-shaken drink group-buying system.

The project direction is now full-stack development for an Android-first mobile app.

Primary goals:

1. Build the Android-first mobile app prototype and evolve it toward a real app.
2. Build backend APIs when needed.
3. Build and maintain the development database schema.
4. Keep documentation updated as business rules become clear.
5. Preserve traceability between mobile screens, API behavior, database entities, and open business rules.

## Current Architecture Direction

Use this structure:

```text
project-root/
├── mobile/
├── backend/
├── database/
├── docs/
└── AGENTS.md
```

Notes:

- `mobile/` is the main Android-first React Native + Expo app.
- `database/` contains the development database schema and local SQLite setup.
- `backend/` may be created or modified for API development.
- `docs/` records product decisions, API candidates, database decisions, and open questions.
- Legacy `frontend/`, `server.js`, `src/`, and `data/` were deleted and should not be restored unless explicitly requested.

## Full-Stack Development Rules

Allowed:

- Mobile app changes.
- Backend API implementation.
- Database schema and migration drafts.
- Local development seed data.
- Real API calls between mobile and backend.
- Authentication implementation when requested.
- Google Maps SDK/API integration.
- Prototype or development payment flow implementation.
- Documentation updates.

Use judgment before adding production complexity. Prefer small vertical slices that connect one screen, one API, and the needed database tables.

## Safety Rules

Do not commit secrets.

Secrets must stay in local environment files, such as:

```text
.env
mobile/.env
backend/.env
```

Examples of secrets:

- Google Maps API keys
- payment provider credentials
- JWT/session secrets
- database passwords

Real payment integration must be handled carefully:

- Prefer sandbox/test mode first.
- Do not implement real-money capture unless the user explicitly confirms.
- Keep authorization, capture, void, refund, and webhook state transitions auditable.

Database changes should be traceable:

- Use `snake_case` table and column names.
- Prefer migration files or clearly versioned schema changes once migrations are introduced.
- Keep local seed data separate from production data.
- Do not silently drop user data.

## Documentation Rules

When implementing a meaningful feature, update relevant docs when the change affects:

1. User flows.
2. Required screens.
3. Required displayed data.
4. User actions.
5. API behavior.
6. Database entities or fields.
7. Status values.
8. Business rules.
9. Known limitations or open questions.

Important docs:

```text
docs/current-progress.md
docs/api-candidates.md
docs/database-candidates.md
docs/status-candidates.md
docs/open-questions.md
docs/mobile-screen-data-requirements.md
```

## Naming Rules

Use consistent naming:

Database-style names:

- `snake_case`
- Example: `group_order_id`, `payment_status`

Frontend variable names:

- `camelCase`
- Example: `groupOrderId`, `paymentStatus`

API JSON names:

- `camelCase`
- Example: `currentCups`, `targetCups`, `joinedByCurrentUser`

Do not introduce multiple names for the same concept.

Preferred product naming:

- Use `group_buy_activity` / `groupBuyActivity` for a merchant-created group-buy event when designing new backend/database code.
- Existing mobile prototype files may still use `deal` for UI simplicity; avoid expanding that inconsistency.

## Status Rules

Do not invent status values casually. When adding or changing status values, keep them documented.

Current candidate statuses:

Group-buy activity status:

- `draft`
- `recruiting`
- `confirmed`
- `failed`
- `ordering`
- `ready_for_pickup`
- `completed`
- `cancelled`

Payment status:

- `pending`
- `authorized`
- `captured`
- `authorization_voided`
- `failed`
- `refunded`

Order status:

- `draft`
- `submitted`
- `locked`
- `cancelled`
- `completed`

Pickup status:

- `not_ready`
- `ready`
- `picked_up`
- `cancelled`
- `expired`

## Modification Rules

Before modifying files, first output:

1. Planned files to create or modify.
2. Reason for each file.
3. What will not be touched.

After modifying files, output:

1. Actual files changed.
2. Summary of changes.
3. Any assumptions made.
4. Any open questions.
5. Suggested next step.

## Quality Rules

Do not overbuild.

Prefer:

- clear vertical slices
- explicit data contracts
- small APIs with clear ownership
- database changes that preserve history where needed
- readable mobile UI and traceable state flow

Be especially careful with:

- payment state
- order modification after authorization
- activity deadline settlement
- concurrency when many users join the same activity
- merchant permissions
- audit logs for sensitive operations

If a requirement is unclear, document the uncertainty instead of silently guessing.
