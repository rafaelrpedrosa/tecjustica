import { apiClient } from './api'
import axios from 'axios'

export interface ChatwootTestInput {
  nome: string
  whatsapp: string
  mensagem: string
}

export async function enviarMensagemTesteChatwoot(input: ChatwootTestInput): Promise<{ success: true }> {
  try {
    const { data } = await apiClient.post<{ success: true }>('/api/chatwoot/test', input)
    return data
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const details = error.response?.data?.details || error.response?.data?.error
      throw new Error(details || 'Erro ao enviar mensagem teste pelo Chatwoot')
    }
    throw error
  }
}
