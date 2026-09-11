import { useEffect, useMemo, useState } from 'react'

const navigation = [
  { key: 'dashboard', label: 'Dashboard', icon: '⌂' },
  { key: 'avis', label: 'AVIS', icon: 'A' },
  { key: 'donatori', label: 'App donatori', icon: 'D' },
  { key: 'configurazioni', label: 'Configurazioni', icon: '⚙' },
]

function getInitials(user) {
  const first = (user?.nome || '').trim().charAt(0)
  const last = (user?.cognome || '').trim().charAt(0)
  return `${first}${last}`.toUpperCase() || 'AD'
}

export default function PortalLayout({ activePage, onNavigate, user, onLogout, children }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const current = useMemo(
    () => navigation.find((item) => item.key === activePage) ?? navigation[0],
    [activePage],
  )

  useEffect(() => {
    setMobileOpen(false)
  }, [activePage])

  const displayName = [user?.nome, user?.cognome].filter(Boolean).join(' ') || 'Amministratore'

  return (
    <div className="portal-app">
      <aside className={`portal-sidebar ${mobileOpen ? 'is-open' : ''}`}>
        <div className="portal-brand">
          <div className="portal-brand-mark">SP</div>
          <div>
            <strong>SanguePro</strong>
            <span>Portal amministrativo</span>
          </div>
        </div>

        <nav className="portal-nav" aria-label="Navigazione principale">
          {navigation.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`portal-nav-item ${item.key === activePage ? 'is-active' : ''}`}
              onClick={() => onNavigate(item.key)}
            >
              <span className="portal-nav-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="portal-sidebar-footer">
          <div className="portal-admin-avatar">{getInitials(user)}</div>
          <div className="portal-sidebar-user">
            <strong>{displayName}</strong>
            <span>{user?.email || 'Accesso centrale'}</span>
            <button type="button" className="portal-logout-button" onClick={onLogout}>
              Esci
            </button>
          </div>
        </div>
      </aside>

      {mobileOpen ? (
        <button
          type="button"
          className="portal-backdrop"
          aria-label="Chiudi menu"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <div className="portal-main">
        <header className="portal-topbar">
          <div className="portal-topbar-left">
            <button
              type="button"
              className="portal-menu-button"
              aria-label="Apri menu"
              onClick={() => setMobileOpen(true)}
            >
              ☰
            </button>
            <div>
              <span className="portal-breadcrumb">Portal / {current.label}</span>
              <h1>{current.label}</h1>
            </div>
          </div>

          <div className="portal-topbar-actions">
            <span className="portal-status-dot" />
            <span>Sistema operativo</span>
          </div>
        </header>

        <main className="portal-content">{children}</main>
      </div>
    </div>
  )
}
