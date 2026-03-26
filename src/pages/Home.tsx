import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Card, { CardContent, CardHeader } from '@/components/common/Card'
import Button from '@/components/common/Button'
import { ErrorAlert } from '@/components/common/ErrorAlert'

const CNJ_REGEX = /^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/

/** Aplica a máscara NNNNNNN-DD.AAAA.J.TR.OOOO nos dígitos fornecidos */
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
      setError('Digite um número CNJ válido')
      return
    }

    if (!validateCNJ(cnj)) {
      setError('Formato CNJ inválido. Use: NNNNNNN-DD.AAAA.J.TR.OOOO')
      return
    }

    navigate(`/process/${cnj}`)
  }

  return (
    <div className="space-y-8">
      {/* Seção de Busca */}
      <Card>
        <CardHeader>
          <h2 className="text-xl font-bold text-gray-900">Buscar Processo</h2>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="space-y-4">
            <div>
              <label htmlFor="cnj" className="block text-sm font-medium text-gray-700 mb-2">
                Número CNJ
              </label>
              <input
                id="cnj"
                type="text"
                value={cnj}
                onChange={(e) => setCnj(formatCNJ(e.target.value))}
                placeholder="Ex: 0000061-33.2026.5.06.0008"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Formato: NNNNNNN-DD.AAAA.J.TR.OOOO
              </p>
            </div>

            <ErrorAlert message={error} />

            <div className="flex gap-3">
              <Button
                type="submit"
                className="flex items-center gap-2"
              >
                🔍 Buscar Processo
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Seção de Atalhos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardContent className="text-center py-8">
            <div className="text-4xl mb-4">👤</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Buscar por CPF/CNPJ</h3>
            <p className="text-gray-600 text-sm mb-4">
              Encontre todos os processos de uma pessoa ou empresa
            </p>
            <Button
              variant="secondary"
              onClick={() => navigate('/search-cpf')}
              className="w-full"
            >
              Buscar por CPF/CNPJ
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="text-center py-8">
            <div className="text-4xl mb-4">⚖️</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Buscar Precedentes</h3>
            <p className="text-gray-600 text-sm mb-4">
              Pesquise jurisprudência e precedentes do TJCE
            </p>
            <Button
              variant="secondary"
              onClick={() => navigate('/precedents')}
              className="w-full"
            >
              Buscar Precedentes
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Seção de Informações */}
      <Card>
        <CardContent className="py-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Sobre o JusFlow</h3>
          <div className="text-gray-600 text-sm space-y-2">
            <div>
              JusFlow é um sistema integrado para consulta e análise de processos judiciais brasileiros,
              utilizando dados do Banco Nacional de Processos (PDPJ) do CNJ.
            </div>
            <div className="mt-4">
              <strong>Funcionalidades:</strong>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Busca de processos por número CNJ</li>
                <li>Pesquisa por CPF/CNPJ das partes</li>
                <li>Acesso a movimentações processuais</li>
                <li>Visualização de documentos</li>
                <li>Busca de precedentes jurídicos</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default Home
