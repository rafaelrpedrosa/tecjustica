// TODO: migrar para API REST em /api/diligencias
import type { DiligenciaOperacional } from '@/types/diligencia'

const STORAGE_KEY = 'rpatec_diligencias'

function carregar(): DiligenciaOperacional[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as DiligenciaOperacional[]) : []
  } catch {
    return []
  }
}

function persistir(lista: DiligenciaOperacional[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lista))
}

export function listarDiligencias(): DiligenciaOperacional[] {
  return carregar()
}

export function listarDiligenciasPorCNJ(cnj: string): DiligenciaOperacional[] {
  return carregar().filter((d) => d.cnj === cnj)
}

export function salvarDiligencia(diligencia: DiligenciaOperacional): DiligenciaOperacional {
  const lista = carregar()
  lista.push(diligencia)
  persistir(lista)
  return diligencia
}

export function atualizarDiligencia(
  id: string,
  updates: Partial<DiligenciaOperacional>
): void {
  const lista = carregar().map((d) => (d.id === id ? { ...d, ...updates } : d))
  persistir(lista)
}

export function excluirDiligencia(id: string): void {
  persistir(carregar().filter((d) => d.id !== id))
}
