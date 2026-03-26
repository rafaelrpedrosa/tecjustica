/**
 * Serviço de integração com MCP server TecJustica
 * Chama ferramentas via backend API (Anthropic SDK)
 */

import axios from 'axios'

const BACKEND_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'
const API_SECRET = import.meta.env.VITE_API_SECRET

const backendClient = axios.create({
  baseURL: BACKEND_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    ...(API_SECRET ? { 'X-Api-Key': API_SECRET } : {}),
  },
})

/**
 * Chama ferramenta MCP via backend
 */
async function callBackendAPI(endpoint: string, data: Record<string, unknown> = {}) {
  try {
    if (import.meta.env.DEV) console.log(`📞 Chamando endpoint: ${endpoint}`)

    const response = await backendClient.post(endpoint, data)

    // mcpError é um campo de aviso (não falha crítica) – repassa para o caller
    if (response.data.mcpError) {
      console.warn(`⚠️ MCP retornou erro em ${endpoint}:`, response.data.mcpError)
      return response.data
    }

    if (response.data.error) {
      console.error(`❌ Erro Backend: ${response.data.error}`)
      return null
    }

    if (import.meta.env.DEV) console.debug(`✅ Resposta Backend recebida de ${endpoint}`)
    return response.data
  } catch (error) {
    // Axios lança exceção em 4xx/5xx – extrai mensagem de erro se disponível
    const axiosError = error as { response?: { status: number; data?: { error?: string } }; message?: string }
    if (axiosError.response?.data?.error) {
      console.error(`❌ Erro Backend (${axiosError.response.status}): ${axiosError.response.data.error}`)
    } else {
      const msg = error instanceof Error ? error.message : String(error)
      console.error(`❌ Erro ao chamar backend (${endpoint}):`, msg)
    }
    return null
  }
}

/**
 * Visão geral de um processo por CNJ
 */
export async function getProcessOverviewMCP(cnj: string) {
  return callBackendAPI('/api/process/visao-geral', { numero_processo: cnj })
}

/**
 * Busca processos por CPF/CNPJ
 */
export async function searchProcessesMCP(cpfCnpj: string, tribunal?: string) {
  const data: Record<string, unknown> = { cpf_cnpj: cpfCnpj }
  if (tribunal) data.tribunal = tribunal
  return callBackendAPI('/api/process/search', data)
}

/**
 * Lista partes de um processo
 */
export async function getPartiesMCP(cnj: string) {
  return callBackendAPI('/api/process/partes', { numero_processo: cnj })
}

/**
 * Lista movimentos de um processo
 */
export async function getMovementsMCP(cnj: string, limit = 20, offset = 0) {
  return callBackendAPI('/api/process/movimentos', {
    numero_processo: cnj,
    limit,
    offset,
  })
}

/**
 * Lista documentos de um processo
 */
export async function getDocumentsMCP(cnj: string, limit = 20, offset = 0) {
  return callBackendAPI('/api/process/documentos', {
    numero_processo: cnj,
    limit,
    offset,
  })
}

/**
 * Lê conteúdo de um documento
 */
export async function readDocumentMCP(cnj: string, docId: string) {
  return callBackendAPI('/api/process/documento/conteudo', {
    numero_processo: cnj,
    documento_id: docId,
  })
}

/**
 * Obtém URL do documento (PDF original)
 */
export async function getDocumentUrlMCP(cnj: string, docId: string) {
  return callBackendAPI('/api/process/documento/url', {
    numero_processo: cnj,
    documento_id: docId,
  })
}

/**
 * Busca precedentes jurídicos
 */
export async function searchPrecedentsMCP(busca: string, orgaos?: string[], tipos?: string[]) {
  const data: Record<string, unknown> = { busca }
  if (orgaos) data.orgaos = orgaos
  if (tipos) data.tipos = tipos
  return callBackendAPI('/api/precedentes/buscar', data)
}
