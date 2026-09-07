import {
  cancelNativeAppInfoConsumer,
  cancelNativeCachedTokenConsumer,
  cancelNativeOneClickPermissionConsumer,
  cancelThirdPartySdkIdentifiersConsumer,
  getNativeAppInfo,
  getNativeCachedToken,
  getThirdPartySdkIdentifiers,
  hideNativeLoading,
  requestNativeOneClickPermissions,
  showNativeLoading,
} from "../../../shared/bridge/index.js";

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const PERMISSIONS = Object.freeze(["sms", "camera", "phoneState", "location"]);
const ERROR_CODES = Object.freeze({
  invalidArgument: "INVALID_ARGUMENT",
  replaced: "REPLACED",
  canceled: "CANCELED",
  bridgeUnavailable: "BRIDGE_UNAVAILABLE",
  bridgeNotAccepted: "BRIDGE_NOT_ACCEPTED",
  bridgeCallFailed: "BRIDGE_CALL_FAILED",
  invalidCallback: "INVALID_CALLBACK",
  nativeFailed: "NATIVE_FAILED",
  cacheAccessFailed: "CACHE_ACCESS_FAILED",
  storeUpdateFailed: "STORE_UPDATE_FAILED",
  timeout: "TIMEOUT",
  internalFailed: "INTERNAL_FAILED",
});
const APP_INFO_FIELDS = Object.freeze([
  "appName",
  "packageName",
  "packageId",
  "appVersion",
  "appVersionName",
  "androidId",
]);
const SDK_FIELDS = Object.freeze(["afId", "fbId", "gaId"]);
const DEVELOPMENT_TEST_TOKEN =
  typeof import.meta.env === "object" && import.meta.env?.DEV === true
    ? "6a9ab65fe4b0d92c4ed9b99d"
    : null;

function validId(value) {
  return typeof value === "string" && ID_PATTERN.test(value);
}
function step(status, errorCode = null) {
  return Object.freeze({ status, errorCode });
}
function mapBridgeFailure(code) {
  return [
    "BRIDGE_UNAVAILABLE",
    "BRIDGE_NOT_ACCEPTED",
    "BRIDGE_CALL_FAILED",
    "INVALID_CALLBACK",
  ].includes(code)
    ? code
    : ERROR_CODES.internalFailed;
}
function invalidInitResult() {
  const failed = step("failed", ERROR_CODES.invalidArgument);
  return Object.freeze({
    initCycleId: null,
    status: "failed",
    steps: Object.freeze({
      apiHost: failed,
      appInfo: failed,
      token: failed,
      sdkIdentifiers: failed,
    }),
  });
}

export function createHomeHostService(options = {}) {
  const store = options.globalStore;
  const developmentTestToken = options.testToken ?? DEVELOPMENT_TEST_TOKEN;
  const bridge = {
    getNativeAppInfo: options.getNativeAppInfo ?? getNativeAppInfo,
    cancelNativeAppInfoConsumer:
      options.cancelNativeAppInfoConsumer ?? cancelNativeAppInfoConsumer,
    getNativeCachedToken: options.getNativeCachedToken ?? getNativeCachedToken,
    cancelNativeCachedTokenConsumer:
      options.cancelNativeCachedTokenConsumer ?? cancelNativeCachedTokenConsumer,
    getThirdPartySdkIdentifiers:
      options.getThirdPartySdkIdentifiers ?? getThirdPartySdkIdentifiers,
    cancelThirdPartySdkIdentifiersConsumer:
      options.cancelThirdPartySdkIdentifiersConsumer ??
      cancelThirdPartySdkIdentifiersConsumer,
    requestNativeOneClickPermissions:
      options.requestNativeOneClickPermissions ??
      requestNativeOneClickPermissions,
    cancelNativeOneClickPermissionConsumer:
      options.cancelNativeOneClickPermissionConsumer ??
      cancelNativeOneClickPermissionConsumer,
    showNativeLoading: options.showNativeLoading ?? showNativeLoading,
    hideNativeLoading: options.hideNativeLoading ?? hideNativeLoading,
  };
  const usedInitIds = new Set();
  const usedLoadingIds = new Set();
  const operationRecords = new Map();
  let activeInit = null;
  let activeLoadingId = null;
  let activeOperationId = null;

  function queryStep(context, invoke, cancel, consume) {
    if (context.disposed)
      return Promise.resolve(step("canceled", ERROR_CODES.canceled));
    return new Promise((resolve) => {
      let requestId = null;
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        context.pending.delete(cancelPending);
        if (requestId) context.requests.delete(requestId);
        resolve(result);
      };
      const cancelPending = () =>
        finish(step("canceled", ERROR_CODES.canceled));
      context.pending.add(cancelPending);
      try {
        requestId = invoke((reply) => finish(consume(reply)), {
          onFailure: (failure) =>
            finish(step("failed", mapBridgeFailure(failure?.code))),
        });
        if (typeof requestId !== "string" || requestId.length === 0)
          finish(step("failed", ERROR_CODES.bridgeCallFailed));
        else if (!settled) context.requests.set(requestId, cancel);
      } catch {
        finish(step("failed", ERROR_CODES.bridgeCallFailed));
      }
    });
  }

  async function runInitialization(context) {
    const steps = {};
    if (
      !store ||
      typeof store.initializeApiHostFromCurrentLocation !== "function"
    )
      steps.apiHost = step("failed", ERROR_CODES.storeUpdateFailed);
    else {
      try {
        const result = store.initializeApiHostFromCurrentLocation();
        const validStatus = ["updated", "retained", "not_found"].includes(
          result?.status,
        )
          ? result.errorCode === null
          : result?.status === "failed" &&
            ["CACHE_ACCESS_FAILED", "STORE_UPDATE_FAILED"].includes(
              result.errorCode,
            );
        steps.apiHost = validStatus
          ? step(result.status, result.errorCode)
          : step("failed", ERROR_CODES.internalFailed);
      } catch {
        steps.apiHost = step("failed", ERROR_CODES.internalFailed);
      }
    }
    steps.appInfo = await queryStep(
      context,
      bridge.getNativeAppInfo,
      bridge.cancelNativeAppInfoConsumer,
      (reply) => {
        if (reply?.status !== "success")
          return step("failed", ERROR_CODES.nativeFailed);
        if (
          !APP_INFO_FIELDS.every(
            (field) =>
              typeof reply[field] === "string" && reply[field].length > 0,
          )
        )
          return step("failed", ERROR_CODES.invalidCallback);
        try {
          const update = Object.fromEntries(
            APP_INFO_FIELDS.map((field) => [field, reply[field]]),
          );
          return store?.setGlobal?.(update)
            ? step("updated")
            : step("failed", ERROR_CODES.storeUpdateFailed);
        } catch {
          return step("failed", ERROR_CODES.storeUpdateFailed);
        }
      },
    );
    if (typeof developmentTestToken === "string" && developmentTestToken.length > 0) {
      try {
        steps.token = store?.setGlobal?.({ token: developmentTestToken })
          ? step("updated")
          : step("failed", ERROR_CODES.storeUpdateFailed);
      } catch {
        steps.token = step("failed", ERROR_CODES.storeUpdateFailed);
      }
    } else {
      steps.token = await queryStep(
        context,
        bridge.getNativeCachedToken,
        bridge.cancelNativeCachedTokenConsumer,
        (reply) => {
          if (reply?.status !== "completed")
            return step("failed", ERROR_CODES.nativeFailed);
          if (reply.hit !== true) {
            return step(typeof store?.token === "string" && store.token.length > 0
              ? "retained"
              : "not_found");
          }
          if (typeof reply.cacheValue !== "string" || reply.cacheValue.length === 0)
            return step("failed", ERROR_CODES.invalidCallback);
          try {
            return store?.setGlobal?.({ token: reply.cacheValue })
              ? step("updated")
              : step("failed", ERROR_CODES.storeUpdateFailed);
          } catch {
            return step("failed", ERROR_CODES.storeUpdateFailed);
          }
        },
      );
    }
    steps.sdkIdentifiers = await queryStep(
      context,
      bridge.getThirdPartySdkIdentifiers,
      bridge.cancelThirdPartySdkIdentifiersConsumer,
      (reply) => {
        if (reply?.status !== "success" && reply?.status !== "partial_success")
          return step("failed", ERROR_CODES.nativeFailed);
        const update = Object.fromEntries(
          SDK_FIELDS.filter(
            (field) =>
              typeof reply[field] === "string" && reply[field].length > 0,
          ).map((field) => [field, reply[field]]),
        );
        if (Object.keys(update).length === 0)
          return step(
            SDK_FIELDS.some((field) => store?.[field])
              ? "retained"
              : "not_found",
          );
        try {
          return store?.setGlobal?.(update)
            ? step("updated")
            : step("failed", ERROR_CODES.storeUpdateFailed);
        } catch {
          return step("failed", ERROR_CODES.storeUpdateFailed);
        }
      },
    );
    for (const key of ["apiHost", "appInfo", "token", "sdkIdentifiers"])
      if (!steps[key]) steps[key] = step("canceled", ERROR_CODES.canceled);
    const normal = new Set(["updated", "retained", "not_found"]);
    const values = Object.values(steps);
    const status = context.disposed
      ? "canceled"
      : values.every((item) => normal.has(item.status))
        ? "completed"
        : values.some((item) => normal.has(item.status))
          ? "partial_success"
          : "failed";
    return Object.freeze({
      initCycleId: context.id,
      status,
      steps: Object.freeze(steps),
    });
  }

  function initializeHomeHostContext({ initCycleId } = {}) {
    if (!validId(initCycleId)) return Promise.resolve(invalidInitResult());
    if (activeInit?.id === initCycleId) return activeInit.promise;
    if (activeInit || usedInitIds.has(initCycleId))
      return Promise.resolve(invalidInitResult());
    const context = {
      id: initCycleId,
      disposed: false,
      pending: new Set(),
      requests: new Map(),
      promise: null,
    };
    usedInitIds.add(initCycleId);
    activeInit = context;
    context.promise = runInitialization(context);
    return context.promise;
  }

  function disposeHomeHostInit({ initCycleId } = {}) {
    if (!validId(initCycleId) || activeInit?.id !== initCycleId) return;
    const context = activeInit;
    context.disposed = true;
    context.pending.forEach((cancelPending) => cancelPending());
    context.requests.forEach((cancel, requestId) => {
      try {
        cancel(requestId);
      } catch {}
    });
    context.pending.clear();
    context.requests.clear();
    if (activeLoadingId)
      hideHomeHostLoading({ loadingCycleId: activeLoadingId });
    if (activeOperationId)
      cancelHomeHostOperation({ operationId: activeOperationId });
    operationRecords.clear();
    usedInitIds.clear();
    usedLoadingIds.clear();
    activeOperationId = null;
    activeLoadingId = null;
    activeInit = null;
  }

  function showHomeHostLoading({ loadingCycleId } = {}) {
    if (!validId(loadingCycleId) || usedLoadingIds.has(loadingCycleId)) return;
    if (activeLoadingId) {
      try {
        bridge.hideNativeLoading();
      } catch {}
    }
    activeLoadingId = loadingCycleId;
    usedLoadingIds.add(loadingCycleId);
    try {
      bridge.showNativeLoading();
    } catch {}
  }
  function hideHomeHostLoading({ loadingCycleId } = {}) {
    if (!validId(loadingCycleId) || activeLoadingId !== loadingCycleId) return;
    activeLoadingId = null;
    try {
      bridge.hideNativeLoading();
    } catch {}
  }

  function cancelHomeHostOperation(
    { operationId } = {},
    reason = ERROR_CODES.canceled,
  ) {
    if (!validId(operationId)) return;
    const record = operationRecords.get(operationId);
    if (!record || activeOperationId !== operationId) return;
    if (record.permissionStatus === "pending") {
      record.permissionStatus = "canceled";
      record.resolvePermission({
        operationId,
        status: "canceled",
        errorCode: reason,
      });
    }
    if (record.permissionRequestId) {
      try {
        bridge.cancelNativeOneClickPermissionConsumer(
          record.permissionRequestId,
        );
      } catch {}
    }
    activeOperationId = null;
  }
  function replaceActiveOperation(nextOperationId) {
    if (activeOperationId && activeOperationId !== nextOperationId)
      cancelHomeHostOperation(
        { operationId: activeOperationId },
        ERROR_CODES.replaced,
      );
  }

  function requestHomePermissions({ operationId } = {}) {
    if (!validId(operationId))
      return Promise.resolve({
        operationId: null,
        status: "failed",
        errorCode: ERROR_CODES.invalidArgument,
      });
    const existing = operationRecords.get(operationId);
    if (existing?.permissionPromise) return existing.permissionPromise;
    replaceActiveOperation(operationId);
    const record = existing ?? {
      operationId,
      permissionStatus: null,
      permissionRequestId: null,
    };
    activeOperationId = operationId;
    record.permissionPromise = new Promise((resolve) => {
      record.resolvePermission = resolve;
    });
    record.permissionStatus = "pending";
    operationRecords.set(operationId, record);
    const settle = (status, errorCode) => {
      if (record.permissionStatus !== "pending") return;
      record.permissionStatus = status;
      record.resolvePermission({ operationId, status, errorCode });
    };
    try {
      record.permissionRequestId = bridge.requestNativeOneClickPermissions(
        PERMISSIONS,
        (reply) => {
          if (reply?.status === "all_granted") settle("granted", null);
          else settle("failed", ERROR_CODES.invalidCallback);
        },
        {
          onFailure: (failure) =>
            settle("failed", mapBridgeFailure(failure?.code)),
        },
      );
      if (!record.permissionRequestId)
        settle("failed", ERROR_CODES.bridgeCallFailed);
    } catch {
      settle("failed", ERROR_CODES.bridgeCallFailed);
    }
    return record.permissionPromise;
  }

  return Object.freeze({
    initializeHomeHostContext,
    disposeHomeHostInit,
    showHomeHostLoading,
    hideHomeHostLoading,
    requestHomePermissions,
    cancelHomeHostOperation,
  });
}

export {
  ERROR_CODES as HOME_HOST_ERROR_CODES,
  PERMISSIONS as HOME_HOST_PERMISSIONS,
};
