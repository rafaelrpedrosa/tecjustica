import React, { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Card, { CardContent } from '@/components/common/Card'
import Button from '@/components/common/Button'
import Empty from '@/components/common/Empty'
import { RetornoModal } from '@/components/process/RetornoModal'
import {
  listarDiligencias,
  atualizarDiligencia,
} from '@/services/diligencia.service'
import type {
  DiligenciaOperacional,
  PrioridadeDiligencia,
  StatusDiligencia,
} from '@/types/diligencia'

const PRIORIDADE_ORDER: Record<PrioridadeDiligencia, number> = {
  URGENTE: 0, ALTA: 1, NORMAL: 2, MONITORAR: 3,
}

const PRIORIDADE_STYLE: Record<PrioridadeDiligencia, string> = {
  URGENTE: 'bg-red-100 text-red-700 border border-red-200',
  ALTA: 'bg-yellow-100 text-yellow-700 border border-yellow-200',
  NORMAL: 'bg-gray-100 text-gray-600 border border-gray-200',
  MONITORAR: 'bg-blue-50 text-blue-600 border border-blue-200',
}

const ROW_STYLE: Record<PrioridadeDiligencia, string> = {
  URGENTE: 'bg-red-50',
  ALTA: 'bg-yellow-50',
  NORMAL: '',
  MONITORAR: 'bg-blue-50/30',
}

const STATUS_STYLE: Record<StatusDiligencia, string> = {
  PENDENTE: 'bg-amber-100 text-amber-700',
  EM_ANDAMENTO: 'bg-blue-100 text-blue-700',
  CONCLUIDA: 'bg-green-100 text-green-700',
  SEM_RETORNO: 'bg-gray-100 text-gray-500',
}

const STATUS_LABEL: Record<StatusDiligencia, string> = {
  PENDENTE: 'Pendente',
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDA: 'Concluída',
  SEM_RETORNO: 'Sem retorno',
}

const ACAO_LABEL: Record<string, string> = {
  LIGACAO_SECRETARIA: '📞 Lig. Secretaria',
  LIGACAO_GABINETE: '📞 Lig. Gabinete',
  EMAIL_VARA: '📧 Email Vara',
  RECHECK: '🔄 Recheck',
}

function ordenar(lista: DiligenciaOperacional[]): DiligenciaOperacional[] {
  return [...lista].sort((a, b) => {
    const pa = PRIORIDADE_ORDER[a.prioridade]
    const pb = PRIORIDADE_ORDER[b.prioridade]
    if (pa !== pb) return pa - pb
    return b.diasParado - a.diasParado
  })
}

const FilaDiligencias: React.FC = () => {
  const navigate = useNavigate()
  const [lista, setLista] = useState<DiligenciaOperacional[]>(() => ordenar(listarDiligencias()))
  const [busca, setBusca] = useState('')
  const [filtroPrioridade, setFiltroPrioridade] = useState<PrioridadeDiligencia | ''>('')
  const [filtroStatus, setFiltroStatus] = useState<StatusDiligencia | ''>('')
  const [modalDiligencia, setModalDiligencia] = useState<DiligenciaOperacional | null>(null)

  const recarregar = useCallback(() => {
    setLista(ordenar(listarDiligencias()))
  }, [])

  function iniciar(d: DiligenciaOperacional) {
    atualizarDiligencia(d.id, { status: 'EM_ANDAMENTO' })
    recarregar()
  }

  function concluir(d: DiligenciaOperacional) {
    atualizarDiligencia(d.id, { status: 'CONCLUIDA', dataExecucao: new Date().toISOString() })
    recarregar()
  }

  const filtrada = lista.filter((d) => {
    const termo = busca.toLowerCase()
    const matchBusca = !busca ||
      d.cnj.includes(termo) ||
      (d.clienteNome?.toLowerCase().includes(termo) ?? false)
    const matchPrioridade = !filtroPrioridade || d.prioridade === filtroPrioridade
    const matchStatus = !filtroStatus || d.status === filtroStatus
    return matchBusca && matchPrioridade && matchStatus
  })

  const filtrosAtivos = !!(busca || filtroPrioridade || filtroStatus)

  const limparFiltros = useCallback(() => {
    setBusca('')
    setFiltroPrioridade('')
    setFiltroStatus('')
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fila de Diligências</h1>
          <p className="text-gray-500 text-sm mt-1">
            {lista.filter(d => d.status !== 'CONCLUIDA').length} pendentes ·{' '}
            {lista.filter(d => d.prioridade === 'URGENTE' && d.status !== 'CONCLUIDA').length} urgentes
          </p>
        </div>
        <Button variant="secondary" onClick={() => navigate('/dashboard-operacional')}>
          📊 Dashboard
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              placeholder="Buscar por CNJ ou cliente..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="border border-gray-300 rounded px-3 py-2 text-sm flex-1 min-w-48 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={filtroPrioridade}
              onChange={(e) => setFiltroPrioridade(e.target.value as PrioridadeDiligencia | '')}
              className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todas as prioridades</option>
              <option value="URGENTE">Urgente</option>
              <option value="ALTA">Alta</option>
              <option value="NORMAL">Normal</option>
              <option value="MONITORAR">Monitorar</option>
            </select>
            <select
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value as StatusDiligencia | '')}
              className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todos os status</option>
              <option value="PENDENTE">Pendente</option>
              <option value="EM_ANDAMENTO">Em andamento</option>
              <option value="CONCLUIDA">Concluída</option>
              <option value="SEM_RETORNO">Sem retorno</option>
            </select>
            {filtrosAtivos && (
              <button
                type="button"
                onClick={limparFiltros}
                aria-label="Limpar filtros"
                className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
              >
                ✕ Limpar filtros
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Contador de resultados */}
      {filtrosAtivos && filtrada.length < lista.length && (
        <p className="text-sm text-gray-500">
          Exibindo <span className="font-medium">{filtrada.length}</span> de{' '}
          <span className="font-medium">{lista.length}</span> diligência{lista.length !== 1 ? 's' : ''}
        </p>
      )}

      {filtrada.length === 0 ? (
        <Empty
          title="Nenhuma diligência encontrada"
          description="Abra um processo com gargalo detectado e clique em 'Gerar Diligência'."
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">CNJ / Cliente</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Gargalo</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Dias</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Prioridade</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Ação</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Retorno</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtrada.map((d) => (
                  <tr key={d.id} className={`${ROW_STYLE[d.prioridade]} hover:brightness-95 transition-all`}>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => navigate(`/process/${d.cnj}`)}
                        className="text-blue-600 hover:underline text-xs font-mono block"
                      >
                        {d.cnj}
                      </button>
                      {d.clienteNome && (
                        <span className="text-gray-700 text-xs font-medium">{d.clienteNome}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 max-w-48">
                      {d.descricao}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`font-bold text-base ${
                        d.prioridade === 'URGENTE' ? 'text-red-600' :
                        d.prioridade === 'ALTA' ? 'text-yellow-600' : 'text-gray-600'
                      }`}>
                        {d.diasParado}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${PRIORIDADE_STYLE[d.prioridade]}`}>
                        {d.prioridade}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-700">
                      {ACAO_LABEL[d.acaoRecomendada] ?? d.acaoRecomendada}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_STYLE[d.status]}`}>
                        {STATUS_LABEL[d.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 italic max-w-40 truncate">
                      {d.retorno ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-1 justify-end flex-wrap">
                        {d.status === 'PENDENTE' && (
                          <button
                            onClick={() => iniciar(d)}
                            className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                          >
                            ▶ Iniciar
                          </button>
                        )}
                        {d.status !== 'CONCLUIDA' && (
                          <>
                            <button
                              onClick={() => setModalDiligencia(d)}
                              className="px-2 py-1 bg-white border border-gray-300 rounded text-xs hover:bg-gray-50"
                            >
                              📝 Retorno
                            </button>
                            <button
                              onClick={() => concluir(d)}
                              className="px-2 py-1 bg-white border border-gray-300 rounded text-xs hover:bg-gray-50"
                            >
                              ✓ Concluir
                            </button>
                          </>
                        )}
                        {d.status === 'CONCLUIDA' && (
                          <span className="text-gray-400 text-xs px-2">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {modalDiligencia && (
        <RetornoModal
          diligencia={modalDiligencia}
          onClose={() => setModalDiligencia(null)}
          onSaved={recarregar}
        />
      )}
    </div>
  )
}

export default FilaDiligencias
