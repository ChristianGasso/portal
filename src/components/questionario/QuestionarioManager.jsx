import { useEffect, useMemo, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker
import {
  aggiornaDomandaQuestionarioAvis,
  caricaLayoutQuestionarioAvis,
  caricaPdfSorgenteQuestionarioAvis,
  caricaQuestionarioAvis,
  eliminaCampoLayoutQuestionarioAvis,
  gestisciPdfQuestionarioAvis,
  importaQuestionarioAvis,
  resetQuestionarioAvis,
  salvaLayoutQuestionarioAvis,
  scaricaAnteprimaQuestionarioAvis,
} from '../../services/avisService'

function ToggleCard({ label, description, checked, onChange, disabled }) {
  return (
    <label className="portal-toggle-card">
      <div>
        <strong>{label}</strong>
        <span>{description}</span>
      </div>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} disabled={disabled} />
      <span className="portal-toggle-ui" aria-hidden="true"><span /></span>
    </label>
  )
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Non è stato possibile leggere il file selezionato.'))
    reader.readAsDataURL(file)
  })
}

function layoutFieldPreview(key, type = '') {
  const normalized = String(key || '').trim().toLowerCase()
  const normalizedType = String(type || '').trim().toLowerCase()

  if (normalizedType === 'check') return 'X'
  const examples = {
    'donatore.nome': 'Mario',
    'donatore.cognome': 'Rossi',
    'donatore.nome_completo': 'Mario Rossi',
    'donatore.codice_fiscale': 'RSSMRA80A01F158X',
    'donatore.data_nascita': '01/01/1980',
    'donatore.email': 'mario.rossi@email.it',
    'donatore.telefono': '333 1234567',
    'questionario.data': '14/09/2026',
    'raccolta.data': '14/09/2026',
    'firma.donatore': 'Firma donatore',
    'firma.medico': 'Firma medico',
  }

  if (normalized.startsWith('concat:')) {
    return normalized
      .slice('concat:'.length)
      .split(':')
      .map((part) => examples[part] || part)
      .filter(Boolean)
      .join(' ')
  }

  if (examples[normalized]) return examples[normalized]
  if (normalized.startsWith('domanda:')) return normalized.includes(':si') || normalized.includes(':no') ? 'X' : 'SI'
  if (normalized.startsWith('dettaglio:')) return 'Dettaglio risposta'
  return String(key || 'Campo')
}

function questionCodeFromLayoutKey(key) {
  const parts = String(key || '').trim().split(':')
  const prefix = parts[0]?.toLowerCase()
  if (!['domanda', 'dettaglio'].includes(prefix) || !parts[1]) return null
  return parts[1].toUpperCase()
}

function checkPairIdentity(field) {
  if (String(field?.tipo_campo || '').trim().toLowerCase() !== 'check') return null

  const parts = String(field?.chiave_campo || '').trim().split(':')
  if (parts[0]?.toLowerCase() !== 'domanda' || !parts[1]) return null

  const answer = String(parts[2] || '').trim().toUpperCase()
  if (!['SI', 'NO'].includes(answer)) return null

  return {
    code: parts[1].toUpperCase(),
    page: Number(field?.pagina || 1),
  }
}

function layoutFieldLabel(key) {
  const normalized = String(key || '').trim().toLowerCase()
  const labels = {
    'donatore.nome': 'Nome donatore',
    'donatore.cognome': 'Cognome donatore',
    'donatore.nome_completo': 'Nome e cognome donatore',
    'donatore.codice_fiscale': 'Codice fiscale',
    'donatore.data_nascita': 'Data di nascita',
    'donatore.email': 'Email',
    'donatore.telefono': 'Telefono',
    'questionario.data': 'Data questionario',
    'raccolta.data': 'Data raccolta',
    'firma.donatore': 'Firma donatore',
    'firma.medico': 'Firma medico',
  }

  if (normalized.startsWith('concat:')) return 'Campo concatenato'
  if (labels[normalized]) return labels[normalized]
  if (normalized.startsWith('domanda:')) return 'Risposta ' + normalized.split(':')[1].toUpperCase()
  if (normalized.startsWith('dettaglio:')) return 'Dettaglio ' + normalized.split(':')[1].toUpperCase()
  return String(key || 'Campo')
}

function layoutTypeDefaults(type) {
  const normalized = String(type || '').trim().toLowerCase()

  if (normalized === 'check') {
    return {
      larghezza: 0.01,
      altezza: 0.01,
      font_size: 10,
      allineamento: 'centro',
    }
  }

  if (normalized === 'testo') {
    return {
      larghezza: 0.157,
      altezza: 0.032,
      font_size: 13,
      allineamento: 'sinistra',
    }
  }

  return null
}

function dedupeLayoutFields(fields) {
  const seen = new Set()
  const next = []

  for (const field of Array.isArray(fields) ? fields : []) {
    const key = String(field?.chiave_campo || '').trim().toUpperCase()
    const page = Number(field?.pagina || 1)
    const identity = page + ':' + key

    if (!key || seen.has(identity)) continue
    seen.add(identity)
    next.push(field)
  }

  return next
}

export default function QuestionarioManager({ idAvis, onToast }) {
  const [section, setSection] = useState('domande')
  const [questions, setQuestions] = useState([])
  const [questionsLoading, setQuestionsLoading] = useState(false)
  const [questionSaving, setQuestionSaving] = useState(false)
  const [selectedQuestionId, setSelectedQuestionId] = useState(null)
  const [questionDraft, setQuestionDraft] = useState(null)

  const [pdf, setPdf] = useState({ presente: false, url: null })
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfSaving, setPdfSaving] = useState(false)
  const [pdfPageCount, setPdfPageCount] = useState(0)
  const [pdfSourceBlob, setPdfSourceBlob] = useState(null)
  const [pdfPageLoading, setPdfPageLoading] = useState(false)
  const [pdfPageRatio, setPdfPageRatio] = useState(210 / 297)

  const [layout, setLayout] = useState([])
  const [layoutLoading, setLayoutLoading] = useState(false)
  const [layoutSaving, setLayoutSaving] = useState(false)
  const [previewDownloading, setPreviewDownloading] = useState(false)
  const [layoutPage, setLayoutPage] = useState(1)
  const [layoutZoom, setLayoutZoom] = useState(100)
  const [selectedFieldIndex, setSelectedFieldIndex] = useState(null)
  const [newFieldKey, setNewFieldKey] = useState('')
  const [layoutDirty, setLayoutDirty] = useState(false)
  const stageRef = useRef(null)
  const pdfViewportRef = useRef(null)
  const pdfCanvasRef = useRef(null)
  const layoutRef = useRef([])

  const [query, setQuery] = useState('')
  const [importing, setImporting] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [resetting, setResetting] = useState(false)

  async function loadQuestions() {
    setQuestionsLoading(true)
    try {
      const result = await caricaQuestionarioAvis(idAvis)
      const rows = Array.isArray(result?.domande) ? result.domande : []
      setQuestions(rows)

      if (selectedQuestionId) {
        const selected = rows.find((item) => item.id === selectedQuestionId)
        setQuestionDraft(selected ? { ...selected } : null)
        if (!selected) setSelectedQuestionId(null)
      }
    } catch (error) {
      setQuestions([])
      onToast({ tone: 'error', message: error.message || 'Non è stato possibile caricare il questionario.' })
    } finally {
      setQuestionsLoading(false)
    }
  }

  async function loadPdf() {
    setPdfLoading(true)
    try {
      const result = await gestisciPdfQuestionarioAvis(idAvis, 'load')
      setPdf(result?.pdf || { presente: false, url: null })
    } catch (error) {
      setPdf({ presente: false, url: null })
      onToast({ tone: 'error', message: error.message || 'Non è stato possibile caricare il PDF.' })
    } finally {
      setPdfLoading(false)
    }
  }

  async function loadLayout() {
    setLayoutLoading(true)
    try {
      const result = await caricaLayoutQuestionarioAvis(idAvis)
      const rows = dedupeLayoutFields(Array.isArray(result?.campi) ? result.campi : [])
      setLayout(rows)
      layoutRef.current = rows
      setLayoutDirty(false)
      setSelectedFieldIndex(null)
    } catch (error) {
      setLayout([])
      onToast({ tone: 'error', message: error.message || 'Non è stato possibile caricare il layout PDF.' })
    } finally {
      setLayoutLoading(false)
    }
  }

  useEffect(() => {
    void Promise.all([loadQuestions(), loadPdf(), loadLayout()])
  }, [idAvis])

  useEffect(() => {
    layoutRef.current = layout
  }, [layout])

  useEffect(() => {
    if (section !== 'layout') return undefined

    const syncLayoutFromServer = () => {
      if (document.visibilityState !== 'visible') return
      if (layoutDirty || layoutSaving) return
      void loadLayout()
    }

    const handleWindowFocus = () => syncLayoutFromServer()
    const handleVisibilityChange = () => syncLayoutFromServer()

    window.addEventListener('focus', handleWindowFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('focus', handleWindowFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [section, idAvis, layoutDirty, layoutSaving])

  useEffect(() => {
    let cancelled = false

    async function loadPdfSource() {
      if (!pdf.presente) {
        setPdfPageCount(0)
        setPdfSourceBlob(null)
        return
      }

      setPdfPageLoading(true)
      try {
        const blob = await caricaPdfSorgenteQuestionarioAvis(idAvis)
        if (cancelled) return
        setPdfSourceBlob(blob)
      } catch (error) {
        if (!cancelled) {
          setPdfPageCount(0)
          setPdfSourceBlob(null)
          onToast({ tone: 'error', message: error.message || 'Non è stato possibile caricare il PDF del questionario.' })
        }
      } finally {
        if (!cancelled) setPdfPageLoading(false)
      }
    }

    void loadPdfSource()

    return () => {
      cancelled = true
    }
  }, [idAvis, pdf.presente, pdf.url])

  const pdfDocumentRef = useRef(null)
  const pdfLoadingTaskRef = useRef(null)
  const pdfRenderTaskRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    async function loadPdfDocument() {
      if (!pdfSourceBlob) {
        setPdfPageCount(0)
        pdfDocumentRef.current = null
        return
      }

      try {
        const data = await pdfSourceBlob.arrayBuffer()
        if (cancelled) return

        const loadingTask = pdfjsLib.getDocument({ data })
        pdfLoadingTaskRef.current = loadingTask

        const document = await loadingTask.promise
        if (cancelled) {
          try {
            await document.destroy()
          } catch {
            // Nessuna azione necessaria.
          }
          return
        }

        pdfDocumentRef.current = document
        setPdfPageCount(document.numPages)

        if (layoutPage > document.numPages) {
          setLayoutPage(document.numPages || 1)
        }
      } catch (error) {
        if (!cancelled) {
          pdfDocumentRef.current = null
          setPdfPageCount(0)
          onToast({ tone: 'error', message: 'Non è stato possibile aprire il PDF nell’editor.' })
        }
      }
    }

    void loadPdfDocument()

    return () => {
      cancelled = true

      try {
        pdfRenderTaskRef.current?.cancel()
      } catch {
        // Nessuna azione necessaria.
      }
      pdfRenderTaskRef.current = null

      const document = pdfDocumentRef.current
      pdfDocumentRef.current = null
      if (document) {
        try {
          void document.destroy()
        } catch {
          // Nessuna azione necessaria.
        }
      }

      try {
        pdfLoadingTaskRef.current?.destroy()
      } catch {
        // Nessuna azione necessaria.
      }
      pdfLoadingTaskRef.current = null
    }
  }, [pdfSourceBlob])

  useEffect(() => {
    if (section !== 'layout' || layoutLoading) return

    let cancelled = false

    async function renderCurrentPage() {
      const document = pdfDocumentRef.current
      const canvas = pdfCanvasRef.current
      const stage = stageRef.current

      if (!document || !canvas || !stage) return

      try {
        const pageNumber = Math.min(Math.max(1, Number(layoutPage) || 1), document.numPages)
        const page = await document.getPage(pageNumber)
        if (cancelled) return

        const baseViewport = page.getViewport({ scale: 1 })
        const ratio = baseViewport.width / baseViewport.height
        setPdfPageRatio(ratio)

        await new Promise((resolve) => window.requestAnimationFrame(resolve))
        if (cancelled) return

        const cssWidth = Math.max(1, stage.clientWidth)
        const scale = cssWidth / baseViewport.width
        const viewport = page.getViewport({ scale })
        const outputScale = window.devicePixelRatio || 1

        try {
          pdfRenderTaskRef.current?.cancel()
        } catch {
          // Nessuna azione necessaria.
        }

        canvas.width = Math.max(1, Math.round(viewport.width * outputScale))
        canvas.height = Math.max(1, Math.round(viewport.height * outputScale))
        canvas.style.width = viewport.width + 'px'
        canvas.style.height = viewport.height + 'px'

        const context = canvas.getContext('2d', { alpha: false })
        const renderTask = page.render({
          canvasContext: context,
          viewport,
          transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
          background: '#ffffff',
        })

        pdfRenderTaskRef.current = renderTask
        await renderTask.promise

        if (pdfRenderTaskRef.current === renderTask) {
          pdfRenderTaskRef.current = null
        }
      } catch (error) {
        if (!cancelled && error?.name !== 'RenderingCancelledException') {
          onToast({ tone: 'error', message: 'Non è stato possibile renderizzare la pagina PDF nell’editor.' })
        }
      }
    }

    void renderCurrentPage()

    const handleResize = () => {
      void renderCurrentPage()
    }

    window.addEventListener('resize', handleResize)

    return () => {
      cancelled = true
      window.removeEventListener('resize', handleResize)

      try {
        pdfRenderTaskRef.current?.cancel()
      } catch {
        // Nessuna azione necessaria.
      }
      pdfRenderTaskRef.current = null
    }
  }, [section, layoutPage, pdfPageCount, layoutLoading])

  const groups = useMemo(() => {
    const map = new Map()
    for (const question of questions) {
      const key = question.sezione_codice || 'senza_sezione'
      if (!map.has(key)) {
        map.set(key, {
          key,
          title: question.sezione_titolo || 'Senza sezione',
          description: question.sezione_descrizione || '',
          order: Number(question.ordine_sezione || 0),
          questions: [],
        })
      }
      map.get(key).questions.push(question)
    }
    return Array.from(map.values()).sort((a, b) => a.order - b.order)
  }, [questions])

  const questionByCode = useMemo(() => {
    const map = new Map()
    for (const question of questions) {
      const code = String(question.codice || '').trim().toUpperCase()
      if (code) map.set(code, question)
    }
    return map
  }, [questions])

  const fieldSuggestions = useMemo(() => {
    const fixed = [
      'donatore.nome',
      'donatore.cognome',
      'donatore.nome_completo',
      'concat:donatore.nome:donatore.cognome',
      'donatore.codice_fiscale',
      'donatore.data_nascita',
      'donatore.luogo_nascita',
      'donatore.provincia_nascita',
      'donatore.nazione_nascita',
      'donatore.sesso',
      'donatore.medico_curante',
      'donatore.via_residenza',
      'donatore.civico_residenza',
      'donatore.indirizzo_residenza',
      'donatore.cap_residenza',
      'donatore.citta_residenza',
      'donatore.citta_provincia_residenza',
      'donatore.provincia_residenza',
      'donatore.email',
      'donatore.telefono',
      'questionario.data',
      'raccolta.data',
      'firma.donatore',
      'firma.medico',
    ]

    const usedQuestionFields = new Set(
      layout
        .map((field) => String(field.chiave_campo || '').trim().toUpperCase())
        .filter((key) => key.startsWith('DOMANDA:') || key.startsWith('DETTAGLIO:')),
    )

    const questionFields = questions.flatMap((question) => {
      const code = String(question.codice || '').trim()
      if (!code) return []

      const responseType = String(question.tipo_risposta || '').trim().toUpperCase()
      const candidates = []

      if (responseType === 'SI_NO') {
        candidates.push(
          'domanda:' + code + ':SI',
          'domanda:' + code + ':NO',
        )
      } else {
        candidates.push('domanda:' + code)
      }

      if (String(question.dettaglio_quando || '').trim()) {
        candidates.push('dettaglio:' + code)
      }

      return candidates.filter((key) => !usedQuestionFields.has(key.toUpperCase()))
    })

    return [
      ...fixed,
      ...questionFields,
    ]
  }, [questions, layout, questionByCode])

  const pageFields = layout
    .map((field, index) => ({ field, index }))
    .filter(({ field }) => Number(field.pagina) === Number(layoutPage))

  const selectedField = selectedFieldIndex === null ? null : layout[selectedFieldIndex] || null



  const newFieldQuestion = questionByCode.get(questionCodeFromLayoutKey(newFieldKey)) || null
  const selectedFieldQuestion = selectedField
    ? questionByCode.get(questionCodeFromLayoutKey(selectedField.chiave_campo)) || null
    : null

  async function updateSelectedFieldQuestionOmittable(value) {
    if (!selectedFieldQuestion || questionSaving) return

    setQuestionSaving(true)
    try {
      const result = await aggiornaDomandaQuestionarioAvis(idAvis, {
        ...selectedFieldQuestion,
        omettibile_periodico: value,
      })
      await loadQuestions()
      onToast({
        tone: 'success',
        message: result.message || 'Opzione della domanda aggiornata correttamente.',
      })
    } catch (error) {
      onToast({
        tone: 'error',
        message: error.message || 'Non è stato possibile aggiornare l’opzione della domanda.',
      })
    } finally {
      setQuestionSaving(false)
    }
  }

  async function saveQuestion() {
    if (!questionDraft || questionSaving) return
    setQuestionSaving(true)

    try {
      const result = await aggiornaDomandaQuestionarioAvis(idAvis, questionDraft)
      await loadQuestions()
      onToast({ tone: 'success', message: result.message || 'Domanda aggiornata correttamente.' })
    } catch (error) {
      onToast({ tone: 'error', message: error.message || 'Non è stato possibile aggiornare la domanda.' })
    } finally {
      setQuestionSaving(false)
    }
  }

  async function uploadPdf(file) {
    if (!file || pdfSaving) return
    if (file.type !== 'application/pdf') {
      onToast({ tone: 'error', message: 'Seleziona un file PDF.' })
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      onToast({ tone: 'error', message: 'Il PDF non può superare 20 MB.' })
      return
    }

    setPdfSaving(true)
    try {
      const encoded = await fileToDataUrl(file)
      const result = await gestisciPdfQuestionarioAvis(idAvis, 'save', encoded)
      setPdf(result?.pdf || { presente: false, url: null })
      onToast({ tone: 'success', message: result.message || 'PDF salvato correttamente.' })
    } catch (error) {
      onToast({ tone: 'error', message: error.message || 'Non è stato possibile salvare il PDF.' })
    } finally {
      setPdfSaving(false)
    }
  }

  async function deletePdf() {
    if (pdfSaving) return
    setPdfSaving(true)
    try {
      const result = await gestisciPdfQuestionarioAvis(idAvis, 'delete')
      setPdf(result?.pdf || { presente: false, url: null })
      onToast({ tone: 'success', message: result.message || 'PDF rimosso correttamente.' })
    } catch (error) {
      onToast({ tone: 'error', message: error.message || 'Non è stato possibile rimuovere il PDF.' })
    } finally {
      setPdfSaving(false)
    }
  }

  function addLayoutField() {
    const key = newFieldKey.trim()
    if (!key) {
      onToast({ tone: 'error', message: 'Inserisci una chiave campo.' })
      return
    }

    const targetPage = Number(layoutPage)

    const duplicate = layoutRef.current.some((field) => (
      Number(field.pagina) === targetPage
      && String(field.chiave_campo || '').trim().toUpperCase() === key.toUpperCase()
    ))
    if (duplicate) {
      onToast({ tone: 'error', message: 'Questo campo è già presente nella pagina ' + targetPage + '.' })
      return
    }

    const textDefaults = layoutTypeDefaults('testo')
    const fieldWidth = textDefaults.larghezza
    const fieldHeight = textDefaults.altezza
    let fieldX = 0.10
    let fieldY = 0.10
    const stage = stageRef.current

    if (stage) {
      const rect = stage.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        const sticky = document.querySelector('.questionnaire-layout-sticky')
        const stickyRect = sticky?.getBoundingClientRect()
        const marginPx = 12
        const visibleTop = Math.max(
          rect.top,
          stickyRect ? stickyRect.bottom + marginPx : marginPx,
          marginPx,
        )
        const visibleRight = Math.min(rect.right, window.innerWidth - marginPx)

        fieldX = Math.min(
          1 - fieldWidth,
          Math.max(0, (visibleRight - rect.left) / rect.width - fieldWidth),
        )
        fieldY = Math.min(
          1 - fieldHeight,
          Math.max(0, (visibleTop - rect.top) / rect.height),
        )
      }
    }

    const field = {
      chiave_campo: key,
      tipo_campo: 'testo',
      pagina: targetPage,
      x: fieldX,
      y: fieldY,
      larghezza: textDefaults.larghezza,
      altezza: textDefaults.altezza,
      font_size: textDefaults.font_size,
      allineamento: textDefaults.allineamento,
      attivo: true,
    }

    setLayout((current) => {
      const next = [...current, field]
      layoutRef.current = next
      setSelectedFieldIndex(next.length - 1)
      return next
    })
    setLayoutDirty(true)
    setNewFieldKey('')
  }

  function updateField(index, patch) {
    setLayout((current) => {
      const sourceField = current[index]
      const pair = checkPairIdentity(sourceField)
      const shouldSyncVerticalPosition = pair && Object.prototype.hasOwnProperty.call(patch, 'y')

      const next = current.map((field, currentIndex) => {
        if (currentIndex === index) return { ...field, ...patch }

        if (shouldSyncVerticalPosition) {
          const candidatePair = checkPairIdentity(field)
          if (
            candidatePair
            && candidatePair.code === pair.code
            && candidatePair.page === pair.page
          ) {
            return { ...field, y: patch.y }
          }
        }

        return field
      })

      layoutRef.current = next
      return next
    })
    setLayoutDirty(true)
  }

  function updateFieldType(index, type) {
    const field = layoutRef.current[index]
    const defaults = layoutTypeDefaults(type)
    const patch = { tipo_campo: type }

    if (field && defaults) {
      patch.larghezza = Math.max(0.01, Math.min(defaults.larghezza, 1 - Number(field.x)))
      patch.altezza = Math.max(0.01, Math.min(defaults.altezza, 1 - Number(field.y)))
      patch.font_size = defaults.font_size
      patch.allineamento = defaults.allineamento
    }

    updateField(index, patch)
  }

  async function removeField(index) {
    const field = layoutRef.current[index]
    if (!field) return

    const next = layoutRef.current.filter((_, currentIndex) => currentIndex !== index)

    if (!field.id) {
      setLayout(next)
      layoutRef.current = next
      setLayoutDirty(true)
      setSelectedFieldIndex(null)
      return
    }

    try {
      await eliminaCampoLayoutQuestionarioAvis(idAvis, field)
      setSelectedFieldIndex(null)
      await loadLayout()
      onToast({ tone: 'success', message: 'Campo rimosso dal layout.' })
    } catch (error) {
      onToast({ tone: 'error', message: error.message || 'Non è stato possibile rimuovere il campo.' })
    }
  }

  function handlePdfPan(event) {
    if (layoutZoom <= 100) return
    if (event.target.closest?.('.pdf-layout-field')) return

    const viewport = pdfViewportRef.current
    const target = event.currentTarget
    if (!viewport) return

    event.preventDefault()

    const pointerId = event.pointerId
    const startX = event.clientX
    const startScrollLeft = viewport.scrollLeft

    target.setPointerCapture(pointerId)

    const move = (moveEvent) => {
      viewport.scrollLeft = startScrollLeft - (moveEvent.clientX - startX)
    }

    const stop = () => {
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', stop)
      target.removeEventListener('pointercancel', stop)

      try {
        if (target.hasPointerCapture(pointerId)) {
          target.releasePointerCapture(pointerId)
        }
      } catch {
        // Il puntatore può essere già stato rilasciato dal browser.
      }
    }

    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', stop)
    target.addEventListener('pointercancel', stop)
  }

  function handleDrag(index, event) {
    if (!stageRef.current) return

    const rect = stageRef.current.getBoundingClientRect()
    const field = layoutRef.current[index]
    if (!field || rect.width <= 0 || rect.height <= 0) return

    const startX = event.clientX
    const startY = event.clientY
    const initialX = Number(field.x)
    const initialY = Number(field.y)
    const pointerId = event.pointerId
    const target = event.currentTarget
    let moved = false

    target.setPointerCapture(pointerId)

    const move = (moveEvent) => {
      const dx = (moveEvent.clientX - startX) / rect.width
      const dy = (moveEvent.clientY - startY) / rect.height
      const maxX = Math.max(0, 1 - Number(field.larghezza))
      const maxY = Math.max(0, 1 - Number(field.altezza))
      const x = Math.min(maxX, Math.max(0, initialX + dx))
      const y = Math.min(maxY, Math.max(0, initialY + dy))

      moved = moved || Math.abs(x - initialX) > 0.0001 || Math.abs(y - initialY) > 0.0001
      updateField(index, { x, y })
    }

    const up = () => {
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', up)
      target.removeEventListener('pointercancel', up)

      if (moved) {
        void saveLayout(layoutRef.current, {
          reload: false,
          suppressSuccessToast: true,
        })
      }
    }

    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', up)
    target.addEventListener('pointercancel', up)
  }

  async function saveLayout(layoutToSave = layoutRef.current, options = {}) {
    if (layoutSaving) return
    const {
      reload = true,
      successMessage = 'Layout PDF salvato correttamente.',
      suppressSuccessToast = false,
    } = options
    setLayoutSaving(true)
    try {
      const normalizedLayout = dedupeLayoutFields(layoutToSave)
      if (normalizedLayout.length !== layoutToSave.length) {
        setLayout(normalizedLayout)
        layoutRef.current = normalizedLayout
      }
      const result = await salvaLayoutQuestionarioAvis(idAvis, normalizedLayout)
      setLayoutDirty(false)
      if (reload) await loadLayout()
      if (!suppressSuccessToast) {
        onToast({ tone: 'success', message: successMessage || result.message || 'Layout PDF salvato correttamente.' })
      }
    } catch (error) {
      setLayoutDirty(true)
      onToast({ tone: 'error', message: error.message || 'Non è stato possibile salvare il layout.' })
    } finally {
      setLayoutSaving(false)
    }
  }

  async function downloadPreviewPdf(mode = 'full') {
    if (previewDownloading) return
    if (!pdf.presente) {
      onToast({ tone: 'error', message: 'Carica prima il PDF di partenza.' })
      return
    }
    if (!layout.length) {
      onToast({ tone: 'error', message: 'Aggiungi almeno un campo al layout.' })
      return
    }

    const currentPageOnly = mode === 'page'
    const previewWindow = window.open('', '_blank')
    if (!previewWindow) {
      onToast({ tone: 'error', message: 'Il browser ha bloccato l’apertura del PDF di prova.' })
      return
    }

    previewWindow.document.title = currentPageOnly
      ? 'Preparazione anteprima pagina ' + layoutPage
      : 'Preparazione PDF di prova'
    previewWindow.document.body.innerHTML = '<p style="font-family: sans-serif; padding: 24px;">Preparazione PDF di prova…</p>'

    setPreviewDownloading(true)
    try {
      const result = await scaricaAnteprimaQuestionarioAvis(
        idAvis,
        layoutRef.current,
        currentPageOnly ? Number(layoutPage) : null,
      )
      previewWindow.location.href = result.url
      window.setTimeout(() => URL.revokeObjectURL(result.url), 60000)
      onToast({
        tone: 'success',
        message: currentPageOnly
          ? 'Anteprima della pagina ' + layoutPage + ' aperta in una nuova scheda.'
          : 'PDF di prova completo aperto in una nuova scheda.',
      })
    } catch (error) {
      previewWindow.close()
      onToast({ tone: 'error', message: error.message || 'Non è stato possibile generare il PDF di prova.' })
    } finally {
      setPreviewDownloading(false)
    }
  }

  async function importQuery() {
    if (!query.trim() || importing) return
    setImporting(true)
    try {
      const result = await importaQuestionarioAvis(idAvis, query)
      setQuery('')
      await loadQuestions()
      onToast({ tone: 'success', message: result.message || 'Domande importate correttamente.' })
    } catch (error) {
      onToast({ tone: 'error', message: error.message || 'Non è stato possibile importare le domande.' })
    } finally {
      setImporting(false)
    }
  }

  async function resetQuestions() {
    if (resetting) return
    setResetting(true)
    try {
      const result = await resetQuestionarioAvis(idAvis)
      setResetOpen(false)
      setSelectedQuestionId(null)
      setQuestionDraft(null)
      await loadQuestions()
      onToast({ tone: 'success', message: result.message || 'Domande azzerate correttamente.' })
    } catch (error) {
      onToast({ tone: 'error', message: error.message || 'Non è stato possibile azzerare le domande.' })
    } finally {
      setResetting(false)
    }
  }

  return (
    <section className="panel-card avis-detail-panel questionnaire-panel">
      <div className="portal-form-heading">
        <div>
          <span className="section-kicker">QUESTIONARIO</span>
          <h3>Configurazione questionario</h3>
          <p>Gestisci domande, PDF di partenza e posizione dei campi del modulo.</p>
        </div>
        <div className="questionnaire-summary">
          <strong>{questions.length}</strong>
          <span>domande</span>
        </div>
      </div>

      <nav className="questionnaire-subtabs" aria-label="Configurazione questionario">
        {[
          ['domande', 'Domande'],
          ['pdf', 'Modulo PDF'],
          ['layout', 'Layout PDF'],
          ['import', 'Importa / Reset'],
        ].map(([key, label]) => (
          <button key={key} type="button" className={section === key ? 'is-active' : ''} onClick={() => setSection(key)}>
            {label}
          </button>
        ))}
      </nav>

      {section === 'domande' ? (
        questionsLoading ? (
          <div className="questionnaire-loading">Caricamento questionario…</div>
        ) : groups.length === 0 ? (
          <div className="questionnaire-empty">
            <strong>Nessuna domanda disponibile</strong>
            <span>Puoi importare il nuovo questionario dalla sezione Importa / Reset.</span>
          </div>
        ) : (
          <div className="questionnaire-layout">
            <div className="questionnaire-sections">
              {groups.map((group) => (
                <section className="questionnaire-section" key={group.key}>
                  <header>
                    <div>
                      <span className="section-kicker">SEZIONE {group.order}</span>
                      <h4>{group.title}</h4>
                      {group.description ? <p>{group.description}</p> : null}
                    </div>
                    <span className="questionnaire-section-count">{group.questions.length}</span>
                  </header>

                  <div className="questionnaire-question-list">
                    {group.questions.map((question) => (
                      <button
                        type="button"
                        key={question.id}
                        className={'questionnaire-question ' + (selectedQuestionId === question.id ? 'is-selected' : '')}
                        onClick={() => {
                          setSelectedQuestionId(question.id)
                          setQuestionDraft({ ...question })
                        }}
                      >
                        <div className="questionnaire-question-order">{question.ordine_domanda}</div>
                        <div className="questionnaire-question-copy">
                          <strong>{question.testo}</strong>
                          <span>{question.codice} · pagina {question.pagina_compilazione}</span>
                        </div>
                        <span className={'questionnaire-active-dot ' + (question.attiva ? 'is-on' : 'is-off')}>
                          {question.attiva ? 'Attiva' : 'Disattiva'}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <aside className="questionnaire-editor">
              {questionDraft ? (
                <>
                  <div className="questionnaire-editor-heading">
                    <div>
                      <span className="section-kicker">{questionDraft.codice}</span>
                      <h4>Modifica domanda</h4>
                    </div>
                    <button type="button" className="primary-button" onClick={() => void saveQuestion()} disabled={questionSaving || !questionDraft.testo?.trim()}>
                      {questionSaving ? 'Salvataggio…' : 'Salva'}
                    </button>
                  </div>

                  <label className="portal-field">
                    <span>Testo domanda</span>
                    <textarea rows="5" value={questionDraft.testo || ''} onChange={(event) => setQuestionDraft((current) => ({ ...current, testo: event.target.value }))} />
                  </label>

                  <div className="questionnaire-editor-grid">
                    <label className="portal-field">
                      <span>Pagina compilazione</span>
                      <input type="number" min="1" value={questionDraft.pagina_compilazione ?? 1} onChange={(event) => setQuestionDraft((current) => ({ ...current, pagina_compilazione: event.target.value }))} />
                    </label>
                    <label className="portal-field">
                      <span>Ordine domanda</span>
                      <input type="number" min="0" value={questionDraft.ordine_domanda ?? 0} onChange={(event) => setQuestionDraft((current) => ({ ...current, ordine_domanda: event.target.value }))} />
                    </label>
                    <label className="portal-field">
                      <span>Tipo risposta</span>
                      <input type="text" value={questionDraft.tipo_risposta || ''} onChange={(event) => setQuestionDraft((current) => ({ ...current, tipo_risposta: event.target.value.toUpperCase() }))} />
                    </label>
                    <label className="portal-field">
                      <span>Dettaglio quando</span>
                      <select value={questionDraft.dettaglio_quando || ''} onChange={(event) => setQuestionDraft((current) => ({ ...current, dettaglio_quando: event.target.value || null }))}>
                        <option value="">Nessun dettaglio</option>
                        <option value="SI">Quando risponde Sì</option>
                        <option value="NO">Quando risponde No</option>
                      </select>
                    </label>
                  </div>

                  <label className="portal-field">
                    <span>Etichetta dettaglio</span>
                    <input type="text" value={questionDraft.etichetta_dettaglio || ''} onChange={(event) => setQuestionDraft((current) => ({ ...current, etichetta_dettaglio: event.target.value }))} />
                  </label>

                  <div className="questionnaire-toggle-list">
                    <ToggleCard label="Domanda attiva" description="Se disattivata non verrà mostrata nel questionario." checked={Boolean(questionDraft.attiva)} onChange={(value) => setQuestionDraft((current) => ({ ...current, attiva: value }))} />
                    <ToggleCard label="Obbligatoria" description="La compilazione richiede una risposta prima di procedere." checked={Boolean(questionDraft.obbligatoria)} onChange={(value) => setQuestionDraft((current) => ({ ...current, obbligatoria: value }))} />
                    <ToggleCard label="Solo donne" description="La domanda viene proposta esclusivamente alle donatrici." checked={Boolean(questionDraft.solo_donne)} onChange={(value) => setQuestionDraft((current) => ({ ...current, solo_donne: value }))} />
                    <ToggleCard
                      label="Omettibile per donatore periodico"
                      description="Consente di non proporre questa domanda quando il donatore rientra nei criteri del questionario ridotto."
                      checked={Boolean(questionDraft.omettibile_periodico)}
                      onChange={(value) => setQuestionDraft((current) => ({ ...current, omettibile_periodico: value }))}
                    />
                  </div>
                </>
              ) : (
                <div className="questionnaire-editor-empty">
                  <strong>Seleziona una domanda</strong>
                  <span>Il pannello di modifica comparirà qui.</span>
                </div>
              )}
            </aside>
          </div>
        )
      ) : null}

      {section === 'pdf' ? (
        <div className="questionnaire-pdf-grid">
          <div className="questionnaire-pdf-preview">
            {pdfLoading ? (
              <span>Caricamento PDF…</span>
            ) : pdf.presente && pdf.url ? (
              <object data={pdf.url} type="application/pdf" aria-label="Anteprima questionario PDF">
                <a href={pdf.url} target="_blank" rel="noreferrer">Apri il PDF</a>
              </object>
            ) : (
              <div className="questionnaire-empty compact">
                <strong>Nessun PDF caricato</strong>
                <span>Carica il modulo di partenza corrente.</span>
              </div>
            )}
          </div>

          <div className="questionnaire-pdf-actions">
            <h4>Modulo PDF corrente</h4>
            <p>Viene conservato un solo PDF di partenza per AVIS. Sostituendolo, il file precedente viene sovrascritto.</p>

            <label className="secondary-button questionnaire-file-button">
              {pdfSaving ? 'Salvataggio…' : pdf.presente ? 'Sostituisci PDF' : 'Carica PDF'}
              <input type="file" accept="application/pdf" disabled={pdfSaving} onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void uploadPdf(file)
                event.target.value = ''
              }} />
            </label>

            {pdf.presente ? (
              <button type="button" className="danger-text-button" onClick={() => void deletePdf()} disabled={pdfSaving}>
                Rimuovi PDF
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {section === 'layout' ? (
        <div className="questionnaire-layout-editor">
          <div className="questionnaire-layout-sticky">
            <div className="questionnaire-layout-toolbar">
              <label className="portal-field layout-key-field">
                <span>Nuovo campo</span>
                <input list="questionnaire-field-keys" value={newFieldKey} onChange={(event) => setNewFieldKey(event.target.value)} placeholder="es. donatore.nome" />
                <datalist id="questionnaire-field-keys">
                  {fieldSuggestions.map((key) => {
                    const question = questionByCode.get(questionCodeFromLayoutKey(key))
                    const parts = String(key).split(':')
                    const answer = parts[2]?.toUpperCase() || ''
                    const isDetail = parts[0]?.toLowerCase() === 'dettaglio'
                    const answerLabel = answer === 'SI' ? 'Sì' : answer === 'NO' ? 'No' : ''
                    const label = question
                      ? isDetail
                        ? ['Dettaglio', question.etichetta_dettaglio || question.testo].filter(Boolean).join(' — ')
                        : [answerLabel, question.testo].filter(Boolean).join(' — ')
                      : undefined
                    return <option key={key} value={key} label={label} />
                  })}
                </datalist>
                {newFieldQuestion ? (
                  <span className="layout-question-reference">
                    <strong>{newFieldQuestion.codice}</strong>
                    <span>{newFieldQuestion.testo}</span>
                  </span>
                ) : null}
              </label>

              <button type="button" className="secondary-button" onClick={addLayoutField}>Aggiungi campo</button>
              <button type="button" className="secondary-button" onClick={() => void downloadPreviewPdf('page')} disabled={previewDownloading || !pdf.presente || !layout.length || !pdfPageCount}>
                {previewDownloading ? 'Preparazione PDF…' : 'Anteprima pagina corrente'}
              </button>
              <button type="button" className="secondary-button" onClick={() => void downloadPreviewPdf('full')} disabled={previewDownloading || !pdf.presente || !layout.length}>
                {previewDownloading ? 'Preparazione PDF…' : 'Anteprima PDF completo'}
              </button>
            </div>

            {!layoutLoading ? (
              <div className="questionnaire-page-nav" aria-label="Pagine del questionario">
                <button
                  type="button"
                  className="primary-button questionnaire-save-inline"
                  onClick={() => void saveLayout()}
                  disabled={layoutSaving || !layoutDirty}
                >
                  {layoutSaving ? 'Salvataggio…' : layoutDirty ? 'Salva layout' : 'Layout salvato'}
                </button>
                <div className="questionnaire-page-nav-copy">
                  <span className="section-kicker">PAGINA PDF</span>
                  <strong>{pdfPageCount ? `Pagina ${layoutPage} di ${pdfPageCount}` : 'Pagina non disponibile'}</strong>
                </div>
                <div className="questionnaire-page-nav-tools">
                  <div className="questionnaire-zoom-controls" aria-label="Zoom anteprima PDF">
                    <button
                      type="button"
                      onClick={() => setLayoutZoom((current) => Math.max(50, current - 10))}
                      disabled={layoutZoom <= 50}
                      title="Riduci zoom"
                    >
                      −
                    </button>
                    <button
                      type="button"
                      className="questionnaire-zoom-value"
                      onClick={() => setLayoutZoom(100)}
                      title="Ripristina zoom al 100%"
                    >
                      {layoutZoom}%
                    </button>
                    <button
                      type="button"
                      onClick={() => setLayoutZoom((current) => Math.min(200, current + 10))}
                      disabled={layoutZoom >= 200}
                      title="Aumenta zoom"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="questionnaire-zoom-reset"
                      onClick={() => setLayoutZoom(100)}
                      disabled={layoutZoom === 100}
                    >
                      Reset
                    </button>
                  </div>

                  <div className="questionnaire-page-buttons">
                    {Array.from({ length: pdfPageCount }, (_, index) => index + 1).map((page) => (
                      <button
                        type="button"
                        key={page}
                        className={Number(layoutPage) === page ? 'is-active' : ''}
                        onClick={() => {
                          setLayoutPage(page)
                          setSelectedFieldIndex(null)
                        }}
                      >
                        {page}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {layoutLoading ? (
            <div className="questionnaire-loading">Caricamento layout…</div>
          ) : (
            <>
              <div className="questionnaire-layout-workspace">
              <div className="pdf-layout-viewport" ref={pdfViewportRef}>
                <div
                  className={'pdf-layout-stage ' + (layoutZoom > 100 ? 'is-pannable' : '')}
                  ref={stageRef}
                  onPointerDown={handlePdfPan}
                  style={{
                    aspectRatio: pdfPageRatio,
                    width: `min(${layoutZoom}%, ${8.4 * layoutZoom}px)`,
                  }}
                >
                {pdfPageLoading ? (
                  <div className="pdf-layout-placeholder">Caricamento pagina {layoutPage}…</div>
                ) : pdfSourceBlob ? (
                  <canvas
                    ref={pdfCanvasRef}
                    className="pdf-layout-canvas"
                    aria-label={'Pagina ' + layoutPage + ' questionario'}
                  />
                ) : (
                  <div className="pdf-layout-placeholder">
                    {pdf.presente ? 'Anteprima pagina non disponibile' : 'Carica prima il PDF di partenza'}
                  </div>
                )}

                <div className="pdf-layout-overlay">
                  {selectedField && Number(selectedField.pagina) === Number(layoutPage) ? (
                    <>
                      <span className="pdf-layout-guide is-vertical" style={{ left: Number(selectedField.x) * 100 + '%' }} />
                      <span className="pdf-layout-guide is-horizontal" style={{ top: Number(selectedField.y) * 100 + '%' }} />
                    </>
                  ) : null}
                  {pageFields.map(({ field, index }) => (
                    <button
                      type="button"
                      key={field.chiave_campo + '-' + index}
                      className={'pdf-layout-field ' + (selectedFieldIndex === index ? 'is-selected' : '')}
                      style={{
                        left: Number(field.x) * 100 + '%',
                        top: Number(field.y) * 100 + '%',
                        width: Number(field.larghezza) * 100 + '%',
                        height: Number(field.altezza) * 100 + '%',
                      }}
                      onPointerDown={(event) => {
                        if (selectedFieldIndex !== index) {
                          event.preventDefault()
                          event.stopPropagation()
                          setSelectedFieldIndex(index)
                          return
                        }

                        handleDrag(index, event)
                      }}
                    >
                      <span className="pdf-layout-field-label" title={field.chiave_campo}>
                        {layoutFieldLabel(field.chiave_campo)}
                      </span>
                      <span
                        className="pdf-layout-field-preview"
                        style={{ fontSize: Math.max(8, Number(field.font_size || 10) * 1.4) + 'px' }}
                      >
                        {layoutFieldPreview(field.chiave_campo, field.tipo_campo)}
                      </span>
                      <span className="pdf-layout-anchor" aria-hidden="true" />
                    </button>
                  ))}
                </div>
                </div>
              </div>

              <aside className="layout-field-editor">
                {selectedField ? (
                  <>
                    <div className="questionnaire-editor-heading">
                      <div>
                        <span className="section-kicker">CAMPO</span>
                        <h4>{selectedField.chiave_campo}</h4>
                        {selectedFieldQuestion ? (
                          <div className="layout-question-reference is-selected-field">
                            <strong>Domanda {selectedFieldQuestion.codice}</strong>
                            <span>{selectedFieldQuestion.testo}</span>
                          </div>
                        ) : null}
                      </div>
                      <button type="button" className="danger-text-button" onClick={() => void removeField(selectedFieldIndex)}>
                        Rimuovi
                      </button>
                    </div>

                    {selectedFieldQuestion ? (
                      <div className="questionnaire-toggle-list layout-question-toggle">
                        <ToggleCard
                          label="Omettibile per donatore periodico"
                          description="Se attivo, questa domanda potrà essere esclusa dal questionario ridotto del donatore periodico."
                          checked={Boolean(selectedFieldQuestion.omettibile_periodico)}
                          disabled={questionSaving}
                          onChange={(value) => void updateSelectedFieldQuestionOmittable(value)}
                        />
                      </div>
                    ) : null}

                    <label className="portal-field">
                      <span>Chiave campo</span>
                      <input
                        value={selectedField.chiave_campo}
                        onChange={(event) => {
                          const nextKey = event.target.value
                          const duplicate = layoutRef.current.some((field, index) => (
                            index !== selectedFieldIndex
                            && Number(field.pagina) === Number(selectedField.pagina)
                            && String(field.chiave_campo || '').trim().toUpperCase() === nextKey.trim().toUpperCase()
                          ))
                          if (duplicate) {
                            onToast({ tone: 'error', message: 'Esiste già un campo con questa chiave nella stessa pagina.' })
                            return
                          }
                          updateField(selectedFieldIndex, { chiave_campo: nextKey })
                        }}
                      />
                    </label>

                    <div className="questionnaire-editor-grid">
                      <label className="portal-field">
                        <span>Tipo</span>
                        <select value={selectedField.tipo_campo} onChange={(event) => updateFieldType(selectedFieldIndex, event.target.value)}>
                          <option value="testo">Testo</option>
                          <option value="check">Check</option>
                          <option value="firma">Firma</option>
                          <option value="data">Data</option>
                        </select>
                      </label>

                      <label className="portal-field">
                        <span>Pagina</span>
                        <input type="number" min="1" value={selectedField.pagina} onChange={(event) => updateField(selectedFieldIndex, { pagina: Number(event.target.value) || 1 })} />
                      </label>

                      <label className="portal-field">
                        <span>Larghezza %</span>
                        <input type="number" min="1" max="100" step="0.1" value={(Number(selectedField.larghezza) * 100).toFixed(1)} onChange={(event) => updateField(selectedFieldIndex, { larghezza: Math.max(0.01, Math.min(1 - Number(selectedField.x), Number(event.target.value) / 100)) })} />
                      </label>

                      <label className="portal-field">
                        <span>Altezza %</span>
                        <input type="number" min="1" max="100" step="0.1" value={(Number(selectedField.altezza) * 100).toFixed(1)} onChange={(event) => updateField(selectedFieldIndex, { altezza: Math.max(0.01, Math.min(1 - Number(selectedField.y), Number(event.target.value) / 100)) })} />
                      </label>

                      <label className="portal-field">
                        <span>Font</span>
                        <input type="number" min="4" max="72" value={selectedField.font_size ?? 10} onChange={(event) => updateField(selectedFieldIndex, { font_size: Number(event.target.value) || 10 })} />
                      </label>

                      <label className="portal-field">
                        <span>Allineamento</span>
                        <select value={selectedField.allineamento || 'sinistra'} onChange={(event) => updateField(selectedFieldIndex, { allineamento: event.target.value })}>
                          <option value="sinistra">Sinistra</option>
                          <option value="centro">Centro</option>
                          <option value="destra">Destra</option>
                        </select>
                      </label>
                    </div>

                    <div className="layout-position-panel">
                      <div className="layout-position-heading">
                        <div>
                          <strong>Posizione sul PDF</strong>
                          <span>Il punto rosso indica l'angolo da cui il renderer inizia a scrivere.</span>
                        </div>
                        <span className={layoutDirty ? 'layout-save-state is-dirty' : 'layout-save-state is-saved'}>
                          {layoutSaving ? 'Salvataggio…' : layoutDirty ? 'Da salvare' : 'Salvato'}
                        </span>
                      </div>
                      <div className="layout-coordinate-grid">
                        <span>
                          <small>Sinistra</small>
                          <input
                            type="number"
                            min="0"
                            max={(Math.max(0, 1 - Number(selectedField.larghezza)) * 100).toFixed(2)}
                            step="0.01"
                            value={(Number(selectedField.x) * 100).toFixed(2)}
                            onChange={(event) => updateField(selectedFieldIndex, {
                              x: Math.max(0, Math.min(1 - Number(selectedField.larghezza), Number(event.target.value) / 100)),
                            })}
                            style={{ width: '100%', marginTop: 4, padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 8, background: 'transparent', color: 'inherit', font: 'inherit' }}
                          />
                        </span>
                        <span>
                          <small>Alto</small>
                          <input
                            type="number"
                            min="0"
                            max={(Math.max(0, 1 - Number(selectedField.altezza)) * 100).toFixed(2)}
                            step="0.01"
                            value={(Number(selectedField.y) * 100).toFixed(2)}
                            onChange={(event) => updateField(selectedFieldIndex, {
                              y: Math.max(0, Math.min(1 - Number(selectedField.altezza), Number(event.target.value) / 100)),
                            })}
                            style={{ width: '100%', marginTop: 4, padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 8, background: 'transparent', color: 'inherit', font: 'inherit' }}
                          />
                        </span>
                        <span><small>Larghezza</small><strong>{(Number(selectedField.larghezza) * 100).toFixed(2)}%</strong></span>
                        <span><small>Altezza</small><strong>{(Number(selectedField.altezza) * 100).toFixed(2)}%</strong></span>
                      </div>
                      <button type="button" className="primary-button layout-save-position" onClick={() => void saveLayout()} disabled={layoutSaving || !layoutDirty}>
                        {layoutSaving ? 'Salvataggio…' : layoutDirty ? 'Salva posizione' : 'Posizione salvata'}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="questionnaire-editor-empty">
                    <strong>Seleziona un campo</strong>
                    <span>Trascinalo direttamente sull'anteprima PDF per posizionarlo.</span>
                  </div>
                )}
              </aside>
              </div>
            </>
          )}
        </div>
      ) : null}

      {section === 'import' ? (
        <div className="questionnaire-import-grid">
          <section className="questionnaire-import-card">
            <span className="section-kicker">IMPORTA DOMANDE</span>
            <h4>Query INSERT</h4>
            <p>
              Incolla una singola query <strong>INSERT INTO questionario_domande (...) VALUES (...)</strong>.
              Il Portal forza automaticamente l'AVIS corrente e non consente query SQL generiche.
            </p>
            <textarea
              className="questionnaire-query"
              rows="16"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={"INSERT INTO questionario_domande (codice, sezione_codice, sezione_titolo, ordine_sezione, pagina_compilazione, testo, tipo_risposta, obbligatoria, solo_donne, ordine_domanda, attiva) VALUES\n('Q01', 'SALUTE', 'Stato di salute', 1, 1, 'Testo domanda...', 'SI_NO', 1, 0, 1, 1);"}
            />
            <button type="button" className="primary-button" disabled={importing || !query.trim()} onClick={() => void importQuery()}>
              {importing ? 'Importazione…' : 'Importa domande'}
            </button>
          </section>

          <section className="questionnaire-danger-card">
            <span className="section-kicker danger">ZONA PERICOLOSA</span>
            <h4>Reset domande</h4>
            <p>
              Elimina tutte le righe di <strong>questionario_domande</strong> della AVIS corrente.
              Il PDF e il layout dei campi non vengono cancellati.
            </p>

            {!resetOpen ? (
              <button type="button" className="danger-button" onClick={() => setResetOpen(true)}>
                Reset domande
              </button>
            ) : (
              <div className="questionnaire-reset-confirm">
                <strong>Confermi il reset completo delle domande?</strong>
                <span>L'operazione non può essere annullata.</span>
                <div>
                  <button type="button" className="danger-button" disabled={resetting} onClick={() => void resetQuestions()}>
                    {resetting ? 'Reset…' : 'Sì, elimina tutte le domande'}
                  </button>
                  <button type="button" className="secondary-button" disabled={resetting} onClick={() => setResetOpen(false)}>
                    Annulla
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </section>
  )
}
