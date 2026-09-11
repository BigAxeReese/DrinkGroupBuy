# 系統架構

最後更新：2026-09-12

## 文件範圍

本文件回答「各層如何協作」，只在 architecture、navigation、data flow、runtime 或外部整合任務時按需載入。它不保存功能完成清單；目前進度看 `PROGRESS.md`，精確行為仍以實際 source 與本次驗證為準。

## Runtime 全貌

```text
React Native / Expo Mobile
  ├─ screen + custom navigation + local UI state
  └─ mobile/src/utils/apiClient.js
                  ↓ HTTP + bearer token
backend/server.js (Node.js built-in HTTP)
  ├─ auth / route authorization
  ├─ payment, pricing, pickup, reliability services
  └─ runtime-aware repositories
          ↓                         ↓
PostgreSQL primary runtime    Isolated SQLite test compatibility
          ↓                         ↓
LINE Pay / Firebase Admin / scheduler workers
```

Mobile 不直接連資料庫或付款 provider。Backend 是身份、價格、容量、狀態轉換與敏感操作的權威邊界。

## Mobile

- 入口是 `mobile/App.jsx`，載入 `mobile/src/navigation/AppNavigator.js`。沒有使用 React Navigation；`AppNavigator` 自行維護 stack、角色、選定門市、活動、訂單、付款與購物車 state，並以條件渲染 screen。
- Screen 依顧客、店家與開發補救流程分布在 `mobile/src/screens/`；共用視覺元件在 `mobile/src/components/`。Platform-specific 地圖使用 `LiveMapScreen.native.jsx` 與 `LiveMapScreen.web.jsx`。
- `mobile/src/utils/apiClient.js` 集中呼叫 Backend 並保存目前 bearer token。App 在登入、切換角色、回到前景及部分畫面操作時重新同步店家、活動或訂單。
- 活動、店家與訂單逐步以 Backend 回應覆蓋畫面 state；購物車仍是 Mobile local state。Web 可由 `prototypeStorage.js` 存入 `localStorage`，這只是 prototype cache，不是跨裝置資料庫或最終 API contract。
- `mobile/src/mock/` 仍有身份、初始訂單、付款與地圖預設等 fixture。判斷某功能資料來源時，必須沿 import 與 action 追蹤，不能因 mock 檔仍存在就判定 runtime 使用它。
- LINE Pay 結果可經 Backend HTML 落地頁回到 app deep link；Mobile 同時保留 polling、foreground refresh 與手動刷新作備援。

## Backend

- `backend/server.js` 使用 `node:http` 建立 server，集中做 path/method dispatch、輸入解析、authentication、role/store authorization、runtime 一致性檢查與錯誤回應；目前沒有 Express 或其他 Web framework。
- 核心領域邏輯分到 `backend/payments/`、`backend/pricing/`、`backend/pickup/`、`backend/reliability/`。新的複雜規則應維持 service／repository 邊界，不再把整段流程塞回 route dispatcher。
- `backend/db.js` 是既有 SQLite gateway，保留給明確隔離的相容性測試。正式 Backend 資料路徑由 `backend/database/repositories/` 的 runtime-aware repositories 存取 PostgreSQL；adapter 介面在 `backend/database/`。
- Server 啟動後可執行 payment reconciliation、deadline settlement 與 pickup expiration scheduler。這些 worker 會處理長時間付款／結算狀態，不能以 Mobile 是否開啟作為可靠性前提。
- `backend/devConsole/` 是本機開發測試控制台（模擬顧客定位、模擬業務時間），掛在 `/dev-console`；2026-08-23 從獨立的 `local-dev-console/`（3100 埠）併入。只接受 loopback 連線（`isLoopbackRequest`）且要求 `AUTH_DEV_MODE=true`，區網 IP（例如真手機用 LAN IP 連）不會因為同一台伺服器就連得到；真手機要連只能透過 `adb reverse tcp:3001 tcp:3001` 把 USB 接線當隧道，讓手機自己的 `127.0.0.1:3001` 請求送回電腦本機（伺服器端看起來就是 loopback 連線），這不是放寬邊界，是同一個 loopback-only 規則下唯一能讓真手機也符合條件的方式（`mobile/.env` 的 `EXPO_PUBLIC_DEV_CONSOLE_URL` 需設成 `http://127.0.0.1:3001/dev-console`，不能設 LAN IP）。2026-08-24 起併入 `/admin` 的登入狀態：人看的頁面與控制 API 額外要求 `/admin` 的登入 session（同一顆 cookie，`Path=/`），只有 Mobile App 直接呼叫、模擬定位用的 `GET /dev-console/api/app/config` 與 `POST /dev-console/api/app/report` 兩支例外，仍只靠 loopback + `AUTH_DEV_MODE` 把關，不需要 App 本身登入 `/admin`。

## Database 與 runtime 切換

- PostgreSQL schema 的權威來源是 `database/migrations/`，由 `database/migrate.js` 依版本套用；精確欄位說明只維護在 `docs/AI-database-field-spec.md`。
- `database/schema.sql` 與被 Git 忽略的 `database/drink-group-buy-dev.sqlite` 保留給 SQLite 相容性測試；`database/test/` 只是測試／匯出工具，不是正式 schema source。
- Repository 仍保留各自的 `*_RUNTIME` 選擇能力，但本機開發 Backend 已將全部 runtime 永久設定為 PostgreSQL。Server 會要求相依的 read/write/payment repositories 一致，不雙寫，也不讓單一交易跨兩個 runtime 拼接。
- `DATABASE_RUNTIME` 是通用 adapter 的選擇值，但實際 server 行為仍要檢查各 repository 的 runtime consumer，不能只看一個環境變數或文件敘述。
- `db:init`、`db:seed` 與部分 smoke scripts 會替換本機開發 SQLite。Inspection 一律唯讀；任何 mutation 先備份，完成後跑 integrity 與 foreign-key checks。

## Authentication 與 authorization

- 正式 Mobile 流程使用 Firebase Auth，支援兩種登入方式：Google Login，以及信箱＋密碼（`useFirebaseEmailLogin`，`mobile/src/utils/firebaseAuth.js`）。兩者都是同一個 Firebase 專案下的獨立登入方式，取得的 ID token 格式一致，Mobile 把 token 送至同一支 `POST /api/auth/firebase-session`，後端驗證方式不分登入方式。
- Backend 由 Firebase Admin 驗證 token，再從資料庫解析使用者角色與店家關係，最後簽發本專案 bearer token。角色與 `storeId` 不信任 client 自報值。
- **未曾登入過的 Firebase 帳號第一次登入，一律自動建立為顧客角色**（`customerRegistrationRepository.resolveOrRegisterCustomer`），不需要任何人審核；身份欄位（`firebaseUid`／`email`／`displayName`）只取自已驗證的 token，不讀 request body。這條規則對 Google 登入與信箱密碼登入一視同仁。
  - 信箱密碼登入額外要求 Firebase 的 `email_verified` claim 為真才放行自動註冊；Google 登入的 token 本身這個 claim 恆真，不受影響。信箱未驗證會被擋在 403（`email_not_verified`），不會建立帳號。
  - **商家角色不會透過登入自動取得**：不論用哪種登入方式，都必須另外走「商家自助申請 → 管理員審核」流程（`POST /api/merchant-applications` ＋ `/admin/merchant-applications`）才能從顧客轉為商家，核准時同一交易內停用顧客角色、啟用商家角色，兩者互斥、不並存。
  - **管理員角色也不會透過登入自動取得**：只能由已掌握伺服器端機密的操作者用 `scripts/grant-admin-role.js` 手動授予，任何登入路徑（含 `/admin` 網頁後台自己的信箱密碼登入）都不能自我授予或自我升級。
- 舊密碼 login 與 dev-session 是開發相容路徑。Dev identity 只有 `AUTH_DEV_MODE=true`、非 production 且 Mobile `EXPO_PUBLIC_AUTH_MODE=dev` 時才可使用。
- Admin／營運能力目前主要是開發或補救邊界；不能因畫面或 route 存在就視為 production 身份模型已完成。
- 管理員入口是 `backend/server.js` 直接輸出的 `/admin` 網頁後台（server-rendered HTML／表單，無獨立前端專案）。登入有兩條路：(1) `ADMIN_WEB_PASSWORDS`（`backend/.env`，逗號分隔的多組密碼，皆對應同一個固定管理員身份 `user-admin-001`）——備援用途，任何一組密碼都能登入同一身份，不分辨是誰；(2) 每人獨立的 Firebase 信箱密碼登入（`POST /admin/login/firebase`）——跟 Mobile 端信箱登入同一套 Firebase 機制，但額外要求該帳號已被 `scripts/grant-admin-role.js` 授予 admin 角色才放行，否則回 403（`not_admin`）；只在 `backend/.env` 設定 `FIREBASE_WEB_API_KEY`／`FIREBASE_WEB_AUTH_DOMAIN`／`FIREBASE_WEB_APP_ID` 時才會顯示這個表單。兩條路成功後都把 `createAuthToken()` 簽出的同一種 bearer token 放進 HttpOnly cookie 當 session，其餘 `/admin` 路由與權限檢查不分辨是走哪條路登入的。本機開發模式（`AUTH_DEV_MODE=true`＋僅限本機連線）另有一顆「一鍵登入」按鈕可跳過輸入密碼，正式環境（`NODE_ENV=production`）下這個按鈕與其對應的後端路由完全不存在。取消團購、退款審核、商家申請與帳號角色切換都在這個後台完成；角色切換走 PostgreSQL 交易，同時更新 `user_roles` 與 `merchant_users` 的啟用狀態並寫入 `audit_logs`，不刪除角色或業務資料。Mobile App 本身不再有任何管理員畫面或路由。
- `/admin/accounts` 列出 `users` 中仍保留的所有帳號（包含 active／disabled／deleted 與 admin）；管理員帳號及非 active 帳號只讀，repository 的寫入交易仍會再次拒絕，不能只靠停用 HTML 按鈕保護。
- 目前 App／後台是「同一個 App Service、不同入口與伺服器權限邊界」的邏輯隔離，適合課堂展示。正式營運的目標應改為獨立後台 hostname／App Service，使用 Microsoft Entra ID 或等效的管理員身份提供者、個人帳號白名單／群組與 MFA；後台管理 API 仍須保留 server-side admin role、CSRF、audit 與最小權限，不能只依賴網址不公開或前端隱藏。

## 付款、結算與取餐

- LINE Pay request／confirm／cancel、capture／void／refund 與重新付款由 `backend/payments/linePayService.js` 協調；provider 簽章與 secret 僅在 Backend。這是目前唯一的付款 provider（ECPay 備援方案已於 2026-08-27 完全移除，見 `docs/AI-security-review-log.md`）。
- 訂單送出、revision、付款前規則同意、provider 操作、截止結算與退款都需要 Backend 權威金額、idempotency、transaction／row lock 或 operation lease，以及 status／audit 紀錄。
- Provider redirect 不是唯一真相；Backend 以資料庫狀態、provider reconciliation 與持久化 reliability job 收斂結果。
- 取餐憑證的建立、查詢、核銷與 expiration 由 pickup service／repository 與 scheduler 處理。

## 外部整合與環境

- Firebase：Mobile 公開 config + Google OAuth client ID；Backend Firebase Admin credential。
- Google Maps／Location：Android 使用 native map 與 foreground location；Web 使用 Google Maps JavaScript API 與瀏覽器 geolocation。Dev-only 位置控制必須同時受 build/auth mode 限制。
- LINE Pay：只由 Backend 保存 provider credential、簽章並呼叫 API。正式 capture、refund 或 production scheduler 需要獨立人工核准與環境 gate。
- 環境變數範本在 root `.env.example` 與 `mobile/.env.example`。文件只記變數用途，不得複製真實值。

## 課堂展示部署

- 2026-09-10 確認的展示拓撲是：Android APK → Azure App Service 公開 HTTPS 網址 → Azure Database for PostgreSQL Flexible Server。Mobile 不直接連 PostgreSQL，所有身份、價格、權限與資料操作仍經 Backend。
- 此拓撲只用於非商業課堂展示，和 production 正式上線分開追蹤。App Service 免費層可能休眠且不適合作為可靠的常駐排程主機，因此展示環境預設關閉付款對帳、截止結算與取餐逾期背景排程。
- Backend 程式更新只需重新部署 App Service，不需要重打 APK。Mobile 目前尚未設定 EAS Update；完成初次設定與重新打包一次後，一般 JavaScript／畫面／圖片變更可線上更新，原生套件、Android 權限或 Expo SDK 變更仍需重新打包。
- 建立資源、環境變數、資料庫 migration（資料表版本更新）與驗收步驟見 `docs/azure-classroom-deployment.md`。Azure 資源已建立、Backend 已部署並驗證 `/health` 與資料庫讀寫 API 正常；Google 登入尚未在真機上實際驗證過、也尚未完成跨網路端對端驗證，不能把這兩項視為已完成。

## 開發、建置與驗證

- Root 使用 npm；`package.json` 負責 Backend、Mobile、database、unit test 與各領域 smoke scripts。Mobile 另有自己的 `package.json`，目前是 Expo SDK 51／React Native 0.74。
- `mobile/app.config.js` 的平台目標是 Android 與 Web。Android development build 使用 `expo run:android`；Web 使用固定本機 port 預覽。
- Repository 已有 Azure App Service 所需的 `npm start` 與課堂展示操作手冊，但尚未建立 Azure 資源，也沒有可確認的正式 release／store deployment pipeline；root 仍沒有 lint 或 typecheck script。不要把 Expo 開發 build、Web preview 或局部 smoke test 寫成 production build 驗證。
- `.maestro/` 有環境與登入 smoke flow，但檔案存在不代表本次或目前裝置已執行。驗證結果只記實際跑過的命令與觀察。

## 已知架構邊界

- `AppNavigator.js` 與 `backend/db.js` 都是大型集中檔案；這是目前實作現況，不等於每次任務都應順便重構。
- Mobile 同時存在 Backend-synced state、prototype cache 與少量 fixture；功能稽核必須逐條追蹤資料來源。
- PostgreSQL 是目前開發 Backend 的主要 runtime；在正式多人環境、真金流或 production deployment 前，仍需逐環境驗證連線設定、migration、備份、rollback 與啟用 gate。SQLite 相容路徑不得與 PostgreSQL 混用於同一筆交易。
