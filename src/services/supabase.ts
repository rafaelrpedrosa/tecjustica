/**
 * Cliente Supabase para cache layer
 */

import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.warn('Supabase credentials not configured. Cache will be disabled.')
}

const supabase: SupabaseClient | null = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null

export { supabase }

/**
 * Salva processo em cache
 */
export async function saveProcess(data: any): Promise<void> {
  if (!supabase) return

  try {
    await supabase
      .from('processes')
      .upsert(
        {
          cnj: data.cnj,
          tribunal: data.tribunal,
          classe: data.classe,
          assunto: data.assunto,
          status: data.status,
          valor: data.valor,
          data_abertura: data.dataAbertura,
          juiz: data.juiz,
          json_resumo: data.resumo ? (typeof data.resumo === 'string' ? { texto: data.resumo } : data.resumo) : null,
        },
        { onConflict: 'cnj' }
      )
  } catch (error) {
    console.error('Error saving process:', error)
  }
}

/**
 * Salva partes em cache
 */
export async function saveParties(cnj: string, parties: any[]): Promise<void> {
  if (!supabase) return

  try {
    // Busca ID do processo
    const { data: process } = await supabase
      .from('processes')
      .select('id')
      .eq('cnj', cnj)
      .single()

    if (!process) return

    // Salva todas as partes em batch
    const partiesPayload = parties.map((party) => ({
      process_id: process.id,
      tipo: party.tipo,
      nome: party.nome,
      cpf_cnpj: party.cpfCnpj,
      cpf_cnpj_formatado: party.cpfCnpjFormatado || party.cpfCnpj,
      email: party.email,
      telefone: party.telefone,
      endereco: party.endereco,
      complemento_endereco: party.complementoEndereco,
    }))

    if (partiesPayload.length > 0) {
      await supabase.from('process_parties').upsert(partiesPayload)
    }

    // Salva advogados de todas as partes em batch
    const lawyersByPartyName = new Map<string, any[]>()
    for (const party of parties) {
      if (party.lawyers && party.lawyers.length > 0) {
        lawyersByPartyName.set(party.nome, party.lawyers)
      }
    }

    if (lawyersByPartyName.size > 0) {
      const { data: savedParties } = await supabase
        .from('process_parties')
        .select('id, nome')
        .eq('process_id', process.id)
        .in('nome', Array.from(lawyersByPartyName.keys()))

      if (savedParties && savedParties.length > 0) {
        const lawyersPayload = savedParties.flatMap((savedParty) => {
          const lawyers = lawyersByPartyName.get(savedParty.nome) || []
          return lawyers.map((lawyer: any) => ({
            party_id: savedParty.id,
            nome: lawyer.nome,
            oab: lawyer.oab,
            email: lawyer.email,
            telefone: lawyer.telefone,
          }))
        })

        if (lawyersPayload.length > 0) {
          await supabase.from('process_lawyers').upsert(lawyersPayload)
        }
      }
    }
  } catch (error) {
    console.error('Error saving parties:', error)
  }
}

/**
 * Salva movimentos em cache
 */
export async function saveMovements(cnj: string, movements: any[]): Promise<void> {
  if (!supabase) return

  try {
    const { data: process } = await supabase
      .from('processes')
      .select('id')
      .eq('cnj', cnj)
      .single()

    if (!process) return

    const movementsPayload = movements.map((movement) => ({
      process_id: process.id,
      data: movement.data,
      descricao: movement.descricao,
      tipo: movement.tipo,
      orgao: movement.orgao,
      hash_unico: `${cnj}-${movement.data}-${movement.tipo}`.replace(/[^a-zA-Z0-9-]/g, ''),
    }))

    if (movementsPayload.length > 0) {
      await supabase
        .from('process_movements')
        .upsert(movementsPayload, { onConflict: 'hash_unico' })
    }
  } catch (error) {
    console.error('Error saving movements:', error)
  }
}

/**
 * Salva documentos em cache
 */
export async function saveDocuments(cnj: string, documents: any[]): Promise<void> {
  if (!supabase) return

  try {
    const { data: process } = await supabase
      .from('processes')
      .select('id')
      .eq('cnj', cnj)
      .single()

    if (!process) return

    const documentsPayload = documents.map((doc) => ({
      process_id: process.id,
      doc_id_externo: doc.id || doc.docId,
      titulo: doc.titulo,
      tipo: doc.tipo,
      data_criacao: doc.dataCriacao,
      paginas: doc.paginas,
      url_pdf: doc.urlPdf,
      texto_extraido: doc.textoExtraido,
      tamanho_bytes: doc.tamanhoBytes,
      hash_unico: `${cnj}-${doc.id || doc.docId}`,
    }))

    if (documentsPayload.length > 0) {
      await supabase
        .from('process_documents')
        .upsert(documentsPayload, { onConflict: 'hash_unico' })
    }
  } catch (error) {
    console.error('Error saving documents:', error)
  }
}

/**
 * Salva precedentes em cache
 */
export async function savePrecedents(termo: string, results: any[]): Promise<void> {
  if (!supabase) return

  try {
    const queryHash = btoa(termo).replace(/[^a-zA-Z0-9-]/g, '')

    await supabase
      .from('precedents_cache')
      .upsert({
        termo_busca: termo,
        query_hash: queryHash,
        resultados_json: results,
        total_results: results.length,
      })
  } catch (error) {
    console.error('Error saving precedents:', error)
  }
}

/**
 * Verifica e retorna dados em cache se válido
 */
export async function getFromCacheMetadata(
  tipo: string,
  chaveId: string
): Promise<boolean> {
  if (!supabase) return false

  try {
    const { data: cacheMeta } = await supabase
      .from('cache_metadata')
      .select('proxima_atualizacao_em')
      .eq('tipo_dado', tipo)
      .eq('chave_id', chaveId)
      .single()

    if (!cacheMeta) return false

    const agora = new Date()
    const proximaAtualizacao = new Date(cacheMeta.proxima_atualizacao_em)

    return agora < proximaAtualizacao
  } catch (error) {
    console.error('Cache check error:', error)
    return false
  }
}

/**
 * Atualiza metadados de cache
 */
export async function updateCacheMetadata(
  tipo: string,
  chaveId: string,
  ttlSegundos = 3600
): Promise<void> {
  if (!supabase) return

  try {
    const agora = new Date()
    const proximaAtualizacao = new Date(agora.getTime() + ttlSegundos * 1000)

    await supabase.from('cache_metadata').upsert(
      {
        tipo_dado: tipo,
        chave_id: chaveId,
        last_fetch_from_mcp: agora.toISOString(),
        ttl_segundos: ttlSegundos,
        proxima_atualizacao_em: proximaAtualizacao.toISOString(),
      },
      { onConflict: 'tipo_dado,chave_id' }
    )
  } catch (error) {
    console.error('Cache metadata update error:', error)
  }
}

/**
 * Log de auditoria
 */
export async function logAccess(
  acao: string,
  tipoDado: string,
  referenciaId: string
): Promise<void> {
  if (!supabase) return

  try {
    await supabase.from('audit_logs').insert({
      acao,
      tipo_dado: tipoDado,
      referencia_id: referenciaId,
      user_ip: 'browser',
      user_agent: navigator.userAgent,
    })
  } catch (error) {
    console.error('Audit log error:', error)
  }
}
