/**
 * Serviço de processos com integração Supabase
 */

import { getCacheKey, getCache, setCache, getTTLForType } from './cache'
import { updateCacheMetadata, logAccess, saveProcess, saveParties, saveMovements } from './supabase'
import { Process, Party, ProcessMovement } from '@/types/process'
import * as mcpService from './mcp.service'

const CACHE_TYPE = 'process_overview'

/**
 * Busca processo por número CNJ
 * Supabase first → MCP fallback
 */
export async function getProcessByCNJ(cnj: string): Promise<Process | null> {
  const cacheKey = getCacheKey(CACHE_TYPE, cnj)

  // 1. Verifica cache em memória
  const cached = getCache<Process>(cacheKey)
  if (cached) {
    console.log(`✓ Processo ${cnj} carregado do cache`)
    logAccess('VIEW', 'process', cnj)
    return cached
  }

  // 2. Chama MCP server para dados reais
  try {
    const mcpData = await mcpService.getProcessOverviewMCP(cnj)

    if (!mcpData) {
      console.error(`Processo ${cnj} não encontrado no MCP`)
      return null
    }

    // Converte resposta MCP para formato Process
    const data: Process = {
      cnj: mcpData.numero_processo || cnj,
      tribunal: mcpData.tribunal || '',
      classe: mcpData.classe || '',
      assunto: mcpData.assunto || '',
      status: mcpData.status || '',
      valor: mcpData.valor ? parseFloat(mcpData.valor.toString()) : 0,
      dataAbertura: mcpData.data_abertura ? new Date(mcpData.data_abertura) : new Date(),
      juiz: mcpData.juiz || '',
      resumo: mcpData.resumo || JSON.stringify(mcpData),
    }

    const ttl = getTTLForType(CACHE_TYPE)
    setCache(cacheKey, data, ttl)
    await updateCacheMetadata(CACHE_TYPE, cnj, ttl)
    await saveProcess(data)

    logAccess('FETCH_MCP', 'process', cnj)
    return data
  } catch (error) {
    console.error(`Erro ao buscar processo ${cnj} do MCP:`, error)
    return null
  }
}

/**
 * Busca processos por CPF/CNPJ
 * Não usa cache (busca varável)
 */
export async function searchByCPFCNPJ(cpfCnpj: string, tribunal?: string) {
  try {
    const mcpData = await mcpService.searchProcessesMCP(cpfCnpj, tribunal)

    if (!mcpData) {
      console.warn(`Nenhum processo encontrado para ${cpfCnpj}`)
      return null
    }

    logAccess('SEARCH', 'process', cpfCnpj)
    return mcpData
  } catch (error) {
    console.error(`Erro ao buscar por CPF/CNPJ ${cpfCnpj}:`, error)
    return null
  }
}

/**
 * Obtém partes de um processo
 */
export async function getProcessParties(cnj: string): Promise<Party[]> {
  const cacheKey = getCacheKey('process_parties', cnj)

  const cached = getCache<Party[]>(cacheKey)
  if (cached) {
    console.log(`✓ Partes do processo ${cnj} carregadas do cache`)
    return cached
  }

  try {
    const mcpData = await mcpService.getPartiesMCP(cnj)

    if (!mcpData) {
      console.warn(`Nenhuma parte encontrada para ${cnj}`)
      return []
    }

    // Converte resposta MCP para formato Party
    const data: Party[] = (mcpData.POLO_ATIVO || []).concat(mcpData.POLO_PASSIVO || []).map((p: any, idx: number) => ({
      id: p.cpf_cnpj || `party-${idx}`,
      nome: p.nome || '',
      tipo: p.tipo || 'PARTE',
      cpfCnpj: p.cpf_cnpj || '',
      email: p.email || '',
      endereco: p.endereco || '',
      lawyers: (p.advogados || []).map((a: any, aidx: number) => ({
        id: `lawyer-${idx}-${aidx}`,
        nome: a.nome || '',
        oab: a.oab || '',
        email: a.email || '',
      })),
    }))

    const ttl = getTTLForType('process_parties')
    setCache(cacheKey, data, ttl)
    await updateCacheMetadata('process_parties', cnj, ttl)
    await saveParties(cnj, data)

    return data
  } catch (error) {
    console.error(`Erro ao buscar partes do processo ${cnj}:`, error)
    return []
  }
}

/**
 * Obtém movimentos de um processo
 */
export async function getProcessMovements(cnj: string): Promise<ProcessMovement[]> {
  const cacheKey = getCacheKey('process_movements', cnj)

  const cached = getCache<ProcessMovement[]>(cacheKey)
  if (cached) {
    console.log(`✓ Movimentos do processo ${cnj} carregados do cache`)
    return cached
  }

  try {
    const mcpData = await mcpService.getMovementsMCP(cnj)

    if (!mcpData) {
      console.warn(`Nenhum movimento encontrado para ${cnj}`)
      return []
    }

    // Converte resposta MCP para formato ProcessMovement
    const data: ProcessMovement[] = (Array.isArray(mcpData) ? mcpData : mcpData.movements || []).map((m: any) => ({
      id: m.id || `${m.data || m.timestamp}-${m.tipo || m.type || ''}-${(m.descricao || m.description || '').slice(0, 10)}`.replace(/\s/g, '-'),
      data: new Date(m.data || m.timestamp || Date.now()),
      tipo: m.tipo || m.type || '',
      descricao: m.descricao || m.description || '',
      orgao: m.orgao || m.org || '',
    }))

    const ttl = getTTLForType('process_movements')
    setCache(cacheKey, data, ttl)
    await updateCacheMetadata('process_movements', cnj, ttl)
    await saveMovements(cnj, data)

    return data
  } catch (error) {
    console.error(`Erro ao buscar movimentos do processo ${cnj}:`, error)
    return []
  }
}
