export type ClientMessageStatus = 'PENDING' | 'SENT' | 'REJECTED'

export type ClientMessageSourceType =
  | 'MOVIMENTO_AUTO'
  | 'MOVIMENTO_MANUAL'
  | 'DOCUMENTO_MANUAL'
  | 'STATUS_TRIMESTRAL'
  | 'MANUAL_FREEFORM'

export type ClientMessageTimelineFilter = 'ALL' | ClientMessageStatus

export type ClientMessageEventType =
  | 'CREATED'
  | 'REOPENED'
  | 'EDITED'
  | 'APPROVED'
  | 'SENT'
  | 'REJECTED'

export interface ClientMessageApproval {
  id: string
  cnj: string
  clienteId?: string
  clienteNome: string
  clienteWhatsapp?: string
  sourceType: ClientMessageSourceType
  sourceReference: string
  titulo?: string
  draftMessage: string
  status: ClientMessageStatus
  payloadJson?: Record<string, unknown>
  approvedAt?: string
  sentAt?: string
  rejectedAt?: string
  createdAt: string
  updatedAt: string
}

export interface ClientMessageEvent {
  id: string
  approvalId: string
  cnj: string
  eventType: ClientMessageEventType
  messageSnapshot?: string
  metaJson?: Record<string, unknown>
  actorUserId?: string
  actorEmail?: string
  createdAt: string
}

export interface CreateMovementDraftInput {
  cnj: string
  movement: {
    id: string
    data?: string
    tipo?: string
    descricao: string
    orgao?: string
  }
}

export interface CreateDocumentDraftInput {
  cnj: string
  document: {
    id: string
    titulo: string
    tipo?: string
    dataCriacao?: string
    paginas?: number
  }
}

export interface SendManualClientMessageInput {
  clienteId: string
  mensagem: string
  titulo?: string
  cnj?: string
}
