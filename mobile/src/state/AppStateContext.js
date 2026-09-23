import { createContext, useContext } from "react";

// The app's shared business state (group-buy activities, orders, payments, cart) and the actions that
// mutate it, plus the current role/session -- everything a screen used to receive as flat props from
// AppNavigator's old hand-rolled `screenProps`. Provided by AppStateProvider.jsx; screens read it with
// useAppState() instead of destructuring props.
export const AppStateContext = createContext(null);

export function useAppState() {
  const value = useContext(AppStateContext);
  if (!value) throw new Error("useAppState must be used inside AppStateProvider");
  return value;
}
