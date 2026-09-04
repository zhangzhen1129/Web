<script setup>
defineProps({
  title: { type: String, required: true },
})
</script>

<template>
  <main class="route-placeholder" aria-live="polite">
    <h1>{{ title }}</h1>
  </main>
</template>
