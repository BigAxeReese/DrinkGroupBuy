"use strict";

const {
  acquireOperationLock,
  claimPaymentReliabilityJobs,
} = require("../../backend/db");

const input = JSON.parse(process.env.RELIABILITY_WORKER_INPUT || "{}");

if (input.action === "claim") {
  const jobs = claimPaymentReliabilityJobs(input.payload);
  process.stdout.write(JSON.stringify({ action: input.action, jobs }));
} else if (input.action === "lock") {
  const lock = acquireOperationLock(input.payload);
  process.stdout.write(JSON.stringify({ action: input.action, lock }));
} else {
  throw new Error(`Unsupported reliability worker action: ${input.action}`);
}
