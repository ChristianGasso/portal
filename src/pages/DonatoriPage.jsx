export default function DonatoriPage() {
  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <span className="section-kicker">APP DONATORI</span>
          <h2>Configurazione donatori</h2>
          <p>Controlla registrazione, link AVIS e impostazioni dell’esperienza lato donatore.</p>
        </div>
      </section>

      <section className="settings-grid">
        <article className="panel-card feature-card">
          <span className="feature-badge">REGISTRAZIONE</span>
          <h3>Token pubblici AVIS</h3>
          <p>Ogni AVIS avrà un token stabile, casuale e rigenerabile per il proprio link di registrazione.</p>
        </article>
        <article className="panel-card feature-card">
          <span className="feature-badge">ACCESSO</span>
          <h3>Associazione automatica</h3>
          <p>Il donatore non dovrà più scegliere manualmente la sede durante la registrazione.</p>
        </article>
        <article className="panel-card feature-card">
          <span className="feature-badge">CONTROLLO</span>
          <h3>Stato app per sede</h3>
          <p>Potremo attivare o sospendere le funzionalità dell’app donatori per ogni AVIS.</p>
        </article>
      </section>
    </div>
  )
}
