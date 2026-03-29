// src/components/layout/Navigation.tsx
import React, { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { apiClient } from '@/services/api'
import { useAuth } from '@/contexts/AuthContext'

const Icons = {
  search: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="6.5" cy="6.5" r="4"/><path d="m10.5 10.5 2.5 2.5"/>
    </svg>
  ),
  person: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M7.5 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM2 14c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/>
    </svg>
  ),
  document: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="1.5" width="10" height="12" rx="1"/><path d="M5 5h5M5 7.5h5M5 10h3"/>
    </svg>
  ),
  folder: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 4.5A1 1 0 0 1 2.5 3.5h3l1.5 1.5h5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1v-6z"/>
    </svg>
  ),
  clock: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="7.5" cy="7.5" r="5.5"/><path d="M7.5 4.5v3l2 2"/>
    </svg>
  ),
  users: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="5.5" cy="5" r="2.5"/><path d="M1 13c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4"/>
      <circle cx="11" cy="4.5" r="2"/><path d="M13.5 12c0-2-1.5-3.5-3.5-3.5"/>
    </svg>
  ),
  chart: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 11.5 5 7.5l3 2.5 5.5-6.5"/>
    </svg>
  ),
  bars: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <rect x="2" y="9" width="2.5" height="4" rx="0.5"/><rect x="6.25" y="6" width="2.5" height="7" rx="0.5"/><rect x="10.5" y="3" width="2.5" height="10" rx="0.5"/>
    </svg>
  ),
  money: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="3" width="12" height="9" rx="1.5"/><circle cx="7.5" cy="7.5" r="1.5"/><path d="M4 7.5h0M11 7.5h0"/>
    </svg>
  ),
  ai: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="7.5" cy="7.5" r="5.5"/><circle cx="7.5" cy="7.5" r="2"/>
      <path d="M7.5 2v1M7.5 12v1M2 7.5h1M12 7.5h1"/>
    </svg>
  ),
  message: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3.5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H6l-3 3v-3H3a1 1 0 0 1-1-1z"/>
    </svg>
  ),
  settings: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="7.5" cy="7.5" r="2"/><path d="M7.5 1.5v1.2M7.5 12.3v1.2M1.5 7.5h1.2M12.3 7.5h1.2M3.2 3.2l.85.85M10.95 10.95l.85.85M10.95 3.2l-.85.85M3.2 10.95l.85-.85"/>
    </svg>
  ),
  logout: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3M10 10.5l3-3-3-3M13 7.5H6"/>
    </svg>
  ),
}

const sectionLabel = (label: string) => (
  <span className="block px-2.5 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-widest text-text-faint">
    {label}
  </span>
)

const Navigation: React.FC = () => {
  const location = useLocation()
  const [alertasCount, setAlertasCount] = useState(0)
  const [urgentesCount, setUrgentesCount] = useState(0)
  const [messagePendingCount, setMessagePendingCount] = useState(0)
  const { user, signOut } = useAuth()

  useEffect(() => {
    if (!user) return
    const loadStatus = () => {
      apiClient
        .get('/api/escritorio/status')
        .then(res => {
          setAlertasCount(res.data.alertasCount || 0)
          setUrgentesCount(res.data.urgentesCount || 0)
          setMessagePendingCount(res.data.messagePendingCount || 0)
        })
        .catch(e => console.warn('Falha ao carregar status:', e))
    }
    loadStatus()
    const interval = setInterval(loadStatus, 60_000)
    return () => clearInterval(interval)
  }, [user])

  const isActive = useCallback((path: string) => location.pathname === path, [location.pathname])

  const navItem = useCallback((to: string, icon: React.ReactNode, label: string, badge?: number) => (
    <Link
      to={to}
      className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
        isActive(to)
          ? 'bg-primary-light font-medium text-primary'
          : 'text-text-muted hover:bg-bg hover:text-text-base'
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {badge != null && badge > 0 && (
        <span className="ml-auto rounded-full bg-danger-bg px-1.5 py-0.5 text-[10px] font-bold leading-none text-danger">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </Link>
  ), [isActive])

  const userInitials = user?.email?.slice(0, 2).toUpperCase() ?? 'US'

  return (
    <aside className="flex min-h-screen w-[220px] shrink-0 flex-col border-r border-border bg-surface">
      <div className="border-b border-border-subtle px-4 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary">
            <span className="text-xs font-bold text-white">J</span>
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight text-text-strong">JusFlow</div>
            <div className="text-[10px] leading-tight text-text-faint">Sistema Juridico</div>
          </div>
        </div>

        <Link to="/comunicacao" className="mt-4 block rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 transition-colors hover:bg-amber-100/70">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-700">Mensagens</div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <div className="text-xs text-amber-900">Aguardando aprovacao</div>
            <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">
              {messagePendingCount > 99 ? '99+' : messagePendingCount}
            </span>
          </div>
        </Link>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2">
        {sectionLabel('Consulta')}
        {navItem('/', Icons.search, 'Buscar Processo')}
        {navItem('/search-cpf', Icons.person, 'Buscar por CPF')}
        {navItem('/precedents', Icons.document, 'Precedentes')}

        {sectionLabel('Gestao')}
        {navItem('/meus-processos', Icons.folder, 'Meus Processos', alertasCount)}
        {navItem('/diligencias', Icons.clock, 'Diligencias', urgentesCount)}
        {navItem('/clientes', Icons.users, 'Clientes')}
        {navItem('/comunicacao', Icons.message, 'Comunicacao', messagePendingCount)}
        {navItem('/financeiro', Icons.money, 'Financeiro')}

        {sectionLabel('Analytics')}
        {navItem('/dashboard-operacional', Icons.chart, 'Dashboard')}
        {navItem('/dashboard-tempos', Icons.bars, 'Tempos')}
        {navItem('/ia', Icons.ai, 'Assistente IA')}
      </nav>

      <div className="border-t border-border-subtle px-2 py-2">
        {navItem('/configuracoes', Icons.settings, 'Configuracoes')}
        <div className="mt-1 flex items-center gap-2.5 px-2.5 py-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-light">
            <span className="text-[9px] font-semibold text-primary">{userInitials}</span>
          </div>
          <span className="flex-1 truncate text-[11px] text-text-muted">{user?.email}</span>
          <button
            onClick={signOut}
            className="text-text-faint transition-colors hover:text-danger"
            title="Sair"
          >
            {Icons.logout}
          </button>
        </div>
      </div>
    </aside>
  )
}

export default Navigation