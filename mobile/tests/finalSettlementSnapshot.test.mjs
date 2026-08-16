import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../src/utils/groupBuyActivityProgress.js", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const progressModule = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);

const { getFinalSettlementSnapshot } = progressModule;

test("final settlement snapshot exposes immutable activity and customer amounts", () => {
  const snapshot = getFinalSettlementSnapshot({
    settlement: {
      outcome: "qualified",
      authorizedCups: 23,
      discountPerCup: 8,
      allocatedDiscountAmount: 184,
      undistributedDiscountAmount: 16,
      settledAt: "2026-08-15T02:00:00.000Z"
    }
  }, {
    originalAmount: 150,
    finalAmount: 134
  });

  assert.deepEqual(snapshot, {
    hasOrder: true,
    outcome: "qualified",
    outcomeLabel: "已達優惠門檻",
    authorizedCups: 23,
    discountPerCup: 8,
    allocatedDiscountAmount: 184,
    undistributedDiscountAmount: 16,
    originalAmount: 150,
    finalAmount: 134,
    orderDiscountAmount: 16,
    settledAt: "2026-08-15T02:00:00.000Z"
  });
});

test("failed settlement keeps the original amount and reports zero discount", () => {
  const snapshot = getFinalSettlementSnapshot({
    settlement: {
      outcome: "failed",
      authorizedCups: 8,
      discountPerCup: 0,
      allocatedDiscountAmount: 0,
      undistributedDiscountAmount: 0
    }
  }, {
    subtotal: 80,
    finalAmount: 80
  });

  assert.equal(snapshot.outcomeLabel, "未達優惠門檻");
  assert.equal(snapshot.orderDiscountAmount, 0);
  assert.equal(snapshot.finalAmount, 80);
});

test("activity without a backend settlement does not create a final snapshot", () => {
  assert.equal(getFinalSettlementSnapshot({ status: "recruiting" }, null), null);
});
