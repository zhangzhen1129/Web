let previewSequence = 0

function createWorker() {
  return new Worker(new URL('./identityImagePreviewWorker.js', import.meta.url), { type: 'module' })
}

export function createIdentityImagePreview({ imageBase64, mimeType = 'image/jpeg', workerFactory = createWorker } = {}) {
  if (typeof imageBase64 !== 'string' || imageBase64.length === 0) return Promise.reject(new TypeError('Image data is required.'))
  const id = `identity-preview-${++previewSequence}`
  return new Promise((resolve, reject) => {
    let worker
    try {
      worker = workerFactory()
      worker.onmessage = (event) => {
        if (event.data?.id !== id) return
        worker.terminate()
        if (event.data.error || !(event.data.buffer instanceof ArrayBuffer)) {
          reject(new Error('Unable to create image preview.'))
          return
        }
        resolve(URL.createObjectURL(new Blob([event.data.buffer], { type: mimeType })))
      }
      worker.onerror = () => {
        worker.terminate()
        reject(new Error('Unable to create image preview.'))
      }
      worker.postMessage({ id, imageBase64 })
    } catch (error) {
      worker?.terminate()
      reject(error)
    }
  })
}

export function revokeIdentityImagePreview(url) {
  if (typeof url === 'string' && url.startsWith('blob:')) URL.revokeObjectURL(url)
}
