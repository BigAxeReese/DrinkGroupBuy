export function getStoreById(stores, storeId) {
  return stores.find((store) => store.id === storeId);
}

export function getDealById(deals, dealId) {
  return deals.find((deal) => deal.id === dealId) ?? deals[0];
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
