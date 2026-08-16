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
docs/AI-current-progress.md
docs/AI-api-candidates.md
docs/AI-database-candidates.md
docs/AI-database-field-spec.md
docs/AI-status-candidates.md
docs/open-questions.md
docs/AI-mobile-screen-data-requirements.md
docs/AI-security-review-log.md
```

`docs/AI-security-review-log.md` records the results of every `/security-review` pass (manual or triggered by payment/auth-related work) — what was reviewed, what was found, what's still open. Log a new entry every time a security review runs, even when nothing was found (a clean result is still worth recording as evidence that scope was actually covered). Format and template are documented at the top of the file itself.

`docs/AI-database-field-spec.md` is the single authoritative source for exact column definitions (type, constraints, example values) for every table. When a database entity or field changes, update it directly instead of duplicating field-level detail into other docs — `docs/AI-database-candidates.md`, `docs/AI-database-design-v1.md`, and `docs/AI-data-dictionary.md` should link to it rather than re-list columns.

## Progress Tracking (`PROGRESS.md`)

This repo's root has a `PROGRESS.md` that a separate dashboard tool (ProgressMap) renders as a mind map — the single source of truth for progress, never cache a copy elsewhere. This applies to any agent working in this repo (Claude Code, Codex, or others), not just one specific tool.

Full format, granularity, and evidence rules: [docs/progress-tracking-rules.md](docs/progress-tracking-rules.md) — read it when starting or finishing a unit of work; update `PROGRESS.md` accordingly.

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

## Control Flow Rules

When writing, maintaining, or reviewing code in this repo, actively check for these three control-flow smells and refactor when found:

1. **Core logic buried in deep indentation** — main logic sits 2-3+ `if` levels deep, or an `if` wraps the whole function body.
   Fix: rewrite as **guard clauses**. Put invalid-state, permission, null, and format checks at the top of the function; `return`/`raise`/`throw` immediately on failure. The success path stays unindented at the bottom.
2. **Multiple conditionals stacked handling the same high-level intent** — several `if`/`else if` all computing the same kind of thing (e.g. discount rules, identity checks, shipping rules).
   Fix: **extract an intent function** with a clear verb name (e.g. `applyEligibleBenefits(...)`). The main flow calls it once instead of inlining every branch.
3. **Small changes require re-tracing branch logic** — nested `if/else` deep enough that it's hard to tell what paths exist or whether one is missing.
   Fix: **linearize control flow**. Flatten `else` chains into independent guarded conditions so the code reads top-to-bottom, not tree-branching to the right.

Two principles behind all three:

- **Extract intent**: the main flow states *what* happens, at a high level; *how* each step works lives in its own named function.
- **Guard clauses over nested happy-path**: reject everything that can't proceed first, at the top; the core success logic always ends up at the bottom of the function, unindented.

Example:

```python
# Bad — Signal 1 (core logic 3 levels deep) + Signal 2 (benefit checks mixed into main flow)
def process_order(order):
    if order.is_success():
        if order.has_permission():
            if order.user.is_member:
                order.apply_discount(0.1)
            if order.total > 1000:
                order.free_shipping()
            if order.data is not None:
                return parse_and_calculate(order.data)
            else:
                raise ValueError("Data is empty")
        else:
            raise PermissionError("No permission")
    else:
        raise RuntimeError("Server error")

# Good — guard clauses + extracted intent function
def process_order(order):
    if not order.is_success():
        raise RuntimeError("Server error")
    if not order.has_permission():
        raise PermissionError("No permission")
    if order.data is None:
        raise ValueError("Data is empty")

    apply_eligible_benefits(order)
    return parse_and_calculate(order.data)

def apply_eligible_benefits(order):
    """Extracted intent function: owns all discount/benefit rules."""
    if order.user.is_member:
        order.apply_discount(0.1)
    if order.total > 1000:
        order.free_shipping()
```
