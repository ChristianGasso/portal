import { useEffect, useState } from 'react'
import PortalLayout from './components/PortalLayout'
import DashboardPage from './pages/DashboardPage'
import AvisPage from './pages/AvisPage'
import DonatoriPage from './pages/DonatoriPage'
import ConfigurazioniPage from './pages/ConfigurazioniPage'
import LoginPage from './pages/LoginPage'
import { getPortalSession, loginPortal, logoutPortal } from './auth/portalAuth'

const validPages = new Set(['dashboard', 'avis', 'donatori', 'configurazioni'])

function getPageFromHash() {
  const raw = window.location.hash.replace(/^#\/?/, '')
  return validPages.has(raw) ? raw : 'dashboard'
}

export default function App() {
  const [activePage, setActivePage] = useState(getPageFromHash)
  const [user, setUser] = useState(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const [loginLoading, setLoginLoading] = useState(false)

  useEffect(() => {
    let active = true

    async function bootstrapSession() {
      try {
        const sessionUser = await getPortalSession()
        if (active) setUser(sessionUser)
      } catch {
        if (active) setUser(null)
      } finally {
        if (active) setCheckingSession(false)
      }
    }

    bootstrapSession()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const handleHashChange = () => setActivePage(getPageFromHash())
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  function navigate(page) {
    if (!validPages.has(page)) return
    window.location.hash = page === 'dashboard' ? '#/' : `#/${page}`
    setActivePage(page)
  }

  async function handleLogin(email, password) {
    setLoginLoading(true)

    try {
      const data = await loginPortal(email, password)
      setUser(data.user)
      window.location.hash = '#/'
      setActivePage('dashboard')
    } finally {
      setLoginLoading(false)
    }
  }

  async function handleLogout() {
    await logoutPortal()
    setUser(null)
    window.location.hash = '#/'
    setActivePage('dashboard')
  }

  if (checkingSession) {
    return (
      <div className="portal-auth-loading">
        <div className="portal-auth-loading-card">
          <div className="portal-brand-mark">SP</div>
          <strong>Verifica accesso…</strong>
        </div>
      </div>
    )
  }

  if (!user) {
    return <LoginPage onLogin={handleLogin} loading={loginLoading} />
  }

  let pageContent = <DashboardPage onNavigate={navigate} />
  if (activePage === 'avis') pageContent = <AvisPage />
  if (activePage === 'donatori') pageContent = <DonatoriPage />
  if (activePage === 'configurazioni') pageContent = <ConfigurazioniPage />

  return (
    <PortalLayout
      activePage={activePage}
      onNavigate={navigate}
      user={user}
      onLogout={handleLogout}
    >
      {pageContent}
    </PortalLayout>
  )
}
