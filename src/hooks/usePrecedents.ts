/**
 * React Query hook para busca de precedentes
 */

import { useQuery } from '@tanstack/react-query'
import { searchPrecedents } from '@/services/precedent.service'

interface PrecedentFilters {
  tribunais?: string[]
  tipos?: string[]
}

/**
 * Busca precedentes com cache de 7 dias
 * Só executa quando enabled=true (acionado pelo usuário)
 */
export function usePrecedents(
  termo: string,
  filtros?: PrecedentFilters,
  enabled = false
) {
  return useQuery({
    queryKey: ['precedents', termo, filtros],
    queryFn: () => searchPrecedents(termo, filtros),
    enabled: enabled && !!termo.trim(),
    staleTime: 7 * 24 * 60 * 60 * 1000, // 7 dias
  })
}
