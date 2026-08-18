import { createRouter, createWebHashHistory } from 'vue-router'
import HomePage from '../features/home/views/HomePage.vue'
import MinePage from '../features/shell/views/MinePage.vue'
import RepaymentPage from '../features/shell/views/RepaymentPage.vue'

export const ROUTE_PATH = Object.freeze({
  HOME: '/home',
  REPAYMENT: '/repayment',
  MINE: '/mine',
})

export const router = createRouter({
  history: createWebHashHistory(),
  scrollBehavior: () => ({ left: 0, top: 0 }),
  routes: [
    { path: '/', redirect: ROUTE_PATH.HOME },
    {
      path: ROUTE_PATH.HOME,
      name: 'home',
      component: HomePage,
      meta: { keepAlive: true, tabKey: 'home' },
    },
    {
      path: ROUTE_PATH.REPAYMENT,
      name: 'repayment',
      component: RepaymentPage,
      meta: { keepAlive: true, tabKey: 'repayment' },
    },
    {
      path: ROUTE_PATH.MINE,
      name: 'mine',
      component: MinePage,
      meta: { keepAlive: true, tabKey: 'account' },
    },
    { path: '/:pathMatch(.*)*', redirect: ROUTE_PATH.HOME },
  ],
})
