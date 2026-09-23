// "返回首頁" on a screen that found no activity to show. These screens are pushed on top of a tab's own
// stack (Home, LiveMap or Orders), so the dead screen is popped first -- otherwise it would stay behind in
// that tab -- and then the Home tab is focused. Home's own stack is then already back at its list.
export function goToCustomerHome(navigation) {
  navigation.popToTop();
  navigation.navigate("CustomerTabs", { screen: "HomeTab" });
}
