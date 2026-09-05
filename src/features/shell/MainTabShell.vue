<template>
  <div class="main-tab-shell">
    <div class="main-tab-shell__viewport">
      <RouterView v-slot="{ Component }">
        <KeepAlive :include="['HomePage', 'RepaymentPage', 'MinePage']">
          <component :is="Component" />
        </KeepAlive>
      </RouterView>
    </div>
  </div>
</template>
