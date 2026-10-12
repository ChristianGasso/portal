import { useState } from 'react'
import { getPortalToken } from '../auth/portalAuth'

function queryIsWrite(sql) {
  return /^(INSERT|UPDATE|DELETE|REPLACE|ALTER\s+TABLE|CREATE\s+TABLE)\b/i.test(sql.trim())
}

export default function ConfigurazioniPage() {
  const [query, setQuery] = useState('SELECT COUNT(*) AS totale FROM persone')
  const [confirm, setConfirm] = useState(false)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  async function execute(approved = false) {
    if (!query.trim() || running) return
    if (queryIsWrite(query) && !approved) { setConfirm(true); return }
    setRunning(true); setConfirm(false); setError(''); setResult(null)
    try {
      const response = await fetch('/api/avis/query-globale.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getPortalToken() },
        body: JSON.stringify({ query, conferma_scrittura: approved }),
      })
      const body = await response.json()
      if (!response.ok || !body.success) throw new Error(body.error || 'Esecuzione non riuscita.')
      setResult(body)
    } catch (e) { setError(e?.message || 'Errore durante la query.') }
    finally { setRunning(false) }
  }

  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <span className="section-kicker">PIATTAFORMA</span>
          <h2>Configurazioni</h2>
          <p>Strumenti amministrativi della piattaforma.</p>
        </div>
      </section>
      <section className="panel-card avis-detail-panel query-console">
        <div className="portal-form-heading">
          <div>
            <span className="section-kicker">TUTTI I DATABASE MAPPATI</span>
            <h3>Console SQL globale</h3>
            <p>La stessa query viene eseguita su ogni database del mapping condiviso. Per le modifiche, l'esecuzione si interrompe al primo errore.</p>
          </div>
          <button type="button" className="primary-button" disabled={running || !query.trim()} onClick={() => execute()}>
            {running ? 'Esecuzione…' : 'Esegui su tutti'}
          </button>
        </div>
        <label className="query-console-editor">
          <span>Query SQL</span>
          <textarea value={query} onChange={e => { setQuery(e.target.value); setConfirm(false) }} disabled={running} spellCheck="false" />
        </label>
        {confirm ? (
          <div className="query-console-hint">
            <strong>Conferma modifica di tutti i database mappati.</strong>
            <p>Ogni database viene aggiornato separatamente. Le modifiche già completate non vengono annullate se un altro database fallisce.</p>
            <div className="portal-form-actions">
              <button className="text-button" type="button" onClick={() => setConfirm(false)}>Annulla</button>
              <button className="primary-button" type="button" onClick={() => execute(true)}>Confermo, esegui su tutti</button>
            </div>
          </div>
        ) : null}
        {error ? <p role="alert" className="query-console-hint">{error}</p> : null}
        {result ? (
          <div className="query-result">
            <p><strong>Database esaminati: {result.processed} / {result.total_mapped}</strong></p>
            {result.results.map((item, i) => (
              <div key={item.codice_sede + i} className="query-console-hint">
                <strong>Sede {item.codice_sede} — {item.success ? 'OK' : 'ERRORE'}</strong>
                {item.error ? <p>{item.error}</p> : null}
                {item.affected_rows !== undefined ? <p>Righe interessate: {item.affected_rows}</p> : null}
                {item.rows ? (
                  <div className="query-result-table-wrap">
                    <table className="query-result-table">
                      <thead><tr>{(item.columns || []).map((col,j) => <th key={j}>{col}</th>)}</tr></thead>
                      <tbody>{item.rows.map((row,j) => <tr key={j}>{(item.columns || []).map((col,k) => <td key={k}>{row[col] === null ? 'NULL' : typeof row[col] === 'object' ? JSON.stringify(row[col]) : String(row[col])}</td>)}</tr>)}</tbody>
                    </table>
                    {item.truncated ? <p>Prime 100 righe mostrate.</p> : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  )
}
