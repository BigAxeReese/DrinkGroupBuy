---
updated: 2026-08-27
---

## 身份驗證與角色 《第一階段》 [進行中]
> 決定使用者是誰、能用哪些功能——例如是一般顧客還是店家老闆，登入之後系統要怎麼分辨身份。
- Firebase Auth + Google 登入 [完成]
  > 讓使用者可以直接用自己的 Google 帳號登入，不用另外設一組新密碼；背後用 Google 官方的身份驗證服務（Firebase Auth）確認身份是真的。
  - Mobile 端 [完成] — Google 登入畫面，取得 Firebase ID token 送到 backend
  - Backend 端 [完成] — 驗證 ID token，依 users/user_roles/merchant_users 判斷身份
- Firebase Console／OAuth／UID mapping 與 Android 實機 E2E [待處理] — repository 只有設定需求與程式切片，沒有目前環境已完成端對端驗證的證據
  > 正式上線前要在 Google 的管理後台（Firebase Console）完成登入相關設定，並且要用真的 Android 手機實際測試一次完整登入流程，不只是在電腦模擬器上測。

## 團購與活動探索 《第一階段》 [進行中]
> 顧客瀏覽附近有哪些店家、有哪些手搖飲團購活動可以參加的畫面與功能。
- 店家地圖 [完成] (8/4)
  > 用地圖顯示附近有哪些店家，顧客可以直接在地圖上找店家、看活動。
  - Mobile 端 [完成] — Android/Web 地圖顯示，mock 檔已移除
  - Backend 端 [完成] — `GET /api/stores`
- 團購活動列表與折扣試算（級距／預估折扣／尾差） [完成]
  > 列出目前有哪些團購活動，並即時算出「現在湊了幾杯」對應的折扣——級距指的是「滿幾杯打幾折」的門檻，尾差是湊不滿下一個門檻時多出來的零頭金額怎麼分攤。
  - Mobile 端 [完成] — 首頁、活動詳情、地圖顯示折扣摘要
  - Backend 端 [完成] — 折扣試算與活動列表 API，核心運算（`backend/pricing/groupBuyDiscount.js`）有 35 個自動化測試，`npm test` 剛實測執行全數通過
- 取餐結束時間改為系統自動計算 [完成] (8/20)
  > 團購的「取餐結束時間」不是店家自己設定的欄位，固定為取餐開始後 3 小時；若店家有設定打烊時間，取餐開始時間不能晚到讓這 3 小時超過打烊。
  - Backend 端 [完成] — 建立團購活動 API 不再接受店家傳入取餐結束時間，改由後端固定算為取餐開始 + 3 小時（`backend/server.js` 的 `computeActivityPickupEndAt`）；新增 `stores.pickup_closing_time` 欄位（`HH:MM`，可為 NULL＝24 小時營業）與對應驗證邏輯（`backend/pickup/pickupWindow.js`，SQLite／PostgreSQL 兩條寫入路徑皆有接上），4 個新單元測試與既有 `npm test`（63 項）全數通過；已用真實 PostgreSQL 16 手動驗證「允許」「拒絕」「剛好卡在打烊前 3 小時邊界」三種情境皆正確，驗證後已把測試值改回 NULL 避免影響其他既有測試對「取餐時間沒有上限」的假設
  - Mobile 端 [完成] — 商家建立團購畫面移除「取餐結束」選擇欄位，只保留「取餐開始」；連帶修正原本容易誤讀成「取餐結束」的既有提示文字（其實指的是上方「結束時間」＝團購截止時間）；新增後端拒絕時的中文錯誤訊息（顯示店家打烊時間與最晚可設定的取餐開始時間）
  - 已知缺口 [待處理] — 目前沒有商家介面可以設定 `pickup_closing_time`，只能透過資料庫直接設值；所有既有店家目前都是 NULL（不設上限）
- 建立團購活動的開始／截止時間下限 [完成] (8/27) — 真機測試時發現 `validateCreateActivity` 完全沒擋「開始時間在過去」與「截止時間緊接開始時間」（曾成功建立一場僅 3 分鐘的團購）。補上兩條檢查：`startAt` 不得早於當下（allow 60 秒誤差吸收請求延遲，手機建團畫面本來就固定送出當下時間，這條主要擋直接打 API 的情況）；`deadlineAt` 與 `startAt` 至少間隔 30 分鐘（沿用系統既有的 30 分鐘緩衝單位，純防呆下限，不是建議時長）。決策記錄見 `docs/open-questions.md`「團購活動與優惠」；已對真實 PostgreSQL 手動重啟後端驗證新規則生效，`node --check` 通過，`mobile` 測試套件 34/34 全過
  > 商家建立團購時，系統應該擋掉明顯不合理的時間設定（開始時間設在過去、或整場團購只開幾分鐘），避免顧客根本來不及參加。
- 商家自助取消團購 [進行中]
  > 團購截止前，商家自己可以取消已發布的活動；系統會一併取消底下的訂單，並退還顧客還沒正式請款的預付款項。之前只有工程師用的後台工具能取消，而且不會處理訂單和退款，等於是半成品。
  - Backend 端 [完成] (8/17) — 新增取消 API，含店家歸屬檢查、截止前 30 分鐘鎖定、逐筆取消訂單並撤銷 LINE Pay／ECPay 預授權；2 個新自動化 smoke test（含撤銷失敗情境）與既有完整測試套件全數通過，並完成一次安全審查（見 `docs/AI-security-review-log.md`）
  - Mobile 端 [進行中] (8/17) — 商家後台加了取消按鈕與填寫原因表單，基本流程（空白原因擋下、取消成功、顧客端同步顯示已取消、鎖定窗口內按鈕停用）已在瀏覽器人工操作驗證過。但後來為修正 code review 問題而調整的「只標記真的取消成功的訂單」「部分失敗時顯示對應提示」這兩處，只驗證到自動化測試層級，還沒有重新用瀏覽器實際操作確認畫面顯示正確
  - 管理員取消團購入口 [完成] (8/22) — 底層連動邏輯（訂單取消／付款作廢／audit log）沿用 8/20 已驗證過的版本，未再改動；這次只把入口從手機 App 裡的開發用畫面搬到獨立的 `/admin` 網頁後台（見下方「管理員網頁後台」），手機 App 端不再有任何管理員畫面。已用真實 HTTP 請求（含 CSRF token 驗證、session 驗證、對不存在的活動 ID 觸發並確認正確回傳錯誤訊息）人工驗證新入口本身接得起來，未實際對真實資料觸發一次成功取消
    > 工程師/營運人員取消團購用的入口，取消團購時會一併取消底下的訂單、撤銷已經預先鎖定的顧客付款，避免留下資料兜不起來的訂單。
- 附近公里數篩選 [完成]
  > 讓顧客可以依照目前位置的公里數篩選店家與團購，跟「跟手機要真實定位權限」是分開的兩件事——這裡先做篩選邏輯，還沒有真的請求手機定位。
  - 距離計算工具 [完成] (8/17) — 新增座標距離計算與格式化函式，5 個單元測試涵蓋已知座標、缺座標、公尺／公里格式化邊界，`npm test` 全數通過
    > 算出顧客目前位置跟每個店家距離幾公里的核心邏輯，給篩選功能用。
  - 即時地圖／首頁附近推薦列表串接 [完成] (8/19) — Android 模擬器人工操作＋比對真實店家座標計算的實際距離，確認篩選邏輯正確（6 間測試店家全在 0.723 公里內，「1 公里」與「不限」結果理應相同，非 bug）；程式碼核對 `visibleMapStores`／`recruitingGroupBuyActivitiesWithDistance` 篩選與排序邏輯正確；因目前資料庫沒有招募中的團購活動，首頁列表本身尚未有畫面上的排序／篩選人工比對案例
    > 把「距離計算工具」接到地圖畫面跟首頁推薦列表上，讓使用者在畫面上真的看得到、用得到公里數篩選。
  - 即時地圖篩選面板（招募中開關／優惠門檻／取餐時間） [完成] (8/25，8/25 跑過 `/code-review` 並修復) — 依 `system-analysis/藍圖.docx` 4.1.2.2 規格，把地圖畫面的距離篩選升級成完整篩選面板：只看招募中開關（預設關閉，維持既有「預設顯示全部店家」行為）、搜尋半徑（點按式級距，不限排最前與其餘兩個篩選一致）、優惠門檻（不限／滿10／20／30杯）、取餐時間（不限／30分鐘內／1小時內，已過期不算）；優惠門檻與取餐時間兩者同時設定時，要求同一筆可加入活動同時滿足兩個條件，不是各自找不同活動分別滿足（使用者確認的複合條件語意）。套用後地圖同時顯示「已套用條件・符合 N 間」摘要文字，且改用計時器每 30 秒重新計算一次，避免「取餐時間」篩選結果因為時間流逝而沒有跟著過期。選取的店家標記若被之後套用的篩選條件排除，資訊卡會自動收合，不會留著失效的「查看活動」按鈕。只套用在即時地圖（Android／Web），首頁「附近熱門活動推薦」的距離下拉選單（`DistanceRadiusFilter`）改成直接沿用同一份 `RADIUS_OPTIONS`，不再各自維護一份不同步的清單。地圖畫面共用邏輯抽成 `useActivityMapFilters` hook，兩個平台的 state／memo／套用流程不再各自複製一份。`SegmentButton`／招募中開關補上 `accessibilityRole`／`accessibilityState`／`accessibilityLabel`。新增/更新共 7 個單元測試（含複合條件案例，距離篩選測試改成即時讀取真正的 `calculateDistanceKm` 原始碼而非另外重寫一份公式），`npm test` 84/84 全過；Web 預覽人工操作驗證面板開關、四項條件切換、套用後摘要／符合店家數正確更新、取消（✕）不套用未送出的草稿變更、預設不勾選招募中時能看到全部店家
    > 讓顧客除了距離之外，還能一次篩掉太早/太晚取餐、優惠門檻還沒到、或已經沒有招募中的團購，不用逐一點開活動才知道符不符合需求。
- 商家建立團購活動時，斷線會偷偷建立顧客看不到的本機假活動 [完成] (8/25) — [MerchantGroupBuyActivityCreateScreen.jsx](mobile/src/screens/MerchantGroupBuyActivityCreateScreen.jsx) 原本在「後端真的連不上」（純網路層失敗，不是資料驗證錯誤）這個情境下，會呼叫本機專用的 `actions.createMerchantGroupBuyActivity(...)` 建一筆只存在手機本機、從未送到後端的活動，還告訴商家「已用本機 prototype 建立」並直接跳轉回商家首頁——商家會以為活動建好了，但這筆活動不會被寫進資料庫，顧客完全看不到也加入不了。使用者確認後改成：斷線時直接顯示錯誤訊息並停在原畫面，不再偷偷建立假資料；連帶移除只有這個分支在用的 `actions.createMerchantGroupBuyActivity`（`AppNavigator.js`）與未再使用的 `PICKUP_WINDOW_MS` 常數。已用真實後端重新驗證「正常建立活動」流程仍正常（新活動出現在商家首頁「進行中活動」清單），`npm test` 77/77 全過
  > 商家開團如果剛好連不上網路，原本系統會騙商家說「建好了」，其實只是手機自己記了一筆假資料，顧客永遠看不到、也搶不到——現在會老實顯示「建立失敗，請檢查網路後重試」，不會再讓商家誤以為團購已經開成功。
- 正式定位隱私流程 [進行中] (8/25 補一筆真機驗證) — 真的跟手機要 GPS 權限、取得即時座標的程式碼（`Location.requestForegroundPermissionsAsync` / `getCurrentPositionAsync`）本來就寫好了，但只有透過本機測試控制台把某個測試帳號的定位模式切成「即時位置」才會觸發，不是正式環境會自動走的路徑；8/25 真機（非模擬器）實際測過一次，系統跳出 Android 原生定位權限請求、使用者同意後，後端有收到真實回報（`locationMode: live`、`locationPermission: granted`），確認底層機制在真手機上真的能動。過程中發現並修正一個真機專屬的連線缺口：本機測試控制台的後端路由刻意設計成只接受「本機自己連自己」的連線（`isLoopbackRequest`），用區網 IP（LAN IP）連一定會被擋，跟網址對不對無關；真機必須改用 `adb reverse tcp:3001 tcp:3001` 把手機的 `127.0.0.1:3001` 請求透過 USB 隧道送回電腦，後端才會判定為本機連線放行，已把 `mobile/.env` 的 `EXPO_PUBLIC_DEV_CONSOLE_URL` 改成這個方式並補上說明註解。8/27 補上正式環境的請求路徑：非開發模式下 `effectiveLocationMode` 直接固定為 `"live"`，不再永遠停在預設座標，畫面一開啟就會走既有的 `requestForegroundPermissionsAsync` 流程，交給 Android/iOS 原生的定位權限對話框處理告知與同意，不另外疊加一層 App 內的說明畫面（使用者確認手機原生的權限請求本身已經足夠）；如果使用者拒絕，畫面上會出現「請開啟定位權限」的提示卡片，附「前往設定開啟」（`Linking.openSettings()`）與「先不要，使用預設位置」（關閉提示、當次畫面停用預設座標）兩個按鈕。`node --check`／babel 語法檢查通過，**尚未經過 Android 真機操作驗證**，只有本機定位（8/25 那筆）驗證過底層機制能動，這次正式環境自動觸發與拒絕後提示卡片還沒有人工看過
  > 要跟手機要「目前所在位置」權限時，怎麼告知使用者、怎麼取得同意，並且符合隱私規範的正式流程——底層真的能跟手機要到定位這件事今天已經驗證過，但還沒有一套「正式環境會自動觸發、有清楚告知」的完整流程。
- 即時地圖「回到目前位置」按鈕 [完成] (8/25) — Android（`LiveMapScreen.native.jsx`）與 Web 預覽（`LiveMapScreen.web.jsx`）都加了浮動圓形按鈕，按下後地圖鏡頭平滑移動回使用者目前定位點；Web 預覽驗證按鈕正常顯示與點擊，`npm test` 77/77 全過
  > 使用者手動拖曳或縮放地圖跑掉後，可以一鍵讓地圖鏡頭跳回自己目前的位置，不用自己重新找。
- Android 地圖實機 E2E [待處理]
  > 拿真的 Android 手機把地圖相關功能從頭到尾操作一次，確認在真實裝置上沒問題，不只是在電腦上測試。

## 金流 《第一階段》 [進行中]
> 所有跟「錢」有關的功能：顧客付款、退款、商家收到錢的整個流程。
- LINE Pay 付款 [進行中]
  > 用 LINE Pay（LINE 官方的行動支付服務）讓顧客付團購訂單的錢，是目前主要的付款方式。
  - 付款畫面與文案 [進行中]
    > 顧客／商家在畫面上看到的付款相關內容：付款流程本身的畫面、雙方看到的狀態文字說法。
    - Mobile 端 [完成] — 付款畫面、輪詢、deep link 回跳
    - 顧客／商家付款狀態文案分離 [完成] — `authorized` 顧客端顯示「訂單成立」、商家端顯示「已付款」；`failed` 商家端顯示灰色「待付款」。已加入 3 個 Mobile 文案契約測試，`npm test` 於 2026-08-15 實測共 42 項全數通過
      > 同一筆訂單的付款狀態，顧客看到的說法跟商家看到的說法不一樣（例如顧客看到「訂單成立」，商家看到「已付款」），避免同一句話讓兩邊誤會。
    - 付款狀態文案 Android UI 人工覆核 [待處理] — 尚未實際開啟顧客訂單／付款頁與商家訂單畫面確認最終排版；不可把自動測試視為 UI E2E
      > 拿真的 Android 手機實際打開訂單畫面，確認上面那些付款狀態文字排版顯示正常，不是只用程式測試檢查文字內容對不對。
    - 待付款訂單卡在「我的訂單」列表沒有付款入口 [完成] (8/25) — 真機測試發現：顧客送出訂單後若離開當下的付款頁（不論是不小心返回、還是單純先去逛逛），`order.paymentStatus === "pending"` 的訂單只有在剛送出訂單那一刻的自動導轉才碰得到付款畫面；之後從「我的訂單」列表點進同一筆訂單，[CustomerOrdersScreen.jsx](mobile/src/screens/CustomerOrdersScreen.jsx) 的 `OrderDetailCard` 原本只在 `paymentStatus === "failed"`（扣款失敗）跟 `reauthorizationReason === "order_amount_changed"`（金額變動）這兩種情況給重新付款的按鈕，從未授權過（單純 pending）的訂單完全沒有對應按鈕，只顯示「待付款」文字說明，等於卡死。已補上「前往付款」按鈕，導向既有 `paymentAuthorization` 畫面；Web 預覽以真實測試帳號重現整個情境（送出訂單→離開→從訂單列表重新進入→點「前往付款」→正確進入付款畫面且可正常操作）驗證通過，`npm test` 77/77 全過
      > 顧客訂單送出後如果沒有馬上付款、之後想從「我的訂單」回來繼續付，原本沒有任何按鈕可以按，只看得到一句「待付款」的說明文字，等於卡住。
  - 核心請款流程 [進行中]
    > 顧客真正付款、系統處理這筆付款的核心邏輯，以及確保這個流程本身正確無誤的把關。
    - Backend 端：付款六階段處理模組 [完成]
      > 後端處理付款每個階段的邏輯：發起付款請求、確認付款、取消、正式請款、作廢預授權、退款，對應信用卡/行動支付標準流程的六個步驟。
    - 付款前取餐／逾期未取規則同意 [進行中]
      > 顧客付款前，要先讀過並勾選同意「取餐、逾期沒來拿怎麼處理」的規則，才能繼續付款，避免事後糾紛。
      - Mobile 與 Backend 串接 [完成] — 顯示 Backend 現行全文／版本，未勾選不能付款；Backend 保存 `order_rule_consents` 後才呼叫 LINE Pay
        > 手機畫面顯示的規則同意內容，跟後端實際存的規則版本要對得起來，確保顧客看到的、簽的，跟系統記錄的是同一份。
      - SQLite 與 PostgreSQL schema [完成] — SQLite runtime + PostgreSQL `005` migration
        > 存放「顧客同意了哪個版本的規則、什麼時候同意的」這筆紀錄的資料表格式。SQLite 是開發階段先用的輕量資料庫，PostgreSQL 是之後正式上線要換成的正式資料庫，兩邊格式要對齊。
      - 自動測試 [完成] — 缺少／過期同意、保存失敗、管理員代同意與 SQLite append-only／完整性已驗證
        > 針對「顧客有沒有同意規則」這件事寫的自動化檢查，確保沒同意就不能付款、同意紀錄不會被竄改或搞丟。
      - Android + LINE Pay sandbox 人工 E2E [完成] (8/25) — 8/15 已驗證 Android 長文排版、未勾選停用、勾選後送出、抵達 LINE Sandbox 登入頁；8/25 補上剩下的部分：真機輸入 LINE Pay Sandbox 測試帳密、完成授權 confirm、App 正確回跳。已用真實 PostgreSQL 資料查證整條鏈：`order_rule_consents` 存了 1 筆 v1.0 規則全文快照（consented_at 05:15:15）→ `payment_authorizations` 狀態為 `authorized`（provider `line_pay`、真實 sandbox `provider_authorization_id`、authorized_amount 與 original_amount 一致、authorized_at 05:15:33）→ 訂單狀態 `submitted`，對應團購活動仍在 `recruiting` 且未過截止時間，確認這筆訂單真的算進團購。首次完整跑通「同意規則 → 付款」全流程，可視為完整付款 E2E
        > 拿真的 Android 手機，搭配 LINE Pay 提供的測試環境（sandbox，不會真的扣錢），把「同意規則 → 付款」整個流程走一遍，確認真的能動。
    - 分離式請款 Sandbox 人工端對端驗證 [完成] (8/8，8/25 補一筆真機起單的驗證) — docs/line-pay-separated-capture-sandbox-checklist.md LP-01/02/04/07/08/09/10 全數通過；8/25 額外用開發控制台把模擬時間快轉過活動截止時間，讓結算排程對上面那筆「真機下單→授權」的真實訂單觸發正式請款，確認 `payment_authorizations` 轉為 `captured`、`payment_captures` 產生對應紀錄（`capture_amount` 425 與授權金額一致、真實 sandbox `provider_capture_id`），驗證完畢已把模擬時間恢復為真實時間
      > 「分離式請款」是先跟顧客的付款方式預先鎖定一筆錢（預授權），確定要出餐了才正式請款、真的把錢請進來，不是付款當下就直接扣款——這裡是拿 LINE Pay 的測試環境把這整套流程實際跑過一次確認沒問題。
    - 主要請款流程缺少建立失敗檢查 [完成] (8/20) — 補上 `null` 檢查，改為明確回傳 409 錯誤而非靜默的假成功；`npm test` 59/59 與相關 smoke test 全過
      > 顧客發起付款請求時，如果因為某些原因（例如金額跟訂單當下不符）沒能真的建立付款預授權，系統目前不會發現、還是會告訴顧客「已經建立成功」，這會誤導顧客。
  - 背景可靠性機制 [進行中]
    > 不是顧客/商家直接操作的部分，是系統自己在背後定期檢查付款有沒有卡住、需不需要重試或通知人處理的機制。
    - 付款對帳與自動重試機制 [完成] (7/30)
      > 系統會固定去跟 LINE Pay 對帳，確認雙方紀錄一致（目前只處理 LINE Pay，ECPay 還沒有這套對帳機制）；待處理的對帳工作會存進一個不會因為程式重啟而消失的工作清單（持久化工作佇列），並用「借用鎖」機制（lease-based claim）確保同一筆工作不會被重複處理兩次。
    - 付款背景工作失敗告警日誌 [完成] (8/15) — 函式位於正確模組層級，已補 2 個單元測試驗證只輸出 `alertRequired` 工作；正式外部通知管道仍待處理
      > 如果有付款相關的背景工作卡住失敗到無法再重試（terminal，代表已經到終點、放棄重試），系統會記一筆警示日誌，方便之後排查是哪裡出問題。
    - 付款結算自動化檢查 [完成] (7/19) — `npm run settlement:smoke`
      > 一個可以快速執行的自動化檢查腳本，用來確認付款結算功能的核心流程沒有壞掉。
    - 正式告警通知管道 [完成] (8/24) — 新增 `backend/payments/alertNotifier.js`，LINE Pay 對帳排程與結算排程在既有的結構化警示日誌之外，同步呼叫可設定的 `ALERT_WEBHOOK_URL`（通用 webhook，Slack／Discord／Mattermost 的 incoming webhook 都吃同樣的 JSON 格式；不設定就完全不送、不報錯，sandbox/dev 環境本來就不會設）；排程本身丟例外（整個排程掛掉，不是單一工作失敗）也會觸發同一支通知。`/security-review` 抓到一個中風險問題並已修：結算排程失敗時原本會把整個團購活動所有訂單的明細（顧客 ID、金流交易序號、金額）原封不動送到外部 webhook，現在送出前會摘要化成筆數，不再外流逐筆明細。7 個單元測試（含這次修復的驗證）與既有測試共 77/77 全數通過，詳見 `docs/AI-security-review-log.md` 2026-08-24 追加的那筆
      > 上面提到的警示日誌，原本只會寫進系統紀錄裡，要有人自己去翻才看得到；現在補上一個可以接 Slack 之類工具的管道，出事會主動推播，不用等人發現。
- 商家退款申請 [進行中]
  > 顧客要退款時，由商家在後台提出退款申請，經過審核（核准或駁回）才會真的退錢，不是顧客自己就能直接退款。
  - Backend 端 [完成] (8/4) — 申請／審核 API（pending/approved/rejected），`npm run refund-request:smoke` 涵蓋申請、重複阻擋、核准、駁回
  - Mobile 端：商家申請 UI [進行中] — `MerchantRefundRequestsScreen` 已接 API 且 navigation 可到達；尚未有 Android／真實 provider E2E 證據
    > 商家在後台看到、提出退款申請的畫面。
  - 管理員審核網頁後台 [完成] (8/22) — 原本的 `AdminRefundRequestsScreen`（手機 App 裡的開發用畫面）已移除，審核功能改在獨立的 `/admin/refund-requests` 網頁後台（見下方「管理員網頁後台」）；核准／駁回直接重用既有 `approveRefundRequest`／`rejectRefundRequest` 服務層函式，未改動審核邏輯本身
    > 平台營運人員審核退款申請、決定核准或駁回的網頁畫面，跟顧客/商家用的手機 App 是分開的。

## 訂單流程 《第一階段》 [進行中]
> 顧客下單之後，訂單會經過的每個階段：選飲料、修改訂單、取貨、逾期沒取怎麼處理。
- 截止後最終結算結果 [完成] (8/15)
  > 團購活動截止之後，系統會依照最後湊到的總杯數重新算一次正確的折扣跟金額，這是每張訂單最後確定要付多少錢的依據。
  - Backend 活動 API [完成] — SQLite／PostgreSQL 都回傳不可變 `settlement` 快照
    > 提供「這個團購活動最後結算結果是多少」這筆資料的後端介面，讓手機 App 可以查詢顯示，而且這筆結果一旦算出來就不會再變動。
  - Mobile 團購進度 [完成] — 顯示最終有效杯數、最終每杯折扣、訂單實際應付、訂單折扣與未分配尾差
    > 手機畫面上顯示這次團購目前/最終的進度：湊了幾杯、折扣打幾折、自己這筆訂單實際要付多少錢。
  - 自動測試 [完成] — 最終快照資料契約與 PostgreSQL read repository smoke 已通過
    > 針對「團購結算完之後金額資料對不對、讀得到讀得對」寫的自動化檢查。
  - Android UI 人工覆核 [待處理] — 尚未由使用者在模擬器檢查小螢幕排版
    > 拿真的 Android 手機（尤其是小螢幕機型）實際打開畫面確認排版正常，還沒有人做過這個檢查。
- 菜單與購物車 [完成]
  > 顧客選飲料、客製化（甜度冰塊等）、加進購物車、送出訂單的整個流程。
  - 顧客權威菜單 API 與客製化選項 [完成]
    > 顧客實際看到、可以選的菜單跟客製化選項（例如甜度、冰塊、尺寸），一律以後端資料為準，不能只靠手機自己存的舊資料。
    - Mobile 端 [完成] — `StoreMenuScreen`／`DrinkSelectionScreen` 已改讀後端菜單
    - Backend 端 [完成]
  - 商家菜單管理 [完成]
    > 讓商家自己在後台編輯自己店裡的菜單、品項跟選項。
    - Mobile 端 [完成] — 商家菜單管理畫面
    - Backend 端 [完成] — 菜單管理 API
  - 購物車客製化摘要（含尺寸） [完成] (8/9)
    > 購物車畫面上要清楚列出每一杯飲料選了哪些客製化選項（含尺寸），不能只顯示品項名稱。
  - 訂單建立／更新驗證（防竄改、防超賣、快照） [完成]
    > 訂單送出或修改時，後端會重新檢查金額、庫存有沒有問題，防止有人竄改價格、防止賣超過店家能出的量，並把當下的訂單內容存一份不會再變動的快照，之後結算都以這份快照為準。
- 訂單修改（Revision） [進行中]
  > 訂單送出之後，顧客如果想改內容（例如換飲料），系統怎麼處理這次修改。
  - 改單與重新預授權 [進行中]
    > 顧客修改訂單內容時，因為金額可能變了，系統要重新跟顧客的付款方式做一次預先鎖定金額的動作（重新預授權），確保之後真的請款得到錢。
    - Mobile 端 [完成] — 購物車／訂單明細修改觸發 revision，付款頁帶 `orderRevisionId`
    - Backend 端 [完成] — `POST /api/orders/:orderId/revisions` 建立 pending revision
  - 失敗提示細化 [完成] (8/27) — `getOrderWriteErrorMessage`（新抽成 `mobile/src/utils/orderWriteErrors.js`，`createOrder`／`updateOrder`／`createOrderRevision` 共用）原本只認得 2 種 backend 錯誤代碼、其餘一律顯示英文原始代碼，這次補齊改單會遇到的全部 8 種（`order_not_revisable`／`activity_not_joinable`／`order_locked_by_deadline`／`order_revision_already_pending`／`order_authorization_missing`／`capacity_exceeded`／`order_not_found`／`order_access_denied`）與另外 3 種建單/更新共用代碼，全部改成具體中文提示；`order_locked_by_deadline` 會帶入實際截止時間。新增 9 個單元測試，`mobile` 測試套件 34/34 全過
    > 如果改單失敗（例如重新預授權失敗、團購快截止被鎖定），原本畫面只會顯示後端回傳的英文錯誤代碼，現在改成看得懂、知道具體原因跟該怎麼辦的中文提示。
  - 改單替換舊授權未接上 PostgreSQL repository [完成] (8/20) — 補上 `authorizationCancelRepository` 注入（含撤銷成功與撤銷失敗兩條路徑）；`npm test` 59/59 與 `settlement:smoke`（涵蓋改單替換授權情境）全過
    > 顧客改單、系統要用新的付款授權取代舊的時，撤銷舊授權這個步驟目前不管資料庫設定是什麼，都固定寫進 SQLite；如果之後改單功能真的切到 PostgreSQL，這裡會出現資料寫錯資料庫的問題。
- 取貨與逾期 [進行中]
  > 顧客到店取餐、以及超過時間沒來取餐的處理流程。
  - 取貨憑證建立／驗證／逾期排程 [完成] — `npm run pickup-expiration:smoke` 驗證
    > 顧客取餐時要出示的憑證（類似取貨碼），系統會產生、驗證這張憑證是否有效，並自動排程檢查有沒有訂單超過取貨時間還沒被領走。
  - Android 實機 E2E [待處理]
    > 拿真的 Android 手機把取貨、逾期提示的整個流程實際操作一次確認沒問題。

## 非主要產品功能 《第三階段》 [待處理]
> 不影響第一階段團購、下單、付款與取餐主流程，但可在核心功能穩定後補充使用體驗的次要功能。
- 討論區 [待處理] — 目前只有底部導覽入口與靜態佔位畫面；討論需求、資料保存方式、後端服務與正式畫面尚未設計
  > 讓顧客針對團購活動留言、揪團討論或向店家提問。
- 個人中心 [進行中]
  > 讓顧客查看與管理自己的會員資料、歷史紀錄及帳號設定。
  - 會員資料唯讀顯示與訂單/取貨紀錄入口 [完成] (8/24) — Web 預覽以本機測試身份登入驗證
    > 顯示登入時後端已回傳的姓名、聯絡方式與身分角色；「查看我的訂單」按鈕連到既有「我的訂單」畫面，付款與取貨紀錄不重複另建一套。
  - 真正登出 [完成] (8/24) — `navigation.logout()` 清掉 bearer token、Firebase session、本機快取的訂單／購物車／付款紀錄，`/security-review` 抓到「原本沒清本機快取」的中風險問題已修
    > 按下登出不只是換畫面，而是真的清掉登入憑證跟裝置上快取的個人資料，避免同一台裝置換下一個人登入時還看得到前一位的購物車或訂單。
  - 會員資料編輯（暱稱／電話） [待處理]
  - 帳號關閉／去識別化流程 [待處理] — 規則已於 `docs/AI-database-candidates.md` 定義，API 與權限尚未實作

## 平台維運 《第二階段》 [進行中]
> 讓整個系統長期穩定運作的後勤工作：資料庫搬家、資安檢查、套件更新——不是顧客/商家直接看得到的功能，但影響系統穩不穩、安不安全。
- PostgreSQL 遷移 [進行中]
  > 開發階段先用輕量的 SQLite 資料庫，正式上線前要把所有資料搬到功能更完整、適合正式營運的 PostgreSQL 資料庫，這整個搬家工程就叫「遷移」。
  - API／資料存取切片搬遷 [完成]
    > 把顧客、商家平常在用的各種功能（登入、菜單、下單、改單、結算查詢等）背後的資料存取邏輯，逐一改成可以切換到 PostgreSQL 執行，一次搬一小塊，確保每搬一塊都測試過沒有壞掉。
    - Auth／公開菜單／活動／訂單讀取 [完成]
      > 登入驗證、菜單、活動、訂單查詢這些「讀資料」的功能，已確認可以在 PostgreSQL 上正常運作。
    - 商家建團／菜單／顧客首次建單 [完成] (7/31) — 跨連線 HTTP proof 驗證
      > 商家建立團購活動、編輯菜單、顧客第一次下單這些「寫入新資料」的功能，已確認可以在 PostgreSQL 上正常運作。
    - Capture／結算 [完成] — postgres smoke test 驗證，已接 server route
      > 正式請款跟訂單結算這兩個跟錢直接相關的功能，已確認可以在 PostgreSQL 上正常運作。
    - 改單／退款／取貨憑證（004 migration） [完成] (8/12) — 對應 repository 與 smoke test 驗證，過程中修正 3 個真實 bug
      > 修改訂單、退款、取貨憑證這幾個功能對應的資料表搬遷工程（第 004 號搬遷腳本）。
    - 店家清單／地圖資料查詢 [完成] (8/20) — 新增 `storeDirectoryReadRepository`（`STORE_DIRECTORY_READ_RUNTIME`），`/api/stores` 改為透過此 repository；smoke test 4 案例、既有測試 59/59 全過，實際啟動 backend 確認 SQLite 路徑回應內容與改動前一致
      > 提供地圖跟店家列表用的店家資料查詢功能，現在已經可以透過設定切換到 PostgreSQL。
    - 訂單送出前編輯 [完成] (8/20) — 併入既有 `customerOrderWriteRepository`（`updateOrder`），重用建單流程既有的計價／折扣驗證邏輯；修正了一處會讓這條路由在 PostgreSQL 模式下持續回傳 503 的既有防呆判斷（`isSqliteOrderDependentRoute`）；smoke test 8 案例、既有測試 59/59 全過，實際啟動 backend 確認無異常
      > 顧客送出訂單前修改購物車內容的功能，現在已經可以透過設定切換到 PostgreSQL。
  - 背景與共用機制 [完成]
    > 不是使用者直接操作的畫面功能，而是系統自己在背後定期執行的檢查、對帳、防止衝突的機制，這些也要能在 PostgreSQL 上正常運作。
    - LINE Pay 對帳與重試背景排程 [完成] (8/20) — `reliabilityService.js` 整組，含對帳排程、人工重新請款（確認回跳＋發起請求）、監控告警查詢
      > 定期檢查有沒有付款卡在中間需要重新對帳、重試的背景程式，以及對應的人工重新請款、監控告警查詢功能，現在都已經可以透過設定切換到 PostgreSQL。
      - 人工重新請款：確認回跳流程 [完成] (8/20) — 新增 `manualLinePayRepaymentRepository`（`MANUAL_LINE_PAY_REPAYMENT_RUNTIME`），重用既有 `customerOrderReadRepository`／`paymentAuthorizationCancelRepository` 的鎖與查詢邏輯；LINE Pay 確認回跳（`GET /api/payments/line-pay/confirm`）裡的人工重新請款分支已完整支援 PostgreSQL
        > 顧客點擊 LINE Pay 付款連結、完成付款後導回 App 這段流程裡，如果剛好是走「人工重新請款」（自動扣款失敗後由顧客手動重試）的情況，現在可以正確用 PostgreSQL 處理。
      - 人工重新請款：發起請求流程 [完成] (8/20) — `POST /api/payments/line-pay/repay`；原本 3 處未接上 repository 的直接呼叫（已請款和解、建立新預授權、排入對帳背景工作）改重用既有 `paymentCaptureRepository`／`paymentAuthorizationRequestRepository`／新的 `paymentReliabilityJobRepository`，不需要新寫 SQL；路由防呆改成有條件放行（5 個相關 repository 都切到 postgres 才放行，任一沒切齊維持原本擋停）
        > 顧客主動點擊「重新付款」按鈕、發起這次重新請款的功能，現在已經可以透過設定切換到 PostgreSQL，不會出現「切了一半、資料寫錯資料庫」的狀況。
      - LINE Pay 對帳排程本身 [完成] (8/20) — 新增 `paymentReliabilityJobRepository`（`PAYMENT_RELIABILITY_JOB_RUNTIME`），重用「團購結算」背景排程（`groupBuySettlementRepository`）本來就寫成通用邏輯、沒有寫死工作類型的 job-queue 函式，不需要新寫佇列 SQL；背景排程啟動條件改為視相依 repository 是否齊全動態決定，不再是「訂單走 postgres 就強制關閉」
        > 系統定期檢查「付款卡在中間、需要跟 LINE Pay 對一次帳」的背景程式，現在可以用 PostgreSQL 執行，不會因為訂單切到 PostgreSQL 就被自動關閉。
      - 監控告警查詢 [完成] (8/20) — `GET /api/admin/payment-reliability/alerts` 改走 `paymentReliabilityJobRepository.listAlerts`；smoke test 9 案例（涵蓋 job 佇列 4 個操作＋列表查詢 2 個）、既有測試 59/59 全過，實際啟動 backend 確認路由與排程都正常運作
        > 給營運人員看「有哪些付款背景工作卡住需要注意」的查詢功能，現在已經可以透過設定切換到 PostgreSQL。
    - ECPay 核心付款流程 [完成] (8/20) — 新增 `ecpayAuthorizationRepository`（`ECPAY_AUTHORIZATION_RUNTIME`），涵蓋發起請款、checkout 轉址頁、webhook 確認回跳；請款/作廢直接重用既有 `paymentCaptureRepository`／`paymentAuthorizationCancelRepository`（同一組 `payment_authorizations`/`payment_captures` 資料表，不需另開一組）；webhook 確認回跳重用既有 `paymentAuthorizationConfirmRepository` 的核心邏輯（已驗證該邏輯本來就是依 provider 參數判斷，非 LINE Pay 專屬）；過程中發現並修正一個既有的 LINE Pay Postgres 缺陷（`getLatestAuthorizationForOrder` 誤加了只認 LINE Pay 的 provider 篩選條件，跟 SQLite 版本行為不一致）；新增結算／商家取消流程裡「三個相依 repository 須同時切齊才信任 PostgreSQL 查詢結果」的執行期防呆（避免 ECPay 授權紀錄還留在 SQLite、卻被拿去查 PostgreSQL 而悄悄查無資料）；smoke test 9 案例＋既有 `ecpay:smoke`（含請款/webhook/結算請款/結算作廢/退款/重複請求擋停）、既有測試 59/59 全過，實際啟動 backend 確認正常，並用刻意設錯環境變數的方式驗證新增的防呆判斷真的會擋停
      > 用信用卡（ECPay）付款的請款、取消授權、收款結果通知（webhook）這三個功能，現在已經可以透過設定切換到 PostgreSQL；退款功能之前就已經支援。
    - 跨執行個體併發鎖定的 PostgreSQL 驗收 [完成] (8/20) — 本機改用原生安裝的 PostgreSQL 16 Windows 服務（環境沒有 Docker），連線設定沿用既有文件記錄的本機開發帳密；先重跑既有 7 個 postgres proof/http smoke test（含 `payment-capture-postgres`、`group-buy-settlement-postgres` 等）全數通過，確認先前結論在這台實際服務上依然成立；新增 `npm run postgres-reliability:multiprocess`（`scripts/postgres-reliability-multiprocess-smoke.js`），是既有 SQLite 版 `payment-reliability:multiprocess` 的 PostgreSQL 對應版本——用兩個真正獨立的 OS 程序（不是同程序開兩條連線）搶同一筆對帳工作、搶同一把 `order:{id}:payment-lifecycle` lock（LINE Pay 請款/取消/人工重新請款與 ECPay 共用的鎖），驗證搶佔互斥、租約到期接手、release 擁有權檢查；跑兩次確認結果穩定，測試自動清理，執行前後資料庫內容一致；詳細記錄見 `database/README.md`
      > 確認系統在「兩個程式同時想搶同一份工作」時，有正確的排隊機制，不會兩邊都搶到、也不會兩邊都沒搶到，這在牽涉金錢的系統裡是必要的保護機制。
  - 收尾與部署 [進行中]
    > 資料搬遷工程本身做完之後，還要準備的收尾工作：統一執行工具、確認沒有漏掉的地方、真正切換到正式環境上線。
    - 統一資料庫搬遷執行工具 [完成] (8/12) — 對應 `database/migrate.js`
      > 一個統一的工具程式，負責照順序執行資料庫搬家用的每一份腳本，避免手動一個一個跑、跑錯順序。
    - 剩餘 SQLite-only 範圍盤點 [完成] (8/19) — 逐一核對 `backend/db.js` 所有對外被呼叫的 64 個函式，與既有 17 個 repository 切片的對應關係，確認精確缺口（結果見下方 5 項）
      > 用程式碼追蹤的方式，把資料庫相關程式碼裡「已經能同時支援 SQLite 跟 PostgreSQL」跟「還只能用 SQLite」的部分完整分開列出來，確保沒有漏掉的死角，不用再邊做邊發現新的缺口。
    - PostgreSQL 切換 [完成] (8/20) — 把 backend 全部 21 個 `*_RUNTIME` 開關一次設為 `postgres`（寫入 `backend/.env`，透過既有 `backend/auth.js` 的 `loadLocalEnv` 自動載入，不需額外設定），**這是永久預設值、不是一次性測試後就切回去**；切換前修正 3 個先前已知的既有缺口（改單替換舊授權未接 repository、主要請款流程缺少建立失敗檢查、管理員舊版取消團購工具未連動訂單/付款），過程中另外發現並修正一類全新問題：`authorization` 是 PostgreSQL 保留字，3 支既有查詢把它當裸 SQL 別名用，先前只被假資料庫測試驗證過、從未真的被 PostgreSQL 解析執行過，這次對真實服務啟動時才现形；另外補套用一直沒被真正套用到本機資料庫的 `005` migration。發現 `backend/.env` 是全域生效（不只 backend 伺服器，任何間接用到登入相關程式碼的腳本都會載入），永久切換前先修正 `scripts/merchant-activity-cancel-service-smoke.js` 這支唯一沒有明確隔離 runtime 的獨立測試腳本（其餘 10 支同類型腳本本來就已經用 `env: {}` 隔離），避免之後任何獨立測試腳本悄悄查到錯的資料庫。完整寫入流程（建團、建單、LINE Pay 請款、商家菜單、改單、管理員/商家取消）與既有 `*-postgres-http-smoke` 系列、全部 11 支曾經受影響的 repository smoke test，皆已在永久切換後的狀態下對真實 PostgreSQL 16 重新驗證通過，`npm test` 59/59；一次待釐清的觀察（`pg` deprecation warning，未能穩定重現）記錄於 `docs/AI-security-review-log.md`；**後續補充 (8/20)**：又發現同一類問題的第二個受害腳本 `scripts/order-api-smoke.js`（用子行程啟動自己的 backend，只明確指定 2 個 runtime 開關為 sqlite，其餘沿用 `backend/.env` 悄悄補上的 postgres 值，兩邊混用觸發啟動期一致性檢查噴錯），已比照修正並全部 21 個開關明確列出；修好後發現這支腳本另外還有一個無關的既有問題（`database/drink-group-buy-dev.sqlite` 本機檔案資料過期，查不到 `store-001`），屬於本機檔案本身過期，不在這次範圍內處理，詳見 `database/README.md`
      > 把後端所有功能一次全部改成用 PostgreSQL 運作，當作正式上線後的實際運作方式，而不是每個功能分開個別測試。
    - 本機 SQLite 測試檔案資料過期 [完成] (8/21) — `database/drink-group-buy-dev.sqlite` 已用 `db:init` + `db:seed` 重建（重建前先備份至 `database/backups/`）；重建後 `integrity_check=ok`、`foreign_key_check` 無違規、`pickup_closing_time` 新欄位存在、`store-001` 資料正確（2 個菜單品項）；`order-api-smoke.js` 與其餘 6 支共用這個檔案的腳本（`ecpay-smoke`、`pickup-credential-smoke`、`pickup-expiration-smoke`、`settlement-smoke`、`refund-request-smoke`、`merchant-activity-cancel-service-smoke`）與 `npm test`（63/63）全數重新驗證通過
      > 部分還在用 SQLite 的獨立測試腳本，依賴這個本機檔案裡的資料，資料過期會讓這些測試失敗。
    - `GET /api/orders/:id/pickup-credential` 自 8/20 切換後其實一直打不通 [完成] (8/25) — 真機測試「店家標記可取餐後，顧客拿不到取貨碼」才發現：這支顧客端拿取貨碼用的路由，從 8/20 全面切到 PostgreSQL 那天起，就一直被啟動期一致性檢查擋下回傳 503（`customer_order_runtime_mismatch`），因為擋門函式 `isSettlementRouteReadyForPostgres` 檢查的是 `/api/pickup-credentials/`（複數、無 `/orders/` 前綴，從來沒有路由真的用這個網址），沒對到真正的路由 `/api/orders/:id/pickup-credential`；另外這支路由本身也還在直接呼叫底層 SQLite-only 的 `getOrderDetail`，沒有像其他路由一樣改用 runtime-aware 的 `customerOrderReadRepository.getOrderDetail`，就算擋門放行了也會因為訂單資料實際存在 PostgreSQL、查 SQLite 查不到而回錯誤。兩處一起修正；Mobile 端 `syncOrderFromBackend` 原本把這支呼叫的任何失敗都靜默吞掉（`catch { pickupCredential = undefined }`），沒有任何錯誤訊息，這是為什麼店家標記可取餐後，顧客端「看起來像沒生成」但其實資料庫早就有紀錄、只是 API 拿不到。修好後用真實 HTTP 請求驗證：訂單本人可正確拿到取貨碼（200 + 真實 `pickupCode`），换成別的顧客帳號正確被擋（403 `Order access denied`，確認沒有因為這次修改而放寬權限檢查）；`npm test` 77/77 全過
      > 商家在畫面上按「可取餐」之後，系統其實已經正常產生取貨碼存進資料庫，但顧客那支專門拿取貨碼的 API 一直被一個內部的「資料庫還沒切換完成」保護機制誤擋，回傳的錯誤又被 App 端悄悄吞掉不顯示，導致顧客看起來像「一直沒生成」，其實是拿不到已經生成好的碼。
    - Production 正式部署（備份、staging、rollback） [進行中] (8/20) — 已與使用者確認關鍵決策並寫入 `docs/AI-postgresql-migration-plan.md`（「2026-08-20 正式環境部署與真實資料起始方案」段落）：正式環境採自架伺服器（非代管服務）；備份策略、staging 定位、rollback 計畫（含「累積真實資料後開關不能再當 rollback 用」的風險說明）均已規劃並記錄；仍待處理：實際租用/設定伺服器、備份 cron job 落地、正式商家帳號連結方案（見下方子項）——這些需要真的申請伺服器與正式憑證才能繼續，非程式碼變更
      > 確保正式環境的資料庫在出問題時（例如硬碟壞掉、程式有 bug）不會整個系統的資料都不見，需要先規劃好的備份、測試環境跟復原方案。
    - 真實資料搬遷方案 [完成] (8/20) — 確認開發資料庫裡的商家／門市／菜單資料其實是既有的開發示範資料（非另外接洽的真實商家），使用者確認直接沿用當正式起始資料；新增 `database/production-reference-seed-postgres.sql`（只含商家／門市／菜單，排除密碼登入的假帳號），已在真實 PostgreSQL 16 用一次性 throwaway schema 驗證套用結果正確（7 商家/7 門市/8 品項/96 客製化選項/32 條規則），不掛進 `database/migrate.js` 的自動 migration 鏈以避免正式環境被誤套用開發假帳號
      > 把現在開發資料庫裡可以沿用的資料（例如商家、門市、菜單），安全地變成正式環境一開始就有的起始資料的規劃與準備工作。
      - 正式商家帳號連結方案 [待處理]
        > 排除假帳號後，7 個真實商家要怎麼用自己的 Google 帳號登入、連到正確的門市，目前沒有後台介面可以做，只能手動下 SQL 指令，這部分還需要另外決定要不要做一個管理工具。
- 資安審查 [進行中]
  > 針對容易被攻擊或出錯的地方（付款、訂單、資料寫入等），檢查程式碼有沒有安全漏洞的審查工作。
  - 金流／驗證／資料寫入相關改動的安全複查 [完成] (累計至 8/20，共 11 次) — 8/11 付款/訂單修改/取貨憑證改動、8/13 作廢邏輯覆核（呼應 8/11 一筆待評估項）、8/15 業務時間串接（3 項中/低風險問題已修正）、8/15 付款狀態文案分離、8/15 取餐規則同意、8/15 告警驗證與結算快照、8/17 商家自助取消團購、8/20 PostgreSQL 遷移三個新切片、8/20 LINE Pay 對帳背景排程、8/20 ECPay 核心付款流程（1 個高風險問題已修正）、8/20 三個已知缺口修正＋PostgreSQL 全面切換（2 個中風險問題已修正）；全部沒有發現未解決的達門檻漏洞，詳細記錄見 docs/AI-security-review-log.md
    > 每次改到付款、驗證、資料寫入這類高風險的地方，完成後都要做一次安全複查，檢查有沒有資安漏洞——這是持續進行的例行檢查，不是做一次就結束。
- 依賴套件安全 [進行中]
  > 這個專案用到很多別人寫好的現成套件，這些套件本身也可能有已知的安全漏洞，需要定期檢查更新。
  - Mobile 框架升級（Expo SDK 51→54，啟用新版渲染架構） [完成] (8/19) — `expo-doctor` 18/18、既有測試 59/59、Android 模擬器實機操作驗證（地圖標記、公里篩選、商家取消團購雙擊防護皆正常）
    > 把開發這個手機 App 用的框架（Expo／React Native）從舊版升級到新版，同時提早打開下一版強制會用的「新版畫面渲染架構」（New Architecture），避免以後被迫一次跳更大步。
  - 已知漏洞修復（非強制） [進行中] — Root 從 7 項（6 中 1 高）修掉 1 項高風險（`brace-expansion`，無破壞性），剩餘 6 項中風險都要把 `firebase-admin`（登入驗證用套件）退回 10.3.0 舊版才能解，會是倒退不是修復，先不做；Mobile 從 46 項（1 低 11 中 33 高 1 重大）降到 20 項（9 中 11 高，無重大），剩餘需再升級框架才能繼續解
    > 用工具（`npm audit`）定期檢查目前用到的套件裡有哪些已知的安全漏洞，並視風險評估要不要修。
  - Expo SDK 57 升級 [暫緩] (8/19) — 套件相容性、`expo-doctor`、測試全過，但地圖套件（react-native-maps）在新版渲染架構下無法正常顯示地圖（Android 實機驗證發現地圖畫面完全空白），已退回 SDK 54；SDK 54 已符合 Google Play 2026/8/31 起的最低版本要求（Android 16 / API 36），非上架必要項目，暫不繼續往上升
    > 把開發這個手機 App 用的框架（Expo／React Native）從目前使用的 54 版升級到最新的 57 版。

## 系統分析書 《不分階段》 [進行中]
> 一份完整說明整個系統設計、有哪些功能、每個功能怎麼運作的文件，通常給老師、審查人員或團隊自己參考用。
- 五大功能分類與描述性綱目 [完成]
  > 把整個系統的功能分成五大類，並列出每一類底下大概有哪些東西的文件大綱。
- 各小節使用個案描述與活動圖 [待處理]
  > 針對文件裡每個小節，補上具體的「使用情境描述」（例如：顧客怎麼下單）跟畫成流程圖的「活動圖」，目前還沒寫。

## 非正式與備援功能 [進行中]
> 不是給一般顧客/商家用的正式功能，是開發測試用的小工具，或是正式方案掛掉時的備用方案。
- 本機開發身份切換器（dev-only） 《不分階段》 [完成] — Backend 與 Mobile 都有 environment gate，且 README 明講「這不是正式產品角色選擇」
  > 開發時為了方便測試不同身份（顧客/商家）用的快速切換工具，只有開發環境能用，正式上線的版本裡不會出現，不算是真正的登入功能。管理員身份不在這個清單裡，改走下面的「管理員網頁後台」。
  - Mobile 端 [完成] — 本機測試身份下拉選單（8/22 起排除管理員身份，管理員不再有任何手機 App 入口）
  - Backend 端 [完成] — `AUTH_DEV_MODE` 閘門與 dev-session API
- 管理員網頁後台 《第二階段》 [完成] (8/22) — 伺服器直接輸出 HTML／表單（無另外的前端專案或建置流程），密碼登入寫在 `backend/.env` 的 `ADMIN_WEB_PASSWORDS`（逗號分隔，可設多組密碼給不同人用，登入後都對應到同一個管理員身份；與 `AUTH_DEV_MODE` 無關，正式環境也能用）；session 沿用既有 `createAuthToken`／`verifyAuthToken` 簽章機制存進 HttpOnly cookie，取消團購／核准退款／駁回退款都直接重用既有服務層函式，未新增或修改任何業務邏輯；每個會改資料的表單都帶一次性 CSRF token，已用真實 HTTP 請求驗證登入、未帶 CSRF token 會被拒絕（403）、以及對不存在的活動 ID 觸發取消會正確回傳錯誤訊息。原本手機 App 裡的 `AdminDashboardScreen`／`AdminRefundRequestsScreen` 已移除。事後跑過一次 `/code-review`（xhigh 強度，10 個角度）並全數修復其 15 個發現，包含 2 個真的邏輯缺口（取消團購時若有訂單付款作廢失敗，原本會誤顯示成功；退款審核列表頁原本漏掉資料庫執行模式一致性檢查）與其餘重複程式碼／效率問題；修復過程與驗證方式記錄於 `docs/AI-security-review-log.md` 2026-08-22 追加的那筆
  > 平台營運人員用來取消團購、審核退款的網頁工具，跟顧客/商家用的手機 App 完全分開；原本這兩件事是手機 App 裡工程師專用的開發畫面，現在搬成獨立網頁，比較符合「管理員不是正式 App 的一般角色」這個既有決議（`docs/open-questions.md`）。
- 本機測試控制台併入主 Backend 《不分階段》 [完成] (8/23，8/24 補上密碼登入) — 原本是獨立跑在 3100 埠、不進 Git 的 `local-dev-console/`（控制測試顧客的模擬定位、全域模擬業務時間），使用者要求跟管理員後台「整合成同一個工具」後，改為 `backend/devConsole/`，掛在主 Backend 底下的 `/dev-console`；狀態儲存搬到 `backend/data/dev-console-state.json`（沿用同樣不進 Git 的規則）。保留原本「只接受本機（loopback）連線」的邊界不變（用同一個 `isLoopbackRequest` 檢查），不因為併到同一台伺服器就讓區網（例如真手機）連得到；`/admin`、`/dev-console` 兩個頁面互相加了導覽連結。啟動器 `04-start-console.cmd` 改成只開瀏覽器分頁，不再啟動獨立程序；`local-dev-console/` 資料夾保留文件當歷史紀錄，程式不再執行。8/24：使用者確認本機測試控制台「算後台的一部分」，人看的頁面與控制 API 額外要求 `/admin` 的登入 session（loopback 限制照舊，密碼是疊加上去，不是取代），只有 Mobile App 直接呼叫、模擬定位用的 `GET /dev-console/api/app/config`／`POST /dev-console/api/app/report` 兩支維持原本不需密碼；已用真實 HTTP 請求驗證頁面／靜態檔／全部 API（狀態、帳號列表、定位設定讀寫重置、事件紀錄、業務時間讀寫、App 回報）皆正常，`npm test` 70/70 通過（未改動任何被測邏輯），`/security-review` 記錄於 `docs/AI-security-review-log.md` 2026-08-24 這筆
  > 本機開發測試用的工具，可以模擬測試顧客目前在哪裡（方便測試地圖／距離篩選功能）、可以把系統目前的模擬時間往前後調（方便測試截止/取餐時限），只有開發者自己的電腦連得到，正式環境不會出現。
- ECPay 信用卡付款（備援） 《第三階段》 [完成] (8/27) — 2026-08-26 發現 webhook 缺少 `RtnCode` 檢查與 stage 金鑰 fallback 兩個安全問題、先加總開關暫停；8/27 使用者確認後改為整個移除而非修復——`ecpayService.js`／`ecpayClient.js`／`ecpayAuthorizationRepository.js` 與對應 mobile UI、smoke test、schema CHECK constraint 允許值全部刪除或收回，兩個安全問題隨程式碼刪除一併解決（問題所在的程式碼本身不存在了，不是留著加強防護）；`npm test` 84/84、實際啟動 backend 對真實 PostgreSQL 驗證正常，詳見 `docs/AI-security-review-log.md` 2026-08-26／2026-08-27 兩筆
  > ECPay 原本是 LINE Pay 審核卡關時的備用付款方式；LINE Pay 核准後優先度降低，2026-08-26 發現安全問題後，使用者確認直接整個移除而非修復。目前只有 LINE Pay 一種付款方式。

## 開發協作 《不分階段》 [完成]
> 跟寫程式碼本身無關，是幫助多個 AI 助理／開發者之間順利交接、理解專案現況的文件跟規則整理工作。
- AI Agent 漸進式 Context [完成] (8/16) — 已整理 `AGENTS.md`、Claude／Replit 入口、穩定產品 Context 與按需架構文件；Markdown 連結、Context 路由與 `git diff --check` 已驗證
  > 整理一套文件架構，讓不同的 AI 寫程式助理（例如 Claude Code、Codex）進到這個專案時，只需要先讀最基本的規則，需要深入某個主題（例如金流、資料庫）才去讀對應的詳細文件，不用每次都把所有文件全部讀一遍。
