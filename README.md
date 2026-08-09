# DrinkGroupBuy 啟動說明

## Windows 快速啟動

完成一次性環境設定後，依需求在專案根目錄雙擊：

```text
01-start-server.cmd    先啟動共用 Backend 伺服器
02-start-app.cmd       再啟動 Metro、Android 模擬器與 App
03-start-web.cmd       或啟動 App 的網頁預覽版
04-start-console.cmd   或啟動本機控制台與控制台網頁
```

先執行 `01`，再依需求執行 `02`、`03`、`04`，也可同時執行需要的畫面。四個入口責任分開，並使用目前 clone 的相對路徑，因此可隨專案同步到 GitHub。詳細設定與常見問題請查看 [`docs/local-development-launcher.md`](./docs/local-development-launcher.md)。

`local-dev-console/` 仍是本機專用、不同步 Git；沒有該資料夾時，`04-start-console.cmd` 會提示無法啟動，但不影響伺服器、App 與網頁預覽版。

## 開發流程與規則

開發流程、產品規則、付款流程、狀態定義、資料庫設計與開放問題，請先查看 [`docs/`](./docs/)。

常用文件：

- [`docs/final-product-user-flow.md`](./docs/final-product-user-flow.md)：最終產品操作流程。
- [`docs/payment-rules-and-flow.md`](./docs/payment-rules-and-flow.md)：LINE Pay 付款規則與流程。
- [`docs/status-candidates.md`](./docs/status-candidates.md)：訂單、付款、團購與取餐狀態定義。
- [`docs/current-progress.md`](./docs/current-progress.md)：目前開發進度。

這份 README 是給第一次開啟專案的人看的。  
目前專案方向是 Android-first mobile app，但開發與展示時可以先用 Expo Web 在電腦瀏覽器預覽。

## 最常用指令

以下指令都在專案根目錄執行：

```powershell
cd C:\vscode\DrinkGroupBuy
```

### 啟動專案

開第一個終端機啟動 backend：

```powershell
npm run backend:start
```

開第二個終端機啟動 mobile web：

```powershell
npm run mobile:web
```

瀏覽器開啟：

```text
http://localhost:8083
```

backend 預設是：

```text
http://localhost:3000
```

如果 `backend/.env` 有設定其他 `PORT`，例如 `3001`，就以該 port 為準。

### 初始化資料庫

第一次開專案或想重建測試資料時：

```powershell
npm run db:init
npm run db:seed
```

### 開發測試切換角色

這些指令只修改本機開發資料庫的 `users.firebase_uid` 對應，不會修改 Firebase，也不是正式產品功能。

```powershell
npm run auth:map:customer
npm run auth:map:customer-b
npm run auth:map:merchant
npm run auth:map:admin
```

切換角色後，請在 App 內登出並重新 Google 登入，backend 才會重新判斷角色。

### Android 預覽

如果已經準備好 Android 模擬器或 Expo Go：

```powershell
npm run mobile:android
```

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
http://localhost:8083
```

如果終端機顯示其他網址，請以終端機顯示的網址為準。

## 在 Android 預覽

如果已經準備好 Android 模擬器或 Expo Go，可以執行：

```powershell
npm run mobile:android
```

Android 手機測試時，如果 backend 連不上，通常是因為手機無法直接連到電腦的 `localhost`。這時要把 `mobile/.env` 的 `EXPO_PUBLIC_BACKEND_URL` 改成手機能連到的 backend 網址。

## 測試登入與角色切換

正式方向是 Firebase Auth + Google Login。App 不提供角色選擇，角色由 backend 查本機開發資料庫決定。

若只有一個 Google 測試帳號，建議本機改用 dev-only 身份切換器：

```env
AUTH_DEV_MODE=true
EXPO_PUBLIC_AUTH_MODE=dev
```

啟用後，登入頁會顯示「本機測試身份」下拉選單，可切換 SQLite 內的顧客、商家與開發補救身份。這個模式不得用於 production build。

也可以用同一個 Google 測試帳號，搭配本機 mapping 指令切換角色：

```powershell
npm run auth:map:customer
npm run auth:map:customer-b
npm run auth:map:merchant
npm run auth:map:admin
```

切換後需要在 App 內登出並重新 Google 登入。

舊的帳密登入只保留作為開發相容用途，不是正式產品流程。

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
