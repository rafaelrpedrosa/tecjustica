import { useState, useEffect } from 'react'
import Button from '@/components/common/Button'
import { atualizarProcesso, verificarCadastro } from '@/services/escritorio.service'
import type { FaseProcessual, EscritorioProcesso } from '@/types/escritorio'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  processo: EscritorioProcesso | null
  faseAtual?: string | null
}

const FASE_OPTIONS: { value: FaseProcessual; label: string }[] = [
  { value: 'CONHECIMENTO', label: 'Conhecimento' },
  { value: 'SENTENCIADO', label: 'Sentenciado' },
  { value: 'LIQUIDACAO_EXECUCAO', label: 'Liquidação / Execução' },
  { value: 'AGUARDANDO_RPV', label: 'Aguardando RPV' },
  { value: 'ARQUIVADO', label: 'Arquivado' },
]

// Mapear fases de entrada (ex: "Sentenciado") para valores internos (ex: "SENTENCIADO")
const FASE_MAPPING: Record<string, FaseProcessual> = {
  'Conhecimento': 'CONHECIMENTO',
  'Sentenciado': 'SENTENCIADO',
  'Liquidação / Execução': 'LIQUIDACAO_EXECUCAO',
  'Aguardando RPV': 'AGUARDANDO_RPV',
  'Arquivado': 'ARQUIVADO',
}

export function EditarFaseModal({ isOpen, onClose, onSuccess, processo, faseAtual }: Props) {
  const [fase, setFase] = useState<FaseProcessual | undefined>()
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen && processo) {
      let faseDetectada: FaseProcessual | undefined

      // Prioridade 1: usar faseAtual passada como prop
      if (faseAtual) {
        faseDetectada = FASE_MAPPING[faseAtual] || (faseAtual as FaseProcessual)
      }
      // Prioridade 2: usar faseProcessual do processo
      else if (processo.faseProcessual) {
        const faseStr = String(processo.faseProcessual)
        faseDetectada = FASE_MAPPING[faseStr] || (faseStr as FaseProcessual)
      }

      setFase(faseDetectada)
      setErro(null)
    }
  }, [isOpen, processo, faseAtual])

  const handleSalvar = async () => {
    if (!processo || !fase) return

    setSalvando(true)
    setErro(null)

    try {
      await atualizarProcesso(processo.cnj, { faseProcessual: fase })
      onSuccess()
      onClose()
    } catch {
      setErro('Erro ao atualizar a fase do processo.')
    } finally {
      setSalvando(false)
    }
  }

  if (!isOpen || !processo) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
        <h2 className="text-xl font-semibold text-gray-900">Editar Fase do Processo</h2>
        <p className="mt-1 text-sm text-gray-600">{processo.cnj}</p>

        <div className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Fase processual</label>
            <select
              value={fase || ''}
              onChange={e => setFase(e.target.value as FaseProcessual)}
              className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Selecione a fase...</option>
              {FASE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {erro && (
            <div className="rounded-md bg-red-50 p-3">
              <p className="text-sm text-red-800">{erro}</p>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSalvar}
            disabled={!fase || salvando}
          >
            {salvando ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </div>
    </div>
  )
}
