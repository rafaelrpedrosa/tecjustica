export type PrioridadeDiligencia = 'URGENTE' | 'ALTA' | 'NORMAL' | 'MONITORAR'
export type StatusDiligencia = 'PENDENTE' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'SEM_RETORNO'
export type TipoAcaoDiligencia =
  | 'LIGACAO_SECRETARIA'
  | 'LIGACAO_GABINETE'
  | 'EMAIL_VARA'
  | 'RECHECK'

export interface DiligenciaOperacional {
  id: string
  cnj: string
  clienteNome?: string
  tipoGargalo: string
  descricao: string
  prioridade: PrioridadeDiligencia
  diasParado: number
  acaoRecomendada: TipoAcaoDiligencia
  status: StatusDiligencia
  responsavel?: string
  dataCriacao: string
  dataPrevista?: string
  dataExecucao?: string
  retorno?: string
  proximaAcao?: string
  proximaData?: string
}
