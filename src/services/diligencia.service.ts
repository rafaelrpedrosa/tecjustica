// src/services/diligencia.service.ts
// Migrado para API REST em /api/diligencias em 2026-03-25

import { apiClient } from '@/services/api'
import type { DiligenciaOperacional } from '@/types/diligencia'

const STORAGE_KEY = 'rpatec_diligencias'
const MIGRATION_FLAG = 'rpatec_diligencias_migrated'

function getLocal(): DiligenciaOperacional[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as DiligenciaOperacional[]) : []
  } catch {
    return []
  }
}

async function migrateLocalIfNeeded(): Promise<void> {
  if (localStorage.getItem(MIGRATION_FLAG)) return
  const local = getLocal()
  if (local.length === 0) {
    localStorage.setItem(MIGRATION_FLAG, '1')
    return
  }
  try {
    await apiClient.post('/api/diligencias', local)
    localStorage.removeItem(STORAGE_KEY)
    localStorage.setItem(MIGRATION_FLAG, '1')
    console.info(`[diligencias] Migrados ${local.length} registros do localStorage para a API.`)
  } catch (err) {
    console.warn('[diligencias] Falha ao migrar localStorage — será tentado novamente.', err)
  }
}

export async function listarDiligencias(): Promise<DiligenciaOperacional[]> {
  try {
    const res = await apiClient.get<DiligenciaOperacional[]>('/api/diligencias')
    await migrateLocalIfNeeded()
    return res.data
  } catch {
    return getLocal()
  }
}

export async function listarDiligenciasPorCNJ(cnj: string): Promise<DiligenciaOperacional[]> {
  try {
    const res = await apiClient.get<DiligenciaOperacional[]>(
      `/api/diligencias/cnj/${encodeURIComponent(cnj)}`
    )
    return res.data
  } catch {
    return getLocal().filter((d) => d.cnj === cnj)
  }
}

export async function salvarDiligencia(
  diligencia: DiligenciaOperacional
): Promise<DiligenciaOperacional> {
  try {
    const res = await apiClient.post<DiligenciaOperacional>('/api/diligencias', diligencia)
    return res.data
  } catch {
    const lista = getLocal()
    lista.push(diligencia)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lista))
    return diligencia
  }
}

export async function atualizarDiligencia(
  id: string,
  updates: Partial<DiligenciaOperacional>
): Promise<void> {
  try {
    await apiClient.put(`/api/diligencias/${id}`, updates)
  } catch {
    const lista = getLocal().map((d) => (d.id === id ? { ...d, ...updates } : d))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lista))
  }
}

export async function excluirDiligencia(id: string): Promise<void> {
  try {
    await apiClient.delete(`/api/diligencias/${id}`)
  } catch {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(getLocal().filter((d) => d.id !== id))
    )
  }
}
