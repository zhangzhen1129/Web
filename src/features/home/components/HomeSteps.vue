<script setup>
defineProps({ title: { type: String, default: '' }, steps: { type: Array, default: () => [] } })
</script>

<template>
  <section v-if="steps.length" class="home-steps" aria-labelledby="home-steps-title">
    <h1 id="home-steps-title" class="home-steps__title">{{ title }}</h1>
    <ol class="home-steps__list">
      <li v-for="(step, index) in steps" :key="step.key" class="home-step">
        <span class="home-step__number" aria-hidden="true">{{ index + 1 }}</span>
        <span class="home-step__text">{{ step.text }}</span>
      </li>
    </ol>
  </section>
</template>
