<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Popup, showToast } from 'vant'
import 'vant/es/popup/style'
import 'vant/es/toast/style'
import { useRoute, useRouter } from 'vue-router'
import { useGlobalStore } from '../../../shared/globalStore/globalStore.js'
import { hideNativeLoading, showNativeLoading } from '../../../shared/bridge/nativeLoading.js'
import { setPhysicalBackIntercept } from '../../../shared/bridge/nativePhysicalBackIntercept.js'
import backAsset from '../../../assets/bank/back.svg'
import chevronAsset from '../../../assets/bank/chevron.svg'
import closeAsset from '../../../assets/bank/close.svg'
import coinActiveAsset from '../../../assets/bank/coin-active.png'
import coinInactiveAsset from '../../../assets/bank/coin-inactive.png'
import coinLabelActiveAsset from '../../../assets/bank/coin-label-active.svg'
import coinLabelInactiveAsset from '../../../assets/bank/coin-label-inactive.svg'
import returnBellAsset from '../../../assets/bank/return-bell.svg'
import { createContactKeyboardVisibility } from '../../contacts/contactKeyboardVisibility.js'
import { ACCOUNT_TYPE, BANK_OPTIONS, BANK_OPTION_BY_CODE } from '../bankData.js'
import {
  getAccountNumberLabel,
  getAccountNumberPlaceholder,
  getMaxAccountDigits,
  isSubmitEnabled,
} from '../bankForm.js'
import { BANK_DIALOG, createBankController } from '../bankController.js'
import { createBankServices } from '../services/bankServices.js'
import './bankPage.css'

const route = useRoute()
const router = useRouter()
const globalStore = useGlobalStore()
const state = ref(null)
const contentElement = ref(null)
const activeDialogElement = ref(null)
const bankTriggerElement = ref(null)
const backButtonElement = ref(null)
const accountInputFocused = ref(false)
let lastTriggerElement = null
const accountInputVisibility = createContactKeyboardVisibility({
  getScrollElement: () => contentElement.value,
})

const controller = createBankController({
  services: createBankServices({ getGlobalState: () => globalStore }),
  showNativeLoading,
  hideNativeLoading,
  setPhysicalBackIntercept,
  onBusinessFailure(message) {
    if (message) showToast({ message, forbidClick: true })
  },
  onAccountFormatError(message) {
    if (message) showToast({ message, forbidClick: true })
  },
  onNavigateLoanConfirm({ orderId }) {
    void router.replace({ name: 'loanConfirm', query: { orderId } })
  },
  onNavigateBack() {
    const canGoBack = typeof window !== 'undefined' && Boolean(window.history.state?.back)
    if (canGoBack) router.back()
    else void router.replace({ name: 'home' })
  },
})

const unsubscribe = controller.subscribe((nextState) => { state.value = nextState })

const selectedBank = computed(() => BANK_OPTION_BY_CODE[state.value?.bankCode] ?? null)
const draftBank = computed(() => BANK_OPTION_BY_CODE[state.value?.draftBankCode] ?? null)
const accountTypeOptions = Object.freeze([
  Object.freeze({ value: ACCOUNT_TYPE.SAVINGS, label: 'Cuenta de ahorro' }),
  Object.freeze({ value: ACCOUNT_TYPE.CHECKING, label: 'Cuenta corriente' }),
])
const accountTypeLabel = computed(() => accountTypeOptions.find((option) => option.value === state.value?.accountType)?.label ?? accountTypeOptions[0].label)
const accountNumberLabel = computed(() => getAccountNumberLabel(selectedBank.value))
const accountNumberPlaceholder = computed(() => getAccountNumberPlaceholder(selectedBank.value, state.value?.accountType))
const maxAccountDigits = computed(() => getMaxAccountDigits(selectedBank.value, state.value?.accountType))
const canSubmit = computed(() => Boolean(state.value?.entryValid)
  && !state.value?.submitting
  && !state.value?.navigationLocked
  && isSubmitEnabled({
    bank: selectedBank.value,
    accountNumber: state.value?.accountNumber ?? '',
  }))
const progressSteps = Object.freeze([
  Object.freeze({ value: '1,000', active: true }),
  Object.freeze({ value: '2,000', active: true }),
  Object.freeze({ value: '3,000', active: true }),
  Object.freeze({ value: '5,000', active: false }),
])

function rememberTrigger(event) {
  lastTriggerElement = event?.currentTarget instanceof HTMLElement ? event.currentTarget : null
}

function openBankPicker(event) {
  rememberTrigger(event)
  controller.openBankPicker()
}

function openLeaveConfirmation(event) {
  rememberTrigger(event)
  controller.openLeaveConfirmation()
}

function requestConfirmation(event) {
  rememberTrigger(event)
  controller.requestConfirmation()
}

function closePopup(visible, closeAction) {
  if (!visible) closeAction()
}

function reloadPage() {
  window.location.reload()
}

async function handleAccountFocus(event) {
  const target = event.currentTarget
  accountInputFocused.value = true
  await nextTick()
  if (document.activeElement !== target) return
  accountInputVisibility.focus(target)
}

function handleAccountBlur(event) {
  accountInputVisibility.blur(event.currentTarget)
  accountInputFocused.value = false
}

watch(() => state.value?.dialog, async (nextDialog, previousDialog) => {
  if (nextDialog) {
    await nextTick()
    activeDialogElement.value?.focus()
    return
  }
  if (previousDialog) {
    await nextTick()
    lastTriggerElement?.focus?.()
    lastTriggerElement = null
  }
})

onMounted(() => controller.initialize(route.query))
onBeforeUnmount(() => {
  accountInputVisibility.dispose()
  unsubscribe()
  controller.dispose()
  lastTriggerElement = null
})
</script>

<template>
  <main v-if="state && !state.entryValid" class="bank-page bank-page--invalid" role="alert">
    <p>No se pudo continuar.</p>
    <button type="button" @click="reloadPage">Recargar</button>
  </main>

  <main
    v-else
    class="bank-page"
    :class="{ 'bank-page--input-focused': accountInputFocused }"
    :aria-busy="state?.submitting ? 'true' : 'false'"
  >
    <header class="bank-header">
      <nav class="bank-header__nav" aria-label="Navegación bancaria">
        <button ref="backButtonElement" class="bank-header__back" type="button" aria-label="Volver" @click="openLeaveConfirmation">
          <img :src="backAsset" alt="" />
        </button>
        <h1>Información bancaria</h1>
      </nav>
      <div class="bank-progress" aria-label="Paso 4 de 4">
        <div class="bank-progress__line" aria-hidden="true"><span></span></div>
        <div class="bank-progress__steps">
          <div v-for="step in progressSteps" :key="step.value" class="bank-progress__step">
            <img :src="step.active ? coinActiveAsset : coinInactiveAsset" alt="" />
            <span class="bank-progress__amount">
              <img :src="step.active ? coinLabelActiveAsset : coinLabelInactiveAsset" alt="" />
              <b>{{ step.value }}</b>
            </span>
          </div>
        </div>
        <span class="bank-progress__caption">Paso 4 de 4</span>
      </div>
    </header>

    <section ref="contentElement" class="bank-content" aria-label="Formulario bancario">
      <div class="bank-field">
        <label for="bank-payment-trigger">Forma de pago</label>
        <button
          id="bank-payment-trigger"
          ref="bankTriggerElement"
          class="bank-field__trigger"
          type="button"
          :disabled="state?.submitting || state?.navigationLocked"
          aria-haspopup="dialog"
          :aria-expanded="state?.dialog === BANK_DIALOG.BANK"
          @click="openBankPicker"
        >
          <span :class="{ 'bank-field__value--empty': !selectedBank }">{{ selectedBank?.name ?? 'Por favor, elija' }}</span>
          <img :src="chevronAsset" alt="" />
        </button>
      </div>

      <div class="bank-field">
        <span class="bank-field__label">Forma de pago</span>
        <div class="bank-account-types" role="radiogroup" aria-label="Forma de pago">
          <button
            v-for="option in accountTypeOptions"
            :key="option.value"
            class="bank-account-types__option"
            :class="{ 'bank-account-types__option--selected': state?.accountType === option.value }"
            type="button"
            role="radio"
            :aria-checked="state?.accountType === option.value"
            :disabled="state?.submitting || state?.navigationLocked"
            @click="controller.setAccountType(option.value)"
          >{{ option.label }}</button>
        </div>
      </div>

      <div class="bank-field">
        <label for="bank-account-number">{{ accountNumberLabel }}</label>
        <input
          id="bank-account-number"
          class="bank-field__input"
          type="text"
          inputmode="numeric"
          pattern="[0-9]*"
          autocomplete="off"
          :value="state?.accountNumber"
          :placeholder="accountNumberPlaceholder"
          :maxlength="maxAccountDigits"
          :disabled="state?.submitting || state?.navigationLocked"
          @focus="handleAccountFocus"
          @blur="handleAccountBlur"
          @input="controller.updateAccountNumber($event.target.value)"
        />
      </div>

      <div class="bank-tips">
        <p>Consejos:</p>
        <p>1.Por favor, ingrese el número de cuenta correcto. Un número incorrecto puede causar que el pago falle.</p>
        <p>2.Seleccione el tipo de cuenta correcto. Un tipo de cuenta erróneo puede provocar que el pago falle.</p>
        <p>3.El dinero normalmente se acreditará en su cuenta dentro de una hora, pero en algunos casos el proceso bancario puede ser más lento. Por favor, tenga paciencia.</p>
      </div>
    </section>

    <footer class="bank-footer">
      <button class="bank-footer__submit" type="button" :disabled="!canSubmit" @click="requestConfirmation">Enviar</button>
    </footer>

    <Popup
      :show="state?.dialog === BANK_DIALOG.BANK"
      position="bottom"
      :lazy-render="false"
      :close-on-click-overlay="false"
      :lock-scroll="true"
      teleport="body"
      :class="'bank-picker-popup'"
      :overlay-class="'bank-popup-overlay'"
      @update:show="(visible) => closePopup(visible, controller.closeBankPicker)"
    >
      <section ref="activeDialogElement" class="bank-picker" role="dialog" aria-modal="true" aria-labelledby="bank-picker-title" tabindex="-1">
        <header class="bank-picker__header">
          <h2 id="bank-picker-title">Nombre del banco</h2>
          <button type="button" aria-label="Cerrar" @click="controller.closeBankPicker()"><img :src="closeAsset" alt="" /></button>
        </header>
        <div class="bank-picker__list" role="radiogroup" aria-label="Nombre del banco">
          <button
            v-for="bank in BANK_OPTIONS"
            :key="bank.code"
            class="bank-picker__option"
            :class="{ 'bank-picker__option--selected': state?.draftBankCode === bank.code }"
            type="button"
            role="radio"
            :aria-checked="state?.draftBankCode === bank.code"
            @click="controller.selectBankDraft(bank.code)"
          >
            <span v-if="bank.recommended" class="bank-picker__badge">Recomendar</span>
            <strong>{{ bank.name }}</strong>
            <small v-if="bank.arrivalText">{{ bank.arrivalText }}</small>
          </button>
        </div>
        <button class="bank-picker__submit" type="button" @click="controller.confirmBankSelection()">Enviar</button>
      </section>
    </Popup>

    <Popup
      :show="state?.dialog === BANK_DIALOG.CONFIRM"
      position="center"
      :lazy-render="false"
      :close-on-click-overlay="false"
      :lock-scroll="true"
      teleport="body"
      :class="'bank-confirm-popup'"
      :overlay-class="'bank-popup-overlay'"
      @update:show="(visible) => closePopup(visible, controller.closeConfirm)"
    >
      <section ref="activeDialogElement" class="bank-confirm" role="dialog" aria-modal="true" aria-labelledby="bank-confirm-title" tabindex="-1">
        <h2 id="bank-confirm-title">Confirmar la información de la cuenta receptora</h2>
        <dl class="bank-confirm__summary">
          <div><dt>Nombre del banco</dt><dd>{{ selectedBank?.name ?? 'Por favor, elija' }}</dd></div>
          <div><dt>Tipos de banco</dt><dd>{{ accountTypeLabel }}</dd></div>
          <div><dt>Número de cuenta</dt><dd>{{ state?.accountNumber }}</dd></div>
        </dl>
        <p class="bank-confirm__warning">Asegúrese de que la información es correcta. No se puede cambiar después de la confirmación.</p>
        <button class="bank-confirm__ok" type="button" :disabled="state?.submitting" @click="controller.confirmSubmission()">OK</button>
        <button class="bank-confirm__cancel" type="button" :disabled="state?.submitting" @click="controller.closeConfirm()">Cancelar</button>
      </section>
    </Popup>

    <Popup
      :show="state?.dialog === BANK_DIALOG.LEAVE"
      position="center"
      :lazy-render="false"
      :close-on-click-overlay="false"
      :lock-scroll="true"
      teleport="body"
      :class="'bank-leave-popup'"
      :overlay-class="'bank-popup-overlay'"
      @update:show="(visible) => closePopup(visible, controller.cancelLeave)"
    >
      <section ref="activeDialogElement" class="bank-leave" role="dialog" aria-modal="true" aria-label="Confirmar salida" tabindex="-1">
        <img :src="returnBellAsset" alt="" />
        <p>¡Espere, todavía queda un paso para obtener el dinero!</p>
        <button type="button" @click="controller.cancelLeave()">OK</button>
        <button class="bank-leave__exit" type="button" @click="controller.confirmLeave()">Renunciar</button>
      </section>
    </Popup>
  </main>
</template>
