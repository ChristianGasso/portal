import { useEffect, useMemo, useState } from 'react'
import { caricaDettaglioAvis } from '../services/avisService'

const tabs = [
  { key: 'generale', label: 'Generale' },
  { key: 'servizi', label: 'Servizi' },
  { key: 'limiti', label: 'Limiti' },
  { key: 'logo', label: 'Logo' },
  { key: 'questionario', label: 'Questionario' },
]

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

function DetailRow({ label, value }) {
  return (
    <div className="avis-detail-row">
      <span>{label}</span>
      <strong>{value || '—'}</strong>
    </div>
  )
}

function ServiceStatus({ label, enabled }) {
  return (
    <article className="service-status-card">
      <div>
        <span>{label}</span>
        <strong>{enabled ? 'Attivo' : 'Disattivato'}</strong>
      </div>
      <span className={`service-indicator ${enabled ? 'is-on' : 'is-off'}`}>{enabled ? 'ON' : 'OFF'}</span>
    </article>
  )
}

export default function AvisDetailPage({ idAvis, onBack }) {
  const [detail, setDetail] = useState(null)
  const [activeTab, setActiveTab] = useState('generale')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)

    caricaDettaglioAvis(idAvis)
      .then((result) => {
        if (!active) return
        setDetail(result)
        setError('')
      })
      .catch((requestError) => {
        if (!active) return
        setDetail(null)
        setError(requestError.message || 'Non è stato possibile caricare questa AVIS.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [idAvis])

  const avis = detail?.avis || {}
  const configurazione = detail?.configurazione || {}
  const limiti = detail?.limiti || {}
  const database = detail?.database || {}

  const name = String(firstValue(avis, ['nome', 'denominazione', 'ragione_sociale'], 'AVIS')).trim()
  const code = String(firstValue(avis, ['codice', 'codice_avis', 'codice_sede'], '')).trim()
  const avisEnabled = useMemo(() => {
    const status = String(firstValue(avis, ['stato'], '')).trim().toLowerCase()
    if (status) return status === 'attivo' || status === 'attiva'
    return flag(avis, ['attiva', 'attivo'], true)
  }, [avis])

  if (loading) {
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
          <div className="panel-heading">
            <span className="section-kicker">DATI AVIS</span>
            <h3>Informazioni generali</h3>
          </div>
          <div className="avis-detail-list">
            <DetailRow label="Denominazione" value={name} />
            <DetailRow label="Codice AVIS" value={code} />
            <DetailRow label="Stato" value={avisEnabled ? 'Attiva' : 'Sospesa'} />
            <DetailRow label="Identificativo Portal" value={String(avis.id || '')} />
          </div>
        </section>
      ) : null}

      {activeTab === 'servizi' ? (
        <section className="panel-card avis-detail-panel">
          <div className="panel-heading">
            <span className="section-kicker">SERVIZI</span>
            <h3>Disponibilità applicazioni</h3>
          </div>
          <div className="service-status-grid">
            <ServiceStatus label="Gestionale" enabled={flag(configurazione, ['gestionale_attivo', 'gestionale', 'attivo_gestionale'])} />
            <ServiceStatus label="App donatori" enabled={flag(configurazione, ['app_donatori_attiva', 'app_donatori', 'donatori_attivo'])} />
            <ServiceStatus label="Registrazione donatori" enabled={flag(configurazione, ['registrazione_attiva', 'registrazioni_attive', 'registrazione_donatori_attiva'])} />
          </div>
        </section>
      ) : null}

      {activeTab === 'limiti' ? (
        <section className="panel-card avis-detail-panel">
          <div className="panel-heading">
            <span className="section-kicker">LIMITI</span>
            <h3>Limiti assegnati</h3>
          </div>
          <div className="avis-detail-list">
            {Object.keys(limiti).length > 0 ? Object.entries(limiti)
              .filter(([key]) => !['id', 'id_avis', 'created_at', 'updated_at'].includes(key))
              .map(([key, value]) => <DetailRow key={key} label={key.replaceAll('_', ' ')} value={String(value ?? '—')} />)
              : <p className="muted-copy">Nessun limite configurato per questa AVIS.</p>}
          </div>
        </section>
      ) : null}

      {activeTab === 'logo' ? (
        <section className="panel-card avis-detail-panel">
          <div className="panel-heading">
            <span className="section-kicker">IDENTITÀ VISIVA</span>
            <h3>Logo AVIS</h3>
          </div>
          <p className="muted-copy">La gestione del logo sarà collegata alla cartella media pubblica della AVIS nel prossimo passaggio.</p>
        </section>
      ) : null}

      {activeTab === 'questionario' ? (
        <section className="panel-card avis-detail-panel">
          <div className="panel-heading">
            <span className="section-kicker">QUESTIONARIO</span>
            <h3>Configurazione questionario</h3>
          </div>
          <p className="muted-copy">Qui collegheremo le domande configurabili presenti nel database operativo della AVIS e, successivamente, il PDF base e l’editor di stampa.</p>
        </section>
      ) : null}

      <section className="panel-card avis-database-note">
        <span className="section-kicker">COLLEGAMENTO OPERATIVO</span>
        <strong>{Object.keys(database).length > 0 ? 'Database AVIS associato' : 'Configurazione database da verificare'}</strong>
      </section>
    </div>
  )
}
