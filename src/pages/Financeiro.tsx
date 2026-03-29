import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from '@/components/common/Button'
import Card, { CardContent } from '@/components/common/Card'
import Empty from '@/components/common/Empty'
import { Spinner } from '@/components/common/Loading'
import { listarClientes } from '@/services/cliente.service'
import { criarCobranca, listarCobrancas, sincronizarClienteAsaas, sincronizarCobranca } from '@/services/financeiro.service'
import type { Cliente } from '@/types/cliente'
import type { BillingType, FinanceiroCobranca } from '@/types/financeiro'

type ToastState = { type: 'success' | 'error'; message: string } | null

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

function startOfMonth() {
  const dt = new Date()
  dt.setDate(1)
  return dt.toISOString().slice(0, 10)
}

function isRecebida(status: string) {
  return ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(status)
}

function getEffectiveReceivedDate(item: FinanceiroCobranca) {
  return item.paidAt ? item.paidAt.slice(0, 10) : undefined
}

function sumReceivedInRange(items: FinanceiroCobranca[], start: string, end: string) {
  return items
    .filter(item => {
      if (!isRecebida(item.status)) return false
      const paidDate = getEffectiveReceivedDate(item)
      return !!paidDate && paidDate >= start && paidDate <= end
    })
    .reduce((acc, item) => acc + item.valor, 0)
}

export default function Financeiro() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [cobrancas, setCobrancas] = useState<FinanceiroCobranca[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [syncingClientId, setSyncingClientId] = useState<string | null>(null)
  const [syncingChargeId, setSyncingChargeId] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState>(null)
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroClienteId, setFiltroClienteId] = useState('')
  const [modoLista, setModoLista] = useState<'cliente' | 'escritorio'>('cliente')
  const [periodoInicio, setPeriodoInicio] = useState(startOfMonth())
  const [periodoFim, setPeriodoFim] = useState(todayPlus(0))
  const [form, setForm] = useState({
    clienteId: '',
    processoCnj: '',
    descricao: '',
    valor: '',
    billingType: 'PIX' as BillingType,
    dueDate: todayPlus(7),
  })

  const carregar = useCallback(async () => {
    try {
      setLoading(true)
      const [clientesData, cobrancasData] = await Promise.all([
        listarClientes(),
        listarCobrancas(),
      ])
      setClientes(clientesData)
      setCobrancas(cobrancasData)
      if (!form.clienteId && clientesData.length > 0) {
        const primeiroClienteId = clientesData[0].id
        setForm(prev => ({ ...prev, clienteId: primeiroClienteId }))
        setFiltroClienteId(primeiroClienteId)
      }
    } catch (error) {
      setToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'Nao foi possivel carregar o financeiro.',
      })
    } finally {
      setLoading(false)
    }
  }, [form.clienteId])

  useEffect(() => {
    carregar()
  }, [carregar])

  const cobrancasFiltradas = useMemo(() => {
    return cobrancas.filter(item => {
      const statusOk = !filtroStatus || item.status === filtroStatus
      const clienteOk = modoLista === 'escritorio' || !filtroClienteId || item.clienteId === filtroClienteId
      return statusOk && clienteOk
    })
  }, [cobrancas, filtroStatus, filtroClienteId, modoLista])

  const resumo = useMemo(() => {
    const base = modoLista === 'escritorio'
      ? cobrancas
      : filtroClienteId
        ? cobrancas.filter(item => item.clienteId === filtroClienteId)
        : []
    const pendentes = base.filter(item => item.status === 'PENDING').length
    const vencidas = base.filter(item => item.status === 'OVERDUE').length
    const recebidas = base.filter(item => isRecebida(item.status)).length
    const totalAberto = base
      .filter(item => ['PENDING', 'OVERDUE'].includes(item.status))
      .reduce((acc, item) => acc + item.valor, 0)
    const hoje = todayPlus(0)
    const inicioMes = startOfMonth()
    const inicio30d = todayPlus(-30)
    const recebidoMes = sumReceivedInRange(base, inicioMes, hoje)
    const recebido30Dias = sumReceivedInRange(base, inicio30d, hoje)
    const recebidoPeriodo = periodoInicio <= periodoFim
      ? sumReceivedInRange(base, periodoInicio, periodoFim)
      : 0
    return { pendentes, vencidas, recebidas, totalAberto, recebidoMes, recebido30Dias, recebidoPeriodo }
  }, [cobrancas, filtroClienteId, modoLista, periodoInicio, periodoFim])

  const handleSyncCliente = useCallback(async () => {
    if (!form.clienteId) {
      setToast({ type: 'error', message: 'Selecione um cliente antes de sincronizar no Asaas.' })
      return
    }
    try {
      setSyncingClientId(form.clienteId)
      await sincronizarClienteAsaas(form.clienteId)
      setToast({ type: 'success', message: 'Cliente sincronizado com o Asaas.' })
    } catch (error) {
      setToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'Nao foi possivel sincronizar o cliente.',
      })
    } finally {
      setSyncingClientId(null)
    }
  }, [form.clienteId])

  const handleSyncCobranca = useCallback(async (id: string) => {
    try {
      setSyncingChargeId(id)
      const atualizada = await sincronizarCobranca(id)
      setCobrancas(prev => prev.map(item => item.id === id ? atualizada : item))
      setToast({ type: 'success', message: 'Status da cobranca sincronizado com o Asaas.' })
    } catch (error) {
      setToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'Nao foi possivel sincronizar a cobranca.',
      })
    } finally {
      setSyncingChargeId(null)
    }
  }, [])

  const handleCopyPix = useCallback(async (payload: string) => {
    try {
      await navigator.clipboard.writeText(payload)
      setToast({ type: 'success', message: 'Codigo Pix copiado para a area de transferencia.' })
    } catch {
      setToast({ type: 'error', message: 'Nao foi possivel copiar o codigo Pix neste navegador.' })
    }
  }, [])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.clienteId || !form.descricao.trim() || !form.valor || !form.dueDate) {
      setToast({ type: 'error', message: 'Preencha cliente, descricao, valor e vencimento.' })
      return
    }
    const valor = Number(form.valor.replace(',', '.'))
    if (!Number.isFinite(valor) || valor <= 0) {
      setToast({ type: 'error', message: 'Informe um valor valido para a cobranca.' })
      return
    }

    try {
      setSubmitting(true)
      await criarCobranca({
        clienteId: form.clienteId,
        processoCnj: form.processoCnj.trim() || undefined,
        descricao: form.descricao.trim(),
        valor,
        billingType: form.billingType,
        dueDate: form.dueDate,
      })
      setToast({ type: 'success', message: 'Cobranca criada com sucesso.' })
      setFiltroClienteId(form.clienteId)
      setModoLista('cliente')
      setForm(prev => ({ ...prev, descricao: '', valor: '', processoCnj: '', dueDate: todayPlus(7) }))
      await carregar()
    } catch (error) {
      setToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'Nao foi possivel criar a cobranca.',
      })
    } finally {
      setSubmitting(false)
    }
  }, [carregar, form])

  return (
    <div className="p-6 space-y-6">
      {toast && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${
          toast.type === 'error'
            ? 'bg-red-50 border-red-200 text-red-700'
            : 'bg-green-50 border-green-200 text-green-700'
        }`}>
          {toast.message}
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Financeiro</h1>
          <p className="text-sm text-gray-500 mt-1">
            Emissao de cobrancas com Asaas e acompanhamento de recebimentos.
          </p>
        </div>
        <Button variant="secondary" onClick={carregar}>Atualizar</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card><CardContent className="py-5 text-center"><p className="text-3xl font-bold text-amber-600">{resumo.pendentes}</p><p className="text-xs text-gray-500 uppercase tracking-wide mt-2">Pendentes</p></CardContent></Card>
            <Card><CardContent className="py-5 text-center"><p className="text-3xl font-bold text-red-600">{resumo.vencidas}</p><p className="text-xs text-gray-500 uppercase tracking-wide mt-2">Vencidas</p></CardContent></Card>
            <Card><CardContent className="py-5 text-center"><p className="text-3xl font-bold text-green-600">{resumo.recebidas}</p><p className="text-xs text-gray-500 uppercase tracking-wide mt-2">Recebidas</p></CardContent></Card>
            <Card><CardContent className="py-5 text-center"><p className="text-2xl font-bold text-gray-800">{formatCurrencyBR(resumo.totalAberto)}</p><p className="text-xs text-gray-500 uppercase tracking-wide mt-2">Em aberto</p></CardContent></Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card><CardContent className="py-5 text-center"><p className="text-2xl font-bold text-emerald-700">{formatCurrencyBR(resumo.recebidoMes)}</p><p className="text-xs text-gray-500 uppercase tracking-wide mt-2">Recebido no mes</p></CardContent></Card>
            <Card><CardContent className="py-5 text-center"><p className="text-2xl font-bold text-teal-700">{formatCurrencyBR(resumo.recebido30Dias)}</p><p className="text-xs text-gray-500 uppercase tracking-wide mt-2">Ultimos 30 dias</p></CardContent></Card>
            <Card>
              <CardContent className="py-5">
                <div className="text-center mb-3">
                  <p className="text-2xl font-bold text-cyan-700">{formatCurrencyBR(resumo.recebidoPeriodo)}</p>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mt-2">Periodo escolhido</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={periodoInicio}
                    onChange={e => setPeriodoInicio(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-2 py-2 text-xs"
                  />
                  <input
                    type="date"
                    value={periodoFim}
                    onChange={e => setPeriodoFim(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-2 py-2 text-xs"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <Card className="xl:col-span-1">
              <CardContent className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Nova cobranca</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    O sistema sincroniza o cliente no Asaas e gera a cobranca no mesmo fluxo.
                  </p>
                </div>

                <form className="space-y-4" onSubmit={handleSubmit}>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
                    <select
                      value={form.clienteId}
                      onChange={e => {
                        const nextClienteId = e.target.value
                        setForm(prev => ({ ...prev, clienteId: nextClienteId }))
                        setFiltroClienteId(nextClienteId)
                        setModoLista('cliente')
                      }}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    >
                      <option value="">Selecione</option>
                      {clientes.map(cliente => (
                        <option key={cliente.id} value={cliente.id}>{cliente.nome}</option>
                      ))}
                    </select>
                  </div>

                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    onClick={handleSyncCliente}
                    disabled={!form.clienteId || syncingClientId === form.clienteId}
                  >
                    {syncingClientId === form.clienteId ? 'Sincronizando...' : 'Sincronizar cliente no Asaas'}
                  </Button>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Descricao</label>
                    <input
                      type="text"
                      value={form.descricao}
                      onChange={e => setForm(prev => ({ ...prev, descricao: e.target.value }))}
                      placeholder="Honorarios iniciais do processo"
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">CNJ do processo</label>
                    <input
                      type="text"
                      value={form.processoCnj}
                      onChange={e => setForm(prev => ({ ...prev, processoCnj: e.target.value }))}
                      placeholder="Opcional"
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">Forma de cobranca</label>
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

                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting ? 'Criando cobranca...' : 'Criar cobranca'}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card className="xl:col-span-2">
              <CardContent className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Cobrancas</h2>
                    <p className="text-sm text-gray-500 mt-1">
                      Lista local sincronizada com o retorno do Asaas e atualizada via webhook.
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {modoLista === 'escritorio'
                        ? 'A lista mostra todas as cobrancas do escritorio.'
                        : `Mostrando apenas as cobrancas de ${clientes.find(cliente => cliente.id === filtroClienteId)?.nome || 'um cliente selecionado'}.`}
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      variant={modoLista === 'cliente' ? 'secondary' : 'ghost'}
                      size="sm"
                      onClick={() => setModoLista('cliente')}
                      disabled={!filtroClienteId}
                    >
                      Ver cliente selecionado
                    </Button>
                    <Button
                      variant={modoLista === 'escritorio' ? 'secondary' : 'ghost'}
                      size="sm"
                      onClick={() => setModoLista('escritorio')}
                    >
                      Ver escritorio inteiro
                    </Button>
                    <select
                      value={filtroClienteId}
                      onChange={e => { setFiltroClienteId(e.target.value); setModoLista(e.target.value ? 'cliente' : 'escritorio') }}
                      className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                    >
                      <option value="">Selecione um cliente</option>
                      {clientes.map(cliente => (
                        <option key={cliente.id} value={cliente.id}>{cliente.nome}</option>
                      ))}
                    </select>
                    <select
                      value={filtroStatus}
                      onChange={e => setFiltroStatus(e.target.value)}
                      className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                    >
                      <option value="">Todos os status</option>
                      <option value="PENDING">Pendentes</option>
                      <option value="OVERDUE">Vencidas</option>
                      <option value="RECEIVED">Recebidas</option>
                      <option value="CONFIRMED">Confirmadas</option>
                    </select>
                  </div>
                </div>

                {cobrancasFiltradas.length === 0 ? (
                  <Empty
                    title="Nenhuma cobranca registrada"
                    description="Crie a primeira cobranca para começar o controle financeiro."
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
                          <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Descricao</th>
                          <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Forma</th>
                          <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Venc.</th>
                          <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Valor</th>
                          <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Status</th>
                          <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Acoes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {cobrancasFiltradas.map(item => (
                          <tr key={item.id}>
                            <td className="px-4 py-3 font-medium text-gray-900">{item.cliente?.nome || item.clienteId}</td>
                            <td className="px-4 py-3 text-gray-700">
                              <div>{item.descricao}</div>
                              {item.processoCnj && <div className="text-xs text-gray-400 font-mono mt-1">{item.processoCnj}</div>}
                            </td>
                            <td className="px-4 py-3 text-gray-600">{item.billingType}</td>
                            <td className="px-4 py-3 text-gray-600">{formatDateBR(item.dueDate)}</td>
                            <td className="px-4 py-3 text-gray-900 font-medium">{formatCurrencyBR(item.valor)}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${statusColor(item.status)}`}>
                                {STATUS_LABEL[item.status] || item.status}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex gap-2 flex-wrap items-center">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleSyncCobranca(item.id)}
                                  disabled={syncingChargeId === item.id}
                                >
                                  {syncingChargeId === item.id ? 'Sincronizando...' : 'Atualizar status'}
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
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

