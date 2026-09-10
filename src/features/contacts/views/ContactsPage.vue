<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Popup, showToast } from 'vant'
import 'vant/es/popup/style'
import { useRouter } from 'vue-router'
import { useGlobalStore } from '../../../shared/globalStore/globalStore.js'
import { hideNativeLoading, showNativeLoading } from '../../../shared/bridge/nativeLoading.js'
import { setPhysicalBackIntercept } from '../../../shared/bridge/nativePhysicalBackIntercept.js'
import progressBaseAsset from '../../../assets/information/authentication-progress-step-1.png'
import bellAsset from '../../../assets/information/return-bell.svg'
import activeCoinAsset from '../../../assets/contacts/coin-active.png'
import activeCoinMarkAsset from '../../../assets/contacts/coin-active-mark.svg'
import backAsset from '../../../assets/contacts/back.svg'
import contactAsset from '../../../assets/contacts/contact.svg'
import chevronAsset from '../../../assets/contacts/chevron.svg'
import addressBookAsset from '../../../assets/contacts/address-book.svg'
import closeAsset from '../../../assets/contacts/close.svg'
import invalidPhoneAsset from '../../../assets/contacts/invalid-phone.svg'
import duplicatePhoneAsset from '../../../assets/contacts/duplicate-phone.svg'
import contactGuideAsset from '../../../assets/contacts/contact-guide.svg'
import { createContactBridgeAdapter } from '../contactBridgeAdapter.js'
import { CONTACT_KEYS, RELATIONSHIPS } from '../contactForm.js'
import { createContactKeyboardVisibility } from '../contactKeyboardVisibility.js'
import { CONTACT_DIALOG, createContactsController } from '../contactsController.js'
import { createSaveContactsService } from '../services/saveContacts.js'
import './contactsPage.css'

const router = useRouter()
const globalStore = useGlobalStore()
const state = ref(null)
const activeDialogElement = ref(null)
const nameInputFocused = ref(false)
let lastTriggerElement = null
const keyboardVisibility = createContactKeyboardVisibility()

const controller = createContactsController({
  submitService: createSaveContactsService({ getGlobalState: () => globalStore }),
  contactSelection: createContactBridgeAdapter(),
  showNativeLoading,
  hideNativeLoading,
  setPhysicalBackIntercept,
  onBusinessFailure(message) {
    showToast({ message, forbidClick: true })
  },
  onRequestFailure(message) {
    showToast({ message, forbidClick: true })
  },
  onNavigateIdentity() {
    void router.replace({ name: 'identity' })
  },
  onNavigateBack() {
    router.back()
  },
})

const unsubscribe = controller.subscribe((nextState) => { state.value = nextState })
const canSubmit = computed(() => Boolean(state.value) && controller.canSubmit())
const activeRelationship = computed(() => state.value?.activeContactKey
  ? state.value.contacts[state.value.activeContactKey].relationship
  : '')

const promptContent = computed(() => {
  if (state.value?.dialog === CONTACT_DIALOG.invalidPhone) {
    return { icon: invalidPhoneAsset, message: 'El número de móvil del contacto no está en el formato correcto, por favor, vuelva a seleccionarlo.' }
  }
  if (state.value?.dialog === CONTACT_DIALOG.duplicatePhone) {
    return { icon: duplicatePhoneAsset, message: 'Número de móvil duplicado, seleccione otro contacto.' }
  }
  if (state.value?.dialog === CONTACT_DIALOG.guide) {
    return { icon: contactGuideAsset, message: 'Por favor, asegúrate de elegir un número de móvil real o el dinero no será liberado.' }
  }
  return null
})

function rememberTrigger(event) {
  lastTriggerElement = event?.currentTarget instanceof HTMLElement ? event.currentTarget : null
}

function openRelationship(contactKey, event) {
  rememberTrigger(event)
  controller.openRelationship(contactKey)
}

function requestPhone(contactKey, event) {
  rememberTrigger(event)
  controller.requestPhone(contactKey)
}

function openLeave(event) {
  rememberTrigger(event)
  controller.openLeaveConfirmation()
}

function handlePhoneKeydown(contactKey, event) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  requestPhone(contactKey, event)
}

function closeRelationshipPopup(visible) {
  if (!visible) controller.closeDialog()
}

function confirmPrompt() {
  if (state.value?.dialog === CONTACT_DIALOG.guide) controller.confirmContactGuide()
  else controller.closeDialog()
}

async function handleNameFocus(event) {
  const target = event.currentTarget
  nameInputFocused.value = true
  await nextTick()
  if (document.activeElement !== target) return
  keyboardVisibility.focus(target)
}

function handleNameBlur(event) {
  keyboardVisibility.blur(event.currentTarget)
  nameInputFocused.value = false
}

watch(() => state.value?.dialog, async (nextDialog, previousDialog) => {
  if (nextDialog) {
    await nextTick()
    activeDialogElement.value?.focus()
    return
  }
  if (!nextDialog && previousDialog && previousDialog !== CONTACT_DIALOG.success) {
    await nextTick()
    lastTriggerElement?.focus()
  }
})

onMounted(() => {
  controller.initialize()
})
onBeforeUnmount(() => {
  keyboardVisibility.dispose()
  unsubscribe()
  controller.dispose()
  lastTriggerElement = null
})
</script>

<template>
  <main
    class="contacts-page"
    :class="{ 'contacts-page--name-focused': nameInputFocused }"
    :aria-busy="state?.submitting ? 'true' : 'false'"
  >
    <header class="contacts-page__header">
      <nav class="contacts-page__nav" aria-label="Navegación de contactos">
        <button class="contacts-page__back" type="button" aria-label="Volver" @click="openLeave">
          <img :src="backAsset" alt="" />
        </button>
        <h1>Información de contacto</h1>
      </nav>
      <div class="contacts-progress" aria-label="Paso 2 de 4">
        <img class="contacts-progress__base" :src="progressBaseAsset" alt="" />
        <div class="contacts-progress__active-step" aria-hidden="true">
          <img class="contacts-progress__coin" :src="activeCoinAsset" alt="" />
          <img class="contacts-progress__mark" :src="activeCoinMarkAsset" alt="" />
          <span>2,000</span>
        </div>
        <div class="contacts-progress__label">Paso 2 de 4</div>
      </div>
    </header>

    <section class="contacts-page__content" aria-label="Formulario de contactos de emergencia">
      <section
        v-for="(contactKey, index) in CONTACT_KEYS"
        :key="contactKey"
        class="contact-group"
        :class="`contact-group--${index + 1}`"
        :aria-labelledby="`contact-heading-${contactKey}`"
      >
        <h2 :id="`contact-heading-${contactKey}`">
          <span class="contact-group__icon"><img :src="contactAsset" alt="" /></span>
          Contacto de emergencia {{ index + 1 }}
        </h2>

        <div class="contact-field">
          <label :for="`contact-relationship-${contactKey}`">Elige el parentesco del contacto</label>
          <button
            :id="`contact-relationship-${contactKey}`"
            class="contact-field__control contact-field__select"
            type="button"
            :disabled="state?.submitting"
            aria-haspopup="dialog"
            :aria-expanded="state?.dialog === CONTACT_DIALOG.relationship && state?.activeContactKey === contactKey"
            @click="openRelationship(contactKey, $event)"
          >
            <span :class="{ 'contact-field__placeholder': !state?.contacts[contactKey].relationship }">
              {{ state?.contacts[contactKey].relationship || 'Por favor, elija' }}
            </span>
            <img :src="chevronAsset" alt="" />
          </button>
        </div>

        <div class="contact-field">
          <label :for="`contact-phone-${contactKey}`">Número de contacto</label>
          <div class="contact-field__phone">
            <input
              :id="`contact-phone-${contactKey}`"
              type="text"
              :value="state?.contacts[contactKey].phoneNumber"
              placeholder="Por favor, elija"
              disabled
            />
            <button
              class="contact-field__phone-action"
              type="button"
              :aria-label="`Seleccionar número para contacto de emergencia ${index + 1}`"
              :aria-describedby="`contact-phone-${contactKey}`"
              :disabled="state?.submitting"
              @click="requestPhone(contactKey, $event)"
              @keydown="handlePhoneKeydown(contactKey, $event)"
            >
              <img :src="addressBookAsset" alt="" />
            </button>
          </div>
        </div>

        <div class="contact-field">
          <label :for="`contact-name-${contactKey}`">Nombre</label>
          <input
            :id="`contact-name-${contactKey}`"
            class="contact-field__control"
            type="text"
            :value="state?.contacts[contactKey].name"
            placeholder="Por favor escribe"
            :disabled="state?.submitting"
            @input="controller.updateName(contactKey, $event.target.value)"
            @focus="handleNameFocus"
            @blur="handleNameBlur"
          />
        </div>
      </section>
    </section>

    <footer class="contacts-page__footer">
      <button class="contacts-page__submit" type="button" :disabled="!canSubmit" @click="controller.submit()">Enviar</button>
    </footer>

    <Popup
      :show="state?.dialog === CONTACT_DIALOG.relationship"
      position="bottom"
      :lazy-render="false"
      :close-on-click-overlay="false"
      :lock-scroll="true"
      class="contacts-relationship-popup"
      overlay-class="contacts-popup-overlay"
      @update:show="closeRelationshipPopup"
    >
      <section ref="activeDialogElement" class="contacts-relationship-sheet" role="dialog" aria-modal="true" aria-labelledby="contacts-relationship-title" tabindex="-1">
        <button class="contacts-dialog__close" type="button" aria-label="Cerrar" @click="controller.closeDialog()">
          <img :src="closeAsset" alt="" />
        </button>
        <h2 id="contacts-relationship-title" class="contacts-relationship-sheet__title">Elige el parentesco del contacto</h2>
        <div class="contacts-relationship-sheet__options" role="radiogroup" aria-label="Elige el parentesco del contacto">
          <button
            v-for="relationship in RELATIONSHIPS"
            :key="relationship"
            class="contacts-relationship-sheet__option"
            :class="{ 'contacts-relationship-sheet__option--selected': activeRelationship === relationship }"
            type="button"
            role="radio"
            :aria-checked="activeRelationship === relationship"
            @click="controller.selectRelationship(state.activeContactKey, relationship)"
          >{{ relationship }}</button>
        </div>
      </section>
    </Popup>

    <Transition name="contacts-dialog" mode="out-in">
      <div
        v-if="promptContent"
        class="contacts-modal contacts-modal--centered"
        role="presentation"
      >
        <section ref="activeDialogElement" class="contacts-prompt" role="dialog" aria-modal="true" tabindex="-1">
          <div class="contacts-prompt__icon"><img :src="promptContent.icon" alt="" /></div>
          <p>{{ promptContent.message }}</p>
          <button type="button" @click="confirmPrompt">OK</button>
        </section>
      </div>
    </Transition>

    <Transition name="contacts-dialog" mode="out-in">
      <div v-if="state?.dialog === CONTACT_DIALOG.leave" class="contacts-modal contacts-modal--centered" role="presentation">
        <section ref="activeDialogElement" class="contacts-leave-dialog" role="dialog" aria-modal="true" aria-label="Confirmar salida" tabindex="-1">
          <img :src="bellAsset" alt="" />
          <p>¡Espere, todavía queda un paso para obtener el dinero!</p>
          <button type="button" @click="controller.cancelLeave()">OK</button>
          <button class="contacts-leave-dialog__leave" type="button" @click="controller.confirmLeave()">Renunciar</button>
        </section>
      </div>
    </Transition>

    <Transition name="contacts-dialog">
      <div v-if="state?.dialog === CONTACT_DIALOG.success" class="contacts-modal contacts-modal--centered" role="presentation">
        <section ref="activeDialogElement" class="contacts-success-dialog" role="dialog" aria-modal="true" aria-live="polite" aria-labelledby="contacts-success-title" tabindex="-1">
          <strong id="contacts-success-title">¡Enhorabuena!</strong>
          <span>Espere para responder a la llamada de voz</span>
        </section>
      </div>
    </Transition>
  </main>
</template>
