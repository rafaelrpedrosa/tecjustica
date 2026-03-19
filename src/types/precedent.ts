/**
 * Tipos para Precedentes Jurídicos
 */

export interface Precedent {
  id: string
  titulo: string
  ementa: string
  tese?: string
  tribunal: string
  orgao?: string
  tipo: 'SUM' | 'SV' | 'RG' | 'IRDR' | 'IRR' | 'RR' | 'CT' | 'OJ' | string
  status?: string
  data?: string
  processoParadigma?: string[]
  href?: string
}

export interface PrecedentSearchResult {
  termo: string
  total: number
  resultados: Precedent[]
  dataAtualizacao: string
}

export interface PrecedentsCache {
  id: string
  termoBusca: string
  queryHash: string
  resultadosJson: Precedent[]
  totalResults: number
  createdAt: string
  updatedAt: string
}
