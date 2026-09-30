const test = require('node:test');
const assert = require('node:assert/strict');
const { createPickupCredentialRepository } = require('../database/repositories/pickupCredentialRepository');
const { markGroupBuyActivityReadyForPickup, buildPickupReadyNotification } = require('./credentialService');

const now = '2026-09-13T01:00:00.000Z';
function fixture({ canManage = true, eligible = true, alreadyReady = false } = {}) {
  const calls = [];
  const credential = { id: 'credential-a', order_id: 'order-a', pickup_code: '123456', expires_at: '2026-09-13T05:00:00.000Z' };
  const database = {
    transaction: async (operation) => operation(database),
    async query(sql, params) {
      sql = sql.replace(/\s+/g, ' ').trim();
      calls.push({ sql, params });
      if (sql.includes('AS can_manage')) return { rows: [{ id: 'activity-a', store_name: 'Test Store', can_manage: canManage, status: alreadyReady ? 'ready_for_pickup' : 'ordering', pickup_start_at: '2026-09-13T02:00:00.000Z', pickup_end_at: credential.expires_at }] };
      if (sql.startsWith('SELECT id, pickup_status')) {
        assert.match(sql, /activity_id = \$1 AND \(\$2::text IS NULL OR id = \$2\)/);
        assert.match(sql, /payment_status = 'captured'/);
        assert.match(sql, /status != 'cancelled'/);
        assert.match(sql, /pickup_status IN \('not_ready', 'ready'\)/);
        assert.match(sql, /FOR UPDATE$/);
        return { rows: eligible ? [{ id: 'order-a', pickup_status: alreadyReady ? 'ready' : 'not_ready', customer_user_id: 'customer-a' }] : [] };
      }
      if (sql.startsWith('UPDATE orders')) return { rowCount: alreadyReady ? 0 : 1 };
      if (sql.startsWith('SELECT * FROM pickup_credentials')) return { rows: [credential] };
      if (sql.startsWith('INSERT INTO operation_locks')) {
        return { rows: [{ lock_key: params[0], owner_id: params[1], locked_until: params[2] }] };
      }
      if (sql.startsWith('DELETE FROM operation_locks')) return { rowCount: 1 };
      if (/^(UPDATE|INSERT)/.test(sql)) return { rowCount: 1, rows: [] };
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  };
  return { calls, repository: createPickupCredentialRepository({ runtime: 'postgres', database }) };
}

test('single-order readiness scopes locked selection and audit to requested order', async () => {
  const { repository, calls } = fixture();
  const result = await repository.markReady({ activityId: 'activity-a', orderId: 'order-a', actorUserId: 'merchant-a', now });
  assert.equal(result.readyOrderCount, 1);
  assert.deepEqual(result.credentials.map(c => c.orderId), ['order-a']);
  assert.equal(result.credentials[0].status, 'active');
  assert.deepEqual(calls.find(c => c.sql.startsWith('SELECT id, pickup_status')).params, ['activity-a', 'order-a']);
  assert.deepEqual(calls.filter(c => c.sql.startsWith('UPDATE orders')).map(c => c.params[1]), ['order-a']);
  assert.equal(JSON.parse(calls.find(c => c.sql.startsWith('INSERT INTO audit_logs')).params[5]).orderId, 'order-a');
});

test('batch requests retain null order filter', async () => {
  const { repository, calls } = fixture();
  await repository.markReady({ activityId: 'activity-a', actorUserId: 'merchant-a', now });
  assert.deepEqual(calls.find(c => c.sql.startsWith('SELECT id, pickup_status')).params, ['activity-a', null]);
});

test('ineligible or foreign-activity order causes no writes', async () => {
  const { repository, calls } = fixture({ eligible: false });
  const result = await repository.markReady({ activityId: 'activity-a', orderId: 'foreign-order', actorUserId: 'merchant-a', now });
  assert.equal(result.error, 'no_captured_orders');
  assert.equal(calls.some(c => /^(UPDATE|INSERT)/.test(c.sql)), false);
});

test('unauthorized merchant cannot select or update orders', async () => {
  const { repository, calls } = fixture({ canManage: false });
  assert.equal((await repository.markReady({ activityId: 'activity-a', orderId: 'order-a', actorUserId: 'foreign-merchant', now })).error, 'activity_access_denied');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].params, ['foreign-merchant', 'activity-a']);
  assert.match(calls[0].sql, /merchant_user.store_id = activity.store_id/);
});

test('repeated single-order readiness reuses credential without new history or audit', async () => {
  const { repository, calls } = fixture({ alreadyReady: true });
  const result = await repository.markReady({ activityId: 'activity-a', orderId: 'order-a', actorUserId: 'merchant-a', now });
  assert.equal(result.readyOrderCount, 0);
  assert.equal(result.createdCredentialCount, 0);
  assert.equal(result.credentials[0].pickupCode, '123456');
  assert.equal(calls.some(c => c.sql.startsWith('INSERT')), false);
});

test('service passes single-order selector under the existing activity lock', async () => {
  let locked = false;
  await markGroupBuyActivityReadyForPickup('activity-a', {
    orderId: 'order-a', actorUserId: 'merchant-a', now,
    pickupCredentialRepository: {
      kind: 'postgres',
      async withOperationLock(input, operation) {
        assert.deepEqual(input, { activityId: 'activity-a' });
        locked = true;
        return operation();
      },
      async markReady(input) {
        assert.equal(locked, true);
        assert.deepEqual(input, { activityId: 'activity-a', orderId: 'order-a', actorUserId: 'merchant-a', now });
      }
    }
  });
});

test('marking ready surfaces the customer id and store name for notification', async () => {
  const { repository } = fixture();
  const result = await repository.markReady({ activityId: 'activity-a', orderId: 'order-a', actorUserId: 'merchant-a', now });
  assert.deepEqual(result.readyOrderCustomerUserIds, ['customer-a']);
  assert.equal(result.storeName, 'Test Store');
});

test('repeated readiness for an already-ready order does not re-surface its customer for notification', async () => {
  const { repository } = fixture({ alreadyReady: true });
  const result = await repository.markReady({ activityId: 'activity-a', orderId: 'order-a', actorUserId: 'merchant-a', now });
  assert.deepEqual(result.readyOrderCustomerUserIds, []);
});

test('buildPickupReadyNotification mentions the store name when known', () => {
  const notification = buildPickupReadyNotification({ customerUserIds: ['customer-a', 'customer-b'], storeName: 'Test Store' });
  assert.deepEqual(notification.userIds, ['customer-a', 'customer-b']);
  assert.equal(notification.title, '飲料可以領取囉！');
  assert.match(notification.body, /Test Store/);
});

test('buildPickupReadyNotification falls back to generic wording when the store name is unknown', () => {
  const notification = buildPickupReadyNotification({ customerUserIds: ['customer-a'], storeName: undefined });
  assert.doesNotMatch(notification.body, /undefined/);
  assert.match(notification.body, /你的訂單已經可以領取/);
});

test('marking ready notifies the newly-ready order\'s customer and does not leak internal fields into the HTTP response', async (t) => {
  const fetchCalls = [];
  t.mock.method(global, 'fetch', async (url, options) => {
    fetchCalls.push({ url, options });
    return { ok: true, status: 200 };
  });

  const result = await markGroupBuyActivityReadyForPickup('activity-a', {
    orderId: 'order-a', actorUserId: 'merchant-a', now,
    pickupCredentialRepository: fixture().repository,
    pushTokenRepository: {
      getPushTokensForUsers: async (userIds) => {
        assert.deepEqual(userIds, ['customer-a']);
        return ['ExponentPushToken[xxx]'];
      }
    }
  });

  assert.equal('readyOrderCustomerUserIds' in result, false);
  assert.equal('storeName' in result, false);
  assert.equal(fetchCalls.length, 1);
  const messages = JSON.parse(fetchCalls[0].options.body);
  assert.deepEqual(messages, [{
    to: 'ExponentPushToken[xxx]',
    title: '飲料可以領取囉！',
    body: '你在 Test Store 的訂單已經可以領取',
    data: { type: 'pickup_ready' }
  }]);
});

test('marking an already-ready order does not send a duplicate notification', async (t) => {
  const fetchMock = t.mock.method(global, 'fetch', async () => {
    throw new Error('fetch should not be called');
  });

  const result = await markGroupBuyActivityReadyForPickup('activity-a', {
    orderId: 'order-a', actorUserId: 'merchant-a', now,
    pickupCredentialRepository: fixture({ alreadyReady: true }).repository,
    pushTokenRepository: { getPushTokensForUsers: async () => ['ExponentPushToken[xxx]'] }
  });

  assert.equal('readyOrderCustomerUserIds' in result, false);
  assert.equal(fetchMock.mock.callCount(), 0);
});
