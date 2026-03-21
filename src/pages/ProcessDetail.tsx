import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import Card, { CardContent } from '@/components/common/Card'
import Badge from '@/components/common/Badge'
import Tabs from '@/components/common/Tabs'
import { PageLoading } from '@/components/common/Loading'
import Empty from '@/components/common/Empty'
import Button from '@/components/common/Button'
import { CacheTimestamp } from '@/components/common/CacheTimestamp'
import {
  useProcess,
  useProcessParties,
  useProcessMovements,
  useProcessDocuments,
} from '@/hooks/useProcess'
import { formatDateBR, formatCurrencyBR, formatCPFCNPJ } from '@/utils/format'
import { CadastroProcessoModal } from '@/components/process/CadastroProcessoModal'
import { verificarCadastro, monitorarProcesso } from '@/services/escritorio.service'
import type { EscritorioProcesso } from '@/types/escritorio'
import { useGargaloProcessual } from '@/hooks/useGargaloProcessual'
import { criarDiligenciaDeGargalo } from '@/utils/criarDiligenciaDeGargalo'
import {
  listarDiligenciasPorCNJ,
  salvarDiligencia,
} from '@/services/diligencia.service'
import { RetornoModal } from '@/components/process/RetornoModal'
import type { DiligenciaOperacional, StatusDiligencia } from '@/types/diligencia'

// Constante fora do componente — abas base sem badge dinâmico
const BASE_TABS = [
  { label: 'Visão Geral', value: 'overview' },
  { label: 'Partes', value: 'parties' },
  { label: 'Movimentos', value: 'movements' },
  { label: 'Documentos', value: 'documents' },
]

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

function getStatusColor(status: string): 'success' | 'default' | 'warning' | 'info' {
  if (status.toLowerCase().includes('tramitação')) return 'success'
  if (status.toLowerCase().includes('encerrado')) return 'default'
  if (status.toLowerCase().includes('suspenso')) return 'warning'
  return 'info'
}

const ProcessDetail: React.FC = () => {
  const { cnj } = useParams<{ cnj: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const [activeTab, setActiveTab] = useState(
    (location.state as { returnTab?: string } | null)?.returnTab || 'overview'
  )
  const [cadastro, setCadastro] = useState<EscritorioProcesso | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [monitorando, setMonitorando] = useState(false)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (cnj) {
      verificarCadastro(cnj).then(setCadastro).catch(() => {})
    }
  }, [cnj])

  // Cleanup do timer ao desmontar
  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current) }, [])

  const showToast = useCallback((msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToastMsg(msg)
    toastTimerRef.current = setTimeout(() => setToastMsg(null), 4000)
  }, [])

  const handleMonitorar = useCallback(async () => {
    if (!cnj) return
    setMonitorando(true)
    try {
      const resultado = await monitorarProcesso(cnj)
      showToast(resultado.mensagem)
    } catch {
      showToast('Erro ao verificar atualizações.')
    } finally {
      setMonitorando(false)
    }
  }, [cnj, showToast])

  const processQuery = useProcess(cnj)
  const partiesQuery = useProcessParties(cnj)
  const movementsQuery = useProcessMovements(cnj)
  const documentsQuery = useProcessDocuments(cnj)
  const { gargalo } = useGargaloProcessual(cnj)
  const [diligencias, setDiligencias] = useState<DiligenciaOperacional[]>(() =>
    cnj ? listarDiligenciasPorCNJ(cnj) : []
  )
  const [retornoModal, setRetornoModal] = useState<DiligenciaOperacional | null>(null)

  const recarregarDiligencias = useCallback(() => {
    if (cnj) setDiligencias(listarDiligenciasPorCNJ(cnj))
  }, [cnj])

  const gerarDiligencia = useCallback(() => {
    if (!cnj || !gargalo) return
    const jaExiste = diligencias.some(
      d => d.tipoGargalo === gargalo.tipo && d.status !== 'CONCLUIDA'
    )
    if (jaExiste) {
      showToast('Já existe uma diligência aberta para este gargalo.')
      return
    }
    const nova = criarDiligenciaDeGargalo(cnj, cadastro?.clienteNome, gargalo)
    salvarDiligencia(nova)
    recarregarDiligencias()
    showToast('Diligência criada com sucesso.')
  }, [cnj, gargalo, diligencias, cadastro, showToast, recarregarDiligencias])

  const diligenciasAbertas = diligencias.filter(d => d.status !== 'CONCLUIDA')

  const TABS_ITEMS = useMemo(() => [
    ...BASE_TABS,
    {
      label: (
        <span className="flex items-center gap-1.5">
          Diligências
          {diligenciasAbertas.length > 0 && (
            <span className="inline-flex items-center justify-center w-4 h-4 text-xs font-bold text-white bg-red-500 rounded-full">
              {diligenciasAbertas.length > 9 ? '9+' : diligenciasAbertas.length}
            </span>
          )}
        </span>
      ),
      value: 'diligencias',
    },
  ], [diligenciasAbertas.length])

  const loading =
    processQuery.isLoading ||
    partiesQuery.isLoading ||
    movementsQuery.isLoading ||
    documentsQuery.isLoading

  const process = processQuery.data ?? null
  const parties = partiesQuery.data ?? []
  const movements = movementsQuery.data ?? []
  const documents = documentsQuery.data ?? []

  const refetchAll = useCallback(() => {
    processQuery.refetch()
    partiesQuery.refetch()
    movementsQuery.refetch()
    documentsQuery.refetch()
  }, [processQuery, partiesQuery, movementsQuery, documentsQuery])

  const cacheTimestamp = useMemo(
    () => processQuery.dataUpdatedAt ? new Date(processQuery.dataUpdatedAt).toISOString() : null,
    [processQuery.dataUpdatedAt]
  )

  const handleModalSuccess = useCallback(() => {
    setModalOpen(false)
    navigate('/meus-processos')
  }, [navigate])

  if (loading) return <PageLoading />

  if (processQuery.isError || !process) {
    return (
      <div className="flex items-center justify-center py-16">
        <Empty
          title="Processo não encontrado"
          description="Verifique o número do CNJ e tente novamente"
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toastMsg && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white px-4 py-3 rounded-lg shadow-lg text-sm max-w-sm">
          {toastMsg}
        </div>
      )}

      {/* Header Section */}
      <Card className="border-l-4 border-l-blue-600 shadow-lg">
        <CardContent className="py-8">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 mb-2 font-serif">
                {process.cnj}
              </h1>
              <p className="text-gray-600 text-lg">
                {process.tribunal} • {process.classe}
              </p>
              {/* Badge escritório */}
              {cadastro && (
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className="text-xs bg-blue-50 border border-blue-200 text-blue-700 rounded px-2 py-1">
                    📁 {cadastro.clienteNome} — {cadastro.clientePolo === 'ATIVO' ? 'Ativo' : cadastro.clientePolo === 'PASSIVO' ? 'Passivo' : 'Terceiro'}
                  </span>
                  <Button variant="secondary" size="sm" onClick={handleMonitorar} disabled={monitorando}>
                    {monitorando ? 'Verificando...' : '🔄 Verificar atualizações'}
                  </Button>
                  {gargalo && (
                    <Button variant="secondary" size="sm" onClick={gerarDiligencia}>
                      📋 Gerar Diligência
                    </Button>
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              <Badge variant={getStatusColor(process.status)}>
                {process.status}
              </Badge>
              {!cadastro && (
                <Button variant="secondary" size="sm" onClick={() => setModalOpen(true)}>
                  + Cadastrar no escritório
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6 pt-6 border-t border-gray-200">
            <div>
              <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold">
                Assunto
              </p>
              <p className="text-gray-900 font-medium mt-2">{process.assunto}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold">
                Valor da Causa
              </p>
              <p className="text-gray-900 font-medium mt-2">
                {formatCurrencyBR(process.valor)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold">
                Vara
              </p>
              <p className="text-gray-900 font-medium mt-2">{cadastro?.vara || process.vara || '—'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cache Status */}
      <CacheTimestamp
        timestamp={cacheTimestamp}
        isLoading={loading}
        onRefresh={refetchAll}
        ttlMinutes={24 * 60}
      />

      {/* Tabs Section */}
      <Card>
        <Tabs
          items={TABS_ITEMS}
          defaultValue={activeTab}
          onChange={setActiveTab}
        />

        <CardContent className="pt-6">
          {/* Visão Geral */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-xs text-gray-600 uppercase tracking-wide">Tribunal</p>
                  <p className="text-lg font-semibold text-gray-900 mt-1">{process.tribunal}</p>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-xs text-gray-600 uppercase tracking-wide">Classe</p>
                  <p className="text-lg font-semibold text-gray-900 mt-1">
                    {process.classe?.split(' ')[0]}
                  </p>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-xs text-gray-600 uppercase tracking-wide">Status</p>
                  <p className="text-lg font-semibold text-gray-900 mt-1">{process.status}</p>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-xs text-gray-600 uppercase tracking-wide">Aberto em</p>
                  <p className="text-lg font-semibold text-gray-900 mt-1">
                    {formatDateBR(process.dataAbertura)}
                  </p>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-xs text-gray-600 uppercase tracking-wide">Última movimentação</p>
                  <p className="text-lg font-semibold text-gray-900 mt-1">
                    {movements[0] ? formatDateBR(movements[0].data) : '—'}
                  </p>
                </div>
              </div>

              {/* Card de Diagnóstico Operacional */}
              {gargalo ? (
                <div className={`p-4 rounded-lg border-l-4 ${
                  gargalo.prioridade === 'URGENTE' ? 'bg-red-50 border-l-red-500' :
                  gargalo.prioridade === 'ALTA'    ? 'bg-yellow-50 border-l-yellow-500' :
                  gargalo.prioridade === 'NORMAL'  ? 'bg-blue-50 border-l-blue-400' :
                                                     'bg-gray-50 border-l-gray-300'
                }`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1">
                      <span className="text-xl mt-0.5">
                        {gargalo.prioridade === 'URGENTE' ? '🚨' :
                         gargalo.prioridade === 'ALTA'    ? '⚠️' :
                         gargalo.prioridade === 'NORMAL'  ? '🕐' : 'ℹ️'}
                      </span>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wide ${
                            gargalo.prioridade === 'URGENTE' ? 'bg-red-200 text-red-800' :
                            gargalo.prioridade === 'ALTA'    ? 'bg-yellow-200 text-yellow-800' :
                            gargalo.prioridade === 'NORMAL'  ? 'bg-blue-200 text-blue-800' :
                                                               'bg-gray-200 text-gray-700'
                          }`}>
                            {gargalo.prioridade}
                          </span>
                          <span className="text-xs text-gray-500 font-mono">{gargalo.tipo}</span>
                        </div>
                        <p className="font-semibold text-gray-900 text-sm">{gargalo.descricao}</p>
                        {gargalo.marcoRelevante && (
                          <p className="text-xs text-gray-500 italic">
                            Marco: {gargalo.marcoRelevante}
                            {gargalo.dataMarco ? ` · ${formatDateBR(gargalo.dataMarco)}` : ''}
                          </p>
                        )}
                        <p className="text-gray-600 text-xs mt-1">💡 {gargalo.acaoRecomendada}</p>
                      </div>
                    </div>
                    <span className="text-2xl font-bold text-gray-400 tabular-nums whitespace-nowrap">
                      {gargalo.diasParado}d
                    </span>
                  </div>
                </div>
              ) : (
                !loading && (
                  <div className="p-3 rounded-lg bg-green-50 border border-green-200 flex items-center gap-2">
                    <span>✅</span>
                    <span className="text-sm text-green-700">Nenhum gargalo evidente encontrado</span>
                  </div>
                )
              )}

              {process.descricao && (
                <div className="p-6 bg-gray-50 rounded-lg">
                  <h3 className="font-semibold text-gray-900 mb-3">Resumo</h3>
                  <p className="text-gray-700 leading-relaxed">{process.descricao}</p>
                </div>
              )}
            </div>
          )}

          {/* Partes */}
          {activeTab === 'parties' && (
            <>
              {parties.length === 0 ? (
                <Empty title="Nenhuma parte encontrada" />
              ) : (
                <div className="space-y-4">
                  {parties.map((party) => (
                    <div key={party.id} className="p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-semibold text-gray-900">{party.nome}</h4>
                        <Badge variant="info">{party.tipo}</Badge>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600 mt-3">
                        {party.cpfCnpj && (
                          <div>
                            <span className="text-gray-500">CPF/CNPJ: </span>
                            <span className="font-mono">{formatCPFCNPJ(party.cpfCnpj)}</span>
                          </div>
                        )}
                        {party.email && (
                          <div>
                            <span className="text-gray-500">Email: </span>
                            <a href={`mailto:${party.email}`} className="text-blue-600 hover:underline">
                              {party.email}
                            </a>
                          </div>
                        )}
                      </div>
                      {party.lawyers && party.lawyers.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <p className="text-xs text-gray-500 font-semibold uppercase mb-2">Advogados</p>
                          <div className="space-y-2">
                            {party.lawyers.map((lawyer) => (
                              <div key={lawyer.id} className="text-sm text-gray-700 pl-4">
                                <span className="font-medium">{lawyer.nome}</span>
                                {lawyer.oab && <span className="text-gray-500 ml-2">OAB {lawyer.oab}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Movimentos */}
          {activeTab === 'movements' && (
            <>
              {movements.length === 0 ? (
                <Empty title="Nenhuma movimentação encontrada" />
              ) : (
                <div className="space-y-4">
                  {movements.map((movement, idx) => (
                    <div key={movement.id || `movement-${idx}`} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="w-4 h-4 bg-blue-600 rounded-full mt-1.5"></div>
                        {idx < movements.length - 1 && (
                          <div className="w-0.5 h-12 bg-gray-300 my-1"></div>
                        )}
                      </div>
                      <div className="pb-4 flex-1 pt-1">
                        <p className="text-sm text-gray-500 font-medium">
                          {formatDateBR(movement.data)}
                        </p>
                        <p className="text-gray-900 font-medium mt-1">{movement.descricao}</p>
                        {movement.orgao && (
                          <p className="text-sm text-gray-600 mt-1">Órgão: {movement.orgao}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Documentos */}
          {activeTab === 'documents' && (
            <>
              {documents.length === 0 ? (
                <Empty title="Nenhum documento encontrado" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-gray-300">
                        <th className="text-left py-3 px-4 font-semibold text-gray-900">Título</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-900">Tipo</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-900">Data</th>
                        <th className="text-center py-3 px-4 font-semibold text-gray-900">Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {documents.map((doc) => (
                        <tr key={doc.id} className="border-b border-gray-200 hover:bg-gray-50">
                          <td className="py-3 px-4 text-gray-900 font-medium">{doc.titulo}</td>
                          <td className="py-3 px-4 text-gray-600">{doc.tipo}</td>
                          <td className="py-3 px-4 text-gray-600">
                            {formatDateBR(doc.dataCriacao)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() =>
                                navigate(`/document/${doc.id}`, { state: { cnj } })
                              }
                            >
                              Ler
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* Diligências */}
          {activeTab === 'diligencias' && (
            <div className="space-y-4">
              {diligencias.length === 0 ? (
                <div className="text-center py-8">
                  {gargalo ? (
                    <div className="space-y-3">
                      <p className="text-gray-500 text-sm">Nenhuma diligência registrada para este processo.</p>
                      <button
                        onClick={gerarDiligencia}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                      >
                        📋 Gerar diligência agora
                      </button>
                    </div>
                  ) : (
                    <Empty title="Nenhuma diligência" description="Nenhum gargalo detectado neste processo." />
                  )}
                </div>
              ) : (
                diligencias.map((d) => (
                  <div
                    key={d.id}
                    className={`p-4 rounded-lg border ${
                      d.status === 'CONCLUIDA' ? 'bg-gray-50 border-gray-200 opacity-70' :
                      d.prioridade === 'URGENTE' ? 'bg-red-50 border-red-200' :
                      d.prioridade === 'ALTA' ? 'bg-yellow-50 border-yellow-200' :
                      'bg-white border-gray-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                            {ACAO_LABEL[d.acaoRecomendada] ?? d.acaoRecomendada}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded font-semibold ${
                            d.prioridade === 'URGENTE' ? 'bg-red-100 text-red-700' :
                            d.prioridade === 'ALTA' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {d.prioridade}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            d.status === 'CONCLUIDA' ? 'bg-green-100 text-green-700' :
                            d.status === 'EM_ANDAMENTO' ? 'bg-blue-100 text-blue-700' :
                            'bg-amber-100 text-amber-700'
                          }`}>
                            {STATUS_LABEL[d.status]}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700">{d.descricao}</p>
                        <p className="text-xs text-gray-500">{d.diasParado} dias parado</p>
                        {d.retorno && (
                          <p className="text-xs text-gray-600 italic mt-1">"{d.retorno}"</p>
                        )}
                        {d.proximaAcao && (
                          <p className="text-xs text-blue-600 mt-1">→ {d.proximaAcao}{d.proximaData ? ` · ${d.proximaData}` : ''}</p>
                        )}
                      </div>
                      {d.status !== 'CONCLUIDA' && (
                        <button
                          onClick={() => setRetornoModal(d)}
                          className="text-xs px-3 py-1.5 bg-white border border-gray-300 rounded hover:bg-gray-50 whitespace-nowrap"
                        >
                          📝 Retorno
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {retornoModal && (
        <RetornoModal
          diligencia={retornoModal}
          onClose={() => setRetornoModal(null)}
          onSaved={recarregarDiligencias}
        />
      )}

      {/* Modal de cadastro no escritório */}
      <CadastroProcessoModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={handleModalSuccess}
        cnjInicial={cnj}
      />
    </div>
  )
}

export default ProcessDetail
