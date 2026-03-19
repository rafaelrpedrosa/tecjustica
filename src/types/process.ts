/**
 * Tipos para Processos Judiciais
 */

export interface Process {
  id?: string
  cnj: string
  tribunal: string
  classe: string
  assunto: string
  status: string
  valor?: number
  dataAbertura?: Date | string
  juiz?: string
  descricao?: string
  resumo?: string
  jsonResumo?: Record<string, any>
  createdAt?: string
  updatedAt?: string
}

export interface Party {
  id: string
  processId?: string
  tipo: 'AUTOR' | 'RÉU' | 'RECLAMANTE' | 'RECLAMADA' | 'TERCEIRO' | string
  nome: string
  cpfCnpj?: string
  cpfCnpjFormatado?: string
  email?: string
  telefone?: string
  endereco?: string
  complementoEndereco?: string
  lawyers?: Lawyer[]
  advogados?: Lawyer[]
  createdAt?: string
  updatedAt?: string
}

export interface Lawyer {
  id?: string
  partyId?: string
  nome: string
  oab?: string
  email?: string
  telefone?: string
  createdAt?: string
  updatedAt?: string
}

export interface ProcessMovement {
  id: string
  processId?: string
  data: Date | string
  descricao: string
  orgao?: string
  tipo?: string
  hashUnico?: string
  createdAt?: string
  updatedAt?: string
}

export interface ProcessOverview {
  process: Process
  parties: Party[]
  movements: ProcessMovement[]
  documentCount: number
  lastUpdated: string
}
