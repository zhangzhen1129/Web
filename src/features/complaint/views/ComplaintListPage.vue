<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { showToast } from 'vant'
import 'vant/es/toast/style'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { useGlobalStore } from '../../../shared/globalStore/globalStore.js'
import { hideNativeLoading, showNativeLoading } from '../../../shared/bridge/nativeLoading.js'
import { COMPLAINT_LIST_CONTENT } from '../complaintListContent.js'
import { createComplaintListController } from '../complaintListController.js'
import { createComplaintServices } from '../services/complaintServices.js'
import backAsset from '../assets/back.svg'
import emptyAsset from '../assets/complaint-record-empty.png'
import './complaintListPage.css'

defineOptions({ name: 'ComplaintListPage' })

const router = useRouter()
const globalStore = useGlobalStore()
const state = ref(null)

function showMessage(message) {
  if (message) showToast({ message, forbidClick: true })
}

function hasHistoryBack() {
  return typeof window !== 'undefined' && Boolean(window.history.state?.back)
}

const controller = createComplaintListController({
  services: createComplaintServices({ getGlobalState: () => globalStore }),
  showNativeLoading,
  hideNativeLoading,
  goBack: () => router.back(),
  replaceComplainHome: () => router.replace({ name: 'complainHome' }),
  hasHistoryBack,
  onBusinessFailure: showMessage,
  onRequestFailure: showMessage,
  onInvalidResponse: showMessage,
})

const unsubscribe = controller.subscribe((nextState) => {
  state.value = nextState
})

onMounted(() => {
  controller.start()
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
  <main class="complaint-list-page">
    <header class="complaint-list-header">
      <button
        class="complaint-list-back"
        type="button"
        :aria-label="COMPLAINT_LIST_CONTENT.backLabel"
        :disabled="!state?.active || state?.navigationLocked"
        @click="controller.requestBack()"
      >
        <img :src="backAsset" alt="" aria-hidden="true" />
      </button>
      <h1>{{ COMPLAINT_LIST_CONTENT.title }}</h1>
    </header>

    <section
      class="complaint-list-scroll"
      :aria-busy="state?.loading ? 'true' : 'false'"
    >
      <div v-if="state?.loading" class="complaint-list-loading-space" aria-hidden="true"></div>

      <div v-else-if="state?.records?.length" class="complaint-record-list">
        <article
          v-for="(record, index) in state.records"
          :key="`${record.id}-${index}`"
          class="complaint-record-item"
        >
          <div class="complaint-record-meta">
            <p class="complaint-record-number">
              {{ COMPLAINT_LIST_CONTENT.recordNumberPrefix }}{{ record.id }}
            </p>
            <p class="complaint-record-time">{{ record.createTime }}</p>
          </div>

          <div class="complaint-record-card">
            <div class="complaint-record-field">
              <span class="complaint-record-label">{{ COMPLAINT_LIST_CONTENT.agencyLabel }}</span>
              <span class="complaint-record-value">{{ record.feedbackMechanism }}</span>
            </div>

            <div class="complaint-record-field">
              <span class="complaint-record-label">{{ COMPLAINT_LIST_CONTENT.questionTypeLabel }}</span>
              <span class="complaint-record-value">{{ record.problemType }}</span>
            </div>

            <div class="complaint-record-details">
              <span class="complaint-record-label">{{ COMPLAINT_LIST_CONTENT.questionDetailsLabel }}</span>
              <p class="complaint-record-details-text">{{ record.problemContent }}</p>
            </div>

            <div
              class="complaint-record-status"
              :class="`complaint-record-status--${record.statusModifier}`"
            >
              <span>{{ record.statusText }}</span>
            </div>
          </div>
        </article>
      </div>

      <div v-else-if="state?.empty" class="complaint-list-empty">
        <img :src="emptyAsset" alt="" aria-hidden="true" />
        <p>{{ COMPLAINT_LIST_CONTENT.emptyText }}</p>
      </div>
    </section>
  </main>
</template>
