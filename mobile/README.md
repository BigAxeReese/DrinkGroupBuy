# DrinkGroupBuy Mobile

這是 DrinkGroupBuy 的 Android-first mobile app，目前用 React Native + Expo 開發。

目前開發方式是：最後目標偏 Android App，但現在也支援 Expo Web，方便在電腦瀏覽器展示與測試。

## 目前定位

這不是單純 mock 前端了，現在已經開始和本機 backend / SQLite 串接。

目前已接上的功能：

- 顧客、商家與管理員 prototype 登入入口。
- 顧客首頁、即時地圖、菜單、購物車、我的訂單。
- 商家建立團購活動，會呼叫 backend API。
- 顧客送出購物車，會呼叫 backend 建立訂單。
- 付款頁可以呼叫 backend 建立 LINE Pay sandbox 預授權付款連結。
- 管理員取消團購，會呼叫 backend API。

目前仍未完成：

- 正式顧客手機號碼密碼登入，以及商家/管理員 Email 密碼登入。
- App 重新載入後完整從 backend 載入所有訂單。
- LINE Pay capture / void / refund。
- LINE Pay webhook。
- 團購截止後自動結算。
- 正式 Android 打包上架流程。

## 安裝依賴

第一次下載專案後，在專案根目錄執行：

```powershell
cd mobile
npm install
```

同一台電腦通常只需要執行一次。

## 開啟 Web 預覽

從專案根目錄執行：

```powershell
npm run mobile:web
```

常用網址：

```text
http://localhost:8081
```

如果改過 `.env`，請完整停止並重啟 Expo。

## 開啟 Android 預覽

從專案根目錄執行：

```powershell
npm run mobile:android
```

可以用 Android Emulator，或在 Android 手機安裝 Expo Go 後掃描 QR code。

## 環境變數

本機 mobile 設定檔：

```text
mobile/.env
```

範本：

```text
mobile/.env.example
```

常見內容：

```env
GOOGLE_MAPS_API_KEY=your_restricted_android_google_maps_api_key
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=your_http_referrer_restricted_web_google_maps_api_key
EXPO_PUBLIC_BACKEND_URL=http://localhost:3000
```

## Google Maps key 差異

| 變數 | 用途 |
| --- | --- |
| `GOOGLE_MAPS_API_KEY` | Android 原生地圖用 |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | Web 預覽地圖用 |

`EXPO_PUBLIC_` 開頭的變數會進入前端 bundle，所以不能放密碼或真正機密。

Google Maps API key 可以放在 mobile，但要到 Google Cloud Console 設限制：

- Android key：限制 package name 和 SHA-1。
- Web key：限制 HTTP referrer，例如 `http://localhost:*/*`。

## Backend URL

`EXPO_PUBLIC_BACKEND_URL` 是 mobile 呼叫 backend 的網址。

本機通常是：

```env
EXPO_PUBLIC_BACKEND_URL=http://localhost:3000
```

如果你用 Android 實機測試，`localhost` 會指向手機本身，不是電腦。那時要改成電腦區網 IP 或 tunnel URL。

## LINE Pay 注意事項

LINE Pay 的通路密鑰不能放在 `mobile/.env`。

正確位置是：

```text
backend/.env
```

mobile 只會呼叫 backend，真正簽章和密鑰都由後端處理。

## 建議本機啟動順序

從專案根目錄執行：

```powershell
npm run db:init
npm run db:seed
npm run backend:start
npm run mobile:web
```

如果已經初始化過資料庫，不一定每次都要跑 `db:init` 和 `db:seed`。

## 測試完整付款前的提醒

LINE Pay 預授權流程要求：

1. 團購活動存在於 backend SQLite。
2. 顧客購物車送出後，backend 成功建立 `orders`。
3. 付款頁才可以建立 LINE Pay request。

如果你用的是舊的 mobile localStorage 團購，backend 可能會回：

```text
Group-buy activity not found
```

這代表那筆團購只存在前端本機，不在資料庫。請先用商家頁重新建立一筆團購。

## 重要安全提醒

- 不要上傳 `mobile/.env`。
- 不要把 LINE Pay 通路密鑰放到 mobile。
- 不要把真的 API key 寫進 `.env.example`、README 或 source code。
- 改 `.env` 後要重啟 Expo。

## 主要 mock data 位置

目前 mobile 仍保留部分 prototype mock data：

```text
src/mock/stores.js
src/mock/drinks.js
src/mock/deals.js
src/mock/orders.js
src/mock/paymentReports.js
src/mock/customerUsers.js
```

未來會逐步改成從 backend API 載入。
