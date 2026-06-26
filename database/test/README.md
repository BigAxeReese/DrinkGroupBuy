# Prototype 測試資料庫

這個資料夾是本機 prototype 測試用 SQLite 資料庫，不是正式 production schema，也不是正式 migration。

主要用途是快速準備展示資料，例如地圖店家、菜單、測試團購與訂單。

## 目前包含的測試資料

- 使用者與角色。
- 7 筆測試店家資料。
- 店家地址、電話、營業狀態與座標。
- 店家菜單與客製化選項快照。
- 團購活動與優惠級距。
- 訂單與訂單明細。
- 付款預授權 / partial capture 測試欄位。
- 商家接單狀態。
- 取貨憑證。

## 建立或重建測試資料庫

```powershell
node C:\vscode\DrinkGroupBuy\database\test\init-test-db.js
```

這會刪除並重新建立：

```text
database/test/drink-group-buy-test.sqlite
```

產生出的 SQLite 檔案會被 Git 忽略，不應上傳。

## 查看測試資料

```powershell
node C:\vscode\DrinkGroupBuy\database\test\inspect-test-db.js
```

## 匯出地圖資料給 mobile

mobile app 目前不會直接讀這個 SQLite。  
如果重建測試資料庫後，需要重新匯出地圖資料：

```powershell
node C:\vscode\DrinkGroupBuy\database\test\export-mobile-map-data.js
```

這會產生：

```text
mobile/src/mock/databaseMapStores.js
```

地圖 marker 規則：

- 藍色：店家目前沒有招募中的團購。
- 黃色：店家至少有一個招募中的團購。

## 目前限制

- 這裡是測試資料，不是正式資料庫來源。
- mobile 目前是使用匯出的 mock 檔案，不是即時連線 SQLite。
- 如果要做到即時更新，需要之後再接 backend API。
