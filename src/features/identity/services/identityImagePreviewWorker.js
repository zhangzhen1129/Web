self.onmessage = (event) => {
  const { id, imageBase64 } = event.data || {}
  try {
    if (typeof id !== 'string' || typeof imageBase64 !== 'string' || imageBase64.length === 0) {
      throw new Error('Invalid image preview input.')
    }
    const binary = atob(imageBase64)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    self.postMessage({ id, buffer: bytes.buffer }, [bytes.buffer])
  } catch {
    self.postMessage({ id, error: 'IMAGE_PREVIEW_FAILED' })
  }
}
