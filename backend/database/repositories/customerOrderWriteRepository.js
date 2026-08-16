"use strict";

const { randomUUID } = require("node:crypto");
const { createRuntimeDatabaseAdapter } = require("..");
const {
  calculateDiscountPerCup,
  findOrderDiscountConflicts,
} = require("../../pricing/groupBuyDiscount");

const defaultCustomizationRules = {
  sweetness: { minSelections: 1, maxSelections: 1 },
  ice: { minSelections: 1, maxSelections: 1 },
  size: { minSelections: 1, maxSelections: 1 },
  topping: { minSelections: 0, maxSelections: 1 },
};

function resolveCustomerOrderWriteRuntime(input = {}) {
  const env = input.env || process.env;
  const runtime = String(input.runtime || env.CUSTOMER_ORDER_WRITE_RUNTIME || "sqlite")
    .trim()
    .toLowerCase();
  if (runtime === "sqlite") return "sqlite";
  if (runtime === "postgres" || runtime === "postgresql") return "postgres";
  throw new Error(`Unsupported CUSTOMER_ORDER_WRITE_RUNTIME: ${runtime}`);
}

function createCustomerOrderWriteRepository(input = {}) {
  const runtime = resolveCustomerOrderWriteRuntime(input);
  if (runtime === "sqlite") {
    if (typeof input.sqliteWriter !== "function") {
      throw new Error(
        "sqliteWriter is required when CUSTOMER_ORDER_WRITE_RUNTIME=sqlite"
      );
    }
    return {
      kind: "sqlite",
      createOrder: async (orderInput) => input.sqliteWriter(orderInput),
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
    createOrder: (orderInput) => createPostgresCustomerOrder(database, orderInput),
    close: async () => {
      if (ownsDatabase) await database.close();
    },
  };
}

async function createPostgresCustomerOrder(database, input) {
  const now = input.now || new Date().toISOString();
  const orderId = `order-${randomUUID()}`;

  return database.transaction(async (transaction) => {
    const activityResult = await transaction.query(`
      SELECT id, store_id, status, deadline_at, maximum_cups
      FROM group_buy_activities
      WHERE id = $1
      FOR UPDATE
    `, [input.activityId]);
    const activity = activityResult.rows[0];
    if (!activity) return { error: "activity_not_found" };
    if (!["recruiting", "confirmed"].includes(activity.status)) {
      return { error: "activity_not_joinable", status: activity.status };
    }
    if (Date.parse(now) >= Date.parse(toIsoString(activity.deadline_at))) {
      return {
        error: "activity_not_joinable",
        status: activity.status,
        reason: "deadline_passed",
      };
    }

    const customerResult = await transaction.query(`
      SELECT user_account.id
      FROM users user_account
      JOIN user_roles user_role
        ON user_role.user_id = user_account.id
       AND user_role.role = 'customer'
       AND user_role.status = 'active'
      WHERE user_account.id = $1
        AND user_account.status = 'active'
      FOR SHARE OF user_account, user_role
    `, [input.customerUserId]);
    if (!customerResult.rows[0]) return { error: "customer_not_found" };

    const existingOrderResult = await transaction.query(`
      SELECT id
      FROM orders
      WHERE activity_id = $1
        AND customer_user_id = $2
        AND status != 'cancelled'
      ORDER BY submitted_at DESC
      LIMIT 1
    `, [input.activityId, input.customerUserId]);
    if (existingOrderResult.rows[0]) {
      return {
        error: "order_already_exists",
        orderId: existingOrderResult.rows[0].id,
      };
    }

    const pricedItems = await pricePostgresOrderItems(
      transaction,
      activity.store_id,
      input.items
    );
    if (pricedItems.error) return pricedItems;
    const items = pricedItems.items;
    const totalCups = items.reduce((sum, item) => sum + item.quantity, 0);
    const originalAmount = items.reduce((sum, item) => sum + item.subtotal, 0);
    if (pricedItems.priceChanged) {
      return {
        error: "order_price_changed",
        originalAmount,
        items: toAuthoritativeOrderItems(items),
      };
    }

    const discountValidation = await validatePostgresOrderDiscount(
      transaction,
      activity.id,
      items
    );
    if (!discountValidation.valid) return discountValidation;

    const capacityResult = await transaction.query(`
      SELECT COALESCE(SUM(total_cups), 0)::integer AS authorized_cups
      FROM orders
      WHERE activity_id = $1
        AND payment_status IN ('authorized', 'captured')
        AND status != 'cancelled'
    `, [activity.id]);
    const authorizedCups = Number(capacityResult.rows[0]?.authorized_cups ?? 0);
    if (
      activity.maximum_cups
      && authorizedCups + totalCups > Number(activity.maximum_cups)
    ) {
      return {
        error: "capacity_exceeded",
        maximumCups: Number(activity.maximum_cups),
        authorizedCups,
        requestedCups: totalCups,
      };
    }

    const fallbackPurchasePreference = input.fallbackPurchasePreference
      || "decline_original_price";
    await transaction.query(`
      INSERT INTO orders (
        id,
        activity_id,
        customer_user_id,
        status,
        fallback_purchase_preference,
        total_cups,
        original_amount,
        payment_status,
        authorization_status,
        merchant_acceptance_status,
        pickup_status,
        submitted_at,
        updated_at
      ) VALUES (
        $1, $2, $3, 'submitted', $4, $5, $6,
        'pending', 'pending', 'pending', 'not_ready', $7, $7
      )
    `, [
      orderId,
      activity.id,
      input.customerUserId,
      fallbackPurchasePreference,
      totalCups,
      originalAmount,
      now,
    ]);

    const responseItems = [];
    for (const item of items) {
      const orderItemId = `order-item-${randomUUID()}`;
      await transaction.query(`
        INSERT INTO order_items (
          id,
          order_id,
          menu_item_id,
          item_name_snapshot,
          quantity,
          unit_price_snapshot,
          subtotal
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        orderItemId,
        orderId,
        item.menuItemId,
        item.itemName,
        item.quantity,
        item.unitPrice,
        item.subtotal,
      ]);

      const responseCustomizations = [];
      for (const [index, customization] of item.customizations.entries()) {
        const customizationId = `order-item-customization-${randomUUID()}`;
        await transaction.query(`
          INSERT INTO order_item_customizations (
            id,
            order_item_id,
            customization_option_id,
            option_type,
            label_snapshot,
            price_delta_snapshot,
            sort_order
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          customizationId,
          orderItemId,
          customization.optionId,
          customization.optionType,
          customization.label,
          customization.priceDelta,
          index,
        ]);
        responseCustomizations.push({
          id: customizationId,
          customizationOptionId: customization.optionId,
          optionType: customization.optionType,
          label: customization.label,
          priceDelta: customization.priceDelta,
        });
      }

      responseItems.push({
        id: orderItemId,
        menuItemId: item.menuItemId,
        itemName: item.itemName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
        customizations: responseCustomizations,
      });
    }

    await transaction.query(`
      INSERT INTO status_history (
        id,
        resource_type,
        resource_id,
        from_status,
        to_status,
        reason,
        actor_user_id,
        created_at
      ) VALUES ($1, 'order', $2, NULL, 'submitted', 'customer_submit_cart', $3, $4)
    `, [
      `status-history-${randomUUID()}`,
      orderId,
      input.customerUserId,
      now,
    ]);
    await transaction.query(`
      INSERT INTO audit_logs (
        id,
        actor_user_id,
        action_type,
        resource_type,
        resource_id,
        metadata_json,
        created_at
      ) VALUES (
        $1, $2, 'customer_create_order', 'order', $3, $4::jsonb, $5
      )
    `, [
      `audit-log-${randomUUID()}`,
      input.customerUserId,
      orderId,
      JSON.stringify({
        activityId: activity.id,
        totalCups,
        originalAmount,
      }),
      now,
    ]);

    return {
      order: {
        id: orderId,
        activityId: activity.id,
        customerUserId: input.customerUserId,
        status: "submitted",
        fallbackPurchasePreference,
        totalCups,
        originalAmount,
        finalAmount: null,
        paymentStatus: "pending",
        authorizationStatus: "pending",
        merchantAcceptanceStatus: "pending",
        pickupStatus: "not_ready",
        submittedAt: now,
        updatedAt: now,
        items: responseItems,
      },
    };
  });
}

async function pricePostgresOrderItems(database, storeId, inputItems) {
  if (!Array.isArray(inputItems) || inputItems.length === 0) {
    return {
      error: "order_items_invalid",
      issues: [{ code: "items_required", field: "items" }],
    };
  }

  const issues = [];
  const normalizedInputs = inputItems.map((inputItem, itemIndex) => {
    const quantity = Number(inputItem.quantity);
    const menuItemId = String(inputItem.menuItemId ?? inputItem.drinkId ?? "").trim();
    if (!menuItemId) {
      issues.push({ code: "menu_item_required", itemIndex });
    } else if (!Number.isInteger(quantity) || quantity <= 0) {
      issues.push({ code: "quantity_invalid", itemIndex, menuItemId });
    }
    return { inputItem, itemIndex, menuItemId, quantity };
  });
  if (issues.length > 0) return { error: "order_items_invalid", issues };

  const menuItemIds = [...new Set(normalizedInputs.map((item) => item.menuItemId))];
  const menuResult = await database.query(`
    SELECT id, store_id, name, base_price, is_available
    FROM menu_items
    WHERE id = ANY($1::text[])
    ORDER BY id
    FOR SHARE
  `, [menuItemIds]);
  const optionsResult = await database.query(`
    SELECT id, menu_item_id, option_type, label, price_delta, sort_order
    FROM customization_options
    WHERE menu_item_id = ANY($1::text[])
      AND is_available = true
    ORDER BY menu_item_id, option_type, sort_order, id
    FOR SHARE
  `, [menuItemIds]);
  const rulesResult = await database.query(`
    SELECT menu_item_id, option_type, min_selections, max_selections
    FROM menu_item_customization_rules
    WHERE menu_item_id = ANY($1::text[])
    ORDER BY menu_item_id, option_type
    FOR SHARE
  `, [menuItemIds]);

  let priceChanged = false;
  const authoritativeItems = [];
  for (const normalized of normalizedInputs) {
    const { inputItem, itemIndex, menuItemId, quantity } = normalized;
    const menuItem = menuResult.rows.find((item) => item.id === menuItemId);
    if (!menuItem) {
      issues.push({ code: "menu_item_not_found", itemIndex, menuItemId });
      continue;
    }
    if (menuItem.store_id !== storeId) {
      issues.push({ code: "menu_item_store_mismatch", itemIndex, menuItemId });
      continue;
    }
    if (menuItem.is_available !== true) {
      issues.push({ code: "menu_item_unavailable", itemIndex, menuItemId });
      continue;
    }

    const options = optionsResult.rows.filter((option) => option.menu_item_id === menuItemId);
    const rules = rulesResult.rows.filter((rule) => rule.menu_item_id === menuItemId);
    const requestedOptionIds = normalizeRequestedCustomizationIds(
      inputItem,
      options,
      itemIndex,
      issues
    );
    const selectedOptions = [];
    for (const optionId of requestedOptionIds) {
      const option = options.find((candidate) => candidate.id === optionId);
      if (!option) {
        issues.push({
          code: "customization_option_invalid",
          itemIndex,
          menuItemId,
          optionId,
        });
        continue;
      }
      if (!selectedOptions.some((candidate) => candidate.id === option.id)) {
        selectedOptions.push(option);
      }
    }

    const groupTypes = new Set([
      ...options.map((option) => option.option_type),
      ...rules.map((rule) => rule.option_type),
    ]);
    for (const optionType of groupTypes) {
      const configuredRule = rules.find((rule) => rule.option_type === optionType);
      const fallback = defaultCustomizationRules[optionType]
        || { minSelections: 0, maxSelections: 1 };
      const minSelections = configuredRule?.min_selections ?? fallback.minSelections;
      const maxSelections = configuredRule?.max_selections ?? fallback.maxSelections;
      const selectedCount = selectedOptions
        .filter((option) => option.option_type === optionType)
        .length;
      if (selectedCount < minSelections || selectedCount > maxSelections) {
        issues.push({
          code: "customization_selection_count_invalid",
          itemIndex,
          menuItemId,
          optionType,
          minSelections,
          maxSelections,
          selectedCount,
        });
      }
    }

    const unitPrice = Number(menuItem.base_price)
      + selectedOptions.reduce((sum, option) => sum + Number(option.price_delta), 0);
    const subtotal = unitPrice * quantity;
    const submittedUnitPrice = inputItem.unitPrice ?? inputItem.price;
    if (submittedUnitPrice != null && Number(submittedUnitPrice) !== unitPrice) {
      priceChanged = true;
    }
    if (inputItem.subtotal != null && Number(inputItem.subtotal) !== subtotal) {
      priceChanged = true;
    }
    authoritativeItems.push({
      menuItemId,
      itemName: menuItem.name,
      quantity,
      unitPrice,
      subtotal,
      customizations: selectedOptions.map((option) => ({
        optionId: option.id,
        optionType: option.option_type,
        label: option.label,
        priceDelta: option.price_delta,
      })),
    });
  }

  if (issues.length > 0) return { error: "order_items_invalid", issues };
  return { items: authoritativeItems, priceChanged };
}

function normalizeRequestedCustomizationIds(item, options, itemIndex, issues) {
  if (Array.isArray(item.customizationOptionIds)) {
    return [...new Set(
      item.customizationOptionIds.map((value) => String(value).trim()).filter(Boolean)
    )];
  }

  const requestedLabels = [];
  for (const optionType of ["size", "sweetness", "ice"]) {
    const label = String(item[optionType] ?? "").trim();
    if (label) requestedLabels.push({ optionType, label });
  }
  for (const topping of Array.isArray(item.toppings) ? item.toppings : []) {
    const label = String(topping).trim();
    if (label && label !== "不加料") {
      requestedLabels.push({ optionType: "topping", label });
    }
  }

  const ids = [];
  for (const requested of requestedLabels) {
    const option = options.find((candidate) => (
      candidate.option_type === requested.optionType
      && candidate.label === requested.label
    ));
    if (!option) {
      issues.push({
        code: "customization_option_invalid",
        itemIndex,
        optionType: requested.optionType,
        label: requested.label,
      });
    } else {
      ids.push(option.id);
    }
  }
  return [...new Set(ids)];
}

async function validatePostgresOrderDiscount(database, activityId, items) {
  const tiersResult = await database.query(`
    SELECT id, target_cups, discount_amount, sort_order
    FROM promotion_tiers
    WHERE activity_id = $1
    ORDER BY target_cups ASC, sort_order ASC
    FOR SHARE
  `, [activityId]);
  const maximumDiscountPerCup = tiersResult.rows.reduce(
    (maximum, tier) => Math.max(
      maximum,
      calculateDiscountPerCup(tier.discount_amount, tier.target_cups)
    ),
    0
  );
  const conflicts = findOrderDiscountConflicts(items, maximumDiscountPerCup);
  if (conflicts.length === 0) {
    return { valid: true, maximumDiscountPerCup };
  }
  return {
    valid: false,
    error: "order_discount_conflict",
    reason: "order_unit_price_below_maximum_discount_per_cup",
    activityId,
    maximumDiscountPerCup,
    issues: conflicts,
  };
}

function toAuthoritativeOrderItems(items) {
  return items.map((item) => ({
    menuItemId: item.menuItemId,
    itemName: item.itemName,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    subtotal: item.subtotal,
    customizationOptionIds: item.customizations.map((customization) => customization.optionId),
    customizations: item.customizations,
  }));
}

function toIsoString(value) {
  return value instanceof Date ? value.toISOString() : value;
}

module.exports = {
  createCustomerOrderWriteRepository,
  createPostgresCustomerOrder,
  pricePostgresOrderItems,
  resolveCustomerOrderWriteRuntime,
  validatePostgresOrderDiscount,
};
