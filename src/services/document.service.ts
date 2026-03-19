/**
 * Serviço de documentos
 */

import { getCacheKey, getCache, setCache, getTTLForType } from './cache'
import { updateCacheMetadata, logAccess, saveDocuments } from './supabase'
import { Document } from '@/types/document'
import * as mcpService from './mcp.service'

/**
 * Lista documentos de um processo
 */
export async function listDocuments(cnj: string): Promise<Document[]> {
  const cacheKey = getCacheKey('process_documents', cnj)

  const cached = getCache<Document[]>(cacheKey)
  if (cached) {
    console.log(`✓ Documentos do processo ${cnj} carregados do cache`)
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
    const data: Document[] = (Array.isArray(mcpData) ? mcpData : mcpData.documents || []).map((d: any) => ({
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
    await updateCacheMetadata('process_documents', cnj, ttl)
    await saveDocuments(cnj, data)

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
): Promise<{ conteudo: string; metadata: any } | null> {
  try {
    const mcpData = await mcpService.readDocumentMCP(cnj, docId)

    if (!mcpData) {
      console.error(`Documento ${docId} não encontrado`)
      return null
    }

    logAccess('READ', 'document', docId)
    return {
      conteudo: mcpData.conteudo || mcpData.texto_extraido || '',
      metadata: mcpData.metadata || mcpData,
    }
  } catch (error) {
    console.error(`Erro ao ler documento ${docId}:`, error)
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
