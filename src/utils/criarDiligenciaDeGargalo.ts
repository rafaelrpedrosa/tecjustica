import type { GargaloProcessual, TipoGargalo } from '@/types/gargalo'
import type { DiligenciaOperacional, PrioridadeDiligencia, TipoAcaoDiligencia } from '@/types/diligencia'

// Prioridade já usa os mesmos valores — passthrough direto
const PRIORIDADE_MAP: Record<string, PrioridadeDiligencia> = {
  URGENTE: 'URGENTE',
  ALTA: 'ALTA',
  NORMAL: 'NORMAL',
  MONITORAR: 'MONITORAR',
}

const ACAO_MAP: Record<TipoGargalo, TipoAcaoDiligencia> = {
  CONCLUSO_SENTENCA_ATRASADO: 'LIGACAO_GABINETE',
  CONCLUSO_DESPACHO_ATRASADO: 'LIGACAO_SECRETARIA',
  LAUDO_JUNTADO_SEM_IMPULSO: 'LIGACAO_SECRETARIA',
  RPV_PENDENTE: 'LIGACAO_SECRETARIA',
  EXECUCAO_TRAVADA: 'LIGACAO_SECRETARIA',
  PETICAO_SEM_ANALISE: 'RECHECK',
  PROCESSO_SEM_MOVIMENTACAO: 'RECHECK',
}

export function criarDiligenciaDeGargalo(
  cnj: string,
  clienteNome: string | undefined,
  gargalo: GargaloProcessual
): DiligenciaOperacional {
  return {
    id: crypto.randomUUID(),
    cnj,
    clienteNome,
    tipoGargalo: gargalo.tipo,
    descricao: gargalo.descricao,
    prioridade: PRIORIDADE_MAP[gargalo.prioridade] ?? 'NORMAL',
    diasParado: gargalo.diasParado,
    acaoRecomendada: ACAO_MAP[gargalo.tipo] ?? 'RECHECK',
    status: 'PENDENTE',
    dataCriacao: new Date().toISOString(),
  }
}
