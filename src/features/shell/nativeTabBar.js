export function hideNativeTabBar() {
  const payload = { show: false }
  const bridge = typeof window === 'undefined' ? undefined : window.setTabBar

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('dinero-pro:native-tabbar-request', {
      detail: payload,
    }))
  }

  if (typeof bridge !== 'function') {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('dinero-pro:native-tabbar-diagnostic', {
        detail: { code: 'NATIVE_TABBAR_BRIDGE_MISSING' },
      }))
    }
    return false
  }

  bridge(payload)
  return true
}
