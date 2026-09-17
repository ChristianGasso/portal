const STYLE_ID = 'questionario-text-preview-values-style'
const PANEL_CLASS = 'layout-text-preview-value'
const STORAGE_PREFIX = 'portal:questionario:text-preview-values:'

function storageKey() {
  return STORAGE_PREFIX + window.location.pathname + window.location.search
}

function readValues() {
  try {
    const stored = window.localStorage.getItem(storageKey())
    const parsed = stored ? JSON.parse(stored) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeValues(values) {
  try {
    window.localStorage.setItem(storageKey(), JSON.stringify(values))
  } catch {
    // Se localStorage non è disponibile, il valore resta comunque visibile fino al refresh.
  }
}

function installStyle() {
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .${PANEL_CLASS} {
      display: grid;
      gap: 8px;
      margin: 14px 0;
      padding: 12px;
      border: 1px solid #dbe3ef;
      border-radius: 12px;
      background: rgba(248, 250, 252, 0.72);
    }

    .${PANEL_CLASS} > strong {
      font-size: 0.82rem;
      color: #334155;
    }

    .${PANEL_CLASS} > span {
      color: #64748b;
      font-size: 0.74rem;
      line-height: 1.4;
    }

    .${PANEL_CLASS} .layout-text-preview-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px;
    }

    .${PANEL_CLASS} input {
      width: 100%;
      min-width: 0;
      padding: 8px 10px;
      border: 1px solid #cbd5e1;
      border-radius: 9px;
      background: #fff;
      color: #0f172a;
      font: inherit;
    }

    .${PANEL_CLASS} button {
      padding: 7px 10px;
      border: 1px solid #cbd5e1;
      border-radius: 9px;
      background: #fff;
      color: #475569;
      font: inherit;
      font-size: 0.75rem;
      font-weight: 800;
      cursor: pointer;
    }

    .${PANEL_CLASS} button:hover {
      border-color: #93c5fd;
      background: #eff6ff;
      color: #1d4ed8;
    }
  `
  document.head.appendChild(style)
}

function findEditor() {
  return document.querySelector('.layout-field-editor')
}

function findSelectedKey(editor) {
  return editor?.querySelector('.questionnaire-editor-heading h4')?.textContent?.trim() || ''
}

function findTypeSelect(editor) {
  if (!editor) return null

  for (const label of editor.querySelectorAll('.portal-field')) {
    const caption = label.querySelector(':scope > span')?.textContent?.trim().toLowerCase()
    if (caption === 'tipo') return label.querySelector('select')
  }

  return null
}

function findPreviewForKey(key) {
  if (!key) return null

  for (const field of document.querySelectorAll('.pdf-layout-field')) {
    const label = field.querySelector('.pdf-layout-field-label')
    const fieldKey = label?.getAttribute('title')?.trim() || ''
    if (fieldKey === key) return field.querySelector('.pdf-layout-field-preview')
  }

  return null
}

function rememberDefaultPreview(preview) {
  if (!preview) return
  if (!preview.dataset.defaultPreview) preview.dataset.defaultPreview = preview.textContent || ''
}

function applyValueToPreview(key, value) {
  const preview = findPreviewForKey(key)
  if (!preview) return

  rememberDefaultPreview(preview)
  const customValue = typeof value === 'string' ? value : ''
  const nextValue = customValue || preview.dataset.defaultPreview || ''

  preview.dataset.customPreviewValue = customValue
  if (preview.textContent !== nextValue) preview.textContent = nextValue
}

function applyPreviewValues(values) {
  document.querySelectorAll('.pdf-layout-field').forEach((field) => {
    const label = field.querySelector('.pdf-layout-field-label')
    const preview = field.querySelector('.pdf-layout-field-preview')
    const key = label?.getAttribute('title')?.trim() || ''
    if (!preview || !key) return

    rememberDefaultPreview(preview)

    const customValue = typeof values[key] === 'string' ? values[key] : ''
    const nextValue = customValue || preview.dataset.defaultPreview || ''
    preview.dataset.customPreviewValue = customValue

    if (preview.textContent !== nextValue) preview.textContent = nextValue
  })
}

function ensurePanel(editor, values, onChangeValue, onClearValue) {
  const key = findSelectedKey(editor)
  const typeSelect = findTypeSelect(editor)
  const isText = String(typeSelect?.value || '').toLowerCase() === 'testo'
  let panel = editor?.querySelector('.' + PANEL_CLASS)

  if (!isText || !key) {
    panel?.remove()
    return null
  }

  if (!panel) {
    panel = document.createElement('div')
    panel.className = PANEL_CLASS
    panel.innerHTML = `
      <strong>Valore mostrato nell'anteprima</strong>
      <span>Questo valore serve solo per aiutarti a posizionare il campo nell'editor PDF. Viene salvato nel localStorage di questo browser.</span>
      <div class="layout-text-preview-row">
        <input type="text" data-preview-input placeholder="Inserisci il valore da visualizzare" />
        <button type="button" data-preview-clear>Ripristina</button>
      </div>
    `

    const positionPanel = editor.querySelector('.layout-position-panel')
    if (positionPanel) editor.insertBefore(panel, positionPanel)
    else editor.appendChild(panel)

    panel.querySelector('[data-preview-input]')?.addEventListener('input', (event) => {
      const currentKey = findSelectedKey(findEditor())
      if (!currentKey) return

      const value = event.target.value
      onChangeValue(currentKey, value)
      applyValueToPreview(currentKey, value)
    })

    panel.querySelector('[data-preview-clear]')?.addEventListener('click', () => {
      const currentEditor = findEditor()
      const currentKey = findSelectedKey(currentEditor)
      if (!currentKey) return

      onClearValue(currentKey)
      applyValueToPreview(currentKey, '')

      const input = currentEditor?.querySelector('.' + PANEL_CLASS + ' [data-preview-input]')
      if (input) input.value = ''
    })
  }

  const input = panel.querySelector('[data-preview-input]')
  const storedValue = typeof values[key] === 'string' ? values[key] : ''
  if (input && input.value !== storedValue) input.value = storedValue

  applyValueToPreview(key, storedValue)
  return panel
}

function initializeQuestionarioTextPreviewValues() {
  installStyle()

  let values = readValues()
  let scheduled = false

  function persist() {
    writeValues(values)
    applyPreviewValues(values)
  }

  function setValue(key, value) {
    values = { ...values, [key]: value }
    writeValues(values)
    applyValueToPreview(key, value)
  }

  function clearValue(key) {
    const next = { ...values }
    delete next[key]
    values = next
    writeValues(values)
    applyValueToPreview(key, '')
  }

  function sync() {
    scheduled = false
    applyPreviewValues(values)

    const editor = findEditor()
    if (!editor) return

    const panel = ensurePanel(editor, values, setValue, clearValue)
    const typeSelect = findTypeSelect(editor)

    if (typeSelect && !typeSelect.dataset.textPreviewValueBound) {
      typeSelect.dataset.textPreviewValueBound = '1'
      typeSelect.addEventListener('change', () => window.requestAnimationFrame(scheduleSync))
    }

    if (panel) {
      const keyInput = Array.from(editor.querySelectorAll('.portal-field')).find((label) => (
        label.querySelector(':scope > span')?.textContent?.trim().toLowerCase() === 'chiave campo'
      ))?.querySelector('input')

      if (keyInput && !keyInput.dataset.textPreviewValueBound) {
        keyInput.dataset.textPreviewValueBound = '1'
        keyInput.addEventListener('input', () => window.requestAnimationFrame(scheduleSync))
      }
    }
  }

  function scheduleSync() {
    if (scheduled) return
    scheduled = true
    window.requestAnimationFrame(sync)
  }

  const observer = new MutationObserver(() => {
    scheduleSync()
  })

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true,
    attributeFilter: ['class', 'title'],
  })

  window.addEventListener('storage', (event) => {
    if (event.key !== storageKey()) return
    values = readValues()
    scheduleSync()
  })

  window.setInterval(() => {
    applyPreviewValues(values)
  }, 250)

  scheduleSync()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeQuestionarioTextPreviewValues, { once: true })
} else {
  initializeQuestionarioTextPreviewValues()
}
