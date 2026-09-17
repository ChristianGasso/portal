const STORAGE_PREFIX = 'portal:questionario:text-preview-values:'
const PREVIEW_ENDPOINT = '/api/avis/questionario/anteprima.php'

function storageKey() {
  return STORAGE_PREFIX + window.location.pathname + window.location.search
}

function readPreviewValues() {
  try {
    const stored = window.localStorage.getItem(storageKey())
    const parsed = stored ? JSON.parse(stored) : {}
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function isPreviewRequest(input, init) {
  const url = typeof input === 'string' ? input : input?.url
  return typeof url === 'string'
    && url.includes(PREVIEW_ENDPOINT)
    && String(init?.method || 'GET').toUpperCase() === 'POST'
    && typeof init?.body === 'string'
}

const originalFetch = window.fetch.bind(window)

window.fetch = function portalFetchWithPreviewValues(input, init = {}) {
  if (!isPreviewRequest(input, init)) {
    return originalFetch(input, init)
  }

  try {
    const payload = JSON.parse(init.body)
    payload.preview_values = readPreviewValues()

    return originalFetch(input, {
      ...init,
      body: JSON.stringify(payload),
    })
  } catch {
    return originalFetch(input, init)
  }
}
