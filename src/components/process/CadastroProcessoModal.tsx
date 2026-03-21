import { useState, useEffect } from 'react'
import Button from '@/components/common/Button'
import { cadastrarProcesso, atualizarProcesso } from '@/services/escritorio.service'
import type { CadastroProcessoInput, EscritorioProcesso } from '@/types/escritorio'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  cnjInicial?: string
  editando?: EscritorioProcesso
}

const POLO_OPTIONS = [
  { value: 'ATIVO', label: 'Ativo (Autor / Reclamante)' },
  { value: 'PASSIVO', label: 'Passivo (Réu / Reclamada)' },
  { value: 'TERCEIRO', label: 'Terceiro / Interveniente' },
]

export function CadastroProcessoModal({ isOpen, onClose, onSuccess, cnjInicial, editando }: Props) {
  const [form, setForm] = useState<CadastroProcessoInput>({
    cnj: '',
    clienteNome: '',
    clientePolo: 'ATIVO',
    responsavel: '',
    monitorar: true,
    notas: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (editando) {
      setForm({
        cnj: editando.cnj,
        clienteNome: editando.clienteNome,
        clientePolo: editando.clientePolo,
        responsavel: editando.responsavel || '',
        monitorar: editando.monitorar,
        notas: editando.notas || '',
      })
    } else {
      setForm(prev => ({ ...prev, cnj: cnjInicial || '' }))
    }
    setError(null)
  }, [isOpen, editando, cnjInicial])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!form.cnj.trim()) return setError('Informe o número CNJ do processo.')
    if (!form.clienteNome.trim()) return setError('Informe o nome do cliente.')

    setLoading(true)
    try {
      if (editando) {
        await atualizarProcesso(editando.cnj, {
          clienteNome: form.clienteNome,
          clientePolo: form.clientePolo,
          responsavel: form.responsavel,
          monitorar: form.monitorar,
          notas: form.notas,
        })
      } else {
        await cadastrarProcesso(form)
      }
      onSuccess()
      onClose()
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Erro ao salvar processo.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">
            {editando ? 'Editar Cadastro' : 'Cadastrar Processo no Escritório'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

          {/* CNJ */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Número CNJ <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.cnj}
              onChange={e => setForm(prev => ({ ...prev, cnj: e.target.value }))}
              disabled={!!editando}
              placeholder="0000000-00.0000.0.00.0000"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>

          {/* Nome do cliente */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nome do cliente <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.clienteNome}
              onChange={e => setForm(prev => ({ ...prev, clienteNome: e.target.value }))}
              placeholder="Ex: João da Silva"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Polo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Polo do cliente <span className="text-red-500">*</span>
            </label>
            <select
              value={form.clientePolo}
              onChange={e => setForm(prev => ({ ...prev, clientePolo: e.target.value as any }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {POLO_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Responsável */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Advogado responsável <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <input
              type="text"
              value={form.responsavel || ''}
              onChange={e => setForm(prev => ({ ...prev, responsavel: e.target.value }))}
              placeholder="Ex: Dr. Rafael Pedrosa"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Notas */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notas internas <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <textarea
              value={form.notas || ''}
              onChange={e => setForm(prev => ({ ...prev, notas: e.target.value }))}
              rows={3}
              placeholder="Observações sobre o processo..."
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Monitorar */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setForm(prev => ({ ...prev, monitorar: !prev.monitorar }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.monitorar ? 'bg-blue-600' : 'bg-gray-300'}`}
            >
              <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${form.monitorar ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
            <span className="text-sm text-gray-700">Monitorar automaticamente novos movimentos</span>
          </div>

          {/* Erro */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Ações */}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? 'Salvando...' : editando ? 'Salvar alterações' : 'Cadastrar processo'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
