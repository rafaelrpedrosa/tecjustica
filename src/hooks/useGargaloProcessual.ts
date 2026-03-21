import { useMemo } from 'react'
import { useProcessMovements } from '@/hooks/useProcess'
import { analisarGargalo } from '@/utils/analisarGargalo'
import type { GargaloProcessual } from '@/types/gargalo'

export function useGargaloProcessual(cnj: string | undefined): {
  gargalo: GargaloProcessual | null
  isLoading: boolean
} {
  const { data: movements = [], isLoading } = useProcessMovements(cnj)
  const gargalo = useMemo(() => analisarGargalo(movements), [movements])
  return { gargalo, isLoading }
}
