<script setup>
import accountTabIcon from '../../../assets/home/account-tab.svg'
import accountTabActiveIcon from '../../../assets/home/account-tab-active.svg'
import loanTabIcon from '../../../assets/home/loan-tab.svg'
import loanTabInactiveIcon from '../../../assets/home/loan-tab-inactive.svg'
import repaymentTabActiveIcon from '../../../assets/home/repayment-tab-active.svg'
import repaymentTabIcon from '../../../assets/home/repayment-tab.svg'

defineProps({ tabs: { type: Array, default: () => [] } })
defineEmits(['navigate'])
const tabIcons = {
  home: { active: loanTabIcon, inactive: loanTabInactiveIcon },
  repayment: { active: repaymentTabActiveIcon, inactive: repaymentTabIcon },
  account: { active: accountTabActiveIcon, inactive: accountTabIcon },
}

function getTabIcon(tab) {
  const iconSet = tabIcons[tab.iconResourceKey] || tabIcons[tab.key]
  if (!iconSet) return ''
  return tab.active ? iconSet.active : iconSet.inactive
}
</script>

<template>
  <nav class="home-tabs" :style="{ '--tab-count': tabs.length }" aria-label="Primary">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      class="home-tab"
      :class="{ 'home-tab--active': tab.active }"
      type="button"
      :disabled="!tab.enabled || tab.active"
      :aria-current="tab.active ? 'page' : undefined"
      @click="$emit('navigate', tab)"
    >
      <img class="home-tab__icon" :src="getTabIcon(tab)" alt="" />
      <span>{{ tab.text }}</span>
    </button>
  </nav>
</template>

<style>
.home-tabs {
  position: fixed;
  z-index: 2;
  right: 0;
  bottom: 0;
  left: 0;
  display: grid;
  grid-template-columns: repeat(var(--tab-count, 2), 1fr);
  min-height: calc(1.76923rem + env(safe-area-inset-bottom));
  padding-bottom: env(safe-area-inset-bottom);
  border-top: .02564rem solid #e5e7eb;
  background: rgba(255,255,255,.96);
}

.home-tab {
  position: relative;
  display: grid;
  place-content: center;
  gap: .10256rem;
  min-height: 1.74359rem;
  border: 0;
  background: transparent;
  color: #6a7282;
  font-size: .30769rem;
}

.home-tab--active { color: var(--home-blue, #155dfc); }

.home-tab--active::before {
  position: absolute;
  top: 0;
  left: calc(50% - .61538rem);
  width: 1.23077rem;
  height: .10256rem;
  border-radius: .10256rem;
  background: linear-gradient(90deg, #2b7fff, var(--home-indigo, #4f39f6));
  content: '';
}

.home-tab__icon {
  display: block;
  width: .61538rem;
  height: .61538rem;
  margin: auto;
}
</style>
