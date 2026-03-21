/**
 * Cenários de movimentação para testar o motor de gargalos manualmente.
 *
 * Como usar no browser console (dev only):
 *   import { analisarGargalo } from '@/utils/analisarGargalo'
 *   import { mockConcluso } from '@/utils/gargaloMocks'
 *   console.log(analisarGargalo(mockConcluso))
 *
 * Ou via window em dev:
 *   window.__testGargalo('concluso')
 */

import type { ProcessMovement } from '@/types/process'

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

function mov(dias: number, descricao: string, id = Math.random().toString()): ProcessMovement {
  return { id, data: daysAgo(dias), descricao, orgao: 'JEF - Vara Teste', tipo: 'movimento' }
}

/** Processo concluso para sentença há 22 dias */
export const mockConcluso: ProcessMovement[] = [
  mov(22, 'Autos conclusos para sentença'),
  mov(40, 'Audiência de instrução realizada'),
  mov(60, 'Citação realizada'),
]

/** Laudo pericial juntado há 14 dias sem impulso posterior */
export const mockLaudo: ProcessMovement[] = [
  mov(14, 'Juntada de laudo pericial do IMESC'),
  mov(30, 'Perícia realizada'),
  mov(60, 'Designação de perícia'),
]

/** Petição juntada há 18 dias sem despacho */
export const mockPeticao: ProcessMovement[] = [
  mov(18, 'Petição juntada pela parte autora'),
  mov(35, 'Decisão interlocutória'),
  mov(60, 'Distribuição'),
]

/** Processo sem movimentação há 45 dias */
export const mockSemMov: ProcessMovement[] = [
  mov(45, 'Intimação cumprida'),
  mov(70, 'Decisão saneadora'),
  mov(100, 'Contestação juntada'),
]

/** RPV calculada há 25 dias sem expedição */
export const mockRpv: ProcessMovement[] = [
  mov(25, 'Cálculo homologado — RPV expedida em favor da parte autora'),
  mov(40, 'Sentença de procedência'),
  mov(90, 'Citação da parte ré'),
]

/** Cumprimento de sentença parado há 35 dias */
export const mockExecucao: ProcessMovement[] = [
  mov(35, 'Bloqueio SISBAJUD sem retorno'),
  mov(50, 'Intimação para pagamento em 15 dias'),
  mov(70, 'Cumprimento de sentença iniciado'),
]

/** Processo saudável — decisão há 5 dias (sem gargalo) */
export const mockSaudavel: ProcessMovement[] = [
  mov(5, 'Decisão interlocutória publicada'),
  mov(20, 'Petição de réplica juntada'),
  mov(40, 'Contestação'),
]

// Mapa para acesso fácil no console
export const MOCKS: Record<string, ProcessMovement[]> = {
  concluso: mockConcluso,
  laudo: mockLaudo,
  peticao: mockPeticao,
  semMov: mockSemMov,
  rpv: mockRpv,
  execucao: mockExecucao,
  saudavel: mockSaudavel,
}
