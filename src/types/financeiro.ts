import type { Cliente } from './cliente'

export type AsaasEnvironment = 'sandbox' | 'production'
export type BillingType = 'BOLETO' | 'PIX' | 'UNDEFINED'

export interface FinanceiroClienteGateway {
  id: string
  clienteId: string
  gateway: string
  gatewayCustomerId: string
  createdAt: string
  updatedAt: string
}

export interface FinanceiroCobranca {
  id: string
  clienteId: string
  processoCnj?: string
  gateway: string
  gatewayChargeId: string
  gatewayCustomerId?: string
  descricao: string
  valor: number
  billingType: BillingType
  status: string
  dueDate: string
  invoiceUrl?: string
  bankSlipUrl?: string
  pixQrCode?: string
  pixCopyPaste?: string
  externalReference?: string
  paidAt?: string
  createdAt: string
  updatedAt: string
  cliente?: Cliente
}

export interface CriarCobrancaInput {
  clienteId: string
  processoCnj?: string
  descricao: string
  valor: number
  billingType: BillingType
  dueDate: string
}
