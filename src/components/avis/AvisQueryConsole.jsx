import { useState } from 'react'
import { eseguiQueryAvis } from '../../services/avisService'

function cellValue(value) {
  if (value === null) return 'NULL'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function isWriteQuery(value) {
  const sql = String(value || '').trim()
  return /^(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(sql)
    || /^ALTER\s+TABLE\b/i.test(sql)
    || /^CREATE\s+TABLE\b/i.test(sql)
}

export default function AvisQueryConsole({ idAvis, onToast }) {
  const [query, setQuery] = useState('SELECT * FROM persone LIMIT 20')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)
  const [confirmWrite, setConfirmWrite] = useState(false)

  async function executeQuery(confirmed = false) {
    if (!query.trim() || running) return

    if (isWriteQuery(query) && !confirmed) {
      setConfirmWrite(true)
      return
    }

    setConfirmWrite(false)
    setRunning(true)
    try {
      const data = await eseguiQueryAvis(idAvis, query)
      setResult(data)

      if (data.mode === 'write') {
        onToast?.({
          tone: 'success',
          message: `Query ${data.operation || 'SQL'} eseguita: ${data.affected_rows ?? 0} righe interessate.`,
        })
      } else {
        onToast?.({
          tone: 'success',
          message: data.truncated
            ? 'Query completata. Sono mostrate le prime 500 righe.'
            : `Query completata: ${data.row_count} righe restituite.`,
        })
      }
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
  const writeMode = result?.mode === 'write'

  return (
    <section className="panel-card avis-detail-panel query-console">
      <div className="portal-form-heading">
        <div>
          <span className="section-kicker">DATABASE AVIS</span>
          <h3>Console SQL</h3>
          <p>
            Esegui query di lettura e operazioni amministrative sul database operativo della AVIS selezionata.
          </p>
        </div>
        <button type="button" className="primary-button" onClick={() => void executeQuery()} disabled={running || !query.trim()}>
          {running ? 'Esecuzione…' : 'Esegui query'}
        </button>
      </div>

      <label className="query-console-editor">
        <span>Query SQL</span>
        <textarea
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setConfirmWrite(false)
          }}
          spellCheck="false"
          disabled={running}
          placeholder="UPDATE persone SET ... WHERE ..."
        />
      </label>

      <div className="query-console-hint">
        Consentiti: SELECT, SHOW, DESCRIBE, EXPLAIN, INSERT, UPDATE, DELETE, REPLACE, ALTER TABLE e CREATE TABLE.
        È possibile eseguire una sola query alla volta. DROP e TRUNCATE restano bloccati.
      </div>

      {confirmWrite ? (
        <div className="query-console-hint">
          <strong>Conferma modifica database.</strong>{' '}
          Questa query può modificare dati o struttura della AVIS selezionata.
          <div className="portal-form-actions">
            <button type="button" className="text-button" onClick={() => setConfirmWrite(false)} disabled={running}>
              Annulla
            </button>
            <button type="button" className="primary-button" onClick={() => void executeQuery(true)} disabled={running}>
              Conferma ed esegui
            </button>
          </div>
        </div>
      ) : null}

      {result ? (
        <div className="query-result">
          <div className="query-result-summary">
            <strong>
              {writeMode
                ? `${result.affected_rows ?? 0} righe interessate`
                : `${result.row_count} righe`}
            </strong>
            <span>{result.duration_ms} ms</span>
            {result.operation ? <span>{result.operation}</span> : null}
            {result.truncated ? <span>Risultato limitato a 500 righe</span> : null}
          </div>

          {writeMode ? (
            <p className="muted-copy">Operazione completata sul database operativo della AVIS.</p>
          ) : columns.length > 0 ? (
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
