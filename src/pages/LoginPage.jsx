import { useState } from 'react'

export default function LoginPage({ onLogin, loading }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    try {
      await onLogin(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Accesso non riuscito.')
    }
  }

  return (
    <div className="portal-login-shell">
      <div className="portal-login-card">
        <div className="portal-login-brand">
          <div className="portal-brand-mark">SP</div>
          <div>
            <strong>SanguePro</strong>
            <span>Portal amministrativo</span>
          </div>
        </div>

        <div className="portal-login-heading">
          <span className="section-kicker">ACCESSO RISERVATO</span>
          <h1>Accedi al Portal</h1>
          <p>Inserisci le credenziali amministrative per continuare.</p>
        </div>

        <form className="portal-login-form" onSubmit={handleSubmit}>
          <label>
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              required
              disabled={loading}
            />
          </label>

          <label>
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              disabled={loading}
            />
          </label>

          {error ? (
            <div className="portal-login-error" role="alert">
              {error}
            </div>
          ) : null}

          <button className="primary-button portal-login-submit" type="submit" disabled={loading}>
            {loading ? 'Accesso in corso…' : 'Accedi'}
          </button>
        </form>
      </div>
    </div>
  )
}
