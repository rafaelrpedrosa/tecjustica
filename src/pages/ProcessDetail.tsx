import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Card, { CardContent } from '@/components/common/Card'
import Badge from '@/components/common/Badge'
import Tabs from '@/components/common/Tabs'
import Empty from '@/components/common/Empty'
import Button from '@/components/common/Button'
import { PageLoading } from '@/components/common/Loading'
import { CacheTimestamp } from '@/components/common/CacheTimestamp'
import { CadastroProcessoModal } from '@/components/process/CadastroProcessoModal'
import ClientMessageApprovalPanel from '@/components/process/ClientMessageApprovalPanel'
import FinanceiroProcessoPanel from '@/components/process/FinanceiroProcessoPanel'
import { RetornoModal } from '@/components/process/RetornoModal'
import {
  useProcess,
  useProcessDocuments,
  useProcessMovements,
  useProcessParties,
} from '@/hooks/useProcess'
import { useGargaloProcessual } from '@/hooks/useGargaloProcessual'
import { useToast } from '@/hooks/useToast'
import { listarDiligenciasPorCNJ, salvarDiligencia } from '@/services/diligencia.service'
import { verificarCadastro, monitorarProcesso } from '@/services/escritorio.service'
import {
  approveAndSendClientMessage,
  createDocumentDraft,
  createMovementDraft,
  listClientMessageTimeline,
  listPendingClientMessages,
  rejectClientMessage,
} from '@/services/client-message.service'
import { criarDiligenciaDeGargalo } from '@/utils/criarDiligenciaDeGargalo'
import { formatCPFCNPJ, formatCurrencyBR, formatDateBR } from '@/utils/format'
import type { DiligenciaOperacional, StatusDiligencia } from '@/types/diligencia'
import type { EscritorioProcesso } from '@/types/escritorio'

const BASE_TABS = [
  { label: 'Visao geral', value: 'overview' },
  { label: 'Partes', value: 'parties' },
  { label: 'Movimentos', value: 'movements' },
  { label: 'Documentos', value: 'documents' },
  { label: 'Financeiro', value: 'financeiro' },
]

const STATUS_LABEL: Record<StatusDiligencia, string> = {
  PENDENTE: 'Pendente',
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDA: 'Concluida',
  SEM_RETORNO: 'Sem retorno',
}

const ACAO_LABEL: Record<string, string> = {
  LIGACAO_SECRETARIA: 'Lig. secretaria',
  LIGACAO_GABINETE: 'Lig. gabinete',
  EMAIL_VARA: 'Email vara',
  RECHECK: 'Revisar',
}

function getStatusColor(status: string): 'success' | 'default' | 'warning' | 'info' {
  const normalized = status.toLowerCase()
  if (normalized.includes('tramit')) return 'success'
  if (normalized.includes('encerr')) return 'default'
  if (normalized.includes('suspens')) return 'warning'
  return 'info'
}

const ProcessDetail: React.FC = () => {
  const { cnj } = useParams<{ cnj: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState(
    (location.state as { returnTab?: string } | null)?.returnTab || 'overview'
  )
  const [cadastro, setCadastro] = useState<EscritorioProcesso | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [monitorando, setMonitorando] = useState(false)
  const [diligencias, setDiligencias] = useState<DiligenciaOperacional[]>([])
  const [retornoModal, setRetornoModal] = useState<DiligenciaOperacional | null>(null)
  const { toasts, showToast } = useToast()

  useEffect(() => {
    if (!cnj) return
    let isMounted = true
    verificarCadastro(cnj)
      .then(data => { if (isMounted) setCadastro(data) })
      .catch(() => { if (isMounted) setCadastro(null) })
    return () => { isMounted = false }
  }, [cnj])

  const processQuery = useProcess(cnj)
  const partiesQuery = useProcessParties(cnj)
  const movementsQuery = useProcessMovements(cnj)
  const documentsQuery = useProcessDocuments(cnj)

  const pendingMessagesQuery = useQuery({
    queryKey: ['client-message-approvals', cnj],
    queryFn: () => listPendingClientMessages(cnj!),
    enabled: !!cnj && !!cadastro,
    staleTime: 30 * 1000,
  })

  const messageTimelineQuery = useQuery({
    queryKey: ['client-message-timeline', cnj],
    queryFn: () => listClientMessageTimeline(cnj!),
    enabled: !!cnj && !!cadastro,
    staleTime: 30 * 1000,
  })

  const { gargalo } = useGargaloProcessual(cnj)

  const refreshMessages = useCallback(async () => {
    if (!cnj) return
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['client-message-approvals', cnj] }),
      queryClient.invalidateQueries({ queryKey: ['client-message-timeline', cnj] }),
    ])
  }, [cnj, queryClient])

  const createMovementDraftMutation = useMutation({
    mutationFn: createMovementDraft,
    onSuccess: async () => {
      await refreshMessages()
      showToast('Rascunho criado e aguardando aprovacao.')
    },
    onError: error => {
      showToast(error instanceof Error ? error.message : 'Nao foi possivel preparar a mensagem da movimentacao.')
    },
  })

  const createDocumentDraftMutation = useMutation({
    mutationFn: createDocumentDraft,
    onSuccess: async () => {
      await refreshMessages()
      showToast('Rascunho criado e aguardando aprovacao.')
    },
    onError: error => {
      showToast(error instanceof Error ? error.message : 'Nao foi possivel preparar a mensagem do documento.')
    },
  })

  const approveDraftMutation = useMutation({
    mutationFn: ({ id, draftMessage }: { id: string; draftMessage: string }) => approveAndSendClientMessage(id, draftMessage),
    onSuccess: async () => {
      await refreshMessages()
      showToast('Mensagem aprovada e enviada ao cliente.')
    },
    onError: error => {
      showToast(error instanceof Error ? error.message : 'Nao foi possivel enviar a mensagem.')
    },
  })

  const rejectDraftMutation = useMutation({
    mutationFn: rejectClientMessage,
    onSuccess: async () => {
      await refreshMessages()
      showToast('Mensagem rejeitada com sucesso.')
    },
    onError: () => {
      showToast('Nao foi possivel rejeitar a mensagem.')
    },
  })

  useEffect(() => {
    if (!cnj) return
    listarDiligenciasPorCNJ(cnj)
      .then(setDiligencias)
      .catch(err => {
        console.error('Erro ao carregar diligências:', err)
        showToast('Erro ao carregar diligências. Tente recarregar a página.')
        setDiligencias([])
      })
  }, [cnj, showToast])

  const recarregarDiligencias = useCallback(async () => {
    if (!cnj) return
    const data = await listarDiligenciasPorCNJ(cnj)
    setDiligencias(data)
  }, [cnj])

  const handleMonitorar = useCallback(async () => {
    if (!cnj) return
    setMonitorando(true)
    try {
      const resultado = await monitorarProcesso(cnj)
      showToast(resultado.mensagem)
      await refreshMessages()
    } catch {
      showToast('Erro ao verificar atualizacoes.')
    } finally {
      setMonitorando(false)
    }
  }, [cnj, refreshMessages, showToast])

  const gerarDiligencia = useCallback(async () => {
    if (!cnj || !gargalo) return
    const jaExiste = diligencias.some(d => d.tipoGargalo === gargalo.tipo && d.status !== 'CONCLUIDA')
    if (jaExiste) {
      showToast('Ja existe uma diligencia aberta para este gargalo.')
      return
    }
    const nova = criarDiligenciaDeGargalo(cnj, cadastro?.clienteNome, gargalo)
    await salvarDiligencia(nova)
    await recarregarDiligencias()
    showToast('Diligencia criada com sucesso.')
  }, [cadastro?.clienteNome, cnj, diligencias, gargalo, recarregarDiligencias, showToast])

  const process = processQuery.data ?? null
  const parties = partiesQuery.data ?? []
  const movements = movementsQuery.data ?? []
  const documents = documentsQuery.data ?? []
  const pendingMessages = pendingMessagesQuery.data ?? []
  const messageTimeline = messageTimelineQuery.data ?? []
  const diligenciasAbertas = diligencias.filter(d => d.status !== 'CONCLUIDA')

  const TABS_ITEMS = useMemo(() => [
    ...BASE_TABS,
    {
      label: (
        <span className="flex items-center gap-1.5">
          Comunicacao
          {pendingMessages.length > 0 && (
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white">
              {pendingMessages.length > 9 ? '9+' : pendingMessages.length}
            </span>
          )}
        </span>
      ),
      value: 'comunicacao',
    },
    {
      label: (
        <span className="flex items-center gap-1.5">
          Diligencias
          {diligenciasAbertas.length > 0 && (
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
              {diligenciasAbertas.length > 9 ? '9+' : diligenciasAbertas.length}
            </span>
          )}
        </span>
      ),
      value: 'diligencias',
    },
  ], [diligenciasAbertas.length, pendingMessages.length])

  const loading =
    processQuery.isLoading ||
    partiesQuery.isLoading ||
    movementsQuery.isLoading ||
    documentsQuery.isLoading

  const refetchAll = useCallback(() => {
    processQuery.refetch()
    partiesQuery.refetch()
    movementsQuery.refetch()
    documentsQuery.refetch()
    pendingMessagesQuery.refetch()
    messageTimelineQuery.refetch()
  }, [documentsQuery, messageTimelineQuery, movementsQuery, partiesQuery, pendingMessagesQuery, processQuery])

  const cacheTimestamp = useMemo(
    () => (processQuery.dataUpdatedAt ? new Date(processQuery.dataUpdatedAt).toISOString() : null),
    [processQuery.dataUpdatedAt]
  )

  const handleModalSuccess = useCallback(() => {
    setModalOpen(false)
    navigate('/meus-processos')
  }, [navigate])

  const ensureCadastroForClientMessage = useCallback(() => {
    if (cadastro) return true
    showToast('Cadastre o processo no escritorio antes de enviar mensagem ao cliente.')
    setModalOpen(true)
    return false
  }, [cadastro, showToast])

  if (loading) return <PageLoading />

  if (processQuery.isError || !process) {
    return (
      <div className="flex items-center justify-center py-16">
        <Empty title="Processo nao encontrado" description="Verifique o numero do CNJ e tente novamente." />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="fixed right-4 top-4 z-50 flex flex-col gap-2">
        {toasts.map(t => (
          <div key={t.id} className="max-w-sm rounded-lg bg-gray-900 px-4 py-3 text-sm text-white shadow-lg">
            {t.message}
          </div>
        ))}
      </div>

      <Card className="border-l-4 border-l-blue-600 shadow-lg">
        <CardContent className="py-8">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="flex-1">
              <h1 className="mb-2 text-3xl font-semibold text-gray-900">{process.cnj}</h1>
              <p className="text-lg text-gray-600">{process.tribunal} • {process.classe}</p>
              {cadastro && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-700">
                    {cadastro.clienteNome} — {cadastro.clientePolo === 'ATIVO' ? 'Ativo' : cadastro.clientePolo === 'PASSIVO' ? 'Passivo' : 'Terceiro'}
                  </span>
                  <Button variant="secondary" size="sm" onClick={handleMonitorar} disabled={monitorando}>
                    {monitorando ? 'Verificando...' : 'Verificar atualizacoes'}
                  </Button>
                  {gargalo && (
                    <Button variant="secondary" size="sm" onClick={gerarDiligencia}>
                      Gerar diligencia
                    </Button>
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              <Badge variant={getStatusColor(process.status)}>{process.status}</Badge>
              {!cadastro && (
                <Button variant="secondary" size="sm" onClick={() => setModalOpen(true)}>
                  Cadastrar no escritorio
                </Button>
              )}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 border-t border-gray-200 pt-6 md:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Assunto</p>
              <p className="mt-2 font-medium text-gray-900">{process.assunto}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Valor da causa</p>
              <p className="mt-2 font-medium text-gray-900">{formatCurrencyBR(process.valor)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Vara</p>
              <p className="mt-2 font-medium text-gray-900">{cadastro?.vara || process.vara || '-'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <CacheTimestamp timestamp={cacheTimestamp} isLoading={loading} onRefresh={refetchAll} ttlMinutes={24 * 60} />

      {cadastro && pendingMessages.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Existem <span className="font-semibold">{pendingMessages.length} mensagens prontas para envio</span>. Revise a comunicacao com o cliente para nao perder o timing do retorno.
        </div>
      )}

      <Card>
        <Tabs items={TABS_ITEMS} defaultValue={activeTab} onChange={setActiveTab} />

        <CardContent className="pt-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6 md:grid-cols-3">
                <div className="rounded-lg bg-blue-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-600">Tribunal</p>
                  <p className="mt-1 text-lg font-semibold text-gray-900">{process.tribunal}</p>
                </div>
                <div className="rounded-lg bg-blue-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-600">Classe</p>
                  <p className="mt-1 text-lg font-semibold text-gray-900">{process.classe?.split(' ')[0]}</p>
                </div>
                <div className="rounded-lg bg-blue-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-600">Status</p>
                  <p className="mt-1 text-lg font-semibold text-gray-900">{process.status}</p>
                </div>
                <div className="rounded-lg bg-blue-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-600">Aberto em</p>
                  <p className="mt-1 text-lg font-semibold text-gray-900">{formatDateBR(process.dataAbertura)}</p>
                </div>
                <div className="rounded-lg bg-blue-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-600">Ultima movimentacao</p>
                  <p className="mt-1 text-lg font-semibold text-gray-900">{movements[0] ? formatDateBR(movements[0].data) : '-'}</p>
                </div>
              </div>

              {gargalo ? (
                <div className={`rounded-lg border-l-4 p-4 ${
                  gargalo.prioridade === 'URGENTE' ? 'border-l-red-500 bg-red-50' :
                  gargalo.prioridade === 'ALTA' ? 'border-l-yellow-500 bg-yellow-50' :
                  gargalo.prioridade === 'NORMAL' ? 'border-l-blue-400 bg-blue-50' :
                  'border-l-gray-300 bg-gray-50'
                }`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-white/70 px-2 py-0.5 text-xs font-semibold text-gray-700">{gargalo.prioridade}</span>
                        <span className="font-mono text-xs text-gray-500">{gargalo.tipo}</span>
                      </div>
                      <p className="text-sm font-semibold text-gray-900">{gargalo.descricao}</p>
                      {gargalo.marcoRelevante && (
                        <p className="text-xs italic text-gray-500">
                          Marco: {gargalo.marcoRelevante}{gargalo.dataMarco ? ` • ${formatDateBR(gargalo.dataMarco)}` : ''}
                        </p>
                      )}
                      <p className="text-xs text-gray-600">Acao recomendada: {gargalo.acaoRecomendada}</p>
                    </div>
                    <span className="whitespace-nowrap text-2xl font-bold text-gray-400">{gargalo.diasParado}d</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                  Nenhum gargalo evidente encontrado.
                </div>
              )}

              {process.descricao && (
                <div className="rounded-lg bg-gray-50 p-6">
                  <h3 className="mb-3 font-semibold text-gray-900">Resumo</h3>
                  <p className="leading-relaxed text-gray-700">{process.descricao}</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'parties' && (
            parties.length === 0 ? (
              <Empty title="Nenhuma parte encontrada" />
            ) : (
              <div className="space-y-4">
                {parties.map(party => (
                  <div key={party.id} className="rounded-lg border border-gray-200 p-4 transition-shadow hover:shadow-md">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <h4 className="font-semibold text-gray-900">{party.nome}</h4>
                      <Badge variant="info">{party.tipo}</Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-4 text-sm text-gray-600 md:grid-cols-2">
                      {party.cpfCnpj && (
                        <div>
                          <span className="text-gray-500">CPF/CNPJ: </span>
                          <span className="font-mono">{formatCPFCNPJ(party.cpfCnpj)}</span>
                        </div>
                      )}
                      {party.email && (
                        <div>
                          <span className="text-gray-500">Email: </span>
                          <a href={`mailto:${party.email}`} className="text-blue-600 hover:underline">{party.email}</a>
                        </div>
                      )}
                    </div>
                    {party.lawyers && party.lawyers.length > 0 && (
                      <div className="mt-3 border-t border-gray-100 pt-3">
                        <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Advogados</p>
                        <div className="space-y-2">
                          {party.lawyers.map(lawyer => (
                            <div key={lawyer.id} className="pl-4 text-sm text-gray-700">
                              <span className="font-medium">{lawyer.nome}</span>
                              {lawyer.oab && <span className="ml-2 text-gray-500">OAB {lawyer.oab}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          )}

          {activeTab === 'movements' && (
            movements.length === 0 ? (
              <Empty title="Nenhuma movimentacao encontrada" />
            ) : (
              <div className="space-y-4">
                {movements.map((movement, idx) => (
                  <div key={movement.id || `movement-${idx}`} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="mt-1.5 h-4 w-4 rounded-full bg-blue-600" />
                      {idx < movements.length - 1 && <div className="my-1 h-12 w-0.5 bg-gray-300" />}
                    </div>
                    <div className="flex-1 pb-4 pt-1">
                      <p className="text-sm font-medium text-gray-500">{formatDateBR(movement.data)}</p>
                      <p className="mt-1 font-medium text-gray-900">{movement.descricao}</p>
                      {movement.orgao && <p className="mt-1 text-sm text-gray-600">Orgao: {movement.orgao}</p>}
                      <div className="mt-3">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={createMovementDraftMutation.isPending}
                          onClick={() => {
                            if (!ensureCadastroForClientMessage()) return
                            createMovementDraftMutation.mutate({
                              cnj: process.cnj,
                              movement: {
                                id: movement.id,
                                data: typeof movement.data === 'string' ? movement.data : movement.data?.toISOString?.(),
                                tipo: movement.tipo,
                                descricao: movement.descricao,
                                orgao: movement.orgao,
                              },
                            })
                          }}
                        >
                          {createMovementDraftMutation.isPending ? 'Preparando...' : 'Gerar mensagem ao cliente'}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {activeTab === 'documents' && (
            documents.length === 0 ? (
              <Empty title="Nenhum documento encontrado" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-gray-300">
                      <th className="px-4 py-3 text-left font-semibold text-gray-900">Titulo</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-900">Tipo</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-900">Data</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-900">Acoes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map(doc => (
                      <tr key={doc.id} className="border-b border-gray-200 hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{doc.titulo}</td>
                        <td className="px-4 py-3 text-gray-600">{doc.tipo}</td>
                        <td className="px-4 py-3 text-gray-600">{formatDateBR(doc.dataCriacao)}</td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Button variant="secondary" size="sm" onClick={() => navigate(`/document/${doc.id}`, { state: { cnj } })}>
                              Ler
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={createDocumentDraftMutation.isPending}
                              onClick={() => {
                                if (!ensureCadastroForClientMessage()) return
                                createDocumentDraftMutation.mutate({
                                  cnj: process.cnj,
                                  document: {
                                    id: doc.id,
                                    titulo: doc.titulo,
                                    tipo: doc.tipo,
                                    dataCriacao: doc.dataCriacao,
                                    paginas: doc.paginas,
                                  },
                                })
                              }}
                            >
                              {createDocumentDraftMutation.isPending ? 'Preparando...' : 'Gerar mensagem'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {activeTab === 'comunicacao' && cadastro && (
            <ClientMessageApprovalPanel
              approvals={pendingMessages}
              timeline={messageTimeline}
              loading={pendingMessagesQuery.isLoading || messageTimelineQuery.isLoading}
              onApprove={async (id, draftMessage) => {
                await approveDraftMutation.mutateAsync({ id, draftMessage })
              }}
              onReject={async id => {
                await rejectDraftMutation.mutateAsync(id)
              }}
            />
          )}

          {activeTab === 'financeiro' && (
            <FinanceiroProcessoPanel
              cnj={process.cnj}
              clienteId={cadastro?.clienteId}
              clienteNome={cadastro?.clienteNome}
              onToast={showToast}
            />
          )}

          {activeTab === 'diligencias' && (
            <div className="space-y-4">
              {diligencias.length === 0 ? (
                <div className="py-8 text-center">
                  {gargalo ? (
                    <div className="space-y-3">
                      <p className="text-sm text-gray-500">Nenhuma diligencia registrada para este processo.</p>
                      <Button onClick={gerarDiligencia}>Gerar diligencia agora</Button>
                    </div>
                  ) : (
                    <Empty title="Nenhuma diligencia" description="Nenhum gargalo detectado neste processo." />
                  )}
                </div>
              ) : (
                diligencias.map(d => (
                  <div
                    key={d.id}
                    className={`rounded-lg border p-4 ${
                      d.status === 'CONCLUIDA' ? 'border-gray-200 bg-gray-50 opacity-70' :
                      d.prioridade === 'URGENTE' ? 'border-red-200 bg-red-50' :
                      d.prioridade === 'ALTA' ? 'border-yellow-200 bg-yellow-50' :
                      'border-gray-200 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{ACAO_LABEL[d.acaoRecomendada] ?? d.acaoRecomendada}</span>
                          <span className="rounded px-2 py-0.5 text-xs font-semibold text-gray-700 bg-gray-100">{d.prioridade}</span>
                          <span className="rounded px-2 py-0.5 text-xs bg-blue-50 text-blue-700">{STATUS_LABEL[d.status]}</span>
                        </div>
                        <p className="text-sm text-gray-700">{d.descricao}</p>
                        <p className="text-xs text-gray-500">{d.diasParado} dias parado</p>
                        {d.retorno && <p className="mt-1 text-xs italic text-gray-600">"{d.retorno}"</p>}
                        {d.proximaAcao && <p className="mt-1 text-xs text-blue-600">Proxima acao: {d.proximaAcao}{d.proximaData ? ` • ${d.proximaData}` : ''}</p>}
                      </div>
                      {d.status !== 'CONCLUIDA' && (
                        <Button variant="secondary" size="sm" onClick={() => setRetornoModal(d)}>
                          Registrar retorno
                        </Button>
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
        <RetornoModal diligencia={retornoModal} onClose={() => setRetornoModal(null)} onSaved={recarregarDiligencias} />
      )}

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