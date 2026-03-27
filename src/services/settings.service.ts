import { apiClient } from './api'

export interface AppSettings {
  anthropicToken?: string
  openaiToken?: string
  geminiToken?: string
  chatwootBaseUrl?: string
  chatwootAccountId?: string
  chatwootInboxId?: string
  chatwootApiToken?: string
  chatwootEnabled?: string
  chatwootMovementTypes?: string
}

/**
 * Salva tokens de LLM nas configurações
 */
export async function saveTokens(settings: AppSettings): Promise<void> {
  const keys = [
    'anthropicToken',
    'openaiToken',
    'geminiToken',
    'chatwootBaseUrl',
    'chatwootAccountId',
    'chatwootInboxId',
    'chatwootApiToken',
    'chatwootEnabled',
    'chatwootMovementTypes',
  ] as const

  for (const key of keys) {
    const value = settings[key]
    if (value?.trim()) {
      await apiClient.post('/api/settings', {
        key,
        value: value.trim()
      })
    } else {
      await apiClient.delete(`/api/settings/${key}`)
    }
  }
}

/**
 * Obtém um token específico por chave
 */
export async function getToken(
  key:
    | 'anthropicToken'
    | 'openaiToken'
    | 'geminiToken'
    | 'chatwootBaseUrl'
    | 'chatwootAccountId'
    | 'chatwootInboxId'
    | 'chatwootApiToken'
    | 'chatwootEnabled'
    | 'chatwootMovementTypes'
): Promise<string | null> {
  try {
    const res = await apiClient.get<{ value: string }>(`/api/settings/${key}`)
    return res.data.value || null
  } catch (error) {
    return null
  }
}

/**
 * Obtém todos os tokens de LLM
 */
export async function getTokens(): Promise<AppSettings> {
  try {
    const [anthropic, openai, gemini, chatwootBaseUrl, chatwootAccountId, chatwootInboxId, chatwootApiToken, chatwootEnabled, chatwootMovementTypes] = await Promise.all([
      getToken('anthropicToken'),
      getToken('openaiToken'),
      getToken('geminiToken'),
      getToken('chatwootBaseUrl'),
      getToken('chatwootAccountId'),
      getToken('chatwootInboxId'),
      getToken('chatwootApiToken'),
      getToken('chatwootEnabled'),
      getToken('chatwootMovementTypes'),
    ])

    return {
      anthropicToken: anthropic || undefined,
      openaiToken: openai || undefined,
      geminiToken: gemini || undefined,
      chatwootBaseUrl: chatwootBaseUrl || undefined,
      chatwootAccountId: chatwootAccountId || undefined,
      chatwootInboxId: chatwootInboxId || undefined,
      chatwootApiToken: chatwootApiToken || undefined,
      chatwootEnabled: chatwootEnabled || undefined,
      chatwootMovementTypes: chatwootMovementTypes || undefined,
    }
  } catch (error) {
    if (import.meta.env.DEV) console.error('Erro ao obter tokens:', error)
    return {}
  }
}

/**
 * Deleta um token
 */
export async function deleteToken(
  key:
    | 'anthropicToken'
    | 'openaiToken'
    | 'geminiToken'
    | 'chatwootBaseUrl'
    | 'chatwootAccountId'
    | 'chatwootInboxId'
    | 'chatwootApiToken'
    | 'chatwootEnabled'
    | 'chatwootMovementTypes'
): Promise<void> {
  try {
    await apiClient.delete(`/api/settings/${key}`)
  } catch (error) {
    if (import.meta.env.DEV) console.error('Erro ao deletar token:', error)
  }
}
