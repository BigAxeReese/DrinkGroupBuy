# DrinkGroupBuy 訂單流程開發分析與實作順序

最後更新：2026-08-05

## 文件目的

本文件整理目前訂單流程的實作狀態、下一階段建議開發順序、各階段依賴關係、主要風險，以及需要在特定階段前確認的未知問題。

實作更新：階段 0～5 的第一版已依本文件完成。階段 6 的 provider reconciliation、持久化 retry jobs 與 payment／settlement DB lease locking 已完成第一版；正式告警通知、多 process／sandbox 驗證、周邊狀態完整鎖定與 PostgreSQL runtime 仍屬正式環境工作。

2026-07-30 已恢復自動檢查並完成 SQL safety、五組核心 smoke、訂單 HTTP route smoke、Expo Doctor 與 Web bundle。Android 裝置 E2E、Firebase 正式設定驗證及 LINE Pay sandbox 人工端對端測試仍保留到發布驗證階段。

## 結論摘要

本次已依下列主線完成階段 0～5 第一版：

1. 先建立顧客與商家的後端權威訂單列表。
2. 再把顧客訂單頁改接後端。
3. 接著把商家後台的訂單數量、明細與履約狀態改接後端。
4. 訂單在雙方畫面都可穩定查詢後，再實作顧客退出／取消訂單。
5. 最後收斂取貨流程、付款 reconciliation、跨執行個體鎖定與 production migration。

上述順序先消除了訂單列表只依賴 `appState`、mock 與 localStorage 的主要風險，才加入取消狀態轉換。Provider reconciliation、持久化重試與跨執行個體 lease 已完成第一版，目前主線進入 PostgreSQL runtime 漸進搬移。

## 狀態定義

| 分級 | 定義 |
| --- | --- |
| 已完成第一版 | 主要程式與資料結構已存在，可作後續串接基礎；不等於完成正式環境驗證 |
| 部分完成 | 後端或 Mobile 已有部分串接，但仍依賴 mock、local state 或缺少列表／歷史資料 |
| 尚未完成 | 缺少必要 API、狀態轉換、權限或正式資料來源 |
| 待決策 | 商業規則尚未完全確認，實作前應先決定或採用文件中的暫定方案 |

## 一、目前訂單流程盤點

### 1. 已完成第一版

- 店家權威菜單查詢、商家菜單管理與明確客製化選擇上限。
- 建立訂單、更新尚未預授權的訂單、建立已授權訂單 revision。
- 送單時由 Backend 驗證飲品店家歸屬、販售狀態、客製化選項及選擇數量。
- 送單時由 Backend 重新計算單價、小計與訂單總額。
- 訂單品項與客製化選項保存交易快照。
- 單筆訂單查詢 `GET /api/orders/:orderId`。
- LINE Pay request、confirm、cancel、capture、void、重新付款與開發／補救用 refund 切片。
- Deadline settlement 單一 Backend process 排程與重試控制。
- 取貨逾期排程，以及標記可取餐、取貨碼查詢、核銷與顧客取貨憑證 API 程式碼。
- 敏感訂單、付款、結算與取貨操作保存 status history 或 audit log。
- 顧客與商家門市訂單列表、cursor 分頁、活動篩選、`lifecycleBucket` 與角色專屬 `availableActions`。
- 顧客登入、切換 active／history 分頁與 App 回到前景時的權威訂單同步。
- 顧客鎖單前取消訂單；包含冪等紀錄、authorized void、pending revision 終止、交易防競態與 audit log。
- 同一顧客／同一活動只能存在一張非取消訂單；由交易檢查與 partial unique index 雙重保護。

### 2. 部分完成

- `CustomerOrdersScreen` 與 `MerchantDashboardScreen` 已以 Backend 列表覆蓋相同範圍的舊 local 訂單，但 `appState` 仍保留作畫面 cache，部分非訂單活動畫面仍有 prototype fallback。
- 商家統計由 Backend 權威訂單列表計算，尚未另做獨立 aggregate summary API；目前資料量可接受。
- `PickupInfoScreen` 有部分取貨憑證串接，但訂單、活動和店家摘要仍混用 local state 或 mock。
- 團購活動列表已有 Backend API，但部分畫面仍可能使用啟動時的 prototype 資料。

### 3. 尚未完成

- 建立訂單的通用 request idempotency key；目前已禁止同一顧客重複加入同一活動，但尚未保存成功建立訂單的 client request key。
- 完整 revision 歷史查詢與取消 pending revision。
- Provider reconciliation 與 persisted jobs 已完成第一版；仍缺正式告警通知、sandbox 人工 E2E 與多 process 壓力測試。
- Payment／settlement／cancel／repay／pickup DB lease 已完成；兩個 Node.js 程序的 claim 與租約接管測試已通過。
- PostgreSQL runtime adapter 與正式 migration 流程。

### 4. 文件與程式碼差異

現有部分文件仍把取貨碼建立／驗證 API 列為未完成，但目前程式碼已存在以下路由或服務：

- 商家將團購標記為可取餐。
- 商家查詢取貨碼。
- 商家核銷取貨碼。
- 顧客查詢自己訂單的取貨憑證。
- 系統處理取貨逾期。

相關總覽文件已同步為既有 API 與第一版畫面串接；後續只做 E2E、補救權限或 QR Code 等增量工作，不應重做核心取貨服務。

## 二、建議開發依賴順序

```text
訂單分類與回應契約
        ↓
顧客／商家訂單列表 API
        ↓
顧客訂單畫面改接 Backend
        ↓
商家後台與履約畫面改接 Backend
        ↓
顧客退出／取消訂單
        ↓
取貨流程與歷史狀態收斂
        ↓
付款 reconciliation、跨執行個體鎖定、正式資料庫
        ↓
完整 E2E 與發布驗證
```

此順序的核心原則是：先讓雙方能看見相同的後端狀態，再增加會改變付款、杯數與履約結果的操作。

## 三、分階段開發計畫

### 階段 0：固定訂單分類與 API 回應契約

實作狀態：已完成第一版。

#### 目標

避免顧客畫面、商家畫面與 Backend 各自判斷「進行中」或「歷史」，導致同一訂單出現在不同分頁。

#### 建議設計

Backend 在列表回應直接提供：

- `lifecycleBucket`: `active` 或 `history`
- `availableActions`: 此登入角色目前可以執行的操作
- `status`
- `paymentStatus`
- `authorizationStatus`
- `pickupStatus`

`availableActions` 可包含：

- `pay`
- `repay`
- `edit`
- `cancel`
- `viewPickupCredential`
- `markReadyForPickup`
- `redeemPickup`

Mobile 只根據 Backend 回傳結果顯示按鈕，不自行重複實作 deadline、付款及取貨狀態判斷。

#### 建議的訂單分類

- 尚可付款、修改、重新付款、等待成團、製作中或等待取餐：`active`
- 已取消、已完成、已取餐或已逾期未取：`history`
- 請款失敗但仍在重新付款期限內：`active`
- 請款失敗且已超過重新付款期限：`history`

#### 完成條件

- 顧客與商家共用同一套分類函式或 SQL 條件。
- 回應欄位與狀態名稱記錄於 API 文件。
- Mobile 不再用不同函式自行推導同一訂單的分類。

### 階段 1：後端權威訂單列表

實作狀態：已完成第一版。

#### 目標

建立所有後續訂單畫面的單一資料來源。

#### 建議 API

```text
GET /api/customers/me/orders?scope=active|history&limit=20&cursor=
GET /api/merchant/stores/:storeId/orders?scope=active|history&activityId=&limit=20&cursor=
```

商家 route 以 `storeId` 作權限邊界，`activityId` 作可選篩選。這比只能查單一活動更適合目前商家後台同時顯示多個團購的需求。

#### 建議列表資料

- 訂單 ID、建立時間及更新時間。
- 團購 ID、標題、狀態、截止時間及取餐時間。
- 店家 ID、名稱與地址摘要。
- 訂單、付款、授權、取貨狀態。
- 原價、最終金額、已授權／已請款金額。
- 杯數、品項與客製化快照。
- Pending revision 摘要。
- 取貨憑證是否存在、是否可顯示、有效期限；列表不直接回傳完整取貨碼。
- `lifecycleBucket` 與 `availableActions`。
- 下一頁 cursor。

#### 權限

- 顧客只能查詢自己的訂單，customer ID 從 bearer token 推導。
- 商家只能查詢綁定門市的訂單。
- 商家只看顧客 public alias、訂單與履約必要資料，不回傳 private profile、電話或 email。
- Admin／補救權限不混入正式顧客或商家列表 route。

#### 建議修改範圍

- `backend/db.js`: 新增列表查詢、狀態分類、action 推導與 cursor 查詢。
- `backend/server.js`: 新增顧客與商家列表 route、參數驗證及權限檢查。
- `docs/api-candidates.md`: 固定 request／response 契約。
- `docs/current-progress.md`: 更新權威資料來源進度。

#### 完成條件

- 不提供 customer ID 時仍只能從登入者取得顧客身份。
- 商家跨店查詢會被拒絕。
- 同一訂單在顧客與商家 API 中的核心狀態一致。
- 列表能包含目前訂單、付款、revision、活動、店家及取貨摘要，不需 Mobile 再拼接多份 mock。

### 階段 2：顧客訂單畫面改接 Backend

實作狀態：已完成第一版。登入、active／history 分頁、App 回到前景及開啟訂單詳情皆有同步入口；同步失敗時保留上次 cache 並提供重試。

#### 目標

讓顧客重新開啟 App、重新登入或更換裝置後，仍能看到後端訂單，不依賴原裝置 localStorage。

#### 開發內容

- `apiClient.js` 新增顧客訂單列表查詢。
- 登入成功後載入顧客 active orders。
- 切換歷史分頁時載入 history orders。
- App 回到前景、付款 redirect 返回或完成 revision 後刷新列表。
- `CustomerOrdersScreen` 改用 Backend DTO。
- local state 僅作畫面 cache，不再作訂單權威來源。
- 店家、活動、付款與取貨摘要使用列表 API 回傳內容，不再依賴 mock store 查找。
- 補載入中、空資料、失敗重試及資料已更新提示。

#### 建議保留

- 購物車在送出前仍可保留 local state。
- 已成功建立的訂單必須以 Backend 回傳為準。
- 單筆 `GET /api/orders/:orderId` 繼續用於付款頁快速刷新詳細狀態。

#### 完成條件

- 清除 App localStorage 後重新登入，仍能看到 Backend 既有訂單。
- 顧客的進行中／歷史分頁完全依 Backend `lifecycleBucket` 分類。
- 付款、revision 或取貨狀態更新後，不需手動修改 local mock 才能顯示。

### 階段 3：商家後台與訂單履約改接 Backend

實作狀態：已完成第一版。門市訂單與歷史由 Backend 載入，統計從權威列表計算；標記可取餐與核銷取餐沿用既有 API。

#### 目標

讓商家看到的訂單數、付款數、待取餐數與訂單明細全部來自自己門市的 Backend 資料。

#### 開發內容

- `apiClient.js` 新增商家門市訂單列表查詢。
- `MerchantDashboardScreen` 移除以 `appState.orders` 計算權威統計的做法。
- 進行中／歷史訂單使用 Backend `lifecycleBucket`。
- 團購卡片顯示有效訂單數、已付款杯數、待製作、待取餐及已核銷數。
- 取貨碼查詢與核銷完成後重新刷新商家訂單列表。
- 標記活動可取餐後，以 Backend 回傳更新所有相關訂單及憑證摘要。
- 商家訂單畫面只顯示 public alias 與履約必要資訊。

#### 完成條件

- 商家重新登入後仍能看到門市訂單。
- 商家無法看到其他門市訂單。
- 顧客端與商家端對同一訂單顯示相同 payment／pickup 狀態。
- 核銷取貨後，商家列表與顧客列表都能從後端刷新為 `picked_up`。

### 階段 4：顧客退出團購／取消訂單

實作狀態：已完成第一版。`captured`／`refunded` 仍拒絕顧客自行取消，符合第一階段規則。

#### 為什麼排在列表之後

取消訂單會同時影響訂單、授權、團購有效杯數、容量、revision 與 audit log。必須先確保顧客和商家都能看到取消後的權威結果。

#### 建議 API

```text
POST /api/orders/:orderId/cancel
```

Body 建議包含：

```json
{
  "reason": "customer_withdrawal",
  "idempotencyKey": "client-generated-key"
}
```

#### 建議規則

- 只允許訂單本人操作。
- 截止前 30 分鐘鎖定後不得自行取消。
- `paymentStatus = pending`: 取消訂單，並讓 pending authorization 失效。
- `paymentStatus = authorized`: 先處理 void；成功後完成取消，失敗時保留可重試狀態，不可假裝已安全取消。
- `paymentStatus = captured`: 第一階段不允許顧客自行取消，需走店家協調或後端補救退款流程。
- 有 pending revision 時，取消訂單需一併終止 revision。
- 使用 transaction、idempotency key、status history 與 audit log。
- 取消成功後從有效杯數移除，但必須避免與 deadline settlement 同時執行造成 race condition。

#### 完成條件

- 重複送出相同取消 request 不會重複 void 或重複寫入狀態。
- 取消與截止結算同時發生時，只有一個流程取得有效狀態轉換權。
- 顧客與商家列表刷新後都能看到取消結果。

### 階段 5：取貨流程與歷史訂單收斂

實作狀態：已完成第一版契約與畫面串接；仍保留短碼方案，QR Code 與補救權限延後。

#### 目標

以現有取貨程式為基礎，統一 route、畫面與文件，而不是重新實作。

#### 開發內容

- 確認「標記可取餐」維持活動層級，或改成逐筆訂單層級。
- 顧客只有在 `pickupStatus = ready` 時才能取得有效取貨憑證。
- 列表只回傳憑證摘要；顧客進入取貨詳情時再查完整取貨碼。
- 商家查碼與核銷後刷新訂單列表。
- `picked_up`、`expired`、`cancelled` 與 `completed` 的歷史分類由 Backend 統一提供。
- 同步修正仍把取貨 API 標為未完成的文件。

#### 完成條件

- 取貨碼不可跨店核銷。
- 已核銷、已過期或無效的取貨碼不能重複使用。
- 顧客與商家能看到一致的取貨狀態及有效期限。
- 逾期未取會進入歷史列表，且不再顯示有效取貨碼。

### 階段 6：付款 reconciliation 與多執行個體安全

實作狀態：尚未完成，為下一個正式環境主線。

2026-07-30 更新：provider request status reconciliation、SQLite persisted jobs、worker lease claim、payment／settlement operation lock 與 terminal job 告警旗標已完成第一版，並通過隔離式 smoke。階段 6 仍未完成的部分是正式告警通知管道、cancel／repay／pickup 完整鎖定、多 process／sandbox 人工驗證，以及 PostgreSQL runtime。


#### 目標

處理正式環境中 redirect 遺失、Backend 重啟、provider 狀態不同步及多個 Backend process 同時執行的情況。

#### 開發內容

- Provider status query 與 reconciliation service。
- Redirect 遺失後由訂單頁主動恢復付款狀態。
- Persisted retry jobs，不只依賴單一 process timer。
- Capture、void、refund 失敗告警。
- Settlement、cancel、repay 與 pickup transition 的跨執行個體 locking。
- 建立訂單、付款 request、取消、退款的 idempotency 記錄。
- PostgreSQL runtime adapter 與正式 migration。

#### 完成條件

- Backend 重啟後仍能繼續處理待確認付款。
- 多個 process 不會重複 capture、void、refund 或 settlement。
- Provider 與本地狀態不一致時有可稽核的修復結果。

### 階段 7：測試與發布驗證（部分完成）

已完成自動 smoke、SQL safety、Expo Doctor 與 Web bundle；以下仍是正式發布前必要檢查點：

- Android 顧客完整流程。
- Android 商家完整流程。
- Firebase Google Login 正式設定與 UID mapping。
- LINE Pay sandbox 人工端對端測試。
- 斷線、重複點擊、redirect 遺失、App 重啟與 Backend 重啟情境。
- 訂單、付款、取貨及資料庫 migration 回歸驗證。

## 四、未知問題與建議答案

### A. 階段 1 前應確認

| 編號 | 未知問題 | 影響 | 建議暫定答案 |
| --- | --- | --- | --- |
| U-01 | 哪些訂單算進行中或歷史？ | 影響兩種角色的列表、統計與按鈕 | 由 Backend 回傳 `lifecycleBucket`；可重新付款的失敗訂單維持 active，超過期限才進 history |
| U-02 | 同一顧客能否在同一活動建立多張有效訂單？ | 影響重複 POST、容量與付款 | 第一階段只允許一張非取消訂單；重複建立回 `409` 與既有 `orderId` |
| U-03 | 列表是否需要分頁？ | 影響 API shape，之後補分頁會改 Mobile | 一開始就使用 cursor，預設 `limit = 20`，即使初期資料少也保留契約 |
| U-04 | 列表是否直接回傳取貨碼？ | 影響憑證曝光與列表安全 | 不回傳完整碼；只回傳是否存在、是否可顯示與有效期限，詳情頁再查 |
| U-05 | Merchant list route 以活動或門市為主？ | 影響商家首頁是否需要多次 API | 以門市為主，提供 `activityId` filter；可一次支援後台統計與活動明細 |

### B. 階段 4 前應確認

| 編號 | 未知問題 | 影響 | 建議暫定答案 |
| --- | --- | --- | --- |
| U-06 | 已授權訂單取消時，是先改訂單狀態還是先 void？ | 可能顯示已取消但授權仍存在 | 先取得取消鎖並執行／確認 void，再完成取消；失敗時保留明確 pending recovery 狀態 |
| U-07 | 已請款訂單能否由顧客自行取消？ | 涉及退款、店家損失與製作狀態 | 第一階段不允許；由店家協調或後端補救退款處理 |
| U-08 | Pending revision 存在時能否取消原訂單？ | 可能留下孤立 revision 或新授權 | 允許取消，但同一 transaction／workflow 必須終止 pending revision 與相關 pending authorization |
| U-09 | 取消原因是否自由輸入？ | 影響資料分析與稽核 | API 使用固定 reason code；可另加選填文字備註，但不把自由文字當狀態判斷依據 |

### C. 階段 5 前應確認

| 編號 | 未知問題 | 影響 | 建議暫定答案 |
| --- | --- | --- | --- |
| U-10 | 可取餐是活動一次標記，還是逐張訂單標記？ | 影響商家操作量與憑證顯示時機 | 先沿用目前活動層級標記；若未來需要分批製作，再新增逐單 ready，不在第一階段混用 |
| U-11 | 取貨碼採純文字、QR Code 或兩者？ | 影響畫面與掃碼套件 | 第一階段保留短碼輸入；QR Code 後續共用同一 credential，不改 Backend 驗證語意 |
| U-12 | 取貨逾期後是否允許商家補核銷？ | 影響歷史訂單與客服流程 | 正式顧客碼失效；補處理由後端補救權限與 audit log 執行，不讓一般商家直接改歷史狀態 |

### D. 可延後決定

| 編號 | 未知問題 | 建議處理時點 |
| --- | --- | --- |
| U-13 | Revision 是否要顯示完整每次修改歷史？ | 完成基本列表後，再做 order history API |
| U-14 | 歷史訂單保存多久？ | 正式隱私與資料保留政策階段 |
| U-18 | 何時切換 PostgreSQL？ | 列表與狀態契約穩定、進入多執行個體前 |

### E. 2026-07-30 已確認

- 通知第一階段採可持久化的 App inbox／delivery 狀態，手機 push 後續整合。
- 每杯預估與最終折扣均使用 `floor(級距總折扣 / 有效授權杯數)`；商家出資優惠的未分配尾差退回商家。
- 折扣級距必須在所有可達杯數下維持每杯至少 1 元，且不得高於最低可售單杯權威金額；活動發布、菜單降價／上架、訂單寫入、重新授權與結算都由 Backend 重驗。
- 第一階段由商家提出退款申請，營運／補救權限確認後執行，商家不直接呼叫 provider refund。
- 使用者可申請關閉帳號；登入立即停用，非必要個資刪除或去識別化，必要交易與稽核紀錄限制性保留。

## 五、風險排序

### 高風險

- 取消與 deadline settlement 的單一 SQLite process 競態已有交易與狀態條件保護；多執行個體仍是高風險。
- 已授權訂單取消但 LINE Pay void 失敗。
- 多個 Backend process 重複 capture、void、refund 或 settlement。
- 其他尚未改接列表 API 的 Mobile 畫面仍可能以 local state 顯示較舊活動摘要。
- 建立訂單已用 partial unique index 防止同活動重複有效訂單，但尚缺通用 request idempotency key。

### 中風險

- 顧客與商家用不同條件分類歷史訂單。
- Revision、付款與原訂單顯示不同步。
- 取貨碼在尚未 ready、已過期或已核銷後仍被顯示。
- 商家列表意外回傳顧客 private profile。
- 列表未預留 pagination，資料增加後被迫修改 API。

### 低風險但應一致

- 店家、活動與品項顯示名稱仍從 mock 查找。
- API error code 與 Mobile 中文提示不一致。
- 其他較舊的產品文件若新增或調整流程，仍需同步 API 與狀態命名。

## 六、下一個實際開發切片

階段 0～5 與可靠性核心已完成第一版；PostgreSQL 三個唯讀與建團／菜單／首次建單三個寫入切片也已完成真實 runtime 與 HTTP proof，接下來依序處理：


1. 搬移 PostgreSQL order detail／list 與 payment authorization request context。
2. 搬移 authorization confirm，使用 activity row lock 重驗容量並更新 authorized cups。
3. LINE Pay 核准後，以 sandbox 驗證 request reconciliation、capture／void 與 lease takeover。
4. 將 terminal job 的 `alert_required` 接到正式告警通知管道。
5. 補建立訂單與付款 request 的通用 idempotency 紀錄。

這個切片仍不包含正式通知系統、商家退款申請／營運審核 UI 與 QR Code；**退款申請與營運審核 API 本身（`refund_requests` 資料表、商家申請與核准／駁回端點）已於 2026-08-04 完成第一版**，只缺前端 UI。Request status reconciliation 已依 LINE Pay Online API v3 官方狀態語意實作；Android 實機、Firebase 正式設定、LINE Pay sandbox 人工 E2E 與多 process 驗證仍是發布前必要工作。

2026-08-05 另新增 ECPay 信用卡作為 LINE Pay 分離式請款審核卡關期間的備用付款 provider（後端與 mobile 第一版已完成並驗證，見 `docs/current-progress.md`）；本文件其餘關於付款流程的規劃內容維持 provider 中立，同樣適用於 ECPay。

## 七、預計主要修改檔案

本次階段 0～5 第一版實際修改：

- `backend/db.js`
- `backend/server.js`
- `mobile/src/utils/apiClient.js`
- `mobile/src/navigation/AppNavigator.js`
- `mobile/src/screens/CustomerOrdersScreen.jsx`
- `mobile/src/screens/MerchantDashboardScreen.jsx`
- `database/schema.sql`
- `database/migrations/001_initial_postgres.sql`
- `docs/api-candidates.md`
- `docs/current-progress.md`
- `docs/mobile-screen-data-requirements.md`
- `docs/open-questions.md`
- `docs/order-flow-development-plan.md`
- `docs/database-candidates.md`
- `docs/database-field-spec.md`

預計不修改：

- Firebase／Google Login 行為。
- 菜單管理規則。
- LINE Pay capture、void、refund 核心流程。
- Settlement scheduler。
- SQLite 既有資料與 seed。
- 取貨憑證核心服務。

## 最終建議

訂單查詢、取消與取貨的第一版主線已接到相同 Backend 狀態。後續不再擴張一般訂單 UI，而應先處理付款對帳、重啟恢復、多執行個體鎖定與正式資料庫，否則部署規模增加後仍可能發生重複請款或狀態分裂。

開發順序現已推進到：PostgreSQL 第一個唯讀切片 → 真實 PostgreSQL 驗證 → 後續唯讀／寫入 transaction → 完整測試與發布驗證。U-01 至 U-12 已採用本文件答案作為第一版實作基準；U-13 至 U-18 維持後續階段再決定。
