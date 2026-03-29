import { apiClient } from './api'

export const SETTINGS_KEYS = [
  'anthropicToken',
  'openaiToken',
  'geminiToken',
  'chatwootBaseUrl',
  'chatwootAccountId',
  'chatwootInboxId',
  'chatwootApiToken',
  'chatwootEnabled',
  'chatwootMovementTypes',
  'asaasEnvironment',
  'asaasApiKey',
  'asaasWebhookToken',
] as const

export const SECRET_SETTINGS_KEYS = [
  'anthropicToken',
  'openaiToken',
  'geminiToken',
  'chatwootApiToken',
  'asaasApiKey',
  'asaasWebhookToken',
] as const

export type SettingsKey = (typeof SETTINGS_KEYS)[number]
export type SecretSettingsKey = (typeof SECRET_SETTINGS_KEYS)[number]

export interface SecretSettingMeta {
  configured: boolean
  maskedValue?: string
  isSecret: true
}

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
  asaasEnvironment?: string
  asaasApiKey?: string
  asaasWebhookToken?: string
  secretMeta?: Partial<Record<SecretSettingsKey, SecretSettingMeta>>
}

interface SettingsPayload {
  values?: Partial<Record<SettingsKey, string>>
  meta?: Partial<Record<SettingsKey, { configured: boolean; maskedValue?: string; isSecret?: boolean }>>
}

const SECRET_KEYS = new Set<SettingsKey>(SECRET_SETTINGS_KEYS)

export async function saveTokens(settings: AppSettings): Promise<void> {
  for (const key of SETTINGS_KEYS) {
    const value = settings[key]
    const trimmed = typeof value === 'string' ? value.trim() : ''

    if (SECRET_KEYS.has(key)) {
      if (trimmed) {
        await apiClient.post('/api/settings', { key, value: trimmed })
      }
      continue
    }

    if (trimmed) {
      await apiClient.post('/api/settings', { key, value: trimmed })
    } else {
      await apiClient.delete(`/api/settings/${key}`)
    }
  }
}

export async function getTokens(): Promise<AppSettings> {
  try {
    const res = await apiClient.get<SettingsPayload>('/api/settings')
    const values = res.data.values || {}
    const meta = res.data.meta || {}

    const secretMeta = Object.fromEntries(
      SECRET_SETTINGS_KEYS.map(key => {
        const item = meta[key]
        return [key, { configured: Boolean(item?.configured), maskedValue: item?.maskedValue, isSecret: true as const }]
      })
    ) as Partial<Record<SecretSettingsKey, SecretSettingMeta>>

    return {
      anthropicToken: values.anthropicToken,
      openaiToken: values.openaiToken,
      geminiToken: values.geminiToken,
      chatwootBaseUrl: values.chatwootBaseUrl,
      chatwootAccountId: values.chatwootAccountId,
      chatwootInboxId: values.chatwootInboxId,
      chatwootApiToken: values.chatwootApiToken,
      chatwootEnabled: values.chatwootEnabled,
      chatwootMovementTypes: values.chatwootMovementTypes,
      asaasEnvironment: values.asaasEnvironment,
      asaasApiKey: values.asaasApiKey,
      asaasWebhookToken: values.asaasWebhookToken,
      secretMeta,
    }
  } catch (error) {
    if (import.meta.env.DEV) console.error('Erro ao obter configuracoes:', error)
    return { secretMeta: {} }
  }
}

export async function deleteToken(key: SettingsKey): Promise<void> {
  try {
    await apiClient.delete(`/api/settings/${key}`)
  } catch (error) {
    if (import.meta.env.DEV) console.error('Erro ao deletar configuracao:', error)
  }
}
