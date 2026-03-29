import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LabelList,
  Cell,
} from 'recharts'
import Card, { CardContent } from '@/components/common/Card'
import Button from '@/components/common/Button'
import { Spinner } from '@/components/common/Loading'
import Empty from '@/components/common/Empty'
import { EditarFaseModal } from '@/components/process/EditarFaseModal'
import { listarMetricasTempo, verificarCadastro } from '@/services/escritorio.service'
import { apiClient } from '@/services/api'
import type { MetricasTempo, ProcessoTempoResumo, EscritorioProcesso } from '@/types/escritorio'

const FASE_COLOR: Record<string, string> = {
  Conhecimento: '#3b82f6',
  Sentenciado: '#f59e0b',
  'Liquidação / Execução': '#10b981',
  'Aguardando RPV': '#e11d48',
}

type Periodo = '6m' | '1a' | 'tudo'
type FiltroResumo = 'todos' | 'sentenca' | 'liquidacao' | 'conhecimento' | 'rpv'

const PERIODO_LABEL: Record<Periodo, string> = {
  '6m': 'Últimos 6 meses',
  '1a': 'Último ano',
  tudo: 'Todo período',
}

const DIST_SENTENCA_KEY = 'Dist. -> Sentença'
const SENTENCA_LIQUIDACAO_KEY = 'Sentença -> Liquidação'

function formatDias(days: number | null | undefined): string {
  if (days == null) return '-'
  const d = Math.round(days)
  const abs = Math.abs(d)
  if (abs < 30) return `${d}d`
  const anos = Math.floor(abs / 365)
  const meses = Math.floor((abs % 365) / 30)
  const sinal = d < 0 ? '-' : ''
  if (anos > 0 && meses > 0) return `${sinal}${anos}a ${meses}m`
  if (anos > 0) return `${sinal}${anos}a`
  return `${sinal}${meses}m`
}

function formatChartLabel(value: unknown) {
  return typeof value === 'number' ? formatDias(value) : ''
}

function formatDate(value: string | null | undefined) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('pt-BR')
}

function filtrarProcessos(processos: ProcessoTempoResumo[], filtro: FiltroResumo) {
  switch (filtro) {
    case 'sentenca':
      return processos.filter(processo => processo.temSentenca)
    case 'liquidacao':
      return processos.filter(processo => processo.fase === 'Liquidação / Execução')
    case 'conhecimento':
      return processos.filter(processo => processo.fase === 'Conhecimento')
    case 'rpv':
      return processos.filter(processo => processo.aguardandoRpv)
    default:
      return processos
  }
}

const FILTER_META: Record<FiltroResumo, { titulo: string; descricao: string }> = {
  todos: {
    titulo: 'Todos os processos monitorados',
    descricao: 'Lista completa dos processos considerados nas métricas atuais.',
  },
  sentenca: {
    titulo: 'Processos com sentença',
    descricao: 'Processos que já tiveram sentença ou acórdão identificado nas movimentações.',
  },
  liquidacao: {
    titulo: 'Processos em liquidação',
    descricao: 'Processos em fase de liquidação, execução ou cumprimento de sentença.',
  },
  conhecimento: {
    titulo: 'Processos em conhecimento',
    descricao: 'Processos ainda sem sentença ou sem avanço para execução identificado.',
  },
  rpv: {
    titulo: 'Processos aguardando RPV',
    descricao: 'Processos com indício de RPV/requisitório sem baixa posterior de pagamento.',
  },
}

const DashboardTempos: React.FC = () => {
  const navigate = useNavigate()
  const [periodo, setPeriodo] = useState<Periodo>('tudo')
  const [dados, setDados] = useState<MetricasTempo | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [sincronizando, setSincronizando] = useState(false)
  const [msgSync, setMsgSync] = useState<string | null>(null)
  const [filtroResumo, setFiltroResumo] = useState<FiltroResumo>('todos')
  const [modalOpen, setModalOpen] = useState(false)
  const [processoSelecionado, setProcessoSelecionado] = useState<EscritorioProcesso | null>(null)
  const [faseAtual, setFaseAtual] = useState<string | null>(null)

  const carregar = useCallback(async (p: Periodo) => {
    setLoading(true)
    setErro(null)
    try {
      setDados(await listarMetricasTempo(p))
    } catch {
      setErro('Não foi possível carregar as métricas. Verifique se o backend está rodando.')
    } finally {
      setLoading(false)
    }
  }, [])

  const sincronizarAssuntos = useCallback(async () => {
    setSincronizando(true)
    setMsgSync(null)
    try {
      const res = await apiClient.post('/api/escritorio/sincronizar-assuntos', {}, { timeout: 120000 })
      const { atualizados, total, erros } = res.data
      const erroResumo = erros?.length > 0
        ? ` (${erros.length} falha(s): ${[...new Set(erros.map((e: { motivo: string }) => e.motivo))].join(', ')})`
        : ''
      setMsgSync(`${atualizados} de ${total} processos atualizados.${erroResumo}`)
      await carregar(periodo)
    } catch {
      setMsgSync('Erro ao sincronizar. Verifique o backend.')
    } finally {
      setSincronizando(false)
    }
  }, [carregar, periodo])

  const handleAbrirProcesso = useCallback(async (cnj: string, faseAtualDaTabela?: string) => {
    try {
      const processo = await verificarCadastro(cnj)
      setProcessoSelecionado(processo)
      setFaseAtual(faseAtualDaTabela || null)
      setModalOpen(true)
    } catch {
      navigate(`/process/${encodeURIComponent(cnj)}`)
    }
  }, [navigate])

  const handleVerProcesso = useCallback((cnj: string) => {
    navigate(`/process/${encodeURIComponent(cnj)}`)
  }, [navigate])

  useEffect(() => {
    carregar(periodo)
  }, [periodo, carregar])

  useEffect(() => {
    setFiltroResumo('todos')
  }, [periodo])

  const chartData = (dados?.porTribunal ?? []).map(t => ({
    tribunal: t.tribunal,
    [DIST_SENTENCA_KEY]: t.mediaDistribuicaoSentenca,
    [SENTENCA_LIQUIDACAO_KEY]: t.mediaSentencaLiquidacao,
  }))

  const processosFiltrados = useMemo(
    () => filtrarProcessos(dados?.processos ?? [], filtroResumo),
    [dados?.processos, filtroResumo]
  )

  const summaryCards = dados ? [
    { key: 'todos' as const, label: 'Processos', value: String(dados.resumo.totalProcessos), color: 'text-gray-800', active: filtroResumo === 'todos' },
    { key: 'sentenca' as const, label: 'Com Sentença', value: String(dados.resumo.processosComSentenca), color: 'text-blue-600', active: filtroResumo === 'sentenca' },
    { key: 'liquidacao' as const, label: 'Em Liquidação', value: String(dados.resumo.processosEmLiquidacao), color: 'text-green-600', active: filtroResumo === 'liquidacao' },
    { key: 'conhecimento' as const, label: 'Em Conhecimento', value: String(dados.resumo.processosEmConhecimento), color: 'text-sky-600', active: filtroResumo === 'conhecimento' },
    { key: 'rpv' as const, label: 'Aguardando RPV', value: String(dados.resumo.processosAguardandoRpv), color: 'text-rose-600', active: filtroResumo === 'rpv' },
  ] : []

  const filtroAtual = FILTER_META[filtroResumo]

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900">Tempos Processuais</h1>
          <p className="mt-1 text-sm text-gray-500">
            Métricas calculadas a partir dos processos monitorados pelo escritório.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <select
            value={periodo}
            onChange={e => setPeriodo(e.target.value as Periodo)}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {(Object.entries(PERIODO_LABEL) as [Periodo, string][]).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <Button variant="secondary" onClick={sincronizarAssuntos} disabled={sincronizando}>
            {sincronizando ? 'Sincronizando...' : 'Sincronizar assuntos'}
          </Button>
          <Button variant="secondary" onClick={() => navigate('/meus-processos')}>
            Meus processos
          </Button>
        </div>
      </div>

      {msgSync && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {msgSync}
        </div>
      )}

      {loading && <div className="flex justify-center py-16"><Spinner /></div>}

      {!loading && erro && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-red-600">{erro}</CardContent>
        </Card>
      )}

      {!loading && !erro && dados?.resumo.totalProcessos === 0 && (
        <Empty
          title="Nenhum processo monitorado"
          description="Cadastre processos em Meus Processos para ver as métricas de tempo."
          action={{ label: 'Ir para Meus Processos', onClick: () => navigate('/meus-processos') }}
        />
      )}

      {!loading && !erro && dados && dados.resumo.totalProcessos > 0 && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            {summaryCards.map(card => (
              <button
                key={card.key}
                type="button"
                onClick={() => setFiltroResumo(card.key)}
                className="text-left"
              >
                <Card className={card.active ? 'border-blue-500 ring-2 ring-blue-100' : 'hover:border-gray-300 hover:shadow-md'}>
                  <CardContent className="py-6 text-center">
                    <div className={`text-3xl font-semibold ${card.color}`}>{card.value}</div>
                    <div className="mt-2 text-xs font-medium uppercase tracking-[0.2em] text-gray-500">{card.label}</div>
                    <div className="mt-3 text-xs text-blue-600">Clique para ver os processos</div>
                  </CardContent>
                </Card>
              </button>
            ))}
          </div>

          <Card>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">{filtroAtual.titulo}</h2>
                  <p className="text-sm text-gray-500">{filtroAtual.descricao}</p>
                </div>
                {filtroResumo !== 'todos' && (
                  <Button variant="secondary" onClick={() => setFiltroResumo('todos')}>
                    Limpar filtro
                  </Button>
                )}
              </div>

              {processosFiltrados.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-400">Nenhum processo encontrado para este filtro.</p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-gray-200">
                  <div className="max-h-[420px] overflow-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                        <tr>
                          <th className="px-4 py-3">Cliente</th>
                          <th className="px-4 py-3">CNJ</th>
                          <th className="px-4 py-3">Fase</th>
                          <th className="px-4 py-3">Tempo</th>
                          <th className="px-4 py-3">Últ. mov.</th>
                          <th className="px-4 py-3">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {processosFiltrados.map(processo => (
                          <tr key={`${processo.cnj}-${processo.fase}`} className="hover:bg-gray-50">
                            <td className="px-4 py-3">
                              <div className="font-medium text-gray-800">{processo.clienteNome}</div>
                              <div className="text-xs text-gray-500">{processo.tribunal || 'Tribunal não informado'}</div>
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-gray-700">{processo.cnj}</td>
                            <td className="px-4 py-3">
                              <span
                                className="inline-flex rounded-full px-2.5 py-1 text-xs font-medium text-white"
                                style={{ backgroundColor: FASE_COLOR[processo.fase] || '#6b7280' }}
                              >
                                {processo.fase}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-700">{formatDias(processo.tempoTotalDias)}</td>
                            <td className="px-4 py-3 text-gray-700">{formatDate(processo.ultimaMovimentacaoData)}</td>
                            <td className="px-4 py-3 space-x-2 flex">
                              <Button variant="secondary" size="sm" onClick={() => handleAbrirProcesso(processo.cnj, processo.fase)}>
                                Editar Fase
                              </Button>
                              <Button variant="secondary" size="sm" onClick={() => handleVerProcesso(processo.cnj)}>
                                Ver Processo
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
            <Card className="xl:col-span-3">
              <CardContent className="space-y-4">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Tempo médio por tribunal</h2>
                  <p className="text-sm text-gray-500">Visão comparativa entre sentença e liquidação.</p>
                </div>
                {chartData.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-400">Sem movimentações cacheadas para o período selecionado.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={chartData} margin={{ top: 20, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="tribunal" tick={{ fontSize: 12 }} />
                      <YAxis tickFormatter={v => formatDias(v as number)} tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(v: unknown) => [typeof v === 'number' ? formatDias(v) : '-']} />
                      <Legend />
                      <Bar dataKey={DIST_SENTENCA_KEY} fill="#3b82f6">
                        <LabelList dataKey={DIST_SENTENCA_KEY} position="top" formatter={formatChartLabel} style={{ fontSize: 12, fill: '#1f2937' }} />
                      </Bar>
                      <Bar dataKey={SENTENCA_LIQUIDACAO_KEY} fill="#10b981">
                        <LabelList dataKey={SENTENCA_LIQUIDACAO_KEY} position="top" formatter={formatChartLabel} style={{ fontSize: 12, fill: '#1f2937' }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="xl:col-span-2">
              <CardContent className="space-y-4">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Por fase processual</h2>
                  <p className="text-sm text-gray-500">Distribuição e tempo médio por etapa.</p>
                </div>
                {(dados.porFase ?? []).length === 0 ? (
                  <p className="py-4 text-center text-sm text-gray-400">Sem dados.</p>
                ) : (
                  <div className="space-y-4">
                    {(dados.porFase ?? []).map(f => {
                      const cor = FASE_COLOR[f.fase] ?? '#6b7280'
                      const pct = Math.max(6, Math.round((f.totalProcessos / Math.max(dados.resumo.totalProcessos, 1)) * 100))
                      return (
                        <button
                          key={f.fase}
                          type="button"
                          onClick={() => {
                            if (f.fase === 'Conhecimento') setFiltroResumo('conhecimento')
                            else if (f.fase === 'Aguardando RPV') setFiltroResumo('rpv')
                            else if (f.fase === 'Liquidação / Execução') setFiltroResumo('liquidacao')
                            else if (f.fase === 'Sentenciado') setFiltroResumo('sentenca')
                          }}
                          className="block w-full text-left"
                        >
                          <div>
                            <div className="mb-1 flex items-center justify-between gap-3">
                              <span className="text-sm font-medium text-gray-700">{f.fase}</span>
                              <span className="text-xs text-gray-500">{f.totalProcessos} proc. · {formatDias(f.mediaTempoTotal)} média</span>
                            </div>
                            <div className="h-2 w-full rounded-full bg-gray-100">
                              <div className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: cor }} />
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="py-6 text-center">
              <div className="text-3xl font-semibold text-amber-600">{formatDias(dados.resumo.mediaGeralDias)}</div>
              <div className="mt-2 text-xs font-medium uppercase tracking-[0.2em] text-gray-500">Média Geral</div>
            </CardContent>
          </Card>

          {(dados.porAssunto ?? []).length > 0 && (
            <Card>
              <CardContent className="space-y-4">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Processos por assunto</h2>
                  <p className="text-sm text-gray-500">Top 10 assuntos mais recorrentes na base monitorada.</p>
                </div>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={dados.porAssunto} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                    <YAxis
                      type="category"
                      dataKey="assunto"
                      width={220}
                      tick={{ fontSize: 11 }}
                      tickFormatter={v => v.length > 35 ? v.slice(0, 33) + '…' : v}
                    />
                    <Tooltip />
                    <Bar dataKey="totalProcessos" name="Processos" radius={[0, 4, 4, 0]}>
                      {(dados.porAssunto ?? []).map((_, i) => (
                        <Cell key={i} fill={i % 2 === 0 ? '#2563eb' : '#93c5fd'} />
                      ))}
                      <LabelList dataKey="totalProcessos" position="right" style={{ fontSize: 12, fill: '#374151' }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <EditarFaseModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false)
          setProcessoSelecionado(null)
        }}
        onSuccess={() => {
          setModalOpen(false)
          setProcessoSelecionado(null)
          carregar(periodo)
        }}
        processo={processoSelecionado}
        faseAtual={faseAtual}
      />
    </div>
  )
}

export default DashboardTempos
