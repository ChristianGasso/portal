import { useEffect, useMemo, useState } from 'react'
import { caricaAvis, creaAvis } from '../services/avisService'

function valueFrom(item, keys, fallback = '') {
  for (const key of keys) {
    const value = item?.[key]
    if (value !== undefined && value !== null && String(value).trim() !== '') return value
  }
  return fallback
}

function avisName(item) {
  return String(valueFrom(item, ['nome', 'denominazione', 'ragione_sociale'], 'AVIS')).trim()
}

function avisCode(item) {
  return String(valueFrom(item, ['codice', 'codice_avis', 'codice_sede'], '')).trim()
}

function avisActive(item) {
  const status = String(valueFrom(item, ['stato'], '')).trim().toLowerCase()
  if (status) return status === 'attivo' || status === 'attiva'
  return Number(valueFrom(item, ['attiva', 'attivo'], 1)) === 1
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

const initialCreateForm = {
  nome: '',
  idAvis: '',
  limiteSpazioGb: '10',
  limiteAccount: '10',
  limiteUploadGiornalieri: '10000',
  adminNome: '',
  adminCognome: '',
  adminEmail: '',
}

export default function AvisPage({ onOpenAvis }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState(initialCreateForm)
  const [creating, setCreating] = useState(false)

  async function loadAvis() {
    setLoading(true)
    try {
      const result = await caricaAvis()
      setItems(result)
      setError('')
    } catch (requestError) {
      setItems([])
      setError(requestError.message || 'Non è stato possibile caricare le AVIS.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAvis()
  }, [])

  const activeCount = useMemo(() => items.filter(avisActive).length, [items])

  function updateCreateField(key, value) {
    setCreateForm((current) => ({ ...current, [key]: value }))
  }

  async function handleCreateAvis(event) {
    event.preventDefault()
    if (creating) return

    const idAvis = Number(createForm.idAvis)
    const storageGb = Number(createForm.limiteSpazioGb)
    const accountLimit = Number(createForm.limiteAccount)
    const uploadLimit = Number(createForm.limiteUploadGiornalieri)

    if (!Number.isInteger(idAvis) || idAvis <= 0) {
      setToast({ tone: 'error', message: 'Inserisci un ID AVIS valido.' })
      return
    }
    if (!createForm.nome.trim()) {
      setToast({ tone: 'error', message: 'Inserisci il nome della AVIS.' })
      return
    }
    if (!Number.isFinite(storageGb) || storageGb < 0 || !Number.isFinite(accountLimit) || accountLimit < 0 || !Number.isFinite(uploadLimit) || uploadLimit < 0) {
      setToast({ tone: 'error', message: 'Controlla i limiti inseriti.' })
      return
    }
    if (!createForm.adminNome.trim() || !createForm.adminEmail.trim()) {
      setToast({ tone: 'error', message: 'Inserisci nome ed email del primo amministratore.' })
      return
    }

    setCreating(true)
    try {
      const result = await creaAvis({
        id_avis: idAvis,
        nome: createForm.nome.trim(),
        limiti: {
          limite_spazio_bytes: Math.round(storageGb * (1024 ** 3)),
          limite_account: Math.round(accountLimit),
          limite_upload_giornalieri: Math.round(uploadLimit),
        },
        admin: {
          nome: createForm.adminNome.trim(),
          cognome: createForm.adminCognome.trim(),
          email: createForm.adminEmail.trim(),
        },
      })

      setShowCreate(false)
      setCreateForm(initialCreateForm)
      await loadAvis()

      const message = result?.email_inviata === false
        ? 'AVIS creata, ma l’email di attivazione dell’amministratore non è stata inviata.'
        : result?.message || 'AVIS creata correttamente.'

      setToast({
        tone: result?.email_inviata === false ? 'error' : 'success',
        message,
      })
    } catch (requestError) {
      setToast({
        tone: 'error',
        message: requestError.message || 'Non è stato possibile creare la AVIS.',
      })
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="page-stack">
      <PortalToast toast={toast} onClose={() => setToast(null)} />

      <section className="page-intro">
        <div>
          <span className="section-kicker">STRUTTURA CENTRALE</span>
          <h2>AVIS e sedi</h2>
          <p>Seleziona una AVIS per gestire servizi, limiti, logo e configurazione del questionario.</p>
        </div>
        <div className="avis-page-actions">
          <button type="button" className="primary-button" onClick={() => setShowCreate(true)}>
            + Nuova AVIS
          </button>
          <div className="avis-summary">
            <strong>{items.length}</strong>
            <span>AVIS registrate</span>
            <small>{activeCount} attive</small>
          </div>
        </div>
      </section>

      {loading ? (
        <section className="panel-card avis-state-card">
          <div className="empty-icon">A</div>
          <h3>Caricamento AVIS…</h3>
          <p>Sto recuperando le sedi configurate nel Portal.</p>
        </section>
      ) : error ? (
        <section className="panel-card avis-state-card is-error">
          <div className="empty-icon">!</div>
          <h3>Non è stato possibile caricare le AVIS</h3>
          <p>{error}</p>
        </section>
      ) : items.length === 0 ? (
        <section className="panel-card avis-state-card">
          <div className="empty-icon">A</div>
          <h3>Nessuna AVIS configurata</h3>
          <p>Quando verrà aggiunta una AVIS comparirà qui e potrà essere amministrata dal Portal.</p>
        </section>
      ) : (
        <section className="avis-grid">
          {items.map((item) => {
            const active = avisActive(item)
            const code = avisCode(item)

            return (
              <button key={item.id} type="button" className="avis-card" onClick={() => onOpenAvis?.(item.id)}>
                <div className="avis-card-top">
                  <div className="avis-card-mark">A</div>
                  <span className={`avis-status ${active ? 'is-active' : 'is-suspended'}`}>
                    {active ? 'Attiva' : 'Sospesa'}
                  </span>
                </div>
                <div>
                  <span className="section-kicker">{code ? `CODICE ${code}` : 'AVIS'}</span>
                  <h3>{avisName(item)}</h3>
                  <p>Apri la gestione amministrativa della sede.</p>
                </div>
                <span className="avis-card-link">Gestisci AVIS →</span>
              </button>
            )
          })}
        </section>
      )}

      {showCreate ? (
        <div className="portal-confirm-backdrop" role="presentation">
          <section className="portal-confirm-card avis-create-modal" role="dialog" aria-modal="true" aria-labelledby="avis-create-title">
            <div className="avis-create-heading">
              <div>
                <span className="section-kicker">NUOVA AVIS</span>
                <h3 id="avis-create-title">Crea nuova AVIS</h3>
                <p>Il database deve essere già stato creato su IONOS e mappato con l’ID AVIS indicato.</p>
              </div>
              <button
                type="button"
                className="text-button"
                onClick={() => setShowCreate(false)}
                disabled={creating}
              >
                Chiudi
              </button>
            </div>

            <form className="avis-create-form" onSubmit={handleCreateAvis}>
              <div className="avis-create-section">
                <div>
                  <span className="section-kicker">DATI AVIS</span>
                  <h4>Informazioni principali</h4>
                </div>
                <div className="portal-form-grid">
                  <label className="portal-field">
                    <span>Nome AVIS</span>
                    <input
                      type="text"
                      value={createForm.nome}
                      onChange={(event) => updateCreateField('nome', event.target.value)}
                      disabled={creating}
                      required
                    />
                  </label>
                  <label className="portal-field">
                    <span>ID AVIS</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={createForm.idAvis}
                      onChange={(event) => updateCreateField('idAvis', event.target.value)}
                      disabled={creating}
                      required
                    />
                    <small>Deve corrispondere al codice usato nella mappatura del database.</small>
                  </label>
                </div>
              </div>

              <div className="avis-create-section">
                <div>
                  <span className="section-kicker">LIMITI</span>
                  <h4>Limiti iniziali</h4>
                </div>
                <div className="portal-form-grid limits">
                  <label className="portal-field">
                    <span>Spazio disponibile (GB)</span>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={createForm.limiteSpazioGb}
                      onChange={(event) => updateCreateField('limiteSpazioGb', event.target.value)}
                      disabled={creating}
                      required
                    />
                  </label>
                  <label className="portal-field">
                    <span>Numero massimo account</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={createForm.limiteAccount}
                      onChange={(event) => updateCreateField('limiteAccount', event.target.value)}
                      disabled={creating}
                      required
                    />
                  </label>
                  <label className="portal-field">
                    <span>Upload giornalieri</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={createForm.limiteUploadGiornalieri}
                      onChange={(event) => updateCreateField('limiteUploadGiornalieri', event.target.value)}
                      disabled={creating}
                      required
                    />
                  </label>
                </div>
              </div>

              <div className="avis-create-section">
                <div>
                  <span className="section-kicker">PRIMO AMMINISTRATORE</span>
                  <h4>Account iniziale</h4>
                  <p>L’amministratore riceverà l’email per scegliere la password e attivare l’account.</p>
                </div>
                <div className="portal-form-grid">
                  <label className="portal-field">
                    <span>Nome</span>
                    <input
                      type="text"
                      value={createForm.adminNome}
                      onChange={(event) => updateCreateField('adminNome', event.target.value)}
                      disabled={creating}
                      required
                    />
                  </label>
                  <label className="portal-field">
                    <span>Cognome</span>
                    <input
                      type="text"
                      value={createForm.adminCognome}
                      onChange={(event) => updateCreateField('adminCognome', event.target.value)}
                      disabled={creating}
                    />
                  </label>
                  <label className="portal-field avis-create-email">
                    <span>Email</span>
                    <input
                      type="email"
                      value={createForm.adminEmail}
                      onChange={(event) => updateCreateField('adminEmail', event.target.value)}
                      disabled={creating}
                      required
                    />
                  </label>
                </div>
              </div>

              <div className="portal-confirm-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowCreate(false)}
                  disabled={creating}
                >
                  Annulla
                </button>
                <button type="submit" className="primary-button" disabled={creating}>
                  {creating ? 'Creazione in corso…' : 'Crea AVIS'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  )
}
