# DrinkGroupBuy Backend

This is the first backend scaffold for the full-stack DrinkGroupBuy app.

## Current Scope

Implemented:

- `GET /health`
- `GET /api/group-buy-activities`
- `POST /api/merchant/group-buy-activities`
- `DELETE /api/admin/group-buy-activities/:activityId`

Not implemented yet:

- real authentication
- merchant permission checks
- real payment provider integration
- webhook handling
- production migrations

## Start

From project root:

```powershell
npm run db:init
npm run db:seed
npm run backend:start
```

Backend default URL:

```text
http://localhost:3000
```

## Create Activity Example

```powershell
$body = @{
  storeId = "store-001"
  createdByUserId = "user-merchant-001"
  title = "滿 20 杯折 200"
  startAt = "2026-06-05T14:00:00+08:00"
  deadlineAt = "2026-06-05T15:30:00+08:00"
  pickupStartAt = "2026-06-05T16:00:00+08:00"
  pickupEndAt = "2026-06-05T16:30:00+08:00"
  tiers = @(
    @{ targetCups = 20; discountAmount = 200 },
    @{ targetCups = 30; discountAmount = 450 }
  )
} | ConvertTo-Json -Depth 5

Invoke-RestMethod `
  -Uri http://localhost:3000/api/merchant/group-buy-activities `
  -Method Post `
  -ContentType "application/json" `
  -Body $body
```

## Admin Delete Activity Example

This is a prototype soft delete. It changes the activity status to `cancelled` and writes status / audit records.

```powershell
$body = @{
  actorUserId = "user-admin-001"
  reason = "Admin cancelled from prototype dashboard"
} | ConvertTo-Json

Invoke-RestMethod `
  -Uri http://localhost:3000/api/admin/group-buy-activities/activity-id `
  -Method Delete `
  -ContentType "application/json" `
  -Body $body
```
