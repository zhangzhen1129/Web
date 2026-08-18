<script setup>
defineProps({ item: { type: Object, default: null }, refreshState: { type: String, default: 'idle' } })
</script>

<template>
  <div v-if="item || refreshState !== 'idle'" class="home-broadcast" :aria-busy="refreshState === 'refreshing'" aria-live="polite">
    <span class="home-broadcast__signal" aria-hidden="true"></span>
    <Transition name="broadcast" mode="out-in">
      <span v-if="item" :key="item.key" class="home-broadcast__text">{{ item.text }}</span>
    </Transition>
    <span v-if="refreshState !== 'idle'" class="refresh-indicator" :class="`refresh-indicator--${refreshState}`" aria-hidden="true"></span>
  </div>
</template>
