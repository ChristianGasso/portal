export default function AvisPage() {
  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <span className="section-kicker">STRUTTURA CENTRALE</span>
          <h2>AVIS e sedi</h2>
          <p>
            Da qui gestiremo ogni AVIS e tutto ciò che appartiene al suo gestionale, compresi operatori, ruoli, permessi e stato della sede.
          </p>
        </div>
        <button type="button" className="primary-button">Nuova AVIS</button>
      </section>

      <section className="panel-card empty-state-card">
        <div className="empty-icon">A</div>
        <h3>Gestione AVIS pronta per i dati reali</h3>
        <p>
          Il prossimo collegamento backend caricherà l’elenco delle AVIS. Aprendo una singola AVIS potremo gestire i suoi operatori, ruoli, permessi, stato e configurazioni del gestionale.
        </p>
      </section>
    </div>
  )
}
