<script setup>
import { onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue'
import { Popup, showToast } from 'vant'
import 'vant/es/popup/style'
import 'vant/es/toast/style'
import { useRouter } from 'vue-router'
import { setPopstateGuard } from '../../../shared/navigation/popstateGuard.js'
import { logoutToOtpLoginNative } from '../../../shared/bridge/nativeBusinessActions.js'
import { hideNativeLoading, showNativeLoading } from '../../../shared/bridge/nativeLoading.js'
import { useGlobalStore } from '../../../shared/globalStore/globalStore.js'
import { maskMobile } from '../minePhone.js'
import { MINE_TEXT } from '../mineText.js'
import { createMineController } from '../mineController.js'
import { createMineServices } from '../services/mineServices.js'
import avatarAsset from '../../../assets/mine/avatar.svg'
import bankCardAsset from '../../../assets/mine/bank-card.svg'
import chevronAsset from '../../../assets/mine/chevron.svg'
import complaintsAsset from '../../../assets/mine/complaints.svg'
import customerServiceAsset from '../../../assets/mine/customer-service.svg'
import deleteAccountAsset from '../../../assets/mine/delete-account.svg'
import deleteDialogAsset from '../../../assets/mine/delete-dialog.svg'
import ordersAsset from '../../../assets/mine/orders.svg'
import settingsAsset from '../../../assets/mine/settings.svg'
import './minePage.css'

defineOptions({ name: 'MinePage' })

const router = useRouter()
const globalStore = useGlobalStore()
const state = ref(null)
let hasBeenActivated = false
let deleteHistoryPushed = false
let deleteHistoryRemovalRequested = false
let clearPopstateGuard = null

const menuItems = Object.freeze([
  Object.freeze({ key: 'orderList', icon: ordersAsset }),
  Object.freeze({ key: 'bankCardInfo', icon: bankCardAsset }),
  Object.freeze({ key: 'helpCenter', icon: customerServiceAsset }),
  Object.freeze({ key: 'complaints', icon: complaintsAsset }),
  Object.freeze({ key: 'settings', icon: settingsAsset }),
  Object.freeze({ key: 'deleteAccount', icon: deleteAccountAsset }),
])

function showMessage(message) {
  if (!message) return
  showToast({ message, forbidClick: true })
}

function showRequestFailure(error) {
  const message = typeof error?.displayMessage === 'string' && error.displayMessage
    ? error.displayMessage
    : MINE_TEXT.requestError
  showMessage(message)
}

const controller = createMineController({
  services: createMineServices({ getGlobalState: () => globalStore }),
  navigate: (location) => router.push(location),
  getFallbackMobileText: () => maskMobile(globalStore.mobile),
  clearGlobal: () => globalStore.clearGlobal(),
  logout: logoutToOtpLoginNative,
  showNativeLoading,
  hideNativeLoading,
  onBusinessFailure: showMessage,
  onRequestFailure: showRequestFailure,
  onTerminalRisk: (code) => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent('dinero-pro:mine-terminal-risk', { detail: { code } }))
  },
})

const unsubscribe = controller.subscribe((nextState) => {
  state.value = nextState
})

function pushDeleteHistoryEntry() {
  if (typeof window === 'undefined' || deleteHistoryPushed) return
  window.history.pushState({ mineDeleteDialog: true }, '', window.location.href)
  deleteHistoryPushed = true
}

function removeDeleteHistoryEntry() {
  if (typeof window === 'undefined' || !deleteHistoryPushed) return
  deleteHistoryRemovalRequested = true
  deleteHistoryPushed = false
  window.history.back()
}

function handleDeleteDialogVisibility(visible) {
  if (visible) return
  const shouldRemoveHistory = deleteHistoryRemovalRequested
  deleteHistoryRemovalRequested = false
  deleteHistoryPushed = false
  if (shouldRemoveHistory && typeof window !== 'undefined') window.history.back()
  controller.cancelDelete()
}

function handleDeletePopstate() {
  if (!state.value?.deleteDialogVisible) return
  deleteHistoryRemovalRequested = false
  deleteHistoryPushed = false
  controller.cancelDelete()
}

function openDeleteDialog() {
  if (!controller.openDeleteDialog()) return
  pushDeleteHistoryEntry()
}

function cancelDeleteDialog() {
  if (!controller.cancelDelete()) return
  removeDeleteHistoryEntry()
}

function confirmDeleteDialog() {
  removeDeleteHistoryEntry()
  void controller.confirmDelete()
}

onMounted(() => {
  clearPopstateGuard = setPopstateGuard(handleDeletePopstate)
  controller.start()
})

onActivated(() => {
  if (hasBeenActivated) controller.activate()
  hasBeenActivated = true
})

onDeactivated(() => {
  removeDeleteHistoryEntry()
  controller.deactivate()
})

onBeforeUnmount(() => {
  clearPopstateGuard?.()
  clearPopstateGuard = null
  deleteHistoryPushed = false
  deleteHistoryRemovalRequested = false
  unsubscribe()
  controller.dispose()
  hasBeenActivated = false
})
</script>

<template>
  <main v-if="state" class="mine-page">
    <div class="mine-page__hero" aria-hidden="true"></div>

    <section class="mine-profile" :aria-label="MINE_TEXT.labels.userInfo">
      <div class="mine-profile__avatar">
        <img :src="avatarAsset" alt="" />
      </div>
      <p class="mine-profile__phone">{{ state.phoneText }}</p>
    </section>

    <nav class="mine-menu" :aria-label="MINE_TEXT.labels.menu">
      <button
        v-for="item in menuItems"
        :key="item.key"
        class="mine-menu__item"
        type="button"
        :disabled="state.navigationLocked || (item.key === 'deleteAccount' && state.deleteSubmitting)"
        @click="item.key === 'deleteAccount' ? openDeleteDialog() : controller.requestMenu(item.key)"
      >
        <span class="mine-menu__icon-wrap">
          <img class="mine-menu__icon" :src="item.icon" alt="" />
          <span
            v-if="item.key === 'complaints' && state.showComplaintRedDot"
            class="mine-menu__red-dot"
            aria-hidden="true"
          ></span>
        </span>
        <span class="mine-menu__label">{{ MINE_TEXT.menu[item.key] }}</span>
        <span class="mine-menu__chevron">
          <img :src="chevronAsset" alt="" />
        </span>
      </button>
    </nav>

    <Popup
      :show="state.deleteDialogVisible"
      position="center"
      :lazy-render="false"
      :close-on-click-overlay="false"
      :close-on-popstate="true"
      :lock-scroll="true"
      teleport="body"
      class="mine-delete-popup"
      overlay-class="mine-popup-overlay"
      @update:show="handleDeleteDialogVisibility"
    >
      <section
        class="mine-delete-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="MINE_TEXT.labels.deleteDialog"
      >
        <div class="mine-delete-dialog__body">
          <div class="mine-delete-dialog__icon">
            <img :src="deleteDialogAsset" alt="" />
          </div>
          <p class="mine-delete-dialog__message">{{ MINE_TEXT.deleteDialog.message }}</p>
        </div>
        <div class="mine-delete-dialog__actions">
          <button
            class="mine-delete-dialog__cancel"
            type="button"
            :disabled="state.deleteSubmitting"
            @click="cancelDeleteDialog()"
          >
            {{ MINE_TEXT.deleteDialog.cancel }}
          </button>
          <button
            class="mine-delete-dialog__confirm"
            type="button"
            :disabled="state.deleteSubmitting"
            @click="confirmDeleteDialog()"
          >
            {{ MINE_TEXT.deleteDialog.confirm }}
          </button>
        </div>
      </section>
    </Popup>
  </main>
</template>
