const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "drink-group-buy-discount-smoke-"));
const databasePath = path.join(tempDirectory, "discount-smoke.sqlite");
process.env.DRINK_GROUP_BUY_DB_PATH = databasePath;

const {
  createGroupBuyActivity,
  createGroupBuySettlementPlan,
  createOrder,
  listGroupBuyActivities,
  listStoreMenu,
  saveMerchantMenuItem
} = require("../backend/db");
const {
  resolveAppliedDiscountTier
} = require("../backend/pricing/groupBuyDiscount");

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
  database.close();
}

function activityInput(tiers, suffix) {
  const baseTime = Date.now();
  return {
    storeId: "store-001",
    createdByUserId: "user-merchant-001",
    title: `Discount smoke ${suffix}`,
    startAt: new Date(baseTime - 60_000).toISOString(),
    deadlineAt: new Date(baseTime + 60 * 60_000).toISOString(),
    pickupStartAt: new Date(baseTime + 2 * 60 * 60_000).toISOString(),
    pickupEndAt: new Date(baseTime + 3 * 60 * 60_000).toISOString(),
    withdrawalLockMinutes: 30,
    tiers
  };
}

function buildMinimumPriceItem(menuItem) {
  const selectedOptions = menuItem.customizationGroups.flatMap((group) => group.options
    .filter((option) => option.isAvailable)
    .sort((left, right) => left.priceDelta - right.priceDelta)
    .slice(0, group.minSelections));
  const unitPrice = menuItem.basePrice
    + selectedOptions.reduce((sum, option) => sum + option.priceDelta, 0);
  return {
    menuItemId: menuItem.id,
    itemName: menuItem.name,
    quantity: 1,
    unitPrice,
    subtotal: unitPrice,
    customizationOptionIds: selectedOptions.map((option) => option.id)
  };
}

function authorizeOrder(order) {
  const now = new Date().toISOString();
  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON;");
  database.prepare(`
    UPDATE orders
    SET payment_status = 'authorized', authorization_status = 'authorized', updated_at = ?
    WHERE id = ?
  `).run(now, order.id);
  database.prepare(`
    INSERT INTO payment_authorizations (
      id, order_id, provider, status, original_amount, authorized_amount,
      provider_authorization_id, authorized_at, created_at, updated_at
    ) VALUES (?, ?, 'mock_line_pay', 'authorized', ?, ?, ?, ?, ?, ?)
  `).run(
    `discount-smoke-authorization-${order.id}`,
    order.id,
    order.originalAmount,
    order.originalAmount,
    `mock-${order.id}`,
    now,
    now,
    now
  );
  database.close();
}

try {
  initializeDatabase();

  // 40 元品項打 7 折（discountPercent=30，付 70%）：ceil(40*0.7) = 28，折扣 12。
  const example = resolveAppliedDiscountTier([
    { id: "tier-example", targetCups: 3, discountPercent: 30 }
  ], 3);
  assert(
    example.currentTierId === "tier-example"
      && example.currentTierDiscountPercent === 30
      && example.nextTierTargetCups === null,
    "3 cups reaching the only tier should resolve that tier with no next target",
    example
  );

  const invalidPercent = createGroupBuyActivity(activityInput([
    { targetCups: 3, discountPercent: 0 }
  ], "invalid-percent"));
  assert(
    invalidPercent.error === "discount_tier_invalid"
      && invalidPercent.reason === "tier_discount_percent_invalid",
    "a discountPercent outside 1-99 must be rejected",
    invalidPercent
  );

  const notIncreasing = createGroupBuyActivity(activityInput([
    { targetCups: 3, discountPercent: 30 },
    { targetCups: 6, discountPercent: 30 }
  ], "not-increasing"));
  assert(
    notIncreasing.error === "discount_tier_invalid"
      && notIncreasing.reason === "tier_discount_percent_not_increasing",
    "a higher cup tier that isn't a strictly better discount must be rejected",
    notIncreasing
  );

  const activity = createGroupBuyActivity(activityInput([
    { targetCups: 3, discountPercent: 30 }
  ], "valid"));
  assert(activity.id, "valid discount activity should be created", activity);
  assert(
    activity.currentTierDiscountPercent === 0
      && activity.nextTierTargetCups === 3
      && activity.cupsToNextTier === 3,
    "activity read model should expose live pre-tier discount progress",
    activity
  );

  const menu = listStoreMenu("store-001", { includeUnavailable: true });
  const lowestItem = menu.menuItems.find((item) => item.id === "drink-002");
  // Percentage discounts don't depend on menu prices at all (unlike the old flat-amount model),
  // so lowering a menu item's price while an activity is recruiting must NOT be blocked anymore.
  const menuUpdate = saveMerchantMenuItem({
    storeId: "store-001",
    menuItemId: lowestItem.id,
    actorUserId: "user-merchant-001",
    name: lowestItem.name,
    category: lowestItem.category,
    description: lowestItem.description,
    basePrice: 32,
    isAvailable: true,
    customizationGroups: lowestItem.customizationGroups
  });
  assert(
    !menuUpdate.error && menuUpdate.menuItem?.basePrice === 32,
    "menu price changes must no longer be blocked by an active percentage-discount activity",
    menuUpdate
  );
  // Restore the original price so the rest of this script's $40 math stays valid.
  const restored = saveMerchantMenuItem({
    storeId: "store-001",
    menuItemId: lowestItem.id,
    actorUserId: "user-merchant-001",
    name: lowestItem.name,
    category: lowestItem.category,
    description: lowestItem.description,
    basePrice: 40,
    isAvailable: true,
    customizationGroups: lowestItem.customizationGroups
  });
  assert(!restored.error && restored.menuItem?.basePrice === 40, "menu price restore should succeed", restored);

  const orderItem = buildMinimumPriceItem(lowestItem);
  const customers = [
    "user-customer-yinji",
    "user-customer-bolun",
    "user-customer-lixuan"
  ];
  for (const customerUserId of customers) {
    const created = createOrder({
      activityId: activity.id,
      customerUserId,
      items: [orderItem]
    });
    assert(created.order?.id, "discount-compatible order should be created", created);
    authorizeOrder(created.order);
  }

  const progressedActivity = listGroupBuyActivities().find((item) => item.id === activity.id);
  assert(
    progressedActivity.currentTierDiscountPercent === 30 && progressedActivity.currentTierTargetCups === 3,
    "live activity progress must reflect the now-qualified tier's discount percent",
    progressedActivity
  );

  const settlement = createGroupBuySettlementPlan(activity.id, {
    force: true,
    actorUserId: "user-admin-001"
  });
  assert(
    settlement.discountPercent === 30
      && settlement.totalDiscountAmount === 36
      && settlement.discountFunder === "merchant",
    "settlement plan must apply the tier's discount percent to every order (3 orders x 12 = 36)",
    settlement
  );
  assert(
    settlement.orders.every((order) => order.discountAmount === 12 && order.finalAmount === 28),
    "each one-cup NT$40 order at 7折 must settle at ceil(40*0.7)=NT$28",
    settlement.orders
  );

  const database = new DatabaseSync(databasePath, { readOnly: true });
  const integrity = database.prepare("PRAGMA integrity_check").get().integrity_check;
  const foreignKeyErrors = database.prepare("PRAGMA foreign_key_check").all().length;
  database.close();
  assert(integrity === "ok" && foreignKeyErrors === 0, "smoke database must remain valid", {
    integrity,
    foreignKeyErrors
  });

  console.log("Group-buy discount smoke passed");
  console.log("discount: percent=30, per_order=12, total=36, funder=merchant");
  console.log("guards: invalid_percent=blocked, not_increasing=blocked, menu_price_change=no_longer_blocked");
  console.log("database: integrity=ok, foreign_key_errors=0");
} catch (error) {
  console.error(error.message);
  if (error.details) console.error(JSON.stringify(error.details, null, 2));
  process.exitCode = 1;
} finally {
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}
