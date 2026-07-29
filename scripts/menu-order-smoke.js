const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "drink-group-buy-menu-smoke-"));
const databasePath = path.join(tempDirectory, "menu-smoke.sqlite");
process.env.DRINK_GROUP_BUY_DB_PATH = databasePath;

const {
  createOrder,
  getOrderDetail,
  listStoreMenu,
  saveMerchantMenuItem
} = require("../backend/db");

function assert(condition, message, details) {
  if (condition) return;
  const error = new Error(message);
  error.details = details;
  throw error;
}

function initializeDatabase() {
  const schema = fs.readFileSync(path.join(__dirname, "..", "database", "schema.sql"), "utf8");
  const seed = fs.readFileSync(path.join(__dirname, "..", "database", "seed-dev.sql"), "utf8");
  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec(schema);
  database.exec(seed);
  const now = new Date().toISOString();
  database.prepare(`
    INSERT INTO group_buy_activities (
      id, store_id, created_by_user_id, title, status, start_at, deadline_at,
      pickup_start_at, pickup_end_at, maximum_cups, withdrawal_lock_minutes,
      created_at, updated_at
    ) VALUES (?, 'store-001', 'user-merchant-001', 'Menu smoke', 'recruiting', ?, ?, ?, ?, 20, 30, ?, ?)
  `).run(
    "menu-order-smoke-activity",
    now,
    new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
    now,
    now
  );
  database.close();
}

function buildOrderItem(menuItem, quantity, toppingCount) {
  const selectedOptions = [];
  for (const group of menuItem.customizationGroups) {
    if (group.optionType === "topping") {
      selectedOptions.push(...group.options.slice(0, toppingCount));
    } else if (group.minSelections > 0) {
      selectedOptions.push(group.options[0]);
    }
  }
  const unitPrice = menuItem.basePrice
    + selectedOptions.reduce((sum, option) => sum + option.priceDelta, 0);
  return {
    menuItemId: menuItem.id,
    itemName: menuItem.name,
    quantity,
    unitPrice,
    subtotal: unitPrice * quantity,
    customizationOptionIds: selectedOptions.map((option) => option.id)
  };
}

try {
  initializeDatabase();
  const menu = listStoreMenu("store-001", { includeUnavailable: true });
  assert(menu.menuItems.length === 2, "store menu should contain two seeded items", menu);
  const item = menu.menuItems.find((menuItem) => menuItem.id === "drink-001");
  const toppingGroup = item.customizationGroups.find((group) => group.optionType === "topping");
  assert(toppingGroup.maxSelections === 2, "seeded topping limit should be two", toppingGroup);

  const correctItem = buildOrderItem(item, 2, 2);
  const stalePrice = createOrder({
    activityId: "menu-order-smoke-activity",
    customerUserId: "user-customer-yinji",
    items: [{ ...correctItem, unitPrice: item.basePrice, subtotal: item.basePrice * 2 }]
  });
  assert(stalePrice.error === "order_price_changed", "stale client price must be rejected", stalePrice);

  const created = createOrder({
    activityId: "menu-order-smoke-activity",
    customerUserId: "user-customer-yinji",
    items: [correctItem]
  });
  assert(created.order?.originalAmount === correctItem.subtotal, "backend amount should be authoritative", created);
  const storedOrder = getOrderDetail(created.order.id);
  assert(
    storedOrder.items[0].customizations.every((customization) => customization.customizationOptionId),
    "order customization snapshots must retain option IDs",
    storedOrder
  );

  const updatedGroups = item.customizationGroups.map((group) => ({
    ...group,
    maxSelections: group.optionType === "topping" ? 1 : group.maxSelections
  }));
  const updated = saveMerchantMenuItem({
    storeId: "store-001",
    menuItemId: item.id,
    actorUserId: "user-merchant-001",
    name: item.name,
    category: item.category,
    description: item.description,
    basePrice: item.basePrice,
    isAvailable: true,
    customizationGroups: updatedGroups
  });
  assert(
    updated.menuItem.customizationGroups.find((group) => group.optionType === "topping").maxSelections === 1,
    "merchant should be able to set an explicit topping limit",
    updated
  );

  const createdMenuItem = saveMerchantMenuItem({
    storeId: "store-001",
    actorUserId: "user-merchant-001",
    name: "Smoke 新品",
    category: "tea",
    description: "Merchant create smoke",
    basePrice: 45,
    isAvailable: true,
    customizationGroups: item.customizationGroups.map((group) => ({
      optionType: group.optionType,
      minSelections: group.optionType === "topping" ? 0 : group.minSelections,
      maxSelections: group.optionType === "topping" ? 0 : group.maxSelections,
      options: group.options.map(({ id, ...option }) => option)
    }))
  });
  assert(createdMenuItem.menuItem?.name === "Smoke 新品", "merchant should be able to create a menu item", createdMenuItem);
  assert(
    listStoreMenu("store-001").menuItems.length === 3,
    "new available menu item should appear in the public menu"
  );

  const tooManyToppings = createOrder({
    activityId: "menu-order-smoke-activity",
    customerUserId: "user-customer-bolun",
    items: [buildOrderItem(item, 1, 2)]
  });
  assert(
    tooManyToppings.error === "order_items_invalid"
      && tooManyToppings.issues.some((issue) => issue.code === "customization_selection_count_invalid"),
    "orders above the merchant topping limit must be rejected",
    tooManyToppings
  );

  const database = new DatabaseSync(databasePath, { readOnly: true });
  const integrity = database.prepare("PRAGMA integrity_check").get().integrity_check;
  const foreignKeyErrors = database.prepare("PRAGMA foreign_key_check").all().length;
  database.close();
  assert(integrity === "ok" && foreignKeyErrors === 0, "smoke database must remain valid", {
    integrity,
    foreignKeyErrors
  });

  console.log("Menu and order authority smoke passed");
  console.log("menu: seeded_options=96, seeded_rules=32, topping_limit_update=1, item_create=1");
  console.log("orders: stale_price_rejected=1, authoritative_amount=1, over_limit_rejected=1");
  console.log("database: integrity=ok, foreign_key_errors=0");
} catch (error) {
  console.error(error.message);
  if (error.details) console.error(JSON.stringify(error.details, null, 2));
  process.exitCode = 1;
} finally {
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}
