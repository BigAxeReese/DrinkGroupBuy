const { createRuntimeDatabaseAdapter } = require("..");

const defaultCustomizationRules = {
  sweetness: { minSelections: 1, maxSelections: 1 },
  ice: { minSelections: 1, maxSelections: 1 },
  size: { minSelections: 1, maxSelections: 1 },
  topping: { minSelections: 0, maxSelections: 1 },
};

function resolveStoreMenuReadRuntime(input = {}) {
  const env = input.env || process.env;
  const runtime = String(input.runtime || env.STORE_MENU_READ_RUNTIME || "sqlite")
    .trim()
    .toLowerCase();
  if (runtime === "sqlite") return "sqlite";
  if (runtime === "postgres" || runtime === "postgresql") return "postgres";
  throw new Error(`Unsupported STORE_MENU_READ_RUNTIME: ${runtime}`);
}

function createStoreMenuReadRepository(input = {}) {
  const runtime = resolveStoreMenuReadRuntime(input);
  if (runtime === "sqlite") {
    if (typeof input.sqliteReader !== "function") {
      throw new Error("sqliteReader is required when STORE_MENU_READ_RUNTIME=sqlite");
    }
    return {
      kind: "sqlite",
      getPublicStoreMenu: async (storeId) => input.sqliteReader(storeId),
      close: async () => {},
    };
  }

  const ownsDatabase = !input.database;
  const database = input.database || createRuntimeDatabaseAdapter({
    ...input,
    runtime: "postgres",
  });
  return {
    kind: "postgres",
    getPublicStoreMenu: (storeId) => getPostgresStoreMenu(database, storeId),
    close: async () => {
      if (ownsDatabase) await database.close();
    },
  };
}

async function getPostgresPublicStoreMenu(database, storeId) {
  return getPostgresStoreMenu(database, storeId);
}

async function getPostgresStoreMenu(database, storeId, input = {}) {
  const includeUnavailable = Boolean(input.includeUnavailable);
  const storeResult = await database.query(`
    SELECT id, merchant_id, name, address, phone, business_status
    FROM stores
    WHERE id = $1
  `, [storeId]);
  const store = storeResult.rows[0];
  if (!store) return null;

  const [menuItemsResult, optionsResult, rulesResult] = await Promise.all([
    database.query(`
      SELECT id, store_id, name, category, description, base_price, is_available
      FROM menu_items
      WHERE store_id = $1
        AND ($2::boolean = true OR is_available = true)
      ORDER BY category ASC, name ASC, id ASC
    `, [storeId, includeUnavailable]),
    database.query(`
      SELECT option.id, option.menu_item_id, option.option_type, option.label,
             option.price_delta, option.sort_order, option.is_available
      FROM customization_options option
      JOIN menu_items menu_item ON menu_item.id = option.menu_item_id
      WHERE menu_item.store_id = $1
        AND ($2::boolean = true OR option.is_available = true)
      ORDER BY option.menu_item_id, option.option_type, option.sort_order, option.id
    `, [storeId, includeUnavailable]),
    database.query(`
      SELECT rule.menu_item_id, rule.option_type, rule.min_selections, rule.max_selections
      FROM menu_item_customization_rules rule
      JOIN menu_items menu_item ON menu_item.id = rule.menu_item_id
      WHERE menu_item.store_id = $1
    `, [storeId]),
  ]);

  return {
    store: {
      id: store.id,
      merchantId: store.merchant_id,
      name: store.name,
      address: store.address,
      phone: store.phone,
      businessStatus: store.business_status,
    },
    menuItems: menuItemsResult.rows.map((menuItem) => mapMenuItem(
      menuItem,
      optionsResult.rows.filter((option) => option.menu_item_id === menuItem.id),
      rulesResult.rows.filter((rule) => rule.menu_item_id === menuItem.id),
      includeUnavailable
    )),
  };
}

function mapMenuItem(row, options, rules, includeUnavailable = false) {
  const optionTypeOrder = ["size", "sweetness", "ice", "topping"];
  const groupTypes = [...new Set([
    ...optionTypeOrder,
    ...rules.map((rule) => rule.option_type),
    ...options.map((option) => option.option_type),
  ])].filter((optionType) => (
    rules.some((rule) => rule.option_type === optionType)
    || options.some((option) => option.option_type === optionType)
  ));

  return {
    id: row.id,
    storeId: row.store_id,
    name: row.name,
    category: row.category,
    description: row.description,
    basePrice: row.base_price,
    isAvailable: toBoolean(row.is_available),
    customizationGroups: groupTypes.map((optionType) => {
      const configuredRule = rules.find((rule) => rule.option_type === optionType);
      const fallback = defaultCustomizationRules[optionType]
        || { minSelections: 0, maxSelections: 1 };
      return {
        optionType,
        minSelections: configuredRule?.min_selections ?? fallback.minSelections,
        maxSelections: configuredRule?.max_selections ?? fallback.maxSelections,
        options: options
          .filter((option) => option.option_type === optionType)
          .filter((option) => includeUnavailable || toBoolean(option.is_available))
          .map((option) => ({
            id: option.id,
            optionType,
            label: option.label,
            priceDelta: option.price_delta,
            isAvailable: toBoolean(option.is_available),
          })),
      };
    }),
  };
}

function toBoolean(value) {
  return value === true || value === 1;
}

module.exports = {
  createStoreMenuReadRepository,
  getPostgresPublicStoreMenu,
  getPostgresStoreMenu,
  mapMenuItem,
  resolveStoreMenuReadRuntime,
};
