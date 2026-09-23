import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source = await readFile(new URL('../src/state/AppStateProvider.jsx',import.meta.url),'utf8');
const start = source.indexOf('    captureQualifiedPayment(');
const end = source.indexOf('    async syncOrderFromBackend(',start);
const createActions = new Function('setOrders','setPaymentAuthorizations', `return ({${source.slice(start,end)}});`);
test('mock capture keeps pending production visible and does not reset ready orders',()=>{
 for(const [before,expected] of [['not_ready','not_ready'],['preparing','not_ready'],['ready','ready'],['picked_up','picked_up']]){
  let orders=[{id:'a',pickupStatus:before,authorizedAmount:100},{id:'b',pickupStatus:'not_ready',paymentStatus:'authorized'}];
  createActions(update=>{orders=update(orders);},()=>{}).captureQualifiedPayment('a',80);
  assert.equal(orders[0].pickupStatus,expected);
  assert.equal(orders[0].paymentStatus,'captured');
  assert.equal(orders[1].paymentStatus,'authorized');
 }
});
