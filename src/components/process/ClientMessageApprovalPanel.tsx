import React, { useEffect, useState } from 'react'
import Card, { CardContent } from '@/components/common/Card'
import Button from '@/components/common/Button'
import Empty from '@/components/common/Empty'
import { formatDateBR } from '@/utils/format'
import type { ClientMessageApproval } from '@/types/client-message'

interface Props {
  approvals: ClientMessageApproval[]
  loading?: boolean
  onApprove: (id: string, draftMessage: string) => Promise<void>
  onReject: (id: string) => Promise<void>
}

const ClientMessageApprovalPanel: React.FC<Props> = ({
  approvals,
  loading = false,
  onApprove,
  onReject,
}) => {
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    setDrafts((current) => {
      const next = { ...current }
      for (const approval of approvals) {
        if (typeof next[approval.id] !== 'string') {
          next[approval.id] = approval.draftMessage
        }
      }
      return next
    })
  }, [approvals])

  return (
    <Card className="border border-amber-200 bg-amber-50/40">
      <CardContent className="py-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              Mensagens pendentes de aprovacao
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              O sistema so envia ao cliente depois da sua confirmacao.
            </p>
          </div>
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
            {approvals.map((approval) => (
              <div key={approval.id} className="rounded-lg border border-amber-200 bg-white p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {approval.titulo || 'Mensagem para o cliente'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Criada em {formatDateBR(approval.createdAt)} para {approval.clienteNome}
                    </p>
                  </div>
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                    Pendente
                  </span>
                </div>

                <textarea
                  className="w-full min-h-[132px] rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={drafts[approval.id] ?? approval.draftMessage}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [approval.id]: event.target.value,
                    }))
                  }
                />

                <div className="flex flex-wrap gap-2">
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
                    variant="ghost"
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
      </CardContent>
    </Card>
  )
}

export default ClientMessageApprovalPanel
