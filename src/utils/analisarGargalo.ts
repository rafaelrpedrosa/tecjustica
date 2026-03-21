import type { ProcessMovement } from '@/types/process'
import type { GargaloProcessual, PrioridadeGargalo, TipoGargalo } from '@/types/gargalo'
import { findFirst, houveImpulsoApos, diasDesde } from '@/utils/processRules'

/** Garante que a data do movimento seja sempre string */
function toStr(d: string | Date): string {
  return typeof d === 'string' ? d : d.toISOString()
}

// ---------------------------------------------------------------------------
// Padrões heurísticos por categoria
// ---------------------------------------------------------------------------

const P_CONCLUSO_SENTENCA = [
  'concluso para sentenca',
  'autos conclusos para sentenca',
  'conclusao para sentenca',
  'conclusos para sentenca',
]

const P_CONCLUSO_DESPACHO = [
  'concluso para despacho',
  'concluso para decisao',
  'autos conclusos',
  'conclusao ao magistrado',
  'conclusos ao juiz',
  'concluso',
]

const P_LAUDO = [
  'laudo pericial',
  'pericia juntada',
  'juntada de laudo',
  'laudo medico pericial',
  'expediente pericial',
  'laudo do perito',
]

const P_RPV = [
  'rpv',
  'requisicao de pagamento',
  'precatorio',
  'calculo homologado',
  'requisitorio',
  'conta elaborada',
  'calculos homologados',
]

const P_EXECUCAO = [
  'cumprimento de sentenca',
  'execucao iniciada',
  'penhora',
  'sisbajud',
  'calculo do contador',
  'intimacao para pagamento',
  'bloqueio sisbajud',
]

const P_PETICAO = [
  'peticao juntada',
  'peticao protocolada',
  'juntada de peticao',
  'manifestacao da parte autora',
  'manifestacao da parte',
  'peticao de cumprimento',
  'apresentacao de calculos',
]

// Padrões que indicam impulso processual útil (anulam gargalos anteriores)
const P_IMPULSO_JUDICIAL = [
  'sentenca',
  'julgamento',
  'dispositivo',
  'despacho',
  'decisao',
  'conclusao',
  'homologacao',
  'acórdão',
  'acordao',
]

const P_IMPULSO_PAGAMENTO = [
  'expedicao',
  'expedição',
  'pagamento efetuado',
  'transitou',
  'levantamento',
  'extincao',
  'extinção',
]

// ---------------------------------------------------------------------------
// Helpers de prioridade
// ---------------------------------------------------------------------------

function prioridadePorDias(
  dias: number,
  limiteAlta: number,
  limiteUrgente: number
): PrioridadeGargalo {
  if (dias >= limiteUrgente) return 'URGENTE'
  if (dias >= limiteAlta) return 'ALTA'
  return 'NORMAL'
}

function makeGargalo(
  tipo: TipoGargalo,
  descricao: string,
  diasParado: number,
  prioridade: PrioridadeGargalo,
  acaoRecomendada: string,
  marcoRelevante?: string,
  dataMarco?: string
): GargaloProcessual {
  return { tipo, descricao, diasParado, prioridade, acaoRecomendada, marcoRelevante, dataMarco }
}

// ---------------------------------------------------------------------------
// Motor principal
// ---------------------------------------------------------------------------

export function analisarGargalo(movements: ProcessMovement[]): GargaloProcessual | null {
  if (!movements.length) return null

  // --- Regra 1: Concluso para SENTENÇA ---
  const idxSentenca = findFirst(movements, P_CONCLUSO_SENTENCA)
  if (idxSentenca !== -1) {
    const mov = movements[idxSentenca]
    const dias = diasDesde(mov.data)
    if (dias >= 15) {
      return makeGargalo(
        'CONCLUSO_SENTENCA_ATRASADO',
        `Processo concluso para sentença há ${dias} dia${dias !== 1 ? 's' : ''}`,
        dias,
        prioridadePorDias(dias, 15, 30),
        'Ligar para o gabinete verificar previsão de julgamento',
        mov.descricao,
        toStr(mov.data)
      )
    }
  }

  // --- Regra 2: Concluso para DESPACHO/DECISÃO ---
  // Só aplica se não for sentença (já verificado acima ou não atingiu limiar)
  const idxConcluso = findFirst(movements, P_CONCLUSO_DESPACHO)
  if (idxConcluso !== -1) {
    const mov = movements[idxConcluso]
    const dias = diasDesde(mov.data)
    // Verificar se houve impulso após (índice menor = mais recente)
    const anulado = houveImpulsoApos(movements, idxConcluso, P_IMPULSO_JUDICIAL)
    if (!anulado && dias >= 10) {
      return makeGargalo(
        'CONCLUSO_DESPACHO_ATRASADO',
        `Processo concluso sem despacho ou decisão há ${dias} dia${dias !== 1 ? 's' : ''}`,
        dias,
        prioridadePorDias(dias, 10, 20),
        'Ligar para a secretaria verificar andamento',
        mov.descricao,
        toStr(mov.data)
      )
    }
  }

  // --- Regra 3: Laudo pericial sem impulso ---
  const idxLaudo = findFirst(movements, P_LAUDO)
  if (idxLaudo !== -1) {
    const mov = movements[idxLaudo]
    const dias = diasDesde(mov.data)
    const anulado = houveImpulsoApos(movements, idxLaudo, P_IMPULSO_JUDICIAL)
    if (!anulado && dias >= 10) {
      return makeGargalo(
        'LAUDO_JUNTADO_SEM_IMPULSO',
        `Laudo pericial juntado há ${dias} dia${dias !== 1 ? 's' : ''} sem impulso posterior`,
        dias,
        prioridadePorDias(dias, 10, 25),
        'Verificar julgamento — ligar para a secretaria',
        mov.descricao,
        toStr(mov.data)
      )
    }
  }

  // --- Regra 4: RPV/pagamento pendente ---
  const idxRpv = findFirst(movements, P_RPV)
  if (idxRpv !== -1) {
    const mov = movements[idxRpv]
    const dias = diasDesde(mov.data)
    const anulado = houveImpulsoApos(movements, idxRpv, P_IMPULSO_PAGAMENTO)
    if (!anulado && dias >= 15) {
      return makeGargalo(
        'RPV_PENDENTE',
        `RPV ou cálculo homologado há ${dias} dia${dias !== 1 ? 's' : ''} sem expedição`,
        dias,
        prioridadePorDias(dias, 15, 30),
        'Contatar secretaria sobre expedição do requisitório',
        mov.descricao,
        toStr(mov.data)
      )
    }
  }

  // --- Regra 5: Execução/cumprimento travado ---
  const idxExec = findFirst(movements, P_EXECUCAO)
  if (idxExec !== -1) {
    const mov = movements[idxExec]
    const dias = diasDesde(mov.data)
    const anulado = houveImpulsoApos(movements, idxExec, P_IMPULSO_PAGAMENTO)
    if (!anulado && dias >= 30) {
      return makeGargalo(
        'EXECUCAO_TRAVADA',
        `Cumprimento de sentença sem avanço relevante há ${dias} dia${dias !== 1 ? 's' : ''}`,
        dias,
        prioridadePorDias(dias, 30, 60),
        'Verificar situação da execução — contatar secretaria',
        mov.descricao,
        toStr(mov.data)
      )
    }
  }

  // --- Regra 6: Petição sem análise ---
  const idxPeticao = findFirst(movements, P_PETICAO)
  if (idxPeticao !== -1) {
    const mov = movements[idxPeticao]
    const dias = diasDesde(mov.data)
    const anulado = houveImpulsoApos(movements, idxPeticao, P_IMPULSO_JUDICIAL)
    if (!anulado && dias >= 10) {
      return makeGargalo(
        'PETICAO_SEM_ANALISE',
        `Petição relevante juntada há ${dias} dia${dias !== 1 ? 's' : ''} sem análise aparente`,
        dias,
        prioridadePorDias(dias, 10, 15),
        'Rechecagem — verificar se petição foi despachada',
        mov.descricao,
        toStr(mov.data)
      )
    }
  }

  // --- Regra 7: Processo sem movimentação relevante (fallback) ---
  const ultimaMov = movements[0]
  const diasUltima = diasDesde(ultimaMov.data)
  if (diasUltima >= 30) {
    return makeGargalo(
      'PROCESSO_SEM_MOVIMENTACAO',
      `Processo sem movimentação relevante há ${diasUltima} dia${diasUltima !== 1 ? 's' : ''}`,
      diasUltima,
      prioridadePorDias(diasUltima, 30, 60),
      'Monitorar e verificar situação na unidade judiciária',
      ultimaMov.descricao,
      toStr(ultimaMov.data)
    )
  }

  return null
}
