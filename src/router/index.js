import { createRouter, createWebHashHistory } from 'vue-router'
import HomePage from '../features/home/views/HomePage.vue'
import MinePage from '../features/shell/views/MinePage.vue'
import RepaymentPage from '../features/shell/views/RepaymentPage.vue'
import RoutePlaceholder from './RoutePlaceholder.vue'

export const ROUTE_PATH = Object.freeze({
  HOME: '/home',
  REPAYMENT: '/repayment',
  MINE: '/mine',
  ORDER_LIST: '/orderList',
  INFORMATION: '/information',
  CONTACTS: '/contacts',
  IDENTITY: '/identity',
  ADD_BANK: '/addBank',
  ORDER_DETAIL: '/orderDetail',
  LOAN_CONFIRM: '/loanConfirm',
})

export const router = createRouter({
  history: createWebHashHistory(),
  scrollBehavior: () => undefined,
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
    { path: ROUTE_PATH.ORDER_LIST, name: 'orderList', component: RoutePlaceholder, props: { title: 'Order list' } },
    { path: ROUTE_PATH.INFORMATION, name: 'information', component: RoutePlaceholder, props: { title: 'Information' } },
    { path: ROUTE_PATH.CONTACTS, name: 'contacts', component: RoutePlaceholder, props: { title: 'Contacts' } },
    { path: ROUTE_PATH.IDENTITY, name: 'identity', component: RoutePlaceholder, props: { title: 'Identity' } },
    { path: ROUTE_PATH.ADD_BANK, name: 'addBank', component: RoutePlaceholder, props: { title: 'Add bank account' } },
    { path: ROUTE_PATH.ORDER_DETAIL, name: 'orderDetail', component: RoutePlaceholder, props: { title: 'Order detail' } },
    { path: ROUTE_PATH.LOAN_CONFIRM, name: 'loanConfirm', component: RoutePlaceholder, props: { title: 'Loan confirmation' } },
    { path: '/:pathMatch(.*)*', redirect: ROUTE_PATH.HOME },
  ],
})
