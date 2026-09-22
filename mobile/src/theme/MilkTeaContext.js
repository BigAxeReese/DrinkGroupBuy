import { createContext, useContext } from "react";

// Whether the route being rendered has been migrated to the milk-tea style. AppNavigator provides
// it from MILK_TEA_ROUTES (one decision per route), so no screen passes a flag around by hand and
// a shared component cannot be left on the old look inside a migrated screen.
// Delete this file together with milkTeaRoutes.js when the last route has migrated.
const MilkTeaContext = createContext(false);

export const MilkTeaProvider = MilkTeaContext.Provider;

export function useMilkTea() {
  return useContext(MilkTeaContext);
}
