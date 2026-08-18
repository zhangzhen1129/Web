import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { setupRemAdapter } from './remAdapter.js'
import { router } from './router/index.js'

setupRemAdapter()
createApp(App).use(router).mount('#app')
