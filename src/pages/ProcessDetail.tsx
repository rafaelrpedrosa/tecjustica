import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Card, { CardContent } from '@/components/common/Card'
import Badge from '@/components/common/Badge'
import Tabs from '@/components/common/Tabs'
import { PageLoading } from '@/components/common/Loading'
import Empty from '@/components/common/Empty'
import Button from '@/components/common/Button'
import { CacheTimestamp } from '@/components/common/CacheTimestamp'
import {
  useProcess,
  useProcessParties,
  useProcessMovements,
  useProcessDocuments,
} from '@/hooks/useProcess'
import { formatDateBR, formatCurrencyBR, formatCPFCNPJ } from '@/utils/format'

function getStatusColor(status: string): 'success' | 'default' | 'warning' | 'info' {
  if (status.toLowerCase().includes('tramitação')) return 'success'
  if (status.toLowerCase().includes('encerrado')) return 'default'
  if (status.toLowerCase().includes('suspenso')) return 'warning'
  return 'info'
}

const ProcessDetail: React.FC = () => {
  const { cnj } = useParams<{ cnj: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('overview')

  const processQuery = useProcess(cnj)
  const partiesQuery = useProcessParties(cnj)
  const movementsQuery = useProcessMovements(cnj)
  const documentsQuery = useProcessDocuments(cnj)

  const loading =
    processQuery.isLoading ||
    partiesQuery.isLoading ||
    movementsQuery.isLoading ||
    documentsQuery.isLoading

  const process = processQuery.data ?? null
  const parties = partiesQuery.data ?? []
  const movements = movementsQuery.data ?? []
  const documents = documentsQuery.data ?? []

  const refetchAll = () => {
    processQuery.refetch()
    partiesQuery.refetch()
    movementsQuery.refetch()
    documentsQuery.refetch()
  }

  if (loading) return <PageLoading />

  if (processQuery.isError || !process) {
    return (
      <div className="flex items-center justify-center py-16">
        <Empty
          title="Processo não encontrado"
          description="Verifique o número do CNJ e tente novamente"
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <Card className="border-l-4 border-l-blue-600 shadow-lg">
        <CardContent className="py-8">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 mb-2 font-serif">
                {process.cnj}
              </h1>
              <p className="text-gray-600 text-lg">
                {process.tribunal} • {process.classe}
              </p>
            </div>
            <Badge variant={getStatusColor(process.status)}>
              {process.status}
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6 pt-6 border-t border-gray-200">
            <div>
              <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold">
                Assunto
              </p>
              <p className="text-gray-900 font-medium mt-2">{process.assunto}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold">
                Valor
              </p>
              <p className="text-gray-900 font-medium mt-2">
                {formatCurrencyBR(process.valor)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold">
                Juiz
              </p>
              <p className="text-gray-900 font-medium mt-2">{process.juiz || '—'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cache Status */}
      <CacheTimestamp
        timestamp={processQuery.dataUpdatedAt ? new Date(processQuery.dataUpdatedAt).toISOString() : null}
        isLoading={loading}
        onRefresh={refetchAll}
        ttlMinutes={24 * 60}
      />

      {/* Tabs Section */}
      <Card>
        <Tabs
          items={[
            { label: 'Visão Geral', value: 'overview', content: null },
            { label: 'Partes', value: 'parties', content: null },
            { label: 'Movimentos', value: 'movements', content: null },
            { label: 'Documentos', value: 'documents', content: null },
          ]}
          defaultValue={activeTab}
          onChange={setActiveTab}
        />

        <CardContent className="pt-6">
          {/* Visão Geral */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-xs text-gray-600 uppercase tracking-wide">Tribunal</p>
                  <p className="text-lg font-semibold text-gray-900 mt-1">{process.tribunal}</p>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-xs text-gray-600 uppercase tracking-wide">Classe</p>
                  <p className="text-lg font-semibold text-gray-900 mt-1">
                    {process.classe?.split(' ')[0]}
                  </p>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-xs text-gray-600 uppercase tracking-wide">Status</p>
                  <p className="text-lg font-semibold text-gray-900 mt-1">{process.status}</p>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-xs text-gray-600 uppercase tracking-wide">Aberto em</p>
                  <p className="text-lg font-semibold text-gray-900 mt-1">
                    {formatDateBR(process.dataAbertura)}
                  </p>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-xs text-gray-600 uppercase tracking-wide">Última movimentação</p>
                  <p className="text-lg font-semibold text-gray-900 mt-1">
                    {movements[0] ? formatDateBR(movements[0].data) : '—'}
                  </p>
                </div>
              </div>

              {process.descricao && (
                <div className="p-6 bg-gray-50 rounded-lg">
                  <h3 className="font-semibold text-gray-900 mb-3">Resumo</h3>
                  <p className="text-gray-700 leading-relaxed">{process.descricao}</p>
                </div>
              )}
            </div>
          )}

          {/* Partes */}
          {activeTab === 'parties' && (
            <>
              {parties.length === 0 ? (
                <Empty title="Nenhuma parte encontrada" />
              ) : (
                <div className="space-y-4">
                  {parties.map((party) => (
                    <div key={party.id} className="p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-semibold text-gray-900">{party.nome}</h4>
                        <Badge variant="info">{party.tipo}</Badge>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600 mt-3">
                        {party.cpfCnpj && (
                          <div>
                            <span className="text-gray-500">CPF/CNPJ: </span>
                            <span className="font-mono">{formatCPFCNPJ(party.cpfCnpj)}</span>
                          </div>
                        )}
                        {party.email && (
                          <div>
                            <span className="text-gray-500">Email: </span>
                            <a href={`mailto:${party.email}`} className="text-blue-600 hover:underline">
                              {party.email}
                            </a>
                          </div>
                        )}
                      </div>
                      {party.lawyers && party.lawyers.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <p className="text-xs text-gray-500 font-semibold uppercase mb-2">Advogados</p>
                          <div className="space-y-2">
                            {party.lawyers.map((lawyer) => (
                              <div key={lawyer.id} className="text-sm text-gray-700 pl-4">
                                <span className="font-medium">{lawyer.nome}</span>
                                {lawyer.oab && <span className="text-gray-500 ml-2">OAB {lawyer.oab}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Movimentos */}
          {activeTab === 'movements' && (
            <>
              {movements.length === 0 ? (
                <Empty title="Nenhuma movimentação encontrada" />
              ) : (
                <div className="space-y-4">
                  {movements.map((movement, idx) => (
                    <div key={movement.id || `movement-${idx}`} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="w-4 h-4 bg-blue-600 rounded-full mt-1.5"></div>
                        {idx < movements.length - 1 && (
                          <div className="w-0.5 h-12 bg-gray-300 my-1"></div>
                        )}
                      </div>
                      <div className="pb-4 flex-1 pt-1">
                        <p className="text-sm text-gray-500 font-medium">
                          {formatDateBR(movement.data)}
                        </p>
                        <p className="text-gray-900 font-medium mt-1">{movement.descricao}</p>
                        {movement.orgao && (
                          <p className="text-sm text-gray-600 mt-1">Órgão: {movement.orgao}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Documentos */}
          {activeTab === 'documents' && (
            <>
              {documents.length === 0 ? (
                <Empty title="Nenhum documento encontrado" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-gray-300">
                        <th className="text-left py-3 px-4 font-semibold text-gray-900">Título</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-900">Tipo</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-900">Data</th>
                        <th className="text-center py-3 px-4 font-semibold text-gray-900">Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {documents.map((doc) => (
                        <tr key={doc.id} className="border-b border-gray-200 hover:bg-gray-50">
                          <td className="py-3 px-4 text-gray-900 font-medium">{doc.titulo}</td>
                          <td className="py-3 px-4 text-gray-600">{doc.tipo}</td>
                          <td className="py-3 px-4 text-gray-600">
                            {formatDateBR(doc.dataCriacao)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() =>
                                navigate(`/document/${doc.id}`, { state: { cnj } })
                              }
                            >
                              Ler
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default ProcessDetail
