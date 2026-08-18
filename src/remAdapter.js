const ROOT_COLUMNS = 10

function applyRootFontSize() {
  const width = document.documentElement.clientWidth || window.innerWidth
  document.documentElement.style.fontSize = `${width / ROOT_COLUMNS}px`
}

export function setupRemAdapter() {
  applyRootFontSize()
  window.addEventListener('resize', applyRootFontSize)
  window.addEventListener('pageshow', applyRootFontSize)

  return () => {
    window.removeEventListener('resize', applyRootFontSize)
    window.removeEventListener('pageshow', applyRootFontSize)
  }
}
