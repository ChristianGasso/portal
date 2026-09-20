import { useState } from 'react'
import { eseguiQueryAvis } from '../../services/avisService'

function cellValue(value) {
  if (value === null) return 'NULL'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export default function AvisQueryConsole({ idAvis, onToast }) {
  const [query, setQuery] = useState('SELECT * FROM persone LIMIT 20')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)

  async function executeQuery() {
    if (!query.trim() || running) return

    setRunning(true)
    try {
      const data = await eseguiQueryAvis(idAvis, query)
      setResult(data)
      onToast?.({
        tone: 'success',
        message: data.truncated
          ? 'Query completata. Sono mostrate le prime 500 righe.'
          : `Query completata: ${data.row_count} righe restituite.`,
      })
    } catch (error) {
      setResult(null)
      onToast?.({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Non è stato possibile eseguire la query.',
      })
    } finally {
      setRunning(false)
    }
  }

  const columns = Array.isArray(result?.columns) ? result.columns : []
  const rows = Array.isArray(result?.rows) ? result.rows : []

  return (
    <section className="panel-card avis-detail-panel query-console">
      <div className="portal-form-heading">
        <div>
          <span className="section-kicker">DATABASE AVIS</span>
          <h3>Query di lettura</h3>
          <p>Esegui SELECT, SHOW, DESCRIBE o EXPLAIN sul database operativo della AVIS selezionata.</p>
        </div>
        <button type="button" className="primary-button" onClick={() => void executeQuery()} disabled={running || !query.trim()}>
          {running ? 'Esecuzione…' : 'Esegui query'}
        </button>
      </div>

      <label className="query-console-editor">
        <span>Query SQL</span>
        <textarea
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          spellCheck="false"
          disabled={running}
          placeholder="SELECT * FROM persone LIMIT 20"
        />
      </label>

      <div className="query-console-hint">
        Console in sola lettura. Sono mostrate al massimo 500 righe per esecuzione.
      </div>

      {result ? (
        <div className="query-result">
          <div className="query-result-summary">
            <strong>{result.row_count} righe</strong>
            <span>{result.duration_ms} ms</span>
            {result.truncated ? <span>Risultato limitato a 500 righe</span> : null}
          </div>

          {columns.length > 0 ? (
            <div className="query-result-table-wrap">
              <table className="query-result-table">
                <thead>
                  <tr>
                    {columns.map((column) => <th key={column}>{column}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.length > 0 ? rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {columns.map((column) => (
                        <td key={column} title={cellValue(row?.[column])}>
                          {cellValue(row?.[column])}
                        </td>
                      ))}
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={Math.max(1, columns.length)}>La query non ha restituito righe.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted-copy">La query non ha restituito colonne.</p>
          )}
        </div>
      ) : null}
    </section>
  )
}
