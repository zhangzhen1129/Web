<script setup>
defineProps({ tabs: { type: Array, default: () => [] } })
defineEmits(['open-account'])
</script>

<template>
  <nav class="home-tabs" aria-label="Primary">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      class="home-tab"
      :class="{ 'home-tab--active': tab.active }"
      type="button"
      :disabled="!tab.enabled || tab.active"
      :aria-current="tab.active ? 'page' : undefined"
      @click="tab.key === 'account' && $emit('open-account')"
    >
      <span class="home-tab__icon" :class="`home-tab__icon--${tab.key}`" aria-hidden="true"></span>
      <span>{{ tab.text }}</span>
    </button>
  </nav>
</template>
