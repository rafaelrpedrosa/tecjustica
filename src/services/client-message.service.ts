import { apiClient } from './api'
import axios from 'axios'
import type {
  ClientMessageApproval,
  CreateDocumentDraftInput,
  CreateMovementDraftInput,
} from '@/types/client-message'

export async function listPendingClientMessages(cnj: string): Promise<ClientMessageApproval[]> {
  const { data } = await apiClient.get<ClientMessageApproval[]>(
    `/api/client-messages/pending/${encodeURIComponent(cnj)}`
  )
  return data
}

export async function createMovementDraft(
  input: CreateMovementDraftInput
): Promise<ClientMessageApproval> {
  try {
    const { data } = await apiClient.post<ClientMessageApproval>('/api/client-messages/draft/movement', input)
    return data
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.details || error.response?.data?.error || 'Erro ao preparar mensagem da movimentacao.')
    }
    throw error
  }
}

export async function createDocumentDraft(
  input: CreateDocumentDraftInput
): Promise<ClientMessageApproval> {
  try {
    const { data } = await apiClient.post<ClientMessageApproval>('/api/client-messages/draft/document', input)
    return data
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.details || error.response?.data?.error || 'Erro ao preparar mensagem do documento.')
    }
    throw error
  }
}

export async function approveAndSendClientMessage(
  id: string,
  draftMessage: string
): Promise<{ success: true }> {
  try {
    const { data } = await apiClient.post<{ success: true }>(
      `/api/client-messages/${encodeURIComponent(id)}/approve-send`,
      { draftMessage }
    )
    return data
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.details || error.response?.data?.error || 'Erro ao enviar mensagem ao cliente.')
    }
    throw error
  }
}

export async function rejectClientMessage(id: string): Promise<{ success: true }> {
  const { data } = await apiClient.post<{ success: true }>(
    `/api/client-messages/${encodeURIComponent(id)}/reject`
  )
  return data
}
