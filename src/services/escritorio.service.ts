import { apiClient } from './api'
import type {
  EscritorioProcesso,
  EscritorioAlerta,
  CadastroProcessoInput,
  MonitoramentoResultado,
  MetricasTempo,
} from '@/types/escritorio'

export async function listarProcessos(): Promise<EscritorioProcesso[]> {
  const { data } = await apiClient.get('/api/escritorio/processos')
  return data
}

export async function cadastrarProcesso(input: CadastroProcessoInput): Promise<EscritorioProcesso> {
  const { data } = await apiClient.post('/api/escritorio/processos', input)
  return data
}

export async function atualizarProcesso(
  cnj: string,
  updates: Partial<CadastroProcessoInput>
): Promise<void> {
  await apiClient.put(`/api/escritorio/processos/${encodeURIComponent(cnj)}`, updates)
}

export async function removerProcesso(cnj: string): Promise<void> {
  await apiClient.delete(`/api/escritorio/processos/${encodeURIComponent(cnj)}`)
}

export async function monitorarProcesso(cnj: string): Promise<MonitoramentoResultado> {
  const { data } = await apiClient.post(`/api/escritorio/monitorar/${encodeURIComponent(cnj)}`)
  return data
}

export async function monitorarTodos(): Promise<{ mensagem: string; processos: string[] }> {
  const { data } = await apiClient.post('/api/escritorio/monitorar')
  return data
}

export async function listarAlertas(): Promise<EscritorioAlerta[]> {
  const { data } = await apiClient.get('/api/escritorio/alertas')
  return data
}

export async function marcarAlertaLido(id: string): Promise<void> {
  await apiClient.put(`/api/escritorio/alertas/${id}/lido`)
}

export async function marcarAlertasLidosPorCNJ(cnj: string): Promise<void> {
  await apiClient.put(`/api/escritorio/alertas/lidos/cnj/${encodeURIComponent(cnj)}`)
}

export async function verificarCadastro(cnj: string): Promise<EscritorioProcesso | null> {
  try {
    const processos = await listarProcessos()
    return processos.find(p => p.cnj === cnj) || null
  } catch {
    return null
  }
}

export async function listarMetricasTempo(
  periodo: '6m' | '1a' | 'tudo' = 'tudo'
): Promise<MetricasTempo> {
  const res = await apiClient.get<MetricasTempo>(
    `/api/escritorio/metricas-tempo?periodo=${periodo}`
  )
  return res.data
}
