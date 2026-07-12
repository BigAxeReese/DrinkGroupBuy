import { getMinutesUntilDeadline } from "./deadlineTime";

export function getStoreById(stores, storeId) {
  return stores.find((store) => store.id === storeId);
}

export function getGroupBuyActivityById(groupBuyActivities, groupBuyActivityId) {
  return groupBuyActivities.find((groupBuyActivity) => groupBuyActivity.id === groupBuyActivityId) ?? groupBuyActivities[0];
}

export function getDrinkById(drinks, drinkId) {
  return drinks.find((drink) => drink.id === drinkId) ?? drinks[0];
}

export function calculateDrinkSubtotal(drink, toppingId, quantity) {
  const topping = drink.toppings.find((item) => item.id === toppingId);
  return (drink.price + (topping?.price ?? 0)) * quantity;
}

export function formatCurrency(amount) {
  return `$${amount}`;
}

export function isWithdrawalLocked(groupBuyActivity) {
  const minutesUntilDeadline = getMinutesUntilDeadline(groupBuyActivity);
  return Boolean(groupBuyActivity)
    && groupBuyActivity.status === "recruiting"
    && minutesUntilDeadline != null
    && minutesUntilDeadline <= (groupBuyActivity.withdrawalLockMinutes ?? 30);
}
