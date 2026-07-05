# 專案方向

最後更新：2026-07-05

## 產品方向

DrinkGroupBuy 是一個全端開發的 Android-first 手搖飲團購 App。

- `mobile/`：React Native + Expo App，目前使用 Expo Web 作為開發預覽。
- `backend/`：Node.js HTTP API，目前先連接開發用 SQLite 資料庫。
- `database/`：目前包含 SQLite 開發 schema、seed data、測試資料庫，以及 PostgreSQL 遷移草稿。
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
- 開發測試方向：保留 dev mock login，方便切換顧客、商家與管理員身份。
- 正式角色與權限由 backend database 判斷，不由前端自行決定。
- Mobile 取得 Firebase ID token 後，應交給 backend 驗證。
- Backend 驗證 Firebase ID token 後，再查 `users`、`user_roles`、`merchant_users` 決定使用者身份。
- 使用 Firebase Auth 時，backend `users.firebase_uid` 是對應 Firebase 使用者的正式欄位。
- LINE Pay secret、訂單狀態、付款狀態、團購結算不可放在 mobile 或 Firestore 前端直寫流程。

## 目前已串接的範圍

已經有部分端到端流程：

- 商家建立團購活動：Mobile -> API -> SQLite。
- 管理員取消團購活動：Mobile -> API -> SQLite soft cancellation。
- 後端可從 SQLite 讀取團購活動列表。
- LINE Pay sandbox 預授權流程已開始串接。

仍有部分功能還在 mobile local state 或 mock 狀態：

- 購物車完整後端同步。
- 顧客訂單列表與訂單修改完整後端同步。
- LINE Pay capture / void / refund / webhook。
- 商家接單、完成訂單、取貨憑證 API。
- App 啟動時完整載入後端活動、菜單與訂單。

## 架構原則

1. 新的後端與資料庫設計使用 `groupBuyActivity` / `group_buy_activity` 命名。
2. 既有 mobile prototype 可能仍有 `deal` 變數，但新介面不要繼續擴大這個命名。
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

## 2026-07-05 Login Direction Update

- Formal authentication is Firebase Auth with Google Login only.
- Do not design new production flows around phone/password, email/password, or role-select login.
- The current password login and role-select UI are legacy development compatibility and should be removed or hidden once Firebase login works.
- Mobile app flow: user taps Google Login -> Firebase returns an ID token -> mobile sends the ID token to backend -> backend verifies the Firebase token -> backend maps the Firebase user to `users`, `user_roles`, and `merchant_users`.
- Firebase is for authentication only. Firestore is not the primary business database for this project.
- Backend database remains authoritative for customer/merchant/admin roles, store permissions, group-buy activities, orders, payments, pickup credentials, status history, and audit logs.
- Required database direction: use `users.firebase_uid` as the canonical stable Firebase identity field.

## Development Role Testing Strategy

- Production rule: users never choose a role manually in the mobile app.
- Development rule: test different roles by signing in with different Firebase Google test accounts whose Firebase UIDs are mapped in `users.firebase_uid`.
- Role selection must happen in backend/database, not in the mobile UI.
- Recommended seed mapping:
  - customer A Google test account -> `users.firebase_uid` for customer A -> `user_roles.role = customer`
  - customer B Google test account -> `users.firebase_uid` for customer B -> `user_roles.role = customer`
  - merchant store 001 Google test account -> `users.firebase_uid` for merchant 001 -> `user_roles.role = merchant` and `merchant_users.store_id = store-001`
  - admin Google test account -> `users.firebase_uid` for admin -> `user_roles.role = admin`
- For local development only, a Firebase Auth emulator or explicitly gated dev-auth bypass may be used, but it must be disabled unless `AUTH_DEV_MODE=true` or equivalent is set in local `.env`.
- Dev-auth bypass must never be enabled by default and must never be used for production builds.
