/**
 * Serviço de documentos
 */

import { getCacheKey, getCache, setCache, getTTLForType } from './cache'
import { Document } from '@/types/document'
import * as mcpService from './mcp.service'

interface DocumentMCP {
  id?: string
  doc_id_externo?: string
  titulo?: string
  name?: string
  tipo?: string
  type?: string
  data_criacao?: string
  paginas?: number
  pages?: number
  url?: string
  url_pdf?: string
}

interface DocumentMetadataMCP {
  conteudo?: string
  texto_extraido?: string
  metadata?: Record<string, unknown>
  [key: string]: unknown
}

/**
 * Lista documentos de um processo
 */
export async function listDocuments(cnj: string): Promise<Document[]> {
  const cacheKey = getCacheKey('process_documents', cnj)

  const cached = getCache<Document[]>(cacheKey)
  if (cached) {
    if (import.meta.env.DEV) console.log(`✓ Documentos do processo ${cnj} carregados do cache`)
    return cached
  }

  try {
    const mcpData = await mcpService.getDocumentsMCP(cnj)

    if (!mcpData) {
      console.warn(`Nenhum documento encontrado para ${cnj}`)
      return []
    }

    // Converte resposta MCP para formato Document
    const now = new Date().toISOString()
    const data: Document[] = (Array.isArray(mcpData) ? mcpData : mcpData.documents || []).map((d: DocumentMCP) => ({
      id: d.id || d.doc_id_externo || '',
      processId: cnj,
      titulo: d.titulo || d.name || '',
      tipo: d.tipo || d.type || '',
      dataCriacao: d.data_criacao || '',
      paginas: d.paginas || d.pages || 0,
      urlPdf: d.url || d.url_pdf || '',
      createdAt: now,
      updatedAt: now,
    }))

    const ttl = getTTLForType('process_documents')
    setCache(cacheKey, data, ttl)
    return data
  } catch (error) {
    console.error(`Erro ao listar documentos do processo ${cnj}:`, error)
    return []
  }
}

/**
 * Lê conteúdo de um documento
 * Não cachea texto grande, apenas metadados
 */
export async function readDocument(
  cnj: string,
  docId: string
): Promise<{ conteudo: string; metadata: Record<string, unknown> } | null> {
  try {
    const mcpData = await mcpService.readDocumentMCP(cnj, docId) as DocumentMetadataMCP | null

    if (!mcpData) {
      console.error(`Documento ${docId} não encontrado`)
      return null
    }

    return {
      conteudo: mcpData.conteudo || mcpData.texto_extraido || '',
      metadata: (mcpData.metadata ?? mcpData) as Record<string, unknown>,
    }
  } catch (error) {
    console.error(`Erro ao ler documento ${docId}:`, error)
    return null
  }
}

/**
 * Lê conteúdo de múltiplos documentos em uma única chamada batch
 */
export async function readDocumentsBatch(
  cnj: string,
  docIds: string[]
): Promise<{ conteudo: string; documento_ids: string[] } | null> {
  try {
    const mcpData = await mcpService.readDocumentsBatchMCP(cnj, docIds) as {
      conteudo?: string
      documento_ids?: string[]
    } | null

    if (!mcpData) {
      console.error(`Batch de documentos não encontrado para ${cnj}`)
      return null
    }

    return {
      conteudo: mcpData.conteudo || '',
      documento_ids: mcpData.documento_ids || docIds,
    }
  } catch (error) {
    console.error(`Erro ao ler batch de documentos do processo ${cnj}:`, error)
    return null
  }
}

/**
 * Obtém URL do PDF original
 */
export async function getDocumentURL(cnj: string, docId: string): Promise<string | null> {
  const cacheKey = getCacheKey('document_url', docId)

  const cached = getCache<string>(cacheKey)
  if (cached) {
    return cached
  }

  try {
    const mcpData = await mcpService.getDocumentUrlMCP(cnj, docId)

    if (!mcpData) {
      console.error(`URL do documento ${docId} não encontrada`)
      return null
    }

    const url = mcpData.url || (typeof mcpData === 'string' ? mcpData : null)

    const ttl = getTTLForType('process_documents')
    setCache(cacheKey, url, ttl)

    return url
  } catch (error) {
    console.error(`Erro ao obter URL do documento ${docId}:`, error)
    return null
  }
}
