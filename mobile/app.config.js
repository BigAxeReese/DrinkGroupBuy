const appJson = require("./app.json");

const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
const googleMapsWebApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || googleMapsApiKey;
const backendBaseUrl = process.env.EXPO_PUBLIC_BACKEND_URL || "http://localhost:3000";

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
    backendBaseUrl
  }
};
