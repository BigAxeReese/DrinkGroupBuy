const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
const googleMapsWebApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || googleMapsApiKey;
const backendBaseUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
const devConsoleBaseUrl = process.env.EXPO_PUBLIC_DEV_CONSOLE_URL;
const firebaseApiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
const firebaseAuthDomain = process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN;
const firebaseProjectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
const firebaseAppId = process.env.EXPO_PUBLIC_FIREBASE_APP_ID;
const googleAndroidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const appScheme = process.env.EXPO_PUBLIC_APP_SCHEME || "drinkgroupbuy";
const authMode = process.env.EXPO_PUBLIC_AUTH_MODE || "firebase";

module.exports = {
  name: "DrinkGroupBuy Prototype",
  slug: "drink-group-buy-mobile-prototype",
  version: "0.1.0",
  newArchEnabled: true,
  scheme: appScheme,
  orientation: "portrait",
  userInterfaceStyle: "light",
  splash: {
    backgroundColor: "#f6f8fb"
  },
  androidStatusBar: {
    backgroundColor: "#f6f8fb",
    barStyle: "dark-content",
    translucent: false
  },
  platforms: ["android", "web"],
  android: {
    package: "com.drinkgroupbuy.prototype",
    config: {
      googleMaps: {
        apiKey: googleMapsApiKey
      }
    }
  },
  extra: {
    prototypeOnly: true,
    googleMapsConfigured: Boolean(googleMapsApiKey),
    googleMapsWebApiKey,
    googleMapsWebConfigured: Boolean(googleMapsWebApiKey),
    backendBaseUrl,
    devConsoleBaseUrl,
    firebaseApiKey,
    firebaseAuthDomain,
    firebaseProjectId,
    firebaseAppId,
    googleAndroidClientId,
    googleIosClientId,
    googleWebClientId,
    appScheme,
    authMode
  }
};
