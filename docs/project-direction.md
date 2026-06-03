# Project Direction

## Current Direction

DrinkGroupBuy is now officially positioned as an Android-first mobile app prototype.

This project is not currently aiming to become a general Web frontend product. The existing Web prototype remains useful for screen, flow, and data analysis, but it is not the final product frontend.

## Target Prototype Technology

- Recommended mobile technology: React Native + Expo.
- Primary target platform for the first mobile prototype: Android.
- iOS support is not a first-phase goal, but React Native + Expo keeps a future iOS path open.
- The first mobile prototype should continue using mock data and should not connect to real backend, database, Google Maps, payment, notification, or login services.

## Intended Project Roles

| Path | Intended role |
| --- | --- |
| `mobile/` | Future primary development location for the Android-first mobile app prototype. This folder has not been created yet. |
| `frontend/` | Existing React / Vite Web reference prototype. It is retained for screen and flow reference only. |
| `docs/` | Source of product direction, screen requirements, candidate API/database analysis, status candidates, and open questions. |
| `backend/` | Reserved future backend area. There is no formal backend implementation yet. |
| `database/` | Reserved future database area. There is no formal database schema yet. |
| `server.js` | Legacy prototype server file. It contains legacy static route behavior and should not be treated as the final backend architecture. |

## Frontend Position

`frontend/` is a Web reference prototype. It is useful for:

- Validating user flows.
- Reviewing screen data requirements.
- Keeping mock data examples.
- Comparing future mobile screens against the earlier Web exploration.
- Preserving product analysis work until mobile screens fully replace it.

`frontend/` is not:

- The final product frontend.
- A mobile app implementation.
- A React Native codebase.
- A formal API client.
- A production deployment target.

## Backend Position

No formal backend has been implemented for the Android-first product direction.

Existing backend-like or server-like code should be interpreted carefully:

- `server.js` belongs to the earlier lightweight prototype era.
- `server.js` may still contain legacy route assumptions.
- `server.js` is not the source of truth for future backend module boundaries.
- No real API contract should be inferred directly from legacy server routes without review.

## Database Position

No formal database schema has been created for the Android-first product direction.

Existing JSON data and mock data should be interpreted as prototype inputs only:

- They are not migrations.
- They are not schema definitions.
- They are not formal database contracts.
- Future database design should be derived from mobile flows, business rules, status transitions, payment decisions, and audit requirements.

## Current Non-Goals

- Do not build backend implementation yet.
- Do not build database schema yet.
- Do not write SQL or migrations yet.
- Do not create real API endpoints yet.
- Do not connect real Google Maps API yet.
- Do not connect real payment services yet.
- Do not connect real push notifications yet.
- Do not optimize for iOS in the first phase.
- Do not permanently delete the Web reference prototype until the mobile prototype has replaced its analysis value.

## Direction Summary

The safest project direction is:

```text
Android-first mobile app prototype
  -> React Native + Expo
  -> mobile/ becomes the main future app location
  -> frontend/ remains Web reference prototype
  -> docs/ remains the planning and analysis source
  -> backend/database remain future design work
```
