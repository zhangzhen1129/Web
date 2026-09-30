import { md5 } from 'js-md5'

export function digestPassword(value) {
  if (typeof value !== 'string') {
    throw new TypeError('Password value must be a string.')
  }

  return md5(value)
}