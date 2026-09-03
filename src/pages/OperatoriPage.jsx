export default function OperatoriPage() {
  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <span className="section-kicker">GESTIONE ACCESSI</span>
          <h2>Operatori</h2>
          <p>Gestione centralizzata di account, ruoli, permessi e stato degli operatori.</p>
        </div>
        <button type="button" className="primary-button">Nuovo operatore</button>
      </section>

      <section className="panel-card empty-state-card">
        <div className="empty-icon">O</div>
        <h3>Area operatori in preparazione</h3>
        <p>
          Collegheremo questa sezione agli account esistenti, mantenendo i controlli di sicurezza lato backend per tutte le operazioni amministrative.
        </p>
      </section>
    </div>
  )
}
