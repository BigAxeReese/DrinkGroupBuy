# DrinkGroupBuy AI Notes

## Project Goal

DrinkGroupBuy is planned as a drink group-buying system. The first version should feel like an upgraded Google Form workflow: easy to create a group buy, easy for participants to submit drink orders, and easy for the organizer to summarize orders for the shop.

## Current Discussion Summary

- Build the project with a small, stable architecture that can grow later.
- Start with an MVP before adding heavier features such as accounts, notifications, LINE Bot integration, or payments.
- Prefer a simple web app flow:
  - Users open a group-buy link.
  - Participants submit drink orders.
  - Organizer reviews order details and summary.
  - Organizer closes the group buy and sends/export orders to the shop.

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

## Main Roles

### Organizer

- Creates group buys.
- Selects shop and menu.
- Sets title, deadline, payment instructions, and notes.
- Reviews all submitted orders.
- Closes the group buy.

### Participant

- Opens a shared group-buy link.
- Selects drink, sugar, ice, toppings, quantity, and notes.
- Submits an order.

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

group_buys
- id
- shop_id
- title
- status
- deadline
- created_by
- created_at

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

