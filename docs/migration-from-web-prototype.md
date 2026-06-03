# Migration From Web Prototype

## Document Purpose

This document explains how to use the existing `frontend/` React / Vite Web prototype as a reference for a future Android-first mobile app prototype.

No migration has been executed by this document. It is a planning reference only.

## Current Source Prototype

`frontend/` is a Web reference prototype. It is not the final mobile app.

Useful parts of `frontend/`:

- Page flow.
- Screen data requirements.
- Mock data concepts.
- Status display concepts.
- Open questions.
- Candidate API and database analysis in docs.

Parts that should not be treated as final:

- Browser routing.
- Web layout.
- CSS implementation.
- Desktop-oriented navigation.
- Web-specific form behavior.
- Any assumption that a browser prototype equals an Android app.

## Web Files Useful as Mobile References

| Web source | How it can help mobile |
| --- | --- |
| `frontend/src/pages/NearbyDealsPage.jsx` | Reference for nearby deals screen content and list data. |
| `frontend/src/pages/DealDetailPage.jsx` | Reference for store/deal detail and discount tier presentation. |
| `frontend/src/pages/DrinkSelectionPage.jsx` | Reference for drink, sweetness, ice, topping, quantity, subtotal, and fallback preference. |
| `frontend/src/pages/GroupProgressPage.jsx` | Reference for progress, status, and my order summary. |
| `frontend/src/pages/PaymentReportPage.jsx` | Reference for payment information questions, but payment flow must be re-decided for mobile. |
| `frontend/src/pages/PickupInfoPage.jsx` | Reference for pickup information and update notice. |
| `frontend/src/pages/MerchantDealCreatePage.jsx` | Reference for merchant activity creation fields. |
| `frontend/src/pages/MerchantDealDashboardPage.jsx` | Reference for merchant activity list and summary data. |
| `frontend/src/components/ProgressCard.jsx` | Reference for progress calculation display, not UI implementation. |
| `frontend/src/components/StatusBadge.jsx` | Reference for status label mapping, not direct React Native UI. |
| `frontend/src/components/ScreenStateNotes.jsx` | Reference for loading, empty, and error state planning. |
| `frontend/src/types/prototypeTypes.js` | Reference for status label candidates. |

## Mock Data That Can Move to Mobile

The following mock data concepts can be copied or adapted into a future `mobile/src/mock/` folder. The mobile version should keep a clear comment such as `prototype only, not final API contract`.

| Web mock data | Mobile use |
| --- | --- |
| `frontend/src/mock/stores.js` | Store cards, store detail, merchant store selector, pickup location. |
| `frontend/src/mock/deals.js` | Nearby deals, deal detail, group progress, merchant dashboard. |
| `frontend/src/mock/drinks.js` | Drink selection, customization, subtotal calculation. |
| `frontend/src/mock/groupOrders.js` | Progress summary, cups until next tier, discount estimate. |
| `frontend/src/mock/orders.js` | My order summary, merchant order counts, payment and pickup status summaries. |
| `frontend/src/mock/paymentReports.js` | Temporary payment screen mock, pending payment-flow decision. |
| `frontend/src/mock/pickupInfo.js` | Pickup information screen and pickup status mock. |

## UI That Must Be Rewritten

React Web UI cannot be moved directly into React Native because React Native does not use DOM elements or CSS in the same way.

| Web UI item | Why it cannot be directly moved | Mobile replacement direction |
| --- | --- | --- |
| `div`, `section`, `p`, `button`, `input`, `select` based layouts | React Native uses native primitives, not DOM elements. | Rewrite with `View`, `Text`, `Pressable`, `TextInput`, and mobile pickers. |
| `frontend/src/styles.css` | React Native does not consume normal CSS files. | Rebuild with `StyleSheet`, theme constants, or mobile UI tokens. |
| `AppLayout.jsx` | Web header/nav layout does not match mobile navigation. | Replace with stack navigation, bottom tabs, or Expo Router layout. |
| Web route links | Browser URL links are not mobile navigation UX. | Replace with navigation actions or Expo Router links. |
| Desktop-friendly data density | Small Android screens need different grouping and progressive disclosure. | Use cards, sections, bottom sheets, and detail screens. |
| File input placeholder | Mobile image selection needs permission and device behavior planning. | Use mock button first; later evaluate Expo ImagePicker. |
| Map/list toggle button | Real mobile maps require permission and touch behavior. | Start with static map placeholder or location permission mock. |

## Docs That Can Be Reused

| Doc | Reuse value |
| --- | --- |
| `docs/frontend-prototype.md` | Original flow and screen planning reference. |
| `docs/frontend-prototype-review.md` | Web prototype review and risks that still affect mobile. |
| `docs/screen-data-requirements.md` | Data fields needed by screens. |
| `docs/api-candidates.md` | Candidate API surface, still not formal contract. |
| `docs/database-candidates.md` | Candidate entities and relationships, still not schema. |
| `docs/status-candidates.md` | Status values and transition risks to keep consistent. |
| `docs/open-questions.md` | Business-rule questions that remain unresolved. |
| `docs/project-direction.md` | Current Android-first direction source. |
| `docs/mobile-prototype-plan.md` | First-phase mobile screen plan. |

## Naming To Keep Consistent

The mobile prototype should avoid introducing new names for existing concepts unless a naming decision is intentionally made.

| Concept | Preferred mobile naming direction |
| --- | --- |
| Deal / activity / group buy | Pick one canonical term before formal API. Until then, mobile screens may show user-facing `團購活動` while code can use `deal` or `activity` consistently. |
| Store / merchant | Use `store` for physical shop data and `merchant` for account or role. |
| Order / order item | Use `order` for customer participation and `orderItem` for drink line items. |
| Payment / payment report | Use `payment` for overall payment state and `paymentReport` only for manual transfer report flow. |
| Pickup / pickup info | Use `pickup` for the process and `pickupInfo` for display data if needed. |
| Discount tier | Use one term for cup thresholds and discount amount. |

## Status To Keep Consistent

Mobile screens should use the same candidate status groups already identified in docs:

- Deal/activity status.
- Order status.
- Payment status.
- Payment report status if manual report remains.
- Pickup status.
- Store business status.

Mobile should not introduce new display-only status values without documenting:

- Meaning.
- Owner object.
- Allowed transitions.
- Invalid transitions.
- Whether history is needed.
- Which screen displays it.

## Do Not Inherit

The mobile prototype should not inherit these parts of the Web prototype:

- Web layout structure.
- Desktop-oriented dashboard density.
- Browser-only route assumptions.
- CSS class naming as architecture.
- Web input behavior as mobile behavior.
- `public/` legacy routes.
- `server.js` legacy static route assumptions.
- Any legacy assumption that local JSON-backed server behavior is the final backend.
- Any mock data shape as final API or database schema.

## Migration Safety Rules

- Do not delete `frontend/` while mobile is being created.
- Do not move Web files into mobile without reviewing whether they are logic, data, or UI.
- Copy or adapt mock data intentionally; do not share mutable prototype data between Web and mobile.
- Keep docs as the source of business-rule uncertainty.
- Create mobile screens from requirements, not by mechanically converting JSX.
- Keep payment, map, login, notification, and database behavior mocked in the first mobile phase.

## Suggested Migration Sequence

1. Keep `frontend/` as Web reference prototype.
2. Create `mobile/` only after the project owner confirms the scaffold step.
3. Copy or adapt mock data concepts into `mobile/src/mock/`.
4. Rebuild common mobile components from scratch.
5. Rebuild the eight first-phase screens as Android-first screens.
6. Verify the mobile app can run on Android.
7. Compare mobile screens against `docs/screen-data-requirements.md`.
8. Update open questions discovered by mobile UX.
9. Decide later whether `frontend/` should remain, move to `frontend_legacy/`, or be deleted.
