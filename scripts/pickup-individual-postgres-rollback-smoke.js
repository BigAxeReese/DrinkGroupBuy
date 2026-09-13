// Uses only the explicitly named development fixture; all mutations are rolled back.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const { createPickupCredentialRepository } = require('../backend/database/repositories/pickupCredentialRepository');

async function main() {
  const activityId = process.env.PICKUP_TEST_ACTIVITY_ID;
  assert.ok(activityId?.startsWith('activity-pickup-test-'), 'Explicit pickup test fixture required');
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(new URL(process.env.DATABASE_URL).hostname), 'Local database required');
  assert.ok(process.env.PICKUP_TEST_BACKUP_DIR, 'Private backup directory required');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const query = (...args) => client.query(...args);
  const database = { query, transaction: operation => operation({ query }) };
  const repository = createPickupCredentialRepository({ runtime: 'postgres', database });
  let before;
  async function snapshot() {
    return {
      activity: (await query('SELECT * FROM group_buy_activities WHERE id=$1', [activityId])).rows,
      orders: (await query('SELECT * FROM orders WHERE activity_id=$1 ORDER BY id', [activityId])).rows,
      credentials: (await query('SELECT * FROM pickup_credentials WHERE order_id IN (SELECT id FROM orders WHERE activity_id=$1) ORDER BY id', [activityId])).rows,
    };
  }
  try {
    await query('BEGIN');
    await query('SELECT id FROM group_buy_activities WHERE id=$1 FOR UPDATE', [activityId]);
    await query('SELECT id FROM orders WHERE activity_id=$1 ORDER BY id FOR UPDATE', [activityId]);
    before = await snapshot();
    assert.equal(before.orders.length, 3);
    assert.match(before.activity[0].title, /^測試用/);
    fs.mkdirSync(process.env.PICKUP_TEST_BACKUP_DIR, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(process.env.PICKUP_TEST_BACKUP_DIR, `${Date.now()}-individual-pickup-smoke.json`), JSON.stringify(before), { mode: 0o600, flag: 'wx' });
    await query('DELETE FROM pickup_credentials WHERE order_id IN (SELECT id FROM orders WHERE activity_id=$1)', [activityId]);
    await query("UPDATE orders SET status='locked',payment_status='captured',pickup_status='not_ready' WHERE activity_id=$1", [activityId]);
    await query("UPDATE group_buy_activities SET status='ordering' WHERE id=$1", [activityId]);
    const now = new Date(before.activity[0].pickup_start_at).toISOString();
    const actorUserId = before.activity[0].created_by_user_id;
    const [a,b,c] = before.orders.map(order => order.id);
    const mark = orderId => repository.markReady({ activityId, orderId, actorUserId, now });
    const first = await mark(a);
    assert.deepEqual(first.credentials.map(row => row.orderId), [a]);
    assert.equal(first.createdCredentialCount, 1);
    const partial = await snapshot();
    assert.deepEqual(partial.orders.map(row => row.pickup_status), ['ready','not_ready','not_ready']);
    assert.equal(partial.credentials.length, 1);
    const repeated = await mark(a);
    assert.equal(repeated.createdCredentialCount, 0);
    assert.equal(repeated.credentials[0].pickupCode, first.credentials[0].pickupCode);
    const redeemed = await repository.redeemCode({ pickupCode: first.credentials[0].pickupCode, actorUserId, now });
    assert.equal(redeemed.status, 'redeemed');
    assert.equal(redeemed.activityCompleted, false);
    assert.equal((await snapshot()).activity[0].status, 'ready_for_pickup');
    const second = await mark(b);
    assert.deepEqual(second.credentials.map(row => row.orderId), [b]);
    assert.equal((await snapshot()).orders.find(row => row.id === c).pickup_status, 'not_ready');
    const batch = await mark(undefined);
    assert.equal(batch.readyOrderCount, 1);
    assert.equal(batch.createdCredentialCount, 1);
    for (const credential of batch.credentials) {
      const result = await repository.redeemCode({ pickupCode: credential.pickupCode, actorUserId, now });
      assert.equal(result.status, 'redeemed');
    }
    assert.equal((await snapshot()).activity[0].status, 'completed');
    await query('SET CONSTRAINTS ALL IMMEDIATE');
  } finally {
    await query('ROLLBACK');
    try {
      if (before) assert.deepEqual(await snapshot(), before, 'Fixture must be unchanged after rollback');
    } finally { await client.end(); }
  }
  console.log('PASS: three-order readiness, repeat, partial pickup, subsequent readiness, batch, completion; all changes rolled back.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
