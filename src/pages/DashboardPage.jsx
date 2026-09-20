import { useState } from 'react'
import { aggiornaGestionaleProduction } from '../services/deployService'

const stats = [
  { label: 'AVIS registrate', value: '—', note: 'Dati in collegamento' },
  { label: 'Operatori collegati', value: '—', note: 'Gestiti nelle AVIS' },
  { label: 'Token registrazione', value: '—', note: 'Dati in collegamento' },
  { label: 'App donatori attive', value: '—', note: 'Dati in collegamento' },
]

export default function DashboardPage({ onNavigate }) {
  const [deployConfirmOpen, setDeployConfirmOpen] = useState(false)
  const [deploying, setDeploying] = useState(false)
  const [toast, setToast] = useState(null)

  async function confirmProductionDeploy() {
    if (deploying) return

    setDeploying(true)
    setDeployConfirmOpen(false)

    try {
      const result = await aggiornaGestionaleProduction()
      setToast({
        tone: 'success',
        title: result.updated ? 'Produzione aggiornata' : 'Nessun aggiornamento necessario',
        message: result.message || 'Operazione completata.',
      })
    } catch (error) {
      setToast({
        tone: 'error',
        title: 'Aggiornamento non completato',
        message: error instanceof Error ? error.message : 'Non è stato possibile aggiornare il Gestionale in produzione.',
      })
    } finally {
      setDeploying(false)
      window.setTimeout(() => setToast(null), 5000)
    }
  }

  return (
    <div className="page-stack">
      {toast ? (
        <button
          type="button"
          className={`portal-toast is-${toast.tone}`}
          onClick={() => setToast(null)}
        >
          <strong>{toast.title}</strong>
          <span>{toast.message}</span>
        </button>
      ) : null}

      <section className="hero-panel">
        <div>
          <span className="section-kicker">AMMINISTRAZIONE CENTRALE</span>
          <h2>Gestione centrale di AVIS e app donatori</h2>
          <p>
            Amministra le AVIS, i relativi operatori e le configurazioni dell’app donatori da un unico punto.
          </p>
        </div>
        <button type="button" className="primary-button" onClick={() => onNavigate('avis')}>
          Gestisci AVIS
        </button>
      </section>

      <section className="stats-grid">
        {stats.map((stat) => (
          <article className="stat-card" key={stat.label}>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
            <small>{stat.note}</small>
          </article>
        ))}
      </section>

      <section className="dashboard-grid">
        <article className="panel-card">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">ACCESSI RAPIDI</span>
              <h3>Gestione piattaforma</h3>
            </div>
          </div>
          <div className="quick-actions">
            <button type="button" onClick={() => onNavigate('avis')}>
              <strong>AVIS</strong>
              <span>Sedi, operatori, stato e configurazioni del gestionale</span>
            </button>
            <button type="button" onClick={() => onNavigate('donatori')}>
              <strong>App donatori</strong>
              <span>Token di registrazione, accesso e configurazioni per AVIS</span>
            </button>
          </div>
        </article>

        <article className="panel-card system-card">
          <span className="section-kicker">STATO PORTAL</span>
          <h3>Ambiente pronto</h3>
          <p>
            Frontend, build automatica e deploy IONOS sono configurati.
          </p>
          <div className="system-status"><span /> Deploy automatico attivo</div>

          <div className="production-deploy-card">
            <strong>Gestionale produzione</strong>
            <p>Porta le modifiche presenti su main nel branch production.</p>
            <button
              type="button"
              className="production-deploy-button"
              disabled={deploying}
              onClick={() => setDeployConfirmOpen(true)}
            >
              {deploying ? 'Aggiornamento in corso…' : 'Aggiorna produzione'}
            </button>
          </div>
        </article>
      </section>

      {deployConfirmOpen ? (
        <div className="portal-confirm-backdrop" role="presentation" onMouseDown={() => setDeployConfirmOpen(false)}>
          <section
            className="portal-confirm-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="deploy-confirm-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <span className="section-kicker">AGGIORNAMENTO PRODUZIONE</span>
            <h3 id="deploy-confirm-title">Portare main in produzione?</h3>
            <p>
              Le modifiche presenti su <strong>main</strong> verranno portate nel branch <strong>production</strong> del Gestionale.
            </p>
            <div className="portal-confirm-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setDeployConfirmOpen(false)}
              >
                Annulla
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => void confirmProductionDeploy()}
              >
                Aggiorna produzione
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}
