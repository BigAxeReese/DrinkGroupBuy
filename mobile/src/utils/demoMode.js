// A fully offline demo mode: skips every real backend call (menu, group-buy sync, login, order
// submission, payment) in favor of mobile/src/mock/demoContent.js's fake data, so the app can be
// clicked through on a machine/network with no reachable backend at all. Off by default; distinct
// from EXPO_PUBLIC_AUTH_MODE=dev, which still needs a real backend (AUTH_DEV_MODE=true) to list and
// log in dev accounts.
export function isDemoMode() {
  return process.env.EXPO_PUBLIC_DEMO_MODE === "true";
}
