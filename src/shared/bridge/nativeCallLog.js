export function logNativeBridgeCall(method) {
  if (typeof method !== 'string' || method.length === 0 || typeof console === 'undefined') return
  try {
    console.info('[DineroPro][NativeBridge] call', method)
  } catch {}
}
