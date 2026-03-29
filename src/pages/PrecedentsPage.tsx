import React, { useState } from 'react'
import Card, { CardContent } from '@/components/common/Card'
import Button from '@/components/common/Button'
import Badge from '@/components/common/Badge'
import Empty from '@/components/common/Empty'
import { CacheTimestamp } from '@/components/common/CacheTimestamp'
import type { Precedent } from '@/types/precedent'
import { usePrecedents } from '@/hooks/usePrecedents'

const TYPE_COLORS: Record<string, 'success' | 'info' | 'warning' | 'default'> = {
  SUM: 'info',
  RG: 'success',
  IRDR: 'warning',
  RR: 'default',
  SV: 'success',
  CT: 'info',
}

const TYPE_LABELS: Record<string, string> = {
  SUM: 'Sumula',
  RG: 'Rep. Geral',
  IRDR: 'IRDR',
  RR: 'Recursos Repetitivos',
  SV: 'Sumula Vinculante',
  CT: 'Tema',
}

function getTypeColor(type: string): 'success' | 'info' | 'warning' | 'default' {
  return TYPE_COLORS[type] || 'default'
}

function getTypeLabel(type: string): string {
  return TYPE_LABELS[type] || type
}

const PrecedentsPage: React.FC = () => {
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [inputQuery, setInputQuery] = useState('')
  const [filters, setFilters] = useState({ tribunal: '', tipo: '' })
  const [inputError, setInputError] = useState<string | null>(null)

  const filtrosAtivos = (filters.tribunal || filters.tipo)
    ? {
        tribunais: filters.tribunal ? [filters.tribunal] : undefined,
        tipos: filters.tipo ? [filters.tipo] : undefined,
      }
    : undefined

  const { data, isLoading, isError, dataUpdatedAt, refetch } = usePrecedents(
    submittedQuery,
    filtrosAtivos,
    !!submittedQuery
  )

  const searched = !!submittedQuery
  const results: Precedent[] = data?.resultados ?? []

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputQuery.trim()) {
      setInputError('Insira um termo para buscar')
      return
    }
    setInputError(null)
    setSubmittedQuery(inputQuery.trim())
  }

  const handleClear = () => {
    setInputQuery('')
    setSubmittedQuery('')
    setInputError(null)
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Buscar precedentes</h1>
        <p className="text-sm text-gray-500 mt-1">Pesquise sumulas, teses repetitivas e jurisprudencia consolidada.</p>
      </div>

      <Card>
        <CardContent className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Pesquisa</h2>
            <p className="text-sm text-gray-500 mt-1">Use tema, ementa, tribunal e tipo para refinar o resultado.</p>
          </div>
          <form onSubmit={handleSearch} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Tema ou ementa</label>
              <input
                type="text"
                value={inputQuery}
                onChange={(e) => {
                  setInputQuery(e.target.value)
                  setInputError(null)
                }}
                placeholder="Ex: responsabilidade civil, dano moral, direito do consumidor..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {inputError && <p className="mt-2 text-sm text-red-600">{inputError}</p>}
              {isError && <p className="mt-2 text-sm text-red-600">Erro ao buscar precedentes. Tente novamente.</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Tribunal</label>
                <select value={filters.tribunal} onChange={(e) => setFilters((f) => ({ ...f, tribunal: e.target.value }))} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Todos os tribunais</option>
                  <option value="STF">Supremo Tribunal Federal</option>
                  <option value="STJ">Superior Tribunal de Justica</option>
                  <option value="TRF">Tribunal Regional Federal</option>
                  <option value="TJSP">Tribunal de Justica de SP</option>
                  <option value="TST">Tribunal Superior do Trabalho</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de precedente</label>
                <select value={filters.tipo} onChange={(e) => setFilters((f) => ({ ...f, tipo: e.target.value }))} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Todos os tipos</option>
                  <option value="SUM">Sumula</option>
                  <option value="SV">Sumula Vinculante</option>
                  <option value="RG">Repercussao Geral</option>
                  <option value="IRDR">IRDR</option>
                  <option value="RR">Recursos Repetitivos</option>
                  <option value="CT">Tema</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3">
              <Button type="submit" disabled={isLoading}>{isLoading ? 'Buscando...' : 'Buscar'}</Button>
              {searched && <Button type="button" variant="secondary" onClick={handleClear}>Limpar</Button>}
            </div>
          </form>
        </CardContent>
      </Card>

      {searched && dataUpdatedAt > 0 && (
        <CacheTimestamp timestamp={new Date(dataUpdatedAt).toISOString()} isLoading={isLoading} onRefresh={() => refetch()} ttlMinutes={7 * 24 * 60} />
      )}

      {searched && (
        results.length === 0 && !isLoading ? (
          <Empty title="Nenhum precedente encontrado" description="Tente ajustar os filtros ou usar outros termos de busca." />
        ) : (
          <Card>
            <CardContent className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Resultados</h2>
                <p className="text-sm text-gray-500 mt-1">{results.length} resultado(s) encontrado(s).</p>
              </div>
              <div className="space-y-4">
                {results.map((precedent) => (
                  <div key={precedent.id} className="bg-white border border-gray-200 rounded-lg p-5 hover:border-blue-300 transition-colors">
                    <div className="space-y-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-2">{precedent.ementa}</h3>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant={getTypeColor(precedent.tipo)}>{getTypeLabel(precedent.tipo)}</Badge>
                            <span className="text-xs text-gray-500 font-medium">{precedent.tribunal}</span>
                            <span className="text-xs text-gray-400">•</span>
                            <span className="text-xs text-gray-500">{precedent.status}</span>
                          </div>
                        </div>
                      </div>
                      <div className="pt-4 border-t border-gray-200">
                        <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold mb-2">Tese</p>
                        <p className="text-gray-700 leading-relaxed text-sm">{precedent.tese}</p>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-2">
                        <div className="p-3 bg-gray-50 rounded border border-gray-200"><p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">Tribunal</p><p className="text-sm font-medium text-gray-900">{precedent.orgao}</p></div>
                        <div className="p-3 bg-gray-50 rounded border border-gray-200"><p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">Tipo</p><p className="text-sm font-medium text-gray-900">{getTypeLabel(precedent.tipo)}</p></div>
                        <div className="p-3 bg-gray-50 rounded border border-gray-200"><p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">Status</p><p className="text-sm font-medium text-gray-900">{precedent.status}</p></div>
                      </div>
                      {precedent.href && <div className="pt-2"><Button variant="secondary" size="sm" onClick={() => window.open(precedent.href, '_blank')}>Ver no tribunal</Button></div>}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )
      )}
    </div>
  )
}

export default PrecedentsPage
