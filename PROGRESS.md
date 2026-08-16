---
updated: 2026-08-15
---

## 身份驗證與角色 [進行中]
- Firebase Auth + Google 登入 [完成]
  - Mobile 端 [完成] — Google 登入畫面，取得 Firebase ID token 送到 backend
  - Backend 端 [完成] — 驗證 ID token，依 users/user_roles/merchant_users 判斷身份
- Firebase Console／OAuth／UID mapping 與 Android 實機 E2E [待處理] — docs/AI-current-progress.md 模組化進度表列為未完成

## 團購與活動探索 [進行中]
- 店家地圖 [完成] (8/4)
  - Mobile 端 [完成] — Android/Web 地圖顯示，mock 檔已移除
  - Backend 端 [完成] — `GET /api/stores`
- 團購活動列表與折扣試算（級距／預估折扣／尾差） [完成]
  - Mobile 端 [完成] — 首頁、活動詳情、地圖顯示折扣摘要
  - Backend 端 [完成] — 折扣試算與活動列表 API，核心運算（`backend/pricing/groupBuyDiscount.js`）有 35 個自動化測試，`npm test` 剛實測執行全數通過
- 附近公里數篩選、正式定位隱私流程 [待處理]
- Android 地圖實機 E2E [待處理]

## 金流 [進行中]
- LINE Pay 付款 [進行中]
  - Mobile 端 [完成] — 付款畫面、輪詢、deep link 回跳
  - 顧客／商家付款狀態文案分離 [完成] — `authorized` 顧客端顯示「訂單成立」、商家端顯示「已付款」；`failed` 商家端顯示灰色「待付款」。已加入 3 個 Mobile 文案契約測試，`npm test` 於 2026-08-15 實測共 42 項全數通過
  - 付款狀態文案 Android UI 人工覆核 [待處理] — 尚未實際開啟顧客訂單／付款頁與商家訂單畫面確認最終排版；不可把自動測試視為 UI E2E
  - Backend 端：Request／Confirm／Cancel／Capture／Void／Refund 模組 [完成]
  - 付款前取餐／逾期未取規則同意 [進行中]
    - Mobile 與 Backend 串接 [完成] — 顯示 Backend 現行全文／版本，未勾選不能付款；Backend 保存 `order_rule_consents` 後才呼叫 LINE Pay
    - SQLite 與 PostgreSQL schema [完成] — SQLite runtime + PostgreSQL `005` migration
    - 自動測試 [完成] — 缺少／過期同意、保存失敗、管理員代同意與 SQLite append-only／完整性已驗證
    - Android + LINE Pay sandbox 人工 E2E [部分完成] (8/15) — Android 長文排版、未勾選停用、勾選後送出，以及抵達 LINE Sandbox 登入頁已人工驗證；資料庫保存 1 筆 v1.0 規則全文快照與 1 筆 pending 預授權。尚未輸入 LINE 測試帳密或執行授權 confirm／App 回跳，因此不可視為完整付款 E2E
    - ECPay 同意 gate [待處理] — ECPay UI 目前隱藏，不列入本切片已完成範圍
  - 分離式請款 Sandbox 人工端對端驗證 [完成] (8/8) — docs/line-pay-separated-capture-sandbox-checklist.md LP-01/02/04/07/08/09/10 全數通過
  - Provider reconciliation ＋ 持久化工作佇列 ＋ lease-based claim [完成] (7/30)
  - `reliabilityService.js` terminal job 告警日誌 [完成] (8/15) — 函式位於正確模組層級，已補 2 個單元測試驗證只輸出 `alertRequired` 工作；正式外部通知管道仍待處理
  - 付款結算 smoke test [完成] (7/19) — `npm run settlement:smoke`
  - 正式告警通知管道 [待處理]
- 商家退款申請 [進行中]
  - Backend 端 [完成] (8/4) — 申請／審核 API（pending/approved/rejected），`npm run refund-request:smoke` 涵蓋申請、重複阻擋、核准、駁回
  - Mobile 端：商家／營運審核 UI [待處理]

## 訂單流程 [進行中]
- 截止後最終結算結果 [完成] (8/15)
  - Backend 活動 API [完成] — SQLite／PostgreSQL 都回傳不可變 `settlement` 快照
  - Mobile 團購進度 [完成] — 顯示最終有效杯數、最終每杯折扣、訂單實際應付、訂單折扣與未分配尾差
  - 自動測試 [完成] — 最終快照資料契約與 PostgreSQL read repository smoke 已通過
  - Android UI 人工覆核 [待處理] — 尚未由使用者在模擬器檢查小螢幕排版
- 菜單與購物車 [完成]
  - 顧客權威菜單 API 與客製化選項 [完成]
    - Mobile 端 [完成] — `StoreMenuScreen`／`DrinkSelectionScreen` 已改讀後端菜單
    - Backend 端 [完成]
  - 商家菜單管理 [完成]
    - Mobile 端 [完成] — 商家菜單管理畫面
    - Backend 端 [完成] — 菜單管理 API
  - 購物車客製化摘要（含尺寸） [完成] (8/9)
  - 訂單建立／更新驗證（防竄改、防超賣、快照） [完成]
- 訂單修改（Revision） [進行中]
  - 改單與重新預授權 [進行中]
    - Mobile 端 [完成] — 購物車／訂單明細修改觸發 revision，付款頁帶 `orderRevisionId`
    - Backend 端 [完成] — `POST /api/orders/:orderId/revisions` 建立 pending revision
  - 失敗提示細化 [進行中] — 已以 Backend 為權威來源，提示文案待細化
- 取貨與逾期 [進行中]
  - 取貨憑證建立／驗證／逾期排程 [完成] — `npm run pickup-expiration:smoke` 驗證
  - Android 實機 E2E [待處理]

## 平台維運 [進行中]
- PostgreSQL 遷移 [進行中]
  - Auth／公開菜單／活動／訂單讀取 [完成]
  - 商家建團／菜單／顧客首次建單 [完成] (7/31) — 跨連線 HTTP proof 驗證
  - Capture／結算 [完成] — postgres smoke test 驗證，已接 server route
  - 改單／退款／取貨憑證（004 migration） [完成] (8/12) — 對應 repository 與 smoke test 驗證，過程中修正 3 個真實 bug
  - 統一 migration runner（`database/migrate.js`） [完成] (8/12)
  - Production 正式部署（備份、staging、rollback） [待處理]
- 資安審查 [進行中]
  - 付款／訂單修改／取貨憑證相關改動審查 [完成] (8/11) — 見 docs/AI-security-review-log.md，未發現達門檻的漏洞
- 依賴套件安全 [進行中]
  - `npm audit fix`（非強制） [進行中] — Root 11 項（6 中 5 高）、Mobile 46 項（1 低 11 中 33 高 1 重大），剩餘需 Expo／React Native 主版本升級

## 系統分析書 [進行中]
- 五大功能分類與描述性綱目 [完成]
- 各小節使用個案描述與活動圖 [待處理]

## 非正式與備援功能 [進行中]
- 本機開發身份切換器（dev-only） [完成] — README／AI-current-progress.md 明講「這不是正式產品角色選擇」
  - Mobile 端 [完成] — 本機測試身份下拉選單
  - Backend 端 [完成] — `AUTH_DEV_MODE` 閘門與 dev-session API
- ECPay 信用卡付款（備援） [進行中] — 文件明講是 LINE Pay 審核卡關時的備用方案，LINE Pay 已核准後優先度降低
  - Mobile 端 [完成] — 付款方式選擇 UI
  - Backend 端 [完成] — request／webhook／capture／void／refund，真實 HTTP + `mock_ecpay` smoke test 驗證
  - ECPay Stage 真實環境人工端對端驗證 [待處理] — docs/ecpay-checkout-stage-checklist.md EC-01~08 尚未執行，只驗證過 mock
