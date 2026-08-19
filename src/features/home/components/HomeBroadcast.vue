<script setup>
defineProps({ item: { type: Object, default: null } })
</script>

<template>
  <div v-if="item" class="home-broadcast" aria-live="polite">
    <span class="home-broadcast__signal" aria-hidden="true"></span>
    <Transition name="broadcast" mode="out-in">
      <span v-if="item" :key="item.key" class="home-broadcast__text">{{ item.text }}</span>
    </Transition>
  </div>
</template>
