<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { showToast } from 'vant'
import 'vant/es/toast/style'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { hideNativeLoading, showNativeLoading } from '../../../shared/bridge/nativeLoading.js'
import { setNativeCachedToken, setNativeCachedUserId } from '../../../shared/bridge/nativePersistentCache.js'
import { useGlobalStore } from '../../../shared/globalStore/globalStore.js'
import { createPasswordController } from '../createPasswordController.js'
import { CREATE_PASSWORD_TEXT } from '../createPasswordText.js'
import { createCreatePasswordServices } from '../services/createPasswordServices.js'
import backAsset from '../assets/back.svg'
import passwordHiddenAsset from '../assets/password-hidden.svg'
import passwordVisibleAsset from '../assets/password-visible.svg'
import './createPasswordPage.css'

defineOptions({ name: 'CreatePasswordPage' })

const router = useRouter()
const globalStore = useGlobalStore()

function showMessage(message) {
  const normalized = typeof message === 'string' ? message.trim() : ''
  if (!normalized) return
  showToast({ message: normalized, forbidClick: true })
}

function reportDiagnostic(code, capability = null) {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new CustomEvent('dinero-pro:create-password-diagnostic', {
      detail: capability ? { code, capability } : { code },
    }))
  } catch {}
}

function navigateBack() {
  if (router.options.history.state?.back) return router.back()
  return router.replace({ name: 'home' })
}

const controller = createPasswordController({
  services: createCreatePasswordServices({ getGlobalState: () => globalStore }),
  getGlobalState: () => globalStore,
  showNativeLoading,
  hideNativeLoading,
  setNativeCachedToken,
  setNativeCachedUserId,
  navigateBack,
  navigateAfterSuccess: navigateBack,
  onMismatch: () => showMessage(CREATE_PASSWORD_TEXT.mismatch),
  onSuccessNotice: () => showMessage(CREATE_PASSWORD_TEXT.success),
  onFailure: showMessage,
  onStoreFailure: () => reportDiagnostic('STORE_UPDATE_FAILED'),
  onInvalidResponse: () => reportDiagnostic('INVALID_RESPONSE'),
  onNativeWriteFailure: (capability) => reportDiagnostic('NATIVE_WRITE_FAILED', capability),
})

const state = ref(controller.getState())
const unsubscribe = controller.subscribe((nextState) => {
  state.value = nextState
})

function updateField(setter, event) {
  setter(event?.target?.value ?? '')
}

function togglePassword(field) {
  if (field === 'newPassword') {
    controller.toggleNewPasswordVisibility()
    return
  }
  controller.toggleConfirmPasswordVisibility()
}

function passwordToggleLabel(field, visible) {
  if (field === 'newPassword') {
    return visible
      ? CREATE_PASSWORD_TEXT.accessibility.hideNewPassword
      : CREATE_PASSWORD_TEXT.accessibility.showNewPassword
  }
  return visible
    ? CREATE_PASSWORD_TEXT.accessibility.hideConfirmPassword
    : CREATE_PASSWORD_TEXT.accessibility.showConfirmPassword
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
  <main class="create-password-page">
    <header class="create-password-header">
      <button
        class="create-password-header__back"
        type="button"
        :aria-label="CREATE_PASSWORD_TEXT.accessibility.back"
        :disabled="!state.active || state.navigationLocked"
        @click="controller.requestBack()"
      >
        <img :src="backAsset" alt="" aria-hidden="true" />
      </button>
      <h1>{{ CREATE_PASSWORD_TEXT.title }}</h1>
    </header>

    <form class="create-password-form" @submit.prevent="controller.submit()">
      <section class="create-password-field">
        <span class="create-password-field__label" id="create-password-mobile-label">
          {{ CREATE_PASSWORD_TEXT.labels.mobile }}
        </span>
        <div class="create-password-control create-password-control--readonly" role="group" aria-labelledby="create-password-mobile-label">
          <span class="create-password-control__prefix">{{ CREATE_PASSWORD_TEXT.prefix }}</span>
          <span class="create-password-control__divider" aria-hidden="true"></span>
          <span
            class="create-password-control__readonly-value"
            :class="{ 'create-password-control__readonly-value--placeholder': !state.mobile }"
          >
            {{ state.mobile || CREATE_PASSWORD_TEXT.placeholders.mobile }}
          </span>
        </div>
      </section>

      <section class="create-password-field">
        <label class="create-password-field__label" for="create-password-new">
          {{ CREATE_PASSWORD_TEXT.labels.newPassword }}
        </label>
        <div class="create-password-control">
          <input
            id="create-password-new"
            class="create-password-control__input create-password-control__input--password"
            :type="state.newPasswordVisible ? 'text' : 'password'"
            autocomplete="new-password"
            autocapitalize="none"
            spellcheck="false"
            maxlength="16"
            :value="state.newPassword"
            :placeholder="CREATE_PASSWORD_TEXT.placeholders.newPassword"
            :disabled="!state.active || state.navigationLocked || state.submitting || state.successPending"
            @input="updateField(controller.setNewPassword, $event)"
          />
          <button
            class="create-password-control__visibility"
            type="button"
            :aria-label="passwordToggleLabel('newPassword', state.newPasswordVisible)"
            :aria-pressed="state.newPasswordVisible"
            :disabled="!state.active || state.navigationLocked || state.submitting || state.successPending"
            @click="togglePassword('newPassword')"
          >
            <img
              :src="state.newPasswordVisible ? passwordVisibleAsset : passwordHiddenAsset"
              alt=""
              aria-hidden="true"
            />
          </button>
        </div>
      </section>

      <section class="create-password-field">
        <label class="create-password-field__label" for="create-password-confirm">
          {{ CREATE_PASSWORD_TEXT.labels.confirmPassword }}
        </label>
        <div class="create-password-control">
          <input
            id="create-password-confirm"
            class="create-password-control__input create-password-control__input--password"
            :type="state.confirmPasswordVisible ? 'text' : 'password'"
            autocomplete="new-password"
            autocapitalize="none"
            spellcheck="false"
            maxlength="16"
            :value="state.confirmPassword"
            :placeholder="CREATE_PASSWORD_TEXT.placeholders.confirmPassword"
            :disabled="!state.active || state.navigationLocked || state.submitting || state.successPending"
            @input="updateField(controller.setConfirmPassword, $event)"
          />
          <button
            class="create-password-control__visibility"
            type="button"
            :aria-label="passwordToggleLabel('confirmPassword', state.confirmPasswordVisible)"
            :aria-pressed="state.confirmPasswordVisible"
            :disabled="!state.active || state.navigationLocked || state.submitting || state.successPending"
            @click="togglePassword('confirmPassword')"
          >
            <img
              :src="state.confirmPasswordVisible ? passwordVisibleAsset : passwordHiddenAsset"
              alt=""
              aria-hidden="true"
            />
          </button>
        </div>
      </section>

      <footer class="create-password-footer">
        <button class="create-password-submit" type="submit" :disabled="!state.submitEnabled">
          {{ CREATE_PASSWORD_TEXT.submit }}
        </button>
      </footer>
    </form>
  </main>
</template>
