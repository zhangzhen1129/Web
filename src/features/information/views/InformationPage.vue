<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { showToast } from 'vant'
import { useRouter } from 'vue-router'
import { useGlobalStore } from '../../../shared/globalStore/globalStore.js'
import { hideNativeLoading, showNativeLoading } from '../../../shared/bridge/nativeLoading.js'
import { setPhysicalBackIntercept } from '../../../shared/bridge/nativePhysicalBackIntercept.js'
import authenticationProgressStepOneAsset from '../../../assets/information/authentication-progress-step-1.png'
import backAsset from '../../../assets/information/back.svg'
import chevronAsset from '../../../assets/information/chevron.svg'
import closeAsset from '../../../assets/information/close.svg'
import bellAsset from '../../../assets/information/return-bell.svg'
import { INFORMATION_FIELDS, isCompleteInformationForm } from '../informationOptions.js'
import { createInformationController } from '../informationController.js'
import { createSaveBasicInformationService } from '../services/saveBasicInformation.js'
import './informationPage.css'

const router = useRouter()
const globalStore = useGlobalStore()
const state = ref(null)

const controller = createInformationController({
  submitService: createSaveBasicInformationService({ getGlobalState: () => globalStore }),
  showNativeLoading,
  hideNativeLoading,
  setPhysicalBackIntercept,
  onBusinessFailure(message) {
    if (message) showToast({ message, forbidClick: true })
  },
  onNavigateContacts() {
    void router.replace({ name: 'contacts' })
  },
  onNavigateBack() {
    router.back()
  },
})

const unsubscribe = controller.subscribe((nextState) => { state.value = nextState })
const activeField = computed(() => INFORMATION_FIELDS.find((field) => field.key === state.value?.activeField) ?? null)
const canSubmit = computed(() => isCompleteInformationForm(state.value?.values) && !state.value?.submitting)

onMounted(() => controller.initialize())
onBeforeUnmount(() => {
  unsubscribe()
  controller.dispose()
})
</script>

<template>
  <main class="information-page" :aria-busy="state?.submitting ? 'true' : 'false'">
    <header class="information-page__header">
      <nav class="information-page__nav" aria-label="Information navigation">
        <button class="information-page__back" type="button" aria-label="Back" @click="controller.openLeaveConfirmation()">
          <img :src="backAsset" alt="" />
        </button>
        <h1>Información básica</h1>
      </nav>
      <div class="information-page__progress" aria-label="Paso 1 de 4">
        <img :src="authenticationProgressStepOneAsset" alt="" />
      </div>
    </header>

    <section class="information-page__content" aria-label="Basic information form">
      <div v-for="field in INFORMATION_FIELDS" :key="field.key" class="information-field">
        <label :for="`information-field-${field.key}`">{{ field.label }}</label>
        <button
          :id="`information-field-${field.key}`"
          class="information-field__trigger"
          type="button"
          :disabled="state?.submitting"
          :aria-haspopup="'dialog'"
          :aria-expanded="activeField?.key === field.key"
          @click="controller.openField(field.key)"
        >
          <span :class="{ 'information-field__value--empty': !state?.values[field.key] }">
            {{ field.options.find((option) => option.key === state?.values[field.key])?.label ?? 'Por favor, elija' }}
          </span>
          <img :src="chevronAsset" alt="" />
        </button>
      </div>
    </section>

    <footer class="information-page__footer">
      <button class="information-page__submit" type="button" :disabled="!canSubmit" @click="controller.submit()">Enviar</button>
    </footer>

    <Transition name="information-sheet">
      <div v-if="activeField" class="information-modal" role="presentation" @click.self="controller.closeOptions()">
        <section class="information-modal__sheet" role="dialog" aria-modal="true" :aria-labelledby="`information-options-title-${activeField.key}`">
          <button class="information-modal__close" type="button" aria-label="Close" @click="controller.closeOptions()"><img :src="closeAsset" alt="" /></button>
          <h2 :id="`information-options-title-${activeField.key}`">{{ activeField.label }}</h2>
          <div class="information-modal__options" role="radiogroup" :aria-label="activeField.label">
            <button
              v-for="option in activeField.options"
              :key="option.key"
              class="information-modal__option"
              :class="{ 'information-modal__option--selected': state?.values[activeField.key] === option.key }"
              type="button"
              role="radio"
              :aria-checked="state?.values[activeField.key] === option.key"
              @click="controller.select(activeField.key, option.key)"
            >{{ option.label }}</button>
          </div>
        </section>
      </div>
    </Transition>

    <Transition name="information-dialog">
      <div v-if="state?.leaveConfirmationOpen" class="information-modal information-modal--centered" role="presentation">
        <section class="information-leave-dialog" role="dialog" aria-modal="true" aria-label="Leave confirmation">
          <img :src="bellAsset" alt="" />
          <p>¡Espere, todavía queda un paso para obtener el dinero!</p>
          <button type="button" @click="controller.cancelLeave()">OK</button>
          <button class="information-leave-dialog__leave" type="button" @click="controller.confirmLeave()">Renunciar</button>
        </section>
      </div>
    </Transition>

    <Transition name="information-dialog">
      <div v-if="state?.successOpen" class="information-modal information-modal--centered" role="status" aria-live="polite">
        <section class="information-success-dialog">
          <strong>¡Enhorabuena!</strong>
          <span>Espere para responder a la llamada de voz</span>
        </section>
      </div>
    </Transition>
  </main>
</template>
