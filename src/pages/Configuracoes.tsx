import { useEffect, useState } from 'react'
import { Check, X } from 'lucide-react'
import { enviarMensagemTesteChatwoot } from '@/services/chatwoot.service'
import { deleteToken, getTokens, saveTokens } from '@/services/settings.service'

type ConfigState = {
  anthropicToken: string
  openaiToken: string
  geminiToken: string
  chatwootBaseUrl: string
  chatwootAccountId: string
  chatwootInboxId: string
  chatwootApiToken: string
  chatwootEnabled: string
  chatwootMovementTypes: string
}

type TestState = {
  nome: string
  whatsapp: string
  mensagem: string
}

const MOVEMENT_OPTIONS = [
  { key: 'sentenca', label: 'Sentenca e acordao' },
  { key: 'decisao', label: 'Decisao e despacho' },
  { key: 'audiencia', label: 'Audiencia e pericia' },
  { key: 'intimacao', label: 'Intimacao e expedicao' },
  { key: 'pagamento', label: 'Pagamento, RPV e precatorio' },
  { key: 'encerramento', label: 'Arquivamento e baixa' },
] as const

const DEFAULT_MOVEMENT_TYPES = MOVEMENT_OPTIONS.map(item => item.key).join(',')

const EMPTY_STATE: ConfigState = {
  anthropicToken: '',
  openaiToken: '',
  geminiToken: '',
  chatwootBaseUrl: '',
  chatwootAccountId: '',
  chatwootInboxId: '',
  chatwootApiToken: '',
  chatwootEnabled: 'true',
  chatwootMovementTypes: DEFAULT_MOVEMENT_TYPES,
}

const EMPTY_TEST: TestState = {
  nome: '',
  whatsapp: '',
  mensagem: 'Esta e uma mensagem de teste do JusFlow via Chatwoot.',
}

function normalizeWhatsappPreview(value: string) {
  const raw = value.trim()
  if (!raw) return ''

  const hasPlusPrefix = raw.startsWith('+')
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  if (hasPlusPrefix) return `+${digits}`
  if (digits.startsWith('00')) return `+${digits.slice(2)}`
  if (digits.startsWith('55') && digits.length >= 12) return `+${digits}`
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`
  return `+${digits}`
}

function parseMovementTypes(value: string) {
  return new Set(value.split(',').map(item => item.trim()).filter(Boolean))
}

export default function Configuracoes() {
  const [settings, setSettings] = useState<ConfigState>(EMPTY_STATE)
  const [testData, setTestData] = useState<TestState>(EMPTY_TEST)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [sendingTest, setSendingTest] = useState(false)
  const [testMessage, setTestMessage] = useState<string | null>(null)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      setLoading(true)
      setError(null)
      const loaded = await getTokens()
      setSettings({
        anthropicToken: loaded.anthropicToken || '',
        openaiToken: loaded.openaiToken || '',
        geminiToken: loaded.geminiToken || '',
        chatwootBaseUrl: loaded.chatwootBaseUrl || '',
        chatwootAccountId: loaded.chatwootAccountId || '',
        chatwootInboxId: loaded.chatwootInboxId || '',
        chatwootApiToken: loaded.chatwootApiToken || '',
        chatwootEnabled: loaded.chatwootEnabled || 'true',
        chatwootMovementTypes: loaded.chatwootMovementTypes || DEFAULT_MOVEMENT_TYPES,
      })
    } catch {
      setError('Erro ao carregar configuracoes')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (key: keyof ConfigState, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  const toggleMovementType = (key: string) => {
    setSettings(prev => {
      const selected = parseMovementTypes(prev.chatwootMovementTypes)
      if (selected.has(key)) selected.delete(key)
      else selected.add(key)
      return {
        ...prev,
        chatwootMovementTypes: Array.from(selected).join(','),
      }
    })
    setSaved(false)
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      setError(null)
      await saveTokens(settings)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setError('Erro ao salvar configuracoes')
    } finally {
      setSaving(false)
    }
  }

  const handleClear = async (key: keyof ConfigState) => {
    const fallbackMap: Partial<Record<keyof ConfigState, string>> = {
      chatwootEnabled: 'true',
      chatwootMovementTypes: DEFAULT_MOVEMENT_TYPES,
    }
    try {
      setSettings(prev => ({ ...prev, [key]: fallbackMap[key] ?? '' }))
      await deleteToken(key)
    } catch {
      setError('Erro ao limpar configuracao')
    }
  }

  const handleSendTest = async () => {
    try {
      setSendingTest(true)
      setTestMessage(null)
      setError(null)
      await enviarMensagemTesteChatwoot(testData)
      setTestMessage('Mensagem de teste enviada com sucesso.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar mensagem teste pelo Chatwoot')
    } finally {
      setSendingTest(false)
    }
  }

  const selectedMovementTypes = parseMovementTypes(settings.chatwootMovementTypes)

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando configuracoes...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white shadow-lg rounded-lg overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-blue-800 px-6 py-8">
            <h1 className="text-3xl font-bold text-white">Configuracoes</h1>
            <p className="text-blue-100 mt-2">Tokens de IA e integracao com Chatwoot</p>
          </div>

          <div className="p-6 sm:p-8 space-y-8">
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                {error}
              </div>
            )}

            {saved && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 flex items-center gap-2">
                <Check size={20} />
                Configuracoes salvas com sucesso!
              </div>
            )}

            {testMessage && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
                {testMessage}
              </div>
            )}

            <section className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">IA</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Usada para explicar a movimentacao do processo em linguagem simples antes do envio ao cliente.
                </p>
              </div>

              {[
                ['anthropicToken', 'Token Anthropic Claude', 'sk-ant-...'],
                ['openaiToken', 'Token OpenAI', 'sk-...'],
                ['geminiToken', 'Token Google Gemini', 'AIza...'],
              ].map(([key, label, placeholder]) => (
                <div key={key} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <label className="block text-sm font-medium text-gray-900 mb-2">{label}</label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={settings[key as keyof ConfigState]}
                      onChange={e => handleChange(key as keyof ConfigState, e.target.value)}
                      placeholder={placeholder}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {settings[key as keyof ConfigState] && (
                      <button
                        onClick={() => handleClear(key as keyof ConfigState)}
                        className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg"
                        title="Limpar"
                      >
                        <X size={20} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </section>

            <section className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Chatwoot</h2>
                <p className="text-sm text-gray-600 mt-1">
                  O sistema cria ou reaproveita o contato, abre conversa no inbox de API e envia atualizacoes importantes do processo.
                </p>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <label className="block text-sm font-medium text-gray-900 mb-2">Envio automatico</label>
                <select
                  value={settings.chatwootEnabled}
                  onChange={e => handleChange('chatwootEnabled', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="true">Ativado</option>
                  <option value="false">Desativado</option>
                </select>
              </div>

              {[
                ['chatwootBaseUrl', 'URL base do Chatwoot', 'https://app.seu-chatwoot.com'],
                ['chatwootAccountId', 'Account ID', '1'],
                ['chatwootInboxId', 'Inbox ID (API channel)', '12'],
                ['chatwootApiToken', 'API access token', 'seu-token-do-chatwoot'],
              ].map(([key, label, placeholder]) => (
                <div key={key} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <label className="block text-sm font-medium text-gray-900 mb-2">{label}</label>
                  <div className="flex gap-2">
                    <input
                      type={key === 'chatwootApiToken' ? 'password' : 'text'}
                      value={settings[key as keyof ConfigState]}
                      onChange={e => handleChange(key as keyof ConfigState, e.target.value)}
                      placeholder={placeholder}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {settings[key as keyof ConfigState] && (
                      <button
                        onClick={() => handleClear(key as keyof ConfigState)}
                        className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg"
                        title="Limpar"
                      >
                        <X size={20} />
                      </button>
                    )}
                  </div>
                </div>
              ))}

              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <label className="block text-sm font-medium text-gray-900 mb-3">
                  Tipos de movimentacao que devem gerar mensagem ao cliente
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {MOVEMENT_OPTIONS.map(option => (
                    <label key={option.key} className="flex items-center gap-3 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={selectedMovementTypes.has(option.key)}
                        onChange={() => toggleMovementType(option.key)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                Use um inbox do tipo API no Chatwoot. O contato precisa ter WhatsApp preenchido no cadastro do cliente para receber a mensagem.
              </div>
            </section>

            <section className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Teste de envio</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Envia uma mensagem manual pelo Chatwoot para validar a integracao antes de liberar o disparo automatico.
                </p>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-3">
                <input
                  type="text"
                  value={testData.nome}
                  onChange={e => setTestData(prev => ({ ...prev, nome: e.target.value }))}
                  placeholder="Nome do contato"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="text"
                  value={testData.whatsapp}
                  onChange={e => setTestData(prev => ({ ...prev, whatsapp: e.target.value }))}
                  placeholder="WhatsApp com DDI, ex: 5581999999999"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {testData.whatsapp.trim() && (
                  <p className="text-xs text-gray-500">
                    Formato enviado ao Chatwoot: {normalizeWhatsappPreview(testData.whatsapp)}
                  </p>
                )}
                <textarea
                  value={testData.mensagem}
                  onChange={e => setTestData(prev => ({ ...prev, mensagem: e.target.value }))}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
                <button
                  onClick={handleSendTest}
                  disabled={sendingTest || !testData.nome.trim() || !testData.whatsapp.trim() || !testData.mensagem.trim()}
                  className="w-full px-6 py-3 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 disabled:bg-gray-400 transition-colors"
                >
                  {sendingTest ? 'Enviando teste...' : 'Enviar mensagem teste'}
                </button>
              </div>
            </section>

            <div className="flex gap-4">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
              >
                {saving ? 'Salvando...' : 'Salvar configuracoes'}
              </button>
              <button
                onClick={loadSettings}
                className="px-6 py-3 text-gray-700 font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Recarregar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
