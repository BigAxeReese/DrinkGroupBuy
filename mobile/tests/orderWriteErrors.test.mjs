import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../src/utils/orderWriteErrors.js", import.meta.url);
let source = await readFile(sourceUrl, "utf8");
// Stub out the real formatDeadlineLabel (pulls in deadlineTime.js's own module graph) with a
// fixed, recognizable string -- the test only needs to confirm the label gets embedded, not
// exercise the date-formatting logic itself, which deadlineTime.test.mjs already covers.
source = source.replace(
  'import { formatDeadlineLabel } from "./deadlineTime";',
  'const formatDeadlineLabel = (value) => `<formatted:${value}>`;'
);
const errorsModule = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);

const { getOrderWriteErrorMessage } = errorsModule;

test("known order-write error codes get Traditional Chinese messages, not raw backend codes", () => {
  assert.equal(
    getOrderWriteErrorMessage({ error: "order_price_changed" }, "fallback"),
    "菜單價格已更新，請重新確認購物車金額後再送出。"
  );
  assert.equal(
    getOrderWriteErrorMessage({ error: "activity_not_joinable" }, "fallback"),
    "這個團購目前無法加入或修改，可能已截止或已取消。"
  );
  assert.equal(
    getOrderWriteErrorMessage({ error: "order_revision_already_pending" }, "fallback"),
    "這筆訂單已經有一筆修改正在處理中，請先完成付款或稍後再試。"
  );
  assert.equal(
    getOrderWriteErrorMessage({ error: "order_authorization_missing" }, "fallback"),
    "找不到這筆訂單的付款授權紀錄，請聯繫客服協助處理。"
  );
});

test("capacity_exceeded includes the actual numbers when the backend provides them", () => {
  const message = getOrderWriteErrorMessage(
    { error: "capacity_exceeded", maximumCups: 30, authorizedCups: 28, requestedCups: 5 },
    "fallback"
  );
  assert.equal(message, "此團購最多 30 杯，目前已有 28 杯，無法再加入 5 杯。");
});

test("capacity_exceeded falls back to a generic message when the numbers are missing", () => {
  const message = getOrderWriteErrorMessage({ error: "capacity_exceeded" }, "fallback");
  assert.equal(message, "此團購已達杯數上限，無法再加入或修改。");
});

test("order_locked_by_deadline embeds a formatted deadline and the lock window", () => {
  const message = getOrderWriteErrorMessage(
    { error: "order_locked_by_deadline", deadlineAt: "2026-08-27T10:00:00.000Z", lockMinutes: 30 },
    "fallback"
  );
  assert.equal(message, "團購即將於 <formatted:2026-08-27T10:00:00.000Z> 截止（截止前 30 分鐘起鎖定訂單），已無法修改。");
});

test("order_locked_by_deadline defaults lockMinutes to 30 when the backend omits it", () => {
  const message = getOrderWriteErrorMessage(
    { error: "order_locked_by_deadline", deadlineAt: "2026-08-27T10:00:00.000Z" },
    "fallback"
  );
  assert.match(message, /截止前 30 分鐘起鎖定訂單/);
});

test("order_locked_by_deadline falls back to a plain message when deadlineAt is missing", () => {
  const message = getOrderWriteErrorMessage({ error: "order_locked_by_deadline" }, "fallback");
  assert.equal(message, "團購即將截止，已無法修改訂單。");
});

test("an unrecognized error code falls through to the raw code, not the fallback text", () => {
  assert.equal(getOrderWriteErrorMessage({ error: "some_future_backend_error" }, "fallback"), "some_future_backend_error");
});

test("a missing error code falls through to the fallback text", () => {
  assert.equal(getOrderWriteErrorMessage({}, "fallback"), "fallback");
  assert.equal(getOrderWriteErrorMessage(null, "fallback"), "fallback");
});
