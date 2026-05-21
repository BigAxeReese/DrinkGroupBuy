# DrinkGroupBuy AI Notes

## Project Goal

DrinkGroupBuy is planned as a B2C drink group-buying preorder platform. Shops can publish preorder promotions, and consumers can discover nearby shops, start or join group buys, and unlock shop-provided discounts after the group buy reaches the promotion target.

## Current Discussion Summary

- Build the project with a small, stable architecture that can grow later.
- Start with an MVP before adding heavier features such as accounts, notifications, LINE Bot integration, or payments.
- Product direction changed from a pure self-organized drink order tool to a B2C preorder promotion platform:
  - Shops publish preorder promotions.
  - Consumers browse nearby shops and active promotions.
  - Consumers start or join group buys for a promotion.
  - The system tracks cups or amount toward the promotion target.
  - When the target is reached, the discount can be applied to the group-buy order.

## Suggested MVP Scope

- Create a group buy.
- Manage shops and menu items.
- Let participants submit orders.
- Show order list.
- Show item summary.
- Calculate total price.
- Mark payment status.
- Close and reopen a group buy.
- Export a text version of the final order.
- Show nearby shops on a map.
- Show shop preorder promotions.
- Calculate promotion progress, such as 50 cups for a 500 TWD discount.

## Main Roles

### Organizer

- Creates group buys.
- Selects shop and menu.
- Selects a shop promotion when starting a group buy.
- Sets title, deadline, payment instructions, and notes.
- Reviews all submitted orders.
- Closes the group buy.

### Participant

- Opens a shared group-buy link.
- Browses nearby shops and preorder promotions.
- Selects drink, sugar, ice, toppings, quantity, and notes.
- Submits an order.

### Shop

- Publishes preorder promotions.
- Defines promotion target, such as total cups or total amount.
- Defines reward, such as a fixed amount discount.
- Provides menu and shop information.

### Admin / Closer

- Reviews order summaries.
- Marks payment status.
- Exports the final order text.

## Proposed Architecture

Recommended first implementation:

- Frontend: HTML/CSS/JavaScript or React.
- Backend: Node.js + Express.
- Database: SQLite.
- API style: REST API.
- Deployment later: local first, then Render, Railway, VPS, or similar.

High-level flow:

```text
Browser
  -> Frontend UI
  -> Express REST API
  -> SQLite database
```

## Initial Data Model Draft

```text
users
- id
- name
- phone
- role

shops
- id
- name
- phone
- note

menu_items
- id
- shop_id
- name
- base_price
- is_available

promotions
- id
- shop_id
- title
- description
- target_type
- target_value
- reward_type
- reward_value
- currency
- starts_at
- ends_at
- status

group_buys
- id
- shop_id
- promotion_id
- title
- status
- deadline
- created_by
- created_at

Initial group-buy creation service:

- `src/services/groupBuyService.js`

Current create fields:

- `title`
- `shopId`
- `promotionId`
- `createdBy`
- `deadline`
- `note`

The service validates that the shop exists, the promotion belongs to that shop, the promotion is active, and the deadline is in the future.

orders
- id
- group_buy_id
- buyer_name
- buyer_phone
- total_price
- payment_status
- note
- created_at

order_items
- id
- order_id
- menu_item_id
- drink_name
- sugar
- ice
- toppings
- quantity
- unit_price
- subtotal
```

## Proposed Pages

```text
/
Current group-buy list

/group-buys/new
Create group buy

/group-buys/:id
Participant order page

/group-buys/:id/admin
Organizer/admin order management page

/shops
Shop list

/shops/:id/menu
Menu management
```

## Product Direction

The preferred first version is lightweight:

- No mandatory login for participants.
- Organizer/admin access can initially use a private management link.
- Keep the workflow fast for small office, class, or team group buys.
- Add authentication, richer permissions, LINE notifications, and payment features only after the core order flow is solid.

## Promotion Model

Promotions should be structured so the backend can calculate eligibility.

Example:

```json
{
  "id": "promo_001",
  "shopId": "shop_001",
  "title": "50 cups for 500 TWD off",
  "targetType": "cups",
  "targetValue": 50,
  "rewardType": "fixed_amount",
  "rewardValue": 500,
  "currency": "TWD",
  "status": "active"
}
```

Initial supported promotion rules:

- `targetType: cups`: total quantity must reach `targetValue`.
- `targetType: amount`: total order amount must reach `targetValue`.
- `rewardType: fixed_amount`: subtract `rewardValue` from the group-buy total.
- A shop can define multiple cup-based tiers as a promotion matrix. The current calculator picks the eligible promotion with the highest discount amount.

Example promotion matrix:

```text
15 cups -> 90 TWD off
30 cups -> 240 TWD off
50 cups -> 500 TWD off
```

The first reusable promotion calculator is implemented in:

- `src/services/promotionCalculator.js`

It currently supports:

- Checking whether a promotion is active.
- Calculating progress toward the target.
- Calculating remaining cups or amount.
- Applying fixed amount discounts.
- Returning original amount and final amount.
