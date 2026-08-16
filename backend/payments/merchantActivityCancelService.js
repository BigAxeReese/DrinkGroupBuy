const {
  cancelGroupBuyActivity
} = require("../db");
const { voidLinePayAuthorization } = require("./linePayService");
const { isEcpayProvider, voidEcpayAuthorization } = require("./ecpayService");
const { withOperationLease } = require("../reliability/operationLease");

const ACTIVITY_LOCK_MINUTES_DEFAULT = 30;
const ORDER_LOCK_LEASE_MS = 300_000;

async function cancelMerchantGroupBuyActivity(input = {}) {
  const now = input.now || new Date().toISOString();
  const merchantGroupBuyActivityCancelRepository = input.merchantGroupBuyActivityCancelRepository;
  const paymentAuthorizationCancelRepository = input.paymentAuthorizationCancelRepository;
  const logger = input.logger || console;

  const activity = await merchantGroupBuyActivityCancelRepository.getActivityForCancellation({
    activityId: input.activityId,
    now
  });
  if (!activity) return { error: "activity_not_found" };
  if (!input.canManageStore(activity.store_id)) return { error: "store_access_denied" };
  if (activity.status === "cancelled") {
    return {
      activity: cancelGroupBuyActivity(input.activityId, { now }),
      cancelledOrderIds: [],
      cancelledOrderCount: 0,
      failedOrderIds: [],
      idempotent: true
    };
  }
  if (activity.status !== "recruiting") {
    return { error: "activity_not_cancellable", status: activity.status };
  }

  const deadline = Date.parse(activity.deadline_at);
  const lockMinutes = Number(activity.withdrawal_lock_minutes ?? ACTIVITY_LOCK_MINUTES_DEFAULT);
  if (!Number.isNaN(deadline) && deadline - Date.parse(now) <= lockMinutes * 60_000) {
    return { error: "activity_locked_by_deadline", deadlineAt: activity.deadline_at, lockMinutes };
  }

  const eligibleOrders = await merchantGroupBuyActivityCancelRepository.listEligibleOrders({
    activityId: input.activityId
  });

  const cancelledOrderIds = [];
  const failedOrderIds = [];

  for (const order of eligibleOrders) {
    const idempotencyKey = `merchant-cancel-activity-${input.activityId}-order-${order.id}`;
    const orderCancelOperation = async () => {
      if (order.payment_status === "authorized") {
        if (isEcpayProvider(order.payment_provider)) {
          await voidEcpayAuthorization({
            orderId: order.id,
            provider: order.payment_provider,
            reason: "merchant_cancelled_group_buy_activity"
          });
        } else {
          await voidLinePayAuthorization({
            orderId: order.id,
            provider: order.payment_provider || "line_pay",
            reason: "merchant_cancelled_group_buy_activity",
            authorizationCancelRepository: paymentAuthorizationCancelRepository,
            operationLockHeld: paymentAuthorizationCancelRepository?.kind === "postgres"
          });
        }
      }
      const cancelResult = await merchantGroupBuyActivityCancelRepository.cancelOrder({
        activityId: input.activityId,
        orderId: order.id,
        actorUserId: input.actorUserId,
        idempotencyKey,
        reason: input.reason,
        now
      });
      if (cancelResult.error) {
        throw new Error(cancelResult.error);
      }
      return cancelResult;
    };

    try {
      if (paymentAuthorizationCancelRepository?.kind === "postgres") {
        await paymentAuthorizationCancelRepository.withOperationLock(
          { orderId: order.id, leaseMs: ORDER_LOCK_LEASE_MS },
          orderCancelOperation
        );
      } else {
        await withOperationLease(
          { lockKey: `order:${order.id}:payment-lifecycle`, leaseMs: ORDER_LOCK_LEASE_MS },
          orderCancelOperation
        );
      }
      cancelledOrderIds.push(order.id);
    } catch (error) {
      logger.error?.("[merchant-cancel-activity] order cancel failed", {
        activityId: input.activityId,
        orderId: order.id,
        message: error.message,
        stack: error.stack
      });
      failedOrderIds.push(order.id);
    }
  }

  const activityResult = cancelGroupBuyActivity(input.activityId, {
    reason: input.reason,
    actorUserId: input.actorUserId,
    now,
    actionType: "merchant_cancel_group_buy_activity"
  });

  return {
    activity: activityResult,
    cancelledOrderIds,
    cancelledOrderCount: cancelledOrderIds.length,
    failedOrderIds
  };
}

module.exports = {
  cancelMerchantGroupBuyActivity
};
