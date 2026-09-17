const STYLE_ID = 'questionario-layout-enhancements-style'
const CONTROLS_CLASS = 'layout-check-column-locks'
const STORAGE_PREFIX = 'portal:questionario:check-columns:'

function storageKey() {
  return STORAGE_PREFIX + window.location.pathname
}

function readLocks() {
  try {
    const stored = window.sessionStorage.getItem(storageKey())
    const parsed = stored ? JSON.parse(stored) : {}
    return {
      si: Number.isFinite(Number(parsed.si)) ? Number(parsed.si) : null,
      no: Number.isFinite(Number(parsed.no)) ? Number(parsed.no) : null,
    }
  } catch {
    return { si: null, no: null }
  }
}

function writeLocks(locks) {
  try {
    window.sessionStorage.setItem(storageKey(), JSON.stringify(locks))
  } catch {
    // Il blocco colonne resta disponibile per la sessione corrente del DOM.
  }
}

function installStyle() {
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .pdf-layout-field,
    .pdf-layout-field * {
      -webkit-user-drag: none !important;
      user-drag: none !important;
    }

    .${CONTROLS_CLASS} {
      display: grid;
      gap: 10px;
      margin-top: 14px;
      padding: 12px;
      border: 1px solid #dbe3ef;
      border-radius: 12px;
      background: rgba(248, 250, 252, 0.72);
    }

    .${CONTROLS_CLASS} .layout-check-column-locks-heading {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }

    .${CONTROLS_CLASS} .layout-check-column-locks-heading strong,
    .${CONTROLS_CLASS} .layout-check-column-locks-heading span {
      display: block;
    }

    .${CONTROLS_CLASS} .layout-check-column-locks-heading span {
      margin-top: 3px;
      color: #64748b;
      font-size: 0.76rem;
      line-height: 1.35;
    }

    .${CONTROLS_CLASS} .layout-check-column-locks-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .${CONTROLS_CLASS} .layout-check-column-lock {
      display: grid;
      gap: 6px;
      padding: 9px;
      border: 1px solid #dbe3ef;
      border-radius: 10px;
      background: #fff;
    }

    .${CONTROLS_CLASS} .layout-check-column-lock > span {
      font-size: 0.75rem;
      font-weight: 800;
      color: #334155;
    }

    .${CONTROLS_CLASS} .layout-check-column-lock small {
      color: #64748b;
      font-size: 0.7rem;
    }

    .${CONTROLS_CLASS} .layout-check-column-lock-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .${CONTROLS_CLASS} button {
      min-height: 30px;
      padding: 5px 9px;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      background: #fff;
      color: #334155;
      font: inherit;
      font-size: 0.72rem;
      font-weight: 800;
      cursor: pointer;
    }

    .${CONTROLS_CLASS} button:hover {
      border-color: #93c5fd;
      background: #eff6ff;
      color: #1d4ed8;
    }

    .${CONTROLS_CLASS} button[data-action="clear"] {
      color: #64748b;
    }

    @media (max-width: 700px) {
      .${CONTROLS_CLASS} .layout-check-column-locks-grid {
        grid-template-columns: 1fr;
      }
    }
  `
  document.head.appendChild(style)
}

function findFieldEditor() {
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

function findXInput(editor) {
  return editor?.querySelector('.layout-position-panel .layout-coordinate-grid > span:first-child input') || null
}

function answerSide(key) {
  const parts = String(key || '').trim().split(':')
  const answer = String(parts[2] || '').trim().toUpperCase()
  if (answer === 'SI') return 'si'
  if (answer === 'NO') return 'no'
  return null
}

function setReactInputValue(input, value) {
  if (!input) return

  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  if (setter) setter.call(input, String(value))
  else input.value = String(value)

  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

function formatLock(value) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(2) + '%' : 'non impostata'
}

function ensureControls(editor, locks, onLock, onClear) {
  const panel = editor?.querySelector('.layout-position-panel')
  if (!panel) return null

  let controls = panel.querySelector('.' + CONTROLS_CLASS)
  if (!controls) {
    controls = document.createElement('div')
    controls.className = CONTROLS_CLASS
    controls.innerHTML = `
      <div class="layout-check-column-locks-heading">
        <div>
          <strong>Colonne check bloccate</strong>
          <span>Salva la posizione orizzontale di SÌ e NO. I nuovi check dello stesso lato verranno allineati automaticamente.</span>
        </div>
      </div>
      <div class="layout-check-column-locks-grid">
        <div class="layout-check-column-lock" data-side="si">
          <span>SÌ · colonna sinistra</span>
          <small data-value>non impostata</small>
          <div class="layout-check-column-lock-actions">
            <button type="button" data-action="lock">Blocca qui</button>
            <button type="button" data-action="clear">Sblocca</button>
          </div>
        </div>
        <div class="layout-check-column-lock" data-side="no">
          <span>NO · colonna destra</span>
          <small data-value>non impostata</small>
          <div class="layout-check-column-lock-actions">
            <button type="button" data-action="lock">Blocca qui</button>
            <button type="button" data-action="clear">Sblocca</button>
          </div>
        </div>
      </div>
    `

    const saveButton = panel.querySelector('.layout-save-position')
    panel.insertBefore(controls, saveButton || null)

    controls.addEventListener('click', (event) => {
      const button = event.target.closest('button')
      if (!button) return
      const card = button.closest('[data-side]')
      const side = card?.dataset.side
      if (!side) return

      if (button.dataset.action === 'lock') onLock(side)
      if (button.dataset.action === 'clear') onClear(side)
    })
  }

  for (const side of ['si', 'no']) {
    const value = controls.querySelector(`[data-side="${side}"] [data-value]`)
    if (value) value.textContent = formatLock(locks[side])
  }

  return controls
}

function disableNativeDragging() {
  document.querySelectorAll('.pdf-layout-field').forEach((field) => {
    field.draggable = false
    field.setAttribute('draggable', 'false')
  })
}

function initializeQuestionarioLayoutEnhancements() {
  installStyle()

  let locks = readLocks()
  let pendingNewField = false
  let scheduled = false

  const persistLocks = () => {
    writeLocks(locks)
    const editor = findFieldEditor()
    if (editor) ensureControls(editor, locks, lockCurrentPosition, clearLock)
  }

  function lockCurrentPosition(side) {
    const editor = findFieldEditor()
    const xInput = findXInput(editor)
    const value = Number(xInput?.value)
    if (!Number.isFinite(value)) return

    locks = { ...locks, [side]: value }
    persistLocks()
  }

  function clearLock(side) {
    locks = { ...locks, [side]: null }
    persistLocks()
  }

  function applyPendingLock() {
    if (!pendingNewField) return

    const editor = findFieldEditor()
    const key = findSelectedKey(editor)
    const side = answerSide(key)
    const typeSelect = findTypeSelect(editor)
    const xInput = findXInput(editor)

    if (!side || !typeSelect || !xInput) return
    if (String(typeSelect.value || '').toLowerCase() !== 'check') return

    const lock = locks[side]
    if (!Number.isFinite(Number(lock))) {
      pendingNewField = false
      return
    }

    setReactInputValue(xInput, Number(lock).toFixed(2))
    pendingNewField = false
  }

  function sync() {
    scheduled = false
    disableNativeDragging()

    const editor = findFieldEditor()
    if (!editor) return

    ensureControls(editor, locks, lockCurrentPosition, clearLock)

    const typeSelect = findTypeSelect(editor)
    if (typeSelect && !typeSelect.dataset.checkColumnLockBound) {
      typeSelect.dataset.checkColumnLockBound = '1'
      typeSelect.addEventListener('change', () => {
        window.requestAnimationFrame(applyPendingLock)
      })
    }

    applyPendingLock()
  }

  function scheduleSync() {
    if (scheduled) return
    scheduled = true
    window.requestAnimationFrame(sync)
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('button')
    if (button?.textContent?.trim() === 'Aggiungi campo') {
      pendingNewField = true
      window.requestAnimationFrame(scheduleSync)
    }
  }, true)

  document.addEventListener('dragstart', (event) => {
    if (event.target.closest?.('.pdf-layout-field')) event.preventDefault()
  }, true)

  document.addEventListener('pointerdown', (event) => {
    if (!event.target.closest?.('.pdf-layout-field')) return
    event.preventDefault()
  }, true)

  const observer = new MutationObserver(scheduleSync)
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  })

  scheduleSync()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeQuestionarioLayoutEnhancements, { once: true })
} else {
  initializeQuestionarioLayoutEnhancements()
}
