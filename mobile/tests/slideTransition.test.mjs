import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/navigation/slideTransition.js", import.meta.url), "utf8");
const { SLIDE_TAB_ORDER, getSlideDirection } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);

test("moving to a tab further right slides the new screen in from the right", () => {
  assert.equal(getSlideDirection("nearby", "liveMap"), 1);
  assert.equal(getSlideDirection("nearby", "profile"), 1);
  assert.equal(getSlideDirection("liveMap", "customerOrders"), 1);
});

test("moving to a tab further left slides the new screen in from the left", () => {
  assert.equal(getSlideDirection("profile", "nearby"), -1);
  assert.equal(getSlideDirection("customerOrders", "liveMap"), -1);
});

test("no slide for the same tab or for routes that are not both tabs", () => {
  assert.equal(getSlideDirection("nearby", "nearby"), 0);
  assert.equal(getSlideDirection("nearby", "groupBuyActivityDetail"), 0);
  assert.equal(getSlideDirection("cart", "profile"), 0);
  assert.equal(getSlideDirection("roleSelect", "nearby"), 0);
  assert.equal(getSlideDirection(undefined, "nearby"), 0);
});

test("the slide order matches the customer tabs in the bottom navigation", async () => {
  const nav = await readFile(new URL("../src/components/BottomNav.jsx", import.meta.url), "utf8");
  const customerRoutes = [...nav.matchAll(/route: "(\w+)"[^\n]*roles: \["customer"\]/g)].map((match) => match[1]);
  assert.deepEqual(SLIDE_TAB_ORDER, customerRoutes);
});
