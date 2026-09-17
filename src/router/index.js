import { createRouter, createWebHashHistory } from 'vue-router'
import MainTabShell from '../features/shell/MainTabShell.vue'
import HomePage from '../features/home/views/HomePage.vue'

const RepaymentPage = () => import('../features/shell/views/RepaymentPage.vue')
const RoutePlaceholder = () => import('./RoutePlaceholder.vue')
const MultiPushResultPlaceholder = () => import('./MultiPushResultPlaceholder.vue')
const InformationPage = () => import('../features/information/views/InformationPage.vue')
const ContactsPage = () => import('../features/contacts/views/ContactsPage.vue')
const BankPage = () => import('../features/bank/views/BankPage.vue')
const LoanConfirmPage = () => import('../features/loanConfirm/views/LoanConfirmPage.vue')

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
  LOAN_FAIL: '/loanFail',
  LOAN_SUCCESS: '/loanSuccess',
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
        { path: 'contacts', name: 'contacts', component: ContactsPage },
        { path: 'identity', name: 'identity', component: () => import('../features/identity/views/IdentityPage.vue') },
        { path: 'addBank', name: 'addBank', component: BankPage },
        { path: 'orderDetail', name: 'orderDetail', component: RoutePlaceholder, props: { title: 'Order detail' } },
        { path: 'loanConfirm', name: 'loanConfirm', component: LoanConfirmPage },
        {
          path: 'loanFail',
          name: 'loanFail',
          component: RoutePlaceholder,
          props: { title: 'Loan failure' },
          beforeEnter: (to) => {
            const orderId = to.query.orderId
            const isValidOrderId = Object.keys(to.query).length === 1
              && typeof orderId === 'string'
              && orderId.trim().length > 0
            return isValidOrderId ? true : { name: 'home' }
          },
        },
        {
          path: 'loanSuccess',
          name: 'loanSuccess',
          component: RoutePlaceholder,
          props: { title: 'Loan success' },
          beforeEnter: (to) => {
            const systemTime = to.query.systemTime
            const isValidSystemTime = Object.keys(to.query).length === 1
              && typeof systemTime === 'string'
              && /^(0|[1-9]\d*)$/.test(systemTime)
              && Number.isSafeInteger(Number(systemTime))
            return isValidSystemTime ? true : { name: 'home' }
          },
        },
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
