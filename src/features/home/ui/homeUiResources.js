import accountActiveIcon from '../../../assets/home/account-tab-active.svg'
import accountIcon from '../../../assets/home/account-tab.svg'
import homeInactiveIcon from '../../../assets/home/loan-tab-inactive.svg'
import homeActiveIcon from '../../../assets/home/loan-tab.svg'
import repaymentActiveIcon from '../../../assets/home/repayment-tab-active.svg'
import repaymentIcon from '../../../assets/home/repayment-tab.svg'
import stepOneIcon from '../../../assets/home/step-1.svg'
import stepTwoIcon from '../../../assets/home/step-2.svg'
import stepThreeIcon from '../../../assets/home/step-3.svg'

const stepResources = Object.freeze({
  'step-1': stepOneIcon,
  'step-2': stepTwoIcon,
  'step-3': stepThreeIcon,
})

const tabResources = Object.freeze({
  home: Object.freeze({ active: homeActiveIcon, inactive: homeInactiveIcon }),
  repayment: Object.freeze({ active: repaymentActiveIcon, inactive: repaymentIcon }),
  account: Object.freeze({ active: accountActiveIcon, inactive: accountIcon }),
})

export function getHomeStepIcon(resourceKey) {
  return stepResources[resourceKey] ?? ''
}

export function getHomeTabIcon(tab) {
  const resource = tabResources[tab.iconResourceKey]
  if (!resource) return ''
  return tab.active ? resource.active : resource.inactive
}
