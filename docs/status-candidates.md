# Status Model

Last updated: 2026-06-24

## Language / 中文註解規則

本文件整理系統中各種狀態值，例如團購狀態、訂單狀態、付款狀態與取貨狀態。

- status value 必須保留英文，例如 `recruiting`、`authorized`、`ready`。
- 中文說明用來解釋每個狀態的意義與流程。
- 不要為同一個狀態另外新增中文狀態值給程式使用。
- 新增或修改 status 時，必須同步更新本文件，避免 mobile、backend、database 用不同名稱。
- PostgreSQL 第一版 status 欄位會使用 `text check (...)`，不是 enum。

These statuses reflect the current code and schema direction. Differences listed below must be resolved before the corresponding API is implemented.

## Group-Buy Activity

Values: `draft`, `recruiting`, `confirmed`, `failed`, `ordering`, `ready_for_pickup`, `completed`, `cancelled`.

Expected flow:

```text
draft -> recruiting -> confirmed -> ordering -> ready_for_pickup -> completed
                   \-> failed
recruiting/confirmed/ordering -> cancelled
```

- `confirmed`: at least one promotion threshold is met; joining may remain open until deadline or maximum capacity.
- `ordering`: deadline passed and merchant is preparing accepted orders.
- `cancelled`: explicit merchant/admin cancellation, not deletion.

History required: yes.

## Order

Schema values currently supported: `draft`, `submitted`, `locked`, `cancelled`, `completed`.

Current mobile also uses `readyForPickup`, which is not accepted by the database schema. Preferred resolution: keep the order `locked` while `pickupStatus = ready`, or formally add `ready_for_pickup` to the order status schema. Do not add another spelling before deciding.

Expected flow:

```text
draft -> submitted -> locked -> completed
   \        \          \-> cancelled
    \--------> cancelled
```

History required: yes, especially for edits after authorization.

## Payment

Values: `pending`, `authorized`, `captured`, `authorization_voided`, `failed`, `refunded`.

Expected flow:

```text
pending -> authorized -> captured
                    \-> authorization_voided
pending/authorized/captured -> failed (only for the applicable operation)
captured -> refunded
```

Provider events and idempotency records required: yes.

## Merchant Acceptance

Values: `pending`, `accepted`, `rejected`, `cancelled`.

Expected flow: `pending -> accepted/rejected/cancelled`.

## Pickup

Schema values: `not_ready`, `ready`, `picked_up`, `cancelled`, `expired`.

Current mobile also displays `preparing`; the development schema does not accept it. Preferred resolution: either add `preparing` to the schema or derive preparation from `merchantAcceptanceStatus = accepted` and activity `ordering`.

Expected flow:

```text
not_ready -> ready -> picked_up
not_ready/ready -> cancelled
ready -> expired
```

Pickup code visibility begins at `ready`, not merely at merchant acceptance.

## Discount Qualification

Mobile values: `not_yet_qualified`, `qualified`, `failed`.

This is preferably a derived or settlement outcome rather than a mutable activity status. At deadline, persist the authoritative result in `activity_settlements`.
