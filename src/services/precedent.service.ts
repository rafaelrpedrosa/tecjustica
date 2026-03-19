/**
 * Serviço de precedentes
 */

import { getCacheKey, getCache, setCache, getTTLForType } from './cache'
import { updateCacheMetadata, logAccess, savePrecedents } from './supabase'
import { PrecedentSearchResult, Precedent } from '@/types/precedent'
import * as mcpService from './mcp.service'

/**
 * Hash simples de query para cache (browser-friendly)
 */
function hashQuery(termo: string, filtros?: any): string {
  const queryStr = JSON.stringify({ termo, filtros })
  let hash = 0
  for (let i = 0; i < queryStr.length; i++) {
    const char = queryStr.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(16)
}

/**
 * Busca precedentes
 * TTL de 7 dias (jurisprudência é estável)
 */
export async function searchPrecedents(
  termo: string,
  filtros?: { tribunais?: string[]; tipos?: string[] }
): Promise<PrecedentSearchResult | null> {
  const queryHash = hashQuery(termo, filtros)
  const cacheKey = getCacheKey('precedents_search', queryHash)

  // 1. Verifica cache em memória
  const cached = getCache<PrecedentSearchResult>(cacheKey)
  if (cached) {
    console.log(`✓ Precedentes para "${termo}" carregados do cache`)
    return cached
  }

  // 2. Chama MCP server para dados reais
  try {
    const mcpData = await mcpService.searchPrecedentsMCP(
      termo,
      filtros?.tribunais,
      filtros?.tipos
    )

    if (!mcpData) {
      console.warn(`Nenhum precedente encontrado para "${termo}"`)
      return null
    }

    // Converte resposta MCP para formato Precedent
    const resultados: Precedent[] = (Array.isArray(mcpData) ? mcpData : mcpData.nodes || mcpData.resultados || []).map((p: any) => ({
      id: p.id || `${p.tribunal || ''}-${p.tipo || ''}-${(p.ementa || '').slice(0, 20)}`.replace(/\s/g, '-'),
      ementa: p.ementa || p.title || p.summary || '',
      tese: p.tese || p.thesis || p.description || '',
      tribunal: p.tribunal || p.orgao || '',
      tipo: p.tipo || p.type || '',
      orgao: p.orgao || p.tribunal || '',
      status: p.status || 'Vigente',
    }))

    const result: PrecedentSearchResult = {
      termo,
      total: resultados.length,
      resultados,
      dataAtualizacao: new Date().toISOString(),
    }

    const ttl = getTTLForType('precedents')
    setCache(cacheKey, result, ttl)
    await updateCacheMetadata('precedents_search', queryHash, ttl)
    await savePrecedents(termo, resultados)

    logAccess('SEARCH', 'precedent', termo)
    return result
  } catch (error) {
    console.error(`Erro ao buscar precedentes para "${termo}":`, error)
    return null
  }
}
