import { createRouter, createWebHashHistory } from 'vue-router'
import HomePage from '../features/home/views/HomePage.vue'
import RepaymentPage from '../features/shell/views/RepaymentPage.vue'
import MainTabShell from '../features/shell/MainTabShell.vue'
import RoutePlaceholder from './RoutePlaceholder.vue'
import MultiPushResultPlaceholder from './MultiPushResultPlaceholder.vue'
import InformationPage from '../features/information/views/InformationPage.vue'

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
  LOAN_SUCCESS_MULTI: '/loanSuccessMulti',
})

export const router = createRouter({
  history: createWebHashHistory(),
  scrollBehavior: () => undefined,
  routes: [
    {
      path: '/',
      component: MainTabShell,
      redirect: ROUTE_PATH.HOME,
      children: [
        { path: ROUTE_PATH.HOME, name: 'home', component: HomePage, meta: { keepAlive: true, showTab: true, tabKey: 'home' } },
        { path: ROUTE_PATH.REPAYMENT, name: 'repayment', component: RepaymentPage, meta: { keepAlive: true, showTab: true, tabKey: 'repayment' } },
        { path: ROUTE_PATH.MINE, name: 'mine', component: RoutePlaceholder, props: { title: 'Mi cuenta' }, meta: { showTab: true, tabKey: 'account' } },
        { path: 'orderList', name: 'orderList', component: RoutePlaceholder, props: { title: 'Order list' } },
        { path: 'information', name: 'information', component: InformationPage },
        { path: 'contacts', name: 'contacts', component: RoutePlaceholder, props: { title: 'Contacts' } },
        { path: 'identity', name: 'identity', component: RoutePlaceholder, props: { title: 'Identity' } },
        { path: 'addBank', name: 'addBank', component: RoutePlaceholder, props: { title: 'Add bank account' } },
        { path: 'orderDetail', name: 'orderDetail', component: RoutePlaceholder, props: { title: 'Order detail' } },
        { path: 'loanConfirm', name: 'loanConfirm', component: RoutePlaceholder, props: { title: 'Loan confirmation' } },
        {
          path: 'loanSuccessMulti',
          name: 'loanSuccessMulti',
          component: MultiPushResultPlaceholder,
          props: (route) => ({ systemTime: route.query.systemTime }),
          beforeEnter: (to) => {
            const systemTime = to.query.systemTime
            const isValidSystemTime = Object.keys(to.query).length === 1
              && typeof systemTime === 'string'
              && /^(0|[1-9]\d*)$/.test(systemTime)
              && Number.isSafeInteger(Number(systemTime))
            return isValidSystemTime ? true : { name: 'home' }
          },
        },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: ROUTE_PATH.HOME },
  ],
})
