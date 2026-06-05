# AGENTS.md

## Project Role

You are assisting with a hand-shaken drink group-buying / matching system.

At this stage, you are only allowed to help with the frontend prototype and related documentation.

This is NOT the final production frontend.

The purpose of this prototype is to clarify:
1. User flows
2. Required screens
3. Required data displayed on each screen
4. User actions on each screen
5. Possible API requirements
6. Possible database entities and fields
7. Unclear business rules that must be resolved later

## Strict Development Boundary

Do NOT implement backend code.
Do NOT implement database migrations.
Do NOT create real API routes.
Do NOT create authentication logic.
Do NOT create payment integration.
Do NOT create real notification service.
Do NOT create production business logic.

Frontend prototype may use mock data only.

Exception:
- Google Maps may use the real Google Maps SDK/API for map rendering and prototype interaction.
- Store markers, locations, nearby search results, and business data must remain clearly marked prototype mock data until a formal backend/API contract exists.
- Google Maps API keys must be provided through local environment configuration and must not be committed to Git.

Mock data must be clearly marked as prototype mock data.
Mock data must NOT be treated as final API response format.
If you need data not yet defined, add it to docs/open-questions.md instead of silently assuming it.

## Folder Structure

Use this structure:

project-root/
├── frontend/
├── backend/
├── database/
├── docs/
└── AGENTS.md

At the current stage, you may only create or modify:

frontend/
docs/frontend-prototype.md
docs/screen-data-requirements.md
docs/api-candidates.md
docs/database-candidates.md
docs/open-questions.md

You must NOT modify:

backend/
database/

unless I explicitly allow it later.

## Frontend Prototype Rules

The frontend prototype should focus on user flow and screen clarity.

Allowed:
- Static pages
- Page navigation
- Mock data display
- Form layout
- Status display
- Empty states
- Error states
- Loading states
- Confirmation screens
- Basic local state for prototype interaction

Not allowed:
- Real API calls
- Real database connection
- Real login
- Real payment
- Real push notifications
- Production-level state management unless necessary

Allowed external prototype service:
- Google Maps SDK/API for map display and map interaction only

## Documentation Rules

For every screen you create, also document:

1. Screen purpose
2. User role
3. Required displayed data
4. User actions
5. Possible API endpoints needed later
6. Possible database entities and fields needed later
7. Status values shown on the screen
8. Edge cases
9. Open questions

## Naming Rules

Use consistent naming:

Database-style names:
- snake_case
- Example: group_order_id, payment_status

Frontend variable names:
- camelCase
- Example: groupOrderId, paymentStatus

API JSON candidate names:
- camelCase
- Example: currentCups, targetCups, joinedByCurrentUser

Do not introduce multiple names for the same concept.
If naming is uncertain, document it in docs/open-questions.md.

## Status Rules

Do not invent status values casually.

If a screen needs status, propose the status values in docs/frontend-prototype.md and docs/open-questions.md.

Possible preliminary statuses may include:

Group order status:
- recruiting
- confirmed
- failed
- ordering
- readyForPickup
- completed
- cancelled

Payment status:
- pending
- submitted
- verified
- rejected
- refunded

Order status:
- draft
- submitted
- locked
- cancelled
- completed

Pickup status:
- notAnnounced
- announced
- changed
- pickedUp

These are provisional and must be reviewed later.

## Modification Rules

Before modifying files, first output:

1. Planned files to create or modify
2. Reason for each file
3. What will NOT be touched

After modifying files, output:

1. Actual files changed
2. Summary of changes
3. Any assumptions made
4. Any open questions
5. Suggested next step

## Quality Rules

Do not overbuild.

This prototype is for system analysis, not final deployment.

Prefer clarity over visual complexity.
Prefer explicit data requirements over beautiful UI.
Prefer traceable screen logic over clever implementation.

If a requirement is unclear, document the uncertainty instead of guessing.
