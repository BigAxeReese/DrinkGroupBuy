import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../src/types/prototypeTypes.js", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const labelModule = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);

const { merchantPaymentStatusLabels, paymentStatusLabels } = labelModule;

test("customer sees authorized as order established and captured as paid", () => {
  assert.equal(paymentStatusLabels.authorized, "訂單成立");
  assert.equal(paymentStatusLabels.captured, "已付款");
});

test("merchant sees authorized as paid and failed as pending payment", () => {
  assert.equal(merchantPaymentStatusLabels.authorized, "已付款");
  assert.equal(merchantPaymentStatusLabels.failed, "待付款");
});

test("shared terminal payment labels stay consistent", () => {
  assert.equal(paymentStatusLabels.authorization_voided, "授權已取消");
  assert.equal(merchantPaymentStatusLabels.refunded, "已退款");
});
