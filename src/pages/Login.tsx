// src/pages/Login.tsx
import React, { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

const Login: React.FC = () => {
  const { signIn, session, loading } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!loading && session) return <Navigate to="/" replace />

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    const { error } = await signIn(email, password)
    setSubmitting(false)
    if (error) {
      setError(error)
    } else {
      navigate('/', { replace: true })
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-3 justify-center mb-8">
          <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center">
            <span className="text-white text-base font-bold">J</span>
          </div>
          <div>
            <div className="text-lg font-semibold text-text-strong leading-tight">JusFlow</div>
            <div className="text-xs text-text-faint leading-tight">Sistema Jurídico</div>
          </div>
        </div>

        {/* Card */}
        <div className="bg-surface border border-border rounded-xl p-7">
          <h1 className="text-base font-semibold text-text-strong mb-5">Entrar na sua conta</h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-text-base mb-1.5">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="seu@email.com"
                className="input-base"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-text-base mb-1.5">Senha</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="input-base"
              />
            </div>

            {error && (
              <p className="text-xs text-danger bg-danger-bg border border-red-200 rounded-md px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2 bg-primary hover:bg-primary-dark disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors"
            >
              {submitting ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default Login
