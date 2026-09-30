<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { showToast } from 'vant'
import 'vant/es/toast/style'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { hideNativeLoading, showNativeLoading } from '../../../shared/bridge/nativeLoading.js'
import { setNativeCachedToken, setNativeCachedUserId } from '../../../shared/bridge/nativePersistentCache.js'
import { useGlobalStore } from '../../../shared/globalStore/globalStore.js'
import { createChangePasswordController } from '../changePasswordController.js'
import { CHANGE_PASSWORD_TEXT } from '../changePasswordText.js'
import { createChangePasswordServices } from '../services/changePasswordServices.js'
import backAsset from '../assets/back.svg'
import passwordHiddenAsset from '../assets/password-hidden.svg'
import passwordVisibleAsset from '../assets/password-visible.svg'
import './changePasswordPage.css'

defineOptions({ name: 'ChangePasswordPage' })

const router = useRouter()
const globalStore = useGlobalStore()

function handleFailure(message) {
  const normalized = typeof message === 'string' ? message.trim() : ''
  if (!normalized) return
  showToast({ message: normalized, forbidClick: true })
}

function handleInvalidResponse() {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new CustomEvent('dinero-pro:change-password-diagnostic', {
      detail: { code: 'INVALID_RESPONSE' },
    }))
  } catch {}
}

function handleStoreFailure() {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new CustomEvent('dinero-pro:change-password-diagnostic', {
      detail: { code: 'STORE_UPDATE_FAILED' },
    }))
  } catch {}
}

function navigateBack() {
  if (router.options.history.state?.back) return router.back()
  return router.replace({ name: 'home' })
}

const controller = createChangePasswordController({
  services: createChangePasswordServices({ getGlobalState: () => globalStore }),
  getGlobalState: () => globalStore,
  showNativeLoading,
  hideNativeLoading,
  setNativeCachedToken,
  setNativeCachedUserId,
  navigateBack,
  navigateAfterSuccess: navigateBack,
  onMismatch: () => handleFailure(CHANGE_PASSWORD_TEXT.mismatch),
  onSuccessNotice: () => handleFailure(CHANGE_PASSWORD_TEXT.success),
  onFailure: handleFailure,
  onStoreFailure: handleStoreFailure,
  onInvalidResponse: handleInvalidResponse,
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
  } else {
    controller.toggleConfirmPasswordVisibility()
  }
}

function passwordToggleLabel(field, visible) {
  if (field === 'newPassword') {
    return visible
      ? CHANGE_PASSWORD_TEXT.accessibility.hideNewPassword
      : CHANGE_PASSWORD_TEXT.accessibility.showNewPassword
  }
  return visible
    ? CHANGE_PASSWORD_TEXT.accessibility.hideConfirmPassword
    : CHANGE_PASSWORD_TEXT.accessibility.showConfirmPassword
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
  <main class="change-password-page">
    <header class="change-password-header">
      <button
        class="change-password-header__back"
        type="button"
        :aria-label="CHANGE_PASSWORD_TEXT.accessibility.back"
        :disabled="!state.active || state.navigationLocked"
        @click="controller.requestBack()"
      >
        <img :src="backAsset" alt="" aria-hidden="true" />
      </button>
      <h1>{{ CHANGE_PASSWORD_TEXT.title }}</h1>
    </header>

    <form class="change-password-form" @submit.prevent="controller.submit()">
      <section class="change-password-field">
        <span class="change-password-field__label" id="change-password-mobile-label">
          {{ CHANGE_PASSWORD_TEXT.labels.mobile }}
        </span>
        <div class="change-password-control change-password-control--readonly" role="group" aria-labelledby="change-password-mobile-label">
          <span class="change-password-control__prefix">{{ CHANGE_PASSWORD_TEXT.prefix }}</span>
          <span class="change-password-control__divider" aria-hidden="true"></span>
          <span
            class="change-password-control__readonly-value"
            :class="{ 'change-password-control__readonly-value--placeholder': !state.mobile }"
          >
            {{ state.mobile || CHANGE_PASSWORD_TEXT.placeholders.mobile }}
          </span>
        </div>
      </section>

      <section class="change-password-field">
        <label class="change-password-field__label" for="change-password-old">
          {{ CHANGE_PASSWORD_TEXT.labels.oldPassword }}
        </label>
        <div class="change-password-control">
          <input
            id="change-password-old"
            class="change-password-control__input"
            type="text"
            autocomplete="current-password"
            autocapitalize="none"
            spellcheck="false"
            :value="state.oldPassword"
            :placeholder="CHANGE_PASSWORD_TEXT.placeholders.oldPassword"
            :disabled="!state.active || state.navigationLocked || state.submitting || state.successPending"
            @input="updateField(controller.setOldPassword, $event)"
          />
        </div>
      </section>

      <section class="change-password-field">
        <label class="change-password-field__label" for="change-password-new">
          {{ CHANGE_PASSWORD_TEXT.labels.newPassword }}
        </label>
        <div class="change-password-control">
          <input
            id="change-password-new"
            class="change-password-control__input change-password-control__input--password"
            :type="state.newPasswordVisible ? 'text' : 'password'"
            autocomplete="new-password"
            autocapitalize="none"
            spellcheck="false"
            maxlength="16"
            :value="state.newPassword"
            :placeholder="CHANGE_PASSWORD_TEXT.placeholders.newPassword"
            :disabled="!state.active || state.navigationLocked || state.submitting || state.successPending"
            @input="updateField(controller.setNewPassword, $event)"
          />
          <button
            class="change-password-control__visibility"
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

      <section class="change-password-field">
        <label class="change-password-field__label" for="change-password-confirm">
          {{ CHANGE_PASSWORD_TEXT.labels.confirmPassword }}
        </label>
        <div class="change-password-control">
          <input
            id="change-password-confirm"
            class="change-password-control__input change-password-control__input--password"
            :type="state.confirmPasswordVisible ? 'text' : 'password'"
            autocomplete="new-password"
            autocapitalize="none"
            spellcheck="false"
            maxlength="16"
            :value="state.confirmPassword"
            :placeholder="CHANGE_PASSWORD_TEXT.placeholders.confirmPassword"
            :disabled="!state.active || state.navigationLocked || state.submitting || state.successPending"
            @input="updateField(controller.setConfirmPassword, $event)"
          />
          <button
            class="change-password-control__visibility"
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

      <footer class="change-password-footer">
        <button class="change-password-submit" type="submit" :disabled="!state.submitEnabled">
          {{ CHANGE_PASSWORD_TEXT.submit }}
        </button>
      </footer>
    </form>
  </main>
</template>
