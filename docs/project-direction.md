# 專案方向

最後更新：2026-07-30

## 產品方向

DrinkGroupBuy 是一個全端開發的 Android-first 手搖飲團購 App。

- `mobile/`：React Native + Expo App，目前使用 Expo Web 作為開發預覽。
- `backend/`：Node.js HTTP API，預設使用 SQLite；顧客公開菜單與團購活動列表已有可切換 PostgreSQL 的唯讀切片。
- `database/`：包含 SQLite 開發 schema、seed data、測試資料庫，以及 PostgreSQL migrations／seed 草稿。
- `docs/`：記錄專案方向、需求、API、資料庫、狀態、未決問題與交接資訊。

目前系統仍在開發階段，還不是正式上線版本。

## 文件與命名規則

原則：**會影響程式、API、資料庫或工具辨識的內容使用英文；不影響實作的說明、報告文字與備註可使用中文。**

- 程式變數、函式、檔名使用英文。
- API method、path、request / response 欄位使用英文。
- API JSON 欄位使用英文 `camelCase`。
- 資料庫表名與欄位使用英文 `snake_case`。
- status value 使用英文，例如 `recruiting`、`authorized`、`ready_for_pickup`。
- SQL、環境變數、套件名稱、設定 key 使用英文。
- 專題報告、流程說明、畫面文案、註解與補充說明可使用中文。
- 若文件中的英文技術名稱不容易理解，應保留英文原名並加中文註解，不要直接翻掉。

範例：

```text
中文說明：團購活動
API：groupBuyActivity
資料庫：group_buy_activities
```

## 資料庫方向

- 現階段開發資料庫：SQLite。
- 未來正式資料庫目標：PostgreSQL。
- Firebase 不是主要資料庫方向。
- Firebase 目前決定只規劃用於 Auth / Google Login，不作為主要交易資料庫。
- 付款、訂單、團購結算、稽核紀錄、授權狀態都應由後端與資料庫控制。

## 登入方向

- 正式登入方向：Firebase Auth + Google Login。
- 開發測試方向：優先使用 Firebase Google 測試帳號；若 Google 帳號不足，本機可用 dev-only 身份切換器測顧客、商家，以及必要的後端補救權限。
- 正式角色與權限由 backend database 判斷，不由前端自行決定。
- Mobile 取得 Firebase ID token 後，應交給 backend 驗證。
- Backend 驗證 Firebase ID token 後，再查 `users`、`user_roles`、`merchant_users` 決定使用者身份。
- 使用 Firebase Auth 時，backend `users.firebase_uid` 是對應 Firebase 使用者的正式欄位。
- LINE Pay secret、訂單狀態、付款狀態、團購結算不可放在 mobile 或 Firestore 前端直寫流程。

## 目前已串接的範圍

已完成第一版串接：

- 商家建立團購活動：Mobile -> API -> SQLite。
- 顧客公開菜單與團購活動列表查詢：Mobile／API 使用 SQLite（預設）或 PostgreSQL（各自獨立開關）；Mobile 首頁仍待完整串接活動 API，商家菜單管理與活動寫入仍為 SQLite。
- 顧客建立、修改、revision、列表與取消訂單：Mobile -> API -> SQLite。
- 商家查看門市訂單、標記可取餐、查碼與核銷取貨：Mobile -> API -> SQLite。
- LINE Pay request、confirm、cancel、capture、void、重新付款與開發／補救用 refund。
- Deadline settlement 與 pickup expiration 的單一 Backend process scheduler。

仍未完全由 Backend 或正式環境驅動：

- 團購活動首頁、地圖與部分店家摘要仍使用 mobile local state 或 mock。
- 購物車仍是 Mobile local state；送單、改單與重新授權前由 Backend 重新驗證。
- LINE Pay reconciliation、持久化 retry、admin 警示查詢及 payment／settlement／cancel／repay／pickup DB lease 已完成；兩程序 lease 測試已通過，尚缺正式通知與核准後的 Sandbox 人工驗證。
- PostgreSQL reliability schema parity、`pg`、adapter、公開菜單與團購活動列表唯讀 repositories 已完成；真實 PostgreSQL 16 runtime 與兩個 HTTP source proofs 已通過，其餘 route 仍使用 SQLite。
- Android、Firebase 正式設定與 LINE Pay sandbox 人工 E2E 尚未完成。

## 架構原則

1. 新的後端與資料庫設計使用 `groupBuyActivity` / `group_buy_activity` 命名。
2. Mobile prototype 的主要 state、route、screen 與 mock 已改用 `groupBuyActivity`；舊 `deal` 名稱只允許作本機儲存相容或測試資料表脈絡。
3. Mobile 與 API 欄位使用 `camelCase`。
4. 資料庫表名與欄位使用 `snake_case`。
5. 機密資料只放在本機 `.env` 類檔案，不提交到 Git。
6. 金流維持 sandbox / 測試模式，正式扣款前必須再確認。
7. 涉及狀態改變的操作要有驗證、交易、idempotency 與歷史紀錄。

## 舊版注意事項

舊版 Web frontend、root `server.js`、`src/`、`data/` 已刪除。

除非明確要求，不要恢復：

- `frontend/`
- root `server.js`
- root `src/`
- root `data/`

## 2026-07-05 登入方向更新

- 正式登入只使用 Firebase Auth + Google Login。
- 新的正式產品流程不得以手機密碼、email 密碼或前端角色選擇作為登入設計。
- 目前的密碼登入與角色選擇 UI 只屬於開發相容功能；Firebase 登入可用後，應移除或隱藏。
- Mobile app 流程：使用者點選 Google Login -> Firebase 回傳 ID token -> mobile 將 ID token 送到 backend -> backend 驗證 Firebase token -> backend 依 `users`、`user_roles`、`merchant_users` 對應使用者身份。
- Firebase 只用於身份驗證。Firestore 不是本專案主要業務資料庫。
- 顧客、商家角色、店家權限、團購活動、訂單、付款、取貨憑證、狀態歷史與 audit logs 都以 backend database 為準；admin 相關能力僅作開發或後端補救工具，第一階段正式 App 不提供管理員流程。
- 資料庫方向：使用 `users.firebase_uid` 作為穩定對應 Firebase identity 的正式欄位。

## 開發期角色測試策略

- 正式環境規則：使用者永遠不能在 mobile app 手動選擇角色。
- 開發環境規則：優先用不同 Firebase Google 測試帳號登入，並透過 `users.firebase_uid` 對應不同測試角色。
- 角色判斷必須在 backend/database 完成，不由 mobile UI 選擇。
- 建議 seed 對應：
  - customer A Google 測試帳號 -> customer A 的 `users.firebase_uid` -> `user_roles.role = customer`
  - customer B Google 測試帳號 -> customer B 的 `users.firebase_uid` -> `user_roles.role = customer`
  - merchant store 001 Google 測試帳號 -> merchant 001 的 `users.firebase_uid` -> `user_roles.role = merchant` 與 `merchant_users.store_id = store-001`
- 若需要測後端補救工具，可另行對應 dev/admin 測試帳號；不列入第一階段正式 App 流程。
- 若測試帳號不足，只在本機開發時可使用明確由環境變數開啟的 dev-only 身份切換器；backend 需設定 `AUTH_DEV_MODE=true`，mobile 需設定 `EXPO_PUBLIC_AUTH_MODE=dev`。
- dev-only 身份切換器不得預設啟用，也不得用於 production build。
