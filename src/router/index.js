import { createRouter, createWebHashHistory } from 'vue-router'
import MainTabShell from '../features/shell/MainTabShell.vue'
import HomePage from '../features/home/views/HomePage.vue'
import { COMPLAINT_CONTENT } from '../features/complaint/complaintContent.js'

const RepaymentPage = () => import('../features/shell/views/RepaymentPage.vue')
const RoutePlaceholder = () => import('./RoutePlaceholder.vue')
const MultiPushResultPage = () => import('../features/multiPushResult/views/MultiPushResultPage.vue')
const InformationPage = () => import('../features/information/views/InformationPage.vue')
const ContactsPage = () => import('../features/contacts/views/ContactsPage.vue')
const BankPage = () => import('../features/bank/views/BankPage.vue')
const BankDetailPage = () => import('../features/bankDetail/views/BankDetailPage.vue')
const AddPaymentMethodPage = () => import('../features/addPaymentMethod/views/AddPaymentMethodPage.vue')
const LoanConfirmPage = () => import('../features/loanConfirm/views/LoanConfirmPage.vue')
const LoanSuccessPage = () => import('../features/loanSuccess/views/LoanSuccessPage.vue')
const LoanFailPage = () => import('../features/loanFail/views/LoanFailPage.vue')
const OrderDetailPage = () => import('../features/orderDetail/views/OrderDetailPage.vue')
const MinePage = () => import('../features/mine/views/MinePage.vue')
const OrderListPage = () => import('../features/orderList/views/OrderListPage.vue')
const OrderDeferralPage = () => import('../features/orderDeferral/views/OrderDeferralPage.vue')
const DeferHistoryPage = () => import('../features/deferHistory/views/DeferHistoryPage.vue')
const HelpCenterPage = () => import('../features/helpCenter/views/HelpCenterPage.vue')
const ComplaintHomePage = () => import('../features/complaint/views/ComplaintHomePage.vue')

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
  COMPLAIN_EDIT: '/complainEdit',
  COMPLAIN_LIST: '/complainList',
  COMPLAIN_HOME: '/complainHome',
  SETTINGS: '/settings',
  ADD_PAYMENT_METHOD: '/addPaymentMethod',
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
        { path: ROUTE_PATH.MINE, name: 'mine', component: MinePage, meta: { showTab: true, tabKey: 'account' } },
        { path: 'orderList', name: 'orderList', component: OrderListPage },
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
        { path: 'helpCenter', name: 'helpCenter', component: HelpCenterPage },
        { path: 'complainHome', name: 'complainHome', component: ComplaintHomePage },
        {
          path: 'complainEdit',
          name: 'complainEdit',
          component: RoutePlaceholder,
          props: { title: 'Complaint edit' },
          beforeEnter: (to) => {
            const allowedKeys = ['type', 'question']
            const queryKeys = Object.keys(to.query)
            const agencyValues = COMPLAINT_CONTENT.agencyOptions.map((option) => option.value)
            const questionValues = COMPLAINT_CONTENT.questionTypes.map((option) => option.value)
            const isValid = queryKeys.length === 2
              && queryKeys.every((key) => allowedKeys.includes(key))
              && typeof to.query.type === 'string'
              && agencyValues.includes(to.query.type)
              && typeof to.query.question === 'string'
              && questionValues.includes(to.query.question)
            return isValid ? true : { name: 'home' }
          },
        },
        {
          path: 'complainList',
          name: 'complainList',
          component: RoutePlaceholder,
          props: { title: 'Complaint records' },
          beforeEnter: (to) => {
            const queryKeys = Object.keys(to.query)
            const isValid = queryKeys.length === 0
            return isValid ? true : { name: 'home' }
          },
        },
        { path: 'settings', name: 'settings', component: RoutePlaceholder, props: { title: 'Settings' } },
        {
          path: 'addPaymentMethod',
          name: 'addPaymentMethod',
          component: AddPaymentMethodPage,
          beforeEnter: (to) => (Object.keys(to.query).length === 0 ? true : { name: 'home' }),
        },
        {
          path: 'deferDetail',
          name: 'deferDetail',
          component: OrderDeferralPage,
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
          component: DeferHistoryPage,
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
          component: BankDetailPage,
          beforeEnter: (to) => {
            const allowedKeys = ['orderId']
            const orderId = to.query.orderId
            const isValid = Object.keys(to.query).every((key) => allowedKeys.includes(key))
              && (typeof orderId === 'undefined'
                || (typeof orderId === 'string' && orderId.trim().length > 0))
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
          component: MultiPushResultPage,
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
