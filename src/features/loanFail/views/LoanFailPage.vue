<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import backAsset from '../../loanSuccess/assets/back.svg'
import failureIllustrationAsset from '../assets/failure-illustration.png'
import { createLoanFailController } from '../loanFailController.js'
import './loanFailPage.css'

const route = useRoute()
const router = useRouter()
const state = ref(null)

const controller = createLoanFailController({
  onNavigateBack() {
    const canGoBack = typeof window !== 'undefined' && Boolean(window.history.state?.back)
    if (canGoBack) router.back()
    else void router.replace({ name: 'home' })
  },
  onNavigateHome() {
    void router.replace({ name: 'home' })
  },
})

const unsubscribe = controller.subscribe((nextState) => {
  state.value = nextState
})

onMounted(() => {
  controller.initialize(route.query)
})

onBeforeUnmount(() => {
  unsubscribe()
  controller.dispose()
})
</script>

<template>
  <main v-if="state && state.phase === 'ready'" class="loan-fail-page">
    <header class="loan-fail-header">
      <nav class="loan-fail-header__nav" aria-label="Navegación del préstamo">
        <button
          class="loan-fail-header__back"
          type="button"
          aria-label="Volver"
          :disabled="state.navigationLocked"
          @click="controller.requestBack()"
        >
          <img :src="backAsset" alt="" />
        </button>
        <h1>Solicitud de préstamo</h1>
      </nav>
    </header>

    <section class="loan-fail-content">
      <img class="loan-fail-content__illustration" :src="failureIllustrationAsset" alt="" />
      <p class="loan-fail-content__description">
        Lo sentimos, el envío de la solicitud ha fallado, ¡esta solicitud está llena
      </p>
      <button
        class="loan-fail-content__home"
        type="button"
        :disabled="state.navigationLocked"
        @click="controller.requestHome()"
      >
        Volver a la página de inicio
      </button>
    </section>
  </main>
</template>
