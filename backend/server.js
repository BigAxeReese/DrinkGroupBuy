const http = require("node:http");
const {
  cancelGroupBuyActivity,
  cancelCustomerOrderInDatabase,
  cancelPendingLinePayAuthorizationInDatabase,
  createGroupBuyActivity,
  createOrder,
  createOrderRevision,
  getCustomerOrderCancellationEligibility,
  getOrderDetail,
  getOrderPaymentContext,
  getLatestLinePayAuthorizationForOrder,
  createPendingLinePayAuthorization,
  getLinePayAuthorizationContext,
  authorizeLinePayPaymentInDatabase,
  getUserAuthProfileByFirebaseUid: getSqliteUserAuthProfileByFirebaseUid,
  getUserAuthProfileByLoginIdentifier: getSqliteUserAuthProfileByLoginIdentifier,
  getUserAuthProfileById: getSqliteUserAuthProfileById,
  listDevAuthUsers: listSqliteDevAuthUsers,
  listCustomerOrders,
  listGroupBuyActivities,
  listPaymentReliabilityAlerts,
  listMerchantStoreOrders,
  listPublicStores,
  listStoreMenu,
  recordLinePayVoidFailureInDatabase,
  saveMerchantMenuItem,
  updatePendingOrder,
  voidLinePayAuthorizationInDatabase
} = require("./db");
const { createAuthToken, getBearerToken, verifyAuthToken, verifyPassword } = require("./auth");
const { verifyFirebaseIdToken } = require("./firebaseAuth");
const {
  PaymentServiceError,
  cancelLinePayAuthorization,
  clearPendingLinePayAuthorizationsForOrderUpdate,
  confirmLinePayAuthorization,
  requestManualLinePayRepayment,
  requestLinePayAuthorization,
  refundLinePayPayment,
  voidLinePayAuthorization
} = require("./payments/linePayService");
const {
  settleGroupBuyActivity,
  startDeadlineSettlementScheduler
} = require("./payments/settlementService");
const {
  startLinePayReconciliationScheduler
} = require("./payments/reliabilityService");
const {
  OperationLeaseError,
  withOperationLease
} = require("./reliability/operationLease");
const {
  getPickupCredentialForOrder,
  lookupPickupCode,
  markGroupBuyActivityReadyForPickup,
  redeemPickupCode
} = require("./pickup/credentialService");
const { startPickupExpirationScheduler } = require("./pickup/expirationService");
const {
  createStoreMenuReadRepository
} = require("./database/repositories/storeMenuReadRepository");
const {
  createGroupBuyActivityReadRepository
} = require("./database/repositories/groupBuyActivityReadRepository");
const {
  createAuthProfileReadRepository
} = require("./database/repositories/authProfileReadRepository");
const {
  createGroupBuyActivityWriteRepository
} = require("./database/repositories/groupBuyActivityWriteRepository");
const {
  createMerchantMenuRepository
} = require("./database/repositories/merchantMenuRepository");
const {
  createCustomerOrderWriteRepository
} = require("./database/repositories/customerOrderWriteRepository");
const {
  createCustomerOrderReadRepository
} = require("./database/repositories/customerOrderReadRepository");
const {
  createPaymentAuthorizationRequestRepository
} = require("./database/repositories/paymentAuthorizationRequestRepository");
const {
  createPaymentAuthorizationConfirmRepository
} = require("./database/repositories/paymentAuthorizationConfirmRepository");
const {
  createPaymentAuthorizationCancelRepository
} = require("./database/repositories/paymentAuthorizationCancelRepository");
const {
  createCustomerOrderCancelRepository
} = require("./database/repositories/customerOrderCancelRepository");

const port = Number(process.env.PORT ?? 3000);
const storeMenuReadRepository = createStoreMenuReadRepository({ sqliteReader: listStoreMenu });
const groupBuyActivityReadRepository = createGroupBuyActivityReadRepository({
  sqliteReader: listGroupBuyActivities,
});
const authProfileReadRepository = createAuthProfileReadRepository({
  sqliteReaders: {
    getByFirebaseUid: getSqliteUserAuthProfileByFirebaseUid,
    getByLoginIdentifier: getSqliteUserAuthProfileByLoginIdentifier,
    getById: getSqliteUserAuthProfileById,
    listDevUsers: listSqliteDevAuthUsers,
  },
});
const groupBuyActivityWriteRepository = createGroupBuyActivityWriteRepository({
  sqliteWriter: createGroupBuyActivity,
});
const merchantMenuRepository = createMerchantMenuRepository({
  sqliteReader: listStoreMenu,
  sqliteWriter: saveMerchantMenuItem,
});
const customerOrderWriteRepository = createCustomerOrderWriteRepository({
  sqliteWriter: createOrder,
});
const customerOrderReadRepository = createCustomerOrderReadRepository({
  sqliteReaders: {
    getOrderDetail,
    getOrderPaymentContext,
    listCustomerOrders,
    listMerchantStoreOrders,
  },
});
const paymentAuthorizationRequestRepository = createPaymentAuthorizationRequestRepository({
  sqliteGateway: {
    getOrderPaymentContext,
    getLatestAuthorizationForOrder: getLatestLinePayAuthorizationForOrder,
    createPendingAuthorization: createPendingLinePayAuthorization,
  },
});
const paymentAuthorizationConfirmRepository = createPaymentAuthorizationConfirmRepository({
  sqliteGateway: {
    getAuthorizationContext: getLinePayAuthorizationContext,
    confirmAuthorization: authorizeLinePayPaymentInDatabase,
  },
});
const paymentAuthorizationCancelRepository = createPaymentAuthorizationCancelRepository({
  sqliteGateway: {
    getAuthorizationContext: getLinePayAuthorizationContext,
    cancelPendingAuthorization: cancelPendingLinePayAuthorizationInDatabase,
    voidAuthorization: voidLinePayAuthorizationInDatabase,
    recordVoidFailure: recordLinePayVoidFailureInDatabase,
  },
});
const customerOrderCancelRepository = createCustomerOrderCancelRepository({
  sqliteGateway: {
    getEligibility: getCustomerOrderCancellationEligibility,
    cancelOrder: cancelCustomerOrderInDatabase,
  },
});
if (
  groupBuyActivityWriteRepository.kind === "postgres"
  || merchantMenuRepository.kind === "postgres"
  || customerOrderWriteRepository.kind === "postgres"
  || customerOrderReadRepository.kind === "postgres"
  || paymentAuthorizationRequestRepository.kind === "postgres"
  || paymentAuthorizationConfirmRepository.kind === "postgres"
  || paymentAuthorizationCancelRepository.kind === "postgres"
  || customerOrderCancelRepository.kind === "postgres"
) {
  const requiredPostgresRepositories = [
    authProfileReadRepository,
    storeMenuReadRepository,
    groupBuyActivityReadRepository,
    groupBuyActivityWriteRepository,
    merchantMenuRepository,
    customerOrderWriteRepository,
    customerOrderReadRepository,
    paymentAuthorizationRequestRepository,
    paymentAuthorizationConfirmRepository,
    paymentAuthorizationCancelRepository,
    customerOrderCancelRepository,
  ];
  if (requiredPostgresRepositories.some((repository) => repository.kind !== "postgres")) {
    throw new Error(
      "PostgreSQL write slices require AUTH_PROFILE_READ_RUNTIME, "
      + "STORE_MENU_READ_RUNTIME, GROUP_BUY_ACTIVITY_READ_RUNTIME, "
      + "GROUP_BUY_ACTIVITY_WRITE_RUNTIME, MERCHANT_MENU_RUNTIME, "
      + "CUSTOMER_ORDER_WRITE_RUNTIME, CUSTOMER_ORDER_READ_RUNTIME, "
      + "PAYMENT_AUTHORIZATION_REQUEST_RUNTIME, PAYMENT_AUTHORIZATION_CONFIRM_RUNTIME, "
      + "PAYMENT_AUTHORIZATION_CANCEL_RUNTIME, and CUSTOMER_ORDER_CANCEL_RUNTIME to be postgres"
    );
  }
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === "OPTIONS") {
      sendJson(response, 204, null);
      return;
    }

    const url = new URL(request.url, `http://${request.headers.host}`);

    if (
      customerOrderWriteRepository.kind === "postgres"
      && isSqliteOrderDependentRoute(request.method, url.pathname)
    ) {
      sendJson(response, 503, {
        error: "customer_order_runtime_mismatch",
        message: "This order follow-up route still requires the SQLite order runtime."
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, { ok: true, service: "drink-group-buy-backend" });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/auth/firebase-session") {
      const body = await readJsonBody(request);
      if (!body.idToken) {
        sendJson(response, 400, { error: "idToken is required" });
        return;
      }

      let firebaseUser;
      try {
        firebaseUser = await verifyFirebaseIdToken(body.idToken);
      } catch (error) {
        console.error("Firebase ID token verification failed:", {
          code: error.code,
          message: error.message,
          stack: error.stack
        });
        sendJson(response, 401, {
          error: "Invalid Firebase ID token",
          ...(process.env.NODE_ENV !== "production"
            ? { debug: { code: error.code, message: error.message } }
            : {})
        });
        return;
      }

      const user = await authProfileReadRepository.getByFirebaseUid(firebaseUser.uid);
      if (!user) {
        sendJson(response, 403, {
          error: "Firebase user is not mapped to an active backend user",
          nextStep: "Add this Firebase UID to users.firebase_uid in the development database."
        });
        return;
      }

      const token = createAuthToken(user);
      sendJson(response, 200, { token, user: toPublicUserResponse(user) });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/auth/dev-users") {
      if (!isDevAuthModeEnabled()) {
        sendJson(response, 404, { error: "Not found" });
        return;
      }

      sendJson(response, 200, { users: await authProfileReadRepository.listDevUsers() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/auth/dev-session") {
      if (!isDevAuthModeEnabled()) {
        sendJson(response, 404, { error: "Not found" });
        return;
      }

      const body = await readJsonBody(request);
      if (!body.userId) {
        sendJson(response, 400, { error: "userId is required" });
        return;
      }

      const user = await authProfileReadRepository.getById(body.userId);
      if (!user) {
        sendJson(response, 404, { error: "Dev user not found" });
        return;
      }

      const token = createAuthToken(user);
      sendJson(response, 200, { token, user: toPublicUserResponse(user) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/auth/login") {
      if (!isDevAuthModeEnabled()) {
        sendJson(response, 404, { error: "Not found" });
        return;
      }

      const body = await readJsonBody(request);
      const loginIdentifier = body.phoneNumber || body.loginName || body.email;
      if (!loginIdentifier || !body.password) {
        sendJson(response, 400, { error: "phoneNumber or loginName and password are required" });
        return;
      }

      const user = await authProfileReadRepository.getByLoginIdentifier(loginIdentifier);
      if (!user || !verifyPassword(body.password, user.passwordHash)) {
        sendJson(response, 401, { error: "Invalid phoneNumber/loginName or password" });
        return;
      }

      const token = createAuthToken(user);
      sendJson(response, 200, { token, user: toPublicUserResponse(user) });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/group-buy-activities") {
      sendJson(response, 200, {
        activities: await groupBuyActivityReadRepository.listActivities(),
      });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/stores") {
      sendJson(response, 200, { stores: listPublicStores() });
      return;
    }


    const publicStoreMenuMatch = url.pathname.match(/^\/api\/stores\/([^/]+)\/menu$/);
    if (request.method === "GET" && publicStoreMenuMatch) {
      const menu = await storeMenuReadRepository.getPublicStoreMenu(publicStoreMenuMatch[1]);
      if (!menu) {
        sendJson(response, 404, { error: "Store not found" });
        return;
      }
      sendJson(response, 200, menu);
      return;
    }

    const merchantStoreMenuMatch = url.pathname.match(/^\/api\/merchant\/stores\/([^/]+)\/menu$/);
    if (request.method === "GET" && merchantStoreMenuMatch) {
      const authUser = await getAuthenticatedUser(request);
      if (!authUser) {
        sendJson(response, 401, { error: "Authentication required" });
        return;
      }
      if (!authUser.roles.includes("merchant") || !canManageStore(authUser, merchantStoreMenuMatch[1])) {
        sendJson(response, 403, { error: "Store access denied" });
        return;
      }
      const menu = await merchantMenuRepository.getStoreMenu(merchantStoreMenuMatch[1]);
      sendJson(response, 200, menu);
      return;
    }

    const merchantMenuItemsMatch = url.pathname.match(/^\/api\/merchant\/stores\/([^/]+)\/menu-items$/);
    if (request.method === "POST" && merchantMenuItemsMatch) {
      const authUser = await getAuthenticatedUser(request);
      if (!authUser) {
        sendJson(response, 401, { error: "Authentication required" });
        return;
      }
      if (!authUser.roles.includes("merchant") || !canManageStore(authUser, merchantMenuItemsMatch[1])) {
        sendJson(response, 403, { error: "Store access denied" });
        return;
      }
      const body = await readJsonBody(request);
      const validationError = validateMenuItemInput(body);
      if (validationError) {
        sendJson(response, 400, { error: validationError });
        return;
      }
      const result = await merchantMenuRepository.saveMenuItem({
        ...body,
        storeId: merchantMenuItemsMatch[1],
        actorUserId: authUser.id
      });
      if (result.error === "store_not_found") {
        sendJson(response, 404, result);
        return;
      }
      if (result.error === "store_access_denied") {
        sendJson(response, 403, result);
        return;
      }
      if (result.error) {
        sendJson(response, 409, result);
        return;
      }
      sendJson(response, 201, result);
      return;
    }

    const merchantMenuItemMatch = url.pathname.match(
      /^\/api\/merchant\/stores\/([^/]+)\/menu-items\/([^/]+)$/
    );
    if (request.method === "PATCH" && merchantMenuItemMatch) {
      const authUser = await getAuthenticatedUser(request);
      if (!authUser) {
        sendJson(response, 401, { error: "Authentication required" });
        return;
      }
      if (!authUser.roles.includes("merchant") || !canManageStore(authUser, merchantMenuItemMatch[1])) {
        sendJson(response, 403, { error: "Store access denied" });
        return;
      }
      const body = await readJsonBody(request);
      const validationError = validateMenuItemInput(body);
      if (validationError) {
        sendJson(response, 400, { error: validationError });
        return;
      }
      const result = await merchantMenuRepository.saveMenuItem({
        ...body,
        storeId: merchantMenuItemMatch[1],
        menuItemId: merchantMenuItemMatch[2],
        actorUserId: authUser.id
      });
      if (result.error === "menu_item_not_found") {
        sendJson(response, 404, result);
        return;
      }
      if (result.error === "store_access_denied") {
        sendJson(response, 403, result);
        return;
      }
      if (result.error) {
        sendJson(response, 409, result);
        return;
      }
      sendJson(response, 200, result);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/merchant/group-buy-activities") {
      const authUser = await getAuthenticatedUser(request);
      if (!authUser) {
        sendJson(response, 401, { error: "Authentication required" });
        return;
      }
      if (!authUser.roles.includes("merchant")) {
        sendJson(response, 403, { error: "Merchant role required" });
        return;
      }

      const body = await readJsonBody(request);
      const validationError = validateCreateActivity(body);
      if (validationError) {
        sendJson(response, 400, { error: validationError });
        return;
      }
      if (!canManageStore(authUser, body.storeId)) {
        sendJson(response, 403, { error: "Store access denied" });
        return;
      }

      const activity = await groupBuyActivityWriteRepository.createActivity({
        ...body,
        createdByUserId: authUser.id
      });
      if (activity?.error === "store_access_denied") {
        sendJson(response, 403, { error: "Store access denied" });
        return;
      }
      if (activity?.error) {
        sendJson(response, 409, activity);
        return;
      }
      sendJson(response, 201, { activity });
      return;
    }

    const merchantReadyForPickupMatch = url.pathname.match(
      /^\/api\/merchant\/group-buy-activities\/([^/]+)\/ready-for-pickup$/
    );
    if (request.method === "POST" && merchantReadyForPickupMatch) {
      const authUser = await getAuthenticatedUser(request);
      if (!authUser) {
        sendJson(response, 401, { error: "Authentication required" });
        return;
      }
      if (!authUser.roles.includes("merchant")) {
        sendJson(response, 403, { error: "Merchant role required" });
        return;
      }

      const result = markGroupBuyActivityReadyForPickup(
        merchantReadyForPickupMatch[1],
        { actorUserId: authUser.id }
      );
      sendPickupServiceResult(response, result);
      return;
    }

    if (request.method === "POST"
      && url.pathname === "/api/merchant/pickup-credentials/lookup") {
      const authUser = await getAuthenticatedUser(request);
      if (!authUser) {
        sendJson(response, 401, { error: "Authentication required" });
        return;
      }
      if (!authUser.roles.includes("merchant")) {
        sendJson(response, 403, { error: "Merchant role required" });
        return;
      }

      const body = await readJsonBody(request);
      const result = lookupPickupCode({
        actorUserId: authUser.id,
        pickupCode: body.pickupCode
      });
      sendPickupServiceResult(response, result);
      return;
    }

    if (request.method === "POST"
      && url.pathname === "/api/merchant/pickup-credentials/redeem") {
      const authUser = await getAuthenticatedUser(request);
      if (!authUser) {
        sendJson(response, 401, { error: "Authentication required" });
        return;
      }
      if (!authUser.roles.includes("merchant")) {
        sendJson(response, 403, { error: "Merchant role required" });
        return;
      }

      const body = await readJsonBody(request);
      const result = redeemPickupCode({
        actorUserId: authUser.id,
        pickupCode: body.pickupCode
      });
      sendPickupServiceResult(response, result);
      return;
    }

    const orderPickupCredentialMatch = url.pathname.match(
      /^\/api\/orders\/([^/]+)\/pickup-credential$/
    );
    if (request.method === "GET" && orderPickupCredentialMatch) {
      const authUser = await getAuthenticatedUser(request);
      if (!authUser) {
        sendJson(response, 401, { error: "Authentication required" });
        return;
      }

      const order = getOrderDetail(orderPickupCredentialMatch[1]);
      if (!order) {
        sendJson(response, 404, { error: "Order not found" });
        return;
      }
      if (!canAccessOrder(authUser, order)) {
        sendJson(response, 403, { error: "Order access denied" });
        return;
      }

      const credential = getPickupCredentialForOrder(order.id);
      sendJson(response, 200, { credential });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/customers/me/orders") {
      const authUser = await getAuthenticatedUser(request);
      if (!authUser) return sendJson(response, 401, { error: "Authentication required" });
      if (!authUser.roles.includes("customer")) return sendJson(response, 403, { error: "Customer role required" });
      sendJson(
        response,
        200,
        await customerOrderReadRepository.listCustomerOrders(
          authUser.id,
          readOrderListQuery(url)
        )
      );
      return;
    }

    const merchantOrdersMatch = url.pathname.match(/^\/api\/merchant\/stores\/([^/]+)\/orders$/);
    if (request.method === "GET" && merchantOrdersMatch) {
      const authUser = await getAuthenticatedUser(request);
      if (!authUser) return sendJson(response, 401, { error: "Authentication required" });
      if (!authUser.roles.includes("merchant") || !canManageStore(authUser, merchantOrdersMatch[1])) {
        return sendJson(response, 403, { error: "Store access denied" });
      }
      sendJson(
        response,
        200,
        await customerOrderReadRepository.listMerchantStoreOrders(
          merchantOrdersMatch[1],
          readOrderListQuery(url)
        )
      );
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/orders") {
      const authUser = await getAuthenticatedUser(request);
      if (!authUser) {
        sendJson(response, 401, { error: "Authentication required" });
        return;
      }
      if (!authUser.roles.includes("customer")) {
        sendJson(response, 403, { error: "Customer role required" });
        return;
      }

      const body = await readJsonBody(request);
      const validationError = validateCreateOrder(body);
      if (validationError) {
        sendJson(response, 400, { error: validationError });
        return;
      }

      const result = await customerOrderWriteRepository.createOrder({
        ...body,
        customerUserId: authUser.id
      });
      if (sendOrderItemValidationError(response, result)) return;
      if (result?.error === "activity_not_found") {
        sendJson(response, 404, { error: "Group-buy activity not found" });
        return;
      }
      if (result?.error === "customer_not_found") {
        sendJson(response, 404, { error: "Customer not found" });
        return;
      }
      if (result?.error === "order_already_exists") {
        sendJson(response, 409, {
          error: "Customer already has an active order for this group-buy activity",
          orderId: result.orderId
        });
        return;
      }
      if (result?.error === "activity_not_joinable") {
        sendJson(response, 409, { error: "Group-buy activity is not joinable", status: result.status });
        return;
      }
      if (result?.error === "capacity_exceeded") {
        sendJson(response, 409, {
          error: "Group-buy activity capacity exceeded",
          maximumCups: result.maximumCups,
          authorizedCups: result.authorizedCups,
          requestedCups: result.requestedCups
        });
        return;
      }

      sendJson(response, 201, { order: result.order });
      return;
    }

    const orderRevisionMatch = url.pathname.match(/^\/api\/orders\/([^/]+)\/revisions$/);
    if (request.method === "POST" && orderRevisionMatch) {
      const authUser = await getAuthenticatedUser(request);
      if (!authUser) {
        sendJson(response, 401, { error: "Authentication required" });
        return;
      }
      if (!authUser.roles.includes("customer")) {
        sendJson(response, 403, { error: "Customer role required" });
        return;
      }

      const body = await readJsonBody(request);
      const validationError = validateUpdateOrder(body);
      if (validationError) {
        sendJson(response, 400, { error: validationError });
        return;
      }

      const result = createOrderRevision({
        ...body,
        orderId: orderRevisionMatch[1],
        customerUserId: authUser.id
      });
      if (sendOrderItemValidationError(response, result)) return;
      if (result?.error === "order_not_found") {
        sendJson(response, 404, { error: "Order not found" });
        return;
      }
      if (result?.error === "order_access_denied") {
        sendJson(response, 403, { error: "Order access denied" });
        return;
      }
      if (result?.error === "order_not_revisable") {
        sendJson(response, 409, {
          error: "Order is not revisable after authorization",
          status: result.status,
          paymentStatus: result.paymentStatus,
          authorizationStatus: result.authorizationStatus
        });
        return;
      }
      if (result?.error === "activity_not_joinable") {
        sendJson(response, 409, { error: "Group-buy activity is not joinable", status: result.status });
        return;
      }
      if (result?.error === "order_locked_by_deadline") {
        sendJson(response, 409, {
          error: "Order is locked by deadline",
          deadlineAt: result.deadlineAt,
          lockMinutes: result.lockMinutes
        });
        return;
      }
      if (result?.error === "order_revision_already_pending") {
        sendJson(response, 409, {
          error: "Order already has a pending revision",
          orderRevisionId: result.orderRevisionId
        });
        return;
      }
      if (result?.error === "order_authorization_missing") {
        sendJson(response, 409, { error: "Order authorization is missing" });
        return;
      }
      if (result?.error === "capacity_exceeded") {
        sendJson(response, 409, {
          error: "Group-buy activity capacity exceeded",
          maximumCups: result.maximumCups,
          authorizedCups: result.authorizedCups,
          requestedCups: result.requestedCups
        });
        return;
      }

      sendJson(response, 201, { revision: result.revision });
      return;
    }

    const orderCancelMatch = url.pathname.match(/^\/api\/orders\/([^/]+)\/cancel$/);
    if (request.method === "POST" && orderCancelMatch) {
      const authUser = await getAuthenticatedUser(request);
      if (!authUser) return sendJson(response, 401, { error: "Authentication required" });
      if (!authUser.roles.includes("customer")) return sendJson(response, 403, { error: "Customer role required" });
      const body = await readJsonBody(request);
      if (!String(body.idempotencyKey || "").trim()) {
        return sendJson(response, 400, { error: "idempotencyKey is required" });
      }
      const order = await customerOrderReadRepository.getOrderDetail(orderCancelMatch[1]);
      if (!order) return sendJson(response, 404, { error: "Order not found" });
      if (!canAccessOrder(authUser, order)) return sendJson(response, 403, { error: "Order access denied" });
      const requestedAt = new Date().toISOString();
      const cancelOperation = async () => {
        const lockedOrder = await customerOrderReadRepository.getOrderDetail(order.id);
        if (!lockedOrder) return sendJson(response, 404, { error: "Order not found" });
        const eligibility = await customerOrderCancelRepository.getEligibility({
          orderId: lockedOrder.id,
          customerUserId: authUser.id,
          now: requestedAt
        });
        if (eligibility.error) {
          return sendJson(response, eligibility.error === "order_not_found" ? 404 : 409, eligibility);
        }
        if (lockedOrder.paymentStatus === "authorized") {
          try {
            await voidLinePayAuthorization({
              orderId: lockedOrder.id,
              provider: lockedOrder.latestLinePayAuthorization?.provider || "line_pay",
              reason: "customer_cancelled_order",
              authorizationCancelRepository: paymentAuthorizationCancelRepository,
              operationLockHeld: paymentAuthorizationCancelRepository.kind === "postgres"
            });
          } catch (error) {
            if (error instanceof PaymentServiceError) return sendJson(response, error.statusCode, error.payload);
            throw error;
          }
        }
        const result = await customerOrderCancelRepository.cancelOrder({
          orderId: lockedOrder.id,
          customerUserId: authUser.id,
          idempotencyKey: String(body.idempotencyKey),
          reason: body.reason || "customer_withdrawal",
          now: requestedAt
        });
        if (result.error) return sendJson(response, result.error === "order_not_found" ? 404 : 409, result);
        result.order = await customerOrderReadRepository.getOrderDetail(lockedOrder.id);
        sendJson(response, 200, result);
      };
      try {
        if (paymentAuthorizationCancelRepository.kind === "postgres") {
          await paymentAuthorizationCancelRepository.withOperationLock({
            orderId: order.id,
            leaseMs: 300_000,
            now: requestedAt
          }, cancelOperation);
        } else {
          await withOperationLease({
            lockKey: `order:${order.id}:payment-lifecycle`,
            leaseMs: 300_000
          }, cancelOperation);
        }
      } catch (error) {
        if (error instanceof OperationLeaseError || error?.code === "operation_locked") {
          sendJson(response, 409, {
            error: "operation_locked",
            status: "retry_later",
            lockKey: error.lock.lockKey,
            lockedUntil: error.lock.lockedUntil
          });
          return;
        }
        throw error;
      }
      return;
    }

    const orderMatch = url.pathname.match(/^\/api\/orders\/([^/]+)$/);
    if (request.method === "PATCH" && orderMatch) {
      const authUser = await getAuthenticatedUser(request);
      if (!authUser) {
        sendJson(response, 401, { error: "Authentication required" });
        return;
      }
      if (!authUser.roles.includes("customer")) {
        sendJson(response, 403, { error: "Customer role required" });
        return;
      }

      const body = await readJsonBody(request);
      const validationError = validateUpdateOrder(body);
      if (validationError) {
        sendJson(response, 400, { error: validationError });
        return;
      }

      const result = updatePendingOrder({
        ...body,
        orderId: orderMatch[1],
        customerUserId: authUser.id
      });
      if (sendOrderItemValidationError(response, result)) return;
      if (result?.error === "order_not_found") {
        sendJson(response, 404, { error: "Order not found" });
        return;
      }
      if (result?.error === "order_access_denied") {
        sendJson(response, 403, { error: "Order access denied" });
        return;
      }
      if (result?.error === "order_not_editable") {
        sendJson(response, 409, {
          error: "Order is not editable before authorization",
          status: result.status,
          paymentStatus: result.paymentStatus
        });
        return;
      }
      if (result?.error === "activity_not_found") {
        sendJson(response, 404, { error: "Group-buy activity not found" });
        return;
      }
      if (result?.error === "activity_not_joinable") {
        sendJson(response, 409, { error: "Group-buy activity is not joinable", status: result.status });
        return;
      }
      if (result?.error === "capacity_exceeded") {
        sendJson(response, 409, {
          error: "Group-buy activity capacity exceeded",
          maximumCups: result.maximumCups,
          authorizedCups: result.authorizedCups,
          requestedCups: result.requestedCups
        });
        return;
      }

      clearPendingLinePayAuthorizationsForOrderUpdate(
        orderMatch[1],
        result.failedAuthorizations || []
      );

      sendJson(response, 200, { order: result.order });
      return;
    }

    if (request.method === "GET" && orderMatch) {
      const authUser = await getAuthenticatedUser(request);
      if (!authUser) {
        sendJson(response, 401, { error: "Authentication required" });
        return;
      }

      const order = await customerOrderReadRepository.getOrderDetail(orderMatch[1]);
      if (!order) {
        sendJson(response, 404, { error: "Order not found" });
        return;
      }
      if (!canAccessOrder(authUser, order)) {
        sendJson(response, 403, { error: "Order access denied" });
        return;
      }

      sendJson(response, 200, { order });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/payments/line-pay/request") {
      const authUser = await getAuthenticatedUser(request);
      if (!authUser) {
        sendJson(response, 401, { error: "Authentication required" });
        return;
      }

      const body = await readJsonBody(request);
      try {
        const result = await requestLinePayAuthorization({
          authUser,
          body,
          authorizationRequestRepository: paymentAuthorizationRequestRepository
        });
        sendJson(response, 201, result);
      } catch (error) {
        if (error instanceof PaymentServiceError) {
          sendJson(response, error.statusCode, error.payload);
          return;
        }
        throw error;
      }
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/payments/line-pay/repay") {
      const authUser = await getAuthenticatedUser(request);
      if (!authUser) {
        sendJson(response, 401, { error: "Authentication required" });
        return;
      }

      const body = await readJsonBody(request);
      try {
        const result = await requestManualLinePayRepayment({ authUser, body });
        sendJson(response, 201, result);
      } catch (error) {
        if (error instanceof PaymentServiceError) {
          sendJson(response, error.statusCode, error.payload);
          return;
        }
        throw error;
      }
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/payments/line-pay/refund") {
      const authUser = await getAuthenticatedUser(request);
      if (!authUser) {
        sendJson(response, 401, { error: "Authentication required" });
        return;
      }

      const body = await readJsonBody(request);
      try {
        const result = await refundLinePayPayment({ authUser, body });
        sendJson(response, 200, result);
      } catch (error) {
        if (error instanceof PaymentServiceError) {
          sendJson(response, error.statusCode, error.payload);
          return;
        }
        throw error;
      }
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/payments/line-pay/confirm") {
      const transactionId = url.searchParams.get("transactionId");
      const orderId = url.searchParams.get("orderId");
      const result = await confirmLinePayAuthorization({
        transactionId,
        orderId,
        authorizationConfirmRepository: paymentAuthorizationConfirmRepository
      });

      if (result?.error === "capacity_exceeded") {
        const voidStatus = result.voidResult?.status
          || (result.voidError ? `void_failed: ${result.voidError.message}` : "void_not_attempted");
        sendHtml(response, 409, buildLinePayResultPage({
          title: "LINE Pay 預授權無法完成",
          message: "團購已達杯數上限，這筆訂單沒有加入團購。",
          detail: `Maximum cups: ${result.maximumCups} / Authorized cups: ${result.authorizedCups} / Requested cups: ${result.requestedCups} / Void: ${voidStatus}`,
          appReturnUrl: buildLinePayAppReturnUrl({
            orderId: result.pendingPayment?.orderId || orderId,
            transactionId,
            status: "failed",
            paymentFlow: result.paymentFlow,
            error: result.error
          })
        }));
        return;
      }

      if (result?.error) {
        sendHtml(response, 409, buildLinePayResultPage({
          title: result.paymentFlow === "direct_repayment"
            ? "LINE Pay 重新付款無法完成"
            : "LINE Pay 預授權無法完成",
          message: result.error,
          detail: result.authorization ? `Authorization status: ${result.authorization.status}` : undefined,
          appReturnUrl: buildLinePayAppReturnUrl({
            orderId: result.pendingPayment?.orderId || orderId,
            transactionId,
            status: "failed",
            paymentFlow: result.paymentFlow,
            error: result.error
          })
        }));
        return;
      }

      if (!result) {
        sendHtml(response, 409, buildLinePayResultPage({
          title: "LINE Pay 預授權無法完成",
          message: "找不到待確認的付款資料。請回到 App 重新發起預授權。",
          appReturnUrl: buildLinePayAppReturnUrl({
            orderId,
            transactionId,
            status: "failed",
            error: "pending_payment_not_found"
          })
        }));
        return;
      }

      sendHtml(response, 200, buildLinePayResultPage({
        title: result.paymentFlow === "direct_repayment"
          ? "LINE Pay 重新付款完成"
          : "LINE Pay 預授權完成",
        message: result.paymentFlow === "direct_repayment"
          ? "付款已完成，訂單已進入製作流程。請回到 App 查看訂單。"
          : "目前僅完成授權，尚未正式請款。請回到 App 查看團購進度。",
        detail: `Order ID: ${result.pendingPayment.orderId}${result.authorization ? ` / Authorization: ${result.authorization.status}` : ""}`,
        rawCode: result.payload.returnCode,
        appReturnUrl: buildLinePayAppReturnUrl({
          orderId: result.pendingPayment.orderId,
          transactionId,
          status: result.paymentFlow === "direct_repayment" ? "captured" : "authorized",
          paymentFlow: result.paymentFlow
        })
      }));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/payments/line-pay/cancel") {
      const transactionId = url.searchParams.get("transactionId");
      const orderId = url.searchParams.get("orderId");
      const cancelled = await cancelLinePayAuthorization({
        transactionId,
        orderId,
        authorizationCancelRepository: paymentAuthorizationCancelRepository
      });
      const directRepayment = cancelled.authorization?.paymentFlow === "direct_repayment"
        || cancelled.pendingPayment?.paymentFlow === "direct_repayment";

      sendHtml(response, 200, buildLinePayResultPage({
        title: directRepayment ? "LINE Pay 重新付款已取消" : "LINE Pay 預授權已取消",
        message: directRepayment
          ? "你可以在付款期限前回到 App 再次付款。"
          : "你可以回到 App 重新發起預授權。",
        appReturnUrl: buildLinePayAppReturnUrl({
          orderId: cancelled.orderId || orderId,
          transactionId: cancelled.transactionId || transactionId,
          status: "cancelled",
          paymentFlow: directRepayment ? "direct_repayment" : "authorization"
        })
      }));
      return;
    }

    const adminSettleActivityMatch = url.pathname.match(/^\/api\/admin\/group-buy-activities\/([^/]+)\/settle$/);
    if (request.method === "GET" && url.pathname === "/api/admin/payment-reliability/alerts") {
      const authUser = await getAuthenticatedUser(request);
      if (!authUser) {
        sendJson(response, 401, { error: "Authentication required" });
        return;
      }
      if (!authUser.roles.includes("admin")) {
        sendJson(response, 403, { error: "Admin role required" });
        return;
      }
      const jobType = url.searchParams.get("jobType") || null;
      const status = url.searchParams.get("status") || null;
      const limit = Number(url.searchParams.get("limit") || 50);
      const validJobTypes = new Set(["reconcile_line_pay_request", "settle_group_buy_activity"]);
      const validStatuses = new Set(["failed"]);
      if (jobType && !validJobTypes.has(jobType)) {
        sendJson(response, 400, { error: "Invalid jobType filter" });
        return;
      }
      if ((status && !validStatuses.has(status)) || !Number.isInteger(limit) || limit <= 0) {
        sendJson(response, 400, { error: "Invalid status or limit filter" });
        return;
      }
      const alerts = listPaymentReliabilityAlerts({
        jobType,
        status,
        limit
      });
      sendJson(response, 200, {
        alerts,
        count: alerts.length,
        filters: {
          jobType,
          status
        }
      });
      return;
    }

    if (request.method === "POST" && adminSettleActivityMatch) {
      const authUser = await getAuthenticatedUser(request);
      if (!authUser) {
        sendJson(response, 401, { error: "Authentication required" });
        return;
      }
      if (!authUser.roles.includes("admin")) {
        sendJson(response, 403, { error: "Admin role required" });
        return;
      }

      const body = await readJsonBody(request);
      const result = await settleGroupBuyActivity({
        activityId: adminSettleActivityMatch[1],
        actorUserId: authUser.id,
        force: Boolean(body.force)
      });

      if (!result) {
        sendJson(response, 404, { error: "Group-buy activity not found" });
        return;
      }
      if (result.error === "settlement_not_due") {
        sendJson(response, 409, {
          error: "Group-buy activity deadline has not passed",
          deadlineAt: result.deadlineAt,
          now: result.now
        });
        return;
      }
      if (result.error === "activity_already_settled") {
        sendJson(response, 200, result);
        return;
      }
      if (result.error === "settlement_retry_pending") {
        sendJson(response, 202, result);
        return;
      }
      if (result.error === "settlement_payment_failures") {
        sendJson(response, 409, result);
        return;
      }
      if (result.error) {
        sendJson(response, 409, result);
        return;
      }

      sendJson(response, 200, result);
      return;
    }

    const adminActivityMatch = url.pathname.match(/^\/api\/admin\/group-buy-activities\/([^/]+)$/);
    if (request.method === "DELETE" && adminActivityMatch) {
      const authUser = await getAuthenticatedUser(request);
      if (!authUser) {
        sendJson(response, 401, { error: "Authentication required" });
        return;
      }
      if (!authUser.roles.includes("admin")) {
        sendJson(response, 403, { error: "Admin role required" });
        return;
      }

      const body = await readJsonBody(request);
      const activity = cancelGroupBuyActivity(adminActivityMatch[1], {
        ...body,
        actorUserId: authUser.id
      });
      if (!activity) {
        sendJson(response, 404, { error: "Group-buy activity not found" });
        return;
      }

      sendJson(response, 200, { activity });
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    if (error instanceof PaymentServiceError) {
      sendJson(response, error.statusCode, error.payload);
      return;
    }
    sendJson(response, 500, { error: error.message });
  }
});

let deadlineSettlementScheduler;
let linePayReconciliationScheduler;
let pickupExpirationScheduler;
const controlledPostgresOrderRuntime = customerOrderWriteRepository.kind === "postgres";
const schedulerEnvironment = controlledPostgresOrderRuntime
  ? {
      ...process.env,
      SETTLEMENT_SCHEDULER_ENABLED: "false",
      PICKUP_EXPIRATION_SCHEDULER_ENABLED: "false"
    }
  : process.env;

server.listen(port, () => {
  console.log(`DrinkGroupBuy backend listening on http://localhost:${port}`);
  linePayReconciliationScheduler = startLinePayReconciliationScheduler({
    enabled: controlledPostgresOrderRuntime ? false : undefined
  });
  if (linePayReconciliationScheduler.enabled) {
    console.log(
      `LINE Pay reconciliation scheduler enabled (${linePayReconciliationScheduler.intervalMs}ms interval)`
    );
  } else {
    console.log(
      `LINE Pay reconciliation scheduler disabled: ${linePayReconciliationScheduler.reason}`
    );
  }


  deadlineSettlementScheduler = startDeadlineSettlementScheduler({
    env: schedulerEnvironment
  });
  if (deadlineSettlementScheduler.enabled) {
    console.log(`Deadline settlement scheduler enabled (${deadlineSettlementScheduler.intervalMs}ms interval)`);
  } else {
    console.log(`Deadline settlement scheduler disabled: ${deadlineSettlementScheduler.reason}`);
  }

  pickupExpirationScheduler = startPickupExpirationScheduler({
    env: schedulerEnvironment
  });
  if (pickupExpirationScheduler.enabled) {
    console.log(`Pickup expiration scheduler enabled (${pickupExpirationScheduler.intervalMs}ms interval)`);
  } else {
    console.log(`Pickup expiration scheduler disabled: ${pickupExpirationScheduler.reason}`);
  }
});

function sendPickupServiceResult(response, result) {
  if (!result?.error) {
    sendJson(response, 200, result);
    return;
  }

  const statusByError = {
    activity_not_found: 404,
    credential_not_found: 404,
    activity_access_denied: 403,
    merchant_user_required: 403,
    pickup_code_invalid: 400,
    pickup_code_rate_limited: 429
  };
  sendJson(response, statusByError[result.error] || 409, result);
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json; charset=utf-8"
  });

  if (statusCode === 204) {
    response.end();
    return;
  }

  response.end(JSON.stringify(payload));
}

function sendHtml(response, statusCode, html) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "text/html; charset=utf-8"
  });
  response.end(html);
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let rawBody = "";
    request.on("data", (chunk) => {
      rawBody += chunk;
    });
    request.on("end", () => {
      try {
        resolve(rawBody ? JSON.parse(rawBody) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    request.on("error", reject);
  });
}

function validateCreateActivity(body) {
  const requiredFields = [
    "storeId",
    "title",
    "startAt",
    "deadlineAt",
    "pickupStartAt",
    "pickupEndAt"
  ];
  const missingField = requiredFields.find((field) => !body[field]);
  if (missingField) return `Missing required field: ${missingField}`;

  const startTime = Date.parse(body.startAt);
  const deadlineTime = Date.parse(body.deadlineAt);
  const pickupStartTime = Date.parse(body.pickupStartAt);
  const pickupEndTime = Date.parse(body.pickupEndAt);
  if (Number.isNaN(startTime)) return "startAt must be a valid datetime";
  if (Number.isNaN(deadlineTime)) return "deadlineAt must be a valid datetime";
  if (Number.isNaN(pickupStartTime)) return "pickupStartAt must be a valid datetime";
  if (Number.isNaN(pickupEndTime)) return "pickupEndAt must be a valid datetime";
  if (deadlineTime <= startTime) return "deadlineAt must be after startAt";
  if (deadlineTime - startTime > 24 * 60 * 60 * 1000) {
    return "deadlineAt must be within 24 hours of startAt";
  }
  if (pickupStartTime - deadlineTime < 30 * 60 * 1000) {
    return "pickupStartAt must be at least 30 minutes after deadlineAt";
  }
  if (pickupEndTime <= pickupStartTime) {
    return "pickupEndAt must be after pickupStartAt";
  }

  if (body.tiers != null && !Array.isArray(body.tiers)) {
    return "tiers must be an array";
  }

  return null;
}

function validateCreateOrder(body) {
  if (!body.activityId) return "Missing required field: activityId";
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return "items must be a non-empty array";
  }
  if (
    body.fallbackPurchasePreference != null
    && !["decline_original_price", "accept_original_price"].includes(body.fallbackPurchasePreference)
  ) {
    return "fallbackPurchasePreference is invalid";
  }
  return null;
}

function validateUpdateOrder(body) {
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return "items must be a non-empty array";
  }
  if (
    body.fallbackPurchasePreference != null
    && !["decline_original_price", "accept_original_price"].includes(body.fallbackPurchasePreference)
  ) {
    return "fallbackPurchasePreference is invalid";
  }
  return null;
}

function validateMenuItemInput(body) {
  if (!String(body.name || "").trim()) return "name is required";
  if (!String(body.category || "").trim()) return "category is required";
  if (!Number.isInteger(Number(body.basePrice)) || Number(body.basePrice) < 0) {
    return "basePrice must be a non-negative integer";
  }
  if (typeof body.isAvailable !== "boolean") return "isAvailable must be a boolean";
  if (!Array.isArray(body.customizationGroups)) return "customizationGroups must be an array";

  const allowedTypes = new Set(["sweetness", "ice", "topping", "size"]);
  const seenTypes = new Set();
  for (const group of body.customizationGroups) {
    if (!allowedTypes.has(group.optionType)) return "customization group optionType is invalid";
    if (seenTypes.has(group.optionType)) return "customization group optionType must be unique";
    seenTypes.add(group.optionType);
    const minSelections = Number(group.minSelections);
    const maxSelections = Number(group.maxSelections);
    if (!Number.isInteger(minSelections) || minSelections < 0) {
      return "customization group minSelections must be a non-negative integer";
    }

    if (!Number.isInteger(maxSelections) || maxSelections < minSelections) {
      return "customization group maxSelections must be an integer greater than or equal to minSelections";
    }
    if (!Array.isArray(group.options)) return "customization group options must be an array";
    if (maxSelections > group.options.filter((option) => option.isAvailable !== false).length) {
      return "customization group maxSelections cannot exceed available option count";
    }
    const labels = new Set();
    for (const option of group.options) {
      const label = String(option.label || "").trim();
      if (!label) return "customization option label is required";
      if (labels.has(label)) return "customization option labels must be unique within a group";
      labels.add(label);
      if (!Number.isInteger(Number(option.priceDelta)) || Number(option.priceDelta) < 0) {
        return "customization option priceDelta must be a non-negative integer";
      }
      if (typeof option.isAvailable !== "boolean") return "customization option isAvailable must be a boolean";
    }
  }
  return null;
}

function sendOrderItemValidationError(response, result) {
  if (result?.error === "order_items_invalid") {
    sendJson(response, 409, result);
    return true;
  }
  if (result?.error === "order_price_changed" || result?.error === "order_discount_conflict") {
    sendJson(response, 409, result);
    return true;
  }
  return false;
}

function readOrderListQuery(url) {
  const limit = Number(url.searchParams.get("limit") || 20);
  return {
    scope: url.searchParams.get("scope") === "history" ? "history" : "active",
    activityId: url.searchParams.get("activityId") || undefined,
    cursor: url.searchParams.get("cursor") || undefined,
    limit: Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 20
  };
}

async function getAuthenticatedUser(request) {
  const token = getBearerToken(request);
  const payload = verifyAuthToken(token);
  if (!payload?.sub) return null;
  return authProfileReadRepository.getById(payload.sub);
}

function canAccessOrder(user, order) {
  if (user.roles.includes("admin")) return true;
  return order.customerUserId === user.id;
}

function canManageStore(user, storeId) {
  if (!storeId) return false;
  return user.merchantStores.some((store) => store.id === storeId);
}


function isSqliteOrderDependentRoute(method, pathname) {
  if (method === "POST" && pathname === "/api/orders") return false;
  if (method === "GET" && pathname === "/api/customers/me/orders") return false;
  if (method === "GET" && /^\/api\/merchant\/stores\/[^/]+\/orders$/.test(pathname)) return false;
  if (method === "GET" && /^\/api\/orders\/[^/]+$/.test(pathname)) return false;
  if (method === "POST" && pathname === "/api/payments/line-pay/request") return false;
  if (method === "GET" && pathname === "/api/payments/line-pay/confirm") return false;
  if (method === "GET" && pathname === "/api/payments/line-pay/cancel") return false;
  if (method === "POST" && /^\/api\/orders\/[^/]+\/cancel$/.test(pathname)) return false;
  return pathname.startsWith("/api/orders/")
    || pathname.startsWith("/api/payments/")
    || pathname.startsWith("/api/pickup-credentials/")
    || pathname.startsWith("/api/merchant/pickup-credentials/")
    || /^\/api\/merchant\/group-buy-activities\/[^/]+\/ready-for-pickup$/.test(pathname)
    || /^\/api\/admin\/group-buy-activities\/[^/]+\/settle$/.test(pathname);
}

function isDevAuthModeEnabled() {
  if (process.env.NODE_ENV === "production") return false;
  return readBooleanEnv(process.env.AUTH_DEV_MODE, false);
}

function readBooleanEnv(value, fallback = false) {
  if (value == null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function toPublicUserResponse(user) {
  return {
    id: user.id,
    loginName: user.loginName,
    phoneNumber: user.phoneNumber,
    email: user.email,
    displayName: user.displayName,
    surname: user.surname,
    roles: user.roles,
    merchantStores: user.merchantStores
  };
}

function buildLinePayResultPage({ title, message, detail, rawCode, appReturnUrl }) {
  const autoReturnScript = appReturnUrl
    ? `<script>
  window.setTimeout(function () {
    window.location.href = ${toSafeScriptString(appReturnUrl)};
  }, 900);
</script>`
    : "";

  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #f1f5f9;
      color: #0f172a;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main {
      width: min(420px, calc(100vw - 32px));
      border-radius: 24px;
      background: white;
      box-shadow: 0 24px 80px rgba(15, 23, 42, 0.16);
      padding: 28px;
    }
    h1 { margin: 0 0 12px; font-size: 24px; }
    p { margin: 8px 0; line-height: 1.6; color: #334155; }
    .code { color: #2563eb; font-weight: 800; }
    .button {
      display: block;
      margin-top: 18px;
      border-radius: 14px;
      background: #2563eb;
      color: white;
      font-weight: 900;
      padding: 14px 16px;
      text-align: center;
      text-decoration: none;
    }
    .hint { font-size: 13px; color: #64748b; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
    ${detail ? `<p class="code">${escapeHtml(detail)}</p>` : ""}
    ${rawCode ? `<p>LINE Pay returnCode: ${escapeHtml(rawCode)}</p>` : ""}
    ${appReturnUrl ? `<a class="button" href="${escapeHtml(appReturnUrl)}">返回 App 查看訂單</a>` : ""}
    ${appReturnUrl ? '<p class="hint">若沒有自動返回 App，請點選上方按鈕。</p>' : ""}
  </main>
  ${autoReturnScript}
</body>
</html>`;
}

function buildLinePayAppReturnUrl({ orderId, transactionId, status, paymentFlow, error }) {
  const baseUrl = process.env.LINE_PAY_APP_RETURN_URL || "drinkgroupbuy://payment/result";
  try {
    const appUrl = new URL(baseUrl);
    appUrl.searchParams.set("source", "line_pay");
    if (orderId) appUrl.searchParams.set("orderId", orderId);
    if (transactionId) appUrl.searchParams.set("transactionId", transactionId);
    if (status) appUrl.searchParams.set("status", status);
    if (paymentFlow) appUrl.searchParams.set("paymentFlow", paymentFlow);
    if (error) appUrl.searchParams.set("error", error);
    return appUrl.toString();
  } catch {
    return null;
  }
}

function toSafeScriptString(value) {
  return JSON.stringify(String(value)).replaceAll("<", "\\u003c");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
