import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import Card, { CardContent } from '@/components/common/Card'
import Button from '@/components/common/Button'
import Badge from '@/components/common/Badge'
import Empty from '@/components/common/Empty'
import {
  approveAndSendClientMessage,
  listClientMessageEvents,
  listGlobalClientMessages,
  rejectClientMessage,
  sendManualClientMessage,
} from '@/services/client-message.service'
import { listarClientes } from '@/services/cliente.service'
import type {
  ClientMessageApproval,
  ClientMessageEvent,
  ClientMessageEventType,
  ClientMessageSourceType,
  ClientMessageStatus,
} from '@/types/client-message'
import { formatDateBR } from '@/utils/format'

const STATUS_LABEL: Record<ClientMessageStatus, string> = {
  PENDING: 'Pendente',
  SENT: 'Enviada',
  REJECTED: 'Rejeitada',
}

const STATUS_VARIANT: Record<ClientMessageStatus, 'warning' | 'success' | 'danger'> = {
  PENDING: 'warning',
  SENT: 'success',
  REJECTED: 'danger',
}

const SOURCE_LABEL: Record<ClientMessageSourceType, string> = {
  MOVIMENTO_AUTO: 'Movimento automatico',
  MOVIMENTO_MANUAL: 'Movimento manual',
  DOCUMENTO_MANUAL: 'Documento',
  STATUS_TRIMESTRAL: 'Status trimestral',
  MANUAL_FREEFORM: 'Envio manual',
}

const EVENT_LABEL: Record<ClientMessageEventType, string> = {
  CREATED: 'Rascunho criado',
  REOPENED: 'Rascunho reaberto',
  EDITED: 'Texto editado',
  APPROVED: 'Aprovada',
  SENT: 'Enviada ao cliente',
  REJECTED: 'Rejeitada',
}

function hasLinkedProcess(message: ClientMessageApproval | null) {
  return !!message?.cnj && !message.cnj.startsWith('MANUAL:')
}

function getReferenceLabel(message: ClientMessageApproval) {
  if (message.cnj.startsWith('MANUAL:')) {
    return 'Envio livre do escritorio'
  }
  return message.cnj
}

const Comunicacao: React.FC = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const queueRef = useRef<HTMLDivElement | null>(null)
  const [statusFilter, setStatusFilter] = useState<ClientMessageStatus | 'ALL'>('ALL')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draftText, setDraftText] = useState('')
  const [manualClienteId, setManualClienteId] = useState('')
  const [manualCnj, setManualCnj] = useState('')
  const [manualTitulo, setManualTitulo] = useState('')
  const [manualMensagem, setManualMensagem] = useState('')

  const summaryQuery = useQuery({
    queryKey: ['client-messages-global', 'ALL'],
    queryFn: () => listGlobalClientMessages('ALL'),
  })

  const messagesQuery = useQuery({
    queryKey: ['client-messages-global', statusFilter],
    queryFn: () => listGlobalClientMessages(statusFilter),
  })

  const clientsQuery = useQuery({
    queryKey: ['clientes'],
    queryFn: listarClientes,
  })

  useEffect(() => {
    const firstClientId = clientsQuery.data?.[0]?.id
    if (!manualClienteId && firstClientId) {
      setManualClienteId(firstClientId)
    }
  }, [clientsQuery.data, manualClienteId])

  const messages = messagesQuery.data ?? []
  const allMessages = summaryQuery.data ?? []
  const pendingMessages = useMemo(
    () => allMessages.filter(item => item.status === 'PENDING'),
    [allMessages]
  )

  const selectedMessage = useMemo(
    () => messages.find(item => item.id === selectedId) ?? messages[0] ?? null,
    [messages, selectedId]
  )

  useEffect(() => {
    if (!selectedMessage) {
      setSelectedId(null)
      setDraftText('')
      return
    }

    setSelectedId(selectedMessage.id)
    setDraftText(selectedMessage.draftMessage)
  }, [selectedMessage])

  const eventsQuery = useQuery({
    queryKey: ['client-message-events', selectedMessage?.id],
    queryFn: () => listClientMessageEvents(selectedMessage!.id),
    enabled: !!selectedMessage,
  })

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['client-messages-global'] }),
      queryClient.invalidateQueries({ queryKey: ['client-message-events'] }),
      queryClient.invalidateQueries({ queryKey: ['client-message-approvals'] }),
      queryClient.invalidateQueries({ queryKey: ['client-message-timeline'] }),
      queryClient.invalidateQueries({ queryKey: ['escritorio-status'] }),
    ])
  }

  const focusPendingQueue = (messageId?: string) => {
    setStatusFilter('PENDING')
    if (messageId) {
      setSelectedId(messageId)
    } else if (pendingMessages[0]) {
      setSelectedId(pendingMessages[0].id)
    }

    window.requestAnimationFrame(() => {
      queueRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const approveMutation = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => approveAndSendClientMessage(id, text),
    onSuccess: async () => {
      await refreshAll()
    },
  })

  const rejectMutation = useMutation({
    mutationFn: rejectClientMessage,
    onSuccess: async () => {
      await refreshAll()
    },
  })

  const manualMutation = useMutation({
    mutationFn: sendManualClientMessage,
    onSuccess: async message => {
      setManualTitulo('')
      setManualMensagem('')
      if (!manualCnj.trim()) {
        setManualCnj('')
      }
      await refreshAll()
      setStatusFilter('ALL')
      setSelectedId(message.id)
    },
  })

  const counts = useMemo(() => {
    return {
      total: allMessages.length,
      pending: pendingMessages.length,
      sent: allMessages.filter(item => item.status === 'SENT').length,
      rejected: allMessages.filter(item => item.status === 'REJECTED').length,
    }
  }, [allMessages, pendingMessages.length])

  const selectedClient = useMemo(
    () => (clientsQuery.data ?? []).find(client => client.id === manualClienteId) ?? null,
    [clientsQuery.data, manualClienteId]
  )

  const summaryCards = [
    { label: 'Total', value: counts.total, color: 'text-gray-800', filter: 'ALL' as const },
    { label: 'Pendentes', value: counts.pending, color: 'text-amber-600', filter: 'PENDING' as const },
    { label: 'Enviadas', value: counts.sent, color: 'text-green-600', filter: 'SENT' as const },
    { label: 'Rejeitadas', value: counts.rejected, color: 'text-rose-600', filter: 'REJECTED' as const },
  ]

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900">Comunicacao com clientes</h1>
          <p className="mt-1 text-sm text-gray-500">
            Visao global das mensagens aguardando acao, historico do escritorio e trilha de auditoria.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as ClientMessageStatus | 'ALL')}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">Todos os status</option>
            <option value="PENDING">Pendentes</option>
            <option value="SENT">Enviadas</option>
            <option value="REJECTED">Rejeitadas</option>
          </select>
          <Button variant="secondary" onClick={() => messagesQuery.refetch()}>
            Atualizar
          </Button>
        </div>
      </div>

      {counts.pending > 0 && (
        <button
          type="button"
          onClick={() => focusPendingQueue()}
          className="w-full rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-left text-sm text-amber-900 transition-colors hover:bg-amber-100"
        >
          Existem {counts.pending} mensagem{counts.pending > 1 ? 'ens' : ''} aguardando aprovacao no escritorio.
          <span className="ml-2 font-semibold">Clique para abrir a fila pendente.</span>
        </button>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map(card => {
          const isActive = statusFilter === card.filter
          return (
            <button
              key={card.label}
              type="button"
              onClick={() => {
                if (card.filter === 'PENDING') {
                  focusPendingQueue()
                  return
                }
                setStatusFilter(card.filter)
              }}
              className="text-left"
            >
              <Card className={`transition-all ${isActive ? 'border-blue-300 ring-2 ring-blue-100' : 'hover:border-gray-300 hover:shadow-md'}`}>
                <CardContent className="py-6 text-center">
                  <div className={`text-3xl font-semibold ${card.color}`}>{card.value}</div>
                  <div className="mt-2 text-xs font-medium uppercase tracking-[0.2em] text-gray-500">{card.label}</div>
                  {card.filter === 'PENDING' && card.value > 0 && (
                    <div className="mt-3 text-xs font-medium text-amber-700">Clique para ver tudo que falta enviar</div>
                  )}
                </CardContent>
              </Card>
            </button>
          )
        })}
      </div>

      {counts.pending > 0 && (
        <Card className="border border-amber-200 bg-amber-50/40">
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Pendentes para envio</h2>
                <p className="text-sm text-gray-500">Atalho rapido com tudo que esta aguardando sua aprovacao.</p>
              </div>
              <Button variant="secondary" onClick={() => focusPendingQueue()}>
                Abrir fila completa
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {pendingMessages.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => focusPendingQueue(item.id)}
                  className="rounded-xl border border-amber-200 bg-white p-4 text-left shadow-sm transition-colors hover:bg-amber-50"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-semibold text-gray-900">{item.titulo || 'Mensagem para o cliente'}</div>
                    <Badge variant="warning">Pendente</Badge>
                    <Badge variant="info">{SOURCE_LABEL[item.sourceType]}</Badge>
                  </div>
                  <div className="mt-2 text-sm text-gray-600">{item.clienteNome} - {getReferenceLabel(item)}</div>
                  <div className="mt-2 line-clamp-2 text-sm text-gray-500">{item.draftMessage}</div>
                  <div className="mt-3 text-xs text-amber-700">Clique para revisar e enviar</div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Novo envio manual</h2>
            <p className="text-sm text-gray-500">
              Use este espaco para enviar uma mensagem livre ao cliente e manter o envio auditado no historico do escritorio.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Cliente</label>
              <select
                value={manualClienteId}
                onChange={e => setManualClienteId(e.target.value)}
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Selecione um cliente</option>
                {(clientsQuery.data ?? []).map(cliente => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.nome}
                  </option>
                ))}
              </select>
              {selectedClient?.whatsapp ? (
                <p className="mt-2 text-xs text-gray-500">WhatsApp: {selectedClient.whatsapp}</p>
              ) : selectedClient ? (
                <p className="mt-2 text-xs text-rose-600">Este cliente ainda nao tem WhatsApp cadastrado.</p>
              ) : null}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">CNJ do processo</label>
              <input
                value={manualCnj}
                onChange={e => setManualCnj(e.target.value)}
                placeholder="Opcional. Deixe em branco para envio livre do escritorio"
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Titulo</label>
            <input
              value={manualTitulo}
              onChange={e => setManualTitulo(e.target.value)}
              placeholder="Ex.: Atualizacao do processo"
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Mensagem</label>
            <textarea
              value={manualMensagem}
              onChange={e => setManualMensagem(e.target.value)}
              placeholder="Digite a mensagem que deseja enviar ao cliente"
              className="min-h-[160px] w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            <div>
              Este envio vai direto para o cliente e sera registrado com auditoria completa.
            </div>
            <Button
              disabled={manualMutation.isPending || !manualClienteId || !manualMensagem.trim()}
              onClick={() =>
                manualMutation.mutate({
                  clienteId: manualClienteId,
                  cnj: manualCnj.trim() || undefined,
                  titulo: manualTitulo.trim() || undefined,
                  mensagem: manualMensagem,
                })
              }
            >
              {manualMutation.isPending ? 'Enviando...' : 'Enviar mensagem'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div ref={queueRef} className="grid grid-cols-1 gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Fila do escritorio</h2>
                <p className="text-sm text-gray-500">Selecione uma mensagem para revisar, auditar ou abrir o processo correspondente.</p>
              </div>
              {statusFilter === 'PENDING' && counts.pending > 0 && (
                <div className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                  Mostrando somente pendentes
                </div>
              )}
            </div>

            {messagesQuery.isLoading ? (
              <p className="text-sm text-gray-500">Carregando mensagens...</p>
            ) : messages.length === 0 ? (
              <Empty title="Nenhuma mensagem encontrada" description="Quando o monitoramento gerar comunicacoes, elas aparecem aqui." />
            ) : (
              <div className="space-y-3">
                {messages.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={`w-full rounded-xl border p-4 text-left transition-colors ${selectedMessage?.id === item.id ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-semibold text-gray-900">{item.titulo || 'Mensagem para o cliente'}</div>
                      <Badge variant={STATUS_VARIANT[item.status]}>{STATUS_LABEL[item.status]}</Badge>
                      <Badge variant="info">{SOURCE_LABEL[item.sourceType] || item.sourceType}</Badge>
                    </div>
                    <div className="mt-2 text-sm text-gray-600">{item.clienteNome} - {getReferenceLabel(item)}</div>
                    <div className="mt-2 line-clamp-2 text-sm text-gray-500">{item.draftMessage}</div>
                    <div className="mt-3 text-xs text-gray-400">Atualizada em {formatDateBR(item.updatedAt)}</div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4">
            {!selectedMessage ? (
              <Empty title="Selecione uma mensagem" description="Escolha um item da fila para ver o detalhe completo e a auditoria." />
            ) : (
              <>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold text-gray-900">{selectedMessage.titulo || 'Mensagem para o cliente'}</h2>
                      <Badge variant={STATUS_VARIANT[selectedMessage.status]}>{STATUS_LABEL[selectedMessage.status]}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-gray-500">{selectedMessage.clienteNome} - {getReferenceLabel(selectedMessage)}</p>
                  </div>
                  {hasLinkedProcess(selectedMessage) && (
                    <Button
                      variant="secondary"
                      onClick={() => navigate(`/process/${selectedMessage.cnj}`, { state: { returnTab: 'comunicacao' } })}
                    >
                      Abrir processo
                    </Button>
                  )}
                </div>

                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="mb-2 text-sm font-semibold text-gray-900">Texto da mensagem</div>
                  {selectedMessage.status === 'PENDING' ? (
                    <textarea
                      value={draftText}
                      onChange={e => setDraftText(e.target.value)}
                      className="min-h-[160px] w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  ) : (
                    <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{selectedMessage.draftMessage}</div>
                  )}
                </div>

                {selectedMessage.status === 'PENDING' && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={approveMutation.isPending || !draftText.trim()}
                      onClick={() => approveMutation.mutate({ id: selectedMessage.id, text: draftText })}
                    >
                      {approveMutation.isPending ? 'Enviando...' : 'Aprovar e enviar'}
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={rejectMutation.isPending}
                      onClick={() => rejectMutation.mutate(selectedMessage.id)}
                    >
                      Rejeitar
                    </Button>
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Auditoria</h3>
                    <p className="text-sm text-gray-500">Eventos de criacao, edicao, aprovacao, envio e rejeicao.</p>
                  </div>
                  {eventsQuery.isLoading ? (
                    <p className="text-sm text-gray-500">Carregando eventos...</p>
                  ) : (eventsQuery.data ?? []).length === 0 ? (
                    <Empty title="Sem eventos registrados" description="Os proximos eventos desta mensagem aparecerao aqui." />
                  ) : (
                    <div className="space-y-3">
                      {(eventsQuery.data ?? []).map((event: ClientMessageEvent) => (
                        <div key={event.id} className="rounded-xl border border-gray-200 bg-white p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-sm font-semibold text-gray-900">{EVENT_LABEL[event.eventType] || event.eventType}</div>
                            <div className="text-xs text-gray-400">{formatDateBR(event.createdAt)}</div>
                          </div>
                          {event.actorEmail && (
                            <div className="mt-1 text-xs text-gray-500">Responsavel: {event.actorEmail}</div>
                          )}
                          {event.messageSnapshot && (
                            <div className="mt-2 whitespace-pre-wrap text-sm text-gray-600">{event.messageSnapshot}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default Comunicacao
