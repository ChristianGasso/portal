import { useEffect, useState } from 'react'
import PortalLayout from './components/PortalLayout'
import DashboardPage from './pages/DashboardPage'
import AvisPage from './pages/AvisPage'
import OperatoriPage from './pages/OperatoriPage'
import DonatoriPage from './pages/DonatoriPage'
import ConfigurazioniPage from './pages/ConfigurazioniPage'

const validPages = new Set(['dashboard', 'avis', 'operatori', 'donatori', 'configurazioni'])

function getPageFromHash() {
  const raw = window.location.hash.replace(/^#\/?/, '')
  return validPages.has(raw) ? raw : 'dashboard'
}

export default function App() {
  const [activePage, setActivePage] = useState(getPageFromHash)

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

  let pageContent = <DashboardPage onNavigate={navigate} />
  if (activePage === 'avis') pageContent = <AvisPage />
  if (activePage === 'operatori') pageContent = <OperatoriPage />
  if (activePage === 'donatori') pageContent = <DonatoriPage />
  if (activePage === 'configurazioni') pageContent = <ConfigurazioniPage />

  return (
    <PortalLayout activePage={activePage} onNavigate={navigate}>
      {pageContent}
    </PortalLayout>
  )
}
