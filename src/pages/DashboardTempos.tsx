import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import Card, { CardContent } from '@/components/common/Card'
import Button from '@/components/common/Button'
import { Spinner } from '@/components/common/Loading'
import Empty from '@/components/common/Empty'
import { listarMetricasTempo } from '@/services/escritorio.service'
import type { MetricasTempo } from '@/types/escritorio'

type Periodo = '6m' | '1a' | 'tudo'

const PERIODO_LABEL: Record<Periodo, string> = {
  '6m': 'Últimos 6 meses',
  '1a': 'Último ano',
  'tudo': 'Todo período',
}

const SUMMARY_CARDS = (r: MetricasTempo['resumo']) => [
  { label: 'Processos', value: String(r.totalProcessos), color: 'text-gray-800' },
  { label: 'Com Sentença', value: String(r.processosComSentenca), color: 'text-blue-600' },
  { label: 'Em Liquidação', value: String(r.processosEmLiquidacao), color: 'text-green-600' },
  { label: 'Média Geral', value: r.mediaGeralDias != null ? `${r.mediaGeralDias}d` : '—', color: 'text-purple-600' },
]

const DashboardTempos: React.FC = () => {
  const navigate = useNavigate()
  const [periodo, setPeriodo] = useState<Periodo>('tudo')
  const [dados, setDados] = useState<MetricasTempo | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

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

  useEffect(() => { carregar(periodo) }, [periodo, carregar])

  const chartData = (dados?.porTribunal ?? []).map(t => ({
    tribunal: t.tribunal,
    'Dist. → Sentença': t.mediaDistribuicaoSentenca,
    'Sentença → Liquidação': t.mediaSentencaLiquidacao,
  }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tempos Processuais</h1>
          <p className="text-gray-500 text-sm mt-1">
            Métricas calculadas a partir dos processos monitorados
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
          <Button variant="secondary" size="sm" onClick={() => navigate('/meus-processos')}>
            Meus Processos
          </Button>
        </div>
      </div>

      {/* Loading */}
      {loading && <div className="flex justify-center py-16"><Spinner /></div>}

      {/* Erro */}
      {!loading && erro && (
        <Card>
          <CardContent className="py-8 text-center text-red-600 text-sm">{erro}</CardContent>
        </Card>
      )}

      {/* Vazio */}
      {!loading && !erro && dados?.resumo.totalProcessos === 0 && (
        <Empty
          title="Nenhum processo monitorado"
          description="Cadastre processos em Meus Processos para ver as métricas de tempo."
          action={{ label: 'Ir para Meus Processos', onClick: () => navigate('/meus-processos') }}
        />
      )}

      {/* Dados */}
      {!loading && !erro && dados && dados.resumo.totalProcessos > 0 && (
        <>
          {/* Cards de resumo */}
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

          {/* Gráfico + Tabela lado a lado */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Gráfico — 3/5 */}
            <Card className="lg:col-span-3">
              <CardContent>
                <h2 className="font-semibold text-gray-900 mb-4">📊 Tempo Médio por Tribunal</h2>
                {chartData.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-8">
                    Sem movimentações cacheadas para o período selecionado.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="tribunal" tick={{ fontSize: 12 }} />
                      <YAxis tickFormatter={v => `${v}d`} tick={{ fontSize: 12 }} />
                      <Tooltip
                        formatter={(v: unknown) => [v != null ? `${v} dias` : '—']}
                      />
                      <Legend />
                      <Bar dataKey="Dist. → Sentença" fill="#3b82f6" />
                      <Bar dataKey="Sentença → Liquidação" fill="#10b981" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Tabela — 2/5 */}
            <Card className="lg:col-span-2">
              <CardContent>
                <h2 className="font-semibold text-gray-900 mb-4">⚖️ Por Tipo de Ação</h2>
                {dados.porTipoAcao.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-4">Sem dados.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Tipo</th>
                          <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500 uppercase">N</th>
                          <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Média</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {dados.porTipoAcao.map(t => (
                          <tr key={t.tipoAcao} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-800 text-xs">{t.tipoAcao}</td>
                            <td className="px-3 py-2 text-center text-gray-600">{t.totalProcessos}</td>
                            <td className="px-3 py-2 text-center font-medium text-purple-600">
                              {t.mediaTempoTotal != null ? `${t.mediaTempoTotal}d` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

export default DashboardTempos
