import { useAppState } from "../state/AppStateContext";

// Every screen kept its existing prop signature -- { navigation, route, appState, actions, currentRole,
// currentUserProfile, selectedCustomerId, selectedAuthUserId, selectedMerchantStoreId, memberAction } --
// unchanged from the old hand-rolled navigator. react-navigation only supplies `navigation`/`route`
// itself; this wraps a screen so the rest keeps arriving exactly the same way, so the screen files
// themselves needed no restructuring, only their navigation.go/replace/back(...) call sites updated to
// react-navigation's API. `memberAction` reproduces the old "member icon -> back to role select, keep
// session state as-is" shortcut (not the same as actions-less logout()).
export function withAppState(ScreenComponent) {
  function Wrapped(props) {
    const { appState, actions, currentRole, currentUserProfile, selectedCustomerId, selectedAuthUserId, selectedMerchantStoreId, goToRoleSelect } = useAppState();
    return (
      <ScreenComponent
        {...props}
        appState={appState}
        actions={actions}
        currentRole={currentRole}
        currentUserProfile={currentUserProfile}
        selectedCustomerId={selectedCustomerId}
        selectedAuthUserId={selectedAuthUserId}
        selectedMerchantStoreId={selectedMerchantStoreId}
        memberAction={goToRoleSelect}
      />
    );
  }
  Wrapped.displayName = `withAppState(${ScreenComponent.displayName || ScreenComponent.name || "Screen"})`;
  return Wrapped;
}
