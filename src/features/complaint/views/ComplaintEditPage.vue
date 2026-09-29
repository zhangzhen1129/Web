<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { showToast } from 'vant'
import 'vant/es/toast/style'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { useGlobalStore } from '../../../shared/globalStore/globalStore.js'
import { hideNativeLoading, showNativeLoading } from '../../../shared/bridge/nativeLoading.js'
import { COMPLAINT_EDIT_CONTENT } from '../complaintEditContent.js'
import { createComplaintEditController } from '../complaintEditController.js'
import { createComplaintServices } from '../services/complaintServices.js'
import backAsset from '../assets/back.svg'
import './complaintEditPage.css'

defineOptions({ name: 'ComplaintEditPage' })

const route = useRoute()
const router = useRouter()
const globalStore = useGlobalStore()
const state = ref(null)

function showMessage(message) {
  if (message) showToast({ message, forbidClick: true })
}

function hasHistoryBack() {
  return typeof window !== 'undefined' && Boolean(window.history.state?.back)
}

const controller = createComplaintEditController({
  services: createComplaintServices({ getGlobalState: () => globalStore }),
  showNativeLoading,
  hideNativeLoading,
  goBack: () => router.back(),
  replaceHome: () => router.replace({ name: 'home' }),
  replaceComplainHome: () => router.replace({ name: 'complainHome' }),
  hasHistoryBack,
  onBusinessFailure: showMessage,
  onRequestFailure: showMessage,
  onSuccessNotice: () => showMessage(COMPLAINT_EDIT_CONTENT.successMessage),
})

const unsubscribe = controller.subscribe((nextState) => {
  state.value = nextState
})

function handleDetailsInput(event) {
  controller.updateDetails(event.target.value)
}

onMounted(() => {
  controller.initialize({
    agency: route.query.type,
    question: route.query.question,
    mobile: globalStore.mobile,
  })
})

onBeforeRouteLeave(() => {
  controller.deactivate()
})

onBeforeRouteUpdate((to) => {
  controller.deactivate()
  controller.initialize({
    agency: to.query.type,
    question: to.query.question,
    mobile: globalStore.mobile,
  })
})

onBeforeUnmount(() => {
  controller.deactivate()
  unsubscribe()
  controller.dispose()
})
</script>

<template>
  <main class="complaint-edit-page">
    <header class="complaint-edit-header">
      <button
        class="complaint-edit-back"
        type="button"
        :aria-label="COMPLAINT_EDIT_CONTENT.backLabel"
        :disabled="!state?.active || state?.navigationLocked"
        @click="controller.requestBack()"
      >
        <img :src="backAsset" alt="" aria-hidden="true" />
      </button>
      <h1>{{ COMPLAINT_EDIT_CONTENT.title }}</h1>
    </header>

    <section v-if="state" class="complaint-edit-scroll">
      <div class="complaint-edit-content">
        <section class="complaint-edit-field">
          <p id="complaint-edit-agency-label" class="complaint-edit-label">
            {{ COMPLAINT_EDIT_CONTENT.agencyLabel }}
          </p>
          <div
            class="complaint-edit-readonly"
            role="group"
            aria-labelledby="complaint-edit-agency-label"
          >{{ state.agency }}</div>
        </section>

        <section class="complaint-edit-field">
          <p id="complaint-edit-question-label" class="complaint-edit-label">
            {{ COMPLAINT_EDIT_CONTENT.questionTypeLabel }}
          </p>
          <div
            class="complaint-edit-readonly"
            role="group"
            aria-labelledby="complaint-edit-question-label"
          >{{ state.question }}</div>
        </section>

        <section class="complaint-edit-field">
          <div class="complaint-edit-heading">
            <label id="complaint-edit-details-label" for="complaint-edit-details">
              {{ COMPLAINT_EDIT_CONTENT.detailsLabel }}
            </label>
            <span aria-live="polite" aria-atomic="true">{{ state.detailsCount }}/100</span>
          </div>
          <textarea
            id="complaint-edit-details"
            class="complaint-edit-textarea"
            :value="state.details"
            :placeholder="COMPLAINT_EDIT_CONTENT.detailsPlaceholder"
            :maxlength="100"
            :disabled="!state.active || state.submitting || state.navigationLocked"
            aria-labelledby="complaint-edit-details-label"
            @input="handleDetailsInput"
          ></textarea>
        </section>

        <section class="complaint-edit-field">
          <p id="complaint-edit-contact-label" class="complaint-edit-label">
            {{ COMPLAINT_EDIT_CONTENT.contactLabel }}
          </p>
          <div
            class="complaint-edit-readonly"
            role="group"
            aria-labelledby="complaint-edit-contact-label"
          >{{ state.maskedContact }}</div>
        </section>
      </div>
    </section>

    <footer class="complaint-edit-footer">
      <button
        class="complaint-edit-submit"
        type="button"
        :disabled="!state?.submitEnabled"
        @click="controller.submit()"
      >{{ COMPLAINT_EDIT_CONTENT.submitLabel }}</button>
    </footer>
  </main>
</template>
