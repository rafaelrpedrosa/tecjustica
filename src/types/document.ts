/**
 * Tipos para Documentos
 */

export interface Document {
  id: string
  processId: string
  docIdExterno?: string
  titulo: string
  tipo?: string
  dataCriacao?: string
  paginas?: number
  urlPdf?: string
  textoExtraido?: string
  tamanhoBytes?: number
  hashUnico?: string
  createdAt: string
  updatedAt: string
}

export interface DocumentContent {
  document: Document
  texto: string
  metadata: {
    paginas: number
    tamanhoKb: number
    dataExtricao: string
  }
}
