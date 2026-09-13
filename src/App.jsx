import { useEffect, useState } from 'react'
import PortalLayout from './components/PortalLayout'
import DashboardPage from './pages/DashboardPage'
import AvisPage from './pages/AvisPage'
import AvisDetailPage from './pages/AvisDetailPage'
import DonatoriPage from './pages/DonatoriPage'
import ConfigurazioniPage from './pages/ConfigurazioniPage'
import LoginPage from './pages/LoginPage'
import { getPortalSession, loginPortal, logoutPortal } from './auth/portalAuth'

const validPages = new Set(['dashboard', 'avis', 'donatori', 'configurazioni'])

function getRouteFromHash() {
  const raw = window.location.hash.replace(/^#\/?/, '')
  const parts = raw.split('/').filter(Boolean)

  if (parts[0] === 'avis' && /^\d+$/.test(parts[1] || '')) {
    return { page: 'avis', avisId: Number(parts[1]) }
  }

  const page = validPages.has(parts[0]) ? parts[0] : 'dashboard'
  return { page, avisId: null }
}

export default function App() {
  const [route, setRoute] = useState(getRouteFromHash)
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
    const handleHashChange = () => setRoute(getRouteFromHash())
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  function navigate(page) {
    if (!validPages.has(page)) return
    window.location.hash = page === 'dashboard' ? '#/' : `#/${page}`
    setRoute({ page, avisId: null })
  }

  function openAvis(idAvis) {
    const id = Number(idAvis)
    if (!Number.isInteger(id) || id <= 0) return
    window.location.hash = `#/avis/${id}`
    setRoute({ page: 'avis', avisId: id })
  }

  async function handleLogin(email, password) {
    setLoginLoading(true)

    try {
      const data = await loginPortal(email, password)
      setUser(data.user)
      window.location.hash = '#/'
      setRoute({ page: 'dashboard', avisId: null })
    } finally {
      setLoginLoading(false)
    }
  }

  async function handleLogout() {
    await logoutPortal()
    setUser(null)
    window.location.hash = '#/'
    setRoute({ page: 'dashboard', avisId: null })
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
  if (route.page === 'avis' && route.avisId) {
    pageContent = <AvisDetailPage idAvis={route.avisId} onBack={() => navigate('avis')} />
  } else if (route.page === 'avis') {
    pageContent = <AvisPage onOpenAvis={openAvis} />
  }
  if (route.page === 'donatori') pageContent = <DonatoriPage />
  if (route.page === 'configurazioni') pageContent = <ConfigurazioniPage />

  return (
    <PortalLayout
      activePage={route.page}
      onNavigate={navigate}
      user={user}
      onLogout={handleLogout}
    >
      {pageContent}
    </PortalLayout>
  )
}
