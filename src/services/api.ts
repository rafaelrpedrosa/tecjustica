/**
 * Cliente HTTP base para todas as requisições
 */

import axios, { AxiosInstance, AxiosError } from 'axios'
import { env } from '../env'

const API_BASE_URL = env.VITE_API_BASE_URL
const USE_MOCK = env.VITE_USE_MOCK === 'true'

const client: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    ...(env.VITE_API_SECRET ? { 'X-Api-Key': env.VITE_API_SECRET } : {}),
  },
})

// Interceptor para tratamento de erros
client.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    console.error('API Error:', error.message)
    throw error
  }
)

export const apiClient = client
export const useMockData = USE_MOCK
