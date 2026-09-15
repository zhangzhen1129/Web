self.onmessage = (event) => {
  const { id, imageBase64 } = event.data || {}
  try {
    if (typeof id !== 'string' || typeof imageBase64 !== 'string' || imageBase64.length === 0) {
      throw new Error('Invalid image preview input.')
    }
    const input = imageBase64.trim()
    const payload = /^data:[^,]+;base64,/i.test(input) ? input.slice(input.indexOf(',') + 1) : input
    const binary = atob(payload.replace(/\s+/g, ''))
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    self.postMessage({ id, buffer: bytes.buffer }, [bytes.buffer])
  } catch {
    self.postMessage({ id, error: 'IMAGE_PREVIEW_FAILED' })
  }
}
