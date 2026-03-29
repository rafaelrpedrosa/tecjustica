import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Card, { CardContent } from '@/components/common/Card'
import Button from '@/components/common/Button'
import Empty from '@/components/common/Empty'
import { RetornoModal } from '@/components/process/RetornoModal'
import { EditarDiligenciaModal } from '@/components/process/EditarDiligenciaModal'
import { listarDiligencias, atualizarDiligencia } from '@/services/diligencia.service'
import type { DiligenciaOperacional, PrioridadeDiligencia, StatusDiligencia } from '@/types/diligencia'

const PRIORIDADE_ORDER: Record<PrioridadeDiligencia, number> = {
  URGENTE: 0,
  ALTA: 1,
  NORMAL: 2,
  MONITORAR: 3,
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
  LIGACAO_SECRETARIA: 'Lig. secretaria',
  LIGACAO_GABINETE: 'Lig. gabinete',
  EMAIL_VARA: 'E-mail vara',
  RECHECK: 'Revisar',
}

function hojeLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const hoje = hojeLocal()
const vencida = (d: DiligenciaOperacional): boolean => !!d.proximaData && d.proximaData < hoje && d.status !== 'CONCLUIDA'

function exportarCSV(dados: DiligenciaOperacional[]): void {
  const headers = ['CNJ', 'Cliente', 'Gargalo', 'Dias Parado', 'Prioridade', 'Ação', 'Status', 'Responsável', 'Prazo', 'Retorno']
  const rows = dados.map(d => [
    d.cnj,
    d.clienteNome ?? '',
    d.descricao,
    d.diasParado,
    d.prioridade,
    ACAO_LABEL[d.acaoRecomendada] ?? d.acaoRecomendada,
    STATUS_LABEL[d.status],
    d.responsavel ?? '',
    d.proximaData ?? '',
    d.retorno ?? '',
  ])
  const csv = [headers, ...rows]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `diligencias-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
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
  const [lista, setLista] = useState<DiligenciaOperacional[]>([])
  const [busca, setBusca] = useState('')
  const [filtroPrioridade, setFiltroPrioridade] = useState<PrioridadeDiligencia | ''>('')
  const [filtroStatus, setFiltroStatus] = useState<StatusDiligencia | ''>('')
  const [modalDiligencia, setModalDiligencia] = useState<DiligenciaOperacional | null>(null)
  const [editarDiligencia, setEditarDiligencia] = useState<DiligenciaOperacional | null>(null)
  const [confirmarConclusao, setConfirmarConclusao] = useState<DiligenciaOperacional | null>(null)

  useEffect(() => {
    listarDiligencias().then(data => setLista(ordenar(data)))
  }, [])

  const recarregar = useCallback(async () => {
    const data = await listarDiligencias()
    setLista(ordenar(data))
  }, [])

  async function iniciar(d: DiligenciaOperacional) {
    await atualizarDiligencia(d.id, { status: 'EM_ANDAMENTO' })
    await recarregar()
  }

  async function concluir(d: DiligenciaOperacional) {
    await atualizarDiligencia(d.id, { status: 'CONCLUIDA', dataExecucao: new Date().toISOString() })
    await recarregar()
  }

  const filtrada = lista.filter(d => {
    const termo = busca.toLowerCase()
    const matchBusca = !busca || d.cnj.toLowerCase().includes(termo) || (d.clienteNome?.toLowerCase().includes(termo) ?? false)
    const matchPrioridade = !filtroPrioridade || d.prioridade === filtroPrioridade
    const matchStatus = !filtroStatus || d.status === filtroStatus
    return matchBusca && matchPrioridade && matchStatus
  })

  const pendentes = lista.filter(d => d.status !== 'CONCLUIDA').length
  const urgentes = lista.filter(d => d.prioridade === 'URGENTE' && d.status !== 'CONCLUIDA').length
  const vencidas = lista.filter(vencida).length
  const concluidas = lista.filter(d => d.status === 'CONCLUIDA').length
  const filtrosAtivos = !!(busca || filtroPrioridade || filtroStatus)

  const limparFiltros = useCallback(() => {
    setBusca('')
    setFiltroPrioridade('')
    setFiltroStatus('')
  }, [])

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900">Fila de Diligências</h1>
          <p className="mt-1 text-sm text-gray-500">Acompanhamento operacional das ações pendentes do escritório.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => exportarCSV(filtrada)}>Exportar CSV</Button>
          <Button variant="secondary" onClick={() => navigate('/dashboard-operacional')}>Dashboard operacional</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Pendentes', value: String(pendentes), color: 'text-amber-600' },
          { label: 'Urgentes', value: String(urgentes), color: 'text-red-600' },
          { label: 'Vencidas', value: String(vencidas), color: 'text-rose-600' },
          { label: 'Concluídas', value: String(concluidas), color: 'text-green-600' },
        ].map(card => (
          <Card key={card.label}>
            <CardContent className="py-6 text-center">
              <div className={`text-3xl font-semibold ${card.color}`}>{card.value}</div>
              <div className="mt-2 text-xs font-medium uppercase tracking-[0.2em] text-gray-500">{card.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-4 py-5">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Filtros</h2>
            <p className="text-sm text-gray-500">Refine a fila por cliente, prioridade ou status.</p>
          </div>
          <div className="flex flex-col gap-3 xl:flex-row">
            <input
              type="text"
              placeholder="Buscar por CNJ ou cliente..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={filtroPrioridade}
              onChange={e => setFiltroPrioridade(e.target.value as PrioridadeDiligencia | '')}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todas as prioridades</option>
              <option value="URGENTE">Urgente</option>
              <option value="ALTA">Alta</option>
              <option value="NORMAL">Normal</option>
              <option value="MONITORAR">Monitorar</option>
            </select>
            <select
              value={filtroStatus}
              onChange={e => setFiltroStatus(e.target.value as StatusDiligencia | '')}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todos os status</option>
              <option value="PENDENTE">Pendente</option>
              <option value="EM_ANDAMENTO">Em andamento</option>
              <option value="CONCLUIDA">Concluída</option>
              <option value="SEM_RETORNO">Sem retorno</option>
            </select>
            {filtrosAtivos && <Button variant="secondary" onClick={limparFiltros}>Limpar filtros</Button>}
          </div>
          {filtrosAtivos && (
            <p className="text-sm text-gray-500">Exibindo {filtrada.length} de {lista.length} diligências.</p>
          )}
        </CardContent>
      </Card>

      {filtrada.length === 0 ? (
        <Empty title="Nenhuma diligência encontrada" description="Abra um processo com gargalo detectado e clique em gerar diligência." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">CNJ / Cliente</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Gargalo</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Dias</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Prioridade</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Ação</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Prazo</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Retorno</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtrada.map(d => (
                    <tr key={d.id} className={`${ROW_STYLE[d.prioridade]} ${vencida(d) ? 'ring-1 ring-inset ring-red-300' : ''}`}>
                      <td className="px-4 py-4 align-top">
                        <button onClick={() => navigate(`/process/${d.cnj}`)} className="block text-left font-mono text-xs text-blue-600 hover:underline">
                          {d.cnj}
                        </button>
                        {d.clienteNome && <div className="mt-1 text-sm font-medium text-gray-800">{d.clienteNome}</div>}
                      </td>
                      <td className="px-4 py-4 align-top text-sm text-gray-600">{d.descricao}</td>
                      <td className="px-4 py-4 text-center align-top">
                        <span className={`text-lg font-semibold ${d.prioridade === 'URGENTE' ? 'text-red-600' : d.prioridade === 'ALTA' ? 'text-amber-600' : 'text-gray-700'}`}>{d.diasParado}</span>
                      </td>
                      <td className="px-4 py-4 text-center align-top">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${PRIORIDADE_STYLE[d.prioridade]}`}>{d.prioridade}</span>
                      </td>
                      <td className="px-4 py-4 align-top text-sm text-gray-700">{ACAO_LABEL[d.acaoRecomendada] ?? d.acaoRecomendada}</td>
                      <td className="px-4 py-4 text-center align-top">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${STATUS_STYLE[d.status]}`}>{STATUS_LABEL[d.status]}</span>
                      </td>
                      <td className="px-4 py-4 align-top text-sm">
                        {d.proximaData ? (
                          <span className={vencida(d) ? 'font-semibold text-red-600' : 'text-gray-600'}>{d.proximaData}</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="max-w-56 px-4 py-4 align-top text-sm italic text-gray-500">{d.retorno ?? '-'}</td>
                      <td className="px-4 py-4 text-right align-top">
                        <div className="flex flex-wrap justify-end gap-2">
                          {d.status === 'PENDENTE' && (
                            <Button size="sm" variant="secondary" onClick={() => iniciar(d)}>Iniciar</Button>
                          )}
                          {d.status !== 'CONCLUIDA' && (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => setEditarDiligencia(d)}>Editar</Button>
                              <Button size="sm" variant="secondary" onClick={() => setModalDiligencia(d)}>Registrar retorno</Button>
                              <Button size="sm" variant="secondary" onClick={() => setConfirmarConclusao(d)}>Concluir</Button>
                            </>
                          )}
                          {d.status === 'CONCLUIDA' && (
                            <Button size="sm" variant="ghost" onClick={() => setEditarDiligencia(d)}>Editar</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {confirmarConclusao && (
        <div role="dialog" aria-modal="true" aria-labelledby="confirmar-conclusao-titulo" onKeyDown={e => e.key === 'Escape' && setConfirmarConclusao(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 id="confirmar-conclusao-titulo" className="text-lg font-semibold text-gray-900">Confirmar conclusão</h3>
            <p className="mt-2 text-sm text-gray-600">
              Marcar a diligência de <span className="font-medium">{confirmarConclusao.clienteNome ?? confirmarConclusao.cnj}</span> como concluída?
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setConfirmarConclusao(null)}>Cancelar</Button>
              <Button onClick={() => { concluir(confirmarConclusao).finally(() => setConfirmarConclusao(null)) }}>Confirmar</Button>
            </div>
          </div>
        </div>
      )}

      {modalDiligencia && <RetornoModal diligencia={modalDiligencia} onClose={() => setModalDiligencia(null)} onSaved={recarregar} />}
      {editarDiligencia && <EditarDiligenciaModal diligencia={editarDiligencia} onClose={() => setEditarDiligencia(null)} onSaved={recarregar} />}
    </div>
  )
}

export default FilaDiligencias
