// Order of the customer tabs in the bottom navigation (components/BottomNav.jsx). Moving from one of
// them to another slides the screens sideways towards the tab that was tapped.
export const SLIDE_TAB_ORDER = ["nearby", "liveMap", "customerOrders", "profile"];

// 1: the new screen comes in from the right (the tapped tab is further right), -1: from the left,
// 0: no slide (the route change is not between two different tabs).
export function getSlideDirection(fromName, toName) {
  const from = SLIDE_TAB_ORDER.indexOf(fromName);
  const to = SLIDE_TAB_ORDER.indexOf(toName);
  if (from < 0 || to < 0 || from === to) return 0;
  return to > from ? 1 : -1;
}
