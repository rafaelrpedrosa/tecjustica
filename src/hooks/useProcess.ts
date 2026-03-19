/**
 * React Query hooks para processos judiciais
 */

import { useQuery } from '@tanstack/react-query'
import {
  getProcessByCNJ,
  getProcessParties,
  getProcessMovements,
} from '@/services/process.service'
import { listDocuments } from '@/services/document.service'

/**
 * Visão geral do processo
 */
export function useProcess(cnj: string | undefined) {
  return useQuery({
    queryKey: ['process', cnj],
    queryFn: () => getProcessByCNJ(cnj!),
    enabled: !!cnj,
    staleTime: 24 * 60 * 60 * 1000, // 24h
  })
}

/**
 * Partes do processo
 */
export function useProcessParties(cnj: string | undefined) {
  return useQuery({
    queryKey: ['process-parties', cnj],
    queryFn: () => getProcessParties(cnj!),
    enabled: !!cnj,
    staleTime: 24 * 60 * 60 * 1000,
  })
}

/**
 * Movimentos do processo
 */
export function useProcessMovements(cnj: string | undefined) {
  return useQuery({
    queryKey: ['process-movements', cnj],
    queryFn: () => getProcessMovements(cnj!),
    enabled: !!cnj,
    staleTime: 6 * 60 * 60 * 1000, // 6h
  })
}

/**
 * Documentos do processo
 */
export function useProcessDocuments(cnj: string | undefined) {
  return useQuery({
    queryKey: ['process-documents', cnj],
    queryFn: () => listDocuments(cnj!),
    enabled: !!cnj,
    staleTime: 6 * 60 * 60 * 1000,
  })
}
