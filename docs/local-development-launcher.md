# Windows 一鍵開發啟動器

## 用途

Windows 組員完成一次性環境設定後，在專案根目錄雙擊：

```text
01-dev-console.cmd
```

會開啟一個「開發控制台」視窗，列出 PostgreSQL 資料庫、後端伺服器、App 預覽（Metro）、網頁預覽四項，各自顯示目前有沒有在跑，並提供啟動／停止按鈕。不使用任何成員個人的絕對專案路徑，因此可以安全提交到 GitHub。

2026-09 起，這個視窗取代了原本 `01-start-server.cmd`／`02-start-app.cmd`／`03-start-web.cmd`／`04-start-console.cmd` 四個獨立捷徑；四個入口實際做的事沒有改變，只是改成同一個視窗裡的按鈕，不用再記得先後順序、也不用切換好幾個黑底命令視窗確認狀態。

## 使用方式

1. 雙擊 `01-dev-console.cmd`，開發控制台視窗會出現，開始每 1～2 秒偵測各項服務目前有沒有在跑。
2. 先按「後端伺服器」那一列的「啟動」；狀態變成「● 運作中」之後，再視需要啟動 App 預覽或網頁預覽——這兩項本身就需要後端先啟動（跟以前 `02`／`03` 的規則一樣），後端沒啟動時對應按鈕會反白，避免按下去卻失敗。
3. 需要停掉某一項時，按同一顆按鈕（狀態運作中時它會變成「停止」）。
4. 視窗下方的「最近動作記錄」會顯示目前這個動作（啟動／停止）的即時輸出，跟以前個別捷徑彈出的黑底視窗顯示的是同一份訊息，只是收進同一個地方。
5. 關掉開發控制台視窗，不會連帶停掉已經啟動的服務（後端、Metro、網頁預覽都是各自獨立的背景程序）——它只是一個狀態面板，不是這些服務本身。

## 各列實際在做的事

**PostgreSQL 資料庫**（port `5432`）：按「啟動」只做 `docker compose up -d`，把資料庫容器開起來，不會套用 migration（migration 仍然只在啟動「後端伺服器」時才會執行，跟以前一樣）——這一列單純是想在不開後端的情況下，先把資料庫開起來查資料用的。按「停止」是 `docker compose stop`，不會刪除容器或資料。找不到 Docker、且 5432 沒有其他方式在監聽時，記錄欄會顯示提示訊息（見 `database/README.md`）。

**後端伺服器**（port 依 `backend/.env` 的 `PORT`，預設 `3000`）：等同以前的 `01-start-server.cmd`（不含開啟 VS Code——如果想要它自動開，仍然只能用命令列直接執行 `scripts\start-dev.ps1 -LaunchTarget Server`，不加 `-SkipCode`）：缺 `node_modules` 時先 `npm ci`，確認 PostgreSQL 可連線（沒有的話用 Docker 啟動），套用尚未套用的 migration，接著啟動後端。這一列還多一個「開啟測試控制台」按鈕，後端運作中才可按，會開瀏覽器到 `http://127.0.0.1:<port>/admin/dev-console`（本機測試帳號、定位模擬、全域業務時間調整，見下方說明；需要先登入後台）。停止時只會關閉後端這個 process，不會動 PostgreSQL 容器。

**App 預覽（Metro）**（port `8081`）：等同以前的 `02-start-app.cmd`：缺 Mobile `node_modules` 時先 `npm ci`，啟動 Metro，重用已連接的 Android 裝置或啟動第一個 AVD，App 已安裝就直接開啟、未安裝則另外跑首次 build。停止只會關閉 Metro 這個 process，不會關閉已經開著的模擬器或手機連線，下次再啟動時會直接重用。

**網頁預覽**（port `8083`）：等同以前的 `03-start-web.cmd`：缺 Mobile `node_modules` 時先 `npm ci`，啟動 Expo Web，只在這個 Web 程序內把後端位址設成 `127.0.0.1`（不會覆寫 `mobile/.env`，不影響 Android 模擬器用的 `10.0.2.2`）。這一列多一個「開啟瀏覽器」按鈕，運作中才可按，會開 `http://127.0.0.1:8083/`。

## 每位組員首次使用前

電腦必須先安裝：

- Git
- Node.js LTS 與 npm
- VS Code（建議安裝 `code` PATH 指令；開發控制台本身不會自動開啟 VS Code，需要的話另外用命令列啟動，見上方「後端伺服器」說明）
- Android Studio、Android SDK Platform-Tools
- 至少一個 Android Virtual Device
- Docker Desktop（PostgreSQL 資料庫用；也可以自行用別的方式在本機啟動 PostgreSQL，見 `database/README.md`）

若只使用網頁預覽或測試控制台，不需要安裝 Android Studio 與 Android Virtual Device。

第一次啟動「後端伺服器」時，如果下列本機環境檔不存在，會從範例建立後停止（記錄欄會顯示訊息）：

```text
backend/.env
mobile/.env
```

請設定需要的本機開發值及 API Key，再按一次「啟動」。這兩個檔案已被 Git 忽略，不得提交秘密。伺服器模式要求 `backend/.env`；App 與網頁預覽模式同時要求兩個環境檔。

Android 模擬器連線 Backend 時，`mobile/.env` 通常使用：

```env
EXPO_PUBLIC_BACKEND_URL=http://10.0.2.2:3000
```

連接埠必須與 `backend/.env` 的 `PORT` 一致。例如 Backend 使用 `3001`，Mobile 就改成 `http://10.0.2.2:3001`。

真的 Android 手機（不是模擬器）連線時，`10.0.2.2` 沒有作用，要改成電腦在區域網路裡的實際 IP（例如 `http://192.168.0.93:3001`）；詳見下方「常見問題」的「用真的 Android 手機（不是模擬器）測試」。

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

設定後重新啟動開發控制台裡的 App 預覽。若已有裝置連線，會優先重用；也可使用標準 `ANDROID_SERIAL` 指定裝置。

## 測試控制台（`/admin/dev-console`）

從開發控制台視窗「後端伺服器」那一列按「開啟測試控制台」即可，或直接開瀏覽器到 `http://127.0.0.1:<port>/admin/dev-console`（port 依 `backend/.env` 的 `PORT`；需要先登入後台，畫面會嵌在後台側邊欄裡）。舊的 `http://127.0.0.1:<port>/dev-console` 網址仍然可以開，會自動轉址過去，不用改書籤。裡面可查看測試帳號、個別顧客定位，以及全域業務時間；業務時間可切換成真實時間、前後位移或固定時間，用來快速測試截止與取餐流程，設定不會改電腦時間，後端重啟後會恢復真實時間。套用後 App 最多約 5 秒同步；背景排程則在下一次檢查週期套用，不會因按下套用而立刻執行扣款。

這個頁面併在主 Backend 裡（`backend/devConsole/`），只接受從本機（loopback）發出的請求；用真手機透過區網 IP 開啟 App 時，定位控制台的自動同步功能不會生效（Android 模擬器可以，因為 `10.0.2.2` 會被系統轉譯成本機）。

## 日常修改是否要重新打包

- 修改一般 JavaScript、JSX、樣式或畫面：Metro／Fast Refresh 即可，不需要重新打包。
- 修改 Android 原生設定、原生套件或需要寫入原生 App 的設定：執行 `npm run mobile:android` 重新建置。

## 命令列驗證選項

需要測試啟動流程但不想開 GUI 視窗、或想用 `-SkipEmulator` 等參數時，仍然可以直接執行開發控制台背後呼叫的同一支腳本：

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

開發控制台會避免重複啟動已占用的 `Backend PORT`、`8081`、`8083` 與 `5432`。如果占用者不是 DrinkGroupBuy，請先關閉該程序，再重新按一次啟動。

### App、網頁或測試控制台按鈕反白按不了

先啟動「後端伺服器」那一列，等狀態變成「● 運作中」，App 與網頁預覽兩顆按鈕才會恢復可按（測試控制台的「開啟」按鈕同理）。

### App 無法連到 Backend

確認 `mobile/.env` 的 `EXPO_PUBLIC_BACKEND_URL` 與 `backend/.env` 的 `PORT` 一致。Android Emulator 使用電腦主機服務時應使用 `10.0.2.2`，不能使用 `localhost`。

### 網頁版顯示「Failed to fetch」，瀏覽器 Console 出現 `10.0.2.2`

網頁版（`http://127.0.0.1:8083`）在真實瀏覽器裡永遠連不到 `10.0.2.2`——那個位址只在 Android 模擬器的虛擬網路裡有意義。會出現這個狀況，通常是因為 `mobile/.env` 的 `EXPO_PUBLIC_BACKEND_URL` 依本文件建議設成 Android 用的 `http://10.0.2.2:<port>`（見上方「每位組員首次使用前」），但啟動網頁版時沒有經過開發控制台的「網頁預覽」（它會在啟動當下用 `127.0.0.1` 覆寫這個值，見 `scripts/start-dev.ps1` 的 `Start-ServiceWindow -ServiceName "web"`），而是直接執行了 `npm --prefix mobile run web`，於是網頁版也套用了 Android 專用的位址。

排除步驟：

1. 開瀏覽器開發者工具（`F12`）→ Console，確認失敗的請求網址是不是 `10.0.2.2`。
2. 是的話，改用開發控制台啟動網頁版（不要直接執行 `npm run mobile:web`）；或執行 `npm run mobile:web:preview`，這個指令會在啟動前先把 `EXPO_PUBLIC_BACKEND_URL` 覆寫成 `http://127.0.0.1:3001`，效果跟開發控制台的網頁預覽一致。
3. `.claude/launch.json`（Claude Code 用來啟動網頁版預覽的設定）已經改成呼叫 `mobile:web:preview`，所以透過 Claude Code 啟動不會再遇到這個問題；`mobile/src/utils/apiClient.js` 與 `mobile/src/utils/devLocationControl.js` 也各自加了一層防護，網頁版一律忽略指向 `10.0.2.2` 的覆寫值，即使環境變數設錯也不會整個打不通，但畫面上仍可能因為改連到別的位址而暫時看不到本機控制台資料，最好還是照上面兩步驟修正根本設定。

### 用真的 Android 手機（不是模擬器）測試

不需要額外設定——`scripts/start-dev.ps1` 的裝置偵測（`Get-ConnectedAndroidDevice`）只看 `adb devices` 有沒有裝置回應，接上的真機會被當成一般「已連接的 Android 裝置」，跟模擬器走同一條路徑，會優先於模擬器被使用。手機端需要：

1. 開啟「開發人員選項」→「USB 偵錯」，用 USB 線接上電腦。
2. 手機會跳出「是否允許 USB 偵錯」的授權提示，需要在手機上按下允許（建議勾選「一律允許使用這台電腦」）。
3. **三星手機常見卡點**：如果「USB 偵錯」／「無線偵錯」下面出現「已遭自動封鎖程式封鎖」，是三星「Auto Blocker（自動封鎖程式）」這個安全功能擋住的，需要到「設定」→「安全性與隱私」→「自動封鎖程式」先關閉，USB 偵錯才會真的生效。
4. 「使用 USB 作為」要選「傳輸檔案 / Android Auto」，選「僅限手機充電」電腦端偵測不到完整的偵錯連線。

真機第一次測試（2026-08-21）另外發現兩個模擬器上不會出現的問題：

- **後端網址不能用 `10.0.2.2`**：那個位址只在模擬器的虛擬網路裡有意義，真機透過 Wi-Fi 連線，需要 `mobile/.env` 的 `EXPO_PUBLIC_BACKEND_URL` 指向電腦在區域網路裡的實際 IP（例如 `http://192.168.0.93:3001`，用 `ipconfig` 查詢；換 Wi-Fi 或重開機後這個 IP 可能會變，要重新確認）。改這個值後，因為是啟動時就固定寫進打包內容的環境變數，**要重新啟動 Metro（開發控制台的「App 預覽」那一列按停止再啟動）才會生效**，單純在手機上按重試沒有用。若手機還是連不上，確認電腦的 Windows 防火牆有沒有允許 Node.js 接受區網連線（本機測過已經有一條允許規則，但不同電腦第一次開防火牆詢問時若選了「封鎖」，要手動到「Windows 防火牆」設定裡放行）。
- **Android 9 以上預設擋掉不加密的 HTTP 連線**：後端開發伺服器是純 HTTP（沒有本機 TLS 憑證），手機系統會直接擋掉這個連線，畫面上顯示「Network request failed」，網址跟 port 都對也一樣連不上。已在 `mobile/app.config.js` 加上 `expo-build-properties` 這個 plugin，設定 `android.usesCleartextTraffic: true` 解決。這是**原生設定**，不是 JS 改動，套用後需要整個重新建置：跑 `npm run mobile:android`（不是開發控制台的「App 預覽」——App 已安裝過的話它只會重開舊版本，不會重新套用原生設定變更）。

### 找不到模擬器

請在 Android Studio Device Manager 建立 AVD，並確認 Android SDK 位於 `ANDROID_HOME`、`ANDROID_SDK_ROOT` 或預設的 `%LOCALAPPDATA%\Android\Sdk`。

### PowerShell 執行原則

請直接雙擊 `01-dev-console.cmd`。它只對這次執行使用 `ExecutionPolicy Bypass`，不會修改電腦的永久 PowerShell 原則。
