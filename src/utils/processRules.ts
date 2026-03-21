import type { ProcessMovement } from '@/types/process'

/** Normaliza texto para matching: lowercase + sem acentos */
export function norm(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/**
 * Retorna o ÍNDICE do primeiro movimento (mais recente = índice 0)
 * que contenha algum dos padrões.
 * Retorna -1 se não encontrado.
 */
export function findFirst(
  movements: ProcessMovement[],
  padroes: string[]
): number {
  for (let i = 0; i < movements.length; i++) {
    const texto = norm(movements[i].descricao)
    if (padroes.some((p) => texto.includes(norm(p)))) return i
  }
  return -1
}

/**
 * Retorna true se houver algum movimento com padrão APÓS o índice `aposIdx`.
 * "Após" = ocorreu antes no tempo = índice MAIOR (movements[0] = mais recente).
 */
export function houveImpulsoApos(
  movements: ProcessMovement[],
  aposIdx: number,
  padroes: string[]
): boolean {
  for (let i = 0; i < aposIdx; i++) {
    const texto = norm(movements[i].descricao)
    if (padroes.some((p) => texto.includes(norm(p)))) return true
  }
  return false
}

/** Dias inteiros desde uma data ISO string ou Date */
export function diasDesde(data: string | Date): number {
  const ref = typeof data === 'string' ? new Date(data) : data
  if (isNaN(ref.getTime())) return 0
  return Math.max(0, Math.floor((Date.now() - ref.getTime()) / (1000 * 60 * 60 * 24)))
}
