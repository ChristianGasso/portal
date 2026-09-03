export default function ConfigurazioniPage() {
  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <span className="section-kicker">PIATTAFORMA</span>
          <h2>Configurazioni</h2>
          <p>Impostazioni globali del Portal e parametri amministrativi della piattaforma.</p>
        </div>
      </section>

      <section className="settings-grid">
        <article className="panel-card feature-card">
          <span className="feature-badge">SICUREZZA</span>
          <h3>Accesso amministrativo</h3>
          <p>L’accesso sarà consentito esclusivamente agli account con ruolo admin verificato lato backend.</p>
        </article>
        <article className="panel-card feature-card">
          <span className="feature-badge">PIATTAFORMA</span>
          <h3>Parametri globali</h3>
          <p>Qui raccoglieremo le configurazioni condivise tra gestionale, operatori e app donatori.</p>
        </article>
      </section>
    </div>
  )
}
