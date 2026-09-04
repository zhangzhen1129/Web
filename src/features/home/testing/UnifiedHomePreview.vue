<script setup>
import { nextTick, onMounted, ref } from 'vue'
import UnifiedHomeView from '../ui/UnifiedHomeView.vue'
import { createUnifiedHomeFixture } from './unifiedHomeFixtures.js'

const query = new URLSearchParams(window.location.search)
const scenario = query.get('scenario') ?? 'cash-apply'
const activeTab = query.get('tab') ?? 'home'
const payload = createUnifiedHomeFixture(scenario, activeTab)
const homeView = ref(null)
const operationLog = []
const diagnosticLog = []
let operationSequence = 0

function recordOperation(operation) {
  operationLog.push(operation)
}

function recordDiagnostic(diagnostic) {
  diagnosticLog.push(diagnostic)
}

onMounted(async () => {
  await nextTick()
  window.unifiedHomePreview = Object.freeze({
    scenario,
    operationLog,
    diagnosticLog,
    updateHomeView(payloadUpdate) {
      homeView.value?.updateHomeView(payloadUpdate)
    },
  })
})
</script>

<template>
  <UnifiedHomeView
    ref="homeView"
    :initial-payload="payload"
    :request-id-factory="() => `home-browser-${operationSequence += 1}`"
    @emit-home-operation="recordOperation"
    @diagnostic="recordDiagnostic"
  />
</template>
