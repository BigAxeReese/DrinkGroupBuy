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
- When the merchant leaves the group-buy name empty, store `飲料團購` as its default name.
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

- Frontend: lightweight HTML/CSS/JavaScript prototype first; React can be introduced later when UI complexity grows.
- Backend: Node.js HTTP server first; Express can be introduced later when routes grow.
- Database: JSON files for the prototype, SQLite/PostgreSQL later.
- API style: REST API.
- Deployment later: local first, then Render, Railway, VPS, or similar.
- Mobile strategy: build as a Web App first, then package with Capacitor for Android/iOS.

High-level flow:

```text
Browser
  -> Frontend UI
  -> Node REST API
  -> JSON data files
```

The project intentionally starts as a Web App so the UI and core flow can be tested in a browser. Later, Capacitor can wrap the same Web App into a mobile app. For map features, start with a Web map and consider a Capacitor native map plugin only if mobile performance or native gestures become a problem.

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
- `promotionMatrix`
- `createdBy`
- `deadline`
- `note`

The service validates that the shop exists, the custom promotion matrix is valid, and the deadline is in the future.

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

## Current Prototype UI

The first browser-testable UI is implemented in:

- `public/index.html`
- `public/app.js`
- `public/styles.css`
- `server.js`

Current UI features:

- Create a group buy.
- Select a shop.
- Define custom promotion tiers by entering cup count and discount amount.
- Preview average discount per cup for each tier.
- Add and remove promotion tiers.
- Show created group-buy detail.
- Show group-buy progress toward the next eligible tier.
- Show existing group-buy records.
- Switch between customer and merchant prototype views.
- Provide a dedicated customer join flow: select an open group buy, view the matching shop menu, then select a drink and customize the order.
- Let customers submit drink orders with sugar level, ice level, quantity, and notes.
- Show participant order entries and allow customers to leave an open group buy.
- Let merchants cancel an open group buy and record a cancellation reason.
- In customer mode, the group-buy list only shows activities that are currently open for joining; tapping an entry opens its details.
- The customer home-page join action lists only open group buys and loads menu items from the selected activity's shop record in `data/shops/shops.json`.
- Tapping a customer group-buy list entry first opens activity information; an open activity provides an explicit join button.
- After the customer chooses to join, the selected shop menu displays drinks and prices; choosing a drink opens a customization dialog.
- Show each customer-facing list entry with group-buy name, shop name, and cup progress against the nearest promotion tier not yet reached. After all tiers are reached, keep showing the highest tier.
- Main navigation is presented as function entries on the home screen instead of a persistent tab bar; feature screens provide a return-to-home action.
- In merchant mode, provide a simulated merchant-account selector backed by shop records in `data/shops/shops.json`.
- In customer mode, provide simulated accounts `test1`, `test2`, and `test3`; the selected account is recorded on joined orders without asking for a name in the drink customization dialog.
- The selected simulated merchant controls the shop used when creating a group buy and filters the merchant activity list.
- In merchant mode, the group-buy view is list-first as well; selecting an activity opens detail and cancellation controls.
- In merchant mode, list views are split into active activities and historical orders.
- When a group-buy deadline passes, an open activity is presented as `receiving` / 接單中; customers can no longer modify participation.
- A merchant can mark a receiving order as completed, recording `completedAt` and moving it into historical orders.
- For prototype testing, a merchant can use a simulate-deadline action on an open activity to set its deadline to the current time and immediately exercise the receiving/completion flow.

The merchant- and customer-account switchers are UI-level simulation only; they do not yet provide authentication or backend authorization.

Current group-buy participant model:

```text
participants
- id
- customerName
- menuItemId
- itemName
- unitPrice
- quantity
- subtotal
- sugar
- ice
- note
- joinedAt
```

On join or leave, the backend recalculates group-buy cup count, amount, and participant count. Expired group buys are displayed as closed for joining.
Cancelled group buys preserve `cancelReason` and `cancelledAt`; they cannot be joined, left, or cancelled again. Cancelled and completed activities are displayed under merchant historical orders.

Current visual direction:

- Mobile-width dark interface with green accent colors.
- Dense function-first screens for repeated customer and merchant tasks.
- Desktop browser preview presents the app inside a phone-frame mockup; narrow screens fall back to a full-screen mobile layout.

Current local URL:

```text
http://localhost:3000
```

## Development Conversation Record - 2026-05-26

Decisions and implementation progress recorded from the current development discussion:

- The product is a B2C drink preorder group-buy application: merchants publish limited-time activities and customers join orders to reach tiered discounts.
- The prototype remains a browser-testable Web App first, with Capacitor kept as the later mobile packaging direction.
- Data remains JSON-backed for this prototype; a Firebase/Firestore and Google Login architecture has been discussed as future direction, not yet implemented.
- Shops and menu seed data are centered around the National Taichung University of Science and Technology area, including a test shop with ten differently priced drinks.
- Merchant discount rules are entered as cup targets and fixed discount amounts; the UI calculates average per-cup discount.
- Merchant mode supports simulated shop accounts, group-buy creation, cancellation with reason, simulated deadline completion, receiving-order handling, and historical orders.
- A blank merchant-created group-buy title defaults to `飲料團購`.
- Customer mode supports simulated accounts `test1`, `test2`, and `test3`.
- The customer list displays only group buys that can currently be joined, with shop name as the primary label and group-buy name as secondary information.
- Customers open group-buy details first, tap the join action to view that shop's drink menu and prices, then select a drink to open a customization dialog.
- Customer order customization stores sugar, ice, quantity, and note; the selected simulated customer account supplies the order name.
- Participant totals, promotion progress, joining, leaving, cancellation, and order-completion states are supported by the current Node API.
- The interface uses a dark mobile-oriented layout and now includes a desktop phone-frame preview.

Suggested next feature discussion:

- Decide whether a customer should see only their own submitted entries in the detail page.
- Add an order review step before final submission or implement customer order editing.
- Begin nearby-shop/map browsing once the order workflow is stable.
