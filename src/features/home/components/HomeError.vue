<script setup>
defineProps({ error: { type: Object, required: true } })
</script>

<template>
  <section class="home-error" role="alert">
    <p>{{ error.messageText }}</p>
  </section>
</template>
