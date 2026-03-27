export type ClientMessageStatus = 'PENDING' | 'SENT' | 'REJECTED'

export type ClientMessageSourceType =
  | 'MOVIMENTO_AUTO'
  | 'MOVIMENTO_MANUAL'
  | 'DOCUMENTO_MANUAL'
  | 'STATUS_TRIMESTRAL'

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
