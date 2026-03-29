import React, { useState, useEffect, useRef, useCallback } from 'react'
import Card, { CardContent } from '@/components/common/Card'
import Button from '@/components/common/Button'
import { Spinner } from '@/components/common/Loading'
import { listarProcessos } from '@/services/escritorio.service'
import { enviarMensagem, verificarStatusIA } from '@/services/ia.service'
import type { MensagemChat } from '@/services/ia.service'
import type { EscritorioProcesso } from '@/types/escritorio'

const SUGESTOES = [
  'Qual é o status atual do processo?',
  'Quais foram as últimas movimentações?',
  'Há alguma decisão pendente?',
  'Quando foi a última audiência?',
]

const PROVEDOR_LABEL: Record<string, string> = {
  anthropic: 'Claude (Anthropic)',
  openai: 'GPT (OpenAI)',
  gemini: 'Gemini (Google)',
}

const ChatIA: React.FC = () => {
  const [cnj, setCnj] = useState<string>('')
  const [processos, setProcessos] = useState<EscritorioProcesso[]>([])
  const [historico, setHistorico] = useState<MensagemChat[]>([])
  const [pergunta, setPergunta] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [statusIA, setStatusIA] = useState<{ configurado: boolean; provedor: string | null } | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listarProcessos().then(setProcessos).catch(() => setProcessos([]))
    verificarStatusIA().then(setStatusIA).catch(() => setStatusIA({ configurado: false, provedor: null }))
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [historico])

  const handleEnviar = useCallback(async () => {
    const texto = pergunta.trim()
    if (!texto || carregando) return
    setErro(null)
    const novaMensagem: MensagemChat = { role: 'user', content: texto }
    const novoHistorico = [...historico, novaMensagem]
    setHistorico(novoHistorico)
    setPergunta('')
    setCarregando(true)
    try {
      const res = await enviarMensagem(texto, cnj || undefined, historico)
      setHistorico(prev => [...prev, { role: 'assistant', content: res.resposta }])
    } catch {
      setErro('Erro ao conectar com a IA. Verifique se o backend está rodando e a chave de API está configurada.')
      setHistorico(historico)
    } finally {
      setCarregando(false)
    }
  }, [pergunta, carregando, historico, cnj])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleEnviar()
    }
  }

  const handleProcessoChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setCnj(e.target.value)
    setHistorico([])
    setErro(null)
  }

  const provedorLabel = statusIA?.provedor ? (PROVEDOR_LABEL[statusIA.provedor] ?? statusIA.provedor) : null

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900">Assistente IA Jurídico</h1>
          <p className="mt-1 text-sm text-gray-500">Converse com a base processual do escritório em um layout unificado com o restante do sistema.</p>
        </div>
        {statusIA && (
          <div className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-medium ${statusIA.configurado ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
            {statusIA.configurado && provedorLabel ? provedorLabel : 'IA não configurada'}
          </div>
        )}
      </div>

      {statusIA && !statusIA.configurado && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Nenhum provedor de IA está configurado. Defina uma chave no backend para usar o assistente.
        </div>
      )}

      <Card>
        <CardContent className="space-y-4 py-5">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Contexto da conversa</h2>
            <p className="text-sm text-gray-500">Selecione um processo para respostas contextualizadas ou converse sem filtro.</p>
          </div>
          <select
            id="processo-select"
            value={cnj}
            onChange={handleProcessoChange}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Sem processo selecionado</option>
            {processos.map(p => (
              <option key={p.cnj} value={p.cnj}>{p.cnj} - {p.clienteNome}</option>
            ))}
          </select>
          {historico.length === 0 && (
            <div className="flex flex-wrap gap-2">
              {SUGESTOES.map(s => (
                <button key={s} onClick={() => setPergunta(s)} className="rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700 transition-colors hover:bg-blue-100">
                  {s}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-0">
          <div className="border-b border-gray-200 px-5 py-4">
            <h2 className="text-xl font-semibold text-gray-900">Conversa</h2>
            <p className="text-sm text-gray-500">{cnj ? `Contexto ativo: ${cnj}` : 'Conversa geral sem processo vinculado.'}</p>
          </div>

          <div className="max-h-[28rem] min-h-[24rem] overflow-y-auto px-5 py-4 space-y-4">
            {historico.length === 0 ? (
              <div className="flex h-full min-h-[18rem] items-center justify-center text-center text-sm text-gray-400">
                Faça uma pergunta para iniciar a conversa.
              </div>
            ) : (
              historico.map((msg, idx) => (
                <div key={idx} className={`flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <span className="px-1 text-xs text-gray-400">{msg.role === 'user' ? 'Você' : 'Assistente IA'}</span>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${msg.role === 'user' ? 'rounded-tr-sm bg-blue-600 text-white' : 'rounded-tl-sm bg-gray-100 text-gray-800'}`}>
                    {msg.content}
                  </div>
                </div>
              ))
            )}
            {carregando && (
              <div className="flex flex-col items-start gap-1">
                <span className="px-1 text-xs text-gray-400">Assistente IA</span>
                <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-gray-100 px-4 py-3">
                  <Spinner size="sm" />
                  <span className="text-sm text-gray-500">Processando...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t border-gray-200 px-5 py-4">
            {erro && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{erro}</div>}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
              <textarea
                rows={3}
                value={pergunta}
                onChange={e => setPergunta(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={carregando}
                placeholder="Digite sua pergunta. Enter envia e Shift+Enter quebra linha."
                className="min-h-[96px] flex-1 resize-none rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
              />
              <Button onClick={handleEnviar} disabled={carregando || !pergunta.trim()} className="h-12 px-6">
                {carregando ? 'Enviando...' : 'Enviar'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default ChatIA