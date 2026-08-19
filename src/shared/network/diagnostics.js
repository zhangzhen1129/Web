const MAX_DIAGNOSTICS = 30

export function createNetworkDiagnostics() {
  const entries = []

  return Object.freeze({
    record(entry) {
      entries.push(Object.freeze({ ...entry }))
      if (entries.length > MAX_DIAGNOSTICS) entries.shift()
    },
    read() {
      return entries.slice()
    },
  })
}
