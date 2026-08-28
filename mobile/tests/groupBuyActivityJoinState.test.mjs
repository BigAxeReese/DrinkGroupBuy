import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../src/utils/groupBuyActivityJoinState.js", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const joinStateModule = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);

const { getGroupBuyActivityJoinAction } = joinStateModule;

test("customer with an existing order is sent to their order, even when the activity could still take more joins", () => {
  const action = getGroupBuyActivityJoinAction({ canJoin: true }, true);
  assert.equal(action.label, "前往我的訂單");
  assert.equal(action.target, "customerOrders");
});

test("customer without an order sees the join flow when the activity is open", () => {
  const action = getGroupBuyActivityJoinAction({ canJoin: true }, false);
  assert.equal(action.label, "選擇飲料並加入");
  assert.equal(action.target, "drinkSelection");
});

test("customer without an order sees a disabled state when the activity can't take more joins", () => {
  const action = getGroupBuyActivityJoinAction({ canJoin: false }, false);
  assert.equal(action.label, "目前不可加入");
  assert.equal(action.target, null);
});

test("having an existing order always wins over the activity being closed to new joins", () => {
  const action = getGroupBuyActivityJoinAction({ canJoin: false }, true);
  assert.equal(action.label, "前往我的訂單");
  assert.equal(action.target, "customerOrders");
});
