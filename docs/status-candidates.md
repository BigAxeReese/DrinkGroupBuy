# 狀態模型

最後更新：2026-07-12

## 語言規則

本文件整理系統中各種狀態值，例如團購狀態、訂單狀態、付款狀態與取貨狀態。

- status value 必須保留英文，例如 `recruiting`、`authorized`、`ready`。
- 中文說明用來解釋每個狀態的意義與流程。
- 不要為同一個狀態另外新增中文狀態值給程式使用。
- 新增或修改 status 時，必須同步更新本文件，避免 mobile、backend、database 用不同名稱。
- PostgreSQL 第一版 status 欄位會使用 `text check (...)`，不是 enum。

以下狀態反映目前程式碼與 schema 方向。若文件中標示 mobile、backend、database 有差異，必須在實作對應 API 前先決定。

## 團購活動

狀態值：`draft`、`recruiting`、`confirmed`、`failed`、`ordering`、`ready_for_pickup`、`completed`、`cancelled`。

預期流程：

```text
draft -> recruiting -> confirmed -> ordering -> ready_for_pickup -> completed
                   \-> failed
recruiting/confirmed/ordering -> cancelled
```

- `confirmed`：至少達到一個優惠門檻；在截止時間或最大容量前仍可能繼續開放加入。
- `ordering`：截止時間已過，商家正在準備已成立訂單。
- `cancelled`：商家或系統後台明確取消，不代表刪除資料。

需要 history：是。

## 訂單

目前 schema 支援的狀態值：`draft`、`submitted`、`locked`、`cancelled`、`completed`。

訂單不使用 `readyForPickup` 作為 order status。正式方向是訂單維持 `locked`，並以 `pickupStatus = ready` 表示可取餐。mobile 若仍有 `readyForPickup` 顯示或 route 轉換，應在後續整理時移除。

預期流程：

```text
draft -> submitted -> locked -> completed
   \        \          \-> cancelled
    \--------> cancelled
```

需要 history：是，特別是 authorization 後的訂單修改。

## 付款

狀態值：`pending`、`authorized`、`captured`、`authorization_voided`、`failed`、`refunded`。

使用者顯示文字：

| 系統狀態               | 顧客看到         | 店家看到         | 說明 |
| ---------------------- | ---------------- | ---------------- | ---- |
| `pending`              | 待付款           | 待付款           | 訂單已建立，但尚未完成 LINE Pay 付款授權。 |
| `authorized`           | 已付款           | 已付款           | 顧客已完成預授權，產品上視為付款成功並加入團購統計。 |
| `captured`             | 已付款           | 已付款           | 團購截止結算後，系統已完成實際請款。 |
| `authorization_voided` | 授權已取消       | 授權已取消       | 尚未請款的授權已取消。 |
| `failed`               | 付款失敗         | 付款失敗         | 付款授權或後續請款失敗。 |
| `refunded`             | 已退款           | 已退款           | 已請款金額完成退款。 |

顧客端與店家端不直接顯示「待預授權」或「已預授權」。預授權是系統內部金流狀態；對使用者而言，`authorized` 代表付款動作已完成，因此顯示「已付款」。若後續請款沒有成功，狀態改為 `failed`，畫面顯示「付款失敗」。

預期流程：

```text
pending -> authorized -> captured
                    \-> authorization_voided
pending/authorized/captured -> failed（僅限對應操作）
captured -> refunded
```

需要 provider events 與 idempotency records：是。

## 商家接單

狀態值：`pending`、`accepted`、`rejected`、`cancelled`。

預期流程：`pending -> accepted/rejected/cancelled`。

最新產品規則不需要店家逐筆確認接單。顧客預授權成功後即視為有效加入團購，因此 `merchant_acceptance_status` 是早期候選欄位；第一階段可在預授權成功後固定為 `accepted`，後續 schema review 可考慮移除。

## 取貨

schema 狀態值：`not_ready`、`ready`、`picked_up`、`cancelled`、`expired`。

不保存 `preparing` 作為 pickup status。製作中由 activity/order/payment 狀態推導；取貨狀態只保存 schema 中的狀態值。

預期流程：

```text
not_ready -> ready -> picked_up
not_ready/ready -> cancelled
ready -> expired
```

取貨碼從 `ready` 開始顯示，不只是商家接單後就顯示。

- `ready`：店家已標記可取餐，顧客可以看到取貨憑證。
- `picked_up`：店家核對取貨憑證或取貨代碼後，已交付飲品。
- `expired`：取貨憑證已到期，訂單移至歷史訂單；逾期不自動退款，店家不再負原飲品保管責任。

取貨憑證到期規則：

1. 自取餐開始時間起保留 3 小時。
2. 若店家當日營業結束早於 3 小時，保留至當日營業結束。
3. 24 小時營業店家保留 3 小時。
4. 若顧客在有效期間到店但店家無法交付，不得將訂單改為 `expired`。

## 優惠達標

Mobile 狀態值：`not_yet_qualified`、`qualified`、`failed`。

此狀態較適合由資料推導或由 settlement outcome 表示，而不是作為可任意變更的 activity status。截止時，應將權威結果保存到 `activity_settlements`。
