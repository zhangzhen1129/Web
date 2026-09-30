<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Popup, showToast } from 'vant'
import 'vant/es/popup/style'
import 'vant/es/toast/style'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { logoutToOtpLoginNative } from '../../../shared/bridge/nativeBusinessActions.js'
import { setPhysicalBackIntercept } from '../../../shared/bridge/nativePhysicalBackIntercept.js'
import { useGlobalStore } from '../../../shared/globalStore/globalStore.js'
import { createSettingsController } from '../settingsController.js'
import { createSettingsServices } from '../services/settingsServices.js'
import { SETTINGS_TEXT } from '../settingsText.js'
import backAsset from '../assets/back.svg'
import chevronAsset from '../assets/chevron.svg'
import closeAsset from '../assets/close.svg'
import logoutAsset from '../assets/logout.svg'
import './settingsPage.css'

defineOptions({ name: 'SettingsPage' })

const router = useRouter()
const globalStore = useGlobalStore()

function handleRequestFailure(error) {
  const message = typeof error?.displayMessage === 'string' ? error.displayMessage.trim() : ''
  if (!message) return
  showToast({ message, forbidClick: true })
}

function handleBridgeFailure(failure) {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new CustomEvent('dinero-pro:settings-bridge-diagnostic', {
      detail: {
        code: typeof failure?.code === 'string' ? failure.code : 'UNKNOWN',
        capability: typeof failure?.capability === 'string' ? failure.capability : 'unknown',
      },
    }))
  } catch {}
}

function handleTerminalRisk(code) {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new CustomEvent('dinero-pro:settings-terminal-risk', {
      detail: { code: typeof code === 'string' ? code : 'UNKNOWN' },
    }))
  } catch {}
}

function navigateByRouteName(routeName) {
  if (router.currentRoute.value.name === routeName) return false
  return router.push({ name: routeName })
}

function navigateBack() {
  if (router.options.history.state?.back) return router.back()
  return router.replace({ name: 'home' })
}

const controller = createSettingsController({
  services: createSettingsServices({ getGlobalState: () => globalStore }),
  navigate: navigateByRouteName,
  navigateBack,
  clearGlobal: () => globalStore.clearGlobal(),
  logout: logoutToOtpLoginNative,
  setPhysicalBackIntercept,
  onRequestFailure: handleRequestFailure,
  onBridgeFailure: handleBridgeFailure,
  onTerminalRisk: handleTerminalRisk,
})

const state = ref(controller.getState())
const unsubscribe = controller.subscribe((nextState) => {
  state.value = nextState
})

function handleProtocolDialogVisibility(visible) {
  if (!visible) controller.closeProtocolDialog()
}

function requestTermsFromDialog() {
  controller.closeProtocolDialog()
  controller.requestTerms()
}

function requestPrivacyFromDialog() {
  controller.closeProtocolDialog()
  controller.requestPrivacy()
}

function handleLogoutDialogVisibility(visible) {
  if (!visible) controller.cancelLogout()
}

onMounted(() => {
  controller.initialize()
})

onBeforeRouteLeave(() => {
  controller.deactivate()
})

onBeforeUnmount(() => {
  controller.deactivate()
  unsubscribe()
  controller.dispose()
})
</script>

<template>
  <main v-if="state" class="settings-page">
    <header class="settings-page__header">
      <button
        class="settings-page__back"
        type="button"
        :aria-label="SETTINGS_TEXT.accessibility.back"
        :disabled="!state.active || state.navigationLocked"
        @click="controller.requestBack()"
      >
        <img :src="backAsset" alt="" aria-hidden="true" />
      </button>
      <h1>{{ SETTINGS_TEXT.title }}</h1>
    </header>

    <section class="settings-page__content">
      <button
        v-if="state.passwordMode === 'change'"
        class="settings-page__row"
        data-action="change-password"
        type="button"
        :disabled="!state.active || state.navigationLocked"
        @click="controller.requestPasswordNavigation()"
      >
        <span class="settings-page__row-label">{{ SETTINGS_TEXT.changePassword }}</span>
        <img class="settings-page__chevron" :src="chevronAsset" alt="" aria-hidden="true" />
      </button>
      <button
        v-else
        class="settings-page__row"
        data-action="create-password"
        type="button"
        :disabled="!state.active || state.navigationLocked"
        @click="controller.requestPasswordNavigation()"
      >
        <span class="settings-page__row-label">{{ SETTINGS_TEXT.createPassword }}</span>
        <img class="settings-page__chevron" :src="chevronAsset" alt="" aria-hidden="true" />
      </button>

      <button
        class="settings-page__row"
        data-action="legal"
        type="button"
        :disabled="!state.active || state.navigationLocked"
        @click="controller.openProtocolDialog()"
      >
        <span class="settings-page__row-label">{{ SETTINGS_TEXT.legal }}</span>
        <img class="settings-page__chevron" :src="chevronAsset" alt="" aria-hidden="true" />
      </button>
    </section>

    <footer class="settings-page__footer">
      <button
        class="settings-page__logout"
        data-action="logout"
        type="button"
        :disabled="!state.active || state.navigationLocked || state.logoutPending"
        @click="controller.openLogoutDialog()"
      >
        {{ SETTINGS_TEXT.logout }}
      </button>
    </footer>

    <Popup
      :show="state.protocolDialogVisible"
      position="center"
      teleport="body"
      :lazy-render="false"
      :lock-scroll="true"
      :close-on-popstate="true"
      :close-on-click-overlay="true"
      class="settings-protocol-popup"
      overlay-class="settings-popup-overlay"
      @update:show="handleProtocolDialogVisibility"
    >
      <div class="settings-protocol-layer">
        <section
          class="settings-dialog settings-dialog--protocol"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-protocol-title"
        >
          <h2 id="settings-protocol-title" class="settings-dialog__title">{{ SETTINGS_TEXT.legal }}</h2>
          <div class="settings-dialog__actions">
            <button
              class="settings-dialog__outline-button"
              data-action="terms"
              type="button"
              :disabled="state.navigationLocked"
              @click="requestTermsFromDialog()"
            >
              {{ SETTINGS_TEXT.terms }}
            </button>
            <button
              class="settings-dialog__outline-button"
              data-action="privacy"
              type="button"
              :disabled="state.navigationLocked"
              @click="requestPrivacyFromDialog()"
            >
              {{ SETTINGS_TEXT.privacy }}
            </button>
          </div>
        </section>
        <button
          class="settings-protocol-close"
          data-action="close-protocol"
          type="button"
          :aria-label="SETTINGS_TEXT.accessibility.close"
          @click="controller.closeProtocolDialog()"
        >
          <img :src="closeAsset" alt="" aria-hidden="true" />
        </button>
      </div>
    </Popup>

    <Popup
      :show="state.logoutDialogVisible"
      position="center"
      teleport="body"
      :lazy-render="false"
      :lock-scroll="true"
      :close-on-popstate="true"
      :close-on-click-overlay="true"
      class="settings-logout-popup"
      overlay-class="settings-popup-overlay"
      @update:show="handleLogoutDialogVisibility"
    >
      <section
        class="settings-dialog settings-dialog--logout"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-logout-title"
      >
        <div class="settings-logout-content">
          <div class="settings-logout-content__icon">
            <img :src="logoutAsset" alt="" aria-hidden="true" />
          </div>
          <p id="settings-logout-title" class="settings-logout-content__message">
            {{ SETTINGS_TEXT.logoutConfirm }}
          </p>
        </div>
        <div class="settings-logout-actions">
          <button
            class="settings-logout-actions__confirm"
            data-action="confirm-logout"
            type="button"
            :disabled="state.logoutPending"
            @click="controller.confirmLogout()"
          >
            {{ SETTINGS_TEXT.confirm }}
          </button>
          <button
            class="settings-logout-actions__cancel"
            data-action="cancel-logout"
            type="button"
            :disabled="state.logoutPending"
            @click="controller.cancelLogout()"
          >
            {{ SETTINGS_TEXT.cancel }}
          </button>
        </div>
      </section>
    </Popup>
  </main>
</template>

