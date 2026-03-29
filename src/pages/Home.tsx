import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Card, { CardContent } from '@/components/common/Card'
import Button from '@/components/common/Button'
import { ErrorAlert } from '@/components/common/ErrorAlert'

const CNJ_REGEX = /^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/

function formatCNJ(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 20)
  let result = ''
  for (let i = 0; i < digits.length; i++) {
    if (i === 7) result += '-'
    else if (i === 9) result += '.'
    else if (i === 13) result += '.'
    else if (i === 14) result += '.'
    else if (i === 16) result += '.'
    result += digits[i]
  }
  return result
}

function validateCNJ(value: string): boolean {
  return CNJ_REGEX.test(value)
}

const Home: React.FC = () => {
  const navigate = useNavigate()
  const [cnj, setCnj] = useState('')
  const [error, setError] = useState('')

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!cnj.trim()) {
      setError('Digite um numero CNJ valido')
      return
    }

    if (!validateCNJ(cnj)) {
      setError('Formato CNJ invalido. Use: NNNNNNN-DD.AAAA.J.TR.OOOO')
      return
    }

    navigate(`/process/${cnj}`)
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">JusFlow</h1>
          <p className="text-sm text-gray-500 mt-1">
            Pesquisa processual, operacao do escritorio e acompanhamento inteligente em um so lugar.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="py-5 text-center"><p className="text-3xl font-bold text-blue-700">CNJ</p><p className="text-xs text-gray-500 uppercase tracking-wide mt-2">Busca direta</p></CardContent></Card>
        <Card><CardContent className="py-5 text-center"><p className="text-3xl font-bold text-cyan-700">CPF</p><p className="text-xs text-gray-500 uppercase tracking-wide mt-2">Partes</p></CardContent></Card>
        <Card><CardContent className="py-5 text-center"><p className="text-3xl font-bold text-green-700">Docs</p><p className="text-xs text-gray-500 uppercase tracking-wide mt-2">Processuais</p></CardContent></Card>
        <Card><CardContent className="py-5 text-center"><p className="text-3xl font-bold text-amber-700">IA</p><p className="text-xs text-gray-500 uppercase tracking-wide mt-2">Apoio juridico</p></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-2">
          <CardContent className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Buscar processo</h2>
              <p className="text-sm text-gray-500 mt-1">Pesquise um processo pelo numero CNJ completo.</p>
            </div>
            <form onSubmit={handleSearch} className="space-y-4">
              <div>
                <label htmlFor="cnj" className="block text-sm font-medium text-gray-700 mb-2">
                  Numero CNJ
                </label>
                <input
                  id="cnj"
                  type="text"
                  value={cnj}
                  onChange={(e) => setCnj(formatCNJ(e.target.value))}
                  placeholder="Ex: 0000061-33.2026.5.06.0008"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">Formato: NNNNNNN-DD.AAAA.J.TR.OOOO</p>
              </div>
              <ErrorAlert message={error} />
              <Button type="submit">Buscar processo</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Atalhos</h2>
              <p className="text-sm text-gray-500 mt-1">Acesse rapidamente os fluxos mais usados.</p>
            </div>
            <Button variant="secondary" onClick={() => navigate('/search-cpf')} className="w-full justify-start">
              Buscar por CPF/CNPJ
            </Button>
            <Button variant="secondary" onClick={() => navigate('/precedents')} className="w-full justify-start">
              Buscar precedentes
            </Button>
            <Button variant="secondary" onClick={() => navigate('/meus-processos')} className="w-full justify-start">
              Ver meus processos
            </Button>
            <Button variant="secondary" onClick={() => navigate('/financeiro')} className="w-full justify-start">
              Abrir financeiro
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Sobre o sistema</h2>
            <p className="text-sm text-gray-500 mt-1">Base processual, gestao operacional e comunicacao com cliente em uma interface unica.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              Busca de processos por CNJ, CPF/CNPJ, documentos e precedentes juridicos.
            </div>
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              Operacao do escritorio com monitoramento, diligencias, clientes, dashboards e financeiro.
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default Home
