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
  owner: "royor",
  version: "0.1.0",
  updates: {
    url: "https://u.expo.dev/834894ac-fe79-4a32-872f-6cee5edf2214"
  },
  runtimeVersion: {
    policy: "appVersion"
  },
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
  plugins: [
    [
      "expo-build-properties",
      {
        // Android 9+ blocks plain-HTTP traffic by default; the dev backend is HTTP-only
        // (no local TLS cert setup), so real devices and emulators alike need this to reach
        // it. This project has no separate production build profile yet, so gate it on
        // NODE_ENV instead of leaving it unconditionally true -- a build ever run with
        // NODE_ENV=production won't silently allow plaintext HTTP app-wide.
        android: {
          usesCleartextTraffic: process.env.NODE_ENV !== "production"
        }
      }
    ],
    // No iosUrlScheme option here -- this project only targets android/web (see `platforms`
    // above), and that option is iOS-only.
    "@react-native-google-signin/google-signin",
    "expo-secure-store"
  ],
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
    authMode,
    eas: {
      projectId: "834894ac-fe79-4a32-872f-6cee5edf2214"
    }
  }
};
