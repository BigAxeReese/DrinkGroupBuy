import { RoleSelectScreen } from "../screens/RoleSelectScreen";
import { MerchantApplyScreen } from "../screens/MerchantApplyScreen";
import { NearbyGroupBuyActivitiesScreen } from "../screens/NearbyGroupBuyActivitiesScreen";
import { LiveMapScreen } from "../screens/LiveMapScreen";
import { StoreMenuScreen } from "../screens/StoreMenuScreen";
import { StoreGroupBuyActivitiesScreen } from "../screens/StoreGroupBuyActivitiesScreen";
import { GroupBuyActivityDetailScreen } from "../screens/GroupBuyActivityDetailScreen";
import { DrinkSelectionScreen } from "../screens/DrinkSelectionScreen";
import { CartScreen } from "../screens/CartScreen";
import { GroupProgressScreen } from "../screens/GroupProgressScreen";
import { PaymentAuthorizationScreen } from "../screens/PaymentAuthorizationScreen";
import { PickupInfoScreen } from "../screens/PickupInfoScreen";
import { CustomerOrdersScreen } from "../screens/CustomerOrdersScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { MerchantDashboardScreen } from "../screens/MerchantDashboardScreen";
import { MerchantGroupBuyActivityCreateScreen } from "../screens/MerchantGroupBuyActivityCreateScreen";
import { MerchantMenuManagementScreen } from "../screens/MerchantMenuManagementScreen";
import { MerchantProductionListScreen } from "../screens/MerchantProductionListScreen";
import { MerchantRefundRequestsScreen } from "../screens/MerchantRefundRequestsScreen";
import { withAppState } from "./withAppState";

// One withAppState()-wrapped component per route, shared by every stack that needs it (several routes
// -- groupBuyActivityDetail, drinkSelection, cart, groupProgress, paymentAuthorization, pickupInfo --
// are pushed from more than one bottom-nav tab, so more than one stack below references the same entry
// here rather than each wiring its own copy).
export const screens = {
  roleSelect: RoleSelectScreen, // no appState/actions needed; wired directly (see RootNavigator)
  merchantApply: MerchantApplyScreen, // same
  nearby: withAppState(NearbyGroupBuyActivitiesScreen),
  liveMap: withAppState(LiveMapScreen),
  storeMenu: withAppState(StoreMenuScreen),
  storeGroupBuyActivities: withAppState(StoreGroupBuyActivitiesScreen),
  groupBuyActivityDetail: withAppState(GroupBuyActivityDetailScreen),
  drinkSelection: withAppState(DrinkSelectionScreen),
  cart: withAppState(CartScreen),
  groupProgress: withAppState(GroupProgressScreen),
  paymentAuthorization: withAppState(PaymentAuthorizationScreen),
  pickupInfo: withAppState(PickupInfoScreen),
  customerOrders: withAppState(CustomerOrdersScreen),
  profile: withAppState(ProfileScreen),
  merchantDashboard: withAppState(MerchantDashboardScreen),
  merchantCreate: withAppState(MerchantGroupBuyActivityCreateScreen),
  merchantMenu: withAppState(MerchantMenuManagementScreen),
  merchantProductionList: withAppState(MerchantProductionListScreen),
  merchantRefundRequests: withAppState(MerchantRefundRequestsScreen)
};
