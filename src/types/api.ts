/**
 * Tipos genéricos de API
 */

export interface ApiResponse<T> {
  data: T
  error?: {
    code: string
    message: string
  }
  metadata?: {
    timestamp: string
    cached?: boolean
    cacheExpiry?: string
  }
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

export interface SearchQuery {
  termo: string
  tribunal?: string
  situacao?: string
  dataInicio?: string
  dataFim?: string
}
