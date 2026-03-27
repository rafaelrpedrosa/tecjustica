import { useState, useEffect } from 'react'
import { listarClientes, cadastrarCliente } from '@/services/cliente.service'
import { atualizarProcesso } from '@/services/escritorio.service'
import { getPartiesMCP } from '@/services/mcp.service'
import type { Cliente } from '@/types/cliente'

interface ParteSimples {
  nome: string
  cpfCnpj?: string
  email?: string
  tipo?: string
}
interface PartesAgrupadas {
  ATIVO: ParteSimples[]
  PASSIVO: ParteSimples[]
}

interface VincularClienteModalProps {
  isOpen: boolean
  cnj: string
  clienteIdAtual?: string
  onClose: () => void
  onSuccess: () => void
}

export function VincularClienteModal({ isOpen, cnj, clienteIdAtual, onClose, onSuccess }: VincularClienteModalProps) {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loadingClientes, setLoadingClientes] = useState(false)
  const [clienteSelecionado, setClienteSelecionado] = useState<string>(clienteIdAtual || '')
  const [criarNovo, setCriarNovo] = useState(false)
  const [novoCliente, setNovoCliente] = useState({
    nome: '',
    cpfCnpj: '',
    whatsapp: '',
    email: '',
    notas: '',
  })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [poloSelecionado, setPoloSelecionado] = useState<'ATIVO' | 'PASSIVO'>('ATIVO')
  const [sugerirExistente, setSugerirExistente] = useState<string | null>(null)
  const [partes, setPartes] = useState<PartesAgrupadas | null>(null)
  const [loadingPartes, setLoadingPartes] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setPartes(null)
    setLoadingPartes(true)
    getPartiesMCP(cnj)
      .then(data => {
        setPartes({
          ATIVO: (data.POLO_ATIVO || []).map((p: any) => ({ nome: p.nome, cpfCnpj: p.cpf_cnpj || p.cpfCnpj, email: p.email, tipo: p.tipo })),
          PASSIVO: (data.POLO_PASSIVO || []).map((p: any) => ({ nome: p.nome, cpfCnpj: p.cpf_cnpj || p.cpfCnpj, email: p.email, tipo: p.tipo })),
        })
      })
      .catch(() => setPartes(null))
      .finally(() => setLoadingPartes(false))
  }, [isOpen, cnj])

  useEffect(() => {
    if (!isOpen) return
    const carregarClientes = async () => {
      setLoadingClientes(true)
      setErro(null)
      try {
        const data = await listarClientes()
        setClientes(data)

        // Auto-fill from MCP partes if available
        if (partes && partes[poloSelecionado]?.length > 0) {
          const parte = partes[poloSelecionado][0]
          if (parte.cpfCnpj) {
            const cpfLimpo = parte.cpfCnpj.replace(/\D/g, '')
            const clienteExistente = data.find(
              c => c.cpfCnpj && c.cpfCnpj.replace(/\D/g, '') === cpfLimpo
            )

            if (clienteExistente) {
              setSugerirExistente(clienteExistente.id)
              setClienteSelecionado(clienteExistente.id)
              setCriarNovo(false)
            } else {
              setCriarNovo(true)
              setNovoCliente({
                nome: parte.nome || '',
                cpfCnpj: parte.cpfCnpj || '',
                whatsapp: '',
                email: parte.email || '',
                notas: `Parte ${poloSelecionado.toLowerCase()} - ${parte.tipo || ''}`,
              })
              setSugerirExistente(null)
            }
          }
        }
      } catch (e) {
        setErro('Erro ao carregar clientes.')
      } finally {
        setLoadingClientes(false)
      }
    }
    carregarClientes()
  }, [isOpen, partes, poloSelecionado])

  const handleSalvar = async () => {
    setSalvando(true)
    setErro(null)
    try {
      let clienteId = clienteSelecionado

      // Se está criando novo cliente
      if (criarNovo) {
        if (!novoCliente.nome.trim()) {
          setErro('Nome do cliente é obrigatório.')
          setSalvando(false)
          return
        }
        const clienteCriado = await cadastrarCliente({
          nome: novoCliente.nome,
          cpfCnpj: novoCliente.cpfCnpj || undefined,
          whatsapp: novoCliente.whatsapp || undefined,
          email: novoCliente.email || undefined,
          notas: novoCliente.notas || undefined,
        })
        clienteId = clienteCriado.id
      }

      // Se não selecionou cliente
      if (!clienteId) {
        setErro('Selecione ou crie um cliente.')
        setSalvando(false)
        return
      }

      // Atualizar processo com novo cliente
      await atualizarProcesso(cnj, { clienteId })
      onSuccess()
      onClose()
    } catch {
      setErro('Erro ao vincular cliente.')
    } finally {
      setSalvando(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg max-w-md w-full max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">Vincular Cliente</h2>
          <p className="text-sm text-gray-600 mt-1">Processo: {cnj}</p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {erro && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
              {erro}
            </div>
          )}

          {((partes?.ATIVO?.length ?? 0) > 0 || (partes?.PASSIVO?.length ?? 0) > 0) && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Qual polo será o cliente?
              </label>
              <select
                value={poloSelecionado}
                onChange={e => setPoloSelecionado(e.target.value as 'ATIVO' | 'PASSIVO')}
                disabled={loadingPartes || loadingClientes}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              >
                {(partes?.ATIVO?.length ?? 0) > 0 && (
                  <option value="ATIVO">Ativo (Autor/Reclamante)</option>
                )}
                {(partes?.PASSIVO?.length ?? 0) > 0 && (
                  <option value="PASSIVO">Passivo (Réu/Reclamado)</option>
                )}
              </select>
              {partes?.[poloSelecionado]?.[0] && (
                <p className="text-xs text-gray-500 mt-1">
                  Dados extraídos: {partes[poloSelecionado][0].nome}
                </p>
              )}
            </div>
          )}

          {!criarNovo ? (
            <>
              {sugerirExistente && (
                <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                  <p className="text-xs font-medium text-blue-900 mb-2">
                    Cliente existente encontrado com o mesmo CPF:
                  </p>
                  <p className="text-sm text-blue-800 font-medium">
                    {clientes.find(c => c.id === sugerirExistente)?.nome}
                  </p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {sugerirExistente ? 'Cliente sugerido' : 'Selecionar cliente existente'}
                </label>
                <select
                  value={clienteSelecionado}
                  onChange={e => setClienteSelecionado(e.target.value)}
                  disabled={loadingClientes}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                >
                  <option value="">— Selecionar cliente —</option>
                  {clientes.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.nome} {c.cpfCnpj ? `(${c.cpfCnpj})` : ''}
                      {sugerirExistente === c.id ? ' ✓' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setCriarNovo(true)
                    setSugerirExistente(null)
                  }}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  + Criar novo cliente
                </button>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome *
                </label>
                <input
                  type="text"
                  value={novoCliente.nome}
                  onChange={e => setNovoCliente({ ...novoCliente, nome: e.target.value })}
                  placeholder="Nome do cliente"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  CPF/CNPJ
                </label>
                <input
                  type="text"
                  value={novoCliente.cpfCnpj}
                  onChange={e => setNovoCliente({ ...novoCliente, cpfCnpj: e.target.value })}
                  placeholder="123.456.789-00"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  WhatsApp
                </label>
                <input
                  type="tel"
                  value={novoCliente.whatsapp}
                  onChange={e => setNovoCliente({ ...novoCliente, whatsapp: e.target.value })}
                  placeholder="(11) 98765-4321"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={novoCliente.email}
                  onChange={e => setNovoCliente({ ...novoCliente, email: e.target.value })}
                  placeholder="cliente@example.com"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notas
                </label>
                <textarea
                  value={novoCliente.notas}
                  onChange={e => setNovoCliente({ ...novoCliente, notas: e.target.value })}
                  placeholder="Observações adicionais"
                  rows={2}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setCriarNovo(false)
                    setNovoCliente({ nome: '', cpfCnpj: '', whatsapp: '', email: '', notas: '' })
                    setSugerirExistente(null)
                  }}
                  className="text-sm text-gray-600 hover:text-gray-700 font-medium"
                >
                  ← Voltar para seleção
                </button>
              </div>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex gap-2">
          <button
            onClick={onClose}
            disabled={salvando}
            className="flex-1 px-3 py-2 text-sm font-medium border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSalvar}
            disabled={salvando || (!criarNovo && !clienteSelecionado)}
            className="flex-1 px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {salvando ? 'Salvando...' : 'Vincular'}
          </button>
        </div>
      </div>
    </div>
  )
}
