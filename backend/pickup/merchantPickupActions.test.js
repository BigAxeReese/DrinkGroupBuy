const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
for (const [file, name] of [
 ['../db.js', 'getMerchantOrderAvailableActions'],
 ['../database/repositories/customerOrderReadRepository.js', 'getPostgresMerchantAvailableActions'],
]) {
 const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
 const start = source.indexOf(`function ${name}(`);
 const end = source.indexOf('\nfunction ', start + 1);
 const actions = vm.runInNewContext(`(${source.slice(start, end).trim()})`);
 test(`${file}: remaining orders can be marked after first order is ready`, () => {
  for(const status of ['ordering', 'ready_for_pickup']) {
   assert.ok(actions({paymentStatus:'captured',pickupStatus:'not_ready'}, {activity:{status},pickupCredential:{status:'unavailable'}}).includes('markReadyForPickup'));
  }
 });
 test(`${file}: only captured, not-ready orders have mark-ready action`, () => {
  for(const pickupStatus of ['ready','picked_up','cancelled','expired']) {
   assert.equal(actions({paymentStatus:'captured',pickupStatus},{activity:{status:'ready_for_pickup'},pickupCredential:{status:'active'}}).includes('markReadyForPickup'),false);
  }
  for(const paymentStatus of ['pending','authorized','failed','refunded']) {
   assert.equal(actions({paymentStatus,pickupStatus:'not_ready'},{activity:{status:'ordering'},pickupCredential:{}}).includes('markReadyForPickup'),false);
  }
  for(const status of ['recruiting','failed','cancelled','completed']) {
   assert.equal(actions({paymentStatus:'captured',pickupStatus:'not_ready'},{activity:{status},pickupCredential:{}}).includes('markReadyForPickup'),false);
  }
 });
}
