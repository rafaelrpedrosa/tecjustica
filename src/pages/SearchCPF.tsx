import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Card, { CardContent } from '@/components/common/Card'
import Button from '@/components/common/Button'
import Badge from '@/components/common/Badge'
import { ErrorAlert } from '@/components/common/ErrorAlert'
import Empty from '@/components/common/Empty'
import { searchByCPFCNPJ } from '@/services/process.service'

interface ProcessoMCP {
  numero_processo?: string
  cnj?: string
  id?: string
  tribunal?: string
  classe?: string
  status?: string
}

interface SearchState {
  query: string
  results: ProcessoMCP[]
  loading: boolean
  error: string | null
  searched: boolean
}

const SearchCPF: React.FC = () => {
  const navigate = useNavigate()
  const [state, setState] = useState<SearchState>({ query: '', results: [], loading: false, error: null, searched: false })

  const formatInput = (value: string): string => {
    const digits = value.replace(/\D/g, '')
    if (digits.length <= 11) {
      return digits.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
    }
    return digits.replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2')
  }

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    const digits = state.query.replace(/\D/g, '')
    if (!digits) return setState((s) => ({ ...s, error: 'Digite um CPF ou CNPJ' }))
    if (digits.length !== 11 && digits.length !== 14) return setState((s) => ({ ...s, error: 'CPF deve ter 11 digitos ou CNPJ deve ter 14 digitos' }))

    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const data = await searchByCPFCNPJ(digits)
      if (!data) {
        setState((s) => ({ ...s, results: [], loading: false, searched: true, error: 'Nao foi possivel conectar ao servidor. Verifique se o backend esta rodando.' }))
        return
      }
      if (data.mcpError) {
        const msg = data.mcpError.toLowerCase()
        const isNotFound = msg.includes('nao encontrado') || msg.includes('não encontrado') || msg.includes('http 404')
        setState((s) => ({ ...s, results: [], loading: false, searched: true, error: isNotFound ? 'Nenhum processo encontrado para este CPF/CNPJ.' : 'Servico temporariamente indisponivel. Tente novamente em instantes.' }))
        return
      }
      const processes = Array.isArray(data) ? data : data.processos || data.nodes || []
      setState((s) => ({ ...s, results: processes, loading: false, searched: true, error: null }))
    } catch (err) {
      setState((s) => ({ ...s, error: 'Erro ao buscar processos. Verifique sua conexao e tente novamente.', loading: false }))
      console.error(err)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Buscar por CPF/CNPJ</h1>
        <p className="text-sm text-gray-500 mt-1">Encontre processos vinculados a uma pessoa fisica ou juridica.</p>
      </div>
      <Card>
        <CardContent className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Pesquisa</h2>
            <p className="text-sm text-gray-500 mt-1">Consulte a base processual pelo documento da parte.</p>
          </div>
          <form onSubmit={handleSearch} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">CPF ou CNPJ</label>
              <input type="text" value={state.query} onChange={(e) => setState((s) => ({ ...s, query: formatInput(e.target.value), error: null }))} placeholder="Ex: 123.456.789-10 ou 12.345.678/0001-90" maxLength={18} disabled={state.loading} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono disabled:bg-gray-100" />
              <ErrorAlert message={state.error} />
            </div>
            <div className="flex gap-3">
              <Button type="submit" disabled={state.loading}>{state.loading ? 'Buscando...' : 'Buscar processos'}</Button>
              {state.searched && <Button type="button" variant="secondary" onClick={() => setState({ query: '', results: [], loading: false, error: null, searched: false })}>Limpar</Button>}
            </div>
          </form>
        </CardContent>
      </Card>
      {state.searched && (state.results.length === 0 ? <Empty title="Nenhum processo encontrado" description="Verifique o CPF/CNPJ e tente novamente." /> : <Card><CardContent className="space-y-4"><div><h2 className="text-lg font-semibold text-gray-900">Resultados</h2><p className="text-sm text-gray-500 mt-1">{state.results.length} processo(s) encontrado(s).</p></div><div className="space-y-3">{state.results.map((proc, idx) => { const cnj = proc.numero_processo || proc.cnj || proc.id; return <div key={cnj || idx} className="bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors"><div className="flex items-center justify-between gap-4"><div className="flex-1 min-w-0"><p className="font-mono text-sm font-semibold text-gray-900">{cnj}</p><p className="text-sm text-gray-600 mt-1">{proc.tribunal && <span className="mr-3">{proc.tribunal}</span>}{proc.classe && <span className="mr-3">{proc.classe}</span>}</p></div><div className="flex items-center gap-3">{proc.status && <Badge variant="info">{proc.status}</Badge>}{cnj && <Button variant="secondary" size="sm" onClick={() => navigate(`/process/${cnj}`)}>Ver processo</Button>}</div></div></div> })}</div></CardContent></Card>)}
    </div>
  )
}

export default SearchCPF
