import { createHomeRouteConsumer } from './homeRoute.js'

let activeDispatcher = null

export function installHomeRouteDispatcher(router) {
  const consumer = createHomeRouteConsumer({ router })
  const dispatcher = (context = {}) => consumer.consumeHomeRouteIntent({
    ...context,
    currentRoute: router.currentRoute.value,
  })
  activeDispatcher = dispatcher

  return () => {
    if (activeDispatcher === dispatcher) activeDispatcher = null
  }
}

export function dispatchHomeRouteIntent(context = {}) {
  if (!activeDispatcher) return Promise.resolve({ type: 'blocked', route: null, reason: 'router_unavailable' })
  return activeDispatcher(context)
}
