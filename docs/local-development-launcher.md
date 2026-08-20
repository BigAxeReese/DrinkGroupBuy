# Windows 一鍵開發啟動器

## 用途

Windows 組員完成一次性環境設定後，可以在專案根目錄依需求雙擊：

```text
01-start-server.cmd
02-start-app.cmd
03-start-web.cmd
04-start-console.cmd
```

四個啟動器會依目前 clone 路徑執行，不使用任何成員個人的絕對專案路徑，因此可以安全提交到 GitHub。

## 使用順序

```text
01-start-server.cmd
├─ 需要 Android App：再開 02-start-app.cmd
├─ 需要網頁預覽：再開 03-start-web.cmd
├─ 需要後台：再開 04-start-console.cmd
└─ 同時需要：把需要的啟動器都開啟
```

## 共用伺服器啟動器

`01-start-server.cmd` 會：

1. 使用 VS Code 開啟目前專案；若 `code` 指令不在 PATH，只略過這一步。
2. 缺少 Backend `node_modules` 時，使用 lockfile 執行 `npm ci`。
3. 僅在開發 SQLite 不存在時執行 `db:init` 與 `db:seed`；既有資料庫不會被重建。
4. 依 `backend/.env` 的 `PORT` 啟動 Backend。

這個視窗需要保持開啟。它不會啟動 Metro、Android、網頁預覽或後台控制台。

## App 啟動器

`02-start-app.cmd` 會：

1. 檢查 Backend 是否已由 `01-start-server.cmd` 啟動；未啟動就停止並提示。
2. 缺少 Mobile `node_modules` 時，使用 lockfile 執行 `npm ci`。
3. 在 `8081` 啟動目前專案的 Expo Metro。
4. 重用已連接的 Android 裝置；沒有裝置時，自動啟動 Android Studio 中第一個 AVD。
5. App 已安裝時直接開啟；尚未安裝時，另外開啟首次 Android build 視窗。

這個入口不會代為啟動 Backend，也不會啟動本機控制台。

## 網頁預覽啟動器

`03-start-web.cmd` 會：

1. 檢查 Backend 是否已由 `01-start-server.cmd` 啟動；未啟動就停止並提示。
2. 缺少 Mobile `node_modules` 時，使用 lockfile 執行 `npm ci`。
3. 在 `8083` 啟動目前專案的 Expo Web。
4. 使用預設瀏覽器開啟 `http://127.0.0.1:8083/`。
5. 僅在這個 Web 程序內把 Backend 位址設為電腦可連線的 `127.0.0.1`；不會覆寫 `mobile/.env`，因此不影響 Android 模擬器使用的 `10.0.2.2`。

這個入口不會代為啟動 Backend，也不會啟動 Android 模擬器、Android App 或本機控制台。網頁版適合快速預覽共用畫面；原生地圖、權限與裝置功能仍應以 Android App 驗證為準。

## 後台控制台啟動器

`04-start-console.cmd` 會：

1. 檢查 Backend 是否已由 `01-start-server.cmd` 啟動；未啟動就停止並提示。
2. 啟動 `local-dev-console/` 的 `3100` 控制台。
3. 使用預設瀏覽器開啟 `http://127.0.0.1:3100/`。

控制台目前可查看測試帳號、個別顧客定位，以及全域業務時間。業務時間可切換成真實時間、前後位移或固定時間，用來快速測試截止與取餐流程；設定不會改電腦時間，Backend 重啟後會恢復真實時間。套用後 App 最多約 5 秒同步；背景排程則在下一次檢查週期套用，不會因按下套用而立刻執行扣款。

這個入口不會代為啟動 Backend，也不會啟動 Metro、Android 模擬器或 App。`local-dev-console/` 仍是本機專用且不納入 Git；資料夾不存在時會顯示明確錯誤。

## 每位組員首次使用前

電腦必須先安裝：

- Git
- Node.js LTS 與 npm
- VS Code（建議安裝 `code` PATH 指令）
- Android Studio、Android SDK Platform-Tools
- 至少一個 Android Virtual Device

若只使用網頁預覽或後台控制台，不需要安裝 Android Studio 與 Android Virtual Device。

第一次雙擊時，如果下列本機環境檔不存在，啟動器會從範例建立後停止：

```text
backend/.env
mobile/.env
```

請設定需要的本機開發值及 API Key，再次雙擊對應的啟動器。這兩個檔案已被 Git 忽略，不得提交秘密。伺服器與後台模式要求 `backend/.env`；Android App 與網頁預覽模式同時要求兩個環境檔。

Android 模擬器連線 Backend 時，`mobile/.env` 通常使用：

```env
EXPO_PUBLIC_BACKEND_URL=http://10.0.2.2:3000
```

連接埠必須與 `backend/.env` 的 `PORT` 一致。例如 Backend 使用 `3001`，Mobile 就改成 `http://10.0.2.2:3001`。

若使用開發身份選擇器，還需要互相對應：

```env
# backend/.env
AUTH_DEV_MODE=true

# mobile/.env
EXPO_PUBLIC_AUTH_MODE=dev
```

## 指定模擬器

預設使用 Android Studio 中第一個 AVD。若同時有多個 AVD，可以設定 Windows 使用者環境變數：

```powershell
[Environment]::SetEnvironmentVariable(
  "DRINK_GROUP_BUY_AVD",
  "自己的_AVD_名稱",
  "User"
)
```

設定後重新開啟啟動器。若已有裝置連線，會優先重用；也可使用標準 `ANDROID_SERIAL` 指定裝置。

## 日常修改是否要重新打包

- 修改一般 JavaScript、JSX、樣式或畫面：Metro／Fast Refresh 即可，不需要重新打包。
- 修改 Android 原生設定、原生套件或需要寫入原生 App 的設定：執行 `npm run mobile:android` 重新建置。

## 命令列驗證選項

需要測試啟動器但不想重複開 VS Code、瀏覽器或模擬器時，可以執行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start-dev.ps1 `
  -LaunchTarget App `
  -SkipCode `
  -SkipBrowser `
  -SkipEmulator
```

`-SkipEmulator` 只是不主動建立模擬器；若已有裝置連線，仍會重用並開啟 App。

## 常見問題

### 連接埠已被其他專案占用

啟動器會避免重複啟動已占用的 `Backend PORT`、`8081`、`8083` 與 `3100`。如果占用者不是 DrinkGroupBuy，請先關閉該程序，再重新執行。

### App、網頁或後台提示 Backend 尚未啟動

先雙擊 `01-start-server.cmd`，等伺服器顯示 ready，再執行 `02`、`03` 或 `04`。App、網頁與後台入口不會代為啟動 Backend。

### App 無法連到 Backend

確認 `mobile/.env` 的 `EXPO_PUBLIC_BACKEND_URL` 與 `backend/.env` 的 `PORT` 一致。Android Emulator 使用電腦主機服務時應使用 `10.0.2.2`，不能使用 `localhost`。

### 網頁版顯示「Failed to fetch」，瀏覽器 Console 出現 `10.0.2.2`

網頁版（`http://127.0.0.1:8083`）在真實瀏覽器裡永遠連不到 `10.0.2.2`——那個位址只在 Android 模擬器的虛擬網路裡有意義。會出現這個狀況，通常是因為 `mobile/.env` 的 `EXPO_PUBLIC_BACKEND_URL` 依本文件建議設成 Android 用的 `http://10.0.2.2:<port>`（見上方「每位組員首次使用前」），但啟動網頁版時沒有經過 `03-start-web.cmd`（它會在啟動當下用 `127.0.0.1` 覆寫這個值，見 `scripts/start-dev.ps1` 的 `Start-ServiceWindow -ServiceName "web"`），而是直接執行了 `npm --prefix mobile run web`，於是網頁版也套用了 Android 專用的位址。

排除步驟：

1. 開瀏覽器開發者工具（`F12`）→ Console，確認失敗的請求網址是不是 `10.0.2.2`。
2. 是的話，改用 `03-start-web.cmd` 啟動網頁版（不要直接執行 `npm run mobile:web`）；或執行 `npm run mobile:web:preview`，這個指令會在啟動前先把 `EXPO_PUBLIC_BACKEND_URL` 覆寫成 `http://127.0.0.1:3001`，效果跟 `03-start-web.cmd` 一致。
3. `.claude/launch.json`（Claude Code 用來啟動網頁版預覽的設定）已經改成呼叫 `mobile:web:preview`，所以透過 Claude Code 啟動不會再遇到這個問題；`mobile/src/utils/apiClient.js` 與 `mobile/src/utils/devLocationControl.js` 也各自加了一層防護，網頁版一律忽略指向 `10.0.2.2` 的覆寫值，即使環境變數設錯也不會整個打不通，但畫面上仍可能因為改連到別的位址而暫時看不到本機控制台資料，最好還是照上面兩步驟修正根本設定。

### 找不到模擬器

請在 Android Studio Device Manager 建立 AVD，並確認 Android SDK 位於 `ANDROID_HOME`、`ANDROID_SDK_ROOT` 或預設的 `%LOCALAPPDATA%\Android\Sdk`。

### PowerShell 執行原則

請直接雙擊 `01-start-server.cmd`、`02-start-app.cmd`、`03-start-web.cmd` 或 `04-start-console.cmd`。它們只對這次執行使用 `ExecutionPolicy Bypass`，不會修改電腦的永久 PowerShell 原則。
