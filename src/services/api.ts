/**
 * Cliente HTTP base para todas as requisicoes
 */

import axios, { AxiosError, AxiosInstance } from 'axios'
import { env } from '../env'
import { supabase } from './supabase'

const API_BASE_URL = env.VITE_API_BASE_URL
const USE_MOCK = env.VITE_USE_MOCK === 'true'

const client: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    ...(env.VITE_API_SECRET ? { 'X-Api-Key': env.VITE_API_SECRET } : {}),
  },
})

client.interceptors.request.use(async config => {
  try {
    const session = await supabase?.auth.getSession()
    const accessToken = session?.data?.session?.access_token

    if (accessToken) {
      config.headers = config.headers || {}
      config.headers.Authorization = `Bearer ${accessToken}`
    }
  } catch (error) {
    console.warn('Nao foi possivel anexar a sessao atual na requisicao da API:', error)
  }

  return config
})

client.interceptors.response.use(
  response => response,
  (error: AxiosError) => {
    console.error('API Error:', error.message)
    throw error
  }
)

export const apiClient = client
export const useMockData = USE_MOCK

