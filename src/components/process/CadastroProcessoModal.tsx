import { useState, useEffect } from 'react'
import Button from '@/components/common/Button'
import { cadastrarProcesso, atualizarProcesso } from '@/services/escritorio.service'
import { getPartiesMCP } from '@/services/mcp.service'
import { listarClientes, cadastrarCliente } from '@/services/cliente.service'
import type { CadastroProcessoInput, EscritorioProcesso } from '@/types/escritorio'
import type { Cliente } from '@/types/cliente'

interface ParteSimples {
  key: string
  nome: string
  tipo: string
  polo: 'ATIVO' | 'PASSIVO' | 'TERCEIRO'
  cpfCnpj?: string
}

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  cnjInicial?: string
  editando?: EscritorioProcesso
}

interface MCPParte {
  nome: string
  tipo?: string
  cpf_cnpj?: string
  cpfCnpj?: string
}

interface MCPPartesResponse {
  POLO_ATIVO?: MCPParte[]
  POLO_PASSIVO?: MCPParte[]
  POLO_OUTROS?: MCPParte[]
}

function flattenPartes(data: MCPPartesResponse | null | undefined): ParteSimples[] {
  if (!data) return []
  const result: ParteSimples[] = []
  ;(data.POLO_ATIVO || []).forEach((p, i) => {
    result.push({ key: `ativo-${i}`, nome: p.nome, tipo: p.tipo || 'AUTOR', polo: 'ATIVO', cpfCnpj: p.cpf_cnpj || p.cpfCnpj })
  })
  ;(data.POLO_PASSIVO || []).forEach((p, i) => {
    result.push({ key: `passivo-${i}`, nome: p.nome, tipo: p.tipo || 'RÉU', polo: 'PASSIVO', cpfCnpj: p.cpf_cnpj || p.cpfCnpj })
  })
  ;(data.POLO_OUTROS || []).forEach((p, i) => {
    result.push({ key: `outros-${i}`, nome: p.nome, tipo: p.tipo || 'TERCEIRO', polo: 'TERCEIRO', cpfCnpj: p.cpf_cnpj || p.cpfCnpj })
  })
  return result
}


function formatCpfCnpj(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 14)
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }
  return digits
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

const POLO_OPTIONS = [
  { value: 'ATIVO', label: 'Ativo (Autor / Reclamante)' },
  { value: 'PASSIVO', label: 'Passivo (Réu / Reclamada)' },
  { value: 'TERCEIRO', label: 'Terceiro / Interveniente' },
]

export function CadastroProcessoModal({ isOpen, onClose, onSuccess, cnjInicial, editando }: Props) {
  const [form, setForm] = useState<CadastroProcessoInput>({
    cnj: '',
    clienteNome: '',
    clientePolo: 'ATIVO',
    clienteId: undefined,
    responsavel: '',
    vara: '',
    monitorar: true,
    notas: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [partes, setPartes] = useState<ParteSimples[]>([])
  const [loadingPartes, setLoadingPartes] = useState(false)
  const [parteSelecionada, setParteSelecionada] = useState<string | null>(null)
  const [partesError, setPartesError] = useState(false)

  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loadingClientes, setLoadingClientes] = useState(false)
  const [showingNewClient, setShowingNewClient] = useState(false)
  const [newClientData, setNewClientData] = useState({ nome: '', cpfCnpj: '', whatsapp: '', email: '', notas: '' })

  useEffect(() => {
    if (editando) {
      setForm({
        cnj: editando.cnj,
        clienteNome: editando.clienteNome,
        clientePolo: editando.clientePolo,
        clienteId: editando.clienteId,
        responsavel: editando.responsavel || '',
        vara: editando.vara || '',
        monitorar: editando.monitorar,
        notas: editando.notas || '',
      })
    } else {
      setForm({
        cnj: cnjInicial || '',
        clienteNome: '',
        clientePolo: 'ATIVO',
        clienteId: undefined,
        responsavel: '',
        vara: '',
        monitorar: true,
        notas: '',
      })
    }
    setError(null)
    setPartes([])
    setParteSelecionada(null)
    setPartesError(false)
    setShowingNewClient(false)
    setNewClientData({ nome: '', cpfCnpj: '', whatsapp: '', email: '', notas: '' })
  }, [isOpen, editando, cnjInicial])

  // Busca partes quando o modal abre para cadastro (não edição)
  useEffect(() => {
    if (!isOpen || editando) return
    const cnj = cnjInicial || form.cnj
    if (!cnj) return
    setLoadingPartes(true)
    getPartiesMCP(cnj)
      .then((data) => {
        try {
          setPartes(flattenPartes(data))
          setPartesError(false)
        } catch (e) {
          console.error('[CadastroProcesso] Erro ao processar partes do MCP:', e)
          setPartesError(true)
          setPartes([])
        }
      })
      .catch(err => { console.error('[CadastroProcesso] Erro ao buscar partes:', err); setPartesError(true); setPartes([]) })
      .finally(() => setLoadingPartes(false))
  }, [isOpen, editando, cnjInicial])

  // Carrega clientes quando o modal abre
  useEffect(() => {
    if (!isOpen) return
    setLoadingClientes(true)
    listarClientes()
      .then(setClientes)
      .catch(() => setClientes([]))
      .finally(() => setLoadingClientes(false))
  }, [isOpen])

  function selecionarParte(parte: ParteSimples) {
    setParteSelecionada(parte.key)
    setForm(prev => ({
      ...prev,
      clienteNome: parte.nome,
      clientePolo: parte.polo,
    }))

    // Verifica se já existe cliente com esse CPF/CNPJ
    if (parte.cpfCnpj) {
      const cpfLimpo = parte.cpfCnpj.replace(/\D/g, '')
      const clienteExistente = clientes.find(c => c.cpfCnpj && c.cpfCnpj.replace(/\D/g, '') === cpfLimpo)
      if (clienteExistente) {
        selecionarCliente(clienteExistente)
        setShowingNewClient(false)
        return
      }
    }

    // Auto-preenche formulário de novo cliente com dados da parte
    setNewClientData(prev => ({
      ...prev,
      nome: parte.nome,
      cpfCnpj: parte.cpfCnpj || '',
    }))
    setShowingNewClient(true)
  }

  function limparSelecao() {
    setParteSelecionada(null)
    setForm(prev => ({ ...prev, clienteNome: '', clientePolo: 'ATIVO', clienteId: undefined }))
    setShowingNewClient(false)
    setNewClientData({ nome: '', cpfCnpj: '', whatsapp: '', email: '', notas: '' })
  }

  function selecionarCliente(cliente: Cliente) {
    setForm(prev => ({
      ...prev,
      clienteId: cliente.id,
      clienteNome: cliente.nome,
    }))
    setShowingNewClient(false)
  }

  async function handleAddNewClient() {
    if (!newClientData.nome.trim()) {
      setError('Informe o nome do cliente.')
      return
    }
    try {
      const novoCliente = await cadastrarCliente({
        nome: newClientData.nome,
        cpfCnpj: newClientData.cpfCnpj || undefined,
        whatsapp: newClientData.whatsapp || undefined,
        email: newClientData.email || undefined,
        notas: newClientData.notas || undefined,
      })
      setClientes(prev => [...prev, novoCliente])
      selecionarCliente(novoCliente)
      setNewClientData({ nome: '', cpfCnpj: '', whatsapp: '', email: '', notas: '' })
    } catch (err) {
      setError('Erro ao criar cliente.')
    }
  }

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!form.cnj.trim()) return setError('Informe o número CNJ do processo.')
    if (!form.clienteNome.trim()) return setError('Informe o nome do cliente.')

    setLoading(true)
    try {
      if (editando) {
        await atualizarProcesso(editando.cnj, {
          clienteNome: form.clienteNome,
          clientePolo: form.clientePolo,
          clienteId: form.clienteId,
          responsavel: form.responsavel,
          vara: form.vara,
          monitorar: form.monitorar,
          notas: form.notas,
        })
      } else {
        await cadastrarProcesso(form)
      }
      onSuccess()
      onClose()
    } catch (err: unknown) {
      const isAxiosShape = typeof err === 'object' && err !== null && 'response' in err
      const msg = isAxiosShape
        ? ((err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Erro ao salvar processo.')
        : 'Erro ao salvar processo.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">
            {editando ? 'Editar Cadastro' : 'Cadastrar Processo no Escritório'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 overflow-y-auto flex-1">

          {/* CNJ */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Número CNJ <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={form.cnj}
                onChange={e => setForm(prev => ({ ...prev, cnj: e.target.value }))}
                disabled={!!editando}
                placeholder="0000000-00.0000.0.00.0000"
                className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
              />
              {!editando && !cnjInicial && (
                <button
                  type="button"
                  disabled={!form.cnj.trim() || loadingPartes}
                  onClick={() => {
                    if (!form.cnj.trim()) return
                    setLoadingPartes(true)
                    setPartes([])
                    setParteSelecionada(null)
                    getPartiesMCP(form.cnj)
                      .then((data) => {
                        try {
                          setPartes(flattenPartes(data))
                          setPartesError(false)
                        } catch (e) {
                          console.error('[CadastroProcesso] Erro ao processar partes do MCP:', e)
                          setPartesError(true)
                          setPartes([])
                        }
                      })
                      .catch(err => { console.error('[CadastroProcesso] Erro ao buscar partes:', err); setPartesError(true); setPartes([]) })
                      .finally(() => setLoadingPartes(false))
                  }}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {loadingPartes ? '...' : 'Buscar partes'}
                </button>
              )}
            </div>
          </div>

          {/* Seleção de parte do processo */}
          {!editando && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Selecionar o seu cliente no processo
              </label>
              {loadingPartes ? (
                <p className="text-xs text-gray-400 py-2">Carregando partes...</p>
              ) : partes.length > 0 ? (
                <div className="space-y-1 max-h-40 overflow-y-auto border border-gray-200 rounded-md p-1">
                  {partes.map(parte => (
                    <button
                      key={parte.key}
                      type="button"
                      onClick={() => parteSelecionada === parte.key ? limparSelecao() : selecionarParte(parte)}
                      className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                        parteSelecionada === parte.key
                          ? 'bg-blue-600 text-white'
                          : 'hover:bg-gray-100 text-gray-800'
                      }`}
                    >
                      <span className="font-medium">{parte.nome}</span>
                      <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${
                        parteSelecionada === parte.key ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {parte.tipo}
                      </span>
                    </button>
                  ))}
                </div>
              ) : partesError ? (
                <p className="text-xs text-red-400 py-1">Erro ao buscar partes — preencha manualmente abaixo.</p>
              ) : (
                <p className="text-xs text-gray-400 py-1">Partes não disponíveis — preencha manualmente abaixo.</p>
              )}
            </div>
          )}

          {/* Seleção/Criação de Cliente */}
          <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cliente <span className="text-gray-400 font-normal">(opcional)</span>
              </label>
              {showingNewClient ? (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                  <input
                    type="text"
                    placeholder="Nome do cliente"
                    value={newClientData.nome}
                    onChange={e => setNewClientData(prev => ({ ...prev, nome: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <input
                    type="text"
                    placeholder="CPF/CNPJ (opcional)"
                    value={newClientData.cpfCnpj}
                    onChange={e => setNewClientData(prev => ({ ...prev, cpfCnpj: formatCpfCnpj(e.target.value) }))}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <input
                    type="text"
                    placeholder="WhatsApp (opcional)"
                    value={newClientData.whatsapp}
                    onChange={e => setNewClientData(prev => ({ ...prev, whatsapp: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <input
                    type="email"
                    placeholder="Email (opcional)"
                    value={newClientData.email}
                    onChange={e => setNewClientData(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleAddNewClient}
                      className="flex-1 px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                    >
                      Adicionar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowingNewClient(false)
                        setNewClientData({ nome: '', cpfCnpj: '', whatsapp: '', email: '', notas: '' })
                      }}
                      className="flex-1 px-2 py-1 border border-gray-300 text-xs rounded hover:bg-gray-50"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {loadingClientes ? (
                    <p className="text-xs text-gray-400 py-1">Carregando clientes...</p>
                  ) : clientes.length > 0 ? (
                    <>
                      <select
                        value={form.clienteId || ''}
                        onChange={e => {
                          if (e.target.value === '') {
                            setForm(prev => ({ ...prev, clienteId: undefined, clienteNome: '' }))
                          } else {
                            const cliente = clientes.find(c => c.id === e.target.value)
                            if (cliente) selecionarCliente(cliente)
                          }
                        }}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Selecionar cliente...</option>
                        {clientes.map(cliente => (
                          <option key={cliente.id} value={cliente.id}>{cliente.nome}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setShowingNewClient(true)}
                        className="w-full px-3 py-1 text-xs border border-dashed border-blue-300 rounded text-blue-600 hover:bg-blue-50"
                      >
                        + Novo cliente
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowingNewClient(true)}
                      className="w-full px-3 py-2 text-xs border border-dashed border-blue-300 rounded text-blue-600 hover:bg-blue-50"
                    >
                      + Criar novo cliente
                    </button>
                  )}
                </div>
              )}
            </div>

          {/* Nome do cliente */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nome do cliente <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.clienteNome}
              onChange={e => setForm(prev => ({ ...prev, clienteNome: e.target.value }))}
              placeholder="Ex: João da Silva"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Polo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Polo do cliente <span className="text-red-500">*</span>
            </label>
            <select
              value={form.clientePolo}
              onChange={e => setForm(prev => ({ ...prev, clientePolo: e.target.value as 'ATIVO' | 'PASSIVO' | 'TERCEIRO' }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {POLO_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Responsável */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Advogado responsável <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <input
              type="text"
              value={form.responsavel || ''}
              onChange={e => setForm(prev => ({ ...prev, responsavel: e.target.value }))}
              placeholder="Ex: Dr. Rafael Pedrosa"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Vara */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Vara <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <input
              type="text"
              value={form.vara || ''}
              onChange={e => setForm(prev => ({ ...prev, vara: e.target.value }))}
              placeholder="Ex: JEF Salgueiro/PE, 3ª Vara Cível..."
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Notas */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notas internas <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <textarea
              value={form.notas || ''}
              onChange={e => setForm(prev => ({ ...prev, notas: e.target.value }))}
              rows={3}
              placeholder="Observações sobre o processo..."
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Monitorar */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setForm(prev => ({ ...prev, monitorar: !prev.monitorar }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.monitorar ? 'bg-blue-600' : 'bg-gray-300'}`}
            >
              <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${form.monitorar ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
            <span className="text-sm text-gray-700">Monitorar automaticamente novos movimentos</span>
          </div>

          {/* Erro */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Ações */}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? 'Salvando...' : editando ? 'Salvar alterações' : 'Cadastrar processo'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
