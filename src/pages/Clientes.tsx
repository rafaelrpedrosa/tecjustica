import { useState, useEffect, useCallback, useRef } from 'react'
import Button from '@/components/common/Button'
import Empty from '@/components/common/Empty'
import { Spinner } from '@/components/common/Loading'
import { CadastroClienteModal } from '@/components/process/CadastroClienteModal'
import { listarClientes, removerCliente } from '@/services/cliente.service'
import type { Cliente } from '@/types/cliente'

interface Toast { id: string; message: string; type: 'success' | 'error' }

export default function Clientes() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Cliente | undefined>()
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // Cleanup timers on unmount
  useEffect(() => () => {
    Object.values(toastTimers.current).forEach(clearTimeout)
  }, [])

  const addToast = useCallback((message: string, type: 'success' | 'error') => {
    const id = crypto.randomUUID()
    setToasts(prev => [...prev, { id, message, type }])
    toastTimers.current[id] = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
      delete toastTimers.current[id]
    }, 4000)
  }, [])

  const carregar = useCallback(async () => {
    try {
      setLoading(true)
      const data = await listarClientes()
      setClientes(data)
    } catch {
      addToast('Erro ao carregar clientes.', 'error')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => { carregar() }, [carregar])

  const handleSaved = useCallback((cliente: Cliente) => {
    setClientes(prev => {
      const idx = prev.findIndex(c => c.id === cliente.id)
      if (idx >= 0) {
        const updated = [...prev]
        updated[idx] = cliente
        return updated
      }
      return [...prev, cliente].sort((a, b) => a.nome.localeCompare(b.nome))
    })
    addToast(editando ? 'Cliente atualizado com sucesso.' : 'Cliente cadastrado com sucesso.', 'success')
    setEditando(undefined)
  }, [editando, addToast])

  const handleExcluir = useCallback(async (id: string) => {
    try {
      await removerCliente(id)
      setClientes(prev => prev.filter(c => c.id !== id))
      setConfirmandoId(null)
      addToast('Cliente removido.', 'success')
    } catch {
      addToast('Erro ao remover cliente.', 'error')
    }
  }, [addToast])

  const clientesFiltrados = clientes.filter(c => {
    if (!filtro) return true
    const q = filtro.toLowerCase()
    return c.nome.toLowerCase().includes(q) || (c.cpfCnpj ?? '').includes(q)
  })

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Toast stack */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`px-4 py-3 rounded-lg shadow-lg text-sm max-w-sm text-white ${
              t.type === 'error' ? 'bg-red-600' : 'bg-gray-900'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-sm text-gray-500 mt-1">
            {clientes.length} cliente(s) cadastrado(s)
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => { setEditando(undefined); setModalOpen(true) }}
        >
          + Novo Cliente
        </Button>
      </div>

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          value={filtro}
          onChange={e => setFiltro(e.target.value)}
          placeholder="Buscar por nome ou CPF/CNPJ..."
          className="w-full sm:max-w-sm border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : clientesFiltrados.length === 0 ? (
        clientes.length === 0 ? (
          <Empty
            title="Nenhum cliente cadastrado"
            description="Cadastre o primeiro cliente usando o botão acima."
          />
        ) : (
          <Empty
            title="Nenhum resultado"
            description="Tente ajustar o filtro de busca."
          />
        )
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CPF/CNPJ</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">WhatsApp</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {clientesFiltrados.map(c => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{c.nome}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 font-mono">{c.cpfCnpj || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{c.whatsapp || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{c.email || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    {confirmandoId === c.id ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="text-sm text-gray-700">Confirmar?</span>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleExcluir(c.id)}
                        >
                          Sim
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setConfirmandoId(null)}
                        >
                          Não
                        </Button>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setEditando(c); setModalOpen(true) }}
                        >
                          Editar
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => setConfirmandoId(c.id)}
                        >
                          Excluir
                        </Button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      <CadastroClienteModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditando(undefined) }}
        onSaved={handleSaved}
        clienteEdit={editando}
      />
    </div>
  )
}
