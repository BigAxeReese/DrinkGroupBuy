const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

for (const file of ['../db.js', '../database/repositories/customerOrderReadRepository.js']) {
  const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
  const start = source.indexOf('function getOrderLifecycleBucket(');
  const end = source.indexOf('\nfunction ', start + 1);
  const getOrderLifecycleBucket = vm.runInNewContext(`(${source.slice(start, end).trim()})`);
  const now = '2026-09-13T10:00:00.000Z';
  const context = { activity: { pickupStartAt: '2026-09-13T12:00:00.000Z' } };

  test(`${file}: a voided or refunded order moves to history immediately (group buy failed to meet target)`, () => {
    assert.equal(getOrderLifecycleBucket({ status: 'locked', pickupStatus: 'not_ready', paymentStatus: 'authorization_voided' }, context, now), 'history');
    assert.equal(getOrderLifecycleBucket({ status: 'locked', pickupStatus: 'not_ready', paymentStatus: 'refunded' }, context, now), 'history');
  });

  test(`${file}: a failed payment stays active until 15 minutes before pickup, then moves to history`, () => {
    assert.equal(getOrderLifecycleBucket({ status: 'submitted', pickupStatus: 'not_ready', paymentStatus: 'failed' }, context, '2026-09-13T11:00:00.000Z'), 'active');
    assert.equal(getOrderLifecycleBucket({ status: 'submitted', pickupStatus: 'not_ready', paymentStatus: 'failed' }, context, '2026-09-13T11:45:00.000Z'), 'history');
  });

  test(`${file}: an order still awaiting payment or in production stays active`, () => {
    for (const paymentStatus of ['pending', 'authorized', 'captured']) {
      assert.equal(getOrderLifecycleBucket({ status: 'submitted', pickupStatus: 'not_ready', paymentStatus }, context, now), 'active');
    }
  });
}
