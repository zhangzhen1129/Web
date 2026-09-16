self.onmessage = (event) => {
  const { id, imageBase64 } = event.data || {}
  try {
    if (typeof id !== 'string' || typeof imageBase64 !== 'string' || imageBase64.length === 0) {
      throw new Error('Invalid image preview input.')
    }
    const input = imageBase64.trim()
    const payload = (/^data:[^,]+;base64,/i.test(input) ? input.slice(input.indexOf(',') + 1) : input)
      .replace(/\s+/g, '')
      .replace(/-/g, '+')
      .replace(/_/g, '/')
    if (!payload || payload.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(payload)) {
      throw new Error('Invalid image preview payload.')
    }
    const paddedPayload = payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')
    const binary = atob(paddedPayload)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    self.postMessage({ id, buffer: bytes.buffer }, [bytes.buffer])
  } catch {
    self.postMessage({ id, error: 'IMAGE_PREVIEW_FAILED' })
  }
}
