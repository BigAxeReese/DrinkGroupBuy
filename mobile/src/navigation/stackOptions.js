// Every screen renders its own header via <MobileScreen>/<Section>, so every native-stack here hides
// react-navigation's own header. Push/pop between screens in the same stack uses the platform's native
// transition (already off the JS thread) -- no custom interpolator needed for that; only the bottom-tab
// switch (CustomerTabs.jsx / MerchantTabs.jsx) has one, for the left/right slide between tabs.
export const stackScreenOptions = { headerShown: false };
