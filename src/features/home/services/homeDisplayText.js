const authenticationProgressText = Object.freeze({
  95: 'Casi: 95%',
  96: 'Casi: 96%',
  97: 'Casi: 97%',
  98: 'Casi: 98%',
  99: 'Casi: 99%',
})

export function getAuthenticationProgressText(progress) {
  return authenticationProgressText[progress] ?? ''
}
