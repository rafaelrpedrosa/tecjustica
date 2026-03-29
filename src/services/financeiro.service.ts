import { apiClient } from './api'
import type {
  CriarCobrancaInput,
  FinanceiroClienteGateway,
  FinanceiroCobranca,
} from '@/types/financeiro'

export async function sincronizarClienteAsaas(clienteId: string): Promise<FinanceiroClienteGateway> {
  const res = await apiClient.post<FinanceiroClienteGateway>('/api/financeiro/clientes/sync', { clienteId })
  return res.data
}

export async function listarCobrancas(params?: { clienteId?: string; status?: string; processoCnj?: string }): Promise<FinanceiroCobranca[]> {
  const query = new URLSearchParams()
  if (params?.clienteId) query.set('clienteId', params.clienteId)
  if (params?.status) query.set('status', params.status)
  if (params?.processoCnj) query.set('processoCnj', params.processoCnj)
  const suffix = query.toString() ? `?${query.toString()}` : ''
  const res = await apiClient.get<FinanceiroCobranca[]>(`/api/financeiro/cobrancas${suffix}`)
  return res.data
}

export async function buscarCobranca(id: string): Promise<FinanceiroCobranca> {
  const res = await apiClient.get<FinanceiroCobranca>(`/api/financeiro/cobrancas/${id}`)
  return res.data
}

export async function criarCobranca(input: CriarCobrancaInput): Promise<FinanceiroCobranca> {
  const res = await apiClient.post<FinanceiroCobranca>('/api/financeiro/cobrancas', input)
  return res.data
}

export async function sincronizarCobranca(id: string): Promise<FinanceiroCobranca> {
  const res = await apiClient.post<FinanceiroCobranca>(`/api/financeiro/cobrancas/${id}/sync`)
  return res.data
}
