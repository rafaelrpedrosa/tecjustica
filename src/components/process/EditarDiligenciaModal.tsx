import React, { useState } from 'react'
import Button from '@/components/common/Button'
import { atualizarDiligencia } from '@/services/diligencia.service'
import type {
  DiligenciaOperacional,
  PrioridadeDiligencia,
  StatusDiligencia,
  TipoAcaoDiligencia,
} from '@/types/diligencia'

interface Props {
  diligencia: DiligenciaOperacional
  onClose: () => void
  onSaved: () => void
}

const PRIORIDADE_OPTIONS: { value: PrioridadeDiligencia; label: string }[] = [
  { value: 'URGENTE', label: 'Urgente' },
  { value: 'ALTA', label: 'Alta' },
  { value: 'NORMAL', label: 'Normal' },
  { value: 'MONITORAR', label: 'Monitorar' },
]

const STATUS_OPTIONS: { value: StatusDiligencia; label: string }[] = [
  { value: 'PENDENTE', label: 'Pendente' },
  { value: 'EM_ANDAMENTO', label: 'Em andamento' },
  { value: 'CONCLUIDA', label: 'Concluída' },
  { value: 'SEM_RETORNO', label: 'Sem retorno' },
]

const ACAO_OPTIONS: { value: TipoAcaoDiligencia; label: string }[] = [
  { value: 'LIGACAO_SECRETARIA', label: 'Ligação para secretaria' },
  { value: 'LIGACAO_GABINETE', label: 'Ligação para gabinete' },
  { value: 'EMAIL_VARA', label: 'E-mail para vara' },
  { value: 'RECHECK', label: 'Revisar depois' },
]

export const EditarDiligenciaModal: React.FC<Props> = ({ diligencia, onClose, onSaved }) => {
  const [form, setForm] = useState({
    descricao: diligencia.descricao,
    prioridade: diligencia.prioridade,
    acaoRecomendada: diligencia.acaoRecomendada,
    status: diligencia.status,
    responsavel: diligencia.responsavel ?? '',
    dataPrevista: diligencia.dataPrevista ?? '',
    retorno: diligencia.retorno ?? '',
    proximaAcao: diligencia.proximaAcao ?? '',
    proximaData: diligencia.proximaData ?? '',
  })
  const [saving, setSaving] = useState(false)

  async function handleSalvar() {
    setSaving(true)
    try {
      await atualizarDiligencia(diligencia.id, {
        descricao: form.descricao,
        prioridade: form.prioridade,
        acaoRecomendada: form.acaoRecomendada,
        status: form.status,
        responsavel: form.responsavel || undefined,
        dataPrevista: form.dataPrevista || undefined,
        retorno: form.retorno || undefined,
        proximaAcao: form.proximaAcao || undefined,
        proximaData: form.proximaData || undefined,
        dataExecucao: form.status === 'CONCLUIDA' ? (diligencia.dataExecucao || new Date().toISOString()) : undefined,
      })
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="mx-4 w-full max-w-2xl rounded-lg bg-white shadow-xl">
        <div className="border-b border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900">Editar diligência</h3>
          <p className="mt-1 text-sm text-gray-500">{diligencia.cnj}</p>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">
              Descrição
            </label>
            <textarea
              value={form.descricao}
              onChange={(e) => setForm(prev => ({ ...prev, descricao: e.target.value }))}
              rows={3}
              className="w-full resize-none rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">
              Prioridade
            </label>
            <select
              value={form.prioridade}
              onChange={(e) => setForm(prev => ({ ...prev, prioridade: e.target.value as PrioridadeDiligencia }))}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {PRIORIDADE_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">
              Status
            </label>
            <select
              value={form.status}
              onChange={(e) => setForm(prev => ({ ...prev, status: e.target.value as StatusDiligencia }))}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {STATUS_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">
              Ação recomendada
            </label>
            <select
              value={form.acaoRecomendada}
              onChange={(e) => setForm(prev => ({ ...prev, acaoRecomendada: e.target.value as TipoAcaoDiligencia }))}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {ACAO_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">
              Responsável
            </label>
            <input
              type="text"
              value={form.responsavel}
              onChange={(e) => setForm(prev => ({ ...prev, responsavel: e.target.value }))}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">
              Data prevista
            </label>
            <input
              type="date"
              value={form.dataPrevista}
              onChange={(e) => setForm(prev => ({ ...prev, dataPrevista: e.target.value }))}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">
              Retorno
            </label>
            <textarea
              value={form.retorno}
              onChange={(e) => setForm(prev => ({ ...prev, retorno: e.target.value }))}
              rows={3}
              className="w-full resize-none rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">
              Próxima ação
            </label>
            <input
              type="text"
              value={form.proximaAcao}
              onChange={(e) => setForm(prev => ({ ...prev, proximaAcao: e.target.value }))}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">
              Próxima data
            </label>
            <input
              type="date"
              value={form.proximaData}
              onChange={(e) => setForm(prev => ({ ...prev, proximaData: e.target.value }))}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 p-5">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button variant="primary" onClick={handleSalvar} disabled={saving}>{saving ? 'Salvando...' : 'Salvar alterações'}</Button>
        </div>
      </div>
    </div>
  )
}
