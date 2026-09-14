import { useEffect, useMemo, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker
import {
  aggiornaDomandaQuestionarioAvis,
  caricaInfoPagineQuestionarioAvis,
  caricaLayoutQuestionarioAvis,
  caricaPaginaQuestionarioAvis,
  caricaQuestionarioAvis,
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

function layoutFieldPreview(key) {
  const normalized = String(key || '').trim().toLowerCase()
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
  const [pdfPageBlob, setPdfPageBlob] = useState(null)
  const [pdfPageLoading, setPdfPageLoading] = useState(false)
  const [pdfPageRatio, setPdfPageRatio] = useState(210 / 297)

  const [layout, setLayout] = useState([])
  const [layoutLoading, setLayoutLoading] = useState(false)
  const [layoutSaving, setLayoutSaving] = useState(false)
  const [previewDownloading, setPreviewDownloading] = useState(false)
  const [layoutPage, setLayoutPage] = useState(1)
  const [selectedFieldIndex, setSelectedFieldIndex] = useState(null)
  const [newFieldKey, setNewFieldKey] = useState('')
  const [layoutDirty, setLayoutDirty] = useState(false)
  const stageRef = useRef(null)
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
      const rows = Array.isArray(result?.campi) ? result.campi : []
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
    let cancelled = false

    async function loadPagedPreview() {
      if (!pdf.presente) {
        setPdfPageCount(0)
        setPdfPageBlob(null)
        return
      }

      setPdfPageLoading(true)
      try {
        const info = await caricaInfoPagineQuestionarioAvis(idAvis)
        if (cancelled) return

        const pages = Math.max(1, Number(info?.pagine) || 1)
        setPdfPageCount(pages)

        const targetPage = Math.min(Math.max(1, Number(layoutPage) || 1), pages)
        if (targetPage !== Number(layoutPage)) {
          setLayoutPage(targetPage)
          return
        }

        const blob = await caricaPaginaQuestionarioAvis(idAvis, targetPage)
        if (cancelled) return

        setPdfPageBlob(blob)
      } catch (error) {
        if (!cancelled) {
          setPdfPageCount(0)
          setPdfPageBlob(null)
          onToast({ tone: 'error', message: error.message || 'Non è stato possibile caricare la pagina del PDF.' })
        }
      } finally {
        if (!cancelled) setPdfPageLoading(false)
      }
    }

    void loadPagedPreview()

    return () => {
      cancelled = true
    }
  }, [idAvis, pdf.presente, pdf.url, layoutPage])

  useEffect(() => {
    if (!pdfPageBlob || !pdfCanvasRef.current || !stageRef.current) return

    let cancelled = false
    let loadingTask = null
    let renderTask = null
    let resizeObserver = null
    let document = null
    let page = null
    let renderQueued = false

    async function renderPdfPage() {
      if (renderQueued || cancelled) return
      renderQueued = true

      try {
        const canvas = pdfCanvasRef.current
        const stage = stageRef.current
        if (!canvas || !stage) return

        if (!page) {
          const data = await pdfPageBlob.arrayBuffer()
          if (cancelled) return

          loadingTask = pdfjsLib.getDocument({ data })
          document = await loadingTask.promise
          if (cancelled) return

          page = await document.getPage(1)
        }

        const baseViewport = page.getViewport({ scale: 1 })
        setPdfPageRatio(baseViewport.width / baseViewport.height)

        const cssWidth = Math.max(1, stage.clientWidth)
        const scale = cssWidth / baseViewport.width
        const viewport = page.getViewport({ scale })
        const outputScale = window.devicePixelRatio || 1

        canvas.width = Math.max(1, Math.floor(viewport.width * outputScale))
        canvas.height = Math.max(1, Math.floor(viewport.height * outputScale))
        canvas.style.width = viewport.width + 'px'
        canvas.style.height = viewport.height + 'px'

        const context = canvas.getContext('2d', { alpha: false })
        context.save()
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, canvas.width, canvas.height)
        context.restore()

        renderTask = page.render({
          canvasContext: context,
          viewport,
          transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null,
        })

        await renderTask.promise
      } catch (error) {
        if (!cancelled && error?.name !== 'RenderingCancelledException') {
          onToast({ tone: 'error', message: 'Non è stato possibile renderizzare la pagina PDF nell’editor.' })
        }
      } finally {
        renderQueued = false
      }
    }

    void renderPdfPage()

    resizeObserver = new ResizeObserver(() => {
      if (cancelled) return

      window.requestAnimationFrame(() => {
        if (cancelled) return

        if (renderTask) {
          try {
            renderTask.cancel()
          } catch {
            // Nessuna azione necessaria.
          }
          renderTask = null
        }

        void renderPdfPage()
      })
    })
    resizeObserver.observe(stageRef.current)

    return () => {
      cancelled = true
      resizeObserver?.disconnect()

      try {
        renderTask?.cancel()
      } catch {
        // Nessuna azione necessaria.
      }

      try {
        page?.cleanup()
      } catch {
        // Nessuna azione necessaria.
      }

      try {
        document?.destroy()
      } catch {
        // Nessuna azione necessaria.
      }

      try {
        loadingTask?.destroy()
      } catch {
        // Nessuna azione necessaria.
      }
    }
  }, [pdfPageBlob])

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

  const fieldSuggestions = useMemo(() => {
    const fixed = [
      'donatore.nome',
      'donatore.cognome',
      'donatore.nome_completo',
      'concat:donatore.nome:donatore.cognome',
      'donatore.codice_fiscale',
      'donatore.data_nascita',
      'donatore.email',
      'donatore.telefono',
      'questionario.data',
      'firma.donatore',
      'firma.medico',
    ]

    return [
      ...fixed,
      ...questions.map((question) => 'domanda:' + question.codice),
    ]
  }, [questions])

  const pageFields = layout
    .map((field, index) => ({ field, index }))
    .filter(({ field }) => Number(field.pagina) === Number(layoutPage))

  const selectedField = selectedFieldIndex === null ? null : layout[selectedFieldIndex] || null

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

    const field = {
      chiave_campo: key,
      tipo_campo: 'testo',
      pagina: Number(layoutPage),
      x: 0.10,
      y: 0.10,
      larghezza: 0.25,
      altezza: 0.04,
      font_size: 10,
      allineamento: 'sinistra',
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
      const next = current.map((field, currentIndex) => (
        currentIndex === index ? { ...field, ...patch } : field
      ))
      layoutRef.current = next
      return next
    })
    setLayoutDirty(true)
  }

  function removeField(index) {
    setLayout((current) => {
      const next = current.filter((_, currentIndex) => currentIndex !== index)
      layoutRef.current = next
      return next
    })
    setLayoutDirty(true)
    setSelectedFieldIndex(null)
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
          successMessage: 'Posizione salvata automaticamente.',
        })
      }
    }

    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', up)
    target.addEventListener('pointercancel', up)
  }

  async function saveLayout(layoutToSave = layoutRef.current, options = {}) {
    if (layoutSaving) return
    const { reload = true, successMessage = 'Layout PDF salvato correttamente.' } = options
    setLayoutSaving(true)
    try {
      const result = await salvaLayoutQuestionarioAvis(idAvis, layoutToSave)
      setLayoutDirty(false)
      if (reload) await loadLayout()
      onToast({ tone: 'success', message: successMessage || result.message || 'Layout PDF salvato correttamente.' })
    } catch (error) {
      setLayoutDirty(true)
      onToast({ tone: 'error', message: error.message || 'Non è stato possibile salvare il layout.' })
    } finally {
      setLayoutSaving(false)
    }
  }

  async function downloadPreviewPdf() {
    if (previewDownloading) return
    if (!pdf.presente) {
      onToast({ tone: 'error', message: 'Carica prima il PDF di partenza.' })
      return
    }
    if (!layout.length) {
      onToast({ tone: 'error', message: 'Aggiungi almeno un campo al layout.' })
      return
    }

    const previewWindow = window.open('', '_blank')
    if (!previewWindow) {
      onToast({ tone: 'error', message: 'Il browser ha bloccato l’apertura del PDF di prova.' })
      return
    }

    previewWindow.document.title = 'Preparazione PDF di prova'
    previewWindow.document.body.innerHTML = '<p style="font-family: sans-serif; padding: 24px;">Preparazione PDF di prova…</p>'

    setPreviewDownloading(true)
    try {
      const result = await scaricaAnteprimaQuestionarioAvis(idAvis, layoutRef.current)
      previewWindow.location.href = result.url
      window.setTimeout(() => URL.revokeObjectURL(result.url), 60000)
      onToast({ tone: 'success', message: 'PDF di prova aperto in una nuova scheda.' })
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
          <div className="questionnaire-layout-toolbar">
            <label className="portal-field layout-key-field">
              <span>Nuovo campo</span>
              <input list="questionnaire-field-keys" value={newFieldKey} onChange={(event) => setNewFieldKey(event.target.value)} placeholder="es. donatore.nome" />
              <datalist id="questionnaire-field-keys">
                {fieldSuggestions.map((key) => <option key={key} value={key} />)}
              </datalist>
            </label>

            <button type="button" className="secondary-button" onClick={addLayoutField}>Aggiungi campo</button>
            <button type="button" className="secondary-button" onClick={() => void downloadPreviewPdf()} disabled={previewDownloading || !pdf.presente || !layout.length}>
              {previewDownloading ? 'Preparazione PDF…' : 'Apri PDF di prova'}
            </button>
            <button type="button" className="primary-button" onClick={() => void saveLayout()} disabled={layoutSaving || !layoutDirty}>
              {layoutSaving ? 'Salvataggio…' : layoutDirty ? 'Salva layout' : 'Layout salvato'}
            </button>
          </div>

          {layoutLoading ? (
            <div className="questionnaire-loading">Caricamento layout…</div>
          ) : (
            <>
              <div className="questionnaire-page-nav" aria-label="Pagine del questionario">
                <div className="questionnaire-page-nav-copy">
                  <span className="section-kicker">PAGINA PDF</span>
                  <strong>{pdfPageCount ? `Pagina ${layoutPage} di ${pdfPageCount}` : 'Pagina non disponibile'}</strong>
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

              <div className="questionnaire-layout-workspace">
              <div
                className="pdf-layout-stage"
                ref={stageRef}
                style={{ aspectRatio: pdfPageRatio }}
              >
                {pdfPageLoading ? (
                  <div className="pdf-layout-placeholder">Caricamento pagina {layoutPage}…</div>
                ) : pdfPageBlob ? (
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
                        setSelectedFieldIndex(index)
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
                        {layoutFieldPreview(field.chiave_campo)}
                      </span>
                      <span className="pdf-layout-anchor" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </div>

              <aside className="layout-field-editor">
                {selectedField ? (
                  <>
                    <div className="questionnaire-editor-heading">
                      <div>
                        <span className="section-kicker">CAMPO</span>
                        <h4>{selectedField.chiave_campo}</h4>
                      </div>
                      <button type="button" className="danger-text-button" onClick={() => removeField(selectedFieldIndex)}>
                        Rimuovi
                      </button>
                    </div>

                    <label className="portal-field">
                      <span>Chiave campo</span>
                      <input value={selectedField.chiave_campo} onChange={(event) => updateField(selectedFieldIndex, { chiave_campo: event.target.value })} />
                    </label>

                    <div className="questionnaire-editor-grid">
                      <label className="portal-field">
                        <span>Tipo</span>
                        <select value={selectedField.tipo_campo} onChange={(event) => updateField(selectedFieldIndex, { tipo_campo: event.target.value })}>
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
                        <span><small>Sinistra</small><strong>{(Number(selectedField.x) * 100).toFixed(2)}%</strong></span>
                        <span><small>Alto</small><strong>{(Number(selectedField.y) * 100).toFixed(2)}%</strong></span>
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
