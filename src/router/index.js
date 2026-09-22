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
const LoanSuccessPage = () => import('../features/loanSuccess/views/LoanSuccessPage.vue')
const LoanFailPage = () => import('../features/loanFail/views/LoanFailPage.vue')
const OrderDetailPage = () => import('../features/orderDetail/views/OrderDetailPage.vue')

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
  HELP_CENTER: '/helpCenter',
  DEFER_DETAIL: '/deferDetail',
  DEFER_HISTORY: '/deferHistory',
  BANK_DETAIL: '/bankDetail',
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
        {
          path: 'orderDetail',
          name: 'orderDetail',
          component: OrderDetailPage,
          beforeEnter: (to) => {
            const orderId = to.query.orderId
            const isValidOrderId = Object.keys(to.query).length === 1
              && typeof orderId === 'string'
              && orderId.trim().length > 0
            return isValidOrderId ? true : { name: 'home' }
          },
        },
        { path: 'helpCenter', name: 'helpCenter', component: RoutePlaceholder, props: { title: 'Customer service' } },
        {
          path: 'deferDetail',
          name: 'deferDetail',
          component: RoutePlaceholder,
          props: { title: 'Deferral detail' },
          beforeEnter: (to) => {
            const orderId = to.query.orderId
            const isValidOrderId = Object.keys(to.query).length === 1
              && typeof orderId === 'string'
              && orderId.trim().length > 0
            return isValidOrderId ? true : { name: 'home' }
          },
        },
        {
          path: 'deferHistory',
          name: 'deferHistory',
          component: RoutePlaceholder,
          props: { title: 'Deferral history' },
          beforeEnter: (to) => {
            const allowedKeys = ['orderId', 'productId', 'orderStatus']
            const orderId = to.query.orderId
            const productId = to.query.productId
            const orderStatus = to.query.orderStatus
            const isValid = Object.keys(to.query).every((key) => allowedKeys.includes(key))
              && typeof orderId === 'string'
              && orderId.trim().length > 0
              && (typeof productId === 'undefined' || typeof productId === 'string')
              && typeof orderStatus === 'string'
              && /^\d+$/.test(orderStatus)
            return isValid ? true : { name: 'home' }
          },
        },
        {
          path: 'bankDetail',
          name: 'bankDetail',
          component: RoutePlaceholder,
          props: { title: 'Update bank account' },
          beforeEnter: (to) => {
            const orderId = to.query.orderId
            const isValid = Object.keys(to.query).length === 2
              && typeof orderId === 'string'
              && orderId.trim().length > 0
              && to.query.type === 'bankAccess'
            return isValid ? true : { name: 'home' }
          },
        },
        { path: 'loanConfirm', name: 'loanConfirm', component: LoanConfirmPage },
        {
          path: 'loanFail',
          name: 'loanFail',
          component: LoanFailPage,
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
          component: LoanSuccessPage,
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
