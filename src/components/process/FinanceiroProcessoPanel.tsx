import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import Button from '@/components/common/Button'
import Empty from '@/components/common/Empty'
import { Spinner } from '@/components/common/Loading'
import { criarCobranca, listarCobrancas, sincronizarCobranca } from '@/services/financeiro.service'
import type { BillingType } from '@/types/financeiro'

const BILLING_OPTIONS: Array<{ value: BillingType; label: string }> = [
  { value: 'PIX', label: 'Pix' },
  { value: 'BOLETO', label: 'Boleto' },
  { value: 'UNDEFINED', label: 'Link Asaas' },
]

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendente',
  RECEIVED: 'Recebida',
  CONFIRMED: 'Confirmada',
  OVERDUE: 'Vencida',
  RECEIVED_IN_CASH: 'Recebida em dinheiro',
  REFUNDED: 'Estornada',
}

function formatCurrencyBR(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function formatDateBR(value?: string) {
  if (!value) return '-'
  return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR')
}

function statusColor(status: string) {
  if (status === 'RECEIVED' || status === 'CONFIRMED' || status === 'RECEIVED_IN_CASH') return 'text-green-700 bg-green-50 border-green-200'
  if (status === 'OVERDUE') return 'text-red-700 bg-red-50 border-red-200'
  if (status === 'REFUNDED') return 'text-gray-700 bg-gray-100 border-gray-200'
  return 'text-amber-700 bg-amber-50 border-amber-200'
}

function todayPlus(days: number) {
  const dt = new Date()
  dt.setDate(dt.getDate() + days)
  return dt.toISOString().slice(0, 10)
}

interface FinanceiroProcessoPanelProps {
  cnj: string
  clienteId?: string
  clienteNome?: string
  onToast: (msg: string) => void
}

export default function FinanceiroProcessoPanel({ cnj, clienteId, clienteNome, onToast }: FinanceiroProcessoPanelProps) {
  const [form, setForm] = useState({
    descricao: '',
    valor: '',
    billingType: 'PIX' as BillingType,
    dueDate: todayPlus(7),
  })
  const [syncingChargeId, setSyncingChargeId] = useState<string | null>(null)

  const cobrancasQuery = useQuery({
    queryKey: ['financeiro-cobrancas-processo', cnj],
    queryFn: () => listarCobrancas({ processoCnj: cnj }),
    enabled: !!cnj,
    staleTime: 30 * 1000,
  })

  const createMutation = useMutation({
    mutationFn: criarCobranca,
    onSuccess: async () => {
      await cobrancasQuery.refetch()
      onToast('Cobrança vinculada ao processo criada com sucesso.')
      setForm({ descricao: '', valor: '', billingType: 'PIX', dueDate: todayPlus(7) })
    },
    onError: (error) => {
      onToast(error instanceof Error ? error.message : 'Não foi possível criar a cobrança deste processo.')
    },
  })

  const resumo = useMemo(() => {
    const lista = cobrancasQuery.data ?? []
    const total = lista.reduce((acc, item) => acc + item.valor, 0)
    const aberto = lista.filter(item => ['PENDING', 'OVERDUE'].includes(item.status)).reduce((acc, item) => acc + item.valor, 0)
    const recebidas = lista.filter(item => ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(item.status)).length
    return { total, aberto, recebidas }
  }, [cobrancasQuery.data])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!clienteId) {
      onToast('Vincule um cliente ao processo antes de gerar cobranças nesta aba.')
      return
    }
    const valor = Number(form.valor.replace(',', '.'))
    if (!form.descricao.trim() || !Number.isFinite(valor) || valor <= 0 || !form.dueDate) {
      onToast('Preencha descrição, valor válido e vencimento para criar a cobrança.')
      return
    }

    await createMutation.mutateAsync({
      clienteId,
      processoCnj: cnj,
      descricao: form.descricao.trim(),
      valor,
      billingType: form.billingType,
      dueDate: form.dueDate,
    })
  }, [clienteId, cnj, form, createMutation, onToast])

  const handleSync = useCallback(async (id: string) => {
    try {
      setSyncingChargeId(id)
      await sincronizarCobranca(id)
      await cobrancasQuery.refetch()
      onToast('Status financeiro atualizado com o Asaas.')
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Não foi possível sincronizar esta cobrança.')
    } finally {
      setSyncingChargeId(null)
    }
  }, [cobrancasQuery, onToast])

  const handleCopyPix = useCallback(async (payload: string) => {
    try {
      await navigator.clipboard.writeText(payload)
      onToast('Código Pix copiado para a área de transferência.')
    } catch {
      onToast('Não foi possível copiar o código Pix neste navegador.')
    }
  }, [onToast])

  if (cobrancasQuery.isLoading) {
    return <div className="py-10 flex justify-center"><Spinner size="lg" /></div>
  }

  const cobrancas = cobrancasQuery.data ?? []

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Cliente vinculado</p>
          <p className="text-base font-semibold text-gray-900 mt-1">{clienteNome || 'Não vinculado'}</p>
        </div>
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total do processo</p>
          <p className="text-base font-semibold text-gray-900 mt-1">{formatCurrencyBR(resumo.total)}</p>
        </div>
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Em aberto</p>
          <p className="text-base font-semibold text-gray-900 mt-1">{formatCurrencyBR(resumo.aberto)} · {resumo.recebidas} recebida(s)</p>
        </div>
      </div>

      {!clienteId && (
        <Empty
          title="Processo sem cliente vinculado"
          description="Vincule um cliente ao processo para emitir cobranças diretamente nesta aba Financeiro."
        />
      )}

      {clienteId && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-1 border border-gray-200 rounded-lg p-4 bg-gray-50">
            <h3 className="text-lg font-semibold text-gray-900">Nova cobrança</h3>
            <p className="text-sm text-gray-500 mt-1">Esta cobrança será vinculada automaticamente ao CNJ atual.</p>
            <form className="space-y-4 mt-4" onSubmit={handleSubmit}>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                <input
                  type="text"
                  value={form.descricao}
                  onChange={e => setForm(prev => ({ ...prev, descricao: e.target.value }))}
                  placeholder="Honorários do processo"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Valor</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={form.valor}
                    onChange={e => setForm(prev => ({ ...prev, valor: e.target.value }))}
                    placeholder="1500.00"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vencimento</label>
                  <input
                    type="date"
                    value={form.dueDate}
                    onChange={e => setForm(prev => ({ ...prev, dueDate: e.target.value }))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Forma de cobrança</label>
                <select
                  value={form.billingType}
                  onChange={e => setForm(prev => ({ ...prev, billingType: e.target.value as BillingType }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  {BILLING_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Criando...' : 'Criar cobrança deste processo'}
              </Button>
            </form>
          </div>

          <div className="xl:col-span-2 border border-gray-200 rounded-lg p-4 bg-white">
            <h3 className="text-lg font-semibold text-gray-900">Cobranças vinculadas</h3>
            <p className="text-sm text-gray-500 mt-1">Todas as cobranças geradas para este CNJ ficam centralizadas aqui.</p>

            {cobrancas.length === 0 ? (
              <div className="mt-6">
                <Empty
                  title="Nenhuma cobrança vinculada"
                  description="Crie a primeira cobrança deste processo para acompanhar o financeiro sem sair da ficha processual."
                />
              </div>
            ) : (
              <div className="overflow-x-auto mt-4">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Descrição</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Forma</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Venc.</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Valor</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {cobrancas.map(item => (
                      <tr key={item.id}>
                        <td className="px-4 py-3 text-gray-900 font-medium">{item.descricao}</td>
                        <td className="px-4 py-3 text-gray-600">{item.billingType}</td>
                        <td className="px-4 py-3 text-gray-600">{formatDateBR(item.dueDate)}</td>
                        <td className="px-4 py-3 text-gray-900 font-medium">{formatCurrencyBR(item.valor)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${statusColor(item.status)}`}>
                            {STATUS_LABEL[item.status] || item.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2 flex-wrap">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSync(item.id)}
                              disabled={syncingChargeId === item.id}
                            >
                              {syncingChargeId === item.id ? 'Sincronizando...' : 'Atualizar'}
                            </Button>
                            {item.pixCopyPaste && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleCopyPix(item.pixCopyPaste!)}
                              >
                                Copiar Pix
                              </Button>
                            )}
                            {item.invoiceUrl && (
                              <a
                                href={item.invoiceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-600 hover:underline"
                              >
                                Abrir fatura
                              </a>
                            )}
                            {!item.invoiceUrl && item.bankSlipUrl && (
                              <a
                                href={item.bankSlipUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-600 hover:underline"
                              >
                                Abrir boleto
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
