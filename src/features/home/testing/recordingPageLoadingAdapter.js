export function createRecordingPageLoadingAdapter() {
  const calls = []
  return {
    calls,
    show(requestId) { calls.push({ method: 'show', requestId }) },
    hide(requestId) { calls.push({ method: 'hide', requestId }) },
  }
}
