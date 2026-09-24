// Routes already restyled with the milk-tea design values (docs/ui-style-guide.md, "導入順序").
// The app shell provides MilkTeaContext for them (shared components switch to the new look) and
// paints the new page colour behind the screen; every other route keeps the old look until it is
// migrated. Delete this file when the last route is done.
export const MILK_TEA_ROUTES = new Set([
  "roleSelect",
  "nearby",
  "pickupInfo",
  "liveMap",
  "storeMenu",
  "storeGroupBuyActivities",
  "groupBuyActivityDetail",
  "drinkSelection",
  "cart",
  "groupProgress",
  "paymentAuthorization",
  "customerOrders",
  "profile"
]);

// Page tint of every route that has not migrated yet.
export const LEGACY_PAGE_COLOR = "#f6f8fb";
