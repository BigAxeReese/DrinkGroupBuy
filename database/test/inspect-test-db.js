const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const databasePath = path.join(__dirname, "drink-group-buy-test.sqlite");
const database = new DatabaseSync(databasePath, { readOnly: true });

try {
  const deals = database.prepare(`
    SELECT
      deals.id,
      stores.name AS store_name,
      deals.title,
      deals.status,
      deals.current_cups,
      deals.target_cups
    FROM deals
    JOIN stores ON stores.id = deals.store_id
    ORDER BY deals.created_at DESC
  `).all();

  const orders = database.prepare(`
    SELECT
      orders.id,
      orders.payment_status,
      orders.merchant_acceptance_status,
      orders.original_amount,
      COUNT(order_items.id) AS item_count,
      SUM(order_items.quantity) AS cup_count
    FROM orders
    LEFT JOIN order_items ON order_items.order_id = orders.id
    GROUP BY orders.id
  `).all();

  const stores = database.prepare(`
    SELECT
      stores.id,
      stores.name,
      stores.address,
      stores.latitude,
      stores.longitude,
      COUNT(DISTINCT menu_items.id) AS menu_item_count,
      EXISTS (
        SELECT 1 FROM deals
        WHERE deals.store_id = stores.id AND deals.status = 'recruiting'
      ) AS has_recruiting_deal,
      CASE
        WHEN EXISTS (
          SELECT 1 FROM deals
          WHERE deals.store_id = stores.id AND deals.status = 'recruiting'
        ) THEN 'yellow'
        ELSE 'blue'
      END AS map_marker_color
    FROM stores
    LEFT JOIN menu_items ON menu_items.store_id = stores.id
    GROUP BY stores.id
    ORDER BY stores.id
  `).all();

  console.log(JSON.stringify({ stores, deals, orders }, null, 2));
} finally {
  database.close();
}
