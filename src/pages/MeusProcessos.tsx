import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '@/components/common/Button'
import Badge from '@/components/common/Badge'
import Empty from '@/components/common/Empty'
import { Spinner } from '@/components/common/Loading'
import { CadastroProcessoModal } from '@/components/process/CadastroProcessoModal'
import {
  listarProcessos,
  removerProcesso,
  monitorarProcesso,
  monitorarTodos,
  marcarAlertasLidosPorCNJ,
} from '@/services/escritorio.service'
import type { EscritorioProcesso } from '@/types/escritorio'

interface ToastEntry { id: number; msg: string }

const POLO_LABELS: Record<string, string> = {
  ATIVO: 'Ativo',
  PASSIVO: 'Passivo',
  TERCEIRO: 'Terceiro',
}

const POLO_VARIANT: Record<string, 'success' | 'danger' | 'default'> = {
  ATIVO: 'success',
  PASSIVO: 'danger',
  TERCEIRO: 'default',
}

function formatDate(iso?: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function MeusProcessos() {
  const navigate = useNavigate()
  const [processos, setProcessos] = useState<EscritorioProcesso[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState('')
  const [filtroPolo, setFiltroPolo] = useState('TODOS')
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<EscritorioProcesso | undefined>()
  const [monitorando, setMonitorando] = useState<string | null>(null)
  const [toasts, setToasts] = useState<ToastEntry[]>([])
  const toastIdRef = useRef(0)
  const toastTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const carregar = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await listarProcessos()
      setProcessos(data)
    } catch {
      setError('Erro ao carregar processos do escritório.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  // Cleanup de todos os timers de toast ao desmontar
  useEffect(() => () => { toastTimersRef.current.forEach(clearTimeout) }, [])

  const showToast = useCallback((msg: string) => {
    const id = ++toastIdRef.current
    setToasts(prev => [...prev, { id, msg }])
    const timer = setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
    toastTimersRef.current.push(timer)
  }, [])

  const handleRemover = useCallback(async (cnj: string, clienteNome: string) => {
    if (!confirm(`Remover "${clienteNome}" (${cnj}) do cadastro do escritório?`)) return
    try {
      await removerProcesso(cnj)
      showToast('Processo removido com sucesso.')
      carregar()
    } catch {
      showToast('Erro ao remover processo.')
    }
  }, [carregar, showToast])

  const handleMonitorar = useCallback(async (cnj: string) => {
    setMonitorando(cnj)
    try {
      const resultado = await monitorarProcesso(cnj)
      showToast(resultado.mensagem)
      carregar()
    } catch {
      showToast('Erro ao verificar atualizações.')
    } finally {
      setMonitorando(null)
    }
  }, [carregar, showToast])

  const handleVer = useCallback(async (proc: EscritorioProcesso) => {
    if ((proc.alertasNaoLidos || 0) > 0) {
      try { await marcarAlertasLidosPorCNJ(proc.cnj) } catch { /* ignora */ }
      setProcessos(prev => prev.map(p => p.cnj === proc.cnj ? { ...p, alertasNaoLidos: 0 } : p))
    }
    navigate(`/process/${encodeURIComponent(proc.cnj)}`)
  }, [navigate])

  const handleMonitorarTodos = useCallback(async () => {
    setMonitorando('todos')
    try {
      const res = await monitorarTodos()
      showToast(res.mensagem)
      setTimeout(carregar, 3000)
    } catch {
      showToast('Erro ao iniciar monitoramento.')
    } finally {
      setMonitorando(null)
    }
  }, [carregar, showToast])

  const processosFiltered = useMemo(() => processos.filter(p => {
    const matchTexto = filtro === '' ||
      p.cnj.includes(filtro) ||
      p.clienteNome.toLowerCase().includes(filtro.toLowerCase()) ||
      (p.responsavel || '').toLowerCase().includes(filtro.toLowerCase())
    const matchPolo = filtroPolo === 'TODOS' || p.clientePolo === filtroPolo
    return matchTexto && matchPolo
  }), [processos, filtro, filtroPolo])

  const totalAlertas = useMemo(
    () => processos.reduce((acc, p) => acc + (p.alertasNaoLidos || 0), 0),
    [processos]
  )

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Toast stack */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(t => (
          <div key={t.id} className="bg-gray-900 text-white px-4 py-3 rounded-lg shadow-lg text-sm max-w-sm">
            {t.msg}
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meus Processos</h1>
          <p className="text-sm text-gray-500 mt-1">
            {processos.length} processo(s) cadastrado(s)
            {totalAlertas > 0 && (
              <span className="ml-2 text-red-600 font-medium">· {totalAlertas} alerta(s) não lido(s)</span>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {processos.some(p => p.monitorar) && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleMonitorarTodos}
              disabled={monitorando === 'todos'}
            >
              {monitorando === 'todos' ? 'Verificando...' : '🔄 Verificar todos'}
            </Button>
          )}
          <Button variant="primary" size="sm" onClick={() => { setEditando(undefined); setModalOpen(true) }}>
            + Cadastrar processo
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          type="text"
          value={filtro}
          onChange={e => setFiltro(e.target.value)}
          placeholder="Buscar por CNJ, cliente ou responsável..."
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={filtroPolo}
          onChange={e => setFiltroPolo(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="TODOS">Todos os polos</option>
          <option value="ATIVO">Ativo (Autor)</option>
          <option value="PASSIVO">Passivo (Réu)</option>
          <option value="TERCEIRO">Terceiro</option>
        </select>
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>
      ) : processosFiltered.length === 0 ? (
        <Empty
          title={processos.length === 0 ? 'Nenhum processo cadastrado' : 'Nenhum resultado'}
          description={
            processos.length === 0
              ? 'Cadastre os processos do seu escritório para acessá-los rapidamente e monitorar atualizações.'
              : 'Tente ajustar os filtros de busca.'
          }
          action={processos.length === 0 ? {
            label: '+ Cadastrar primeiro processo',
            onClick: () => { setEditando(undefined); setModalOpen(true) },
          } : undefined}
        />
      ) : (
        <div className="space-y-3">
          {processosFiltered.map(proc => (
            <div
              key={proc.cnj}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors"
            >
              <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                {/* Info principal */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <button
                      onClick={() => handleVer(proc)}
                      className="text-blue-600 hover:underline font-mono text-sm font-medium"
                    >
                      {proc.cnj}
                    </button>
                    <Badge variant={POLO_VARIANT[proc.clientePolo]}>
                      {POLO_LABELS[proc.clientePolo]}
                    </Badge>
                    {proc.monitorar && (
                      <span className="text-xs text-green-600 bg-green-50 border border-green-200 rounded px-1.5 py-0.5">
                        Monitorando
                      </span>
                    )}
                    {(proc.alertasNaoLidos || 0) > 0 && (
                      <span className="text-xs text-white bg-red-500 rounded-full px-2 py-0.5 font-medium">
                        {proc.alertasNaoLidos} novo(s)
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row sm:gap-6 text-sm text-gray-600">
                    <span><strong className="text-gray-800">{proc.clienteNome}</strong></span>
                    {proc.processo?.classe && <span>{proc.processo.classe}</span>}
                    {proc.processo?.status && (
                      <span className="text-gray-500">{proc.processo.status}</span>
                    )}
                  </div>

                  {proc.responsavel && (
                    <p className="text-xs text-gray-400 mt-1">Responsável: {proc.responsavel}</p>
                  )}

                  <div className="flex gap-4 text-xs text-gray-400 mt-1">
                    <span>Cadastrado: {formatDate(proc.createdAt)}</span>
                    {proc.ultimaVerificacao && (
                      <span>Verificado: {formatDate(proc.ultimaVerificacao)}</span>
                    )}
                  </div>

                  {proc.notas && (
                    <p className="text-xs text-gray-500 italic mt-1 truncate">{proc.notas}</p>
                  )}
                </div>

                {/* Ações */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleVer(proc)}
                  >
                    Ver
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleMonitorar(proc.cnj)}
                    disabled={monitorando === proc.cnj}
                  >
                    {monitorando === proc.cnj ? '...' : '🔄'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setEditando(proc); setModalOpen(true) }}
                  >
                    ✏️
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleRemover(proc.cnj, proc.clienteNome)}
                  >
                    ✕
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      <CadastroProcessoModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditando(undefined) }}
        onSuccess={() => { carregar(); showToast(editando ? 'Cadastro atualizado.' : 'Processo cadastrado com sucesso!') }}
        editando={editando}
      />
    </div>
  )
}
