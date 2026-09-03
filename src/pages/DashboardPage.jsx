const stats = [
  { label: 'AVIS registrate', value: '—', note: 'Dati in collegamento' },
  { label: 'Operatori attivi', value: '—', note: 'Dati in collegamento' },
  { label: 'Token registrazione', value: '—', note: 'Dati in collegamento' },
  { label: 'App donatori attive', value: '—', note: 'Dati in collegamento' },
]

export default function DashboardPage({ onNavigate }) {
  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <span className="section-kicker">AMMINISTRAZIONE CENTRALE</span>
          <h2>Controllo completo della piattaforma</h2>
          <p>
            Gestisci AVIS, operatori e configurazioni dell’app donatori da un unico punto.
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
              <span>Sedi, stato e token di registrazione</span>
            </button>
            <button type="button" onClick={() => onNavigate('operatori')}>
              <strong>Operatori</strong>
              <span>Account, ruoli e permessi</span>
            </button>
            <button type="button" onClick={() => onNavigate('donatori')}>
              <strong>App donatori</strong>
              <span>Configurazioni e accesso dei donatori</span>
            </button>
          </div>
        </article>

        <article className="panel-card system-card">
          <span className="section-kicker">STATO PORTAL</span>
          <h3>Ambiente pronto</h3>
          <p>
            Frontend, build automatica e deploy IONOS sono configurati. Il prossimo passaggio è collegare autenticazione e dati reali.
          </p>
          <div className="system-status"><span /> Deploy automatico attivo</div>
        </article>
      </section>
    </div>
  )
}
