import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../src/utils/apiClient.js', import.meta.url), 'utf8');
const start = source.indexOf('export async function markGroupBuyActivityReadyForPickup(');
const end = source.indexOf('\nexport async function lookupPickupCredential', start);
const { markGroupBuyActivityReadyForPickup: request } = await import('data:text/javascript;base64,' + Buffer.from('const postPickupRequest = async (path) => path;\n' + source.slice(start, end)).toString('base64'));
test('single pickup uses a distinct URL that an older bulk-only backend cannot accept', async () => {
 assert.equal(await request('activity-a', 'order-a'), '/api/merchant/group-buy-activities/activity-a/orders/order-a/ready-for-pickup');
 assert.equal(await request('activity-a'), '/api/merchant/group-buy-activities/activity-a/ready-for-pickup');
 assert.equal(await request('activity/a', 'order/a'), '/api/merchant/group-buy-activities/activity%2Fa/orders/order%2Fa/ready-for-pickup');
});
test('invalid explicit order selector cannot become a bulk request', async () => {
 for(const id of [null, '', ' ', 5]) await assert.rejects(request('activity-a', id), /invalid_order_id/);
});
