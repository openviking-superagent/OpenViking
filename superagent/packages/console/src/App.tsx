import { useCallback, useEffect, useState } from 'react'
import { Activity, Bot, ChevronDown, CircleGauge, ExternalLink, FileClock, KeyRound, ListChecks, LogOut, Menu, Moon, PanelLeftClose, PanelLeftOpen, RefreshCw, ScrollText, Server, Settings2, ShieldCheck, Sun, Wrench, X } from 'lucide-react'
import { api, isDemoMode, type AuthSession } from './api'
import brandLockupDark from './assets/brand-lockup-dark.svg'
import brandLockupLight from './assets/brand-lockup-light.svg'
import { DemoNotice } from './components/Controls'
import { OpenVikingMark } from './components/OpenVikingMark'
import { ErrorState, Loading } from './components'
import { LoginPage } from './LoginPage'
import { useApi, useHashRoute } from './hooks'
import { ActivityPage } from './pages/ActivityPage'
import { AuditPage } from './pages/AuditPage'
import { CapabilitiesPage } from './pages/CapabilitiesPage'
import { ConfigurationPage, SetupInstanceButton } from './pages/ConfigurationPage'
import { DiagnosticsPage } from './pages/DiagnosticsPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { OverviewPage } from './pages/OverviewPage'
import { ProvidersPage } from './pages/ProvidersPage'
import { RuntimePage } from './pages/RuntimePage'
import { SessionsPage } from './pages/SessionsPage'
import { TaskDetailPage } from './pages/TaskDetailPage'
import { TasksPage } from './pages/TasksPage'

const NAVIGATION = [
  { id: 'overview', label: 'Overview', icon: CircleGauge },
  { id: 'tasks', label: 'Tasks', icon: ListChecks },
  { id: 'sessions', label: 'Sessions', icon: Bot },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'runtime', label: 'Runtime', icon: Wrench },
  { id: 'configuration', label: 'Configuration', icon: Settings2 },
  { id: 'providers', label: 'Providers', icon: KeyRound },
  { id: 'diagnostics', label: 'Diagnostics', icon: FileClock },
  { id: 'audit', label: 'Audit', icon: ScrollText },
]

export function App() {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const reloadSession = useCallback(() => {
    setError(null)
    api.authSession().then(setSession).catch((reason) => setError(reason instanceof Error ? reason : new Error('Authentication check failed.')))
  }, [])
  useEffect(() => {
    reloadSession()
    const required = () => setSession({ authenticationRequired: true, authenticated: false })
    window.addEventListener('ovsa-auth-required', required)
    return () => window.removeEventListener('ovsa-auth-required', required)
  }, [reloadSession])

  if (error) return <main className="auth-state"><ErrorState error={error} retry={reloadSession} /></main>
  if (!session) return <main className="auth-state"><Loading /></main>
  if (session.authenticationRequired && !session.authenticated) return <LoginPage onAuthenticated={setSession} />
  return <ConsoleApp authRequired={session.authenticationRequired} onLogout={async () => { await api.logout(); setSession({ authenticationRequired: true, authenticated: false }) }} />
}

function ConsoleApp({ authRequired, onLogout }: { authRequired: boolean; onLogout: () => Promise<void> }) {
  const route = useHashRoute()
  const instances = useApi(api.instances, 'instances')
  const initialInstance = new URLSearchParams(window.location.search).get('instance')
  const [instance, setInstance] = useState(initialInstance ?? '')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => window.localStorage.getItem('ovsa-sidebar-collapsed') === 'true')
  const [refreshKey, setRefreshKey] = useState(0)
  const [dark, setDark] = useState(() => window.localStorage.getItem('ovsa-theme') === 'dark')
  const selected = instance || instances.data?.defaultInstance || instances.data?.items[0]?.id || ''
  const capabilities = useApi(() => selected ? api.capabilities(selected) : Promise.resolve(null), `capabilities:${selected}`, 60_000)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    window.localStorage.setItem('ovsa-theme', dark ? 'dark' : 'light')
  }, [dark])
  useEffect(() => { window.localStorage.setItem('ovsa-sidebar-collapsed', String(collapsed)) }, [collapsed])
  useEffect(() => { setMobileOpen(false) }, [route.page, route.taskId])
  useEffect(() => {
    if (instance && instances.data && !instances.data.items.some((item) => item.id === instance)) setInstance('')
  }, [instance, instances.data])

  const changeInstance = (id: string) => {
    setInstance(id)
    const url = new URL(window.location.href)
    url.searchParams.set('instance', id)
    window.history.replaceState(null, '', url)
  }
  const currentInstance = instances.data?.items.find((item) => item.id === selected)
  const activePage = route.page === 'task' ? 'tasks' : route.page

  return <div className="app-shell">
    {mobileOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
    <aside className={`sidebar ${mobileOpen ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`}>
      <div className="brand"><a className="brand-home" href="#/overview" aria-label="OpenViking console overview"><img className="brand-lockup light-brand" src={brandLockupLight} alt="OpenViking" /><img className="brand-lockup dark-brand" src={brandLockupDark} alt="OpenViking" /><OpenVikingMark className="brand-symbol" /><span className="brand-product">SUPERAGENT CONSOLE</span></a><button className="mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={19} /></button></div>
      <div className="workspace-label">WORKSPACE</div>
      <label className="instance-switcher"><div className="instance-avatar">{selected.slice(0, 2).toUpperCase() || '—'}</div><div><strong>{currentInstance?.label ?? selected ?? 'Select instance'}</strong><span><i className={currentInstance?.ready === false ? 'offline' : ''} />{currentInstance?.ready === false ? 'Offline' : 'Local instance'}</span></div><ChevronDown size={15} /><select aria-label="Select instance" value={selected} onChange={(event) => changeInstance(event.target.value)} disabled={!instances.data}>{instances.data?.items.map((item) => <option value={item.id} key={item.id}>{item.label}{item.default ? ' (default)' : ''}</option>)}</select></label>
      <nav className="main-nav" aria-label="Console navigation"><span className="nav-section-label">MONITOR</span>{NAVIGATION.map(({ id, label, icon: Icon }) => <a href={`#/${id}`} className={activePage === id ? 'active' : ''} aria-current={activePage === id ? 'page' : undefined} title={label} key={id}><Icon size={18} /><span>{label}</span>{id === 'tasks' && capabilities.data && !capabilities.data.modules['tasks.read']?.effective && <i className="nav-unavailable" title="Tasks unavailable" />}</a>)}<span className="nav-section-label secondary-label">SYSTEM</span><a href="#/capabilities" className={activePage === 'capabilities' ? 'active' : ''} aria-current={activePage === 'capabilities' ? 'page' : undefined} title="Capabilities"><Settings2 size={18} /><span>Capabilities</span></a></nav>
      <div className="sidebar-bottom"><button className="sidebar-collapse" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>{collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}<span>{collapsed ? 'Expand sidebar' : 'Collapse sidebar'}</span></button><div className="read-only-panel"><ShieldCheck size={18} /><div><strong>{isDemoMode() ? 'Mock demo workspace' : 'Read-only console'}</strong><span>{isDemoMode() ? 'RFC slices A–D · Isolated data' : 'Slice A · No control actions'}</span></div></div><a className="legacy-link" title="Legacy activity timeline" href={`/activity?instance=${encodeURIComponent(selected)}`}><Activity size={15} /> Legacy activity timeline <ExternalLink size={12} /></a><div className="version"><span>OVSA Console</span><span>RFC 001</span></div></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><button className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={20} /></button><div className="breadcrumb"><Server size={15} /><span>{currentInstance?.label ?? selected}</span><span>/</span><strong>{route.page === 'task' ? 'Task detail' : activePage[0]?.toUpperCase() + activePage.slice(1)}</strong></div><div className="topbar-actions"><SetupInstanceButton instance={selected} /><span className="local-only"><i />{isDemoMode() ? 'Mock server' : 'Local only'}</span><button className="icon-button" aria-label="Refresh current view" title="Refresh current view" onClick={() => setRefreshKey((value) => value + 1)}><RefreshCw size={17} className={capabilities.refreshing ? 'spin' : ''} /></button><button className="icon-button" aria-label={dark ? 'Use light theme' : 'Use dark theme'} onClick={() => setDark((value) => !value)}>{dark ? <Sun size={17} /> : <Moon size={17} />}</button>{authRequired && <button className="icon-button" aria-label="Log out" title="Log out" onClick={() => void onLogout()}><LogOut size={17} /></button>}</div></header>
      <div className="content" key={`${selected}:${refreshKey}`}>
        <DemoNotice />
        {instances.loading ? <Loading /> : instances.error ? <ErrorState error={instances.error} retry={instances.reload} /> : !selected ? <ErrorState error={new Error('No SuperAgent instances are configured.')} /> : capabilities.loading ? <Loading /> : capabilities.error || !capabilities.data ? <ErrorState error={capabilities.error ?? new Error('Capabilities unavailable')} retry={capabilities.reload} /> : <Page route={route} instance={selected} capabilities={capabilities.data} />}
      </div>
    </main>
  </div>
}

function Page({ route, instance, capabilities }: { route: ReturnType<typeof useHashRoute>; instance: string; capabilities: NonNullable<ReturnType<typeof api.capabilities>> extends Promise<infer T> ? T : never }) {
  if (route.page === 'overview') return <OverviewPage instance={instance} capabilities={capabilities} />
  if (route.page === 'tasks') return <TasksPage instance={instance} capabilities={capabilities} />
  if (route.page === 'task' && route.taskId) {
    return capabilities.modules['tasks.read']?.effective
      ? <TaskDetailPage instance={instance} taskId={route.taskId} capabilities={capabilities} />
      : <TasksPage instance={instance} capabilities={capabilities} />
  }
  if (route.page === 'sessions') return <SessionsPage instance={instance} capabilities={capabilities} />
  if (route.page === 'activity') return <ActivityPage instance={instance} />
  if (route.page === 'capabilities') return <CapabilitiesPage capabilities={capabilities} />
  if (route.page === 'runtime') return <RuntimePage instance={instance} capabilities={capabilities} />
  if (route.page === 'configuration') return <ConfigurationPage instance={instance} capabilities={capabilities} />
  if (route.page === 'providers') return <ProvidersPage instance={instance} capabilities={capabilities} />
  if (route.page === 'diagnostics') return <DiagnosticsPage instance={instance} capabilities={capabilities} />
  if (route.page === 'audit') return <AuditPage instance={instance} />
  return <NotFoundPage />
}
