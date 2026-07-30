"use strict";

const { randomUUID } = require("node:crypto");
const { acquireOperationLock, releaseOperationLock } = require("../db");

class OperationLeaseError extends Error {
  constructor(lock) {
    super("Operation is already in progress");
    this.name = "OperationLeaseError";
    this.code = "operation_locked";
    this.lock = lock;
  }
}

function createLease(input) {
  const ownerId = input.ownerId || `operation-${process.pid}-${randomUUID()}`;
  const lock = acquireOperationLock({
    lockKey: input.lockKey,
    ownerId,
    leaseMs: input.leaseMs || 120_000,
    now: input.now,
  });
  if (!lock.acquired) throw new OperationLeaseError(lock);
  return { lockKey: input.lockKey, ownerId };
}

async function withOperationLease(input, operation) {
  const lease = createLease(input);
  try {
    return await operation();
  } finally {
    releaseOperationLock(lease);
  }
}

function withOperationLeaseSync(input, operation) {
  const lease = createLease(input);
  try {
    return operation();
  } finally {
    releaseOperationLock(lease);
  }
}

module.exports = {
  OperationLeaseError,
  withOperationLease,
  withOperationLeaseSync,
};
