# Status Candidates For Frontend Prototype

## 重要聲明

本文件整理畫面已出現及規劃中必要的 status candidates。它們用於釐清狀態流轉，不是正式後端狀態機或 database enum。

目前程式使用 snake_case 或簡短值，早期規劃文件亦出現 camelCase 候選。正式化前必須選定一套命名。

## Group Buy Activity Status

| 項目 | 內容 |
| --- | --- |
| status owner | 團購活動 / `group_buy_activity` |
| status values | 已出現在畫面：`recruiting`, `confirmed`, `failed`, `cancelled`; 尚待決定是否需要：`full`, `judging`, `completed` |
| meaning | `recruiting` 招募中；`confirmed` 已成團；`failed` 流團；`cancelled` 商家或後台取消；`full` 達最高杯數；`judging` 截止判定中；`completed` 活動履約完成 |
| shown in which screens | `NearbyDealsPage`, `DealDetailPage`, `GroupProgressPage`, `MerchantDealDashboardPage` |
| possible transitions | `recruiting -> confirmed`；`recruiting -> failed`；`recruiting -> cancelled`；候選 `recruiting -> full -> recruiting`（退出後重開）；候選 `recruiting/full -> judging -> confirmed/failed`; `confirmed -> completed` |
| invalid transitions | `cancelled -> recruiting/confirmed`；`failed -> recruiting`；`completed -> recruiting`；未經規則不可將 `confirmed -> failed` |
| whether status history is needed | 是；需保存截止判定、取消者/原因、額滿與重新開放事件 |
| uncertainty | `full` 與 `judging` 是否實際存在；首頁是否展示結束狀態；流團但個別原價履約時活動仍是否為 `failed` |

## Customer Order Status

| 項目 | 內容 |
| --- | --- |
| status owner | 顧客訂單 / `order` |
| status values | 畫面尚未直接顯示 badge；候選：`submitted`, `locked`, `confirmed`, `original_price_confirmed`, `cancelled`, `completed` |
| meaning | `submitted` 已加入且截止前可依規則修改；`locked` 截止鎖定；`confirmed` 成團成立；`original_price_confirmed` 流團但接受原價；`cancelled` 退出、活動取消或不接受原價；`completed` 取貨完成 |
| shown in which screens | `GroupProgressPage` 以訂單摘要暗示；規劃中的我的訂單頁需直接呈現 |
| possible transitions | `submitted -> locked -> confirmed/original_price_confirmed/cancelled`；`submitted -> cancelled`（截止前退出）；`confirmed/original_price_confirmed -> completed` |
| invalid transitions | `completed -> submitted`；截止後 `locked -> submitted`；付款已完成後任意回到可編輯狀態 |
| whether status history is needed | 是；修改、退出、截止判定及取消均會影響杯數與付款 |
| uncertainty | 是否需要獨立 `locked`；同顧客同活動一張或多張訂單；活動取消與顧客退出是否共用 `cancelled` 原因欄位 |

## Payment Status And Payment Report Status

| 項目 | 內容 |
| --- | --- |
| status owner | 付款流程 / `payment`; 手動回報 / `payment_report` |
| status values | 程式現有 payment 顯示值：`pending`, `submitted`, `confirmed`, `not_required`; 線上付款候選：`authorization_pending`, `authorized`, `capture_pending`, `captured`, `released`, `failed`; 手動回報候選：`submitted`, `under_review`, `verified`, `rejected` |
| meaning | 程式現有 `submitted` 實際表達付款回報已送出；線上方案則需以授權/請款/釋放表示；`not_required` 表示不需付款 |
| shown in which screens | `PaymentReportPage`; `MerchantDealDashboardPage` 以摘要暗示 |
| possible transitions | 手動方案：`pending -> submitted -> verified/rejected`; 線上方案：`authorization_pending -> authorized -> captured` 或 `authorized -> released`; 任一處理可至 `failed`; 無需付款可進入 `not_required` |
| invalid transitions | `not_required -> captured`；`released -> captured`（除非重新授權）；不應將 `payment_report.submitted` 當作款項已確認 |
| whether status history is needed | 是；涉及金額、審核、釋放與爭議 |
| uncertainty | 手動回報是否保留；商家確認是 review 或只看 provider 結果；程式 status 需重新命名避免混淆 |

## Pickup Status

| 項目 | 內容 |
| --- | --- |
| status owner | 個人取貨 / `order_pickup` |
| status values | 程式現有：`pending`, `ready`, `picked_up`, `cancelled`; 命名候選：`not_available`, `scheduled`, `ready_for_pickup`, `picked_up`, `cancelled` |
| meaning | `pending/not_available` 尚未具備取貨資格；`scheduled` 已成立且指定時段；`ready/ready_for_pickup` 可取貨；`picked_up` 完成核銷；`cancelled` 不需或不可取貨 |
| shown in which screens | `PickupInfoPage`; `MerchantDealDashboardPage` 以摘要暗示 |
| possible transitions | `pending -> scheduled -> ready_for_pickup -> picked_up`; 任一履約前狀態可因活動取消至 `cancelled` |
| invalid transitions | `cancelled -> picked_up`; `picked_up -> ready_for_pickup`; 未成立訂單直接 `pending -> picked_up` |
| whether status history is needed | 若提供核銷或取貨時間異動則需要 |
| uncertainty | `ready` 與 `ready_for_pickup` 的統一命名；取貨時間到達是否自動改狀態；識別/核銷方式 |

## Shop Business Status

| 項目 | 內容 |
| --- | --- |
| status owner | 門市 / `shop` |
| status values | prototype 文字值：`營業中`, `休息中`; candidate machine values：`open`, `closed`, `temporarily_closed` |
| meaning | 表達門市目前營業顯示狀態，不等同團購活動狀態 |
| shown in which screens | `NearbyDealsPage`, `DealDetailPage` |
| possible transitions | `open <-> closed`; `open/closed -> temporarily_closed` |
| invalid transitions | 未定；屬外部或商家維護資料 |
| whether status history is needed | 視是否影響已發布活動與爭議處理而定 |
| uncertainty | 狀態來源、更新時效與休息中是否禁止加入活動 |

## Cross-Status Dependencies

| Dependency | Candidate rule | Uncertainty |
| --- | --- | --- |
| Activity -> Order | 活動截止結果決定訂單是否成立、原價成立或取消 | 部分成立如何呈現 |
| Order -> Payment | 只有需履約訂單才進入付款或請款 | 加入時是否先預授權 |
| Order -> Pickup | 只有成立且付款符合規則的訂單可取貨 | 是否需先確認付款 |
| Cancellation -> Payment/Pickup | 活動取消需阻止取貨並處理付款釋放/回報 | 手動與線上模式處理不同 |
| Activity capacity -> Join | 達最高杯數後停止新加入 | 有人退出是否重新開放 |
## Mobile Prototype Status Addendum

The Android-first prototype currently uses these status groups in `mobile/src/types/prototypeTypes.js`.

| Status owner | Status values | Meaning | Shown in which screens | Possible transitions | Invalid transitions | Whether status history is needed | Uncertainty |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Prototype role selection | `customer`, `merchant` candidate only | Local-only role switch for prototype navigation | RoleSelectScreen, bottom navigation | `none -> customer/merchant`; `customer <-> merchant` in prototype only | Treating prototype switch as real authorization | No for prototype; yes if role grants become real | Whether one production app has both roles |
| Deal/activity | `recruiting`, `formed`, `failed`, `cancelled`, `full` | Recruiting, successful, failed, cancelled, or max-cap reached | NearbyDealsScreen, DealDetailScreen, GroupProgressScreen, MerchantDashboardScreen | `recruiting -> formed/failed/cancelled/full`; `full -> formed/cancelled` candidate | `cancelled -> recruiting`; `failed -> recruiting` without new activity | Yes | Whether `full` is a terminal status or a join lock state |
| Payment | `pending`, `confirmed`, `not_required`, `authorized`, `captured`, `released`, `failed` | Online payment status candidates for Line Pay direction | PaymentReportScreen, MerchantDashboardScreen | `pending -> authorized/confirmed/captured`; `authorized -> captured/released/failed` | `captured -> pending`; `released -> captured` without new auth | Yes | Need exact Line Pay authorization/capture model |
| Pickup | `not_ready`, `ready`, `picked_up`, `cancelled`, `expired` | Pickup availability and completion | PickupInfoScreen, MerchantDashboardScreen | `not_ready -> ready -> picked_up`; `ready -> expired/cancelled` | `picked_up -> ready`; `cancelled -> ready` | Yes | Pickup verification method undecided |
| Store business | `open`, `closed`, `temporarily_closed` | Store availability for browsing | NearbyDealsScreen, DealDetailScreen, MerchantDealCreateScreen | `open <-> closed`; `open/closed -> temporarily_closed` | None yet | Maybe | Business hours source not defined |

### Mobile Interaction Status Notes

| Status owner | Added or clarified values | Meaning | Shown in which screens | Possible transitions | Invalid transitions | Whether status history is needed | Uncertainty |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Deal/activity | `confirmed` is now used by mobile prototype as the displayed formed status; `formed` remains a legacy/candidate alias | Deal has met the target cups | NearbyDealsScreen, DealDetailScreen, GroupProgressScreen, MerchantDashboardScreen | `recruiting -> confirmed`; `recruiting -> failed/cancelled/full` | `cancelled -> confirmed` without new activity | Yes | Need one canonical value before formal API |
| Order | `pending_payment` candidate implied by join mock, though current runtime stores payment status separately | Order exists but payment not complete | GroupProgressScreen, PaymentReportScreen | `draft -> submitted -> pending_payment -> completed/cancelled` candidate | `completed -> draft` | Yes | Whether order and payment states should be separated |
| Payment provider | `pending -> confirmed` is implemented as runtime mock | Customer completed Line Pay payment in prototype | PaymentReportScreen, MerchantDashboardScreen summary | `pending -> authorized/confirmed/captured/failed` | `confirmed -> pending` without reversal | Yes | Prototype currently skips provider callback details |
| Pickup | `not_ready` remains default after mock join | Pickup is not available until settlement/payment conditions are met | PickupInfoScreen | `not_ready -> ready -> picked_up` | `picked_up -> not_ready` | Yes | Whether pickup status is stored or derived |

## Authorization And Partial Capture Addendum

| Status owner | Status values | Meaning | Shown in which screens | Possible transitions | Invalid transitions | Whether status history is needed | Uncertainty |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Payment authorization | `pending`, `authorized`, `authorization_voided`, `failed` | Authorization has not started, succeeded, been voided, or failed | PaymentReportScreen, GroupProgressScreen, CustomerOrdersScreen | `pending -> authorized`; `pending -> failed`; `authorized -> authorization_voided`; `authorized -> captured` via payment status | `authorization_voided -> captured` without new authorization; `failed -> captured` without retry | Yes | Provider-specific authorization expiry and retry behavior |
| Payment settlement | `authorized`, `capture_pending`, `captured`, `capture_failed`, `released`, `partially_released` | After authorization, the system captures discounted amount or releases/voids authorization | PaymentReportScreen, GroupProgressScreen, MerchantDashboardScreen | `authorized -> capture_pending -> captured`; `authorized -> authorization_voided`; `capture_failed -> capture_pending` candidate | `captured -> authorized` without refund/reversal record | Yes | Whether provider exposes release as separate event |
| Discount qualification | `not_yet_qualified`, `qualified`, `failed` | Authorized cups have not reached target, reached target, or final deadline failed | GroupProgressScreen, NearbyDealsScreen candidate, MerchantDashboardScreen | `not_yet_qualified -> qualified`; `not_yet_qualified -> failed` at deadline | `failed -> qualified` without reopening activity; `qualified -> not_yet_qualified` after capture lock candidate | Yes | Whether withdrawals after target are allowed before deadline |

### Status Naming Notes

- `confirmed` should not mean payment success in the authorization-first flow. It should remain a deal/order outcome candidate only if retained.
- `submitted` payment report is legacy manual-transfer wording and should not be used for Line Pay authorization screens.
- `authorizationStatus` and `paymentStatus` may both exist, but the database/API must define which one is source of truth.
