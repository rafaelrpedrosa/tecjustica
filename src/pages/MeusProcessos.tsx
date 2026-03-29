import { useState, useEffect, useCallback, useMemo, useRef, type ChangeEvent } from 'react'
import { useToast } from '@/hooks/useToast'
import { useNavigate } from 'react-router-dom'
import Button from '@/components/common/Button'
import Badge from '@/components/common/Badge'
import Card, { CardContent } from '@/components/common/Card'
import Empty from '@/components/common/Empty'
import { Spinner } from '@/components/common/Loading'
import { CadastroProcessoModal } from '@/components/process/CadastroProcessoModal'
import { VincularClienteModal } from '@/components/process/VincularClienteModal'
import {
  listarProcessos,
  removerProcesso,
  monitorarProcesso,
  monitorarTodos,
  marcarAlertasLidosPorCNJ,
  cadastrarProcesso,
} from '@/services/escritorio.service'
import { parseCsv, readFileText, normalizeHeader, normalizeBoolean } from '@/utils/csv'
import type { EscritorioProcesso, FaseProcessual } from '@/types/escritorio'


const POLO_LABELS: Record<string, string> = {
  ATIVO: 'Ativo',
  PASSIVO: 'Passivo',
  TERCEIRO: 'Terceiro',
}

const POLO_VARIANT: Record<string, 'success' | 'danger' | 'default'> = {
  ATIVO: 'success',
  PASSIVO: 'danger',
  TERCEIRO: 'default',
}

const FASE_LABELS: Record<FaseProcessual, string> = {
  CONHECIMENTO: 'Conhecimento',
  SENTENCIADO: 'Sentenciado',
  LIQUIDACAO_EXECUCAO: 'Liquidação / Execução',
  AGUARDANDO_RPV: 'Aguardando RPV',
  ARQUIVADO: 'Arquivado',
}

const DATE_FMT: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' }

function formatDate(iso?: string) {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString('pt-BR', DATE_FMT)
}

function getField(row: Record<string, string>, aliases: string[]): string {
  const entries = Object.entries(row)
  for (const alias of aliases) {
    const match = entries.find(([header]) => normalizeHeader(header) === normalizeHeader(alias))
    if (match) return match[1]?.trim() ?? ''
  }
  return ''
}

function normalizeFase(value: string): FaseProcessual | undefined {
  const normalized = normalizeHeader(value)
  const map: Record<string, FaseProcessual> = {
    conhecimento: 'CONHECIMENTO',
    sentenciado: 'SENTENCIADO',
    liquidacaoexecucao: 'LIQUIDACAO_EXECUCAO',
    liquidacao: 'LIQUIDACAO_EXECUCAO',
    execucao: 'LIQUIDACAO_EXECUCAO',
    aguardandorpv: 'AGUARDANDO_RPV',
    rpv: 'AGUARDANDO_RPV',
  }
  return map[normalized]
}

export default function MeusProcessos() {
  const navigate = useNavigate()
  const [processos, setProcessos] = useState<EscritorioProcesso[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState('')
  const [filtroPolo, setFiltroPolo] = useState('TODOS')
  const [filtroFase, setFiltroFase] = useState('TODAS')
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<EscritorioProcesso | undefined>()
  const [monitorando, setMonitorando] = useState<string | null>(null)
  const [vincularClienteOpen, setVincularClienteOpen] = useState(false)
  const [processoBuscandoCliente, setProcessoBuscandoCliente] = useState<EscritorioProcesso | undefined>()
  const [importando, setImportando] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const { toasts, showToast } = useToast()

  const carregar = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await listarProcessos()
      setProcessos(data)
    } catch {
      setError('Erro ao carregar processos do escritório.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const handleRemover = useCallback(async (cnj: string, clienteNome: string) => {
    if (!confirm(`Remover "${clienteNome}" (${cnj}) do cadastro do escritório?`)) return
    try {
      await removerProcesso(cnj)
      showToast('Processo removido com sucesso.')
      carregar()
    } catch {
      showToast('Erro ao remover processo.')
    }
  }, [carregar, showToast])

  const handleMonitorar = useCallback(async (cnj: string) => {
    setMonitorando(cnj)
    try {
      const resultado = await monitorarProcesso(cnj)
      showToast(resultado.mensagem)
      carregar()
    } catch {
      showToast('Erro ao verificar atualizações.')
    } finally {
      setMonitorando(null)
    }
  }, [carregar, showToast])

  const handleVer = useCallback(async (proc: EscritorioProcesso) => {
    if ((proc.alertasNaoLidos || 0) > 0) {
      try { await marcarAlertasLidosPorCNJ(proc.cnj) } catch {}
      setProcessos(prev => prev.map(p => p.cnj === proc.cnj ? { ...p, alertasNaoLidos: 0 } : p))
    }
    navigate(`/process/${encodeURIComponent(proc.cnj)}`)
  }, [navigate])

  const handleVincularCliente = useCallback((proc: EscritorioProcesso) => {
    setProcessoBuscandoCliente(proc)
    setVincularClienteOpen(true)
  }, [])

  const handleMonitorarTodos = useCallback(async () => {
    setMonitorando('todos')
    try {
      const res = await monitorarTodos()
      showToast(res.mensagem)
      setTimeout(carregar, 3000)
    } catch {
      showToast('Erro ao iniciar monitoramento.')
    } finally {
      setMonitorando(null)
    }
  }, [carregar, showToast])

  const handleImportarProcessos = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      setImportando(true)
      const text = await readFileText(file)
      const rows = parseCsv(text)
      if (rows.length === 0) {
        showToast('CSV vazio ou sem linhas válidas.')
        return
      }

      let sucesso = 0
      let falhas = 0
      for (const row of rows) {
        const cnj = getField(row, ['cnj', 'processo'])
        const clienteNome = getField(row, ['clientenome', 'cliente', 'nome'])
        const clientePolo = (getField(row, ['clientepolo', 'polo']) || 'ATIVO').toUpperCase()
        if (!cnj || !clienteNome || !['ATIVO', 'PASSIVO', 'TERCEIRO'].includes(clientePolo)) {
          falhas += 1
          continue
        }

        try {
          await cadastrarProcesso({
            cnj,
            clienteNome,
            clientePolo: clientePolo as 'ATIVO' | 'PASSIVO' | 'TERCEIRO',
            clienteId: getField(row, ['clienteid']) || undefined,
            faseProcessual: normalizeFase(getField(row, ['faseprocessual', 'fase'])) || 'CONHECIMENTO',
            responsavel: getField(row, ['responsavel', 'advogado']) || undefined,
            vara: getField(row, ['vara']) || undefined,
            monitorar: normalizeBoolean(getField(row, ['monitorar'])) ?? true,
            notas: getField(row, ['notas', 'observacoes', 'observações']) || undefined,
          })
          sucesso += 1
        } catch {
          falhas += 1
        }
      }

      await carregar()
      showToast(`Importação concluída: ${sucesso} processo(s) importado(s)${falhas ? ` e ${falhas} falha(s)` : ''}.`)
    } catch {
      showToast('Erro ao importar arquivo de processos.')
    } finally {
      setImportando(false)
    }
  }, [carregar, showToast])

  const processosFiltered = useMemo(() => processos.filter(p => {
    const matchTexto = filtro === '' ||
      p.cnj.includes(filtro) ||
      p.clienteNome.toLowerCase().includes(filtro.toLowerCase()) ||
      (p.responsavel || '').toLowerCase().includes(filtro.toLowerCase())
    const matchPolo = filtroPolo === 'TODOS' || p.clientePolo === filtroPolo
    const matchFase = filtroFase === 'TODAS' || (p.faseProcessual || 'CONHECIMENTO') === filtroFase
    return matchTexto && matchPolo && matchFase
  }), [processos, filtro, filtroPolo, filtroFase])

  const totalAlertas = useMemo(
    () => processos.reduce((acc, p) => acc + (p.alertasNaoLidos || 0), 0),
    [processos]
  )

  const processosMonitorados = useMemo(
    () => processos.filter(p => p.monitorar).length,
    [processos]
  )

  const porPoloAtivo = useMemo(
    () => processos.filter(p => p.clientePolo === 'ATIVO').length,
    [processos]
  )


  return (
    <div className="p-6 space-y-6">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={handleImportarProcessos}
      />

      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(t => (
          <div key={t.id} className="max-w-sm rounded-lg bg-gray-900 px-4 py-3 text-sm text-white shadow-lg">
            {t.message}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meus Processos</h1>
          <p className="mt-1 text-sm text-gray-500">
            Visão central dos processos monitorados e vinculados ao escritório.
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
          {processos.some(p => p.monitorar) && (
            <Button
              variant="secondary"
              onClick={handleMonitorarTodos}
              disabled={monitorando === 'todos'}
            >
              {monitorando === 'todos' ? 'Verificando...' : 'Verificar todos'}
            </Button>
          )}
          <Button variant="primary" onClick={() => { setEditando(undefined); setModalOpen(true) }}>
            + Cadastrar processo
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <Card><CardContent className="py-5 text-center"><p className="text-3xl font-bold text-gray-800">{processos.length}</p><p className="mt-2 text-xs uppercase tracking-wide text-gray-500">Processos</p></CardContent></Card>
        <Card><CardContent className="py-5 text-center"><p className="text-3xl font-bold text-blue-700">{processosMonitorados}</p><p className="mt-2 text-xs uppercase tracking-wide text-gray-500">Monitorados</p></CardContent></Card>
        <Card><CardContent className="py-5 text-center"><p className="text-3xl font-bold text-green-700">{porPoloAtivo}</p><p className="mt-2 text-xs uppercase tracking-wide text-gray-500">Polo ativo</p></CardContent></Card>
      </div>

      <Card>
        <CardContent className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Filtros e importação</h2>
            <p className="mt-1 text-sm text-gray-500">Busque por CNJ, cliente, responsável ou refine por polo e fase. Para importar, use CSV com colunas como cnj, clienteNome, clientePolo e faseProcessual.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <input
              type="text"
              value={filtro}
              onChange={e => setFiltro(e.target.value)}
              placeholder="Buscar por CNJ, cliente ou responsável..."
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={filtroPolo}
              onChange={e => setFiltroPolo(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="TODOS">Todos os polos</option>
              <option value="ATIVO">Ativo (Autor)</option>
              <option value="PASSIVO">Passivo (Réu)</option>
              <option value="TERCEIRO">Terceiro</option>
            </select>
            <select
              value={filtroFase}
              onChange={e => setFiltroFase(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="TODAS">Todas as fases</option>
              <option value="CONHECIMENTO">Conhecimento</option>
              <option value="SENTENCIADO">Sentenciado</option>
              <option value="LIQUIDACAO_EXECUCAO">Liquidação / Execução</option>
              <option value="AGUARDANDO_RPV">Aguardando RPV</option>
              <option value="ARQUIVADO">Arquivado</option>
            </select>
          </div>
          <div className="text-sm text-gray-500">
            Alertas pendentes no escritório: <span className="font-semibold text-red-600">{totalAlertas}</span>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : processosFiltered.length === 0 ? (
        <Empty
          title={processos.length === 0 ? 'Nenhum processo cadastrado' : 'Nenhum resultado'}
          description={
            processos.length === 0
              ? 'Cadastre ou importe os processos do seu escritório para acessá-los rapidamente e monitorar atualizações.'
              : 'Tente ajustar os filtros de busca.'
          }
          action={processos.length === 0 ? {
            label: '+ Cadastrar primeiro processo',
            onClick: () => { setEditando(undefined); setModalOpen(true) },
          } : undefined}
        />
      ) : (
        <Card>
          <CardContent className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Processos cadastrados</h2>
              <p className="mt-1 text-sm text-gray-500">{processosFiltered.length} resultado(s) exibido(s).</p>
            </div>
            <div className="space-y-3">
              {processosFiltered.map(proc => (
                <div
                  key={proc.cnj}
                  className="rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:border-blue-300"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => handleVer(proc)}
                          className="font-mono text-sm font-medium text-blue-600 hover:underline"
                        >
                          {proc.cnj}
                        </button>
                        <Badge variant={POLO_VARIANT[proc.clientePolo]}>
                          {POLO_LABELS[proc.clientePolo]}
                        </Badge>
                        <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-xs text-cyan-700">
                          {FASE_LABELS[proc.faseProcessual || 'CONHECIMENTO']}
                        </span>
                        {proc.monitorar && (
                          <span className="rounded border border-green-200 bg-green-50 px-1.5 py-0.5 text-xs text-green-600">
                            Monitorando
                          </span>
                        )}
                        {(proc.alertasNaoLidos || 0) > 0 && (
                          <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-medium text-white">
                            {proc.alertasNaoLidos} novo(s)
                          </span>
                        )}
                      </div>

                      <div className="flex flex-col text-sm text-gray-600 sm:flex-row sm:gap-6">
                        <span><strong className="text-gray-800">{proc.clienteNome}</strong></span>
                        {proc.processo?.classe && <span>{proc.processo.classe}</span>}
                        {proc.processo?.status && <span className="text-gray-500">{proc.processo.status}</span>}
                      </div>

                      <div className="mt-1 flex flex-wrap gap-4 text-xs text-gray-400">
                        {proc.responsavel && <span>Responsável: {proc.responsavel}</span>}
                        <span>Cadastrado: {formatDate(proc.createdAt)}</span>
                        {proc.ultimaVerificacao && <span>Verificado: {formatDate(proc.ultimaVerificacao)}</span>}
                      </div>

                      {proc.notas && (
                        <p className="mt-1 truncate text-xs italic text-gray-500">{proc.notas}</p>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Button variant="primary" size="sm" onClick={() => handleVer(proc)}>
                        Ver
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleMonitorar(proc.cnj)}
                        disabled={monitorando === proc.cnj}
                      >
                        {monitorando === proc.cnj ? '...' : 'Atualizar'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Vincular cliente"
                        onClick={() => handleVincularCliente(proc)}
                      >
                        Vincular cliente
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setEditando(proc); setModalOpen(true) }}
                      >
                        Editar
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleRemover(proc.cnj, proc.clienteNome)}
                      >
                        Excluir
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <CadastroProcessoModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditando(undefined) }}
        onSuccess={() => { carregar(); showToast(editando ? 'Cadastro atualizado.' : 'Processo cadastrado com sucesso!') }}
        editando={editando}
      />

      <VincularClienteModal
        isOpen={vincularClienteOpen}
        cnj={processoBuscandoCliente?.cnj || ''}
        clienteIdAtual={processoBuscandoCliente?.clienteId}
        onClose={() => { setVincularClienteOpen(false); setProcessoBuscandoCliente(undefined) }}
        onSuccess={() => { carregar(); showToast('Cliente vinculado com sucesso!') }}
      />
    </div>
  )
}




