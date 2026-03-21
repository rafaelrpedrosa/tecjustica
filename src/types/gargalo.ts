export type TipoGargalo =
  | 'CONCLUSO_SENTENCA_ATRASADO'
  | 'CONCLUSO_DESPACHO_ATRASADO'
  | 'LAUDO_JUNTADO_SEM_IMPULSO'
  | 'PETICAO_SEM_ANALISE'
  | 'PROCESSO_SEM_MOVIMENTACAO'
  | 'RPV_PENDENTE'
  | 'EXECUCAO_TRAVADA'

export type PrioridadeGargalo = 'URGENTE' | 'ALTA' | 'NORMAL' | 'MONITORAR'

export interface GargaloProcessual {
  tipo: TipoGargalo
  descricao: string
  diasParado: number
  prioridade: PrioridadeGargalo
  acaoRecomendada: string
  marcoRelevante?: string  // texto do movimento-marco
  dataMarco?: string       // ISO date do marco
  detalhes?: string
}
