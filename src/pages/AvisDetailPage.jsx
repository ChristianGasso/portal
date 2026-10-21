import { useEffect, useMemo, useRef, useState } from 'react'
import QuestionarioManager from '../components/questionario/QuestionarioManager'
import AvisQueryConsole from '../components/avis/AvisQueryConsole'
import {
  aggiornaGeneraleAvis,
  aggiornaLimitiAvis,
  aggiornaServiziAvis,
  caricaDettaglioAvis,
  gestisciLogoAvis,
  eseguiNotificheAvis,
} from '../services/avisService'

const tabs = [
  { key: 'generale', label: 'Generale' },
  { key: 'servizi', label: 'Servizi' },
  { key: 'invio-notifiche', label: 'Invio notifiche' },
  { key: 'limiti', label: 'Limiti' },
  { key: 'logo', label: 'Logo' },
  { key: 'questionario', label: 'Questionario' },
  { key: 'query', label: 'Query DB' },
]

const hiddenLimitKeys = new Set(['id', 'id_avis', 'created_at', 'updated_at'])

function firstValue(source, keys, fallback = '') {
  for (const key of keys) {
    const value = source?.[key]
    if (value !== undefined && value !== null && String(value).trim() !== '') return value
  }
  return fallback
}

function flag(source, keys, fallback = false) {
  const value = firstValue(source, keys, fallback ? 1 : 0)
  if (typeof value === 'boolean') return value
  const normalized = String(value).trim().toLowerCase()
  return ['1', 'true', 'si', 'sì', 'attivo', 'attiva'].includes(normalized)
}

function isStorageLimit(key) {
  const normalized = String(key).toLowerCase()
  return normalized.includes('spazio') || normalized.includes('storage')
}

function storageValueToGb(key, value) {
  if (value === '' || value === null || value === undefined || !isStorageLimit(key)) return value

  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return value

  const normalized = String(key).toLowerCase()
  if (normalized.includes('byte')) return numeric / (1024 ** 3)
  if (normalized.endsWith('_mb') || normalized.includes('megabyte')) return numeric / 1024
  return numeric
}

function storageValueFromGb(key, value) {
  if (value === '' || value === null || value === undefined || !isStorageLimit(key)) return value

  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return value

  const normalized = String(key).toLowerCase()
  if (normalized.includes('byte')) return Math.round(numeric * (1024 ** 3))
  if (normalized.endsWith('_mb') || normalized.includes('megabyte')) return numeric * 1024
  return numeric
}

function readableLabel(key) {
  const normalizedKey = isStorageLimit(key)
    ? key
        .replace(/_bytes?$/i, '')
        .replace(/_mb$/i, '')
        .replace(/_gb$/i, '')
    : key

  const label = normalizedKey
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())

  return isStorageLimit(key) ? `${label} (GB)` : label
}

function PortalToast({ toast, onClose }) {
  if (!toast?.message) return null

  return (
    <button
      type="button"
      className={`portal-toast ${toast.tone === 'success' ? 'is-success' : 'is-error'}`}
      onClick={onClose}
      aria-label="Chiudi messaggio"
    >
      <strong>{toast.tone === 'success' ? 'Operazione completata' : 'Attenzione'}</strong>
      <span>{toast.message}</span>
    </button>
  )
}

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

export default function AvisDetailPage({ idAvis, onBack }) {
  const currentAvisRef = useRef(idAvis)
  const [detail, setDetail] = useState(null)
  const [activeTab, setActiveTab] = useState('generale')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState(null)
  const [generalForm, setGeneralForm] = useState({ nome: '', attiva: true })
  const [servicesForm, setServicesForm] = useState({
    gestionale_attivo: false,
    app_donatori_attiva: false,
    registrazione_attiva: false,
  })
  const [notificaDaConfermare, setNotificaDaConfermare] = useState(null)
  const [notificaInEsecuzione, setNotificaInEsecuzione] = useState('')
  const [esitiNotifiche, setEsitiNotifiche] = useState({})
  const [limitsForm, setLimitsForm] = useState({})
  const [logo, setLogo] = useState({ presente: false, url: null, data_url: null })
  const [logoLoading, setLogoLoading] = useState(false)
  const [logoSaving, setLogoSaving] = useState(false)
  const [logoDeleteConfirm, setLogoDeleteConfirm] = useState(false)

  async function loadDetail() {
    setLoading(true)
    try {
      const result = await caricaDettaglioAvis(idAvis)
      setDetail(result)
      setError('')

      const avis = result?.avis || {}
      const configurazione = result?.configurazione || {}
      const limiti = result?.limiti || {}

      const status = String(firstValue(avis, ['stato'], '')).trim().toLowerCase()
      const active = status
        ? status === 'attivo' || status === 'attiva'
        : flag(avis, ['attiva', 'attivo'], true)

      setGeneralForm({
        nome: String(firstValue(avis, ['nome', 'denominazione', 'ragione_sociale'], '')).trim(),
        attiva: active,
      })

      setServicesForm({
        gestionale_attivo: flag(configurazione, ['gestionale_attivo', 'gestionale', 'attivo_gestionale']),
        app_donatori_attiva: flag(configurazione, ['app_donatori_attiva', 'app_donatori', 'donatori_attivo']),
        registrazione_attiva: flag(configurazione, ['registrazione_attiva', 'registrazioni_attive', 'registrazione_donatori_attiva']),
      })

      setLimitsForm(
        Object.fromEntries(
          Object.entries(limiti)
            .filter(([key]) => !hiddenLimitKeys.has(key))
            .map(([key, value]) => [key, storageValueToGb(key, value)]),
        ),
      )
    } catch (requestError) {
      setDetail(null)
      setError(requestError.message || 'Non è stato possibile caricare questa AVIS.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    currentAvisRef.current = idAvis
    setNotificaDaConfermare(null)
    setEsitiNotifiche({})
    setNotificaInEsecuzione('')
    void loadDetail()
  }, [idAvis])

  useEffect(() => {
    if (activeTab === 'logo') {
      void loadLogo()
    }

  }, [activeTab, idAvis])

  useEffect(() => {
    document.body.classList.toggle('portal-questionario-active', activeTab === 'questionario')

    return () => {
      document.body.classList.remove('portal-questionario-active')
    }
  }, [activeTab])

  const avis = detail?.avis || {}
  const database = detail?.database || {}
  const name = String(firstValue(avis, ['nome', 'denominazione', 'ragione_sociale'], 'AVIS')).trim()
  const code = String(firstValue(avis, ['codice', 'codice_avis', 'codice_sede'], '')).trim()
  const avisEnabled = useMemo(() => generalForm.attiva, [generalForm.attiva])


  async function loadLogo() {
    setLogoLoading(true)
    try {
      const result = await gestisciLogoAvis(idAvis, 'load')
      setLogo(result?.logo || { presente: false, url: null, data_url: null })
    } catch (requestError) {
      setToast({ tone: 'error', message: requestError.message || 'Non è stato possibile caricare il logo AVIS.' })
    } finally {
      setLogoLoading(false)
    }
  }

  async function saveLogoFile(file) {
    if (!file || logoSaving) return

    if (file.size > 5 * 1024 * 1024) {
      setToast({ tone: 'error', message: 'Il logo non può superare 5 MB.' })
      return
    }

    setLogoSaving(true)

    try {
      const encoded = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = () => reject(new Error('Non è stato possibile leggere il file selezionato.'))
        reader.readAsDataURL(file)
      })

      const result = await gestisciLogoAvis(idAvis, 'save', encoded)
      setLogo(result?.logo || { presente: false, url: null, data_url: null })
      setLogoDeleteConfirm(false)
      setToast({ tone: 'success', message: result.message || 'Logo AVIS salvato correttamente.' })
    } catch (requestError) {
      setToast({ tone: 'error', message: requestError.message || 'Non è stato possibile salvare il logo AVIS.' })
    } finally {
      setLogoSaving(false)
    }
  }

  async function deleteLogo() {
    if (logoSaving) return
    setLogoSaving(true)

    try {
      const result = await gestisciLogoAvis(idAvis, 'delete')
      setLogo(result?.logo || { presente: false, url: null, data_url: null })
      setLogoDeleteConfirm(false)
      setToast({ tone: 'success', message: result.message || 'Logo AVIS rimosso correttamente.' })
    } catch (requestError) {
      setToast({ tone: 'error', message: requestError.message || 'Non è stato possibile rimuovere il logo AVIS.' })
    } finally {
      setLogoSaving(false)
    }
  }

  async function saveGeneral() {
    if (!generalForm.nome.trim() || saving) return
    setSaving(true)
    try {
      const result = await aggiornaGeneraleAvis(idAvis, {
        nome: generalForm.nome.trim(),
        attiva: generalForm.attiva,
      })
      await loadDetail()
      setToast({ tone: 'success', message: result.message || 'Dati AVIS aggiornati correttamente.' })
    } catch (requestError) {
      setToast({ tone: 'error', message: requestError.message || 'Non è stato possibile aggiornare i dati della AVIS.' })
    } finally {
      setSaving(false)
    }
  }

  async function saveServices() {
    if (saving) return
    setSaving(true)
    try {
      const result = await aggiornaServiziAvis(idAvis, servicesForm)
      await loadDetail()
      setToast({ tone: 'success', message: result.message || 'Servizi AVIS aggiornati correttamente.' })
    } catch (requestError) {
      setToast({ tone: 'error', message: requestError.message || 'Non è stato possibile aggiornare i servizi.' })
    } finally {
      setSaving(false)
    }
  }

  async function avviaNotifica(tipo) {
    if (!notificaDaConfermare || notificaInEsecuzione) return
    const avisInvio = idAvis
    setNotificaDaConfermare(null)
    setNotificaInEsecuzione(tipo)
    setEsitiNotifiche((current) => ({ ...current, [tipo]: null }))
    try {
      const result = await eseguiNotificheAvis(avisInvio, tipo)
      if (currentAvisRef.current !== avisInvio) return
      setEsitiNotifiche((current) => ({ ...current, [tipo]: result?.conteggi ?? {} }))
      setToast({ tone: 'success', message: result.message || 'Procedura notifiche completata.' })
    } catch (requestError) {
      if (currentAvisRef.current === avisInvio) {
        setToast({ tone: 'error', message: requestError.message || 'La procedura di invio non è riuscita.' })
      }
    } finally {
      if (currentAvisRef.current === avisInvio) setNotificaInEsecuzione('')
    }
  }

  async function saveLimits() {
    if (saving) return
    setSaving(true)
    try {
      const payload = Object.fromEntries(
        Object.entries(limitsForm).map(([key, value]) => [key, storageValueFromGb(key, value)]),
      )
      const result = await aggiornaLimitiAvis(idAvis, payload)
      await loadDetail()
      setToast({ tone: 'success', message: result.message || 'Limiti AVIS aggiornati correttamente.' })
    } catch (requestError) {
      setToast({ tone: 'error', message: requestError.message || 'Non è stato possibile aggiornare i limiti.' })
    } finally {
      setSaving(false)
    }
  }

  if (loading && !detail) {
    return (
      <div className="page-stack">
        <button type="button" className="text-button" onClick={onBack}>← Torna alle AVIS</button>
        <section className="panel-card avis-state-card"><h3>Caricamento AVIS…</h3></section>
      </div>
    )
  }

  if (error || !detail?.avis) {
    return (
      <div className="page-stack">
        <button type="button" className="text-button" onClick={onBack}>← Torna alle AVIS</button>
        <section className="panel-card avis-state-card is-error">
          <h3>AVIS non disponibile</h3>
          <p>{error || 'La AVIS richiesta non è disponibile.'}</p>
        </section>
      </div>
    )
  }

  return (
    <div className="page-stack">
      <PortalToast toast={toast} onClose={() => setToast(null)} />
      <button type="button" className="text-button avis-back" onClick={onBack}>← Torna alle AVIS</button>

      <section className="avis-detail-hero">
        <div>
          <span className="section-kicker">{code ? `CODICE ${code}` : 'AVIS'}</span>
          <h2>{name}</h2>
          <p>Gestione amministrativa centrale della sede e dei servizi collegati.</p>
        </div>
        <span className={`avis-status large ${avisEnabled ? 'is-active' : 'is-suspended'}`}>
          {avisEnabled ? 'AVIS attiva' : 'AVIS sospesa'}
        </span>
      </section>

      <nav className="avis-tabs" aria-label="Sezioni AVIS">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={activeTab === tab.key ? 'is-active' : ''}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'generale' ? (
        <section className="panel-card avis-detail-panel">
          <div className="portal-form-heading">
            <div>
              <span className="section-kicker">DATI AVIS</span>
              <h3>Informazioni generali</h3>
              <p>Modifica la denominazione e lo stato amministrativo della AVIS.</p>
            </div>
            <button type="button" className="primary-button" onClick={() => void saveGeneral()} disabled={saving}>
              {saving ? 'Salvataggio…' : 'Salva modifiche'}
            </button>
          </div>

          <div className="portal-form-grid">
            <label className="portal-field">
              <span>Denominazione AVIS</span>
              <input
                type="text"
                value={generalForm.nome}
                onChange={(event) => setGeneralForm((current) => ({ ...current, nome: event.target.value }))}
                disabled={saving}
              />
            </label>
            <label className="portal-field">
              <span>Codice AVIS</span>
              <input type="text" value={code} disabled />
              <small>Il codice identificativo non viene modificato da questa sezione.</small>
            </label>
          </div>

          <ToggleCard
            label="AVIS attiva"
            description="Se disattivata, la sede risulta sospesa a livello centrale."
            checked={generalForm.attiva}
            onChange={(value) => setGeneralForm((current) => ({ ...current, attiva: value }))}
            disabled={saving}
          />
        </section>
      ) : null}

      {activeTab === 'servizi' ? (
        <section className="panel-card avis-detail-panel">
          <div className="portal-form-heading">
            <div>
              <span className="section-kicker">SERVIZI</span>
              <h3>Disponibilità applicazioni</h3>
              <p>Abilita o sospendi i servizi messi a disposizione della AVIS.</p>
            </div>
            <button type="button" className="primary-button" onClick={() => void saveServices()} disabled={saving}>
              {saving ? 'Salvataggio…' : 'Salva servizi'}
            </button>
          </div>

          <div className="portal-toggle-grid">
            <ToggleCard
              label="Gestionale"
              description="Consente agli operatori della AVIS di utilizzare il gestionale."
              checked={servicesForm.gestionale_attivo}
              onChange={(value) => setServicesForm((current) => ({ ...current, gestionale_attivo: value }))}
              disabled={saving}
            />
            <ToggleCard
              label="App Donatori"
              description="Rende disponibile l'app destinata ai donatori della AVIS."
              checked={servicesForm.app_donatori_attiva}
              onChange={(value) => setServicesForm((current) => ({ ...current, app_donatori_attiva: value }))}
              disabled={saving}
            />
            <ToggleCard
              label="Registrazione donatori"
              description="Permette nuove registrazioni attraverso il collegamento pubblico della AVIS."
              checked={servicesForm.registrazione_attiva}
              onChange={(value) => setServicesForm((current) => ({ ...current, registrazione_attiva: value }))}
              disabled={saving}
            />
          </div>
        </section>
      ) : null}

      {activeTab === 'invio-notifiche' ? (
        <section className="panel-card avis-detail-panel">
          <div className="portal-form-heading">
            <div>
              <span className="section-kicker">INVIO MANUALE</span>
              <h3>Notifiche automatiche</h3>
              <p>Avvia subito un controllo e l'eventuale invio esclusivamente per {name}. Le programmazioni IONOS non cambiano.</p>
            </div>
          </div>
          <div className="avis-notification-list">
            {[
              {
                tipo: 'nuove_raccolte',
                titolo: 'Notifiche nuove raccolte',
                descrizione: 'Elabora gli avvisi in attesa per le nuove raccolte della AVIS selezionata.',
              },
              {
                tipo: 'scadenza_idoneita',
                titolo: 'Scadenza idoneità',
                descrizione: 'Controlla le scadenze di idoneità e invia le notifiche dovute ai donatori della AVIS selezionata.',
              },
            ].map((opzione) => (
              <div className="avis-notification-item" key={opzione.tipo}>
                <div className="avis-notification-details">
                  <strong>{opzione.titolo}</strong>
                  <span>{opzione.descrizione}</span>
                  {esitiNotifiche[opzione.tipo] ? (
                    <div className="avis-notification-result" aria-live="polite">
                      <strong>Ultima esecuzione manuale completata</strong>
                      <span>
                        {opzione.tipo === 'nuove_raccolte'
                          ? `Eventi elaborati: ${esitiNotifiche[opzione.tipo].eventi_letti ?? 0} · Notifiche accettate: ${esitiNotifiche[opzione.tipo].push_accettate ?? 0} · Errori: ${esitiNotifiche[opzione.tipo].errori_push ?? 0}`
                          : `Donatori valutati: ${esitiNotifiche[opzione.tipo].valutati ?? 0} · Notifiche inviate: ${esitiNotifiche[opzione.tipo].inviati ?? 0} · Errori: ${esitiNotifiche[opzione.tipo].errori_invio ?? 0}`}
                      </span>
                    </div>
                  ) : null}
                </div>
                <button
                  className="primary-button"
                  type="button"
                  disabled={Boolean(notificaInEsecuzione)}
                  onClick={() => setNotificaDaConfermare(opzione)}
                >
                  {notificaInEsecuzione === opzione.tipo ? 'Invio in corso…' : 'Esegui ora'}
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {notificaDaConfermare ? (
        <div className="portal-confirm-backdrop">
          <div className="portal-confirm-card" role="dialog" aria-modal="true" aria-labelledby="avis-notification-dialog-title">
            <span className="section-kicker">CONFERMA INVIO</span>
            <h3 id="avis-notification-dialog-title">Avviare {notificaDaConfermare.titolo.toLowerCase()}?</h3>
            <p>
              La procedura invierà le notifiche dovute soltanto ai donatori di <strong>{name}</strong>
              {code ? ` (codice ${code})` : ''}. Non verranno coinvolte le altre AVIS.
            </p>
            <div className="portal-confirm-actions">
              <button type="button" className="secondary-button" onClick={() => setNotificaDaConfermare(null)}>Annulla</button>
              <button type="button" className="primary-button" onClick={() => void avviaNotifica(notificaDaConfermare.tipo)}>
                Conferma ed esegui
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === 'limiti' ? (
        <section className="panel-card avis-detail-panel">
          <div className="portal-form-heading">
            <div>
              <span className="section-kicker">LIMITI</span>
              <h3>Limiti assegnati</h3>
              <p>Imposta i valori massimi previsti per questa AVIS.</p>
            </div>
            {Object.keys(limitsForm).length > 0 ? (
              <button type="button" className="primary-button" onClick={() => void saveLimits()} disabled={saving}>
                {saving ? 'Salvataggio…' : 'Salva limiti'}
              </button>
            ) : null}
          </div>

          {Object.keys(limitsForm).length > 0 ? (
            <div className="portal-form-grid limits">
              {Object.entries(limitsForm).map(([key, value]) => (
                <label className="portal-field" key={key}>
                  <span>{readableLabel(key)}</span>
                  <input
                    type="number"
                    min="0"
                    step={isStorageLimit(key) ? '0.1' : 'any'}
                    value={value ?? ''}
                    onChange={(event) => setLimitsForm((current) => ({ ...current, [key]: event.target.value }))}
                    disabled={saving}
                  />
                </label>
              ))}
            </div>
          ) : (
            <p className="muted-copy">Nessun limite configurato per questa AVIS.</p>
          )}
        </section>
      ) : null}

      {activeTab === 'logo' ? (
        <section className="panel-card avis-detail-panel">
          <div className="portal-form-heading">
            <div>
              <span className="section-kicker">IDENTITÀ VISIVA</span>
              <h3>Logo AVIS</h3>
              <p>Visualizza, sostituisci o rimuovi il logo pubblico associato a questa AVIS.</p>
            </div>
          </div>

          <div className="avis-logo-layout">
            <div className="avis-logo-preview">
              {logoLoading ? (
                <span>Caricamento logo…</span>
              ) : logo?.presente && (logo.data_url || logo.url) ? (
                <img src={logo.data_url || logo.url} alt={`Logo ${name}`} />
              ) : (
                <div className="avis-logo-empty">
                  <strong>Nessun logo presente</strong>
                  <span>Carica un file JPEG, PNG o WebP.</span>
                </div>
              )}
            </div>

            <div className="avis-logo-actions">
              <div>
                <strong>{logo?.presente ? 'Logo attuale' : 'Aggiungi logo'}</strong>
                <p>Dimensione massima 5 MB. Il file viene salvato in formato WebP.</p>
              </div>

              <label className="secondary-button avis-logo-upload">
                {logoSaving ? 'Salvataggio…' : logo?.presente ? 'Sostituisci logo' : 'Carica logo'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={logoSaving}
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) void saveLogoFile(file)
                    event.target.value = ''
                  }}
                />
              </label>

              {logo?.presente ? (
                logoDeleteConfirm ? (
                  <div className="avis-logo-confirm">
                    <span>Vuoi davvero rimuovere il logo?</span>
                    <div>
                      <button type="button" className="danger-button" onClick={() => void deleteLogo()} disabled={logoSaving}>
                        {logoSaving ? 'Rimozione…' : 'Sì, rimuovi'}
                      </button>
                      <button type="button" className="text-button" onClick={() => setLogoDeleteConfirm(false)} disabled={logoSaving}>
                        Annulla
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="danger-text-button" onClick={() => setLogoDeleteConfirm(true)} disabled={logoSaving}>
                    Rimuovi logo
                  </button>
                )
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === 'questionario' ? (
        <QuestionarioManager idAvis={idAvis} onToast={setToast} />
      ) : null}

      {activeTab === 'query' ? (
        <AvisQueryConsole idAvis={idAvis} onToast={setToast} />
      ) : null}

      {activeTab !== 'questionario' && activeTab !== 'query' ? (
        <section className="panel-card avis-database-note">
          <span className="section-kicker">COLLEGAMENTO OPERATIVO</span>
          <strong>{Object.keys(database).length > 0 ? 'Database AVIS associato' : 'Configurazione database da verificare'}</strong>
        </section>
      ) : null}
    </div>
  )
}
