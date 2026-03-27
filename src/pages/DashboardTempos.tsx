import React, { useState, useEffect, useCallback } from 'react'
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
import { listarMetricasTempo } from '@/services/escritorio.service'
import { apiClient } from '@/services/api'
import type { MetricasTempo } from '@/types/escritorio'

const FASE_COLOR: Record<string, string> = {
  'Conhecimento': '#3b82f6',
  'Sentenciado': '#f59e0b',
  'Liquidação / Execução': '#10b981',
}

type Periodo = '6m' | '1a' | 'tudo'

const PERIODO_LABEL: Record<Periodo, string> = {
  '6m': 'Ultimos 6 meses',
  '1a': 'Ultimo ano',
  tudo: 'Todo periodo',
}

const DIST_SENTENCA_KEY = 'Dist. -> Sentenca'
const SENTENCA_LIQUIDACAO_KEY = 'Sentenca -> Liquidacao'

const SUMMARY_CARDS = (r: MetricasTempo['resumo']) => [
  { label: 'Processos', value: String(r.totalProcessos), color: 'text-gray-800' },
  { label: 'Com Sentenca', value: String(r.processosComSentenca), color: 'text-blue-600' },
  { label: 'Em Liquidacao', value: String(r.processosEmLiquidacao), color: 'text-green-600' },
  { label: 'Media Geral', value: formatDias(r.mediaGeralDias), color: 'text-purple-600' },
]

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

const DashboardTempos: React.FC = () => {
  const navigate = useNavigate()
  const [periodo, setPeriodo] = useState<Periodo>('tudo')
  const [dados, setDados] = useState<MetricasTempo | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [sincronizando, setSincronizando] = useState(false)
  const [msgSync, setMsgSync] = useState<string | null>(null)

  const carregar = useCallback(async (p: Periodo) => {
    setLoading(true)
    setErro(null)
    try {
      setDados(await listarMetricasTempo(p))
    } catch {
      setErro('Nao foi possivel carregar as metricas. Verifique se o backend esta rodando.')
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

  useEffect(() => {
    carregar(periodo)
  }, [periodo, carregar])

  const chartData = (dados?.porTribunal ?? []).map(t => ({
    tribunal: t.tribunal,
    [DIST_SENTENCA_KEY]: t.mediaDistribuicaoSentenca,
    [SENTENCA_LIQUIDACAO_KEY]: t.mediaSentencaLiquidacao,
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tempos Processuais</h1>
          <p className="text-gray-500 text-sm mt-1">
            Metricas calculadas a partir dos processos monitorados
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={periodo}
            onChange={e => setPeriodo(e.target.value as Periodo)}
            className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {(Object.entries(PERIODO_LABEL) as [Periodo, string][]).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <Button
            variant="secondary"
            size="sm"
            onClick={sincronizarAssuntos}
            disabled={sincronizando}
            title="Busca o assunto de todos os processos sem essa informação"
          >
            {sincronizando ? 'Sincronizando...' : 'Sincronizar Assuntos'}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => navigate('/meus-processos')}>
            Meus Processos
          </Button>
        </div>
      </div>

      {msgSync && (
        <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-4 py-2">
          {msgSync}
        </div>
      )}

      {loading && <div className="flex justify-center py-16"><Spinner /></div>}

      {!loading && erro && (
        <Card>
          <CardContent className="py-8 text-center text-red-600 text-sm">{erro}</CardContent>
        </Card>
      )}

      {!loading && !erro && dados?.resumo.totalProcessos === 0 && (
        <Empty
          title="Nenhum processo monitorado"
          description="Cadastre processos em Meus Processos para ver as metricas de tempo."
          action={{ label: 'Ir para Meus Processos', onClick: () => navigate('/meus-processos') }}
        />
      )}

      {!loading && !erro && dados && dados.resumo.totalProcessos > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {SUMMARY_CARDS(dados.resumo).map(c => (
              <Card key={c.label}>
                <CardContent className="py-5 text-center">
                  <p className={`text-3xl font-bold ${c.color}`}>{c.value}</p>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mt-2">{c.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <Card className="lg:col-span-3">
              <CardContent>
                <h2 className="font-semibold text-gray-900 mb-4">Tempo Medio por Tribunal</h2>
                {chartData.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-8">
                    Sem movimentacoes cacheadas para o periodo selecionado.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={chartData} margin={{ top: 20, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="tribunal" tick={{ fontSize: 12 }} />
                      <YAxis tickFormatter={v => formatDias(v as number)} tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(v: unknown) => [typeof v === 'number' ? formatDias(v) : '-']} />
                      <Legend />
                      <Bar dataKey={DIST_SENTENCA_KEY} fill="#3b82f6">
                        <LabelList
                          dataKey={DIST_SENTENCA_KEY}
                          position="top"
                          formatter={formatChartLabel}
                          style={{ fontSize: 12, fill: '#1f2937' }}
                        />
                      </Bar>
                      <Bar dataKey={SENTENCA_LIQUIDACAO_KEY} fill="#10b981">
                        <LabelList
                          dataKey={SENTENCA_LIQUIDACAO_KEY}
                          position="top"
                          formatter={formatChartLabel}
                          style={{ fontSize: 12, fill: '#1f2937' }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardContent>
                <h2 className="font-semibold text-gray-900 mb-4">Por Fase Processual</h2>
                {(dados.porFase ?? []).length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-4">Sem dados.</p>
                ) : (
                  <div className="space-y-3">
                    {(dados.porFase ?? []).map(f => {
                      const cor = FASE_COLOR[f.fase] ?? '#6b7280'
                      const pct = Math.round((f.totalProcessos / dados.resumo.totalProcessos) * 100)
                      return (
                        <div key={f.fase}>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-sm font-medium text-gray-700">{f.fase}</span>
                            <span className="text-xs text-gray-500">
                              {f.totalProcessos} proc · {formatDias(f.mediaTempoTotal)} média
                            </span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2">
                            <div
                              className="h-2 rounded-full"
                              style={{ width: `${pct}%`, backgroundColor: cor }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Gráfico por Assunto */}
          {(dados.porAssunto ?? []).length > 0 && (
            <Card>
              <CardContent>
                <h2 className="font-semibold text-gray-900 mb-4">Processos por Assunto <span className="text-xs font-normal text-gray-400">(top 10)</span></h2>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart
                    data={dados.porAssunto}
                    layout="vertical"
                    margin={{ top: 4, right: 40, left: 8, bottom: 4 }}
                  >
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
                        <Cell key={i} fill={i % 2 === 0 ? '#6366f1' : '#a5b4fc'} />
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
    </div>
  )
}

export default DashboardTempos
