<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Popup } from 'vant'
import 'vant/es/popup/style'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { useGlobalStore } from '../../../shared/globalStore/globalStore.js'
import { COMPLAINT_CONTENT } from '../complaintContent.js'
import { createComplaintController } from '../complaintController.js'
import { createComplaintServices } from '../services/complaintServices.js'
import backAsset from '../assets/back.svg'
import customerCloseAsset from '../assets/customer-close.svg'
import questionCloseAsset from '../assets/question-close.svg'
import customerServiceAsset from '../assets/customer-service.svg'
import redDotAsset from '../assets/red-dot.svg'
import './complaintHomePage.css'

defineOptions({ name: 'ComplaintHomePage' })

const DEFAULT_AGENCY_INDEX = 1
const router = useRouter()
const globalStore = useGlobalStore()
const state = ref(null)

const controller = createComplaintController({
  services: createComplaintServices({ getGlobalState: () => globalStore }),
  navigate: (location) => router.push(location),
  goBack: () => router.back(),
  replaceHome: () => router.replace({ name: 'home' }),
})

const unsubscribe = controller.subscribe((nextState) => {
  state.value = nextState
})

function isAgencySelected(agency, index) {
  const selectedAgency = state.value?.selectedAgency
  if (selectedAgency && typeof selectedAgency.value === 'string') {
    return selectedAgency.value === agency.value
  }
  return index === DEFAULT_AGENCY_INDEX
}

function handleQuestionPopupVisibility(visible) {
  if (!visible) controller.closeQuestionPopup()
}

function handleCustomerServiceVisibility(visible) {
  if (!visible) controller.closeCustomerService()
}

onMounted(() => controller.start())

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
  <main v-if="state" class="complaint-page">
    <header class="complaint-page__header">
      <button
        class="complaint-page__back"
        type="button"
        aria-label="Back"
        :disabled="!state.active || state.navigationLocked"
        @click="controller.requestBack()"
      >
        <img :src="backAsset" alt="" aria-hidden="true" />
      </button>
      <h1>{{ COMPLAINT_CONTENT.title }}</h1>
      <button
        class="complaint-page__customer-service"
        type="button"
        aria-label="Customer service"
        :disabled="!state.active || state.navigationLocked"
        @click="controller.openCustomerService()"
      >
        <img :src="customerServiceAsset" alt="" aria-hidden="true" />
      </button>
    </header>

    <section class="complaint-page__content">
      <p class="complaint-agency__label">{{ COMPLAINT_CONTENT.agencySelectorLabel }}</p>

      <div
        class="complaint-agency__options"
        role="group"
        :aria-label="COMPLAINT_CONTENT.agencySelectorLabel"
      >
        <button
          v-for="(agency, index) in COMPLAINT_CONTENT.agencyOptions"
          :key="agency.value"
          class="complaint-agency__option"
          :class="{ 'complaint-agency__option--selected': isAgencySelected(agency, index) }"
          type="button"
          :aria-label="agency.label"
          :aria-pressed="isAgencySelected(agency, index)"
          :disabled="!state.active || state.navigationLocked"
          @click="controller.selectAgency(agency.value)"
        >
          {{ agency.label }}
        </button>
      </div>

      <section class="complaint-tips">
        <p class="complaint-tips__heading">{{ COMPLAINT_CONTENT.tips.heading }}</p>
        <p class="complaint-tips__message">{{ COMPLAINT_CONTENT.tips.message }}</p>
      </section>
    </section>

    <button
      class="complaint-record"
      type="button"
      :aria-label="COMPLAINT_CONTENT.complaintRecordLabel"
      :disabled="!state.active || state.navigationLocked"
      @click="controller.openComplaintList()"
    >
      <span>{{ COMPLAINT_CONTENT.complaintRecordLabel }}</span>
      <img
        v-if="state.showRedDot === true"
        class="complaint-record__red-dot"
        :src="redDotAsset"
        alt=""
        aria-hidden="true"
      />
    </button>

    <Popup
      :show="state.customerServiceVisible"
      position="center"
      teleport="body"
      :lazy-render="false"
      :close-on-click-overlay="false"
      :close-on-popstate="true"
      :lock-scroll="true"
      class="complaint-customer-popup"
      overlay-class="complaint-popup-overlay"
      aria-modal="true"
      aria-labelledby="complaint-customer-title"
      @update:show="handleCustomerServiceVisibility"
    >
      <section class="complaint-customer-layer">
        <div class="complaint-customer-card">
          <p id="complaint-customer-title" class="complaint-customer-card__text">
            {{ COMPLAINT_CONTENT.customerServiceText }}
          </p>
        </div>
        <button
          class="complaint-customer-close"
          type="button"
          aria-label="Close"
          @click="controller.closeCustomerService()"
        >
          <img :src="customerCloseAsset" alt="" aria-hidden="true" />
        </button>
      </section>
    </Popup>

    <Popup
      :show="state.questionPopupVisible"
      position="bottom"
      teleport="body"
      :lazy-render="false"
      :close-on-click-overlay="false"
      :close-on-popstate="true"
      :lock-scroll="true"
      class="complaint-question-popup"
      overlay-class="complaint-popup-overlay"
      aria-modal="true"
      aria-labelledby="complaint-question-title"
      @update:show="handleQuestionPopupVisibility"
    >
      <section class="complaint-question-sheet">
        <header class="complaint-question-header">
          <h2 id="complaint-question-title">{{ COMPLAINT_CONTENT.questionPopupTitle }}</h2>
          <button
            class="complaint-question-close"
            type="button"
            aria-label="Close"
            @click="controller.closeQuestionPopup()"
          >
            <img :src="questionCloseAsset" alt="" aria-hidden="true" />
          </button>
        </header>
        <div
          class="complaint-question-options"
          role="group"
          :aria-label="COMPLAINT_CONTENT.questionPopupTitle"
        >
          <button
            v-for="option in COMPLAINT_CONTENT.questionTypes"
            :key="option.value"
            class="complaint-question-option"
            type="button"
            :aria-label="option.label"
            :disabled="!state.active || state.navigationLocked"
            @click="controller.selectQuestion(option.value)"
          >
            {{ option.label }}
          </button>
        </div>
      </section>
    </Popup>
  </main>
</template>