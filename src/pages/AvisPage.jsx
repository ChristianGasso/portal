import { useEffect, useMemo, useState } from 'react'
import { caricaAvis } from '../services/avisService'

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

export default function AvisPage({ onOpenAvis }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    caricaAvis()
      .then((result) => {
        if (!active) return
        setItems(result)
        setError('')
      })
      .catch((requestError) => {
        if (!active) return
        setItems([])
        setError(requestError.message || 'Non è stato possibile caricare le AVIS.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const activeCount = useMemo(() => items.filter(avisActive).length, [items])

  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <span className="section-kicker">STRUTTURA CENTRALE</span>
          <h2>AVIS e sedi</h2>
          <p>Seleziona una AVIS per gestire servizi, limiti, logo e configurazione del questionario.</p>
        </div>
        <div className="avis-summary">
          <strong>{items.length}</strong>
          <span>AVIS registrate</span>
          <small>{activeCount} attive</small>
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
    </div>
  )
}
