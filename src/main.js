import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import App from './App.vue'
import { setupRemAdapter } from './remAdapter.js'
import { router } from './router/index.js'
import { initializeVConsole } from './shared/diagnostics/vConsole.js'
import { createRuntimeRecovery } from './shared/diagnostics/runtimeRecovery.js'
import { useGlobalStore } from './shared/globalStore/globalStore.js'

const runtimeRecovery = createRuntimeRecovery()
runtimeRecovery.install()

try {
  setupRemAdapter()
  initializeVConsole()
  const pinia = createPinia()
  const app = createApp(App)
  app.config.errorHandler = runtimeRecovery.handleVueError
  app.use(pinia)
  app.use(router)
  const globalStore = useGlobalStore(pinia)
  app.mount('#app')
} catch {
  runtimeRecovery.handleStartupFailure()
}
