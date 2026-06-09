# DrinkGroupBuy Mobile Prototype

這是 DrinkGroupBuy 的 Android-first mobile app prototype。

目前專案重點是展示與驗證流程，不是正式產品。畫面資料主要來自 mock data。Google Maps 是目前唯一允許接上的真實外部服務；登入、付款、推播、正式 backend、正式 database 都不是本階段目標。

## 技術方向

- React Native + Expo
- Android-first
- Web 預覽用於開發與展示
- Mock data only
- 先確認畫面流程與資料需求，再設計正式 API / database

## 安裝依賴

第一次下載專案後，需要先安裝 mobile 依賴：

```bash
cd DrinkGroupBuy/mobile
npm install
```

同一台電腦通常只需要安裝一次。換新電腦或刪掉 `node_modules` 後才需要重跑。

## 開啟 Web 預覽

從專案根目錄執行：

```bash
cd DrinkGroupBuy
npm run mobile:web
```

Expo 會印出網址，通常是：

```text
http://localhost:8081
```

如果 `8081` 被占用，Expo 可能會詢問是否改用 `8082` 或其他 port。

## 開啟 Android 預覽

從專案根目錄執行：

```bash
cd DrinkGroupBuy
npm run mobile:android
```

可以用 Android Emulator，或在 Android 手機安裝 Expo Go 後掃描終端機顯示的 QR code。

## 環境變數設定

本機真正使用的設定檔是：

```text
mobile/.env
```

範本是：

```text
mobile/.env.example
```

建立方式：

```bash
cd DrinkGroupBuy/mobile
cp .env.example .env
```

然後在 `mobile/.env` 填入：

```dotenv
GOOGLE_MAPS_API_KEY=your_restricted_android_google_maps_api_key
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=your_http_referrer_restricted_web_google_maps_api_key
EXPO_PUBLIC_BACKEND_URL=http://localhost:3000
```

### Google Maps key

- `GOOGLE_MAPS_API_KEY`：Android 原生地圖用，需啟用 **Maps SDK for Android**。
- `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`：Web 預覽與 Web demo 用，需啟用 **Maps JavaScript API**。

Web key 會被打包進前端 JavaScript，所以不能當秘密。請在 Google Cloud 設定 HTTP referrer 限制，例如：

```text
http://localhost:*/*
https://your-demo-domain.example.com/*
```

### Backend URL

`EXPO_PUBLIC_BACKEND_URL` 是 mobile prototype 呼叫本機 backend API 時使用的 base URL。

目前主要用在：

```text
POST   /api/merchant/group-buy-activities
DELETE /api/admin/group-buy-activities/:activityId
```

如果沒有開 backend，一般顧客 mock 流程仍可展示，但商家建立活動或管理員刪除活動的 API 呼叫會失敗。

## 重要安全提醒

- 不要把 `mobile/.env` 上傳 GitHub。
- 不要把真的 Google Maps key 放進 `.env.example`、`app.json`、source code 或 README。
- `EXPO_PUBLIC_` 開頭的變數會進入前端 bundle，不適合放密碼、private token 或真正機密。
- 改 `.env` 後要完整停止並重啟 Expo，hot reload 不一定會重新載入環境變數。

## 靜態 Web Demo 打包

如果要做展示，且展示電腦不能安裝 Node.js / npm / Expo，可以先在開發電腦打包成 Web 靜態檔：

```bash
cd DrinkGroupBuy/mobile
npx expo export --platform web
```

通常會輸出到：

```text
mobile/dist/
```

之後可以部署到 GitHub Pages、Vercel、Netlify，展示電腦只需要打開網址。

注意：每次修改程式後，都要重新 export 並重新部署，demo 網址才會更新。

## Prototype 邊界

目前不做：

- 真實登入
- 真實付款
- 真實推播
- 真實 database 連線
- 正式 API contract
- 正式 production business logic

目前可做：

- 顧客角色流程展示
- 商家角色流程展示
- 管理員 prototype 畫面
- Mock cart / mock order / mock Line Pay authorization
- Google Maps 地圖顯示
- 店家 marker 與 mock 店家資料展示

## 地圖 mock data 位置

地圖與店家資料主要集中在：

```text
src/mock/mapConfig.js
src/mock/stores.js
src/mock/databaseMapStores.js
```

飲品菜單 mock data：

```text
src/mock/drinks.js
```

這些資料都是 prototype mock data，不是最終 API response，也不是正式 database schema。
