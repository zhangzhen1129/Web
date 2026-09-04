import { createApp } from 'vue'
import '../../../style.css'
import { setupRemAdapter } from '../../../remAdapter.js'
import UnifiedHomePreview from './UnifiedHomePreview.vue'

setupRemAdapter()
createApp(UnifiedHomePreview).mount('#app')
