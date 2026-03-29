import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import Card, { CardContent } from '@/components/common/Card'
import Button from '@/components/common/Button'
import Empty from '@/components/common/Empty'
import { listarDiligencias } from '@/services/diligencia.service'
import type { DiligenciaOperacional, PrioridadeDiligencia } from '@/types/diligencia'

const PRIORIDADE_ORDER: Record<PrioridadeDiligencia, number> = {
  URGENTE: 0, ALTA: 1, NORMAL: 2, MONITORAR: 3,
}

function calcularMetricas(lista: DiligenciaOperacional[]) {
  const hoje = new Date().toISOString().slice(0, 10)
  const urgentes = lista.filter(d => d.prioridade === 'URGENTE' && d.status !== 'CONCLUIDA').length
  const pendentes = lista.filter(d => d.status === 'PENDENTE').length
  const emAndamento = lista.filter(d => d.status === 'EM_ANDAMENTO').length
  const concluidas = lista.filter(d => d.status === 'CONCLUIDA').length
  const ativos = lista.filter(d => d.status !== 'CONCLUIDA')
  const mediaDias = ativos.length ? Math.round(ativos.reduce((acc, d) => acc + d.diasParado, 0) / ativos.length) : 0
  const acaoHoje = lista.filter(d => d.proximaData === hoje && d.status !== 'CONCLUIDA').length
  return { urgentes, pendentes, emAndamento, concluidas, mediaDias, acaoHoje }
}

const DashboardOperacional: React.FC = () => {
  const navigate = useNavigate()
  const [lista, setLista] = useState<DiligenciaOperacional[]>([])

  useEffect(() => {
    listarDiligencias().then(setLista)
  }, [])

  const recarregar = useCallback(async () => {
    const data = await listarDiligencias()
    setLista(data)
  }, [])

  const m = calcularMetricas(lista)

  const top5 = [...lista]
    .filter(d => d.status !== 'CONCLUIDA')
    .sort((a, b) => {
      const pa = PRIORIDADE_ORDER[a.prioridade]
      const pb = PRIORIDADE_ORDER[b.prioridade]
      if (pa !== pb) return pa - pb
      return b.diasParado - a.diasParado
    })
    .slice(0, 5)

  const PRIORIDADE_ICON: Record<string, string> = {
    URGENTE: 'Critico',
    ALTA: 'Alta',
    NORMAL: 'Normal',
    MONITORAR: 'Monitorar',
  }

  const ACAO_LABEL: Record<string, string> = {
    LIGACAO_SECRETARIA: 'Ligacao Secretaria',
    LIGACAO_GABINETE: 'Ligacao Gabinete',
    EMAIL_VARA: 'Email',
    RECHECK: 'Revisar',
  }

  const proximaSemana = useMemo(() => {
    const hoje = new Date().toISOString().slice(0, 10)
    const limite = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const itens = lista.filter(
      (d) => d.proximaData && d.proximaData >= hoje && d.proximaData <= limite && d.status !== 'CONCLUIDA'
    ).sort((a, b) => (a.proximaData ?? '').localeCompare(b.proximaData ?? ''))
    const porData: Record<string, DiligenciaOperacional[]> = {}
    for (const d of itens) {
      const key = d.proximaData!
      if (!porData[key]) porData[key] = []
      porData[key].push(d)
    }
    return porData
  }, [lista])

  function formatarDataBR(iso: string): string {
    const [, m, d] = iso.split('-')
    const hoje = new Date().toISOString().slice(0, 10)
    const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    if (iso === hoje) return `Hoje (${d}/${m})`
    if (iso === amanha) return `Amanha (${d}/${m})`
    const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']
    const diaSemana = diasSemana[new Date(`${iso}T12:00:00`).getDay()]
    return `${diaSemana} ${d}/${m}`
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard operacional</h1>
          <p className="text-sm text-gray-500 mt-1">Visao geral das diligencias abertas e prioridades do escritorio.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={recarregar}>Atualizar</Button>
          <Button variant="primary" onClick={() => navigate('/diligencias')}>Ver fila completa</Button>
        </div>
      </div>

      {lista.length === 0 ? (
        <Empty
          title="Nenhuma diligencia registrada"
          description="Abra um processo com gargalo detectado e gere a primeira diligencia para iniciar o acompanhamento operacional."
          action={{ label: 'Ver meus processos', onClick: () => navigate('/meus-processos') }}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Card><CardContent className="py-5 text-center"><p className="text-4xl font-bold text-red-600">{m.urgentes}</p><p className="text-xs text-gray-500 uppercase tracking-wide mt-2">Urgentes</p></CardContent></Card>
            <Card><CardContent className="py-5 text-center"><p className="text-4xl font-bold text-yellow-600">{m.pendentes}</p><p className="text-xs text-gray-500 uppercase tracking-wide mt-2">Pendentes</p></CardContent></Card>
            <Card><CardContent className="py-5 text-center"><p className="text-4xl font-bold text-blue-600">{m.emAndamento}</p><p className="text-xs text-gray-500 uppercase tracking-wide mt-2">Em andamento</p></CardContent></Card>
            <Card><CardContent className="py-5 text-center"><p className="text-4xl font-bold text-green-600">{m.concluidas}</p><p className="text-xs text-gray-500 uppercase tracking-wide mt-2">Concluidas</p></CardContent></Card>
            <Card><CardContent className="py-5 text-center"><p className="text-4xl font-bold text-gray-700">{m.mediaDias}d</p><p className="text-xs text-gray-500 uppercase tracking-wide mt-2">Media parada</p></CardContent></Card>
            <Card><CardContent className="py-5 text-center"><p className="text-4xl font-bold text-purple-600">{m.acaoHoje}</p><p className="text-xs text-gray-500 uppercase tracking-wide mt-2">Acao hoje</p></CardContent></Card>
          </div>

          <Card>
            <CardContent className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Proximos 7 dias</h2>
                <p className="text-sm text-gray-500 mt-1">Agenda operacional prevista para a proxima semana.</p>
              </div>
              {Object.keys(proximaSemana).length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">Nenhuma acao programada para os proximos 7 dias.</p>
              ) : (
                <div className="space-y-4">
                  {Object.entries(proximaSemana).map(([data, itens]) => (
                    <div key={data}>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                        {formatarDataBR(data)}
                        <span className="ml-1 text-gray-400 font-normal normal-case">({itens.length})</span>
                      </p>
                      <div className="space-y-1">
                        {itens.map((d) => (
                          <div key={d.id} className="flex items-center justify-between px-3 py-2 rounded bg-gray-50 hover:bg-gray-100 cursor-pointer text-sm" onClick={() => navigate(`/process/${d.cnj}`)}>
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-xs font-semibold text-gray-500">{PRIORIDADE_ICON[d.prioridade]}</span>
                              <span className="truncate text-gray-800 font-medium">{d.clienteNome ?? d.cnj}</span>
                              <span className="text-gray-400 text-xs shrink-0">{ACAO_LABEL[d.acaoRecomendada]}</span>
                            </div>
                            <span className={`shrink-0 text-xs font-semibold ${d.prioridade === 'URGENTE' ? 'text-red-600' : d.prioridade === 'ALTA' ? 'text-yellow-600' : 'text-gray-500'}`}>{d.diasParado}d</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Top 5 mais urgentes</h2>
                <p className="text-sm text-gray-500 mt-1">Prioridades para acao imediata da equipe.</p>
              </div>
              {top5.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-6">Nenhuma diligencia ativa. Otimo trabalho.</p>
              ) : (
                <div className="space-y-2">
                  {top5.map((d) => (
                    <div key={d.id} className={`flex items-center justify-between p-3 rounded-lg border-l-4 cursor-pointer hover:opacity-90 ${d.prioridade === 'URGENTE' ? 'bg-red-50 border-l-red-500' : d.prioridade === 'ALTA' ? 'bg-yellow-50 border-l-yellow-400' : 'bg-gray-50 border-l-gray-300'}`} onClick={() => navigate(`/process/${d.cnj}`)}>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold text-gray-500">{PRIORIDADE_ICON[d.prioridade]}</span>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{d.clienteNome ?? d.cnj}</p>
                          <p className="text-xs text-gray-500">{ACAO_LABEL[d.acaoRecomendada]}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-lg font-bold ${d.prioridade === 'URGENTE' ? 'text-red-600' : 'text-yellow-600'}`}>{d.diasParado}d</p>
                        {d.retorno && <p className="text-xs text-gray-400 italic max-w-40 truncate">{d.retorno}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

export default DashboardOperacional
