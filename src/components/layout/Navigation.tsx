import React, { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { listarAlertas } from '@/services/escritorio.service'
import { listarDiligencias } from '@/services/diligencia.service'
import { useAuth } from '@/contexts/AuthContext'

const Navigation: React.FC = () => {
  const location = useLocation()
  const [alertasCount, setAlertasCount] = useState(0)
  const [urgentesCount, setUrgentesCount] = useState(0)
  const { user, signOut } = useAuth()

  useEffect(() => {
    if (!user) return
    const loadAlertas = () => {
      listarAlertas()
        .then(a => setAlertasCount(a.length))
        .catch(e => console.warn('Falha ao carregar alertas:', e))
    }
    const loadUrgentes = () => {
      listarDiligencias()
        .then(d => setUrgentesCount(d.filter(x => x.prioridade === 'URGENTE' && x.status !== 'CONCLUIDA').length))
        .catch(() => { /* silencioso */ })
    }
    loadAlertas()
    loadUrgentes()
    const interval = setInterval(() => { loadAlertas(); loadUrgentes() }, 60_000)
    return () => clearInterval(interval)
  }, [user])

  const navLink = useCallback((to: string, label: React.ReactNode) => (
    <Link
      to={to}
      className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-1.5 ${
        location.pathname === to
          ? 'border-blue-600 text-blue-600'
          : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
      }`}
    >
      {label}
    </Link>
  ), [location.pathname])

  return (
    <nav className="bg-gray-50 border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex gap-8 justify-between">
          <div className="flex gap-8">
            {navLink('/', 'Buscar Processo')}
            {navLink(
              '/meus-processos',
              <>
                Meus Processos
                {alertasCount > 0 && (
                  <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full">
                    {alertasCount > 9 ? '9+' : alertasCount}
                  </span>
                )}
              </>
            )}
            {navLink(
              '/diligencias',
              <>
                Diligências
                {urgentesCount > 0 && (
                  <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full">
                    {urgentesCount > 9 ? '9+' : urgentesCount}
                  </span>
                )}
              </>
            )}
            {navLink('/clientes', '👤 Clientes')}
            {navLink('/dashboard-operacional', '📊 Dashboard')}
            {navLink('/dashboard-tempos', '⏱ Tempos')}
            {navLink('/ia', '🤖 Assistente IA')}
          </div>
          <div className="flex items-center gap-3 py-2">
            <span className="text-xs text-gray-500 hidden sm:block">{user?.email}</span>
            <button
              onClick={signOut}
              className="text-xs text-gray-600 hover:text-red-600 border border-gray-300 hover:border-red-300 px-2 py-1 rounded transition-colors"
            >
              Sair
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}

export default Navigation
