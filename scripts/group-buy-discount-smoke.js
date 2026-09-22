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
  calculateGroupBuyDiscountSummary
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

  const example = calculateGroupBuyDiscountSummary([
    { id: "tier-example", targetCups: 3, discountAmount: 100 }
  ], 3);
  assert(
    example.estimatedDiscountPerCup === 33
      && example.estimatedAllocatedDiscountAmount === 99
      && example.estimatedUndistributedDiscountAmount === 1,
    "3 cups / NT$100 must allocate NT$33 per cup with NT$1 undistributed",
    example
  );

  const zeroDiscount = createGroupBuyActivity(activityInput([
    { targetCups: 3, discountAmount: 2 }
  ], "zero"));
  assert(
    zeroDiscount.error === "discount_tier_invalid"
      && zeroDiscount.reason === "discount_per_cup_below_minimum",
    "a reachable zero per-cup discount must be rejected",
    zeroDiscount
  );

  const excessiveDiscount = createGroupBuyActivity(activityInput([
    { targetCups: 3, discountAmount: 123 }
  ], "excessive"));
  assert(
    excessiveDiscount.error === "discount_tier_invalid"
      && excessiveDiscount.reason === "discount_per_cup_exceeds_minimum_unit_price",
    "a per-cup discount above the minimum sellable price must be rejected",
    excessiveDiscount
  );

  const activity = createGroupBuyActivity(activityInput([
    { targetCups: 3, discountAmount: 100 }
  ], "valid"));
  assert(activity.id, "valid discount activity should be created", activity);
  assert(
    activity.estimatedDiscountPerCup === 0
      && activity.nextTierTargetCups === 3
      && activity.cupsToNextTier === 3,
    "activity read model should expose live pre-tier discount progress",
    activity
  );

  const menu = listStoreMenu("store-001", { includeUnavailable: true });
  const lowestItem = menu.menuItems.find((item) => item.id === "drink-002");
  const rejectedMenuUpdate = saveMerchantMenuItem({
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
    rejectedMenuUpdate.error === "menu_discount_conflict",
    "menu price changes that break an active discount must be rolled back",
    rejectedMenuUpdate
  );
  assert(
    listStoreMenu("store-001", { includeUnavailable: true })
      .menuItems.find((item) => item.id === "drink-002").basePrice === 40,
    "rejected menu price must not persist"
  );

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
    progressedActivity.estimatedDiscountPerCup === 33
      && progressedActivity.estimatedAllocatedDiscountAmount === 99
      && progressedActivity.estimatedUndistributedDiscountAmount === 1,
    "live activity progress must recalculate the current per-cup discount",
    progressedActivity
  );

  const settlement = createGroupBuySettlementPlan(activity.id, {
    force: true,
    actorUserId: "user-admin-001"
  });
  assert(
    settlement.discountPerCup === 33
      && settlement.allocatedDiscountAmount === 99
      && settlement.undistributedDiscountAmount === 1
      && settlement.discountFunder === "merchant",
    "settlement plan must preserve the floor allocation and merchant remainder",
    settlement
  );
  assert(
    settlement.orders.every((order) => order.discountAmount === 33 && order.finalAmount === 7),
    "each one-cup NT$40 order must settle at NT$7",
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
  console.log("discount: per_cup=33, allocated=99, undistributed=1, funder=merchant");
  console.log("guards: zero_per_cup=blocked, excessive_discount=blocked, menu_conflict=rolled_back");
  console.log("database: integrity=ok, foreign_key_errors=0");
} catch (error) {
  console.error(error.message);
  if (error.details) console.error(JSON.stringify(error.details, null, 2));
  process.exitCode = 1;
} finally {
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}
