# DrinkGroupBuy Mobile Prototype

Android-first mobile app prototype for DrinkGroupBuy.

This folder is a prototype only. Google Maps is the only real external service currently allowed. It does not connect to payment providers, push notifications, login, backend, or database services.

## Tech Direction

- React Native + Expo
- Android-first
- Mock data only
- Screen and flow validation before formal API/database design

## Run On Android

Install dependencies first:

```powershell
cd mobile
npm install
```

Start Expo:

```powershell
npm run android
```

Or start the Expo dev server:

```powershell
npm start
```

Then open the project with an Android emulator or the Expo Go app on an Android phone.

## Prototype Boundaries

- No real backend.
- No real database.
- No real API calls.
- Google Maps uses `react-native-maps` on Android. Store markers and nearby activity data remain prototype mock data.

## Google Maps Setup

Expo Go can display the Android Google map during local prototype testing. A standalone Android build requires a restricted Google Maps API key.

1. Create a Google Cloud project and enable **Maps SDK for Android**.
2. Create an Android-restricted API key for package `com.drinkgroupbuy.prototype`.
3. Put the key in `mobile/.env`:

```dotenv
GOOGLE_MAPS_API_KEY=your_restricted_key
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=your_http_referrer_restricted_web_key
```

4. Restart Expo after changing the key:

```powershell
cd C:\vscode\DrinkGroupBuy\mobile
npm run android
```

The Android key requires **Maps SDK for Android**. The Web key requires **Maps JavaScript API** and should be restricted by HTTP referrer, such as `http://localhost:*/*`. The keys are read from `mobile/.env` by `app.config.js`. The `.env` file is ignored by Git. Do not put real keys in `.env.example`, `app.json`, source code, or documentation.

After changing either key, fully stop and restart Expo. Hot refresh does not reliably reload environment variables or dynamic Expo config.

Map prototype data is centralized in:

- `src/mock/mapConfig.js`: map center and zoom defaults.
- `src/mock/stores.js`: prototype store names, addresses, and coordinates.
- No real payment.
- No real push notifications.
- No real login.
- Mock data is not a final API contract.
