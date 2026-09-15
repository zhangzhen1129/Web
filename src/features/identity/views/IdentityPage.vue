<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Popup, showToast } from 'vant'
import 'vant/es/popup/style'
import 'vant/es/toast/style'
import { useRouter } from 'vue-router'
import { useGlobalStore } from '../../../shared/globalStore/globalStore.js'
import { createIdentityController, IDENTITY_PHASE } from '../identityController.js'
import { createIdentityServices } from '../services/identityServices.js'
import backAsset from '../../../assets/identity/identity-back.svg'
import coinActiveAsset from '../../../assets/identity/coin-active.png'
import coinInactiveAsset from '../../../assets/identity/coin-inactive.png'
import dniCardAsset from '../../../assets/identity/dni-card.png'
import cameraAsset from '../../../assets/identity/camera.svg'
import returnBellAsset from '../../../assets/information/return-bell.svg'
import progressCloseAsset from '../../../assets/identity/progress-close.svg'
import checkAsset from '../../../assets/identity/check.svg'
import errorAsset from '../../../assets/identity/error.svg'
import editAsset from '../../../assets/identity/edit.svg'
import flashAsset from '../../../assets/identity/flash.svg'
import './identityPage.css'

const router = useRouter()
const globalStore = useGlobalStore()
const state = ref(null)

const controller = createIdentityController({
  services: createIdentityServices({ getGlobalState: () => globalStore }),
  onBusinessFailure(message) { if (message) showToast({ message, forbidClick: true }) },
  onRequestFailure(message) { if (message) showToast({ message, forbidClick: true }) },
  onNavigateAddBank({ orderId, from }) { void router.replace({ name: 'addBank', query: { orderId, from } }) },
  onNavigateBack() { void router.back() },
})

const unsubscribe = controller.subscribe((nextState) => { state.value = nextState })
const isReady = computed(() => state.value?.phase === IDENTITY_PHASE.DOCUMENT_READY)
const isBusy = computed(() => Boolean(state.value?.busy))
const showFirstPrompt = computed(() => Boolean(state.value?.firstPromptOpen && !state.value?.leaveConfirmationOpen))
const showLeavePrompt = computed(() => Boolean(state.value?.leaveConfirmationOpen))
const showProgress = computed(() => Boolean(state.value?.progressOpen && !state.value?.leaveConfirmationOpen))
const progressValue = computed(() => state.value?.progress ?? 1)
const progress = computed(() => `${progressValue.value}%`)
const progressPosition = computed(() => `${Math.min(93, Math.max(7, progressValue.value))}%`)

function onDocumentClick() {
  controller.openDocumentArea()
}

function onConfirmFirstPrompt() {
  controller.confirmFirstPrompt()
}

function onDniInput(event) {
  controller.updateDni(event.target.value)
}

function onSubmit() {
  void controller.submit()
}

function onBack() {
  controller.requestLeave()
}

onMounted(() => controller.initialize())
onBeforeUnmount(() => { unsubscribe(); controller.dispose() })
</script>

<template>
  <main class="identity-page" :aria-busy="isBusy ? 'true' : 'false'">
    <section class="identity-hero" aria-labelledby="identity-title">
      <header class="identity-header">
        <button class="identity-back" type="button" aria-label="Back" @click="onBack">
          <img :src="backAsset" alt="" />
        </button>
        <h1 id="identity-title">Verificación de identidad</h1>
      </header>
      <div class="identity-progress-steps" aria-label="Paso 3 de 4">
        <div class="identity-steps-line"><span></span><span></span><span></span></div>
        <div v-for="(step, index) in [1000, 2000, 3000, 5000]" :key="step" class="identity-step">
          <img :src="index < 3 ? coinActiveAsset : coinInactiveAsset" alt="" />
          <span class="identity-step-value">{{ step.toLocaleString('en-US') }}</span>
        </div>
        <span class="identity-step-caption">Paso 3 de 4</span>
      </div>
    </section>

    <section class="identity-content">
      <button class="identity-card-wrap" type="button" :disabled="isBusy" :aria-label="isReady ? 'Retake DNI photo' : 'Upload DNI photo'" @click="onDocumentClick">
        <div class="identity-card-art">
          <img class="identity-card-image" :src="state?.imagePreviewUrl || dniCardAsset" alt="DNI / DNIe preview" />
          <span class="identity-camera"><img :src="cameraAsset" alt="" /></span>
        </div>
        <span class="identity-card-label">Frente de DNI / DNIe</span>
      </button>

      <section v-if="isReady" class="identity-dni-field" aria-label="DNI field">
        <div class="identity-field-heading"><label for="identity-dni">DNI</label><span>Corrija si la identificación es incorrecta.</span></div>
        <div class="identity-input-shell">
          <input id="identity-dni" :value="state.dni" type="text" autocomplete="off" @input="onDniInput" />
          <span class="identity-edit-icon" aria-hidden="true"><img :src="editAsset" alt="" /></span>
        </div>
      </section>

      <div class="identity-notes">
        <p>1. Asegúrate de que el DNI / DNIe que subes es auténtico y válido</p>
        <p>2. Asegúrese de que la foto DNI / DNIe cargada es clara y completa, de lo contrario no pasará la verificación.</p>
      </div>
    </section>

    <div class="identity-bottom-bar">
      <button class="identity-submit" :class="{ 'is-enabled': state?.canSubmit }" type="button" :disabled="!state?.canSubmit" @click="onSubmit">Enviar</button>
    </div>

    <Popup :show="showFirstPrompt" round :overlay="true" :close-on-click-overlay="false" class="identity-popup identity-first-popup">
      <div class="identity-first-content">
        <h2>Ejemplo de DNI correcto</h2>
        <div class="identity-example-card"><img :src="dniCardAsset" alt="Correct DNI example" /><span><img :src="checkAsset" alt="" /></span></div>
        <div class="identity-example-row"><div><img :src="dniCardAsset" alt="" /><b><img :src="errorAsset" alt="" /></b><small>Borde ausente</small></div><div><img :src="dniCardAsset" alt="" /><b><img :src="errorAsset" alt="" /></b><small>Foto borrosa</small></div><div><img :src="dniCardAsset" alt="" /><b><img :src="errorAsset" alt="" /></b><i><img :src="flashAsset" alt="" /></i><small>Flash fuerte</small></div></div>
        <p>Una información clara sobre la tarjeta DNI aumentará el éxito de los préstamos al menos un 20%</p>
        <button type="button" @click="onConfirmFirstPrompt">Siguiente paso</button>
      </div>
    </Popup>

    <Popup :show="showProgress" round :overlay="true" :close-on-click-overlay="false" class="identity-popup identity-progress-popup">
      <div class="identity-progress-content">
        <div class="identity-progress-track"><span :style="{ width: progress }"></span><b :style="{ left: progressPosition }">{{ progress }}</b></div>
        <p>Por favor, sea paciente y espere a la carga para desbloquear el crédito</p>
      </div>
      <img class="identity-progress-close" :src="progressCloseAsset" alt="" />
    </Popup>

    <Popup :show="showLeavePrompt" round :overlay="true" :close-on-click-overlay="false" class="identity-popup identity-leave-popup">
      <div class="identity-leave-content">
        <div class="identity-leave-icon"><img :src="returnBellAsset" alt="" /></div>
        <p>¡Espere, todavía queda un paso para obtener el dinero!</p>
        <button type="button" @click="controller.cancelLeave">OK</button>
        <button class="identity-leave-cancel" type="button" @click="controller.confirmLeave">Renunciar</button>
      </div>
    </Popup>
  </main>
</template>


