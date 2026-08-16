# 系統架構

最後更新：2026-08-16

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
  └─ repository or SQLite gateway
          ↓                         ↓
SQLite development runtime    PostgreSQL controlled slices
          ↓                         ↓
LINE Pay / ECPay / Firebase Admin / scheduler workers
```

Mobile 不直接連資料庫或付款 provider。Backend 是身份、價格、容量、狀態轉換與敏感操作的權威邊界。

## Mobile

- 入口是 `mobile/App.jsx`，載入 `mobile/src/navigation/AppNavigator.js`。沒有使用 React Navigation；`AppNavigator` 自行維護 stack、角色、選定門市、活動、訂單、付款與購物車 state，並以條件渲染 screen。
- Screen 依顧客、店家與開發補救流程分布在 `mobile/src/screens/`；共用視覺元件在 `mobile/src/components/`。Platform-specific 地圖使用 `LiveMapScreen.native.jsx` 與 `LiveMapScreen.web.jsx`。
- `mobile/src/utils/apiClient.js` 集中呼叫 Backend 並保存目前 bearer token。App 在登入、切換角色、回到前景及部分畫面操作時重新同步店家、活動或訂單。
- 活動、店家與訂單逐步以 Backend 回應覆蓋畫面 state；購物車仍是 Mobile local state。Web 可由 `prototypeStorage.js` 存入 `localStorage`，這只是 prototype cache，不是跨裝置資料庫或最終 API contract。
- `mobile/src/mock/` 仍有身份、初始訂單、付款與地圖預設等 fixture。判斷某功能資料來源時，必須沿 import 與 action 追蹤，不能因 mock 檔仍存在就判定 runtime 使用它。
- LINE Pay／ECPay 結果可經 Backend HTML 落地頁回到 app deep link；Mobile 同時保留 polling、foreground refresh 與手動刷新作備援。

## Backend

- `backend/server.js` 使用 `node:http` 建立 server，集中做 path/method dispatch、輸入解析、authentication、role/store authorization、runtime 一致性檢查與錯誤回應；目前沒有 Express 或其他 Web framework。
- 核心領域邏輯分到 `backend/payments/`、`backend/pricing/`、`backend/pickup/`、`backend/reliability/`。新的複雜規則應維持 service／repository 邊界，不再把整段流程塞回 route dispatcher。
- `backend/db.js` 是既有 SQLite gateway，包含 schema compatibility 與多數交易操作。`backend/database/repositories/` 為可切換 SQLite／PostgreSQL 的切片；adapter 介面在 `backend/database/`。
- Server 啟動後可執行 payment reconciliation、deadline settlement 與 pickup expiration scheduler。這些 worker 會處理長時間付款／結算狀態，不能以 Mobile 是否開啟作為可靠性前提。

## Database 與 runtime 切換

- SQLite schema 的權威檔是 `database/schema.sql`，預設本機檔案是被 Git 忽略的 `database/drink-group-buy-dev.sqlite`。精確欄位說明只維護在 `docs/AI-database-field-spec.md`。
- PostgreSQL migrations 在 `database/migrations/`，由 `database/migrate.js` 依版本套用。`database/test/` 只是測試／匯出工具，不是正式 schema source。
- Repository 以各自的 `*_RUNTIME` 變數選擇 SQLite 或 PostgreSQL。Server 會要求相依的 read/write/payment slices 一致切換；設計目標是不雙寫，也不讓單一交易跨兩個 runtime 拼接。
- `DATABASE_RUNTIME` 是通用 adapter 的選擇值，但實際 server 行為仍要檢查各 repository 的 runtime consumer，不能只看一個環境變數或文件敘述。
- `db:init`、`db:seed` 與部分 smoke scripts 會替換本機開發 SQLite。Inspection 一律唯讀；任何 mutation 先備份，完成後跑 integrity 與 foreign-key checks。

## Authentication 與 authorization

- 正式 Mobile 流程使用 Firebase Auth + Google Login；Mobile 把 Firebase ID token 送至 `POST /api/auth/firebase-session`。
- Backend 由 Firebase Admin 驗證 token，再從資料庫解析使用者角色與店家關係，最後簽發本專案 bearer token。角色與 `storeId` 不信任 client 自報值。
- 舊密碼 login 與 dev-session 是開發相容路徑。Dev identity 只有 `AUTH_DEV_MODE=true`、非 production 且 Mobile `EXPO_PUBLIC_AUTH_MODE=dev` 時才可使用。
- Admin／營運能力目前主要是開發或補救邊界；不能因畫面或 route 存在就視為 production 身份模型已完成。

## 付款、結算與取餐

- LINE Pay request／confirm／cancel、capture／void／refund 與重新付款由 `backend/payments/linePayService.js` 協調；provider 簽章與 secret 僅在 Backend。
- ECPay 有獨立 client/service 與 webhook／return flow，定位為備援 provider。兩個 provider 共用資料庫狀態與部分 App 跳轉概念，但不能假設 provider 行為完全相同。
- 訂單送出、revision、付款前規則同意、provider 操作、截止結算與退款都需要 Backend 權威金額、idempotency、transaction／row lock 或 operation lease，以及 status／audit 紀錄。
- Provider redirect 不是唯一真相；Backend 以資料庫狀態、provider reconciliation 與持久化 reliability job 收斂結果。
- 取餐憑證的建立、查詢、核銷與 expiration 由 pickup service／repository 與 scheduler 處理。

## 外部整合與環境

- Firebase：Mobile 公開 config + Google OAuth client ID；Backend Firebase Admin credential。
- Google Maps／Location：Android 使用 native map 與 foreground location；Web 使用 Google Maps JavaScript API 與瀏覽器 geolocation。Dev-only 位置控制必須同時受 build/auth mode 限制。
- LINE Pay／ECPay：只由 Backend 保存 provider credential、簽章並呼叫 API。正式 capture、refund 或 production scheduler 需要獨立人工核准與環境 gate。
- 環境變數範本在 root `.env.example` 與 `mobile/.env.example`。文件只記變數用途，不得複製真實值。

## 開發、建置與驗證

- Root 使用 npm；`package.json` 負責 Backend、Mobile、database、unit test 與各領域 smoke scripts。Mobile 另有自己的 `package.json`，目前是 Expo SDK 51／React Native 0.74。
- `mobile/app.config.js` 的平台目標是 Android 與 Web。Android development build 使用 `expo run:android`；Web 使用固定本機 port 預覽。
- Repository 沒有可確認的正式 release／store deployment pipeline，也沒有 root lint 或 typecheck script。不要把 Expo 開發 build、Web preview 或局部 smoke test 寫成 production build 驗證。
- `.maestro/` 有環境與登入 smoke flow，但檔案存在不代表本次或目前裝置已執行。驗證結果只記實際跑過的命令與觀察。

## 已知架構邊界

- `AppNavigator.js` 與 `backend/db.js` 都是大型集中檔案；這是目前實作現況，不等於每次任務都應順便重構。
- Mobile 同時存在 Backend-synced state、prototype cache 與少量 fixture；功能稽核必須逐條追蹤資料來源。
- SQLite 仍是開發預設，PostgreSQL 是受控切片方向；在正式多人環境、真金流或 production deployment 前，仍需逐環境驗證 runtime 組合、備份、rollback 與啟用 gate。
