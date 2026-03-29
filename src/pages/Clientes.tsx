import { useState, useEffect, useCallback, useRef, useMemo, type ChangeEvent } from 'react'
import { useToast } from '@/hooks/useToast'
import Button from '@/components/common/Button'
import Card, { CardContent } from '@/components/common/Card'
import Empty from '@/components/common/Empty'
import { Spinner } from '@/components/common/Loading'
import { CadastroClienteModal } from '@/components/process/CadastroClienteModal'
import { listarClientes, removerCliente, cadastrarCliente } from '@/services/cliente.service'
import { parseCsv, readFileText, normalizeHeader } from '@/utils/csv'
import type { Cliente } from '@/types/cliente'


function getField(row: Record<string, string>, aliases: string[]): string {
  const entries = Object.entries(row)
  for (const alias of aliases) {
    const key = entries.find(([header]) => normalizeHeader(header) === normalizeHeader(alias))
    if (key) return key[1]?.trim() ?? ''
  }
  return ''
}

export default function Clientes() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Cliente | undefined>()
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null)
  const [importando, setImportando] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const { toasts, showToast: addToast } = useToast()

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

  const handleImportarClientes = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      setImportando(true)
      const text = await readFileText(file)
      const rows = parseCsv(text)
      if (rows.length === 0) {
        addToast('CSV vazio ou sem linhas válidas.', 'error')
        return
      }

      let sucesso = 0
      let falhas = 0

      for (const row of rows) {
        const nome = getField(row, ['nome', 'cliente'])
        if (!nome) {
          falhas += 1
          continue
        }

        try {
          await cadastrarCliente({
            nome,
            cpfCnpj: getField(row, ['cpfcnpj', 'cpf_cnpj', 'documento']) || undefined,
            whatsapp: getField(row, ['whatsapp', 'telefone', 'celular']) || undefined,
            email: getField(row, ['email', 'e-mail']) || undefined,
            notas: getField(row, ['notas', 'observacoes', 'observações']) || undefined,
          })
          sucesso += 1
        } catch {
          falhas += 1
        }
      }

      await carregar()
      addToast(`Importação concluída: ${sucesso} cliente(s) importado(s)${falhas ? `, ${falhas} falha(s)` : ''}.`, falhas ? 'error' : 'success')
    } catch {
      addToast('Erro ao importar arquivo de clientes.', 'error')
    } finally {
      setImportando(false)
    }
  }, [addToast, carregar])

  const clientesFiltrados = useMemo(() => clientes.filter(c => {
    if (!filtro) return true
    const q = filtro.toLowerCase()
    return c.nome.toLowerCase().includes(q) || (c.cpfCnpj ?? '').includes(q)
  }), [clientes, filtro])

  const clientesComWhatsapp = useMemo(
    () => clientes.filter(c => !!c.whatsapp?.trim()).length,
    [clientes]
  )

  const clientesComEmail = useMemo(
    () => clientes.filter(c => !!c.email?.trim()).length,
    [clientes]
  )

  return (
    <div className="p-6 space-y-6">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={handleImportarClientes}
      />

      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`max-w-sm rounded-lg px-4 py-3 text-sm text-white shadow-lg ${
              t.type === 'error' ? 'bg-red-600' : 'bg-gray-900'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="mt-1 text-sm text-gray-500">
            Base de clientes do escritório com dados de contato e relacionamento.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={importando}
          >
            {importando ? 'Importando...' : 'Importar CSV'}
          </Button>
          <Button
            variant="primary"
            onClick={() => { setEditando(undefined); setModalOpen(true) }}
          >
            + Novo cliente
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card><CardContent className="py-5 text-center"><p className="text-3xl font-bold text-gray-800">{clientes.length}</p><p className="mt-2 text-xs uppercase tracking-wide text-gray-500">Clientes</p></CardContent></Card>
        <Card><CardContent className="py-5 text-center"><p className="text-3xl font-bold text-blue-700">{clientesFiltrados.length}</p><p className="mt-2 text-xs uppercase tracking-wide text-gray-500">Filtrados</p></CardContent></Card>
        <Card><CardContent className="py-5 text-center"><p className="text-3xl font-bold text-green-700">{clientesComWhatsapp}</p><p className="mt-2 text-xs uppercase tracking-wide text-gray-500">Com WhatsApp</p></CardContent></Card>
        <Card><CardContent className="py-5 text-center"><p className="text-3xl font-bold text-cyan-700">{clientesComEmail}</p><p className="mt-2 text-xs uppercase tracking-wide text-gray-500">Com e-mail</p></CardContent></Card>
      </div>

      <Card>
        <CardContent className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Busca e importação</h2>
            <p className="mt-1 text-sm text-gray-500">Pesquise rapidamente por nome ou CPF/CNPJ. Para importar, use CSV com colunas como nome, cpfCnpj, whatsapp e email.</p>
          </div>
          <input
            type="text"
            value={filtro}
            onChange={e => setFiltro(e.target.value)}
            placeholder="Buscar por nome ou CPF/CNPJ..."
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 sm:max-w-sm"
          />
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : clientesFiltrados.length === 0 ? (
        clientes.length === 0 ? (
          <Empty
            title="Nenhum cliente cadastrado"
            description="Cadastre o primeiro cliente ou importe um CSV com a sua base."
          />
        ) : (
          <Empty
            title="Nenhum resultado"
            description="Tente ajustar o filtro de busca."
          />
        )
      ) : (
        <Card>
          <CardContent className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Clientes cadastrados</h2>
              <p className="mt-1 text-sm text-gray-500">{clientesFiltrados.length} resultado(s) exibido(s).</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Nome</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">CPF/CNPJ</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">WhatsApp</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">E-mail</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {clientesFiltrados.map(c => (
                    <tr key={c.id} className="transition-colors hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{c.nome}</td>
                      <td className="px-4 py-3 font-mono text-sm text-gray-600">{c.cpfCnpj || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{c.whatsapp || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{c.email || '-'}</td>
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
          </CardContent>
        </Card>
      )}

      <CadastroClienteModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditando(undefined) }}
        onSaved={handleSaved}
        clienteEdit={editando}
      />
    </div>
  )
}

