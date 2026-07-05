# DrinkGroupBuy 啟動說明

這份 README 是給第一次開啟專案的人看的。  
目前專案方向是 Android-first mobile app，但開發與展示時可以先用 Expo Web 在電腦瀏覽器預覽。

## 專案目前內容

```text
DrinkGroupBuy/
├── mobile/      React Native + Expo 手機 App
├── backend/     Node.js backend API
├── database/    開發用 SQLite schema、seed 與 PostgreSQL draft
├── docs/        專案文件、規則、資料表與流程紀錄
└── package.json 根目錄啟動指令
```

目前正式開發主軸：

- 手機 App：`mobile/`
- 後端 API：`backend/`
- 開發資料庫：`database/drink-group-buy-dev.sqlite`

## 需要先安裝

請先確認電腦已安裝：

- Node.js
- npm
- Git
- 瀏覽器，例如 Chrome 或 Edge

如果要用 Android 模擬器或手機預覽，還需要：

- Android Studio Emulator，或
- 手機安裝 Expo Go

## 第一次開啟專案

在專案根目錄執行：

```powershell
npm install
npm --prefix mobile install
```

## 設定環境變數

請建立本機環境檔，不要把真正的金鑰 commit 到 GitHub。

### Backend 環境檔

把根目錄範例複製到 `backend/.env`：

```powershell
Copy-Item .env.example backend\.env
```

`backend/.env` 主要放：

- LINE Pay sandbox 設定
- backend session secret
- backend port

### Mobile 環境檔

把 mobile 範例複製到 `mobile/.env`：

```powershell
Copy-Item mobile\.env.example mobile\.env
```

`mobile/.env` 主要放：

```env
GOOGLE_MAPS_API_KEY=Android 用 Google Maps API key
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=Web 預覽用 Google Maps API key
EXPO_PUBLIC_BACKEND_URL=http://localhost:3000
```

注意：

- `EXPO_PUBLIC_*` 會被打包到前端，不能放 LINE Pay 密鑰。
- LINE Pay 密鑰只能放在 `backend/.env`。

## 初始化開發資料庫

第一次執行或想重建測試資料時：

```powershell
npm run db:init
npm run db:seed
```

這會建立並填入開發用 SQLite 資料庫。

## 啟動 backend

開一個終端機，在專案根目錄執行：

```powershell
npm run backend:start
```

預設 backend 會開在：

```text
http://localhost:3000
```

可以用這個網址檢查：

```text
http://localhost:3000/health
```

## 在電腦瀏覽器預覽 mobile app

再開另一個終端機，在專案根目錄執行：

```powershell
npm run mobile:web
```

通常會開在：

```text
http://localhost:8081
```

如果終端機顯示其他網址，請以終端機顯示的網址為準。

## 在 Android 預覽

如果已經準備好 Android 模擬器或 Expo Go，可以執行：

```powershell
npm run mobile:android
```

Android 手機測試時，如果 backend 連不上，通常是因為手機無法直接連到電腦的 `localhost`。這時要把 `mobile/.env` 的 `EXPO_PUBLIC_BACKEND_URL` 改成手機能連到的 backend 網址。

## 測試帳號

目前是開發用登入資料。

顧客：

```text
0911000001 / customer1
0911000002 / customer2
0911000003 / customer3
0911000004 / customer4
```

商家：

```text
store1@example.com / merchant1
store2@example.com / merchant2
store3@example.com / merchant3
```

管理員：

```text
admin@example.com / admin1
```

## 常見問題

### Mobile 顯示 Failed to fetch

請確認：

1. backend 是否已啟動。
2. `mobile/.env` 的 `EXPO_PUBLIC_BACKEND_URL` 是否正確。
3. 修改 `.env` 後是否已重新啟動 Expo。

### Google Maps 沒有顯示

請確認：

1. `mobile/.env` 是否有填入 `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`。
2. Google Cloud 的 API key 是否允許 Web 預覽使用。
3. 修改 `.env` 後是否已重新啟動 Expo。

### LINE Pay 無法開啟或授權失敗

請確認：

1. `backend/.env` 是否有填入 LINE Pay sandbox 設定。
2. backend 是否已啟動。
3. App 中的訂單是否已送到 backend。

## 建議啟動順序

最穩定的順序是：

```powershell
npm install
npm --prefix mobile install
npm run db:init
npm run db:seed
npm run backend:start
npm run mobile:web
```

其中 `backend:start` 和 `mobile:web` 建議分成兩個終端機執行。
