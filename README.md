# BGB Payments

BGB 的線上交易金流串接基礎架構。這個版本先建立可替換 provider 的後端骨架，預設使用 `mock` provider 讓你可以在本機跑完整流程。

## 結構

```text
BGB/
  server.js                  HTTP server and routes
  src/
    config.js                Environment configuration
    db.js                    SQLite schema and helpers
    http.js                  HTTP utility functions
    payments/
      service.js             Payment workflow and webhook orchestration
      providers/
        index.js             Provider registry
        mockProvider.js      Local development provider
  public/
    index.html               Minimal API status page
```

## 快速開始

```powershell
Copy-Item .env.example .env
node server.js
```

Open:

```text
http://127.0.0.1:8100
```

## API

### Create checkout

```http
POST /api/checkout
Content-Type: application/json

{
  "orderNumber": "BGB-20260520-001",
  "amount": 1200,
  "currency": "TWD",
  "description": "BGB order",
  "customerEmail": "buyer@example.com",
  "returnUrl": "http://127.0.0.1:8100/thank-you"
}
```

Response includes `paymentId`, `orderId`, `status`, and `checkoutUrl`.

### Query payment

```http
GET /api/payments/{paymentId}
```

### Webhook endpoint

```http
POST /payments/{provider}/webhook
```

Webhook handling is idempotent by `provider + eventId`. Real providers should be added as modules that implement:

- `createPayment(context)`
- `verifyWebhook({ headers, rawBody })`
- `normalizeWebhook(payload)`

## Local mock flow

Create a checkout, then POST:

```http
POST /api/mock/payments/{paymentId}/succeed
```

This simulates a successful provider webhook and updates the payment and order status.
