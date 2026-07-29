const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const databasePath = path.join(__dirname, "drink-group-buy-dev.sqlite");
const backupDirectory = path.join(__dirname, "backups");
const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const backupPath = path.join(backupDirectory, `drink-group-buy-dev-before-menu-rules-${timestamp}.sqlite`);

const optionTemplates = [
  ["sweet-regular", "sweetness", "正常糖", 0, 0],
  ["sweet-half", "sweetness", "半糖", 0, 1],
  ["sweet-light", "sweetness", "微糖", 0, 2],
  ["sweet-none", "sweetness", "無糖", 0, 3],
  ["ice-regular", "ice", "正常冰", 0, 0],
  ["ice-less", "ice", "少冰", 0, 1],
  ["ice-light", "ice", "微冰", 0, 2],
  ["ice-none", "ice", "去冰", 0, 3],
  ["size-medium", "size", "中杯", 0, 0],
  ["size-large", "size", "大杯", 10, 1],
  ["top-pearl", "topping", "珍珠", 10, 0],
  ["top-coconut", "topping", "椰果", 10, 1]
];
const ruleTemplates = [
  ["sweetness", 1, 1],
  ["ice", 1, 1],
  ["size", 1, 1],
  ["topping", 0, 2]
];

if (!fs.existsSync(databasePath)) {
  throw new Error(`Development database not found: ${databasePath}`);
}

fs.mkdirSync(backupDirectory, { recursive: true });
fs.copyFileSync(databasePath, backupPath);

const database = new DatabaseSync(databasePath);
database.exec("PRAGMA foreign_keys = ON;");
let transactionStarted = false;

try {
  database.exec(`
    CREATE TABLE IF NOT EXISTS menu_item_customization_rules (
      menu_item_id TEXT NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
      option_type TEXT NOT NULL CHECK (option_type IN ('sweetness', 'ice', 'topping', 'size')),
      min_selections INTEGER NOT NULL DEFAULT 0 CHECK (min_selections >= 0),
      max_selections INTEGER NOT NULL CHECK (max_selections >= min_selections),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (menu_item_id, option_type)
    );
  `);
  database.exec("BEGIN IMMEDIATE;");
  transactionStarted = true;
  const now = new Date().toISOString();
  const menuItems = database.prepare(`
    SELECT menu_item.id
    FROM menu_items menu_item
    WHERE NOT EXISTS (
      SELECT 1 FROM customization_options option WHERE option.menu_item_id = menu_item.id
    )
    ORDER BY menu_item.id
  `).all();
  const insertOption = database.prepare(`
    INSERT OR IGNORE INTO customization_options (
      id, menu_item_id, option_type, label, price_delta, sort_order, is_available
    ) VALUES (?, ?, ?, ?, ?, ?, 1)
  `);
  const insertRule = database.prepare(`
    INSERT OR IGNORE INTO menu_item_customization_rules (
      menu_item_id, option_type, min_selections, max_selections, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);
  const countAvailableOptions = database.prepare(`
    SELECT COUNT(*) AS count
    FROM customization_options
    WHERE menu_item_id = ?
      AND option_type = ?
      AND is_available = 1
  `);

  let insertedOptionCount = 0;
  let insertedRuleCount = 0;
  for (const menuItem of menuItems) {
    for (const [suffix, optionType, label, priceDelta, sortOrder] of optionTemplates) {
      insertedOptionCount += insertOption.run(
        `${menuItem.id}-opt-${suffix}`,
        menuItem.id,
        optionType,
        label,
        priceDelta,
        sortOrder
      ).changes;
    }
  }
  const allMenuItems = database.prepare("SELECT id FROM menu_items ORDER BY id").all();
  for (const menuItem of allMenuItems) {
    for (const [optionType, minSelections, maxSelections] of ruleTemplates) {
      const availableOptionCount = countAvailableOptions.get(menuItem.id, optionType).count;
      const effectiveMinSelections = Math.min(minSelections, availableOptionCount);
      const effectiveMaxSelections = Math.min(maxSelections, availableOptionCount);
      insertedRuleCount += insertRule.run(
        menuItem.id,
        optionType,
        effectiveMinSelections,
        effectiveMaxSelections,
        now,
        now
      ).changes;
    }
  }

  database.exec("COMMIT;");
  transactionStarted = false;
  const integrity = database.prepare("PRAGMA integrity_check").get().integrity_check;
  const foreignKeyErrors = database.prepare("PRAGMA foreign_key_check").all().length;
  console.log(JSON.stringify({
    backupPath,
    migratedMenuItemCount: menuItems.length,
    insertedOptionCount,
    insertedRuleCount,
    integrity,
    foreignKeyErrors
  }, null, 2));
} catch (error) {
  if (transactionStarted) database.exec("ROLLBACK;");
  throw error;
} finally {
  database.close();
}
