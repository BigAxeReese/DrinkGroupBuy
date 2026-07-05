const appJson = require("./app.json");

const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
const googleMapsWebApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || googleMapsApiKey;
const backendBaseUrl = process.env.EXPO_PUBLIC_BACKEND_URL || "http://localhost:3000";
const firebaseApiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
const firebaseAuthDomain = process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN;
const firebaseProjectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
const firebaseAppId = process.env.EXPO_PUBLIC_FIREBASE_APP_ID;
const googleAndroidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

module.exports = {
  ...appJson.expo,
  android: {
    ...appJson.expo.android,
    config: {
      ...appJson.expo.android?.config,
      googleMaps: {
        apiKey: googleMapsApiKey
      }
    }
  },
  extra: {
    ...appJson.expo.extra,
    googleMapsConfigured: Boolean(googleMapsApiKey),
    googleMapsWebApiKey,
    googleMapsWebConfigured: Boolean(googleMapsWebApiKey),
    backendBaseUrl,
    firebaseApiKey,
    firebaseAuthDomain,
    firebaseProjectId,
    firebaseAppId,
    googleAndroidClientId,
    googleIosClientId,
    googleWebClientId
  }
};
