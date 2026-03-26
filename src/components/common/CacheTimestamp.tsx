/**
 * Componente que exibe quando os dados foram atualizados no cache
 * Com botão de refresh para forçar busca nova no MCP
 */

import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'

interface CacheTimestampProps {
  timestamp?: string | null
  isLoading?: boolean
  onRefresh?: () => void
  ttlMinutes?: number
}

export function CacheTimestamp({
  timestamp,
  isLoading = false,
  onRefresh,
  ttlMinutes = 24 * 60, // default 24h em minutos
}: CacheTimestampProps) {
  const [minutesAgo, setMinutesAgo] = useState<number | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!timestamp) {
      setMinutesAgo(null)
      return
    }

    const updateTime = () => {
      const diff = Date.now() - new Date(timestamp).getTime()
      const minutes = Math.floor(diff / 1000 / 60)
      setMinutesAgo(minutes)
    }

    updateTime()
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(updateTime, 60_000) // atualiza a cada minuto

    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [timestamp])

  if (!timestamp || minutesAgo === null) {
    return null
  }

  const formatTime = () => {
    if (minutesAgo < 1) return 'agora'
    if (minutesAgo < 60) return `${minutesAgo}m atrás`
    const hours = Math.floor(minutesAgo / 60)
    if (hours < 24) return `${hours}h atrás`
    const days = Math.floor(hours / 24)
    return `${days}d atrás`
  }

  const isStale = ttlMinutes && minutesAgo > ttlMinutes

  return (
    <div
      className={`flex items-center justify-between gap-3 px-3 py-2 rounded-sm border text-sm ${
        isStale
          ? 'bg-yellow-50 border-yellow-200 text-yellow-700'
          : 'bg-green-50 border-green-200 text-green-700'
      }`}
    >
      <span>
        📅 Dados atualizados em <strong>{formatTime()}</strong>
      </span>
      {onRefresh && (
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="p-1 rounded hover:bg-white/50 disabled:opacity-50 disabled:cursor-not-allowed transition"
          title="Buscar dados atualizados do MCP"
        >
          <RefreshCw
            size={16}
            className={isLoading ? 'animate-spin' : ''}
          />
        </button>
      )}
    </div>
  )
}
