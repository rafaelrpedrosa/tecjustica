import type { Process } from './process'

export interface EscritorioProcesso {
  id: string
  cnj: string
  clienteNome: string
  clientePolo: 'ATIVO' | 'PASSIVO' | 'TERCEIRO'
  responsavel?: string
  vara?: string
  monitorar: boolean
  notas?: string
  ultimaVerificacao?: string
  ultimoHashMovimento?: string
  createdAt: string
  updatedAt: string
  // Dados do processo (join)
  processo?: Process
  alertasNaoLidos?: number
}

export interface EscritorioAlerta {
  id: string
  cnj: string
  tipo: 'NOVO_MOVIMENTO' | 'NOVO_DOCUMENTO'
  descricao: string
  lido: boolean
  createdAt: string
}

export interface CadastroProcessoInput {
  cnj: string
  clienteNome: string
  clientePolo: 'ATIVO' | 'PASSIVO' | 'TERCEIRO'
  responsavel?: string
  vara?: string
  monitorar?: boolean
  notas?: string
}

export interface MonitoramentoResultado {
  cnj: string
  alertasCriados: EscritorioAlerta[]
  ultimaVerificacao: string
  mensagem: string
}
