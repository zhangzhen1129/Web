<script setup>
import { computed } from 'vue'
import HomeBroadcast from './HomeBroadcast.vue'
import HomeError from './HomeError.vue'
import HomeSteps from './HomeSteps.vue'
import lockIcon from '../../../assets/home/lock.svg'
import { getMultiPushHomeState } from '../providers/localMultiPushHomeViewData.js'

defineOptions({ name: 'MultiPushHome' })

const props = defineProps({ data: { type: Object, default: null } })
const emit = defineEmits(['action'])

const steps = Object.freeze([
  { key: 'verify', text: 'Verificación de información' },
  { key: 'review', text: 'Revisión del préstamo' },
  { key: 'approve', text: 'Aprobación de la solicitud' },
])

const state = computed(() => getMultiPushHomeState(props.data))
const isActionEnabled = computed(() => props.data?.primaryAction === 'APPLY' || props.data?.primaryAction === 'REPAY')
const productText = computed(() => `${props.data?.availableProductCount ?? 0} productos`)

function emitAction() {
  if (!isActionEnabled.value) return
  emit('action', { type: props.data.primaryAction, products: props.data.products })
}
</script>

<template>
  <main class="multi-push-home" :class="`multi-push-home--${state}`">
    <template v-if="state !== 'invalid'">
      <HomeBroadcast :item="{ text: '978***989 solicitó con éxito un préstamo de S/1000' }" />
      <section class="multi-push-home__content">
        <HomeSteps title="Solicitud rápida en 3 pasos" :steps="steps" />
        <section class="multi-push-credit" aria-label="Cantidad disponible">
          <h1>Cantidad disponible</h1>
          <strong>{{ data.availableAmount }}</strong>
          <img v-if="data.locked" class="multi-push-credit__lock" :src="lockIcon" alt="Crédito bloqueado" />
        </section>
        <section class="multi-push-summary" aria-label="Resumen de crédito">
          <div><span>Crédito total</span><strong>{{ data.totalCredit }}</strong></div>
          <div><span>Crédito usado</span><strong>{{ data.usedCredit }}</strong></div>
        </section>
        <button
          v-if="data.availableProductCount > 0"
          class="multi-push-products"
          type="button"
          @click="emitAction"
        >
          <strong>{{ data.products[0]?.name || 'Soluciones personalizadas' }}</strong>
          <span>{{ productText }}</span>
          <b aria-hidden="true">›</b>
        </button>
        <p v-if="data.statusDescription" class="multi-push-notice">{{ data.statusDescription }}</p>
        <button
          class="multi-push-action"
          type="button"
          :disabled="!isActionEnabled"
          @click="emitAction"
        >{{ data.primaryButtonText }}</button>
      </section>
    </template>
    <section v-else class="multi-push-home__error">
      <HomeError :error="{ messageText: 'No se pudo cargar la información', retryVisible: true, retryText: 'Reintentar' }" :pending="false" @retry="$emit('action', { type: 'RETRY' })" />
    </section>
  </main>
</template>

<style>
.multi-push-home { min-height: 100%; padding-bottom: calc(1.76923rem + env(safe-area-inset-bottom)); background: #f8f9fc; color: #364153; }
.multi-push-home__content { padding: .41026rem .41026rem 1.64103rem; }
.multi-push-home .home-steps { margin-bottom: .41026rem; }
.multi-push-credit { position: relative; min-height: 3.69231rem; padding: .58974rem; border: .02564rem solid #dbeafe; border-radius: .41026rem; background: #f0f7ff; text-align: center; }
.multi-push-credit h1 { margin: 0; color: #333; font-size: .51282rem; font-weight: 500; line-height: .61538rem; }
.multi-push-credit strong { display: block; margin-top: .61538rem; background: linear-gradient(90deg, #155dfc, #4f39f6); background-clip: text; color: transparent; font-size: 1.02564rem; font-weight: 400; line-height: 1.23077rem; white-space: nowrap; }
.multi-push-credit__lock { position: absolute; top: .71795rem; right: .61538rem; width: .41026rem; height: .41026rem; }
.multi-push-summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .25641rem; margin-top: .41026rem; }
.multi-push-summary div, .multi-push-products { min-height: 1.84615rem; border: .02564rem solid #e5e7eb; border-radius: .41026rem; background: #fff; }
.multi-push-summary div { display: grid; place-content: center; text-align: center; }
.multi-push-summary span { font-size: .30769rem; line-height: .41026rem; }
.multi-push-summary strong, .multi-push-products strong { font-size: .41026rem; line-height: .61538rem; }
.multi-push-products { position: relative; display: flex; width: 100%; align-items: center; justify-content: center; margin-top: .41026rem; padding: .41026rem 2.15385rem .41026rem .41026rem; color: #364153; font: inherit; }
.multi-push-products span { position: absolute; right: .74359rem; padding: .10256rem .20513rem; border-radius: .38462rem; background: #ff4a43; color: #fff; font-size: .30769rem; line-height: .41026rem; }
.multi-push-products b { position: absolute; right: .30769rem; color: #6a7282; font-size: .51282rem; font-weight: 400; }
.multi-push-notice { margin: .41026rem 0 0; color: #ff4a43; font-size: .30769rem; line-height: .41026rem; text-align: center; }
.multi-push-action { width: 100%; min-height: 1.4359rem; margin-top: 1.02564rem; border: 0; border-radius: .41026rem; background: linear-gradient(90deg, #155dfc, #4f39f6, #9810fa); color: #fff; font-size: .41026rem; font-weight: 800; line-height: .61538rem; }
.multi-push-action:disabled { opacity: 1; }
.multi-push-home__error { display: grid; min-height: calc(100dvh - 1.76923rem); place-items: center; padding: .61538rem; }
</style>
