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
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const [state, setState] = useState<DocumentViewerState>({
    document: null,
    content: null,
    loading: true,
    error: null,
    copied: false,
    lastUpdated: null,
  })

  useEffect(() => {
    const locationState = location.state as { cnj?: string } | null
    const cnj = locationState?.cnj

    const loadDocument = async () => {
      if (!documentId || !cnj) return

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
          titulo: docContent.metadata?.titulo || 'Documento do Processo',
          tipo: docContent.metadata?.tipo || 'Documento',
          dataCriacao: docContent.metadata?.dataCriacao || lastUpdated.split('T')[0],
          paginas: docContent.metadata?.paginas || 1,
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

  const handleOpenPDF = () => {
    if (state.document?.urlPdf) {
      window.open(state.document.urlPdf, '_blank')
    }
  }

  const locationState = location.state as { cnj?: string } | null
  if (!locationState?.cnj) {
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
              onClick={() => navigate(-1)}
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
            const cnj = (location.state as { cnj?: string } | null)?.cnj
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
            <div className="prose prose-sm max-w-none overflow-hidden">
              <div className="p-8 bg-white text-gray-800 leading-relaxed space-y-4">
                {state.content.split('\n\n').map((paragraph, idx) => (
                  <p
                    key={idx}
                    className="text-justify text-base text-gray-700 whitespace-pre-wrap font-serif"
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
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
