# 狀態模型

最後更新：2026-06-24

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
- `cancelled`：商家或管理員明確取消，不代表刪除資料。

需要 history：是。

## 訂單

目前 schema 支援的狀態值：`draft`、`submitted`、`locked`、`cancelled`、`completed`。

目前 mobile 也使用 `readyForPickup`，但 database schema 不接受此值。建議決議方向：訂單維持 `locked`，並以 `pickupStatus = ready` 表示可取餐；或正式將 `ready_for_pickup` 加入 order status schema。在決定前不要再新增其他拼法。

預期流程：

```text
draft -> submitted -> locked -> completed
   \        \          \-> cancelled
    \--------> cancelled
```

需要 history：是，特別是 authorization 後的訂單修改。

## 付款

狀態值：`pending`、`authorized`、`captured`、`authorization_voided`、`failed`、`refunded`。

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

## 取貨

schema 狀態值：`not_ready`、`ready`、`picked_up`、`cancelled`、`expired`。

目前 mobile 也顯示 `preparing`；開發 schema 不接受此值。建議決議方向：正式將 `preparing` 加入 schema，或由 `merchantAcceptanceStatus = accepted` 與 activity `ordering` 推導製作中狀態。

預期流程：

```text
not_ready -> ready -> picked_up
not_ready/ready -> cancelled
ready -> expired
```

取貨碼從 `ready` 開始顯示，不只是商家接單後就顯示。

## 優惠達標

Mobile 狀態值：`not_yet_qualified`、`qualified`、`failed`。

此狀態較適合由資料推導或由 settlement outcome 表示，而不是作為可任意變更的 activity status。截止時，應將權威結果保存到 `activity_settlements`。
