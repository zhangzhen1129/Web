<script setup>
import { onBeforeUnmount, ref } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { HELP_CENTER_CONFIG } from '../helpCenterConfig.js'
import { getHelpCenterContent } from '../helpCenterContent.js'
import { createHelpCenterDisplayModel } from '../helpCenterDisplay.js'
import { HELP_CENTER_UI_TEXT } from '../helpCenterUiText.js'
import backAsset from '../assets/back.svg'
import chevronAsset from '../assets/chevron.svg'
import workingHoursAsset from '../assets/working-hours.svg'
import emailAsset from '../assets/email.svg'
import './helpCenterPage.css'

defineOptions({ name: 'HelpCenterPage' })

const router = useRouter()
const displayModel = createHelpCenterDisplayModel({
  content: getHelpCenterContent(),
  config: HELP_CENTER_CONFIG,
})
const expandedFaqIds = ref(new Set())
let pageIsActive = true
let backNavigationLocked = false

function getElementKey(id) {
  const key = String(id).replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^-+|-+$/g, '')
  return key || 'item'
}

function getFaqTriggerId(id) {
  return `help-center-faq-trigger-${getElementKey(id)}`
}

function getFaqAnswerId(id) {
  return `help-center-faq-answer-${getElementKey(id)}`
}

function isExpanded(id) {
  return expandedFaqIds.value.has(id)
}

function toggleFaq(id) {
  if (!pageIsActive) return
  const nextExpandedIds = new Set(expandedFaqIds.value)
  if (nextExpandedIds.has(id)) nextExpandedIds.delete(id)
  else nextExpandedIds.add(id)
  expandedFaqIds.value = nextExpandedIds
}

function handleBack() {
  if (!pageIsActive || backNavigationLocked) return
  backNavigationLocked = true
  pageIsActive = false

  if (router.options.history.state?.back) {
    void router.back()
    return
  }

  void router.replace({ name: 'home' })
}

onBeforeRouteLeave(() => {
  pageIsActive = false
})

onBeforeUnmount(() => {
  pageIsActive = false
  backNavigationLocked = false
})
</script>

<template>
  <main class="help-center-page">
    <header class="help-center-header">
      <button
        class="help-center-header__back"
        type="button"
        :aria-label="HELP_CENTER_UI_TEXT.backLabel"
        @click="handleBack"
      >
        <img :src="backAsset" alt="" />
      </button>
      <h1>{{ displayModel.title }}</h1>
    </header>

    <template v-if="displayModel.valid">
      <section class="help-center-info">
        <div
          class="help-center-info__card"
          role="group"
          :aria-label="HELP_CENTER_UI_TEXT.workingHoursLabel"
        >
          <img :src="workingHoursAsset" alt="" />
          <p>{{ displayModel.workingHours }}</p>
        </div>
        <div
          class="help-center-info__card"
          role="group"
          :aria-label="HELP_CENTER_UI_TEXT.emailLabel"
        >
          <img :src="emailAsset" alt="" />
          <p>{{ displayModel.email }}</p>
        </div>
      </section>

      <section class="help-center-faq" :aria-label="HELP_CENTER_UI_TEXT.faqListLabel">
        <article
          v-for="faq in displayModel.faqs"
          :key="faq.id"
          class="help-center-faq__item"
          :class="{ 'help-center-faq__item--open': isExpanded(faq.id) }"
        >
          <button
            :id="getFaqTriggerId(faq.id)"
            class="help-center-faq__trigger"
            type="button"
            :aria-expanded="isExpanded(faq.id)"
            :aria-controls="getFaqAnswerId(faq.id)"
            @click="toggleFaq(faq.id)"
          >
            <span class="help-center-faq__question">{{ faq.question }}</span>
            <img class="help-center-faq__chevron" :src="chevronAsset" alt="" />
          </button>
          <div
            :id="getFaqAnswerId(faq.id)"
            class="help-center-faq__answer"
            role="region"
            :aria-labelledby="getFaqTriggerId(faq.id)"
            :aria-hidden="isExpanded(faq.id) ? 'false' : 'true'"
          >
            <div class="help-center-faq__answer-content">
              <p class="help-center-faq__answer-text">{{ faq.answer }}</p>
            </div>
          </div>
        </article>
      </section>
    </template>

    <section v-else class="help-center-fallback" role="alert">
      <p>{{ displayModel.fallbackMessage }}</p>
    </section>
  </main>
</template>
