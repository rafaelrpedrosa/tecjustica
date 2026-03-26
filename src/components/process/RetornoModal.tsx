import React, { useState } from 'react'
import Button from '@/components/common/Button'
import type { DiligenciaOperacional, StatusDiligencia } from '@/types/diligencia'
import { atualizarDiligencia } from '@/services/diligencia.service'

interface Props {
  diligencia: DiligenciaOperacional
  onClose: () => void
  onSaved: () => void
}

const STATUS_OPTIONS: { value: StatusDiligencia; label: string }[] = [
  { value: 'PENDENTE', label: 'Pendente' },
  { value: 'EM_ANDAMENTO', label: 'Em andamento' },
  { value: 'CONCLUIDA', label: 'Concluída' },
  { value: 'SEM_RETORNO', label: 'Sem retorno' },
]

export const RetornoModal: React.FC<Props> = ({ diligencia, onClose, onSaved }) => {
  const [status, setStatus] = useState<StatusDiligencia>(diligencia.status)
  const [retorno, setRetorno] = useState(diligencia.retorno ?? '')
  const [proximaAcao, setProximaAcao] = useState(diligencia.proximaAcao ?? '')
  const [proximaData, setProximaData] = useState(diligencia.proximaData ?? '')
  const [responsavel, setResponsavel] = useState(diligencia.responsavel ?? '')

  function handleSalvar() {
    atualizarDiligencia(diligencia.id, {
      status,
      retorno: retorno || undefined,
      proximaAcao: proximaAcao || undefined,
      proximaData: proximaData || undefined,
      responsavel: responsavel || undefined,
      dataExecucao: status === 'CONCLUIDA' ? new Date().toISOString() : diligencia.dataExecucao,
    })
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="p-5 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Registrar Retorno</h3>
          <p className="text-sm text-gray-500 mt-1">{diligencia.cnj}</p>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusDiligencia)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
              Retorno da vara
            </label>
            <textarea
              value={retorno}
              onChange={(e) => setRetorno(e.target.value)}
              rows={3}
              placeholder='Ex: "Secretaria informou que está no gabinete"'
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
              Próxima ação
            </label>
            <input
              type="text"
              value={proximaAcao}
              onChange={(e) => setProximaAcao(e.target.value)}
              placeholder="Ex: Ligar novamente em 7 dias"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
              Data prevista
            </label>
            <input
              type="date"
              value={proximaData}
              onChange={(e) => setProximaData(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Responsável</label>
            <input
              type="text"
              value={responsavel}
              onChange={(e) => setResponsavel(e.target.value)}
              placeholder="Nome do responsável"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="p-5 border-t border-gray-200 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={handleSalvar}>Salvar</Button>
        </div>
      </div>
    </div>
  )
}
