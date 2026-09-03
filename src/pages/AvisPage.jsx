export default function AvisPage() {
  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <span className="section-kicker">STRUTTURA CENTRALE</span>
          <h2>AVIS e sedi</h2>
          <p>Da qui gestiremo sedi, stato della piattaforma e link pubblici di registrazione.</p>
        </div>
        <button type="button" className="primary-button">Nuova AVIS</button>
      </section>

      <section className="panel-card empty-state-card">
        <div className="empty-icon">A</div>
        <h3>Gestione AVIS pronta per i dati reali</h3>
        <p>
          Il prossimo collegamento backend caricherà l’elenco delle AVIS e permetterà di gestire il token pubblico di registrazione per ogni sede.
        </p>
      </section>
    </div>
  )
}
