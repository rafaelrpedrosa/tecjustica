import type { Process } from './process'

export type FaseProcessual = 'CONHECIMENTO' | 'SENTENCIADO' | 'LIQUIDACAO_EXECUCAO' | 'AGUARDANDO_RPV' | 'ARQUIVADO'

export interface EscritorioProcesso {
  id: string
  cnj: string
  clienteNome: string
  clientePolo: 'ATIVO' | 'PASSIVO' | 'TERCEIRO'
  clienteId?: string
  faseProcessual?: FaseProcessual
  responsavel?: string
  vara?: string
  monitorar: boolean
  notas?: string
  ultimaVerificacao?: string
  ultimoHashMovimento?: string
  createdAt: string
  updatedAt: string
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
  clienteId?: string
  faseProcessual?: FaseProcessual
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

export interface TribunalMetrica {
  tribunal: string
  mediaDistribuicaoSentenca: number | null
  mediaSentencaLiquidacao: number | null
  totalComSentenca: number
  totalEmLiquidacao: number
}

export interface TipoAcaoMetrica {
  tipoAcao: string
  totalProcessos: number
  mediaTempoTotal: number | null
}

export interface FaseMetrica {
  fase: string
  totalProcessos: number
  mediaTempoTotal: number | null
}

export interface AssuntoMetrica {
  assunto: string
  totalProcessos: number
}

export interface ProcessoTempoResumo {
  cnj: string
  clienteNome: string
  tribunal: string | null
  classe: string | null
  assunto: string | null
  fase: string
  tempoTotalDias: number | null
  ultimaMovimentacaoData: string | null
  temSentenca: boolean
  emLiquidacao: boolean
  aguardandoRpv: boolean
}

export interface ResumoMetrica {
  totalProcessos: number
  processosComMovimentos: number
  processosComSentenca: number
  processosEmLiquidacao: number
  processosEmConhecimento: number
  processosAguardandoRpv: number
  mediaGeralDias: number | null
}

export interface MetricasTempo {
  porTribunal: TribunalMetrica[]
  porTipoAcao: TipoAcaoMetrica[]
  porFase: FaseMetrica[]
  porAssunto: AssuntoMetrica[]
  processos: ProcessoTempoResumo[]
  resumo: ResumoMetrica
}

