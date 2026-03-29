import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import Card, { CardContent } from '@/components/common/Card'
import Button from '@/components/common/Button'
import Badge from '@/components/common/Badge'
import { PageLoading } from '@/components/common/Loading'
import Empty from '@/components/common/Empty'
import { CacheTimestamp } from '@/components/common/CacheTimestamp'
import type { Document } from '@/types/document'
import { readDocument, getDocumentURL } from '@/services/document.service'
import { supabase } from '@/services/supabase'

// ─── Formatador de texto judicial ────────────────────────────────────────────

const SECTION_RE  = /^(DESPACHO|SENTENÇA|DECISÃO|ACÓRDÃO|EMENTA|RELATÓRIO|VOTO|DISPOSITIVO|CONCLUSÃO|SÚMULA|FUNDAMENTAÇÃO|MÉRITO)\s*$/i
const PARTY_RE    = /^(IMPETRANTE|IMPETRADO|AUTOR[AE]?S?|RÉU|RÉRÉS|REQUERENTE|REQUERIDO|EXEQUENTE|EXECUTADO|APELANTE|APELADO|RECORRENTE|RECORRIDO|ADVOGADO\s*do\(a\)|ADVOGADOS?|RELATOR|REVISOR|ASSISTENTE|AGRAVANTE|AGRAVADO)\s*:/i
const PROCESS_RE  = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/
const DATE_RE     = /^(Recife|São Paulo|Brasília|Rio de Janeiro|Salvador|Fortaleza|Belo Horizonte|Curitiba|Manaus|Porto Alegre|Belém|Goiânia|Florianópolis|Campo Grande|Teresina|Natal|Maceió|João Pessoa|Aracaju|Macapá|Porto Velho|Rio Branco|Palmas|Boa Vista|Vitória|São Luís|Cuiabá),?\s*(data da validação|\d{1,2}\s+de\s+\w+\s+de\s+\d{4})/i
const TRIBUNAL_RE = /^(PODER JUDICIÁRIO|TRIBUNAL|JUÍZO|VARA|SEÇÃO|TURMA|CÂMARA|\d+[ªa°]?\s*VARA)/i
const CITE_RE     = /^\(?(AgRg|REsp|AREsp|EDcl|RHC|HC|MS|ADI|STJ|STF|TRF|TRT|TJSP|TJRJ|TJPE|AC\s+n[°ºo])/i
// Linha que termina frase completa (ponto final, dois pontos, ponto-e-vírgula)
const ENDS_SENTENCE = /[.;:]\s*$/

type Block =
  | { kind: 'header';  text: string }
  | { kind: 'process'; text: string }
  | { kind: 'section'; text: string }
  | { kind: 'party';   text: string }
  | { kind: 'date';    text: string }
  | { kind: 'cite';    text: string }
  | { kind: 'para';    text: string }

/**
 * Detecta linhas com encoding de fonte corrompido (PDFs do tribunal).
 * Padrão típico: "Mo GERE EO o g LS PE / Salgueiro"
 * — muitas palavras de 1-2 chars alfabéticos intercaladas com palavras normais.
 */
function isGarbledLine(text: string): boolean {
  const words = text.trim().split(/\s+/)
  if (words.length < 4) return false
  const shortAlpha = words.filter(w => /^[A-Za-z]{1,2}$/.test(w))
  return shortAlpha.length / words.length > 0.35
}

function buildBlocks(raw: string): Block[] {
  const rawLines = raw.split('\n')
  const blocks: Block[] = []
  let paraBuf: string[] = []

  const flushPara = () => {
    if (paraBuf.length) {
      blocks.push({ kind: 'para', text: paraBuf.join(' ') })
      paraBuf = []
    }
  }

  for (const line of rawLines) {
    const t = line.trim()

    // Linha vazia → fecha parágrafo atual
    if (!t) { flushPara(); continue }

    // Artefatos de OCR: muito curtos e sem contexto
    if (t.length <= 5 && !t.includes(':') && !/^\d+$/.test(t)) continue

    // Encoding de fonte corrompido: filtra linhas com muitas palavras isoladas de 1-2 chars
    if (isGarbledLine(t)) continue

    if (SECTION_RE.test(t))  { flushPara(); blocks.push({ kind: 'section', text: t }); continue }
    if (PARTY_RE.test(t))    { flushPara(); blocks.push({ kind: 'party',   text: t }); continue }
    if (PROCESS_RE.test(t) && t.length < 60) { flushPara(); blocks.push({ kind: 'process', text: t }); continue }
    if (DATE_RE.test(t))     { flushPara(); blocks.push({ kind: 'date',    text: t }); continue }
    if (TRIBUNAL_RE.test(t)) { flushPara(); blocks.push({ kind: 'header',  text: t }); continue }
    if (CITE_RE.test(t))     { flushPara(); blocks.push({ kind: 'cite',    text: t }); continue }

    // Linha começa maiúscula e a linha anterior termina frase → novo parágrafo
    const startsUpper = /^[A-ZÁÉÍÓÚÀÂÊÔÃÕÇ""]/.test(t)
    if (startsUpper && paraBuf.length > 0 && ENDS_SENTENCE.test(paraBuf[paraBuf.length - 1])) {
      flushPara()
    }

    paraBuf.push(t)

    // Linha termina frase → fecha parágrafo imediatamente
    if (ENDS_SENTENCE.test(t) && paraBuf.join(' ').length > 80) {
      flushPara()
    }
  }
  flushPara()
  return blocks
}

/** Aplica negrito em trechos entre ** e itálico em trechos entre * */
function renderInline(text: string): React.ReactNode[] {
  // Destaca: citações de lei, valores monetários, datas inline
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>
    if (p.startsWith('*') && p.endsWith('*'))   return <em key={i}>{p.slice(1, -1)}</em>
    return p
  })
}

interface JudicialDocumentRendererProps { content: string }

function JudicialDocumentRenderer({ content }: JudicialDocumentRendererProps) {
  const blocks = buildBlocks(content)

  return (
    <div className="font-serif max-w-3xl mx-auto text-gray-800">
      {blocks.map((b, idx) => {
        switch (b.kind) {

          case 'header':
            return (
              <p key={idx} className="text-center text-xs font-semibold text-gray-500 uppercase tracking-widest mt-6 mb-1">
                {b.text}
              </p>
            )

          case 'process':
            return (
              <p key={idx} className="text-center text-sm font-bold text-blue-800 my-3 py-2 border-y border-blue-100 bg-blue-50 rounded">
                {b.text}
              </p>
            )

          case 'section':
            return (
              <div key={idx} className="my-8">
                <div className="border-t-2 border-gray-300 pt-4">
                  <p className="text-center text-base font-bold text-gray-900 uppercase tracking-widest">
                    {b.text}
                  </p>
                </div>
              </div>
            )

          case 'party':
            return (
              <p key={idx} className="text-sm font-semibold text-gray-700 pl-6 my-1 border-l-2 border-blue-200">
                {b.text}
              </p>
            )

          case 'cite':
            return (
              <p key={idx} className="text-sm text-gray-600 italic pl-10 my-2 border-l-2 border-gray-200">
                {b.text}
              </p>
            )

          case 'date':
            return (
              <p key={idx} className="text-sm text-gray-500 mt-8 pl-6">
                {b.text}
              </p>
            )

          case 'para':
          default:
            return (
              <p key={idx} className="text-base leading-8 text-justify mt-4 first:mt-0 indent-8">
                {renderInline(b.text)}
              </p>
            )
        }
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

interface DocumentViewerState {
  document: Document | null
  content: string | null
  loading: boolean
  error: string | null
  copied: boolean
  lastUpdated: string | null
}

const DocumentViewer: React.FC = () => {
  const { documentId } = useParams<{ documentId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const cnj = (location.state as { cnj?: string } | null)?.cnj

  const handleBack = () => {
    if (cnj) {
      navigate(`/process/${encodeURIComponent(cnj)}`, { state: { returnTab: 'documents' } })
    } else {
      navigate(-1)
    }
  }
  const [state, setState] = useState<DocumentViewerState>({
    document: null,
    content: null,
    loading: true,
    error: null,
    copied: false,
    lastUpdated: null,
  })

  useEffect(() => {
    const loadDocument = async () => {
      if (!documentId || !cnj) {
        setState((s) => ({
          ...s,
          error: 'CNJ do processo não informado. Volte para o processo e tente novamente.',
          loading: false,
        }))
        return
      }

      try {
        setState((s) => ({ ...s, loading: true, error: null }))

        // Busca conteúdo e URL em paralelo
        const [docContent, docUrl] = await Promise.all([
          readDocument(cnj, documentId),
          getDocumentURL(cnj, documentId),
        ])

        if (!docContent) {
          setState((s) => ({
            ...s,
            error: 'Documento não encontrado',
            loading: false,
          }))
          return
        }

        // Create document object with fetched data
        const lastUpdated = new Date().toISOString()

        // Build document from fetched data
        const document: Document = {
          id: documentId,
          processId: cnj,
          titulo: (docContent.metadata?.titulo as string) || 'Documento do Processo',
          tipo: (docContent.metadata?.tipo as string) || 'Documento',
          dataCriacao: (docContent.metadata?.dataCriacao as string) || lastUpdated.split('T')[0],
          paginas: (docContent.metadata?.paginas as number) || 1,
          urlPdf: docUrl || '#',
          createdAt: lastUpdated,
          updatedAt: lastUpdated,
        }

        setState({
          document,
          content: docContent.conteudo || '',
          loading: false,
          error: null,
          copied: false,
          lastUpdated,
        })
      } catch (err) {
        setState((s) => ({
          ...s,
          error: 'Erro ao carregar documento',
          loading: false,
        }))
        console.error(err)
      }
    }

    loadDocument()
    return () => clearTimeout(copyTimeoutRef.current)
  }, [documentId, location.state])

  const handleCopyText = async () => {
    if (!state.content) return

    try {
      await navigator.clipboard.writeText(state.content)
      setState((s) => ({ ...s, copied: true }))
      copyTimeoutRef.current = setTimeout(() => {
        setState((s) => ({ ...s, copied: false }))
      }, 2000)
    } catch (err) {
      console.error('Erro ao copiar:', err)
    }
  }

  const handleOpenPDF = async () => {
    if (!cnj || !documentId) return
    const session = await supabase?.auth.getSession()
    const accessToken = session?.data?.session?.access_token
    const tokenQuery = accessToken ? `?access_token=${encodeURIComponent(accessToken)}` : ''
    const proxyUrl = `${import.meta.env.VITE_API_BASE_URL}/api/documento-pdf/${encodeURIComponent(cnj)}/${encodeURIComponent(documentId)}${tokenQuery}`

    // Verifica disponibilidade antes de abrir
    try {
      const check = await fetch(proxyUrl, { method: 'HEAD' })
      if (check.status === 401) {
        alert('⚠️ PDF requer autenticação ativa no TecJustica.\n\nUse o texto já disponível nesta tela ou acesse o portal TecJustica diretamente.')
        return
      }
      if (!check.ok) {
        alert('PDF temporariamente indisponível. Use o texto extraído nesta tela.')
        return
      }
    } catch {
      // Se HEAD falhar, tenta abrir assim mesmo
    }
    window.open(proxyUrl, '_blank')
  }

  if (!cnj) {
    return (
      <div className="flex items-center justify-center py-16">
        <Empty
          title="Contexto de processo não encontrado"
          description="Navegue a partir da página de detalhes do processo para visualizar este documento"
        />
      </div>
    )
  }

  if (state.loading) return <PageLoading />

  if (state.error || !state.document || !state.content) {
    return (
      <div className="flex items-center justify-center py-16">
        <Empty
          title={state.error || 'Documento não encontrado'}
          description="Volte e tente novamente"
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card className="border-b-4 border-b-amber-600">
        <CardContent className="py-8">
          <div className="flex items-start justify-between mb-6">
            <div className="flex-1">
              <h1 className="text-4xl font-bold text-gray-900 mb-3 font-serif">
                {state.document.titulo}
              </h1>
              <div className="flex items-center gap-3 flex-wrap">
                <Badge variant="info">{state.document.tipo}</Badge>
                <span className="text-sm text-gray-500">
                  {state.document.dataCriacao
                    ? new Date(state.document.dataCriacao).toLocaleDateString('pt-BR')
                    : '—'}
                </span>
                {state.document.paginas && (
                  <span className="text-sm text-gray-500">
                    {state.document.paginas} página{state.document.paginas !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={handleBack}
              className="text-gray-400 hover:text-gray-600 transition-colors p-2"
              aria-label="Fechar visualizador"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-6 border-t border-gray-200">
            <Button variant="secondary" size="sm" onClick={handleBack}>
              ← Voltar ao processo
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCopyText}
              className="transition-all duration-200"
            >
              {state.copied ? '✓ Copiado!' : 'Copiar texto'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleOpenPDF}
            >
              Abrir PDF original ↗
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Cache Status */}
      {state.lastUpdated && (
        <CacheTimestamp
          timestamp={state.lastUpdated}
          isLoading={false}
          onRefresh={() => {
            if (cnj && documentId) {
              setState((s) => ({ ...s, loading: true, error: null }))
              Promise.all([readDocument(cnj, documentId), getDocumentURL(cnj, documentId)])
                .then(([docContent, docUrl]) => {
                  if (!docContent) {
                    setState((s) => ({ ...s, error: 'Documento não encontrado', loading: false }))
                    return
                  }
                  const lastUpdated = new Date().toISOString()
                  setState((s) => ({
                    ...s,
                    content: docContent.conteudo || '',
                    document: s.document
                      ? { ...s.document, urlPdf: docUrl || '#', updatedAt: lastUpdated }
                      : null,
                    loading: false,
                    lastUpdated,
                  }))
                })
                .catch(() => setState((s) => ({ ...s, error: 'Erro ao recarregar', loading: false })))
            }
          }}
          ttlMinutes={6 * 60}
        />
      )}

      {/* Document Content */}
      <Card>
        <CardContent className="p-0">
          <div className="bg-white rounded-lg">
            <div className="p-8 bg-white text-gray-800 leading-relaxed">
              <JudicialDocumentRenderer content={state.content} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Metadata Footer */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold mb-2">
            Tipo
          </p>
          <p className="font-medium text-gray-900">{state.document.tipo}</p>
        </div>
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold mb-2">
            Data
          </p>
          <p className="font-medium text-gray-900">
            {state.document.dataCriacao
              ? new Date(state.document.dataCriacao).toLocaleDateString('pt-BR')
              : '—'}
          </p>
        </div>
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold mb-2">
            Extensão
          </p>
          <p className="font-medium text-gray-900">
            {state.document.paginas ? `PDF (${state.document.paginas}p)` : 'PDF'}
          </p>
        </div>
      </div>
    </div>
  )
}

export default DocumentViewer
