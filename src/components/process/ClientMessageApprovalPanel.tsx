import React, { useEffect, useMemo, useState } from 'react'
import Card, { CardContent } from '@/components/common/Card'
import Button from '@/components/common/Button'
import Empty from '@/components/common/Empty'
import Badge from '@/components/common/Badge'
import { formatDateBR } from '@/utils/format'
import type {
  ClientMessageApproval,
  ClientMessageSourceType,
  ClientMessageStatus,
  ClientMessageTimelineFilter,
} from '@/types/client-message'

interface Props {
  approvals: ClientMessageApproval[]
  timeline: ClientMessageApproval[]
  loading?: boolean
  onApprove: (id: string, draftMessage: string) => Promise<void>
  onReject: (id: string) => Promise<void>
}

const SOURCE_LABEL: Record<ClientMessageSourceType, string> = {
  MOVIMENTO_AUTO: 'Movimentacao automatica',
  MOVIMENTO_MANUAL: 'Movimentacao manual',
  DOCUMENTO_MANUAL: 'Documento',
  STATUS_TRIMESTRAL: 'Atualizacao trimestral',
  MANUAL_FREEFORM: 'Envio manual',
}

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

function getStatusDescription(item: ClientMessageApproval) {
  if (item.status === 'SENT' && item.sentAt) return `Enviada em ${formatDateBR(item.sentAt)}`
  if (item.status === 'REJECTED' && item.rejectedAt) return `Rejeitada em ${formatDateBR(item.rejectedAt)}`
  return `Criada em ${formatDateBR(item.createdAt)}`
}

const ClientMessageApprovalPanel: React.FC<Props> = ({
  approvals,
  timeline,
  loading = false,
  onApprove,
  onReject,
}) => {
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [timelineFilter, setTimelineFilter] = useState<ClientMessageTimelineFilter>('ALL')

  useEffect(() => {
    setDrafts(current => {
      const next = { ...current }
      for (const approval of approvals) {
        if (typeof next[approval.id] !== 'string') {
          next[approval.id] = approval.draftMessage
        }
      }
      return next
    })
  }, [approvals])

  const summary = useMemo(() => {
    const sent = timeline.filter(item => item.status === 'SENT').length
    const rejected = timeline.filter(item => item.status === 'REJECTED').length
    const pending = approvals.length
    const lastSent = timeline.find(item => item.status === 'SENT')
    return { pending, sent, rejected, lastSent }
  }, [approvals.length, timeline])

  const filteredTimeline = useMemo(() => {
    if (timelineFilter === 'ALL') return timeline
    return timeline.filter(item => item.status === timelineFilter)
  }, [timeline, timelineFilter])

  return (
    <Card className="border border-amber-200 bg-amber-50/30">
      <CardContent className="space-y-6 py-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h3 className="text-xl font-semibold text-gray-900">Central de comunicacao com o cliente</h3>
              {summary.pending > 0 && (
                <span className="inline-flex items-center rounded-full bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white">
                  {summary.pending} pronta{summary.pending > 1 ? 's' : ''} para envio
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-gray-600">
              Aprove, acompanhe o historico e identifique rapidamente o que esta aguardando sua confirmacao.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardContent className="py-5 text-center">
              <div className="text-3xl font-semibold text-amber-600">{summary.pending}</div>
              <div className="mt-2 text-xs font-medium uppercase tracking-[0.2em] text-gray-500">Pendentes</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-5 text-center">
              <div className="text-3xl font-semibold text-green-600">{summary.sent}</div>
              <div className="mt-2 text-xs font-medium uppercase tracking-[0.2em] text-gray-500">Enviadas</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-5 text-center">
              <div className="text-3xl font-semibold text-rose-600">{summary.rejected}</div>
              <div className="mt-2 text-xs font-medium uppercase tracking-[0.2em] text-gray-500">Rejeitadas</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-5 text-center">
              <div className="text-sm font-semibold text-gray-900">
                {summary.lastSent ? formatDateBR(summary.lastSent.sentAt || summary.lastSent.createdAt) : 'Sem envio'}
              </div>
              <div className="mt-2 text-xs font-medium uppercase tracking-[0.2em] text-gray-500">Ultimo envio</div>
            </CardContent>
          </Card>
        </div>

        {summary.pending > 0 && (
          <div className="rounded-xl border border-amber-300 bg-amber-100/70 px-4 py-3 text-sm text-amber-900">
            Existem mensagens prontas para envio. Revise os rascunhos abaixo para nao deixar o cliente sem atualizacao.
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <div>
              <h4 className="text-lg font-semibold text-gray-900">Pendentes de aprovacao</h4>
              <p className="text-sm text-gray-500">O sistema so envia ao cliente depois da sua confirmacao.</p>
            </div>

            {loading ? (
              <p className="text-sm text-gray-500">Carregando mensagens pendentes...</p>
            ) : approvals.length === 0 ? (
              <Empty
                title="Nenhuma mensagem pendente"
                description="Quando voce preparar um envio ou o monitoramento detectar algo relevante, o rascunho aparece aqui."
              />
            ) : (
              <div className="space-y-4">
                {approvals.map(approval => (
                  <div key={approval.id} className="rounded-xl border border-amber-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-base font-semibold text-gray-900">{approval.titulo || 'Mensagem para o cliente'}</p>
                          <Badge variant={STATUS_VARIANT[approval.status]}>{STATUS_LABEL[approval.status]}</Badge>
                          <Badge variant="info">{SOURCE_LABEL[approval.sourceType]}</Badge>
                        </div>
                        <p className="text-sm text-gray-500">
                          {approval.clienteNome} · criada em {formatDateBR(approval.createdAt)}
                        </p>
                      </div>
                    </div>

                    <textarea
                      className="mt-4 min-h-[152px] w-full rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={drafts[approval.id] ?? approval.draftMessage}
                      onChange={event =>
                        setDrafts(current => ({
                          ...current,
                          [approval.id]: event.target.value,
                        }))
                      }
                    />

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        disabled={busyId === approval.id || !(drafts[approval.id] ?? approval.draftMessage).trim()}
                        onClick={async () => {
                          setBusyId(approval.id)
                          try {
                            await onApprove(approval.id, drafts[approval.id] ?? approval.draftMessage)
                          } finally {
                            setBusyId(null)
                          }
                        }}
                      >
                        {busyId === approval.id ? 'Enviando...' : 'Aprovar e enviar'}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busyId === approval.id}
                        onClick={async () => {
                          setBusyId(approval.id)
                          try {
                            await onReject(approval.id)
                          } finally {
                            setBusyId(null)
                          }
                        }}
                      >
                        Rejeitar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h4 className="text-lg font-semibold text-gray-900">Linha do tempo</h4>
                <p className="text-sm text-gray-500">Mensagens pendentes, enviadas e rejeitadas deste processo.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 'ALL', label: 'Todas' },
                  { value: 'PENDING', label: 'Pendentes' },
                  { value: 'SENT', label: 'Enviadas' },
                  { value: 'REJECTED', label: 'Rejeitadas' },
                ].map(filter => (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => setTimelineFilter(filter.value as ClientMessageTimelineFilter)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${timelineFilter === filter.value ? 'bg-blue-100 text-blue-700' : 'bg-white text-gray-500 hover:bg-gray-100'}`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>

            {filteredTimeline.length === 0 ? (
              <Empty title="Sem historico ainda" description="Assim que houver mensagens geradas ou enviadas, a timeline aparecera aqui." />
            ) : (
              <div className="space-y-4">
                {filteredTimeline.map(item => (
                  <div key={item.id} className="relative rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="absolute left-0 top-6 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-white bg-blue-500" />
                    <div className="ml-2 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900">{item.titulo || 'Mensagem para o cliente'}</p>
                        <Badge variant={STATUS_VARIANT[item.status]}>{STATUS_LABEL[item.status]}</Badge>
                        <Badge variant="info">{SOURCE_LABEL[item.sourceType]}</Badge>
                      </div>
                      <p className="text-xs text-gray-500">{getStatusDescription(item)}</p>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{item.draftMessage}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default ClientMessageApprovalPanel
