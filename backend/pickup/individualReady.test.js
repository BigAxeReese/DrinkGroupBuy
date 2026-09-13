const test = require('node:test');
const assert = require('node:assert/strict');
const { createPickupCredentialRepository } = require('../database/repositories/pickupCredentialRepository');
const { markGroupBuyActivityReadyForPickup } = require('./credentialService');

const now = '2026-09-13T01:00:00.000Z';
function fixture({ canManage = true, eligible = true, alreadyReady = false } = {}) {
  const calls = [];
  const credential = { id: 'credential-a', order_id: 'order-a', pickup_code: '123456', expires_at: '2026-09-13T05:00:00.000Z' };
  const database = {
    transaction: async (operation) => operation(database),
    async query(sql, params) {
      sql = sql.replace(/\s+/g, ' ').trim();
      calls.push({ sql, params });
      if (sql.includes('AS can_manage')) return { rows: [{ id: 'activity-a', can_manage: canManage, status: alreadyReady ? 'ready_for_pickup' : 'ordering', pickup_start_at: '2026-09-13T02:00:00.000Z', pickup_end_at: credential.expires_at }] };
      if (sql.startsWith('SELECT id, pickup_status')) {
        assert.match(sql, /activity_id = \$1 AND \(\$2::text IS NULL OR id = \$2\)/);
        assert.match(sql, /payment_status = 'captured'/);
        assert.match(sql, /status != 'cancelled'/);
        assert.match(sql, /pickup_status IN \('not_ready', 'ready'\)/);
        assert.match(sql, /FOR UPDATE$/);
        return { rows: eligible ? [{ id: 'order-a', pickup_status: alreadyReady ? 'ready' : 'not_ready' }] : [] };
      }
      if (sql.startsWith('UPDATE orders')) return { rowCount: alreadyReady ? 0 : 1 };
      if (sql.startsWith('SELECT * FROM pickup_credentials')) return { rows: [credential] };
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
