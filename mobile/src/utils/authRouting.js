// Shared by RoleSelectScreen (fresh login) and AppNavigator (restoring a persisted session) --
// both need to turn a backend user record into the same {role, routeName, params} landing spot.
const backendCustomerToPrototypeCustomer = {
  "user-customer-yinji": "customer-yinji",
  "user-customer-bolun": "customer-bolun",
  "user-customer-lixuan": "customer-lixuan",
  "user-customer-jingwei": "customer-jingwei"
};

export function getRouteForUser(user) {
  if (user.roles.includes("merchant")) {
    return {
      role: "merchant",
      routeName: "merchantDashboard",
      params: {
        storeId: user.merchantStores?.[0]?.id ?? "store-001",
        authUserId: user.id
      }
    };
  }
  if (user.roles.includes("customer")) {
    return {
      role: "customer",
      routeName: "nearby",
      params: {
        userId: backendCustomerToPrototypeCustomer[user.id] ?? "customer-yinji",
        authUserId: user.id
      }
    };
  }
  if (user.roles.includes("admin")) {
    throw new Error("管理員身份不在手機 App 裡，請改用電腦瀏覽器開啟 /admin 網頁後台登入");
  }
  throw new Error("這個帳號沒有可進入 App 的有效身份");
}
