<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Popup, showToast } from 'vant'
import 'vant/es/popup/style'
import 'vant/es/toast/style'
import { useRouter } from 'vue-router'
import { useGlobalStore } from '../../../shared/globalStore/globalStore.js'
import { hideNativeLoading, showNativeLoading } from '../../../shared/bridge/nativeLoading.js'
import { setPhysicalBackIntercept } from '../../../shared/bridge/nativePhysicalBackIntercept.js'
import { CURRENT_LANGUAGE, getProjectMessage } from '../../../shared/config/projectLanguage.js'
import backAsset from '../../../assets/bankDetail/back.svg'
import chevronAsset from '../../../assets/bank/chevron.svg'
import closeAsset from '../../../assets/bank/close.svg'
import { createContactKeyboardVisibility } from '../../contacts/contactKeyboardVisibility.js'
import { ACCOUNT_TYPE, BANK_OPTIONS, BANK_OPTION_BY_CODE } from '../../bank/bankData.js'
import {
  getAccountNumberLabel,
  getAccountNumberPlaceholder,
  getMaxAccountDigits,
  isSubmitEnabled,
} from '../../bank/bankForm.js'
import { createAddPaymentMethodController } from '../addPaymentMethodController.js'
import { createAddPaymentMethodServices } from '../services/addPaymentMethodServices.js'
import './addPaymentMethodPage.css'

const TEXT = Object.freeze({
  title: 'Añadir método de pago',
  back: 'Volver',
  bankField: 'Forma de pago',
  accountTypeField: 'Forma de pago',
  bankPickerTitle: 'Nombre del banco',
  bankPickerClose: 'Cerrar',
  bankPickerRecommended: 'Recomendar',
  submit: 'Enviar',
  confirmTitle: 'Confirmar la informacionde la cuenta receptora',
  confirmBank: 'Nombre del banco',
  confirmType: 'Tipos de banco',
  confirmAccount: 'Número de cuenta',
  confirmWarning: 'Asegurese de que la information es correcta, Nose puede cambiar despues de la confirmacion.',
  cancel: 'Cancelar',
  confirmOk: 'OK',
  tipsTitle: 'Consejos:',
  tipAccount: '1. Por favor, ingrese el número de cuenta correcto. Un número l incorrecto puede causar que el pago falle.',
  tipType: '2. Seleccione el tipo de cuenta correcto. Un tipo de cuenta erróneo puede provocar que el pago falle.',
  tipArrival: '3. El dinero normalmente se acreditará en su cuenta dentro de una hora, pero en algunos casos el proceso bancario puede ser más lento. Por favor, tenga paciencia.',
})

const ACCOUNT_TYPE_OPTIONS = Object.freeze([
  Object.freeze({ value: ACCOUNT_TYPE.SAVINGS, label: 'Cuenta de ahorro' }),
  Object.freeze({ value: ACCOUNT_TYPE.CHECKING, label: 'Cuenta corriente' }),
])

const router = useRouter()
const globalStore = useGlobalStore()
const state = ref(null)
const scrollElement = ref(null)
const activeDialogElement = ref(null)
const accountInputFocused = ref(false)
let lastTriggerElement = null
const accountInputVisibility = createContactKeyboardVisibility({
  getScrollElement: () => scrollElement.value,
})

const controller = createAddPaymentMethodController({
  services: createAddPaymentMethodServices({ getGlobalState: () => globalStore }),
  showNativeLoading,
  hideNativeLoading,
  setPhysicalBackIntercept,
  onBusinessFailure(message) {
    if (message) showToast({ message, forbidClick: true })
  },
  onAccountFormatError(message) {
    if (message) showToast({ message, forbidClick: true })
  },
  onSuccessNotice() {
    const message = getProjectMessage('60', CURRENT_LANGUAGE)
    if (message) showToast({ message, forbidClick: true })
  },
  onNavigateBack() {
    const canGoBack = typeof window !== 'undefined' && Boolean(window.history.state?.back)
    if (canGoBack) router.back()
    else void router.replace({ name: 'home' })
  },
})

const unsubscribe = controller.subscribe((nextState) => { state.value = nextState })

const selectedBank = computed(() => BANK_OPTION_BY_CODE[state.value?.bankCode] ?? null)
const accountTypeLabel = computed(() => ACCOUNT_TYPE_OPTIONS
  .find((option) => option.value === state.value?.accountType)?.label ?? ACCOUNT_TYPE_OPTIONS[0].label)
const accountNumberLabel = computed(() => getAccountNumberLabel(selectedBank.value))
const accountNumberPlaceholder = computed(() => getAccountNumberPlaceholder(selectedBank.value, state.value?.accountType))
const maxAccountDigits = computed(() => getMaxAccountDigits(selectedBank.value, state.value?.accountType))
const canSubmit = computed(() => Boolean(state.value)
  && !state.value?.submitting
  && !state.value?.navigationLocked
  && isSubmitEnabled({
    bank: selectedBank.value,
    accountNumber: state.value?.accountNumber ?? '',
  }))

function rememberTrigger(event) {
  lastTriggerElement = event?.currentTarget instanceof HTMLElement ? event.currentTarget : null
}

function openBankPicker(event) {
  rememberTrigger(event)
  controller.openBankPicker()
}

function requestConfirmation(event) {
  rememberTrigger(event)
  controller.requestConfirmation()
}

function closePopup(visible, closeAction) {
  if (!visible) closeAction()
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

onMounted(() => controller.initialize())
onBeforeUnmount(() => {
  accountInputVisibility.dispose()
  unsubscribe()
  controller.dispose()
  lastTriggerElement = null
})
</script>

<template>
  <main
    v-if="state"
    class="add-payment-page"
    :class="{ 'add-payment-page--input-focused': accountInputFocused }"
    :aria-busy="state.submitting ? 'true' : 'false'"
  >
    <header class="add-payment-header">
      <nav class="add-payment-header__nav" aria-label="Navegación">
        <button
          class="add-payment-header__back"
          type="button"
          :aria-label="TEXT.back"
          @click="controller.requestBack()"
        >
          <img :src="backAsset" alt="" aria-hidden="true" />
        </button>
        <h1>{{ TEXT.title }}</h1>
      </nav>
    </header>

    <div ref="scrollElement" class="add-payment-scroll">
      <section class="add-payment-content" aria-label="Formulario de cuenta receptora">
        <div class="add-payment-field">
          <label for="add-payment-bank-trigger">{{ TEXT.bankField }}</label>
          <button
            id="add-payment-bank-trigger"            class="add-payment-field__trigger"
            type="button"
            :disabled="state.submitting || state.navigationLocked"
            aria-haspopup="dialog"
            :aria-expanded="state.dialog === 'bank'"
            @click="openBankPicker"
          >
            <span :class="{ 'add-payment-field__value--empty': !selectedBank }">{{ selectedBank?.name ?? 'Por favor, elija' }}</span>
            <img :src="chevronAsset" alt="" aria-hidden="true" />
          </button>
        </div>

        <div class="add-payment-field add-payment-field--types">
          <span class="add-payment-field__label">{{ TEXT.accountTypeField }}</span>
          <div class="add-payment-types" role="radiogroup" :aria-label="TEXT.accountTypeField">
            <button
              v-for="option in ACCOUNT_TYPE_OPTIONS"
              :key="option.value"
              class="add-payment-types__option"
              :class="{ 'add-payment-types__option--selected': state.accountType === option.value }"
              type="button"
              role="radio"
              :aria-checked="state.accountType === option.value"
              :disabled="state.submitting || state.navigationLocked"
              @click="controller.setAccountType(option.value)"
            >{{ option.label }}</button>
          </div>
        </div>

        <div class="add-payment-field">
          <label for="add-payment-account-number">{{ accountNumberLabel }}</label>
          <input
            id="add-payment-account-number"
            class="add-payment-field__input"
            type="text"
            inputmode="numeric"
            pattern="[0-9]*"
            autocomplete="off"
            :value="state.accountNumber"
            :placeholder="accountNumberPlaceholder"
            :maxlength="maxAccountDigits"
            :disabled="state.submitting || state.navigationLocked"
            @focus="handleAccountFocus"
            @blur="handleAccountBlur"
            @input="controller.updateAccountNumber($event.target.value)"
          />
        </div>

        <div class="add-payment-tips">
          <p>{{ TEXT.tipsTitle }}</p>
          <p>{{ TEXT.tipAccount }}</p>
          <p>{{ TEXT.tipType }}</p>
          <p>{{ TEXT.tipArrival }}</p>
        </div>

        <footer class="add-payment-footer">
          <button
            class="add-payment-footer__submit"
            type="button"
            :disabled="!canSubmit"
            @click="requestConfirmation"
          >{{ TEXT.submit }}</button>
        </footer>
      </section>
    </div>

    <Popup
      :show="state.dialog === 'bank'"
      position="bottom"
      :lazy-render="false"
      :close-on-click-overlay="false"
      :lock-scroll="true"
      teleport="body"
      class="add-payment-bank-popup"
      overlay-class="add-payment-popup-overlay"
      @update:show="(visible) => closePopup(visible, controller.closeBankPicker)"
    >
      <section ref="activeDialogElement" class="add-payment-bank-picker" role="dialog" aria-modal="true" aria-labelledby="add-payment-bank-picker-title" tabindex="-1">
        <header class="add-payment-bank-picker__header">
          <h2 id="add-payment-bank-picker-title">{{ TEXT.bankPickerTitle }}</h2>
          <button type="button" :aria-label="TEXT.bankPickerClose" @click="controller.closeBankPicker()">
            <img :src="closeAsset" alt="" aria-hidden="true" />
          </button>
        </header>
        <div class="add-payment-bank-picker__list" role="radiogroup" :aria-label="TEXT.bankPickerTitle">
          <button
            v-for="bank in BANK_OPTIONS"
            :key="bank.code"
            class="add-payment-bank-picker__option"
            :class="{ 'add-payment-bank-picker__option--selected': state.draftBankCode === bank.code }"
            type="button"
            role="radio"
            :aria-checked="state.draftBankCode === bank.code"
            @click="controller.selectBankDraft(bank.code)"
          >
            <span v-if="bank.recommended" class="add-payment-bank-picker__badge">{{ TEXT.bankPickerRecommended }}</span>
            <strong>{{ bank.name }}</strong>
            <small v-if="bank.arrivalText">{{ bank.arrivalText }}</small>
          </button>
        </div>
        <button class="add-payment-bank-picker__submit" type="button" @click="controller.confirmBankSelection()">{{ TEXT.submit }}</button>
      </section>
    </Popup>

    <Popup
      :show="state.dialog === 'confirm'"
      position="center"
      :lazy-render="false"
      :close-on-click-overlay="false"
      :lock-scroll="true"
      teleport="body"
      class="add-payment-confirm-popup"
      overlay-class="add-payment-popup-overlay"
      @update:show="(visible) => closePopup(visible, controller.closeConfirm)"
    >
      <section ref="activeDialogElement" class="add-payment-confirm" role="dialog" aria-modal="true" aria-labelledby="add-payment-confirm-title" tabindex="-1">
        <h2 id="add-payment-confirm-title">{{ TEXT.confirmTitle }}</h2>
        <dl class="add-payment-confirm__summary">
          <div><dt>{{ TEXT.confirmBank }}</dt><dd>{{ selectedBank?.name ?? 'Por favor, elija' }}</dd></div>
          <div><dt>{{ TEXT.confirmType }}</dt><dd>{{ accountTypeLabel }}</dd></div>
          <div><dt>{{ TEXT.confirmAccount }}</dt><dd>{{ state.accountNumber }}</dd></div>
        </dl>
        <p class="add-payment-confirm__warning">{{ TEXT.confirmWarning }}</p>
        <button class="add-payment-confirm__ok" type="button" :disabled="state.submitting" @click="controller.confirmSubmission()">{{ TEXT.confirmOk }}</button>
        <button class="add-payment-confirm__cancel" type="button" :disabled="state.submitting" @click="controller.closeConfirm()">{{ TEXT.cancel }}</button>
      </section>
    </Popup>
  </main>
</template>
