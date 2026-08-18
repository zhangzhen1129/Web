<script setup>
import stepOneIcon from '../../../assets/home/step-1.svg'
import stepTwoIcon from '../../../assets/home/step-2.svg'
import stepThreeIcon from '../../../assets/home/step-3.svg'

defineProps({ title: { type: String, default: '' }, steps: { type: Array, default: () => [] } })
const stepIcons = [stepOneIcon, stepTwoIcon, stepThreeIcon]
</script>

<template>
  <section v-if="steps.length" class="home-steps" aria-labelledby="home-steps-title">
    <h1 id="home-steps-title" class="home-steps__title">{{ title }}</h1>
    <ol class="home-steps__list">
      <li v-for="(step, index) in steps" :key="step.key" class="home-step">
        <img v-if="stepIcons[index]" class="home-step__number" :src="stepIcons[index]" alt="" />
        <span v-else class="home-step__number home-step__number--fallback" aria-hidden="true">{{ index + 1 }}</span>
        <span class="home-step__text">{{ step.text }}</span>
      </li>
    </ol>
  </section>
</template>
